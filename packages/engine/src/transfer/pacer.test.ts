import { describe, expect, it } from "vitest";
import { RampPacer } from "./pacer";

function clock() {
  const c = { t: 1000, waits: [] as number[] };
  return {
    c,
    now: () => c.t,
    sleep: async (ms: number) => {
      c.waits.push(ms);
      c.t += ms;
    },
  };
}

describe("RampPacer", () => {
  it("lets the first send through and spaces the next ones at the initial rate", async () => {
    const { c, now, sleep } = clock();
    const p = new RampPacer({ initialBps: 1000, doubleMs: 1e9, rampMs: 1e9 }, now, sleep);
    await p.take(1000);
    await p.take(1000);
    await p.take(1000);
    expect(c.waits).toEqual([1000, 1000]);
  });

  it("doubles the rate every doubleMs", async () => {
    const { c, now, sleep } = clock();
    const p = new RampPacer({ initialBps: 1000, doubleMs: 1000, rampMs: 1e9 }, now, sleep);
    await p.take(1000); // t=0, rate 1000 -> next slot at 1000
    c.t += 1000; // t=1000: rate 2000, slot already free
    await p.take(1000);
    await p.take(1000); // 1000 bytes at 2000 B/s -> waits 500
    expect(c.waits).toEqual([500]);
  });

  it("stops limiting after rampMs", async () => {
    const { c, now, sleep } = clock();
    const p = new RampPacer({ initialBps: 1, doubleMs: 1e9, rampMs: 500 }, now, sleep);
    await p.take(1);
    c.t += 500;
    for (let i = 0; i < 5; i++) await p.take(1e9);
    expect(c.waits).toEqual([]);
  });

  it("queues concurrent callers instead of letting them share a slot", async () => {
    const waits: number[] = [];
    const p = new RampPacer({ initialBps: 1000, doubleMs: 1e9, rampMs: 1e9 }, () => 0, async (ms) => void waits.push(ms));
    await Promise.all([p.take(1000), p.take(1000), p.take(1000)]);
    expect(waits).toEqual([1000, 2000]);
  });
});
