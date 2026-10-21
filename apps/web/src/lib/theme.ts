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
  return stored() ?? "light";
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
