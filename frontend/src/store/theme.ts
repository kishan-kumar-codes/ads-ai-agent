import { create } from "zustand";

type Theme = "light" | "dark";

interface ThemeStore {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

const THEME_STORAGE_KEY = "ads-ai-agent-theme";

function readInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";

  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "light" || saved === "dark") return saved;

  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;

  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

const initial: Theme =
  readInitialTheme();

applyTheme(initial);

export const useTheme = create<ThemeStore>((set) => ({
  theme: initial,
  toggle: () =>
    set((s) => {
      const next: Theme = s.theme === "light" ? "dark" : "light";
      applyTheme(next);
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
      return { theme: next };
    }),
  setTheme: (t) => {
    applyTheme(t);
    window.localStorage.setItem(THEME_STORAGE_KEY, t);
    set({ theme: t });
  },
}));
