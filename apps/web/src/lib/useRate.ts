import { useEffect, useRef, useState } from "react";

/** Smoothed bytes/s from successive `done` samples while `active`; 0 otherwise. */
export function useRate(done: number, active: boolean): number {
  const last = useRef<{ t: number; d: number } | null>(null);
  const ema = useRef(0);
  const [rate, setRate] = useState(0);
  useEffect(() => {
    if (!active) {
      last.current = null;
      ema.current = 0;
      return;
    }
    const now = performance.now();
    const prev = last.current;
    if (!prev) {
      last.current = { t: now, d: done };
      return;
    }
    if (now - prev.t < 250) return;
    last.current = { t: now, d: done };
    const inst = ((done - prev.d) / (now - prev.t)) * 1000;
    ema.current = ema.current === 0 ? inst : ema.current * 0.7 + inst * 0.3;
    setRate(ema.current);
  }, [done, active]);
  return active ? rate : 0;
}
