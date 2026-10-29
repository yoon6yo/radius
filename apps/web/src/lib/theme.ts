export type Theme = "light" | "dark";

const KEY = "radius-theme";

function stored(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : null;
  } catch {
    return null;
  }
}

export function currentTheme(): Theme {
  return stored() ?? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}

export function applyTheme(): void {
  document.documentElement.classList.toggle("dark", currentTheme() === "dark");
}

export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* storage unavailable: toggle still applies for this page load */
  }
  applyTheme();
  return next;
}

/** Re-applies the theme when the OS scheme flips and nothing is stored; returns the unsubscribe. */
export function watchSystemTheme(onChange: (t: Theme) => void): () => void {
  const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
  if (!mq) return () => {};
  const h = () => {
    applyTheme();
    onChange(currentTheme());
  };
  mq.addEventListener("change", h);
  return () => mq.removeEventListener("change", h);
}
