export type CandidateType = "host" | "srflx" | "prflx" | "relay";

export interface CandidateInfo {
  type: CandidateType;
  /** Address is an mDNS `.local` name the other side may not be able to resolve. */
  mdns: boolean;
}

export type FailureReason =
  | "no_local_candidates"
  | "no_remote_candidates"
  | "mdns_unresolved"
  | "no_stun"
  | "nat_or_firewall"
  | "unknown";

export interface DiagnoseInput {
  local: CandidateInfo[];
  remote: CandidateInfo[];
}

const SDP_CANDIDATE = /^(?:a=)?candidate:\S+ \d+ \S+ \d+ (\S+) \d+ typ (host|srflx|prflx|relay)\b/;

/** Parses an ICE candidate line; null for anything malformed. */
export function parseCandidate(line: string): CandidateInfo | null {
  const m = SDP_CANDIDATE.exec(line);
  if (!m) return null;
  return { type: m[2] as CandidateType, mdns: m[1]!.toLowerCase().endsWith(".local") };
}

const has = (list: CandidateInfo[], ...types: CandidateType[]) => list.some((c) => types.includes(c.type));

/**
 * Best guess why ICE failed, from the candidates both sides produced.
 * Without TURN a link can only fail for these reasons, so each maps to something the user can act on.
 */
export function diagnoseFailure({ local, remote }: DiagnoseInput): FailureReason {
  if (local.length === 0) return "no_local_candidates";
  if (remote.length === 0) return "no_remote_candidates";
  const remoteHostsAllMdns = remote.filter((c) => c.type === "host").every((c) => c.mdns);
  if (!has(remote, "srflx", "relay") && has(remote, "host") && remoteHostsAllMdns) return "mdns_unresolved";
  if (!has(local, "srflx", "relay") && !has(remote, "srflx", "relay")) return "no_stun";
  if (has(local, "srflx") && has(remote, "srflx")) return "nat_or_firewall";
  return "unknown";
}

/** Short, user-facing next step for each reason. */
export const FAILURE_HINTS: Record<FailureReason, string> = {
  no_local_candidates: "No network candidates on this device. Check Wi-Fi/VPN and browser network permissions.",
  no_remote_candidates: "The other device sent no network candidates. Ask them to reload and check their network.",
  mdns_unresolved:
    "The other device is hidden behind a local-name address this network cannot resolve. Join the same Wi-Fi without client isolation, or turn off isolation on the router.",
  no_stun:
    "Only local addresses were found. The Wi-Fi may isolate devices from each other, or the STUN server is blocked.",
  nat_or_firewall:
    "Both devices reached the internet but cannot connect directly (strict NAT or firewall). Try the same Wi-Fi or another network.",
  unknown: "Could not connect. Try again, or move both devices to the same Wi-Fi.",
};
