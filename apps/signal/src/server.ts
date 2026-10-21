import { createHash, createPublicKey, randomBytes, verify, type KeyObject } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import {
  AUTH_CONTEXT,
  MAX_SIGNAL_BYTES,
  fromBase64Url,
  parseClientMsg,
  toBase64Url,
  type ErrorCode,
  type PeerInfo,
  type ServerMsg,
} from "@radius/protocol";
import { roomKeyFor } from "./roomKey.ts";

export interface SignalServerOptions {
  port: number;
  /** Trust the last X-Forwarded-For hop as the client address. Only enable behind your own proxy. */
  trustProxy?: boolean;
  /** When set, browser connections must come from one of these origins. */
  allowedOrigins?: readonly string[];
  maxRoomSize?: number;
  authTimeoutMs?: number;
  heartbeatMs?: number;
}

export interface SignalServer {
  port: number;
  close(): Promise<void>;
}

interface Conn {
  ws: WebSocket;
  roomKey: string;
  alive: boolean;
  window: { start: number; count: number };
  pending?: { key: KeyObject; spki: Buffer; nonce: Buffer; name: string } | undefined;
  peer?: PeerInfo;
}

const MAX_PAYLOAD = 64 * 1024;
const MAX_MSGS_PER_SEC = 100;
const SPKI_P256_MAX = 128;
const CLOSE_REPLACED = 4000;
const CLOSE_AUTH_TIMEOUT = 4001;
const CLOSE_POLICY = 1008;

function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const xff = req.headers["x-forwarded-for"];
    const last = (Array.isArray(xff) ? xff.join(",") : (xff ?? "")).split(",").at(-1)?.trim();
    if (last) return last;
  }
  return req.socket.remoteAddress ?? "unknown";
}

function parsePublicKey(b64: string): { key: KeyObject; spki: Buffer } | null {
  const bytes = fromBase64Url(b64);
  if (!bytes || bytes.length > SPKI_P256_MAX) return null;
  try {
    const spki = Buffer.from(bytes);
    const key = createPublicKey({ key: spki, format: "der", type: "spki" });
    if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") return null;
    return { key, spki };
  } catch {
    return null;
  }
}

export function startSignalServer(opts: SignalServerOptions): Promise<SignalServer> {
  const maxRoomSize = opts.maxRoomSize ?? 50;
  const authTimeoutMs = opts.authTimeoutMs ?? 5_000;
  const heartbeatMs = opts.heartbeatMs ?? 30_000;
  const rooms = new Map<string, Map<string, Conn>>();

  const wss = new WebSocketServer({
    port: opts.port,
    maxPayload: MAX_PAYLOAD,
    verifyClient: ({ origin }: { origin: string }) => !opts.allowedOrigins || opts.allowedOrigins.includes(origin),
  });

  const send = (conn: Conn, msg: ServerMsg): void => {
    if (conn.ws.readyState === conn.ws.OPEN) conn.ws.send(JSON.stringify(msg));
  };
  const fail = (conn: Conn, code: ErrorCode): void => {
    send(conn, { t: "error", code });
    conn.ws.close(CLOSE_POLICY, code);
  };
  const broadcast = (conn: Conn, msg: ServerMsg): void => {
    const room = rooms.get(conn.roomKey);
    if (!room) return;
    for (const other of room.values()) if (other !== conn) send(other, msg);
  };

  const onAuth = (conn: Conn, sigB64: string): void => {
    const pending = conn.pending;
    const sig = fromBase64Url(sigB64);
    if (!pending || !sig || sig.length !== 64) return fail(conn, "auth_failed");
    const message = Buffer.concat([Buffer.from(AUTH_CONTEXT), pending.nonce]);
    const ok = verify("sha256", message, { key: pending.key, dsaEncoding: "ieee-p1363" }, sig);
    if (!ok) return fail(conn, "auth_failed");

    const id = createHash("sha256").update(pending.spki).digest("hex");
    let room = rooms.get(conn.roomKey);
    if (!room) rooms.set(conn.roomKey, (room = new Map()));
    const previous = room.get(id);
    if (!previous && room.size >= maxRoomSize) return fail(conn, "room_full");
    previous?.ws.close(CLOSE_REPLACED, "replaced");

    conn.peer = { id, name: pending.name };
    conn.pending = undefined;
    room.set(id, conn);
    const peers = [...room.values()].filter((c) => c !== conn && c.peer).map((c) => c.peer as PeerInfo);
    send(conn, { t: "ready", id, peers });
    broadcast(conn, { t: "peer", peer: conn.peer });
  };

  wss.on("connection", (ws, req) => {
    const conn: Conn = {
      ws,
      roomKey: roomKeyFor(clientIp(req, opts.trustProxy ?? false)),
      alive: true,
      window: { start: Date.now(), count: 0 },
    };
    const authTimer = setTimeout(() => {
      if (!conn.peer) ws.close(CLOSE_AUTH_TIMEOUT, "auth timeout");
    }, authTimeoutMs);

    ws.on("pong", () => {
      conn.alive = true;
    });

    ws.on("message", (data: RawData, isBinary: boolean) => {
      const now = Date.now();
      if (now - conn.window.start >= 1000) conn.window = { start: now, count: 0 };
      if (++conn.window.count > MAX_MSGS_PER_SEC) return ws.close(CLOSE_POLICY, "rate limit");
      if (isBinary) return fail(conn, "bad_message");

      let json: unknown;
      try {
        json = JSON.parse(data.toString());
      } catch {
        return fail(conn, "bad_message");
      }
      const msg = parseClientMsg(json);
      if (!msg) return fail(conn, "bad_message");

      if (!conn.peer) {
        if (msg.t === "hello" && !conn.pending) {
          const parsed = parsePublicKey(msg.pub);
          if (!parsed) return fail(conn, "auth_failed");
          const nonce = randomBytes(32);
          conn.pending = { ...parsed, nonce, name: msg.name };
          return send(conn, { t: "challenge", nonce: toBase64Url(nonce) });
        }
        if (msg.t === "auth") return onAuth(conn, msg.sig);
        return fail(conn, "bad_message");
      }

      switch (msg.t) {
        case "rename":
          conn.peer.name = msg.name;
          return broadcast(conn, { t: "peer", peer: conn.peer });
        case "signal": {
          if (JSON.stringify(msg.data).length > MAX_SIGNAL_BYTES) {
            return send(conn, { t: "error", code: "too_large" });
          }
          const target = rooms.get(conn.roomKey)?.get(msg.to);
          if (!target) return send(conn, { t: "error", code: "unknown_peer" });
          return send(target, { t: "signal", from: conn.peer.id, data: msg.data });
        }
        default:
          return fail(conn, "bad_message");
      }
    });

    ws.on("close", () => {
      clearTimeout(authTimer);
      const id = conn.peer?.id;
      if (!id) return;
      const room = rooms.get(conn.roomKey);
      if (room?.get(id) !== conn) return; // replaced by a newer connection
      room.delete(id);
      if (room.size === 0) rooms.delete(conn.roomKey);
      broadcast(conn, { t: "left", id });
    });

    ws.on("error", () => ws.terminate());
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      const conn = [...rooms.values()].flatMap((r) => [...r.values()]).find((c) => c.ws === ws);
      if (conn && !conn.alive) {
        ws.terminate();
        continue;
      }
      if (conn) conn.alive = false;
      ws.ping();
    }
  }, heartbeatMs);
  heartbeat.unref();

  return new Promise((resolve, reject) => {
    wss.once("error", reject);
    wss.once("listening", () => {
      const addr = wss.address();
      if (!addr || typeof addr === "string") return reject(new Error("unexpected pipe address"));
      resolve({
        port: addr.port,
        close: () =>
          new Promise<void>((done) => {
            clearInterval(heartbeat);
            for (const ws of wss.clients) ws.terminate();
            wss.close(() => done());
          }),
      });
    });
  });
}
