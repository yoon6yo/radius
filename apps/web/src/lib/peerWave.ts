/** Wave periods that divide the 420px slide, so the loop is seamless. Short ones read as the whole wave sliding sideways, so none. */
export const PERIODS = [210, 420] as const;

/** Clean hues only (no olive/brown, none near the brand blue or violet). */
export const HUES = [18, 55, 150, 178, 205, 340] as const;

export interface PeerWave {
  /** oklch hue, one of HUES. */
  hue: (typeof HUES)[number];
  period: (typeof PERIODS)[number];
  amp: number;
  /** Seconds per 420px slide. */
  dur: number;
  /** Index into ASK_LEVELS for the busy-device key pattern. */
  ask: number;
}

/** Stable look for one peer: its own colour, frequency, height and speed. */
export function peerWave(id: string): PeerWave {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.codePointAt(0)!, 16777619) >>> 0;
  return {
    hue: HUES[h % HUES.length]!,
    period: PERIODS[(h >>> 9) % PERIODS.length]!,
    amp: 7 + ((h >>> 13) % 5) * 3,
    dur: 5 + ((h >>> 17) % 6),
    ask: (h >>> 21) % ASK_LEVELS.length,
  };
}

/** Key patterns (one per 420px, so the slide still loops): each half-wave gets its own height; the signal a busy device sends. */
export const ASK_LEVELS = [
  [1, 0.25, 0.7, 0.15],
  [0.35, 1, 0.2, 0.85],
  [0.8, 0.15, 1, 0.4],
] as const;

/** Peaks alternate up/down every half period; half-wave i peaks at levels[i % levels.length] * amp. Joins at the peaks have flat tangents, so unequal heights never kink. */
export function wavePath(period: number, amp: number, width: number, levels: readonly number[] = [1]): string {
  const half = period / 2;
  const peak = (i: number) => 60 + (i % 2 ? amp : -amp) * levels[i % levels.length]!;
  let d = `M0 ${peak(0)}`;
  for (let i = 0, x = 0; x < width; i++, x += half) d += ` C${x + half / 2} ${peak(i)} ${x + half / 2} ${peak(i + 1)} ${x + half} ${peak(i + 1)}`;
  return d;
}

/** The busy key pattern cut to whole half-waves of `period`, so it repeats every 420px slide and the loop stays seamless. */
export function askLevels(w: Pick<PeerWave, "period" | "ask">): readonly number[] {
  return ASK_LEVELS[w.ask]!.slice(0, 840 / w.period);
}
