import { describe, expect, it } from "vitest";
import { zstdCodec, zstdContentSize } from "./zstdCodec";

describe("zstdCodec", () => {
  it("round-trips and shrinks repetitive data", async () => {
    const data = new Uint8Array(1 << 20).fill(7);
    const packed = await zstdCodec.compress(data);
    expect(packed.length).toBeLessThan(data.length / 10);
    expect(zstdContentSize(packed)).toBe(data.length);
    expect(await zstdCodec.decompress(packed, data.length)).toEqual(data);
  });

  it("rejects a frame whose declared size differs from the block size", async () => {
    const packed = await zstdCodec.compress(new Uint8Array(1000).fill(1));
    await expect(zstdCodec.decompress(packed, 999)).rejects.toThrow("zstd_size_mismatch");
  });

  it("rejects garbage and truncated headers without allocating", async () => {
    expect(zstdContentSize(new Uint8Array([1, 2, 3]))).toBeNull();
    await expect(zstdCodec.decompress(new Uint8Array(32), 32)).rejects.toThrow();
  });
});
