import { describe, expect, it } from "vitest";
import { fromBase64Url, parseClientMsg, parseServerMsg, sanitizeName, toBase64Url } from "./index";

const ID = "a".repeat(64);

describe("base64url", () => {
  it("round-trips bytes including edge lengths", () => {
    for (const len of [0, 1, 2, 3, 32, 65]) {
      const bytes = Uint8Array.from({ length: len }, (_, i) => (i * 37) % 256);
      expect(fromBase64Url(toBase64Url(bytes))).toEqual(len === 0 ? null : bytes);
    }
  });
  it("rejects invalid characters", () => {
    expect(fromBase64Url("a+b/")).toBeNull();
  });
});

describe("sanitizeName", () => {
  it("trims and bounds", () => {
    expect(sanitizeName("  푸른 고래 ")).toBe("푸른 고래");
    expect(sanitizeName("")).toBeNull();
    expect(sanitizeName("x".repeat(33))).toBeNull();
    expect(sanitizeName("a\nb")).toBeNull();
  });
  it("rejects bidi and zero-width characters", () => {
    for (const c of ["\u202e", "\u2066", "\u200b", "\u200f", "\ufeff", "\u061c"]) {
      expect(sanitizeName(`ab${c}cd`)).toBeNull();
    }
  });
});

describe("parseClientMsg", () => {
  it("accepts valid messages", () => {
    expect(parseClientMsg({ t: "hello", pub: "abc", name: "n" })).toEqual({ t: "hello", pub: "abc", name: "n" });
    expect(parseClientMsg({ t: "signal", to: ID, data: { sdp: "x" } })).toEqual({ t: "signal", to: ID, data: { sdp: "x" } });
  });
  it("rejects malformed input", () => {
    for (const bad of [null, [], "x", {}, { t: "nope" }, { t: "hello", pub: "a b", name: "n" }, { t: "signal", to: "short", data: 1 }, { t: "signal", to: ID }, { t: "auth", sig: "" }]) {
      expect(parseClientMsg(bad)).toBeNull();
    }
  });
});

describe("parseServerMsg", () => {
  it("validates ready peers", () => {
    expect(parseServerMsg({ t: "ready", id: ID, peers: [{ id: ID, name: "n" }] })).not.toBeNull();
    expect(parseServerMsg({ t: "ready", id: ID, peers: [{ id: "x", name: "n" }] })).toBeNull();
  });
});
