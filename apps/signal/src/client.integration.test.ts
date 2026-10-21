import type { webcrypto } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { SignalClient, type DeviceIdentity, type SignalStatus } from "@radius/engine/signal";
import { toBase64Url, type PeerInfo } from "@radius/protocol";
import { startSignalServer, type SignalServer } from "./server.ts";

const clients: SignalClient[] = [];
let server: SignalServer | undefined;

afterEach(async () => {
  clients.splice(0).forEach((c) => c.stop());
  await server?.close();
  server = undefined;
});

async function identity(name: string, keys?: webcrypto.CryptoKeyPair): Promise<DeviceIdentity> {
  const pair = keys ?? (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]));
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  return {
    publicKey: toBase64Url(spki),
    name,
    sign: async (m) => toBase64Url(new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, m))),
  };
}

async function waitFor(cond: () => boolean, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("waitFor timeout");
    await new Promise((r) => setTimeout(r, 10));
  }
}

function make(port: number, id: DeviceIdentity, extra: Partial<ConstructorParameters<typeof SignalClient>[0]> = {}) {
  const log = { statuses: [] as SignalStatus[], peers: [] as PeerInfo[], signals: [] as [string, unknown][] };
  const c = new SignalClient({
    url: `ws://127.0.0.1:${port}`,
    identity: id,
    backoffMs: () => 20,
    onStatus: (s) => log.statuses.push(s),
    onPeers: (p) => (log.peers = p),
    onSignal: (from, data) => log.signals.push([from, data]),
    ...extra,
  });
  clients.push(c);
  return { c, log };
}

describe("SignalClient against the real server", () => {
  it("discovers peers, relays signals, and propagates departure", async () => {
    server = await startSignalServer({ port: 0 });
    const a = make(server.port, await identity("A"));
    const b = make(server.port, await identity("B"));
    a.c.start();
    await waitFor(() => a.c.status === "online");
    b.c.start();
    await waitFor(() => b.c.status === "online");

    await waitFor(() => a.log.peers.length === 1 && b.log.peers.length === 1);
    expect(a.log.peers[0]).toEqual({ id: b.c.id, name: "B" });

    expect(a.c.sendSignal(b.c.id, { hi: 1 })).toBe(true);
    await waitFor(() => b.log.signals.length === 1);
    expect(b.log.signals[0]).toEqual([a.c.id, { hi: 1 }]);

    b.c.stop();
    await waitFor(() => a.log.peers.length === 0);
    expect(b.c.sendSignal(a.c.id, 1)).toBe(false);
  });

  it("reconnects by itself after the server goes away and comes back", async () => {
    server = await startSignalServer({ port: 0 });
    const port = server.port;
    const a = make(port, await identity("A"));
    a.c.start();
    await waitFor(() => a.c.status === "online");
    const firstId = a.c.id;

    await server.close();
    await waitFor(() => a.c.status !== "online");
    server = await startSignalServer({ port });
    await waitFor(() => a.c.status === "online");
    expect(a.c.id).toBe(firstId);
  });

  it("stops reconnecting when the same device connects elsewhere", async () => {
    server = await startSignalServer({ port: 0 });
    const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    const first = make(server.port, await identity("tab1", keys));
    first.c.start();
    await waitFor(() => first.c.status === "online");

    const second = make(server.port, await identity("tab2", keys));
    second.c.start();
    await waitFor(() => second.c.status === "online");
    await waitFor(() => first.c.status === "replaced");

    await new Promise((r) => setTimeout(r, 150));
    expect(first.c.status).toBe("replaced");
    expect(second.c.status).toBe("online");
  });
});
