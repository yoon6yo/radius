import { MAX_MESSAGE_BYTES, decodeFrame } from "@radius/protocol";
import { describe, expect, it } from "vitest";
import type { DataLink } from "./types";
import { warmUp } from "./warmup";

function fakeLink(channels: number, open: (c: number) => boolean = () => true) {
  const sent: ArrayBuffer[][] = Array.from({ length: channels }, () => []);
  const buffered = new Array<number>(channels).fill(0);
  const link: DataLink = {
    channelCount: channels,
    isOpen: open,
    bufferedAmount: (c) => buffered[c]!,
    sendData: (c, f) => {
      sent[c]!.push(f);
      buffered[c]! += f.byteLength;
      return true;
    },
    sendControl: () => true,
    waitDrain: async (c) => void (buffered[c] = 0),
    waitReady: async () => undefined,
  };
  return { link, sent };
}

describe("warmUp", () => {
  it("sends the requested bytes as undecodable max-size frames spread over channels", async () => {
    const { link, sent } = fakeLink(3);
    await warmUp(link, 10 * MAX_MESSAGE_BYTES);
    const all = sent.flat();
    expect(all.length).toBe(10);
    expect(all.every((f) => f.byteLength === MAX_MESSAGE_BYTES && decodeFrame(f) === null)).toBe(true);
    expect(sent.every((s) => s.length > 0)).toBe(true);
  });

  it("waits for drain instead of growing a channel buffer without bound", async () => {
    const { link, sent } = fakeLink(1);
    let max = 0;
    const base = link.sendData;
    link.sendData = (c, f) => {
      const ok = base(c, f);
      max = Math.max(max, link.bufferedAmount(c));
      return ok;
    };
    await warmUp(link, 100 * MAX_MESSAGE_BYTES);
    expect(sent[0]!.length).toBe(100);
    expect(max).toBeLessThanOrEqual(256 * 1024 + MAX_MESSAGE_BYTES);
  });

  it("returns without sending when no channel is open", async () => {
    const { link, sent } = fakeLink(2, () => false);
    await warmUp(link, 4 * MAX_MESSAGE_BYTES);
    expect(sent.flat().length).toBe(0);
  });

  it("stops when a send fails", async () => {
    const { link } = fakeLink(1);
    let n = 0;
    link.sendData = () => ++n < 3;
    await warmUp(link, 100 * MAX_MESSAGE_BYTES);
    expect(n).toBe(3);
  });
});
