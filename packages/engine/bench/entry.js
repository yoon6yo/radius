import { blake3, sha256 as wasmSha256 } from "hash-wasm";
import { init as zstdInit, compress as zstdCompress, decompress as zstdDecompress } from "@bokuweb/zstd-wasm";

const BLOCK = 4 * 1024 * 1024;
const BLOCKS = 16; // 64 MiB per dataset

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s ^= s << 13), (s ^= s >>> 17), (s ^= s << 5), (s >>> 0));
}

function random(n, seed) {
  const r = rng(seed);
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 4) new DataView(out.buffer).setUint32(i, r());
  return out;
}

function text(n, seed) {
  const r = rng(seed);
  const words = Array.from({ length: 4000 }, () =>
    Array.from({ length: 2 + (r() % 9) }, () => String.fromCharCode(97 + (r() % 26))).join(""),
  );
  const out = new Uint8Array(n);
  let p = 0;
  while (p < n) {
    const w = words[r() % words.length] + (r() % 12 === 0 ? ".\n" : " ");
    for (let i = 0; i < w.length && p < n; i++) out[p++] = w.charCodeAt(i);
  }
  return out;
}

/** Alternating 64 KiB runs of structured (repeating records) and random bytes. */
function mixed(n, seed) {
  const r = rng(seed);
  const out = new Uint8Array(n);
  const run = 64 * 1024;
  for (let o = 0; o < n; o += run) {
    const end = Math.min(o + run, n);
    if ((o / run) % 2 === 0) {
      const rec = new Uint8Array(48).map(() => r() & 0xff);
      for (let i = o; i < end; i++) out[i] = rec[i % 48] ^ ((i >> 8) & 3);
    } else out.set(random(end - o, r()), o);
  }
  return out;
}

const blocksOf = (buf) => Array.from({ length: BLOCKS }, (_, i) => buf.subarray(i * BLOCK, (i + 1) * BLOCK));

async function drain(readable) {
  const parts = [];
  let total = 0;
  for await (const c of readable) (parts.push(c), (total += c.length));
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of parts) (out.set(c, o), (o += c.length));
  return out;
}

async function nativeStream(Ctor, format, data) {
  const s = new Blob([data]).stream().pipeThrough(new Ctor(format));
  return drain(s);
}

async function time(fn) {
  const t = performance.now();
  await fn();
  return performance.now() - t;
}

const mbps = (bytes, ms) => (bytes / 1048576) / (ms / 1000);

async function best(runs, fn) {
  let min = Infinity;
  for (let i = 0; i < runs; i++) min = Math.min(min, await time(fn));
  return min;
}

window.runBench = async () => {
  await zstdInit("/zstd.wasm");
  const sets = {
    text: text(BLOCK * BLOCKS, 1),
    mixed: mixed(BLOCK * BLOCKS, 2),
    random: random(BLOCK * BLOCKS, 3),
  };
  const total = BLOCK * BLOCKS;
  const rows = [];

  // Hashing is content-independent: measure once on random data.
  const hb = blocksOf(sets.random);
  const hashRows = [
    ["SHA-256 WebCrypto", async () => { for (const b of hb) await crypto.subtle.digest("SHA-256", b); }],
    ["SHA-256 wasm (hash-wasm)", async () => { for (const b of hb) await wasmSha256(b); }],
    ["BLAKE3 wasm (hash-wasm)", async () => { for (const b of hb) await blake3(b); }],
  ];
  const hash = [];
  for (const [name, fn] of hashRows) hash.push({ name, mbps: mbps(total, await best(3, fn)) });

  for (const [set, buf] of Object.entries(sets)) {
    const bs = blocksOf(buf);
    const algos = [
      {
        name: "deflate-raw native",
        c: (b) => nativeStream(CompressionStream, "deflate-raw", b),
        d: (b) => nativeStream(DecompressionStream, "deflate-raw", b),
      },
      { name: "zstd-1 wasm", c: async (b) => zstdCompress(b, 1), d: async (b) => zstdDecompress(b) },
      { name: "zstd-3 wasm", c: async (b) => zstdCompress(b, 3), d: async (b) => zstdDecompress(b) },
    ];
    for (const a of algos) {
      const packed = [];
      const cMs = await best(2, async () => {
        packed.length = 0;
        for (const b of bs) packed.push(await a.c(b));
      });
      const outBytes = packed.reduce((n, p) => n + p.length, 0);
      const dMs = await best(2, async () => { for (const p of packed) await a.d(p); });
      rows.push({ set, name: a.name, ratio: outBytes / total, cMBps: mbps(total, cMs), dMBps: mbps(total, dMs) });
    }
  }
  return { hash, rows, wasm: { zstdBytes: null } };
};
