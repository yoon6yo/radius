import { describe, expect, it } from "vitest";
import { safeName, stripUnsafe } from "./exportOpfs";

describe("stripUnsafe", () => {
  it("drops control, bidi and zero-width chars", () => {
    expect(stripUnsafe("a\u0000b‮c​d e")).toBe("abcde");
  });
  it("collapses whitespace runs and trims", () => {
    expect(stripUnsafe("  report" + " ".repeat(200) + ".pdf ")).toBe("report .pdf");
  });
  it("handles empty", () => {
    expect(stripUnsafe("")).toBe("");
  });
});

describe("safeName", () => {
  it("returns short names unchanged", () => {
    expect(safeName("a.txt")).toBe("a.txt");
  });
  it("keeps name of exactly 128 chars", () => {
    const n = "a".repeat(124) + ".txt";
    expect(safeName(n)).toBe(n);
  });
  it("truncates the middle and keeps the real extension", () => {
    const n = "a".repeat(300) + ".pdf.exe";
    const out = safeName(n);
    expect(out.length).toBe(128);
    expect(out.endsWith(".pdf.exe")).toBe(true);
    expect(out).toContain("…");
  });
});
