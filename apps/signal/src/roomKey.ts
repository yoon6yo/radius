/** Runtime-agnostic (no node:net) so Workers can share it; callers pass textual addresses only. */
const isIPv6 = (ip: string): boolean => ip.includes(":");

function expandIPv6(ip: string): string[] | null {
  const [head = "", tail, extra] = ip.split("::");
  if (extra !== undefined) return null;
  const h = head === "" ? [] : head.split(":");
  const t = tail === undefined || tail === "" ? [] : tail.split(":");
  if (tail === undefined) return h.length === 8 ? h : null;
  const fill = 8 - h.length - t.length;
  if (fill < 1) return null;
  return [...h, ...Array<string>(fill).fill("0"), ...t];
}

const LOCAL_ROOM = "local";

function isPrivateV4(ip: string): boolean {
  const [a = 0, b = 0] = ip.split(".").map(Number);
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

/**
 * Devices behind the same public address share a room. IPv6 collapses to its /64.
 * Loopback/private/link-local sources mean the server itself sits on the LAN, so they all share one room.
 */
export function roomKeyFor(ip: string): string {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  const v4 = mapped?.[1] ?? ip;
  if (!isIPv6(v4)) return isPrivateV4(v4) ? LOCAL_ROOM : v4;
  const groups = expandIPv6(v4.split("%")[0] ?? v4);
  if (!groups) return v4;
  const first = parseInt(groups[0] ?? "0", 16);
  const isLoopback = groups.slice(0, 7).every((g) => parseInt(g, 16) === 0) && parseInt(groups[7] ?? "0", 16) === 1;
  if (isLoopback || (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80) return LOCAL_ROOM;
  return groups
    .slice(0, 4)
    .map((g) => g.toLowerCase().padStart(4, "0"))
    .join(":");
}
