import { describe, expect, it } from "vitest";
import { BLOCK_SIZE, MAX_PAYLOAD_BYTES, type TransferMsg } from "@radius/protocol";
import { bytesEqual } from "./hash";
import { Receiver } from "./receiver";
import { Sender, type SendFile } from "./sender";
import type { DataLink, FileSource, Sink } from "./types";

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

class MemSource implements FileSource {
  constructor(readonly data: Uint8Array) {}
  get size() {
    return this.data.length;
  }
  read(offset: number, length: number) {
    return Promise.resolve(this.data.slice(offset, offset + length).buffer);
  }
}

class MemSink implements Sink {
  files = new Map<number, { path: string; data: Uint8Array; closed: boolean }>();
  aborted = false;
  open(i: number, path: string, size: number) {
    this.files.set(i, { path, data: new Uint8Array(size), closed: false });
    return Promise.resolve();
  }
  write(i: number, offset: number, data: Uint8Array) {
    this.files.get(i)!.data.set(data, offset);
    return Promise.resolve();
  }
  close(i: number) {
    this.files.get(i)!.closed = true;
    return Promise.resolve();
  }
  abort() {
    this.aborted = true;
    return Promise.resolve();
  }
}

function pattern(size: number, seed: number): Uint8Array {
  const a = new Uint8Array(size);
  for (let i = 0; i < size; i++) a[i] = (i * 31 + seed) & 0xff;
  return a;
}

interface Harness {
  sender: Sender;
  receiver: Receiver;
  sink: MemSink;
  perChannel: number[];
  maxBuffered: number;
}

function harness(
  files: SendFile[],
  opts: {
    channels?: number;
    corrupt?: (frame: ArrayBuffer, n: number) => ArrayBuffer;
    decision?: "accept" | "declined" | "no_space";
    highWatermark?: number;
  } = {},
): Harness {
  const channels = opts.channels ?? 3;
  const perChannel = new Array<number>(channels).fill(0);
  const buffered = new Array<number>(channels).fill(0);
  const drains: (() => void)[][] = Array.from({ length: channels }, () => []);
  const h: Partial<Harness> = { perChannel, maxBuffered: 0 };
  let dataN = 0;
  const ref = {} as { receiver: Receiver; sender: Sender };
  const sink = new MemSink();

  const toReceiver = (m: TransferMsg) => {
    setTimeout(() => ref.receiver.handleControl(m), 0);
    return true;
  };
  const link: DataLink = {
    channelCount: channels,
    isOpen: () => true,
    bufferedAmount: (c) => buffered[c]!,
    sendData(c, frame) {
      perChannel[c]!++;
      buffered[c]! += frame.byteLength;
      h.maxBuffered = Math.max(h.maxBuffered!, buffered[c]!);
      const out = opts.corrupt ? opts.corrupt(frame, dataN++) : frame;
      setTimeout(() => {
        buffered[c]! -= frame.byteLength;
        ref.receiver.handleData(out);
        drains[c]!.splice(0).forEach((r) => r());
      }, 0);
      return true;
    },
    sendControl: toReceiver,
    waitDrain: (c) => new Promise<void>((r) => drains[c]!.push(r)),
    waitReady: () => Promise.resolve(),
  };
  ref.receiver = new Receiver({
    send: (m) => {
      setTimeout(() => ref.sender.handleControl(m), 0);
      return true;
    },
    sink,
    onOffer: () => Promise.resolve(opts.decision ?? "accept"),
  });
  ref.sender = new Sender({
    id: 7,
    files,
    link,
    ...(opts.highWatermark ? { highWatermark: opts.highWatermark } : {}),
  });
  return Object.assign(h, { sender: ref.sender, receiver: ref.receiver, sink }) as Harness;
}

describe("transfer", () => {
  it("transfers multiple files incl. empty, 1B, exact block and multi-block", async () => {
    const datas = [new Uint8Array(0), pattern(1, 1), pattern(BLOCK_SIZE, 2), pattern(BLOCK_SIZE * 2 + 5, 3)];
    const files = datas.map((d, i) => ({ path: `dir/f${i}.bin`, source: new MemSource(d) }));
    const h = harness(files);
    h.sender.start();
    expect(await h.sender.result).toEqual({ status: "complete" });
    expect(await h.receiver.result).toEqual({ status: "complete" });
    datas.forEach((d, i) => {
      const f = h.sink.files.get(i)!;
      expect(f.path).toBe(`dir/f${i}.bin`);
      expect(f.closed).toBe(true);
      expect(bytesEqual(f.data, d)).toBe(true);
    });
  });

  it("spreads chunks over all channels and respects the high watermark", async () => {
    const hw = 4 * MAX_PAYLOAD_BYTES;
    const h = harness([{ path: "a", source: new MemSource(pattern(BLOCK_SIZE, 9)) }], { highWatermark: hw });
    h.sender.start();
    await h.sender.result;
    expect(h.perChannel.every((n) => n > 0)).toBe(true);
    expect(h.maxBuffered).toBeLessThanOrEqual(hw + MAX_PAYLOAD_BYTES + 16);
  });

  it("re-sends a corrupted block after nack and still completes", async () => {
    const data = pattern(BLOCK_SIZE + 1000, 5);
    let flipped = false;
    const h = harness([{ path: "a", source: new MemSource(data) }], {
      corrupt(frame) {
        if (flipped) return frame;
        flipped = true;
        const c = frame.slice(0);
        new Uint8Array(c)[100]! ^= 0xff;
        return c;
      },
    });
    h.sender.start();
    expect(await h.sender.result).toEqual({ status: "complete" });
    expect(bytesEqual(h.sink.files.get(0)!.data, data)).toBe(true);
  });

  it("fails after exceeding retries on a persistently corrupt block", async () => {
    const h = harness([{ path: "a", source: new MemSource(pattern(1000, 1)) }], {
      corrupt(frame) {
        const c = frame.slice(0);
        new Uint8Array(c)[20]! ^= 0xff;
        return c;
      },
    });
    h.sender.start();
    expect(await h.sender.result).toEqual({ status: "failed", reason: "block_retries_exceeded" });
  });

  it("reports rejection and aborts the sink", async () => {
    const h = harness([{ path: "a", source: new MemSource(pattern(10, 1)) }], { decision: "no_space" });
    h.sender.start();
    expect(await h.sender.result).toEqual({ status: "rejected", reason: "no_space" });
    expect(await h.receiver.result).toEqual({ status: "rejected", reason: "no_space" });
    expect(h.sink.aborted).toBe(true);
  });

  it("cancel from the sender ends both sides", async () => {
    const h = harness([{ path: "a", source: new MemSource(pattern(BLOCK_SIZE * 3, 1)) }]);
    h.sender.start();
    await tick();
    await tick();
    h.sender.cancel();
    expect(await h.sender.result).toEqual({ status: "cancelled" });
    expect(await h.receiver.result).toEqual({ status: "cancelled" });
  });

  it("ignores frames and control for other transfer ids", async () => {
    const h = harness([{ path: "a", source: new MemSource(pattern(100, 1)) }]);
    h.sender.start();
    h.sender.handleControl({ t: "cancel", id: 99 });
    expect(await h.sender.result).toEqual({ status: "complete" });
  });
});
