import type { Sink } from "@radius/engine";

type Call =
  | { op: "open"; idx: number; path: string; size: number }
  | { op: "write"; idx: number; offset: number; data: Uint8Array }
  | { op: "close"; idx: number }
  | { op: "abort" };

/** Sink backed by OPFS; random-offset writes happen in a dedicated worker. */
export class OpfsSink implements Sink {
  private worker: Worker | null = null;
  private seq = 0;
  private readonly waiting = new Map<number, { ok(): void; fail(e: Error): void }>();

  constructor(readonly dir: string) {}

  open(idx: number, path: string, size: number) {
    return this.call({ op: "open", idx, path, size });
  }
  write(idx: number, offset: number, data: Uint8Array) {
    return this.call({ op: "write", idx, offset, data }, [data.buffer]);
  }
  close(idx: number) {
    return this.call({ op: "close", idx });
  }
  async abort() {
    await this.call({ op: "abort" });
    this.dispose();
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
  }

  private call(c: Call, transfer: Transferable[] = []): Promise<void> {
    const w = this.ensure();
    const seq = ++this.seq;
    return new Promise((ok, fail) => {
      this.waiting.set(seq, { ok, fail });
      w.postMessage({ ...c, seq, dir: this.dir }, transfer);
    });
  }

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL("./opfs.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<{ seq: number; ok: boolean; error?: string }>) => {
      const p = this.waiting.get(e.data.seq);
      this.waiting.delete(e.data.seq);
      if (e.data.ok) p?.ok();
      else p?.fail(new Error(e.data.error));
    };
    this.worker = w;
    return w;
  }
}
