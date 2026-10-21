import { compress, decompress, init } from "@bokuweb/zstd-wasm";
import type { Codec } from "@radius/engine";

const LEVEL = 1;
const MAGIC = [0x28, 0xb5, 0x2f, 0xfd];

let ready: Promise<void> | null = null;
const load = () => (ready ??= init().catch((e: unknown) => ((ready = null), Promise.reject(e))));

/**
 * Declared content size of a zstd frame, or null when absent/malformed.
 * Read before decompressing: the wasm allocates whatever the (untrusted) header claims.
 */
export function zstdContentSize(b: Uint8Array): number | null {
  if (b.length < 6 || MAGIC.some((m, i) => b[i] !== m)) return null;
  const fhd = b[4]!;
  const fcsFlag = fhd >> 6;
  const single = (fhd & 0x20) !== 0;
  const at = 5 + (single ? 0 : 1) + [0, 1, 2, 4][fhd & 3]!;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const len = fcsFlag === 0 ? (single ? 1 : 0) : 1 << fcsFlag;
  if (len === 0 || at + len > b.length) return null;
  if (len === 1) return b[at]!;
  if (len === 2) return dv.getUint16(at, true) + 256;
  if (len === 4) return dv.getUint32(at, true);
  const n = dv.getBigUint64(at, true);
  return n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : null;
}

export const zstdCodec: Codec = {
  async compress(data) {
    await load();
    return new Uint8Array(compress(data, LEVEL));
  },
  async decompress(data, expectedLength) {
    await load();
    if (zstdContentSize(data) !== expectedLength) throw new Error("zstd_size_mismatch");
    const out = decompress(data);
    if (out.length !== expectedLength) throw new Error("zstd_size_mismatch");
    return out;
  },
};
