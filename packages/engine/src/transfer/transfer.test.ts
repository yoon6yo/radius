import { describe, expect, it } from "vitest";
import { BLOCK_SIZE, FLAG_ZSTD, MAX_PAYLOAD_BYTES, decodeFrame, encodeFrame, type TransferMsg } from "@radius/protocol";
import { bytesEqual } from "./hash";
import { MAX_INFLIGHT_BLOCKS, Receiver } from "./receiver";
import { Sender, type SendFile } from "./sender";
import { StagingBusyError, type Codec, type DataLink, type FileSource, type Sink } from "./types";

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
  /** Survives across sinks to model OPFS staging of an interrupted transfer. */
  persisted: (Uint8Array | undefined)[][] = [];
  aborted = false;
  busy = false;
  resume() {
    return this.busy ? Promise.reject(new StagingBusyError()) : Promise.resolve(this.persisted);
  }
  read(i: number, offset: number, length: number) {
    return Promise.resolve(this.files.get(i)!.data.slice(offset, offset + length));
  }
  record(f: number, b: number, hash: Uint8Array | null) {
    (this.persisted[f] ??= [])[b] = hash ?? undefined;
    return Promise.resolve();
  }
  open(i: number, path: string, size: number) {
    if (this.files.get(i)?.data.length !== size) {
      this.files.set(i, { path, data: new Uint8Array(size), closed: false });
    }
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

async function pipe(data: Uint8Array, s: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  const w = s.writable.getWriter();
  void w.write(data as Uint8Array<ArrayBuffer>).then(() => w.close());
  return new Uint8Array(await new Response(s.readable).arrayBuffer());
}

/** Stand-in for zstd: native deflate-raw. */
const deflateCodec: Codec = {
  compress: (d) => pipe(d, new CompressionStream("deflate-raw")),
  decompress: (d) => pipe(d, new DecompressionStream("deflate-raw")),
};

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
    ramp?: boolean;
    sink?: MemSink;
    senderCodec?: Codec;
    receiverCodec?: Codec;
    onSenderFile?: (file: number, bytes: number) => void;
    onReceiverFile?: (file: number, bytes: number) => void;
  } = {},
): Harness {
  const channels = opts.channels ?? 3;
  const perChannel = new Array<number>(channels).fill(0);
  const buffered = new Array<number>(channels).fill(0);
  const drains: (() => void)[][] = Array.from({ length: channels }, () => []);
  const h: Partial<Harness> = { perChannel, maxBuffered: 0 };
  let dataN = 0;
  const ref = {} as { receiver: Receiver; sender: Sender };
  const sink = opts.sink ?? new MemSink();

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
    ...(opts.receiverCodec ? { codec: opts.receiverCodec } : {}),
    onOffer: () => Promise.resolve(opts.decision ?? "accept"),
    ...(opts.onReceiverFile ? { onFileProgress: opts.onReceiverFile } : {}),
  });
  ref.sender = new Sender({
    id: 7,
    files,
    link,
    ...(opts.senderCodec ? { codec: opts.senderCodec } : {}),
    ...(opts.onSenderFile ? { onFileProgress: opts.onSenderFile } : {}),
    ...(opts.highWatermark ? { highWatermark: opts.highWatermark } : {}),
    // The start-up ramp slows sending, so the mock link never fills; tests opt in explicitly.
    ...(opts.ramp ? {} : { ramp: false as const }),
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

  it("reports per-file progress on both sides, ending at each file's size", async () => {
    const sizes = [0, 10, BLOCK_SIZE * 2 + 5];
    const files = sizes.map((n, i) => ({ path: `f${i}`, source: new MemSource(pattern(n, i + 1)) }));
    const sent = new Map<number, number[]>();
    const got = new Map<number, number[]>();
    const rec = (m: Map<number, number[]>) => (f: number, n: number) => m.set(f, [...(m.get(f) ?? []), n]);
    const h = harness(files, { onSenderFile: rec(sent), onReceiverFile: rec(got) });
    h.sender.start();
    expect(await h.sender.result).toEqual({ status: "complete" });
    await h.receiver.result;
    for (const m of [sent, got]) {
      expect(m.has(0)).toBe(false);
      expect(m.get(1)!.at(-1)).toBe(10);
      expect(m.get(2)!.at(-1)).toBe(sizes[2]);
      expect([...m.get(2)!].sort((a, b) => a - b)).toEqual(m.get(2));
    }
  });

  describe("compression", () => {
    const run = async (opts: { senderCodec?: Codec; receiverCodec?: Codec; corrupt?: (f: ArrayBuffer, n: number) => ArrayBuffer }, datas: Uint8Array[]) => {
      let compressedFrames = 0;
      const h = harness(
        datas.map((d, i) => ({ path: `f${i}`, source: new MemSource(d) })),
        {
          ...opts,
          corrupt: (frame, n) => {
            if (decodeFrame(frame)!.header.flags & FLAG_ZSTD) compressedFrames++;
            return opts.corrupt ? opts.corrupt(frame, n) : frame;
          },
        },
      );
      h.sender.start();
      return { h, compressedFrames: () => compressedFrames };
    };
    const noise = (n: number) => {
      let s = 123456789;
      return Uint8Array.from({ length: n }, () => ((s ^= s << 13), (s ^= s >>> 17), (s ^= s << 5), s & 0xff));
    };

    it("sends compressible blocks compressed and verifies the original bytes", async () => {
      const datas = [new Uint8Array(BLOCK_SIZE * 2 + 3).fill(65), new Uint8Array(1000).fill(1)];
      const { h, compressedFrames } = await run({ senderCodec: deflateCodec, receiverCodec: deflateCodec }, datas);
      expect(await h.sender.result).toEqual({ status: "complete" });
      expect(await h.receiver.result).toEqual({ status: "complete" });
      expect(compressedFrames()).toBeGreaterThan(0);
      datas.forEach((d, i) => expect(bytesEqual(h.sink.files.get(i)!.data, d)).toBe(true));
    });

    it("sends incompressible blocks raw", async () => {
      const d = noise(BLOCK_SIZE + 10);
      const { h, compressedFrames } = await run({ senderCodec: deflateCodec, receiverCodec: deflateCodec }, [d]);
      expect(await h.sender.result).toEqual({ status: "complete" });
      expect(compressedFrames()).toBe(0);
      expect(bytesEqual(h.sink.files.get(0)!.data, d)).toBe(true);
    });

    it("does not compress when the receiver has no codec", async () => {
      const { h, compressedFrames } = await run({ senderCodec: deflateCodec }, [new Uint8Array(BLOCK_SIZE).fill(9)]);
      expect(await h.sender.result).toEqual({ status: "complete" });
      expect(compressedFrames()).toBe(0);
    });

    it("nacks a block that fails to decompress and gives up after retries", async () => {
      const bad: Codec = { ...deflateCodec, decompress: () => Promise.resolve(new Uint8Array(3)) };
      const { h } = await run({ senderCodec: deflateCodec, receiverCodec: bad }, [new Uint8Array(BLOCK_SIZE).fill(9)]);
      expect(await h.sender.result).toEqual({ status: "failed", reason: "block_retries_exceeded" });
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

  it("completes with the start-up ramp enabled", async () => {
    const data = pattern(BLOCK_SIZE, 3);
    const h = harness([{ path: "a", source: new MemSource(data) }], { ramp: true });
    h.sender.start();
    expect(await h.sender.result).toEqual({ status: "complete" });
    expect(bytesEqual(h.sink.files.get(0)!.data, data)).toBe(true);
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

  it("fails and notifies the sender when too many blocks are left half-sent", async () => {
    const sent: TransferMsg[] = [];
    const sink = new MemSink();
    const r = new Receiver({
      send: (m) => (sent.push(m), true),
      sink,
      onOffer: () => Promise.resolve("accept"),
    });
    const blocks = MAX_INFLIGHT_BLOCKS + 1;
    r.handleControl({ t: "offer", id: 1, files: [{ path: "big", size: BLOCK_SIZE * blocks }] });
    for (let b = 0; b < blocks; b++) {
      r.handleData(encodeFrame({ flags: 0, fileIdx: 0, transferId: 1, blockIdx: b, offset: 0 }, new Uint8Array(10)));
    }
    expect(await r.result).toEqual({ status: "failed", reason: "too_many_blocks" });
    expect(sent.at(-1)).toEqual({ t: "cancel", id: 1 });
    expect(sink.aborted).toBe(true);
  });

  describe("resume", () => {
    const data = pattern(BLOCK_SIZE * 2 + 7, 4);
    const files = () => [{ path: "a", source: new MemSource(data) }];

    async function interrupted(): Promise<MemSink> {
      const first = harness(files());
      first.sender.start();
      await first.sender.result;
      const sink = new MemSink();
      sink.files = first.sink.files;
      sink.persisted = first.sink.persisted;
      return sink;
    }

    it("sends no data frames for blocks the receiver already verified", async () => {
      const sink = await interrupted();
      const h = harness(files(), { sink });
      h.sender.start();
      expect(await h.sender.result).toEqual({ status: "complete" });
      expect(h.perChannel.reduce((a, b) => a + b, 0)).toBe(0);
      expect(bytesEqual(sink.files.get(0)!.data, data)).toBe(true);
    });

    it("re-sends a block whose persisted hash disagrees with the sender", async () => {
      const sink = await interrupted();
      sink.persisted[0]![1] = new Uint8Array(32);
      const h = harness(files(), { sink });
      h.sender.start();
      expect(await h.sender.result).toEqual({ status: "complete" });
      expect(h.perChannel.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
      expect(bytesEqual(sink.files.get(0)!.data, data)).toBe(true);
    });

    it("sends only the missing block of a partial transfer", async () => {
      const sink = await interrupted();
      sink.persisted[0]![0] = undefined;
      sink.files.get(0)!.data.fill(0, 0, BLOCK_SIZE);
      const h = harness(files(), { sink });
      h.sender.start();
      expect(await h.sender.result).toEqual({ status: "complete" });
      expect(h.perChannel.reduce((a, b) => a + b, 0)).toBe(Math.ceil(BLOCK_SIZE / MAX_PAYLOAD_BYTES));
      expect(bytesEqual(sink.files.get(0)!.data, data)).toBe(true);
    });

    it("re-sends a block whose staged bytes no longer match the recorded hash", async () => {
      const sink = await interrupted();
      sink.files.get(0)!.data.fill(0, BLOCK_SIZE, BLOCK_SIZE + 10);
      const h = harness(files(), { sink });
      h.sender.start();
      expect(await h.sender.result).toEqual({ status: "complete" });
      expect(h.perChannel.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
      expect(bytesEqual(sink.files.get(0)!.data, data)).toBe(true);
    });

    it("keeps staged blocks when a resumed offer is declined, but aborts a fresh one", async () => {
      const staged = await interrupted();
      const resumed = harness(files(), { sink: staged, decision: "declined" });
      resumed.sender.start();
      expect(await resumed.sender.result).toEqual({ status: "rejected", reason: "declined" });
      expect(staged.aborted).toBe(false);
      const fresh = harness(files(), { decision: "declined" });
      fresh.sender.start();
      await fresh.sender.result;
      expect(fresh.sink.aborted).toBe(true);
    });

    it("rejects with busy when the staging is in use", async () => {
      const sink = new MemSink();
      sink.busy = true;
      const h = harness(files(), { sink });
      h.sender.start();
      expect(await h.sender.result).toEqual({ status: "rejected", reason: "busy" });
    });

    it("ignores malformed persisted hashes", async () => {
      const sink = await interrupted();
      sink.persisted[0]![0] = new Uint8Array(5);
      const h = harness(files(), { sink });
      h.sender.start();
      expect(await h.sender.result).toEqual({ status: "complete" });
    });
  });

  it("interrupt while the accept prompt is open sends nothing and opens no sink file once it resolves", async () => {
    const sent: TransferMsg[] = [];
    const sink = new MemSink();
    let decide!: (d: "accept") => void;
    const r = new Receiver({
      send: (m) => (sent.push(m), true),
      sink,
      onOffer: () => new Promise((res) => (decide = res)),
    });
    r.handleControl({ t: "offer", id: 1, files: [{ path: "a", size: 10 }] });
    await tick();
    r.interrupt();
    decide("accept");
    await tick();
    expect(await r.result).toEqual({ status: "failed", reason: "link_lost" });
    expect(sent).toEqual([]);
  });

  it("interrupt keeps the receiver's staging (no sink abort) and ends the sender without a cancel", async () => {
    const sent: TransferMsg[] = [];
    const sink = new MemSink();
    const r = new Receiver({ send: (m) => (sent.push(m), true), sink, onOffer: () => Promise.resolve("accept") });
    r.handleControl({ t: "offer", id: 1, files: [{ path: "a", size: 10 }] });
    await tick();
    r.interrupt();
    expect(await r.result).toEqual({ status: "failed", reason: "link_lost" });
    expect(sink.aborted).toBe(false);
    const h = harness([{ path: "a", source: new MemSource(pattern(BLOCK_SIZE * 3, 1)) }]);
    h.sender.start();
    h.sender.interrupt();
    expect(await h.sender.result).toEqual({ status: "failed", reason: "link_lost" });
  });
});
