import { afterEach, describe, expect, it, vi } from "vitest";
import { currentTheme } from "./theme";

function stub(stored: string | null, dark: boolean) {
  vi.stubGlobal("localStorage", { getItem: () => stored });
  vi.stubGlobal("window", { matchMedia: () => ({ matches: dark }) });
}

describe("currentTheme", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("follows the system when nothing is stored", () => {
    stub(null, true);
    expect(currentTheme()).toBe("dark");
    stub(null, false);
    expect(currentTheme()).toBe("light");
  });

  it("prefers the stored choice over the system", () => {
    stub("light", true);
    expect(currentTheme()).toBe("light");
  });

  it("falls back to light without matchMedia", () => {
    vi.stubGlobal("localStorage", { getItem: () => null });
    vi.stubGlobal("window", {});
    expect(currentTheme()).toBe("light");
  });
});
