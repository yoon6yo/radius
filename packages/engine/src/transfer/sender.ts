import {
  BLOCK_SIZE,
  MAX_PAYLOAD_BYTES,
  blockCount,
  decodeHave,
  encodeFrame,
  toBase64Url,
  type TransferMsg,
} from "@radius/protocol";
import { rootHash, webCryptoSha256 } from "./hash";
import type { DataLink, FileSource, Sha256, TransferResult } from "./types";

export interface SendFile {
  path: string;
  source: FileSource;
}

export interface SenderOptions {
  id: number;
  files: SendFile[];
  link: DataLink;
  sha256?: Sha256;
  onProgress?(ackedBytes: number, totalBytes: number): void;
  /** Blocks read/hashed/sent concurrently. Default 4. */
  window?: number;
  /** Per-channel buffered bytes above which sending waits. Default 1 MiB. */
  highWatermark?: number;
  maxRetries?: number;
}

interface Block {
  file: number;
  index: number;
  offset: number;
  length: number;
}

export class Sender {
  readonly result: Promise<TransferResult>;
  private resolve!: (r: TransferResult) => void;
  private readonly opts: SenderOptions;
  private readonly sha: Sha256;
  private readonly blocks: Block[] = [];
  private readonly hashes: Uint8Array[] = [];
  private readonly pending: number[] = [];
  private readonly retries = new Map<number, number>();
  /** Blocks the receiver already holds: only their hash is sent, for it to compare. */
  private readonly hashOnly = new Set<number>();
  private acked = new Set<number>();
  private ackedBytes = 0;
  private sending = 0;
  private totalBytes = 0;
  private finished = false;
  private started = false;

  constructor(opts: SenderOptions) {
    this.opts = opts;
    this.sha = opts.sha256 ?? webCryptoSha256;
    this.result = new Promise((r) => (this.resolve = r));
    opts.files.forEach((f, file) => {
      const n = blockCount(f.source.size);
      for (let index = 0; index < n; index++) {
        const offset = index * BLOCK_SIZE;
        this.blocks.push({ file, index, offset, length: Math.min(BLOCK_SIZE, f.source.size - offset) });
      }
      this.totalBytes += f.source.size;
    });
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const files = this.opts.files.map((f) => ({ path: f.path, size: f.source.size }));
    if (!this.opts.link.sendControl({ t: "offer", id: this.opts.id, files })) {
      this.finish({ status: "failed", reason: "link_closed" });
    }
  }

  cancel(): void {
    if (this.finished) return;
    this.opts.link.sendControl({ t: "cancel", id: this.opts.id });
    this.finish({ status: "cancelled" });
  }

  /** Link is gone for good: stop without notifying the peer. */
  interrupt(): void {
    this.finish({ status: "failed", reason: "link_lost" });
  }

  handleControl(msg: TransferMsg): void {
    if (this.finished || msg.id !== this.opts.id) return;
    switch (msg.t) {
      case "accept":
        if (this.pending.length === 0 && this.acked.size === 0) {
          this.markHave(msg.have);
          this.blocks.forEach((_, i) => this.pending.push(i));
          this.pump();
          if (this.blocks.length === 0) void this.sendDone();
        }
        break;
      case "reject":
        this.finish({ status: "rejected", reason: msg.reason });
        break;
      case "cancel":
        this.finish({ status: "cancelled" });
        break;
      case "ack":
        this.onAck(msg.f, msg.b);
        break;
      case "nack":
        this.onNack(msg.f, msg.b);
        break;
      case "complete":
        this.finish(msg.ok ? { status: "complete" } : { status: "failed", reason: "verify_failed" });
        break;
      default:
        break;
    }
  }

  private markHave(have: string[] | undefined): void {
    if (!have || have.length !== this.opts.files.length) return;
    const maps = have.map((h, f) => decodeHave(h, blockCount(this.opts.files[f]!.source.size)));
    if (maps.some((m) => m === null)) return;
    this.blocks.forEach((blk, i) => {
      if (maps[blk.file]![blk.index]) this.hashOnly.add(i);
    });
  }

  private blockIdx(f: number, b: number): number {
    return this.blocks.findIndex((x) => x.file === f && x.index === b);
  }

  private onAck(f: number, b: number): void {
    const i = this.blockIdx(f, b);
    if (i < 0 || this.acked.has(i)) return;
    this.acked.add(i);
    this.ackedBytes += this.blocks[i]!.length;
    this.opts.onProgress?.(this.ackedBytes, this.totalBytes);
    if (this.acked.size === this.blocks.length) void this.sendDone();
  }

  private onNack(f: number, b: number): void {
    const i = this.blockIdx(f, b);
    if (i < 0 || this.acked.has(i)) return;
    const n = (this.retries.get(i) ?? 0) + 1;
    this.retries.set(i, n);
    if (n > (this.opts.maxRetries ?? 3)) {
      this.finish({ status: "failed", reason: "block_retries_exceeded" });
      return;
    }
    this.hashOnly.delete(i);
    this.pending.push(i);
    this.pump();
  }

  private pump(): void {
    const window = this.opts.window ?? 4;
    while (!this.finished && this.sending < window && this.pending.length > 0) {
      const i = this.pending.shift()!;
      this.sending++;
      this.sendBlock(i)
        .catch((e: unknown) => this.finish({ status: "failed", reason: String(e) }))
        .finally(() => {
          this.sending--;
          this.pump();
        });
    }
  }

  private async sendBlock(i: number): Promise<void> {
    const blk = this.blocks[i]!;
    const data = await this.opts.files[blk.file]!.source.read(blk.offset, blk.length);
    if (data.byteLength !== blk.length) throw new Error("short_read");
    const bytes = new Uint8Array(data);
    const h = await this.sha(bytes);
    this.hashes[i] = h;
    if (this.finished) return;
    const id = this.opts.id;
    this.opts.link.sendControl({ t: "bh", id, f: blk.file, b: blk.index, h: toBase64Url(h) });
    if (this.hashOnly.has(i)) return;
    for (let pos = 0; pos < blk.length; pos += MAX_PAYLOAD_BYTES) {
      const frame = encodeFrame(
        { flags: 0, fileIdx: blk.file, transferId: id, blockIdx: blk.index, offset: pos },
        bytes.subarray(pos, Math.min(pos + MAX_PAYLOAD_BYTES, blk.length)),
      );
      for (;;) {
        const ch = await this.acquireChannel();
        if (ch < 0) return;
        if (this.opts.link.sendData(ch, frame)) break;
      }
    }
  }

  /** Least-buffered open channel; waits for drain/ready. Returns -1 once finished. */
  private async acquireChannel(): Promise<number> {
    const { link } = this.opts;
    const high = this.opts.highWatermark ?? 1024 * 1024;
    while (!this.finished) {
      let best = -1;
      for (let c = 0; c < link.channelCount; c++) {
        if (link.isOpen(c) && (best < 0 || link.bufferedAmount(c) < link.bufferedAmount(best))) best = c;
      }
      if (best < 0) await link.waitReady();
      else if (link.bufferedAmount(best) < high) return best;
      else await link.waitDrain(best);
    }
    return -1;
  }

  private async sendDone(): Promise<void> {
    try {
      const root = await rootHash(this.sha, this.hashes);
      this.opts.link.sendControl({ t: "done", id: this.opts.id, root: toBase64Url(root) });
    } catch (e) {
      this.finish({ status: "failed", reason: String(e) });
    }
  }

  private finish(r: TransferResult): void {
    if (this.finished) return;
    this.finished = true;
    this.resolve(r);
  }
}
