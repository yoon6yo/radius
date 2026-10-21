import { fromBase64Url } from "./index.ts";

export const BLOCK_SIZE = 4 * 1024 * 1024;
export const MAX_MESSAGE_BYTES = 64 * 1024;
export const FRAME_HEADER_BYTES = 16;
export const MAX_PAYLOAD_BYTES = MAX_MESSAGE_BYTES - FRAME_HEADER_BYTES;
export const MAX_OFFER_FILES = 150;
export const MAX_PATH_LENGTH = 256;
export const SHA256_BYTES = 32;

const FRAME_TYPE_DATA = 1;

export interface FileMeta {
  /** Relative, `/`-separated, validated by {@link isSafePath}. */
  path: string;
  size: number;
}

export type TransferMsg =
  | { t: "offer"; id: number; files: FileMeta[] }
  | { t: "accept"; id: number }
  | { t: "reject"; id: number; reason: RejectReason }
  | { t: "bh"; id: number; f: number; b: number; h: string }
  | { t: "ack"; id: number; f: number; b: number }
  | { t: "nack"; id: number; f: number; b: number }
  | { t: "done"; id: number; root: string }
  | { t: "complete"; id: number; ok: boolean }
  | { t: "cancel"; id: number };

export type RejectReason = "declined" | "no_space";

export interface FrameHeader {
  flags: number;
  fileIdx: number;
  transferId: number;
  blockIdx: number;
  /** Byte offset of the payload inside its block. */
  offset: number;
}

export interface Frame {
  header: FrameHeader;
  payload: Uint8Array;
}

const U16 = 0xffff;
const U32 = 0xffff_ffff;

function isU(v: unknown, max: number): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function blockCount(size: number): number {
  return Math.ceil(size / BLOCK_SIZE);
}

/** Rejects absolute paths, traversal, backslashes, control chars and oversize names. */
export function isSafePath(p: unknown): p is string {
  if (typeof p !== "string" || p.length === 0 || p.length > MAX_PATH_LENGTH) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(p)) return false;
  return p.split("/").every((s) => s.length > 0 && s.length <= 255 && s !== "." && s !== "..");
}

function isHash(v: unknown): v is string {
  if (typeof v !== "string" || v.length > 64) return false;
  return fromBase64Url(v)?.length === SHA256_BYTES;
}

export function parseTransferMsg(raw: unknown): TransferMsg | null {
  if (!isRecord(raw) || !isU(raw.id, U32)) return null;
  const id = raw.id;
  switch (raw.t) {
    case "offer": {
      if (!Array.isArray(raw.files) || raw.files.length === 0 || raw.files.length > MAX_OFFER_FILES) {
        return null;
      }
      const files: FileMeta[] = [];
      for (const f of raw.files as unknown[]) {
        if (!isRecord(f) || !isSafePath(f.path) || !isU(f.size, Number.MAX_SAFE_INTEGER)) return null;
        if (blockCount(f.size) > U32) return null;
        files.push({ path: f.path, size: f.size });
      }
      return { t: "offer", id, files };
    }
    case "accept":
      return { t: "accept", id };
    case "reject":
      return raw.reason === "declined" || raw.reason === "no_space"
        ? { t: "reject", id, reason: raw.reason }
        : null;
    case "bh":
      return isU(raw.f, U16) && isU(raw.b, U32) && isHash(raw.h)
        ? { t: "bh", id, f: raw.f, b: raw.b, h: raw.h }
        : null;
    case "ack":
    case "nack":
      return isU(raw.f, U16) && isU(raw.b, U32) ? { t: raw.t, id, f: raw.f, b: raw.b } : null;
    case "done":
      return isHash(raw.root) ? { t: "done", id, root: raw.root } : null;
    case "complete":
      return typeof raw.ok === "boolean" ? { t: "complete", id, ok: raw.ok } : null;
    case "cancel":
      return { t: "cancel", id };
    default:
      return null;
  }
}

/** Layout: u8 type | u8 flags | u16 fileIdx | u32 transferId | u32 blockIdx | u32 offset (big endian). */
export function encodeFrame(h: FrameHeader, payload: Uint8Array): ArrayBuffer {
  if (payload.length > MAX_PAYLOAD_BYTES) throw new RangeError("payload too large");
  const buf = new ArrayBuffer(FRAME_HEADER_BYTES + payload.length);
  const dv = new DataView(buf);
  dv.setUint8(0, FRAME_TYPE_DATA);
  dv.setUint8(1, h.flags);
  dv.setUint16(2, h.fileIdx);
  dv.setUint32(4, h.transferId);
  dv.setUint32(8, h.blockIdx);
  dv.setUint32(12, h.offset);
  new Uint8Array(buf, FRAME_HEADER_BYTES).set(payload);
  return buf;
}

export function decodeFrame(buf: ArrayBuffer): Frame | null {
  if (buf.byteLength <= FRAME_HEADER_BYTES || buf.byteLength > MAX_MESSAGE_BYTES) return null;
  const dv = new DataView(buf);
  if (dv.getUint8(0) !== FRAME_TYPE_DATA) return null;
  return {
    header: {
      flags: dv.getUint8(1),
      fileIdx: dv.getUint16(2),
      transferId: dv.getUint32(4),
      blockIdx: dv.getUint32(8),
      offset: dv.getUint32(12),
    },
    payload: new Uint8Array(buf, FRAME_HEADER_BYTES),
  };
}
