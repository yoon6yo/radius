import { MAX_SIGNAL_BYTES } from "@radius/protocol";
import type { RtcSignal } from "./types";

const MAX_CANDIDATE_LENGTH = 2048;

/** Deterministic role split: the lexicographically smaller id yields on offer collisions. */
export function isPolite(selfId: string, peerId: string): boolean {
  return selfId < peerId;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function parseRtcSignal(raw: unknown): RtcSignal | null {
  if (!isRecord(raw)) return null;
  if (raw.t === "sdp") {
    const d = raw.description;
    if (!isRecord(d)) return null;
    if (d.type !== "offer" && d.type !== "answer") return null;
    if (typeof d.sdp !== "string" || d.sdp.length === 0 || d.sdp.length > MAX_SIGNAL_BYTES) {
      return null;
    }
    return { t: "sdp", description: { type: d.type, sdp: d.sdp } };
  }
  if (raw.t === "ice") {
    if (raw.candidate === null) return { t: "ice", candidate: null };
    const c = raw.candidate;
    if (!isRecord(c)) return null;
    if (typeof c.candidate !== "string" || c.candidate.length > MAX_CANDIDATE_LENGTH) return null;
    const out: RTCIceCandidateInit = { candidate: c.candidate };
    if (c.sdpMid === null || typeof c.sdpMid === "string") out.sdpMid = c.sdpMid;
    if (c.sdpMLineIndex === null || typeof c.sdpMLineIndex === "number") {
      out.sdpMLineIndex = c.sdpMLineIndex;
    }
    if (typeof c.usernameFragment === "string") out.usernameFragment = c.usernameFragment;
    return { t: "ice", candidate: out };
  }
  return null;
}
