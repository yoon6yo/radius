import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PeerConnection } from "./PeerConnection";
import type { PeerConnectionOptions, PeerState } from "./types";

class FakeChannel {
  readyState: RTCDataChannelState = "connecting";
  binaryType = "blob";
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  sent: unknown[] = [];
  constructor(
    readonly label: string,
    readonly id: number,
  ) {}
  send(d: unknown) {
    this.sent.push(d);
  }
  open() {
    this.readyState = "open";
    this.onopen?.();
  }
}

class FakePC {
  signalingState = "stable";
  iceConnectionState = "new";
  localDescription: { type: string; sdp: string } | null = null;
  onnegotiationneeded: (() => void) | null = null;
  onicecandidate: ((e: { candidate: null }) => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  channels: FakeChannel[] = [];
  remote: { type: string }[] = [];
  restarts = 0;
  closed = false;
  createDataChannel(label: string, init: { id: number }) {
    const c = new FakeChannel(label, init.id);
    this.channels.push(c);
    return c;
  }
  setLocalDescription() {
    const type = this.signalingState === "have-remote-offer" ? "answer" : "offer";
    this.localDescription = { type, sdp: `sdp-${type}` };
    this.signalingState = type === "offer" ? "have-local-offer" : "stable";
    return Promise.resolve();
  }
  setRemoteDescription(d: { type: string }) {
    this.remote.push(d);
    this.signalingState = d.type === "offer" ? "have-remote-offer" : "stable";
    return Promise.resolve();
  }
  addIceCandidate() {
    return Promise.resolve();
  }
  restartIce() {
    this.restarts++;
  }
  close() {
    this.closed = true;
  }
  setIce(s: string) {
    this.iceConnectionState = s;
    this.oniceconnectionstatechange?.();
  }
}

function make(self: string, peer: string, extra: Partial<PeerConnectionOptions> = {}) {
  let fake!: FakePC;
  const sent: unknown[] = [];
  const states: PeerState[] = [];
  const conn = new PeerConnection({
    selfId: self,
    peerId: peer,
    sendSignal: (d) => sent.push(d),
    onState: (s) => states.push(s),
    dataChannels: 2,
    restartBackoffMs: () => 100,
    RTCPeerConnectionImpl: class {
      constructor() {
        fake = new FakePC();
        return fake as unknown as RTCPeerConnection;
      }
    } as unknown as NonNullable<PeerConnectionOptions["RTCPeerConnectionImpl"]>,
    ...extra,
  });
  return { conn, fake, sent, states };
}

const offer = { t: "sdp", description: { type: "offer", sdp: "remote-offer" } };

function connect(fake: FakePC) {
  fake.setIce("connected");
  fake.channels.forEach((c) => c.open());
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("channels", () => {
  it("creates negotiated control (0) and data (1..N) channels", () => {
    const { fake } = make("a", "b");
    expect(fake.channels.map((c) => [c.label, c.id])).toEqual([
      ["control", 0],
      ["data-0", 1],
      ["data-1", 2],
    ]);
    expect(fake.channels.every((c) => c.binaryType === "arraybuffer")).toBe(true);
  });

  it("send fails until open, then delivers", () => {
    const { conn, fake } = make("a", "b");
    expect(conn.sendControl("x")).toBe(false);
    expect(conn.sendData(5, "x")).toBe(false);
    connect(fake);
    expect(conn.sendControl("x")).toBe(true);
    expect(conn.sendData(1, "y")).toBe(true);
    expect(fake.channels[2]?.sent).toEqual(["y"]);
  });
});

describe("negotiation", () => {
  it("sends an offer on negotiationneeded", async () => {
    const { fake, sent } = make("a", "b");
    fake.onnegotiationneeded?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual([{ t: "sdp", description: { type: "offer", sdp: "sdp-offer" } }]);
  });

  it("polite peer accepts a colliding offer and answers", async () => {
    const { conn, fake, sent } = make("a", "b");
    fake.onnegotiationneeded?.();
    await vi.advanceTimersByTimeAsync(0);
    await conn.handleSignal(offer);
    expect(fake.remote.map((d) => d.type)).toEqual(["offer"]);
    expect(sent.at(-1)).toEqual({ t: "sdp", description: { type: "answer", sdp: "sdp-answer" } });
  });

  it("impolite peer ignores a colliding offer", async () => {
    const { conn, fake, sent } = make("b", "a");
    fake.onnegotiationneeded?.();
    await vi.advanceTimersByTimeAsync(0);
    await conn.handleSignal(offer);
    expect(fake.remote).toEqual([]);
    expect(sent).toHaveLength(1);
  });

  it("drops malformed signals without failing", async () => {
    const { conn, states } = make("a", "b");
    await conn.handleSignal({ t: "sdp", description: { type: "offer" } });
    await conn.handleSignal("junk");
    expect(states).toEqual([]);
  });
});

describe("state & ICE restart", () => {
  it("connects only when ICE is up and all channels are open", () => {
    const { fake, states } = make("a", "b");
    fake.setIce("connected");
    expect(states).toEqual([]);
    fake.channels.forEach((c) => c.open());
    expect(states).toEqual(["connected"]);
  });

  it("restarts ICE after the disconnect grace period and recovers", () => {
    const { fake, states } = make("a", "b", { disconnectGraceMs: 1000 });
    connect(fake);
    fake.setIce("disconnected");
    expect(states.at(-1)).toBe("reconnecting");
    vi.advanceTimersByTime(999);
    expect(fake.restarts).toBe(0);
    vi.advanceTimersByTime(1 + 100);
    expect(fake.restarts).toBe(1);
    fake.setIce("connected");
    expect(states.at(-1)).toBe("connected");
  });

  it("a brief disconnect that heals cancels the restart", () => {
    const { fake } = make("a", "b", { disconnectGraceMs: 1000 });
    connect(fake);
    fake.setIce("disconnected");
    vi.advanceTimersByTime(500);
    fake.setIce("connected");
    vi.advanceTimersByTime(5000);
    expect(fake.restarts).toBe(0);
  });

  it("restarts once per attempt and fails after maxRestarts", () => {
    const { fake, states } = make("a", "b", { maxRestarts: 2 });
    connect(fake);
    fake.setIce("failed");
    fake.setIce("failed");
    vi.advanceTimersByTime(100);
    expect(fake.restarts).toBe(1);
    fake.setIce("failed");
    vi.advanceTimersByTime(100);
    expect(fake.restarts).toBe(2);
    fake.setIce("failed");
    expect(states.at(-1)).toBe("failed");
    vi.advanceTimersByTime(10_000);
    expect(fake.restarts).toBe(2);
  });

  it("fails when a channel closes unexpectedly", () => {
    const { fake, states } = make("a", "b");
    connect(fake);
    fake.channels[1]?.onclose?.();
    expect(states.at(-1)).toBe("failed");
  });
});

describe("notifyNetwork", () => {
  it("offline marks a connected link reconnecting; online restarts ICE and recovers", () => {
    const { conn, fake, states } = make("a", "b");
    connect(fake);
    conn.notifyNetwork(false);
    expect(states.at(-1)).toBe("reconnecting");
    conn.notifyNetwork(true);
    expect(fake.restarts).toBe(1);
    expect(states.at(-1)).toBe("connected");
  });

  it("online while connected is a no-op", () => {
    const { conn, fake } = make("a", "b");
    connect(fake);
    conn.notifyNetwork(true);
    expect(fake.restarts).toBe(0);
  });

  it("offline before the first connection does not report reconnecting", () => {
    const { conn, states } = make("a", "b");
    conn.notifyNetwork(false);
    expect(states).toEqual([]);
  });

  it("online cancels pending backoff and resets the attempt budget", () => {
    const { conn, fake } = make("a", "b", { maxRestarts: 1 });
    connect(fake);
    fake.setIce("failed");
    conn.notifyNetwork(true);
    expect(fake.restarts).toBe(1);
    vi.advanceTimersByTime(10_000);
    expect(fake.restarts).toBe(1);
    fake.setIce("failed");
    vi.advanceTimersByTime(100);
    expect(fake.restarts).toBe(2);
  });

  it("is ignored after close", () => {
    const { conn, fake } = make("a", "b");
    conn.close();
    conn.notifyNetwork(true);
    expect(fake.restarts).toBe(0);
  });
});

describe("close", () => {
  it("is idempotent, stops signaling and timers", () => {
    const { conn, fake, sent, states } = make("a", "b");
    connect(fake);
    fake.setIce("disconnected");
    conn.close();
    conn.close();
    vi.advanceTimersByTime(60_000);
    fake.onicecandidate?.({ candidate: null });
    expect(fake.restarts).toBe(0);
    expect(fake.closed).toBe(true);
    expect(states.at(-1)).toBe("closed");
    expect(sent).toEqual([]);
    expect(conn.state).toBe("closed");
  });
});
