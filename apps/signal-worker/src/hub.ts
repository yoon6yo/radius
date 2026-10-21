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
import { roomKeyFor } from "@radius/signal/src/roomKey.ts";

/** Minimal socket surface so the hub is testable without a Workers runtime. */
export interface Sock {
  send(data: string): void;
  close(code: number, reason: string): void;
}

export interface HubOptions {
  maxRoomSize?: number;
  /** Concurrent connections per network (public IPv4, or IPv6 /64). */
  maxConnsPerIp?: number;
  /** Hard cap across all rooms: the single Durable Object has 128 MB. */
  maxTotalConns?: number;
  authTimeoutMs?: number;
}

export interface ConnHandle {
  message(data: unknown): void;
  close(): void;
}

interface Conn {
  sock: Sock;
  roomKey: string;
  closed: boolean;
  window: { start: number; count: number };
  pending?: { key: CryptoKey; spki: Uint8Array; nonce: Uint8Array; name: string } | undefined;
  peer?: PeerInfo;
  /** Auth steps are async; chaining keeps messages from one socket strictly ordered. */
  queue: Promise<void>;
}

const MAX_MSGS_PER_SEC = 100;
const SPKI_P256_MAX = 128;
const CLOSE_REPLACED = 4000;
const CLOSE_AUTH_TIMEOUT = 4001;
const CLOSE_POLICY = 1008;
const encoder = new TextEncoder();

async function parsePublicKey(b64: string): Promise<{ key: CryptoKey; spki: Uint8Array } | null> {
  const spki = fromBase64Url(b64);
  if (!spki || spki.length > SPKI_P256_MAX) return null;
  try {
    const key = await crypto.subtle.importKey("spki", spki as BufferSource, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    return { key, spki };
  } catch {
    return null;
  }
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** All rooms live in one instance: a single Durable Object bills 128 MB for its lifetime regardless of room count. */
export class SignalHub {
  private readonly rooms = new Map<string, Map<string, Conn>>();
  private readonly connsPerNet = new Map<string, number>();
  private total = 0;
  private readonly maxRoomSize: number;
  private readonly maxConnsPerIp: number;
  private readonly maxTotalConns: number;
  private readonly authTimeoutMs: number;

  constructor(opts: HubOptions = {}) {
    this.maxRoomSize = opts.maxRoomSize ?? 50;
    this.maxConnsPerIp = opts.maxConnsPerIp ?? 50;
    this.maxTotalConns = opts.maxTotalConns ?? 5_000;
    this.authTimeoutMs = opts.authTimeoutMs ?? 5_000;
  }

  open(sock: Sock, ip: string): ConnHandle {
    // Keyed like rooms (IPv6 collapses to /64) so rotating addresses inside one prefix cannot dodge the cap.
    const net = roomKeyFor(ip);
    const open = this.connsPerNet.get(net) ?? 0;
    if (open >= this.maxConnsPerIp || this.total >= this.maxTotalConns) {
      sock.close(CLOSE_POLICY, "too many connections");
      return { message() {}, close() {} };
    }
    this.connsPerNet.set(net, open + 1);
    this.total++;

    const conn: Conn = {
      sock,
      roomKey: net,
      closed: false,
      window: { start: Date.now(), count: 0 },
      queue: Promise.resolve(),
    };
    const authTimer = setTimeout(() => {
      if (!conn.peer) sock.close(CLOSE_AUTH_TIMEOUT, "auth timeout");
    }, this.authTimeoutMs);

    return {
      message: (data) => {
        conn.queue = conn.queue.then(() => this.onMessage(conn, data)).catch(() => this.fail(conn, "bad_message"));
      },
      close: () => {
        if (conn.closed) return;
        conn.closed = true;
        clearTimeout(authTimer);
        this.total--;
        const left = (this.connsPerNet.get(net) ?? 1) - 1;
        if (left <= 0) this.connsPerNet.delete(net);
        else this.connsPerNet.set(net, left);
        const id = conn.peer?.id;
        if (!id) return;
        const room = this.rooms.get(conn.roomKey);
        if (room?.get(id) !== conn) return; // replaced by a newer connection
        room.delete(id);
        if (room.size === 0) this.rooms.delete(conn.roomKey);
        this.broadcast(conn, { t: "left", id });
      },
    };
  }

  private send(conn: Conn, msg: ServerMsg): void {
    if (conn.closed) return;
    try {
      conn.sock.send(JSON.stringify(msg));
    } catch {
      /* socket already gone; its close event cleans up */
    }
  }

  private fail(conn: Conn, code: ErrorCode): void {
    this.send(conn, { t: "error", code });
    conn.sock.close(CLOSE_POLICY, code);
  }

  private broadcast(conn: Conn, msg: ServerMsg): void {
    const room = this.rooms.get(conn.roomKey);
    if (!room) return;
    for (const other of room.values()) if (other !== conn) this.send(other, msg);
  }

  private async onAuth(conn: Conn, sigB64: string): Promise<void> {
    const pending = conn.pending;
    const sig = fromBase64Url(sigB64);
    if (!pending || !sig || sig.length !== 64) return this.fail(conn, "auth_failed");
    const context = encoder.encode(AUTH_CONTEXT);
    const message = new Uint8Array(context.length + pending.nonce.length);
    message.set(context);
    message.set(pending.nonce, context.length);
    // WebCrypto ECDSA signatures are raw r||s (IEEE P1363), matching the 64-byte wire format.
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pending.key, sig as BufferSource, message as BufferSource);
    const id = hex(await crypto.subtle.digest("SHA-256", pending.spki as BufferSource));
    // The socket may have closed while awaiting; registering it now would leave a ghost peer no close event will clear.
    if (conn.closed) return;
    if (!ok) return this.fail(conn, "auth_failed");

    let room = this.rooms.get(conn.roomKey);
    if (!room) this.rooms.set(conn.roomKey, (room = new Map()));
    const previous = room.get(id);
    if (!previous && room.size >= this.maxRoomSize) return this.fail(conn, "room_full");
    previous?.sock.close(CLOSE_REPLACED, "replaced");

    conn.peer = { id, name: pending.name };
    conn.pending = undefined;
    room.set(id, conn);
    const peers = [...room.values()].filter((c) => c !== conn && c.peer).map((c) => c.peer as PeerInfo);
    this.send(conn, { t: "ready", id, peers });
    this.broadcast(conn, { t: "peer", peer: conn.peer });
  }

  private async onMessage(conn: Conn, data: unknown): Promise<void> {
    if (conn.closed) return;
    const now = Date.now();
    if (now - conn.window.start >= 1000) conn.window = { start: now, count: 0 };
    if (++conn.window.count > MAX_MSGS_PER_SEC) return conn.sock.close(CLOSE_POLICY, "rate limit");
    if (typeof data !== "string") return this.fail(conn, "bad_message");

    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      return this.fail(conn, "bad_message");
    }
    const msg = parseClientMsg(json);
    if (!msg) return this.fail(conn, "bad_message");

    if (!conn.peer) {
      if (msg.t === "hello" && !conn.pending) {
        const parsed = await parsePublicKey(msg.pub);
        if (!parsed) return this.fail(conn, "auth_failed");
        const nonce = crypto.getRandomValues(new Uint8Array(32));
        conn.pending = { ...parsed, nonce, name: msg.name };
        return this.send(conn, { t: "challenge", nonce: toBase64Url(nonce) });
      }
      if (msg.t === "auth") return this.onAuth(conn, msg.sig);
      return this.fail(conn, "bad_message");
    }

    switch (msg.t) {
      case "rename":
        conn.peer.name = msg.name;
        return this.broadcast(conn, { t: "peer", peer: conn.peer });
      case "signal": {
        if (JSON.stringify(msg.data).length > MAX_SIGNAL_BYTES) {
          return this.send(conn, { t: "error", code: "too_large" });
        }
        const target = this.rooms.get(conn.roomKey)?.get(msg.to);
        if (!target) return this.send(conn, { t: "error", code: "unknown_peer" });
        return this.send(target, { t: "signal", from: conn.peer.id, data: msg.data });
      }
      default:
        return this.fail(conn, "bad_message");
    }
  }
}
