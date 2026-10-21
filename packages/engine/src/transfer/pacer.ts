export interface RampOptions {
  /** Send rate at the start, bytes/s. */
  initialBps: number;
  /** The allowed rate doubles every this many ms. */
  doubleMs: number;
  /** After this many ms since the first send the pacer stops limiting. */
  rampMs: number;
}

/**
 * Slow-start for the app layer: SCTP's own ramp overshoots the UDP send buffer in the first
 * moments, the dropped tail then waits out a retransmit timeout (seconds of dead time).
 */
export class RampPacer {
  private start: number | undefined;
  private nextFree = 0;

  constructor(
    private readonly opts: RampOptions,
    private readonly now: () => number = () => performance.now(),
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  /** Resolves once `bytes` may be handed to the link. Slots are reserved synchronously, so concurrent callers queue in order. */
  async take(bytes: number): Promise<void> {
    const t = this.now();
    this.start ??= t;
    const elapsed = t - this.start;
    if (elapsed >= this.opts.rampMs) return;
    const rate = this.opts.initialBps * 2 ** (elapsed / this.opts.doubleMs);
    const at = Math.max(t, this.nextFree);
    this.nextFree = at + (bytes / rate) * 1000;
    if (at > t) await this.sleep(at - t);
  }
}
