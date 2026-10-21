import { describe, expect, it } from "vitest";
import { MAX_SIGNAL_BYTES } from "@radius/protocol";
import { isPolite, parseRtcSignal, sdpFingerprint } from "./negotiation";

describe("isPolite", () => {
  it("is asymmetric", () => {
    expect(isPolite("a", "b")).toBe(true);
    expect(isPolite("b", "a")).toBe(false);
  });
  it("is impolite against itself", () => {
    expect(isPolite("a", "a")).toBe(false);
  });
});

describe("parseRtcSignal", () => {
  it("accepts offer/answer", () => {
    expect(parseRtcSignal({ t: "sdp", description: { type: "offer", sdp: "v=0" } })).toEqual({
      t: "sdp",
      description: { type: "offer", sdp: "v=0" },
    });
  });
  it("rejects bad sdp", () => {
    expect(parseRtcSignal({ t: "sdp", description: { type: "pranswer", sdp: "v=0" } })).toBeNull();
    expect(parseRtcSignal({ t: "sdp", description: { type: "offer", sdp: "" } })).toBeNull();
    expect(parseRtcSignal({ t: "sdp", description: { type: "offer", sdp: 1 } })).toBeNull();
    expect(parseRtcSignal({ t: "sdp" })).toBeNull();
  });
  it("enforces sdp size boundary", () => {
    const ok = "x".repeat(MAX_SIGNAL_BYTES);
    expect(parseRtcSignal({ t: "sdp", description: { type: "offer", sdp: ok } })).not.toBeNull();
    expect(
      parseRtcSignal({ t: "sdp", description: { type: "offer", sdp: ok + "x" } }),
    ).toBeNull();
  });
  it("accepts ice and end-of-candidates", () => {
    expect(parseRtcSignal({ t: "ice", candidate: null })).toEqual({ t: "ice", candidate: null });
    expect(
      parseRtcSignal({ t: "ice", candidate: { candidate: "c", sdpMid: "0", sdpMLineIndex: 0, extra: 1 } }),
    ).toEqual({ t: "ice", candidate: { candidate: "c", sdpMid: "0", sdpMLineIndex: 0 } });
  });
  it("rejects bad ice and non-objects", () => {
    expect(parseRtcSignal({ t: "ice", candidate: { candidate: 5 } })).toBeNull();
    expect(parseRtcSignal({ t: "ice", candidate: { candidate: "x".repeat(2049) } })).toBeNull();
    expect(parseRtcSignal({ t: "ice" })).toBeNull();
    expect(parseRtcSignal(null)).toBeNull();
    expect(parseRtcSignal("sdp")).toBeNull();
    expect(parseRtcSignal({ t: "other" })).toBeNull();
  });
});

describe("sdpFingerprint", () => {
  it("extracts a normalized fingerprint or null", () => {
    expect(sdpFingerprint("v=0\r\na=fingerprint:sha-256 AB:CD\r\na=setup:actpass")).toBe("sha-256 ab:cd");
    expect(sdpFingerprint("v=0\r\n")).toBeNull();
  });
});
