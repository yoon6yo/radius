import { describe, expect, it } from "vitest";
import {
  BLOCK_SIZE,
  FRAME_HEADER_BYTES,
  MAX_OFFER_FILES,
  MAX_PATH_LENGTH,
  MAX_PAYLOAD_BYTES,
  blockCount,
  MAX_HAVE_CHARS,
  decodeFrame,
  MAX_MESSAGE_BYTES,
  encodeWarmupFrame,
  decodeHave,
  encodeHave,
  encodeFrame,
  isSafePath,
  parseTransferMsg,
  toBase64Url,
} from "./index.ts";

const hash = toBase64Url(new Uint8Array(32).fill(7));

describe("frame codec", () => {
  it("round-trips header and payload", () => {
    const h = { flags: 0xff, fileIdx: 65535, transferId: 0xffff_ffff, blockIdx: 123456, offset: BLOCK_SIZE - 1 };
    const f = decodeFrame(encodeFrame(h, new Uint8Array([1, 2, 3])));
    expect(f?.header).toEqual(h);
    expect([...(f?.payload ?? [])]).toEqual([1, 2, 3]);
  });
  it("warm-up frames are max-size and not decodable as data", () => {
    const w = encodeWarmupFrame();
    expect(w.byteLength).toBe(MAX_MESSAGE_BYTES);
    expect(decodeFrame(w)).toBeNull();
  });
  it("accepts max payload, rejects larger", () => {
    const h = { flags: 0, fileIdx: 0, transferId: 1, blockIdx: 0, offset: 0 };
    const ok = encodeFrame(h, new Uint8Array(MAX_PAYLOAD_BYTES));
    expect(decodeFrame(ok)).not.toBeNull();
    expect(() => encodeFrame(h, new Uint8Array(MAX_PAYLOAD_BYTES + 1))).toThrow(RangeError);
  });
  it("rejects header-only, oversize and wrong type", () => {
    expect(decodeFrame(new ArrayBuffer(FRAME_HEADER_BYTES))).toBeNull();
    expect(decodeFrame(new ArrayBuffer(65537))).toBeNull();
    expect(decodeFrame(new ArrayBuffer(20))).toBeNull();
  });
});

describe("isSafePath", () => {
  it("accepts relative paths", () => {
    expect(isSafePath("a.txt")).toBe(true);
    expect(isSafePath("dir/sub/a.txt")).toBe(true);
    expect(isSafePath("a".repeat(255))).toBe(true);
    expect(isSafePath(`${"a".repeat(200)}/${"b".repeat(MAX_PATH_LENGTH - 201)}`)).toBe(true);
  });
  it("rejects unsafe paths", () => {
    for (const p of ["", "/etc/passwd", "../x", "a/../b", "a//b", "a/", ".", "a\\b", "a\u0000b", "a".repeat(256), `${"a".repeat(200)}/${"b".repeat(MAX_PATH_LENGTH - 200)}`, 5]) {
      expect(isSafePath(p)).toBe(false);
    }
  });
});

describe("parseTransferMsg", () => {
  it("parses offer and enforces limits", () => {
    expect(parseTransferMsg({ t: "offer", id: 1, files: [{ path: "a", size: 0 }] })).toEqual({
      t: "offer",
      id: 1,
      files: [{ path: "a", size: 0 }],
    });
    const many = Array.from({ length: MAX_OFFER_FILES + 1 }, (_, i) => ({ path: `f${i}`, size: 1 }));
    expect(parseTransferMsg({ t: "offer", id: 1, files: many })).toBeNull();
    expect(parseTransferMsg({ t: "offer", id: 1, files: [] })).toBeNull();
    expect(parseTransferMsg({ t: "offer", id: 1, files: [{ path: "../a", size: 1 }] })).toBeNull();
    expect(parseTransferMsg({ t: "offer", id: 1, files: [{ path: "a", size: -1 }] })).toBeNull();
    expect(parseTransferMsg({ t: "offer", id: 1, files: [{ path: "a", size: 1.5 }] })).toBeNull();
  });
  it("parses block messages", () => {
    expect(parseTransferMsg({ t: "bh", id: 2, f: 0, b: 3, h: hash })).toEqual({ t: "bh", id: 2, f: 0, b: 3, h: hash });
    expect(parseTransferMsg({ t: "bh", id: 2, f: 0, b: 3, h: "short" })).toBeNull();
    expect(parseTransferMsg({ t: "ack", id: 2, f: 65536, b: 0 })).toBeNull();
    expect(parseTransferMsg({ t: "nack", id: 2, f: 1, b: 0 })).toEqual({ t: "nack", id: 2, f: 1, b: 0 });
  });
  it("parses lifecycle messages", () => {
    expect(parseTransferMsg({ t: "reject", id: 1, reason: "no_space" })).toEqual({ t: "reject", id: 1, reason: "no_space" });
    expect(parseTransferMsg({ t: "reject", id: 1, reason: "busy" })).not.toBeNull();
    expect(parseTransferMsg({ t: "reject", id: 1, reason: "x" })).toBeNull();
    expect(parseTransferMsg({ t: "done", id: 1, root: hash })).not.toBeNull();
    expect(parseTransferMsg({ t: "complete", id: 1, ok: "yes" })).toBeNull();
    expect(parseTransferMsg({ t: "cancel", id: 1 })).toEqual({ t: "cancel", id: 1 });
  });
  it("rejects bad ids, unknown types and non-objects", () => {
    expect(parseTransferMsg({ t: "accept", id: -1 })).toBeNull();
    expect(parseTransferMsg({ t: "accept", id: 2 ** 32 })).toBeNull();
    expect(parseTransferMsg({ t: "x", id: 1 })).toBeNull();
    expect(parseTransferMsg(null)).toBeNull();
  });
});

describe("blockCount", () => {
  it("handles boundaries", () => {
    expect(blockCount(0)).toBe(0);
    expect(blockCount(1)).toBe(1);
    expect(blockCount(BLOCK_SIZE)).toBe(1);
    expect(blockCount(BLOCK_SIZE + 1)).toBe(2);
  });
});

describe("have bitmap", () => {
  it("round-trips, incl. non-multiple-of-8 and empty", () => {
    for (const n of [0, 1, 8, 9, 100]) {
      const bits = Array.from({ length: n }, (_, i) => i % 3 === 0);
      expect(decodeHave(encodeHave(bits), n)).toEqual(bits);
    }
  });
  it("rejects a bitmap of the wrong length or alphabet", () => {
    expect(decodeHave(encodeHave([true]), 9)).toBeNull();
    expect(decodeHave("!!", 1)).toBeNull();
  });
  it("parses accept with have and rejects malformed/oversize have", () => {
    const have = [encodeHave([true, false])];
    expect(parseTransferMsg({ t: "accept", id: 1, have })).toEqual({ t: "accept", id: 1, have });
    expect(parseTransferMsg({ t: "accept", id: 1, have: ["", ...have] })).not.toBeNull();
    expect(parseTransferMsg({ t: "accept", id: 1, have: "x" })).toBeNull();
    expect(parseTransferMsg({ t: "accept", id: 1, have: [1] })).toBeNull();
    expect(parseTransferMsg({ t: "accept", id: 1, have: ["a".repeat(MAX_HAVE_CHARS + 4)] })).toBeNull();
    expect(parseTransferMsg({ t: "accept", id: 1, have: new Array(MAX_OFFER_FILES + 1).fill("") })).toBeNull();
  });
});
