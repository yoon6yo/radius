import { describe, expect, it } from "vitest";
import { formatEta } from "./transferText";

describe("formatEta", () => {
  it("is empty when rate or remaining is unknown", () => {
    expect(formatEta(100, 0)).toBe("");
    expect(formatEta(0, 10)).toBe("");
  });
  it("uses seconds under a minute", () => {
    expect(formatEta(10, 10)).toBe("약 1초");
    expect(formatEta(590, 10)).toBe("약 59초");
  });
  it("rounds to whole minutes without 60분", () => {
    expect(formatEta(3540, 1)).toBe("약 59분");
    expect(formatEta(3590, 1)).toBe("약 1시간");
  });
  it("never shows 60분 in the hour form", () => {
    expect(formatEta(3599 + 60, 1)).toBe("약 1시간 1분");
    expect(formatEta(7200, 1)).toBe("약 2시간");
  });
});
