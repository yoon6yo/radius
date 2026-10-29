import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { currentTheme, toggleTheme } from "@/lib/theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState(currentTheme);
  return (
    <button
      type="button"
      aria-label={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
      onClick={() => setTheme(toggleTheme())}
      className="absolute right-5 top-[max(2.5rem,env(safe-area-inset-top))] grid size-11 place-items-center rounded-full text-muted-foreground hover:text-foreground"
    >
      {theme === "dark" ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
    </button>
  );
}
