import { describe, expect, it } from "vitest";
import { AUTH_CONTEXT, parseServerMsg, toBase64Url, type ServerMsg } from "@radius/protocol";
import { SignalHub, type ConnHandle } from "./hub.ts";

class FakeSock {
  readonly inbox: ServerMsg[] = [];
  closed: { code: number; reason: string } | null = null;
  id = "";
  handle!: ConnHandle;
  keys!: CryptoKeyPair;

  send(data: string): void {
    const m = parseServerMsg(JSON.parse(data));
    if (m) this.inbox.push(m);
  }
  close(code: number, reason: string): void {
    this.closed = { code, reason };
  }
  tx(msg: unknown): void {
    this.handle.message(JSON.stringify(msg));
  }
}

const tick = () => new Promise<void>((r) => setTimeout(r, 20));

async function join(hub: SignalHub, ip: string, name: string, keys?: CryptoKeyPair): Promise<FakeSock> {
  const s = new FakeSock();
  s.keys = keys ?? ((await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign"])) as CryptoKeyPair);
  s.handle = hub.open(s, ip);
  const pub = new Uint8Array((await crypto.subtle.exportKey("spki", s.keys.publicKey)) as ArrayBuffer);
  s.tx({ t: "hello", pub: toBase64Url(pub), name });
  await tick();
  const ch = s.inbox.find((m) => m.t === "challenge");
  if (!ch || ch.t !== "challenge") return s;
  const nonce = Uint8Array.from(atob(ch.nonce.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  const ctx = new TextEncoder().encode(AUTH_CONTEXT);
  const msg = new Uint8Array(ctx.length + nonce.length);
  msg.set(ctx);
  msg.set(nonce, ctx.length);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, s.keys.privateKey, msg));
  s.tx({ t: "auth", sig: toBase64Url(sig) });
  await tick();
  const ready = s.inbox.find((m) => m.t === "ready");
  if (ready?.t === "ready") s.id = ready.id;
  return s;
}

describe("SignalHub", () => {
  it("authenticates and lists existing peers, announcing the newcomer", async () => {
    const hub = new SignalHub();
    const a = await join(hub, "1.2.3.4", "alpha");
    const b = await join(hub, "1.2.3.4", "bravo");
    expect(a.id).toMatch(/^[0-9a-f]{64}$/);
    const ready = b.inbox.find((m) => m.t === "ready");
    expect(ready?.t === "ready" && ready.peers.map((p) => p.name)).toEqual(["alpha"]);
    expect(a.inbox.some((m) => m.t === "peer" && m.peer.id === b.id)).toBe(true);
  });

  it("isolates rooms by public address", async () => {
    const hub = new SignalHub();
    await join(hub, "1.2.3.4", "alpha");
    const c = await join(hub, "5.6.7.8", "charlie");
    const ready = c.inbox.find((m) => m.t === "ready");
    expect(ready?.t === "ready" && ready.peers).toEqual([]);
  });

  it("relays signals only within the room and reports unknown peers", async () => {
    const hub = new SignalHub();
    const a = await join(hub, "1.2.3.4", "alpha");
    const b = await join(hub, "1.2.3.4", "bravo");
    const c = await join(hub, "5.6.7.8", "charlie");
    a.tx({ t: "signal", to: b.id, data: { x: 1 } });
    a.tx({ t: "signal", to: c.id, data: { x: 2 } });
    await tick();
    expect(b.inbox.find((m) => m.t === "signal")).toMatchObject({ from: a.id, data: { x: 1 } });
    expect(c.inbox.some((m) => m.t === "signal")).toBe(false);
    expect(a.inbox.some((m) => m.t === "error" && m.code === "unknown_peer")).toBe(true);
  });

  it("rejects a bad signature", async () => {
    const hub = new SignalHub();
    const s = new FakeSock();
    s.keys = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign"])) as CryptoKeyPair;
    s.handle = hub.open(s, "1.2.3.4");
    s.tx({ t: "hello", pub: toBase64Url(new Uint8Array((await crypto.subtle.exportKey("spki", s.keys.publicKey)) as ArrayBuffer)), name: "x" });
    await tick();
    s.tx({ t: "auth", sig: toBase64Url(new Uint8Array(64)) });
    await tick();
    expect(s.inbox.some((m) => m.t === "error" && m.code === "auth_failed")).toBe(true);
    expect(s.closed?.code).toBe(1008);
  });

  it("rejects non-P-256 keys", async () => {
    const hub = new SignalHub();
    const s = new FakeSock();
    s.handle = hub.open(s, "1.2.3.4");
    const k = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-384" }, true, ["sign"])) as CryptoKeyPair;
    s.tx({ t: "hello", pub: toBase64Url(new Uint8Array((await crypto.subtle.exportKey("spki", k.publicKey)) as ArrayBuffer)), name: "x" });
    await tick();
    expect(s.inbox.some((m) => m.t === "error" && m.code === "auth_failed")).toBe(true);
  });

  it("replaces an older connection of the same device and does not announce its close", async () => {
    const hub = new SignalHub();
    const a = await join(hub, "1.2.3.4", "alpha");
    const b = await join(hub, "1.2.3.4", "bravo");
    const a2 = await join(hub, "1.2.3.4", "alpha", a.keys);
    expect(a.closed?.code).toBe(4000);
    a.handle.close();
    await tick();
    expect(b.inbox.some((m) => m.t === "left")).toBe(false);
    a2.handle.close();
    await tick();
    expect(b.inbox.some((m) => m.t === "left" && m.id === a2.id)).toBe(true);
  });

  it("enforces room size and per-address connection caps", async () => {
    const hub = new SignalHub({ maxRoomSize: 2, maxConnsPerIp: 3 });
    await join(hub, "1.2.3.4", "a");
    await join(hub, "1.2.3.4", "b");
    const c = await join(hub, "1.2.3.4", "c");
    expect(c.inbox.some((m) => m.t === "error" && m.code === "room_full")).toBe(true);
    const d = new FakeSock();
    d.handle = hub.open(d, "1.2.3.4");
    expect(d.closed?.reason).toBe("too many connections");
  });

  it("closes unauthenticated sockets after the timeout and rejects binary frames", async () => {
    const hub = new SignalHub({ authTimeoutMs: 30 });
    const s = new FakeSock();
    s.handle = hub.open(s, "1.2.3.4");
    await new Promise((r) => setTimeout(r, 60));
    expect(s.closed?.code).toBe(4001);
    const t = new FakeSock();
    t.handle = hub.open(t, "1.2.3.4");
    t.handle.message(new ArrayBuffer(4));
    await tick();
    expect(t.inbox.some((m) => m.t === "error" && m.code === "bad_message")).toBe(true);
  });

  it("does not register a socket that closes mid-authentication", async () => {
    const hub = new SignalHub();
    const s = new FakeSock();
    s.keys = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign"])) as CryptoKeyPair;
    s.handle = hub.open(s, "1.2.3.4");
    s.tx({ t: "hello", pub: toBase64Url(new Uint8Array((await crypto.subtle.exportKey("spki", s.keys.publicKey)) as ArrayBuffer)), name: "ghost" });
    await tick();
    const ch = s.inbox.find((m) => m.t === "challenge");
    if (ch?.t !== "challenge") throw new Error("no challenge");
    const ctx = new TextEncoder().encode(AUTH_CONTEXT);
    const nonce = Uint8Array.from(Buffer.from(ch.nonce, "base64url"));
    const msg = new Uint8Array(ctx.length + nonce.length);
    msg.set(ctx);
    msg.set(nonce, ctx.length);
    const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, s.keys.privateKey, msg));
    s.tx({ t: "auth", sig: toBase64Url(sig) });
    s.handle.close();
    await tick();
    const late = await join(hub, "1.2.3.4", "late");
    const ready = late.inbox.find((m) => m.t === "ready");
    expect(ready?.t === "ready" && ready.peers).toEqual([]);
  });

  it("caps connections per IPv6 /64 and across the whole hub", async () => {
    const hub = new SignalHub({ maxConnsPerIp: 2, maxTotalConns: 3 });
    const open = (ip: string): FakeSock => {
      const s = new FakeSock();
      s.handle = hub.open(s, ip);
      return s;
    };
    open("2001:db8:0:1::1");
    open("2001:db8:0:1::2");
    expect(open("2001:db8:0:1::3").closed?.reason).toBe("too many connections");
    open("9.9.9.9");
    expect(open("8.8.8.8").closed?.reason).toBe("too many connections");
  });
});

describe("SignalHub friends", () => {
  const kinds = (s: FakeSock, t: ServerMsg["t"]) => s.inbox.filter((m) => m.t === t);

  it("shows mutual friends to each other across networks and relays signals", async () => {
    const hub = new SignalHub();
    const a = await join(hub, "1.1.1.1", "alpha");
    const b = await join(hub, "2.2.2.2", "bravo");
    a.tx({ t: "friends", ids: [b.id] });
    await tick();
    expect(kinds(a, "friend")).toHaveLength(0);
    expect(kinds(b, "friend")).toHaveLength(0);
    b.tx({ t: "friends", ids: [a.id] });
    await tick();
    expect(kinds(a, "friend")).toMatchObject([{ peer: { id: b.id, name: "bravo" } }]);
    expect(kinds(b, "friend")).toMatchObject([{ peer: { id: a.id, name: "alpha" } }]);
    a.tx({ t: "signal", to: b.id, data: { x: 1 } });
    await tick();
    expect(kinds(b, "signal")).toMatchObject([{ from: a.id, data: { x: 1 } }]);
  });

  it("does not relay to a device that has not saved you back", async () => {
    const hub = new SignalHub();
    const a = await join(hub, "1.1.1.1", "alpha");
    const b = await join(hub, "2.2.2.2", "bravo");
    a.tx({ t: "friends", ids: [b.id] });
    a.tx({ t: "signal", to: b.id, data: 1 });
    await tick();
    expect(kinds(b, "signal")).toHaveLength(0);
    expect(a.inbox.some((m) => m.t === "error" && m.code === "unknown_peer")).toBe(true);
  });

  it("announces departure and retracts when a friend is removed", async () => {
    const hub = new SignalHub();
    const a = await join(hub, "1.1.1.1", "alpha");
    const b = await join(hub, "2.2.2.2", "bravo");
    a.tx({ t: "friends", ids: [b.id] });
    b.tx({ t: "friends", ids: [a.id] });
    await tick();
    b.tx({ t: "friends", ids: [] });
    await tick();
    expect(kinds(a, "friend_left")).toMatchObject([{ id: b.id }]);
    expect(kinds(b, "friend_left")).toMatchObject([{ id: a.id }]);
    b.tx({ t: "friends", ids: [a.id] });
    await tick();
    expect(kinds(a, "friend")).toHaveLength(2);
    b.handle.close();
    await tick();
    expect(kinds(a, "friend_left")).toHaveLength(2);
  });

  it("propagates renames and survives a device reconnecting from another network", async () => {
    const hub = new SignalHub();
    const a = await join(hub, "1.1.1.1", "alpha");
    const b = await join(hub, "2.2.2.2", "bravo");
    a.tx({ t: "friends", ids: [b.id] });
    b.tx({ t: "friends", ids: [a.id] });
    await tick();
    a.tx({ t: "rename", name: "새이름" });
    await tick();
    expect(kinds(b, "friend").at(-1)).toMatchObject({ peer: { id: a.id, name: "새이름" } });
    const a2 = await join(hub, "3.3.3.3", "새이름", a.keys);
    a2.tx({ t: "friends", ids: [b.id] });
    await tick();
    a.handle.close();
    await tick();
    expect(kinds(b, "friend_left")).toHaveLength(0);
    expect(kinds(a2, "friend")).toMatchObject([{ peer: { id: b.id } }]);
    a2.tx({ t: "signal", to: b.id, data: 2 });
    await tick();
    expect(kinds(b, "signal")).toHaveLength(1);
  });
});

describe("SignalHub pairing", () => {
  const code = (s: FakeSock): string => {
    const m = s.inbox.find((x) => x.t === "code");
    if (m?.t !== "code") throw new Error("no code");
    return m.code;
  };

  it("pairs two devices with a single-use six-digit code", async () => {
    const hub = new SignalHub();
    const a = await join(hub, "1.1.1.1", "alpha");
    const b = await join(hub, "2.2.2.2", "bravo");
    a.tx({ t: "pair" });
    await tick();
    expect(code(a)).toMatch(/^\d{6}$/);
    b.tx({ t: "join", code: code(a) });
    await tick();
    expect(a.inbox.find((m) => m.t === "paired")).toMatchObject({ peer: { id: b.id, name: "bravo" } });
    expect(b.inbox.find((m) => m.t === "paired")).toMatchObject({ peer: { id: a.id, name: "alpha" } });
    const c = await join(hub, "3.3.3.3", "charlie");
    c.tx({ t: "join", code: code(a) });
    await tick();
    expect(c.inbox.some((m) => m.t === "error" && m.code === "bad_code")).toBe(true);
  });

  it("rejects wrong, expired, and self-joined codes", async () => {
    const hub = new SignalHub({ pairTtlMs: 40 });
    const a = await join(hub, "1.1.1.1", "alpha");
    const b = await join(hub, "2.2.2.2", "bravo");
    a.tx({ t: "pair" });
    await tick();
    const c = code(a);
    b.tx({ t: "join", code: c === "000000" ? "000001" : "000000" });
    a.tx({ t: "join", code: c });
    await tick();
    expect(b.inbox.some((m) => m.t === "error" && m.code === "bad_code")).toBe(true);
    expect(a.inbox.some((m) => m.t === "error" && m.code === "bad_code")).toBe(true);
    await new Promise((r) => setTimeout(r, 60));
    b.tx({ t: "join", code: c });
    await tick();
    expect(b.inbox.filter((m) => m.t === "error")).toHaveLength(2);
    expect(b.inbox.some((m) => m.t === "paired")).toBe(false);
  });

  it("stops accepting guesses from a network after too many failures", async () => {
    const hub = new SignalHub({ maxFailedJoins: 3 });
    const a = await join(hub, "1.1.1.1", "alpha");
    const b = await join(hub, "2.2.2.2", "bravo");
    a.tx({ t: "pair" });
    await tick();
    const real = code(a);
    for (let i = 0; i < 3; i++) b.tx({ t: "join", code: String(i).padStart(6, "1") === real ? "999999" : String(i).padStart(6, "1") });
    await tick();
    b.tx({ t: "join", code: real });
    await tick();
    expect(b.inbox.some((m) => m.t === "paired")).toBe(false);
    expect(b.inbox.filter((m) => m.t === "error")).toHaveLength(4);
  });
});
