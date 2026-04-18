import { create } from "zustand";
import * as api from "../lib/tauri";
import {
  DEFAULT_SETTINGS,
  type Settings,
  type TerminalPref,
  type ThemePref,
} from "../types";

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  load: () => Promise<void>;
  update: (partial: Partial<Settings>) => Promise<void>;
}

function parseInt10(v: string | undefined, fallback: number): number {
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function asTerminal(v: string | undefined): TerminalPref {
  if (v === "wt" || v === "git-bash" || v === "cmd") return v;
  return "auto";
}

function asTheme(v: string | undefined): ThemePref {
  if (v === "light" || v === "system") return v;
  return "dark";
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function hydrate(raw: Record<string, string>): Settings {
  return {
    terminal: asTerminal(raw.terminal),
    refreshIntervalSec: parseInt10(
      raw.refresh_interval_sec,
      DEFAULT_SETTINGS.refreshIntervalSec,
    ),
    defaultReposDir: raw.default_repos_dir ?? null,
    theme: asTheme(raw.theme),
    bulkConcurrency: clamp(
      parseInt10(raw.bulk_concurrency, DEFAULT_SETTINGS.bulkConcurrency),
      1,
      16,
    ),
  };
}

const KEY_MAP: Record<keyof Settings, string> = {
  terminal: "terminal",
  refreshIntervalSec: "refresh_interval_sec",
  defaultReposDir: "default_repos_dir",
  theme: "theme",
  bulkConcurrency: "bulk_concurrency",
};

function applyTheme(theme: ThemePref) {
  const prefersDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", prefersDark);
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,

  async load() {
    try {
      const keys = Object.values(KEY_MAP);
      const values = await Promise.all(keys.map((k) => api.getSetting(k)));
      const raw: Record<string, string> = {};
      keys.forEach((k, i) => {
        const v = values[i];
        if (v !== null && v !== undefined) raw[k] = v;
      });
      const settings = hydrate(raw);
      set({ settings, loaded: true });
      applyTheme(settings.theme);
    } catch {
      set({ loaded: true });
      applyTheme(DEFAULT_SETTINGS.theme);
    }
  },

  async update(partial) {
    const next = { ...get().settings, ...partial };
    set({ settings: next });
    if (partial.theme !== undefined) applyTheme(next.theme);
    await Promise.all(
      (Object.keys(partial) as (keyof Settings)[]).map((k) => {
        const v = next[k];
        const raw =
          v === null || v === undefined ? "" : typeof v === "number" ? String(v) : String(v);
        return api.setSetting(KEY_MAP[k], raw);
      }),
    );
  },
}));
