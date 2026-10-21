import { describe, expect, it } from "vitest";
import { diagnoseFailure, parseCandidate, type CandidateInfo } from "./diagnose";

const host: CandidateInfo = { type: "host", mdns: false };
const mdnsHost: CandidateInfo = { type: "host", mdns: true };
const srflx: CandidateInfo = { type: "srflx", mdns: false };

describe("parseCandidate", () => {
  it("reads type and detects mDNS addresses", () => {
    expect(parseCandidate("candidate:1 1 udp 2113937151 192.168.0.5 5000 typ host generation 0")).toEqual(host);
    expect(parseCandidate("candidate:1 1 udp 2113937151 a1b2.local 5000 typ host")).toEqual(mdnsHost);
    expect(parseCandidate("a=candidate:2 1 udp 1677729535 1.2.3.4 5000 typ srflx raddr 0.0.0.0 rport 0")).toEqual(srflx);
  });
  it("rejects malformed lines", () => {
    expect(parseCandidate("")).toBeNull();
    expect(parseCandidate("candidate:1 1 udp x y typ weird")).toBeNull();
  });
});

describe("diagnoseFailure", () => {
  it("flags missing candidates on either side", () => {
    expect(diagnoseFailure({ local: [], remote: [host] })).toBe("no_local_candidates");
    expect(diagnoseFailure({ local: [host], remote: [] })).toBe("no_remote_candidates");
  });
  it("flags unresolvable mDNS-only remote hosts", () => {
    expect(diagnoseFailure({ local: [host, srflx], remote: [mdnsHost] })).toBe("mdns_unresolved");
  });
  it("flags host-only on both sides as no STUN / isolation", () => {
    expect(diagnoseFailure({ local: [host], remote: [host] })).toBe("no_stun");
  });
  it("flags srflx on both sides as NAT/firewall", () => {
    expect(diagnoseFailure({ local: [host, srflx], remote: [host, srflx] })).toBe("nat_or_firewall");
  });
  it("falls back to unknown", () => {
    expect(diagnoseFailure({ local: [host, srflx], remote: [host] })).toBe("unknown");
  });
});
