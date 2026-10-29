import { afterEach, describe, expect, it, vi } from "vitest";
import { currentTheme, watchSystemTheme } from "./theme";

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

describe("watchSystemTheme", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("re-applies and reports when the system scheme changes, and unsubscribes", () => {
    let fire = () => {};
    const removed = vi.fn();
    let dark = false;
    const toggle = vi.fn();
    vi.stubGlobal("localStorage", { getItem: () => null });
    vi.stubGlobal("document", { documentElement: { classList: { toggle } } });
    vi.stubGlobal("window", {
      matchMedia: () => ({
        get matches() {
          return dark;
        },
        addEventListener: (_: string, h: () => void) => (fire = h),
        removeEventListener: removed,
      }),
    });
    const seen: string[] = [];
    const off = watchSystemTheme((t) => seen.push(t));
    dark = true;
    fire();
    expect(seen).toEqual(["dark"]);
    expect(toggle).toHaveBeenLastCalledWith("dark", true);
    off();
    expect(removed).toHaveBeenCalled();
  });
});
