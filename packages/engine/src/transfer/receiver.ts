import {
  BLOCK_SIZE,
  blockCount,
  decodeFrame,
  type FrameHeader,
  fromBase64Url,
  type FileMeta,
  type RejectReason,
  type TransferMsg,
} from "@radius/protocol";
import { bytesEqual, rootHash, webCryptoSha256 } from "./hash";
import type { Sha256, Sink, TransferResult } from "./types";

export interface ReceiverOptions {
  send(msg: TransferMsg): boolean;
  sink: Sink;
  sha256?: Sha256;
  /** Accept/decline decision (user prompt, free-space check). */
  onOffer(files: FileMeta[]): Promise<"accept" | RejectReason>;
  onProgress?(verifiedBytes: number, totalBytes: number): void;
}

interface Pending {
  buf: Uint8Array;
  seen: Set<number>;
  got: number;
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
  private verified: Uint8Array[][] = [];
  private verifiedBytes = 0;
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

  private enqueue(fn: () => Promise<void>): void {
    this.chain = this.chain.then(fn).catch((e: unknown) => this.finish({ status: "failed", reason: String(e) }));
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
    const decision = await this.opts.onOffer(files);
    if (decision !== "accept") {
      this.opts.send({ t: "reject", id, reason: decision });
      await this.finish({ status: "rejected", reason: decision });
      return;
    }
    this.id = id;
    this.files = files;
    this.totalBytes = files.reduce((n, f) => n + f.size, 0);
    this.verified = files.map((f) => new Array<Uint8Array>(blockCount(f.size)));
    for (const [i, f] of files.entries()) await this.opts.sink.open(i, f.path, f.size);
    this.active = true;
    this.opts.send({ t: "accept", id });
  }

  private async onFrame(h: FrameHeader, payload: Uint8Array): Promise<void> {
    if (!this.active || this.finished || h.transferId !== this.id) return;
    const file = this.files[h.fileIdx];
    if (!file || h.blockIdx >= blockCount(file.size)) return;
    const blockLen = Math.min(BLOCK_SIZE, file.size - h.blockIdx * BLOCK_SIZE);
    if (h.offset + payload.length > blockLen) return;
    if (this.verified[h.fileIdx]![h.blockIdx]) return;
    const k = this.key(h.fileIdx, h.blockIdx);
    let p = this.partial.get(k);
    if (!p) {
      p = { buf: new Uint8Array(blockLen), seen: new Set(), got: 0 };
      this.partial.set(k, p);
    }
    if (p.seen.has(h.offset)) return;
    p.seen.add(h.offset);
    p.buf.set(payload, h.offset);
    p.got += payload.length;
    if (p.got < blockLen) return;
    this.partial.delete(k);
    if (this.expected.has(k)) await this.verifyBlock(h.fileIdx, h.blockIdx, p.buf);
    else this.waiting.set(k, p.buf);
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
    this.verified[f]![b] = got;
    this.verifiedBytes += len;
    this.opts.onProgress?.(this.verifiedBytes, this.totalBytes);
    this.opts.send({ t: "ack", id: this.id, f, b });
  }

  private async onDone(rootB64: string): Promise<void> {
    const all = this.verified.flat();
    const complete = this.verified.every((blocks) => blocks.every((h) => h !== undefined));
    const root = fromBase64Url(rootB64);
    const ok = complete && root !== null && bytesEqual(root, await rootHash(this.sha, all));
    if (ok) for (const i of this.files.keys()) await this.opts.sink.close(i);
    this.opts.send({ t: "complete", id: this.id, ok });
    await this.finish(ok ? { status: "complete" } : { status: "failed", reason: "verify_failed" });
  }

  private async finish(r: TransferResult): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    if (r.status !== "complete") await this.opts.sink.abort().catch(() => undefined);
    this.resolve(r);
  }
}

