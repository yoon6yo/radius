import {
  BLOCK_SIZE,
  blockCount,
  decodeFrame,
  FLAG_LAST,
  FLAG_ZSTD,
  encodeHave,
  SHA256_BYTES,
  type FrameHeader,
  fromBase64Url,
  type FileMeta,
  type RejectReason,
  type TransferMsg,
} from "@radius/protocol";
import { bytesEqual, rootHash, webCryptoSha256 } from "./hash";
import { StagingBusyError, type Codec, type Sha256, type Sink, type TransferResult } from "./types";

export interface ReceiverOptions {
  send(msg: TransferMsg): boolean;
  sink: Sink;
  sha256?: Sha256;
  /** Enables receiving zstd-compressed blocks. */
  codec?: Codec;
  /** Accept/decline decision (user prompt, free-space check). */
  onOffer(files: FileMeta[], resumedBytes: number): Promise<"accept" | RejectReason>;
  onProgress?(verifiedBytes: number, totalBytes: number): void;
  /** Verified bytes of one file; fires after every block that changes it (and once per resumed file). */
  onFileProgress?(file: number, verifiedBytes: number): void;
}

/** Blocks being assembled or awaiting their hash; bounds receiver memory to ~64 MiB. */
export const MAX_INFLIGHT_BLOCKS = 16;

interface Pending {
  buf: Uint8Array;
  seen: Set<number>;
  got: number;
  /** Compressed block: known once the LAST frame arrives. */
  zstd: boolean;
  total?: number;
}

export class Receiver {
  private id = -1;
  private files: FileMeta[] = [];
  private active = false;
  private finished = false;
  private resolve!: (r: TransferResult) => void;
  readonly result: Promise<TransferResult>;
  private readonly sha: Sha256;
  private readonly opts: ReceiverOptions;
  /** Expected hash per "f:b" announced by the sender. */
  private expected = new Map<string, Uint8Array>();
  private partial = new Map<string, Pending>();
  /** Complete blocks waiting for their hash announcement. */
  private waiting = new Map<string, Uint8Array>();
  private verified: (Uint8Array | undefined)[][] = [];
  private verifiedBytes = 0;
  private fileBytes: number[] = [];
  private totalBytes = 0;
  private chain: Promise<void> = Promise.resolve();

  constructor(opts: ReceiverOptions) {
    this.opts = opts;
    this.sha = opts.sha256 ?? webCryptoSha256;
    this.result = new Promise((r) => (this.resolve = r));
  }

  /** Control messages are processed strictly in order. */
  handleControl(msg: TransferMsg): void {
    this.enqueue(() => this.onControl(msg));
  }

  handleData(buf: ArrayBuffer): void {
    const frame = decodeFrame(buf);
    if (!frame) return;
    this.enqueue(() => this.onFrame(frame.header, frame.payload));
  }

  cancel(): void {
    if (this.finished) return;
    this.opts.send({ t: "cancel", id: this.id });
    void this.finish({ status: "cancelled" });
  }

  /** Link is gone for good: stop without sending or discarding the staged blocks, so a re-offer can resume. */
  interrupt(): void {
    if (this.finished) return;
    this.finished = true;
    this.resolve({ status: "failed", reason: "link_lost" });
  }

  private enqueue(fn: () => Promise<void>): void {
    this.chain = this.chain.then(fn).catch((e: unknown) => {
      if (this.active && !this.finished) this.opts.send({ t: "cancel", id: this.id });
      return this.finish({ status: "failed", reason: e instanceof Error ? e.message : String(e) });
    });
  }

  private key(f: number, b: number): string {
    return `${f}:${b}`;
  }

  private async onControl(msg: TransferMsg): Promise<void> {
    if (this.finished) return;
    if (msg.t === "offer") return this.onOffer(msg.id, msg.files);
    if (!this.active || msg.id !== this.id) return;
    switch (msg.t) {
      case "bh": {
        const h = fromBase64Url(msg.h);
        if (!h || msg.f >= this.files.length || msg.b >= blockCount(this.files[msg.f]!.size)) return;
        const k = this.key(msg.f, msg.b);
        const have = this.verified[msg.f]![msg.b];
        if (have) {
          if (bytesEqual(have, h) && (await this.onDisk(msg.f, msg.b, h))) this.opts.send({ t: "ack", id: this.id, f: msg.f, b: msg.b });
          else await this.revoke(msg.f, msg.b);
          return;
        }
        this.expected.set(k, h);
        const data = this.waiting.get(k);
        if (data) {
          this.waiting.delete(k);
          await this.verifyBlock(msg.f, msg.b, data);
        }
        break;
      }
      case "done":
        await this.onDone(msg.root);
        break;
      case "cancel":
        await this.finish({ status: "cancelled" });
        break;
      default:
        break;
    }
  }

  private async onOffer(id: number, files: FileMeta[]): Promise<void> {
    if (this.active) return;
    let verified;
    try {
      verified = await this.loadResume(files);
    } catch (e) {
      if (!(e instanceof StagingBusyError)) throw e;
      this.opts.send({ t: "reject", id, reason: "busy" });
      await this.finish({ status: "rejected", reason: "busy" });
      return;
    }
    const resumed = verified.reduce(
      (n, blocks, f) => blocks.reduce((m, h, b) => (h ? m + this.blockLen(files[f]!, b) : m), n),
      0,
    );
    const decision = await this.opts.onOffer(files, resumed);
    // The link may have died while the user was deciding: nothing to answer or open.
    if (this.finished) return;
    if (decision !== "accept") {
      this.opts.send({ t: "reject", id, reason: decision });
      // Declining a resume must not destroy the staged blocks.
      await this.finish({ status: "rejected", reason: decision }, resumed > 0);
      return;
    }
    this.id = id;
    this.files = files;
    this.totalBytes = files.reduce((n, f) => n + f.size, 0);
    this.verified = verified;
    this.verifiedBytes = resumed;
    for (const [i, f] of files.entries()) await this.opts.sink.open(i, f.path, f.size);
    this.active = true;
    this.fileBytes = verified.map((blocks, f) => blocks.reduce((n, h, b) => (h ? n + this.blockLen(files[f]!, b) : n), 0));
    if (resumed > 0) {
      this.opts.onProgress?.(resumed, this.totalBytes);
      this.fileBytes.forEach((bytes, f) => bytes > 0 && this.opts.onFileProgress?.(f, bytes));
    }
    const have = resumed > 0 ? verified.map((blocks) => encodeHave(blocks.map((h) => h !== undefined))) : undefined;
    const z = this.opts.codec ? ({ z: true } as const) : {};
    this.opts.send(have ? { t: "accept", id, have, ...z } : { t: "accept", id, ...z });
  }

  private blockLen(file: FileMeta, b: number): number {
    return Math.min(BLOCK_SIZE, file.size - b * BLOCK_SIZE);
  }

  /** Persisted hashes are untrusted input: ignore anything malformed. */
  private async loadResume(files: FileMeta[]): Promise<(Uint8Array | undefined)[][]> {
    const out = files.map((f) => new Array<Uint8Array | undefined>(blockCount(f.size)));
    const prior = await this.opts.sink.resume?.(files).catch((e: unknown) => {
      if (e instanceof StagingBusyError) throw e;
      return undefined;
    });
    if (!prior || prior.length !== files.length) return out;
    prior.forEach((blocks, f) => {
      blocks.forEach((h, b) => {
        if (h && h.length === SHA256_BYTES && b < out[f]!.length) out[f]![b] = h;
      });
    });
    return out;
  }

  /** A recorded hash only counts if the staged bytes still hash to it (crash may have lost unflushed data). */
  private async onDisk(f: number, b: number, want: Uint8Array): Promise<boolean> {
    if (!this.opts.sink.read) return true;
    const data = await this.opts.sink.read(f, b * BLOCK_SIZE, this.blockLen(this.files[f]!, b));
    return bytesEqual(want, await this.sha(data));
  }

  /** Sender disagrees with a persisted block: forget it and ask for the data again. */
  private async revoke(f: number, b: number): Promise<void> {
    this.verified[f]![b] = undefined;
    this.verifiedBytes -= this.blockLen(this.files[f]!, b);
    this.fileBytes[f]! -= this.blockLen(this.files[f]!, b);
    this.opts.onFileProgress?.(f, this.fileBytes[f]!);
    await this.opts.sink.record?.(f, b, null);
    this.opts.send({ t: "nack", id: this.id, f, b });
  }

  private async onFrame(h: FrameHeader, payload: Uint8Array): Promise<void> {
    if (!this.active || this.finished || h.transferId !== this.id) return;
    const file = this.files[h.fileIdx];
    if (!file || h.blockIdx >= blockCount(file.size)) return;
    const blockLen = Math.min(BLOCK_SIZE, file.size - h.blockIdx * BLOCK_SIZE);
    if (h.offset + payload.length > blockLen) return;
    const zstd = (h.flags & FLAG_ZSTD) !== 0;
    if (zstd && !this.opts.codec) throw new Error("unsupported_codec");
    if (this.verified[h.fileIdx]![h.blockIdx]) return;
    const k = this.key(h.fileIdx, h.blockIdx);
    let p = this.partial.get(k);
    if (!p) {
      if (this.partial.size + this.waiting.size >= MAX_INFLIGHT_BLOCKS) throw new Error("too_many_blocks");
      p = { buf: new Uint8Array(blockLen), seen: new Set(), got: 0, zstd };
      this.partial.set(k, p);
    }
    if (p.zstd !== zstd || p.seen.has(h.offset)) return;
    p.seen.add(h.offset);
    p.buf.set(payload, h.offset);
    p.got += payload.length;
    if (zstd && (h.flags & FLAG_LAST) !== 0) p.total = h.offset + payload.length;
    if (zstd ? p.total === undefined || p.got < p.total : p.got < blockLen) return;
    this.partial.delete(k);
    let data = p.buf;
    if (zstd) {
      try {
        data = await this.opts.codec!.decompress(p.buf.subarray(0, p.total), blockLen);
        if (data.length !== blockLen) throw new Error("bad_length");
      } catch {
        this.opts.send({ t: "nack", id: this.id, f: h.fileIdx, b: h.blockIdx });
        return;
      }
    }
    if (this.expected.has(k)) await this.verifyBlock(h.fileIdx, h.blockIdx, data);
    else this.waiting.set(k, data);
  }

  private async verifyBlock(f: number, b: number, data: Uint8Array): Promise<void> {
    const k = this.key(f, b);
    const want = this.expected.get(k)!;
    const got = await this.sha(data);
    if (!bytesEqual(want, got)) {
      this.expected.delete(k);
      this.opts.send({ t: "nack", id: this.id, f, b });
      return;
    }
    const len = data.length; // sinks may transfer (detach) the buffer
    await this.opts.sink.write(f, b * BLOCK_SIZE, data);
    await this.opts.sink.record?.(f, b, got);
    this.verified[f]![b] = got;
    this.verifiedBytes += len;
    this.fileBytes[f]! += len;
    this.opts.onFileProgress?.(f, this.fileBytes[f]!);
    this.opts.onProgress?.(this.verifiedBytes, this.totalBytes);
    this.opts.send({ t: "ack", id: this.id, f, b });
  }

  private async onDone(rootB64: string): Promise<void> {
    const complete = this.verified.every((blocks) => blocks.every((h) => h !== undefined));
    const all = this.verified.flat() as Uint8Array[];
    const root = fromBase64Url(rootB64);
    const ok = complete && root !== null && bytesEqual(root, await rootHash(this.sha, all));
    if (ok) for (const i of this.files.keys()) await this.opts.sink.close(i);
    this.opts.send({ t: "complete", id: this.id, ok });
    await this.finish(ok ? { status: "complete" } : { status: "failed", reason: "verify_failed" });
  }

  private async finish(r: TransferResult, keepStaging = false): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    if (r.status !== "complete" && !keepStaging) await this.opts.sink.abort().catch(() => undefined);
    this.resolve(r);
  }
}

