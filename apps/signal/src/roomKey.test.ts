import { describe, expect, it } from "vitest";
import { roomKeyFor } from "./roomKey.ts";

describe("roomKeyFor", () => {
  it("keeps public IPv4 as is and unwraps mapped addresses", () => {
    expect(roomKeyFor("203.0.113.7")).toBe("203.0.113.7");
    expect(roomKeyFor("::ffff:203.0.113.7")).toBe("203.0.113.7");
  });
  it("collapses IPv6 to /64 regardless of notation", () => {
    const a = roomKeyFor("2001:db8:1:2:aaaa:bbbb:cccc:dddd");
    expect(a).toBe("2001:0db8:0001:0002");
    expect(roomKeyFor("2001:DB8:1:2::1")).toBe(a);
    expect(roomKeyFor("2001:db8:1:3::1")).not.toBe(a);
  });
  it("puts loopback, private and link-local sources in one local room", () => {
    for (const ip of ["127.0.0.1", "::1", "10.1.2.3", "172.16.0.9", "172.31.255.1", "192.168.0.5", "169.254.1.1", "::ffff:192.168.1.9", "fe80::1%eth0", "fd12:3456::1"]) {
      expect(roomKeyFor(ip)).toBe("local");
    }
  });
  it("does not treat neighbours of private ranges as private", () => {
    expect(roomKeyFor("172.15.0.1")).toBe("172.15.0.1");
    expect(roomKeyFor("172.32.0.1")).toBe("172.32.0.1");
    expect(roomKeyFor("100.64.0.1")).toBe("100.64.0.1");
  });
});
