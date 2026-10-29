import { describe, expect, it } from "vitest";
import { ASK_LEVELS, HUES, PERIODS, askLevels, peerWave, wavePath } from "./peerWave";

describe("peerWave", () => {
  it("is deterministic per id", () => {
    expect(peerWave("abc")).toEqual(peerWave("abc"));
  });
  it("stays inside the allowed ranges, empty id included", () => {
    for (const id of ["", "a", "peer-1", "x".repeat(200)]) {
      const w = peerWave(id);
      expect(HUES).toContain(w.hue);
      expect(PERIODS).toContain(w.period);
      expect(w.amp).toBeGreaterThan(0);
      expect(w.dur).toBeGreaterThan(0);
    }
  });
  it("gives different ids different waves", () => {
    const keys = new Set(["a", "b", "c", "d", "e", "f"].map((id) => JSON.stringify(peerWave(id))));
    expect(keys.size).toBeGreaterThan(2);
  });
});

describe("wavePath", () => {
  it("covers the width and keys each half-wave to its own height", () => {
    const d = wavePath(210, 40, 420, [1, 0.5]);
    expect(d).toBe("M0 20 C52.5 20 52.5 80 105 80 C157.5 80 157.5 20 210 20 C262.5 20 262.5 80 315 80 C367.5 80 367.5 20 420 20");
  });
});

describe("ASK_LEVELS", () => {
  it("level patterns span exactly one 420px slide", () => {
    for (const l of ASK_LEVELS) expect(420 % (210 / 2 * l.length)).toBe(0);
  });
});

describe("askLevels", () => {
  it("spans exactly one 420px slide for every period and pattern", () => {
    for (const period of PERIODS) {
      for (let ask = 0; ask < ASK_LEVELS.length; ask++) {
        expect((askLevels({ period, ask }).length * period) / 2).toBe(420);
      }
    }
  });
  it("picks any pattern, not only the first two", () => {
    const used = new Set(Array.from({ length: 200 }, (_, i) => peerWave(`p${i}`).ask));
    expect(used.size).toBe(ASK_LEVELS.length);
  });
});
