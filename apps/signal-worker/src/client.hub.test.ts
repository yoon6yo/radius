import { afterEach, describe, expect, it } from "vitest";
import { SignalClient, type DeviceIdentity } from "@radius/engine/signal";
import { toBase64Url, type PeerInfo } from "@radius/protocol";
import { SignalHub, type ConnHandle } from "./hub.ts";

/** Minimal WebSocket stand-in wired straight to a hub, so the real client talks to the real hub without a runtime. */
function socketFor(hub: SignalHub, ip: string): typeof WebSocket {
  return class FakeWebSocket {
    readyState = 0;
    onopen: (() => void) | null = null;
    onmessage: ((ev: { data: string }) => void) | null = null;
    onclose: ((ev: { code: number }) => void) | null = null;
    onerror: (() => void) | null = null;
    private handle: ConnHandle;

    constructor() {
      this.handle = hub.open(
        {
          send: (data) => queueMicrotask(() => this.onmessage?.({ data })),
          close: (code) => this.shut(code),
        },
        ip,
      );
      queueMicrotask(() => {
        this.readyState = 1;
        this.onopen?.();
      });
    }
    send(data: string): void {
      this.handle.message(data);
    }
    close(): void {
      this.shut(1000);
    }
    private shut(code: number): void {
      if (this.readyState === 3) return;
      this.readyState = 3;
      this.handle.close();
      queueMicrotask(() => this.onclose?.({ code }));
    }
  } as unknown as typeof WebSocket;
}

async function identity(name: string): Promise<DeviceIdentity> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign"])) as CryptoKeyPair;
  const spki = new Uint8Array((await crypto.subtle.exportKey("spki", pair.publicKey)) as ArrayBuffer);
  return {
    publicKey: toBase64Url(spki),
    name,
    sign: async (m) => toBase64Url(new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, m))),
  };
}

async function waitFor(cond: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("waitFor timeout");
    await new Promise((r) => setTimeout(r, 5));
  }
}

const clients: SignalClient[] = [];
afterEach(() => clients.splice(0).forEach((c) => c.stop()));

function device(hub: SignalHub, ip: string, id: DeviceIdentity) {
  const log = {
    friends: [] as PeerInfo[],
    signals: [] as [string, unknown][],
    codes: [] as string[],
    paired: [] as PeerInfo[],
    errors: [] as string[],
  };
  const c = new SignalClient({
    url: "ws://hub",
    identity: id,
    WebSocketImpl: socketFor(hub, ip),
    backoffMs: () => 10,
    onFriends: (f) => (log.friends = f),
    onSignal: (from, data) => log.signals.push([from, data]),
    onCode: (code) => log.codes.push(code),
    onPaired: (p) => log.paired.push(p),
    onError: (e) => log.errors.push(e),
  });
  clients.push(c);
  c.start();
  return { c, log };
}

describe("SignalClient with SignalHub", () => {
  it("connects mutual saved devices on different networks, including after a reconnect", async () => {
    const hub = new SignalHub();
    const a = device(hub, "1.1.1.1", await identity("A"));
    const b = device(hub, "2.2.2.2", await identity("B"));
    await waitFor(() => a.c.status === "online" && b.c.status === "online");
    a.c.setFriends([b.c.id]);
    b.c.setFriends([a.c.id]);
    await waitFor(() => a.log.friends.length === 1 && b.log.friends.length === 1);
    expect(a.log.friends[0]).toEqual({ id: b.c.id, name: "B" });

    a.c.sendSignal(b.c.id, { hello: 1 });
    await waitFor(() => b.log.signals.length === 1);
    expect(b.log.signals[0]).toEqual([a.c.id, { hello: 1 }]);

    // Friends are re-sent on reconnect without the caller doing anything.
    a.c.stop();
    await waitFor(() => b.log.friends.length === 0);
    a.c.start();
    await waitFor(() => a.log.friends.length === 1 && b.log.friends.length === 1);
  });

  it("pairs two devices through a code", async () => {
    const hub = new SignalHub();
    const a = device(hub, "1.1.1.1", await identity("A"));
    const b = device(hub, "2.2.2.2", await identity("B"));
    await waitFor(() => a.c.status === "online" && b.c.status === "online");
    expect(a.c.requestCode()).toBe(true);
    await waitFor(() => a.log.codes.length === 1);
    b.c.joinCode(a.log.codes[0] as string);
    await waitFor(() => a.log.paired.length === 1 && b.log.paired.length === 1);
    expect(a.log.paired[0]).toEqual({ id: b.c.id, name: "B" });
    expect(b.log.paired[0]).toEqual({ id: a.c.id, name: "A" });
    b.c.joinCode("000000");
    await waitFor(() => b.log.errors.includes("bad_code"));
  });
});
