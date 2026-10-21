import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { AUTH_CONTEXT, fromBase64Url, parseServerMsg, toBase64Url, type ServerMsg } from "@radius/protocol";
import { startSignalServer, type SignalServer } from "./server.ts";

let server: SignalServer;
const sockets: WebSocket[] = [];

beforeEach(async () => {
  server = await startSignalServer({ port: 0, trustProxy: true, maxRoomSize: 3, authTimeoutMs: 300 });
});
afterEach(async () => {
  for (const ws of sockets.splice(0)) ws.terminate();
  await server.close();
});

class Client {
  readonly inbox: ServerMsg[] = [];
  readonly ws: WebSocket;
  closed: Promise<number>;
  id = "";
  private waiters: (() => void)[] = [];

  constructor(ws: WebSocket) {
    this.ws = ws;
    sockets.push(ws);
    ws.on("message", (d) => {
      const m = parseServerMsg(JSON.parse(d.toString()));
      if (m) this.inbox.push(m);
      this.waiters.splice(0).forEach((w) => w());
    });
    this.closed = new Promise((r) => ws.once("close", (code) => r(code)));
  }

  send(msg: unknown): void {
    this.ws.send(JSON.stringify(msg));
  }

  async next<T extends ServerMsg["t"]>(t: T): Promise<Extract<ServerMsg, { t: T }>> {
    const deadline = Date.now() + 2000;
    for (;;) {
      const i = this.inbox.findIndex((m) => m.t === t);
      if (i >= 0) return this.inbox.splice(i, 1)[0] as Extract<ServerMsg, { t: T }>;
      if (Date.now() > deadline) throw new Error(`timeout waiting for ${t}`);
      await new Promise<void>((r) => {
        this.waiters.push(r);
        setTimeout(r, 50);
      });
    }
  }
}

function open(headers: Record<string, string> = {}): Promise<Client> {
  const ws = new WebSocket(`ws://127.0.0.1:${server.port}`, { headers });
  return new Promise((resolve, reject) => {
    ws.once("open", () => resolve(new Client(ws)));
    ws.once("error", reject);
  });
}

async function newIdentity() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  return { pair, pub: toBase64Url(spki) };
}

async function signNonce(key: CryptoKey, nonce: string): Promise<string> {
  const bytes = fromBase64Url(nonce) as Uint8Array;
  const msg = new Uint8Array([...new TextEncoder().encode(AUTH_CONTEXT), ...bytes]);
  return toBase64Url(new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, msg)));
}

async function login(name: string, ip = "198.51.100.1", identity?: Awaited<ReturnType<typeof newIdentity>>) {
  const c = await open({ "x-forwarded-for": ip });
  const id = identity ?? (await newIdentity());
  c.send({ t: "hello", pub: id.pub, name });
  const { nonce } = await c.next("challenge");
  c.send({ t: "auth", sig: await signNonce(id.pair.privateKey, nonce) });
  const ready = await c.next("ready");
  c.id = ready.id;
  return { c, ready, id };
}

describe("signal server", () => {
  it("lets two devices on the same address discover each other", async () => {
    const a = await login("A");
    expect(a.ready.peers).toEqual([]);
    const b = await login("B");
    expect(b.ready.peers).toEqual([{ id: a.c.id, name: "A" }]);
    expect((await a.c.next("peer")).peer).toEqual({ id: b.c.id, name: "B" });

    b.c.ws.close();
    expect((await a.c.next("left")).id).toBe(b.c.id);
  });

  it("isolates devices on different addresses", async () => {
    const a = await login("A", "198.51.100.1");
    const b = await login("B", "198.51.100.2");
    expect(b.ready.peers).toEqual([]);
    b.c.send({ t: "signal", to: a.c.id, data: { x: 1 } });
    expect((await b.c.next("error")).code).toBe("unknown_peer");
  });

  it("relays signals with the sender id stamped by the server", async () => {
    const a = await login("A");
    const b = await login("B");
    a.c.send({ t: "signal", to: b.c.id, data: { sdp: "offer" } });
    expect(await b.c.next("signal")).toEqual({ t: "signal", from: a.c.id, data: { sdp: "offer" } });
  });

  it("rejects oversized signal payloads without dropping the connection", async () => {
    const a = await login("A");
    const b = await login("B");
    a.c.send({ t: "signal", to: b.c.id, data: "x".repeat(20_000) });
    expect((await a.c.next("error")).code).toBe("too_large");
    a.c.send({ t: "signal", to: b.c.id, data: "ok" });
    expect((await b.c.next("signal")).data).toBe("ok");
  });

  it("derives the same device id from the same key and replaces the old connection", async () => {
    const id = await newIdentity();
    const first = await login("A", "198.51.100.1", id);
    const observer = await login("O");
    const second = await login("A2", "198.51.100.1", id);
    expect(second.c.id).toBe(first.c.id);
    expect(await first.c.closed).toBe(4000);
    expect((await observer.c.next("peer")).peer).toEqual({ id: first.c.id, name: "A2" });
    // replacing must not announce a departure of the device that just reconnected
    expect(observer.c.inbox.some((m) => m.t === "left")).toBe(false);
  });

  it("rejects a signature made by a different key", async () => {
    const claimed = await newIdentity();
    const attacker = await newIdentity();
    const c = await open();
    c.send({ t: "hello", pub: claimed.pub, name: "X" });
    const { nonce } = await c.next("challenge");
    c.send({ t: "auth", sig: await signNonce(attacker.pair.privateKey, nonce) });
    expect((await c.next("error")).code).toBe("auth_failed");
    expect(await c.closed).toBe(1008);
  });

  it("rejects non-P-256 keys, malformed JSON and pre-auth messages", async () => {
    const p384 = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-384" }, true, ["sign"]);
    const p384Pub = toBase64Url(new Uint8Array(await crypto.subtle.exportKey("spki", p384.publicKey)));
    const c1 = await open();
    c1.send({ t: "hello", pub: p384Pub, name: "R" });
    expect((await c1.next("error")).code).toBe("auth_failed");

    const c2 = await open();
    c2.ws.send("{not json");
    expect((await c2.next("error")).code).toBe("bad_message");

    const c3 = await open();
    c3.send({ t: "signal", to: "a".repeat(64), data: 1 });
    expect((await c3.next("error")).code).toBe("bad_message");
  });

  it("closes connections that never authenticate", async () => {
    const c = await open();
    expect(await c.closed).toBe(4001);
  });

  it("enforces the room size limit", async () => {
    await login("1");
    await login("2");
    await login("3");
    const c = await open({ "x-forwarded-for": "198.51.100.1" });
    const id = await newIdentity();
    c.send({ t: "hello", pub: id.pub, name: "4" });
    const { nonce } = await c.next("challenge");
    c.send({ t: "auth", sig: await signNonce(id.pair.privateKey, nonce) });
    expect((await c.next("error")).code).toBe("room_full");
  });

  it("allows same-origin and non-browser clients, rejects cross-origin by default", async () => {
    const same = await open({ origin: `http://127.0.0.1:${server.port}` });
    same.ws.close();
    const none = await open();
    none.ws.close();
    await expect(open({ origin: "https://evil.example" })).rejects.toThrow();
    await expect(open({ origin: "not a url" })).rejects.toThrow();
  });

  it("limits concurrent connections per address", async () => {
    const limited = await startSignalServer({ port: 0, trustProxy: true, maxConnsPerIp: 2 });
    try {
      const mk = () => new WebSocket(`ws://127.0.0.1:${limited.port}`, { headers: { "x-forwarded-for": "198.51.100.9" } });
      const [a, b, c] = [mk(), mk(), mk()];
      sockets.push(a, b, c);
      const code = await new Promise<number>((r) => c.once("close", (code) => r(code)));
      expect(code).toBe(1008);
      b.close();
      await new Promise((r) => b.once("close", r));
      const d = mk();
      sockets.push(d);
      await new Promise((r, j) => (d.once("open", r), d.once("close", () => j(new Error("rejected")))));
    } finally {
      await limited.close();
    }
  });

  it("terminates unresponsive connections even before authentication", async () => {
    const hb = await startSignalServer({ port: 0, heartbeatMs: 50, authTimeoutMs: 10_000 });
    try {
      const ws = new WebSocket(`ws://127.0.0.1:${hb.port}`, { autoPong: false });
      sockets.push(ws);
      const closed = new Promise<void>((r) => ws.once("close", () => r()));
      await closed;
    } finally {
      await hb.close();
    }
  });

  it("propagates renames", async () => {
    const a = await login("A");
    const b = await login("B");
    await a.c.next("peer");
    b.c.send({ t: "rename", name: "푸른 고래" });
    expect((await a.c.next("peer")).peer).toEqual({ id: b.c.id, name: "푸른 고래" });
  });
});
