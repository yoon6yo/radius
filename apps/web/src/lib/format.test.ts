import { describe, expect, it } from "vitest";
import { formatBytes } from "./format";

describe("formatBytes", () => {
  it("formats boundaries", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(10 * 1024 * 1024)).toBe("10 MB");
    expect(formatBytes(100_000_000)).toBe("95 MB");
  });
  it("caps at TB", () => {
    expect(formatBytes(2 * 1024 ** 5)).toBe("2048 TB");
  });
});
