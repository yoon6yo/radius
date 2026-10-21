# M7 bench (Chromium 153, main thread, 4 MiB blocks, 16 MiB/set run, best of 2-3)

Run: `npm i && PLAYWRIGHT_BROWSERS_PATH=... node run.mjs`

| Hash | MB/s |
|---|---|
| SHA-256 WebCrypto | 1538 |
| SHA-256 wasm | 370 |
| BLAKE3 wasm | 884 |

| set | algo | ratio | comp MB/s | decomp MB/s |
|---|---|---|---|---|
| text | deflate-raw native | 0.439 | 59 | 222 |
| text | zstd-1 wasm | 0.428 | 229 | 608 |
| text | zstd-3 wasm | 0.355 | 151 | 554 |
| mixed | deflate-raw native | 0.507 | 91 | 288 |
| mixed | zstd-1 wasm | 0.075 | 2500 | 1818 |
| random | deflate-raw native | 1.000 | 52 | 287 |
| random | zstd-1 wasm | 1.000 | 640 | 1019 |

Synthetic mixed set is far more compressible for zstd than real data (long-window repeats); ignore its ratio.

## Decision vs 1.5x rule
- BLAKE3 wasm: 0.57x of WebCrypto SHA-256 -> REJECT.
- zstd-1 wasm: 3.9x native deflate-raw on text, 6.4x on random (incompressible detection), equal ratio -> meets threshold.
