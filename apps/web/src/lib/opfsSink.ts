import { StagingBusyError, type Sink } from "@radius/engine";
import type { FileMeta } from "@radius/protocol";

type Call =
  | { op: "resume"; files: FileMeta[] }
  | { op: "record"; idx: number; block: number; hash: Uint8Array | null }
  | { op: "complete" }
  | { op: "read"; idx: number; offset: number; length: number }
  | { op: "open"; idx: number; path: string; size: number }
  | { op: "write"; idx: number; offset: number; data: Uint8Array }
  | { op: "close"; idx: number }
  | { op: "abort" };

/** Stable per-offer staging dir name: the same files offered again resume the same staging. */
export async function stagingDir(files: FileMeta[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(files.map((f) => [f.path, f.size])));
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return `r-${Array.from(digest.subarray(0, 16), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Sink backed by OPFS; random-offset writes happen in a dedicated worker. */
export class OpfsSink implements Sink {
  /** Set by {@link resume} once the offer is known. */
  dir = "";
  private worker: Worker | null = null;
  private releaseLock: (() => void) | null = null;
  /** Only the holder of the staging lock may delete it. */
  private owned = false;
  private seq = 0;
  private readonly waiting = new Map<number, { ok(v: unknown): void; fail(e: Error): void }>();

  async resume(files: FileMeta[]): Promise<(Uint8Array | undefined)[][]> {
    this.dir = await stagingDir(files);
    await this.lock();
    const found = await this.call<[number, number, Uint8Array][]>({ op: "resume", files });
    const out = files.map(() => [] as (Uint8Array | undefined)[]);
    for (const [f, b, h] of found) if (out[f]) out[f][b] = h;
    return out;
  }
  /** One transfer per staging dir at a time, across tabs: OPFS sync handles are exclusive anyway. */
  private async lock(): Promise<void> {
    if (!navigator.locks) {
      this.owned = true;
      return;
    }
    const got = await new Promise<boolean>((resolve) => {
      void navigator.locks.request(`radius-staging-${this.dir}`, { ifAvailable: true }, (l) => {
        resolve(l !== null);
        if (!l) return undefined;
        return new Promise<void>((release) => (this.releaseLock = release));
      });
    });
    if (!got) throw new StagingBusyError();
    this.owned = true;
  }

  read(idx: number, offset: number, length: number) {
    return this.call<Uint8Array>({ op: "read", idx, offset, length });
  }
  async record(idx: number, block: number, hash: Uint8Array | null) {
    await this.call({ op: "record", idx, block, hash });
  }
  async complete() {
    await this.call({ op: "complete" });
  }
  async open(idx: number, path: string, size: number) {
    await this.call({ op: "open", idx, path, size });
  }
  async write(idx: number, offset: number, data: Uint8Array) {
    await this.call({ op: "write", idx, offset, data }, [data.buffer]);
  }
  async close(idx: number) {
    await this.call({ op: "close", idx });
  }
  async abort() {
    if (this.owned) await this.call({ op: "abort" });
    this.dispose();
  }

  dispose(): void {
    this.releaseLock?.();
    this.releaseLock = null;
    this.worker?.terminate();
    this.worker = null;
  }

  private call<T = void>(c: Call, transfer: Transferable[] = []): Promise<T> {
    const w = this.ensure();
    const seq = ++this.seq;
    return new Promise((ok, fail) => {
      this.waiting.set(seq, { ok: ok as (v: unknown) => void, fail });
      w.postMessage({ ...c, seq, dir: this.dir }, transfer);
    });
  }

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL("./opfs.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<{ seq: number; ok: boolean; result?: unknown; error?: string }>) => {
      const p = this.waiting.get(e.data.seq);
      this.waiting.delete(e.data.seq);
      if (e.data.ok) p?.ok(e.data.result);
      else p?.fail(new Error(e.data.error));
    };
    this.worker = w;
    return w;
  }
}
