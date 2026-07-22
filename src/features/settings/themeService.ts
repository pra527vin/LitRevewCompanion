import { ThemePreference, ResolvedTheme } from "./types";

/**
 * Appearance (Milestone 15 — Settings). A stored *preference*
 * ("system"/"light"/"dark", in `localStorage` — global to the browser
 * profile, not per-workspace, since it's about how the app looks, not
 * about any one research project) is resolved to an actual
 * "light"/"dark" and written onto `<html data-theme>`, which is what
 * `tokens.css`'s `:root[data-theme="dark"]` override actually reads.
 *
 * "system" is resolved here in JS rather than left to a
 * `prefers-color-scheme` media query in CSS, so there's exactly one
 * source of truth: the Settings page's picker and the Toolbar's quick
 * icon toggle both read/write the same stored preference through this
 * module and always agree on what's currently applied. `subscribe`
 * exists so React state (the Toolbar's icon, in particular — it shows
 * the *resolved* theme, not the preference) can stay in sync without
 * every caller re-registering its own `matchMedia` listener.
 */
const STORAGE_KEY = "litreview-theme-preference";

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolve(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? (systemPrefersDark() ? "dark" : "light") : preference;
}

function applyTheme(preference: ThemePreference): void {
  document.documentElement.setAttribute("data-theme", resolve(preference));
}

export const themeService = {
  getPreference(): ThemePreference {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
  },

  /** What's actually applied right now — "system" resolved to a real
   * light/dark. What the Toolbar's icon toggle shows and acts on. */
  getResolvedTheme(): ResolvedTheme {
    return resolve(themeService.getPreference());
  },

  /** Persists the preference, applies it immediately, and notifies
   * subscribers. */
  setPreference(preference: ThemePreference): void {
    localStorage.setItem(STORAGE_KEY, preference);
    applyTheme(preference);
    notify();
  },

  /** Applies whatever's currently stored — call once before the first
   * paint (see main.tsx) so there's no flash of the wrong theme. */
  applyStored(): void {
    applyTheme(themeService.getPreference());
  },

  /**
   * Registers a page-lifetime listener that re-applies the resolved
   * theme when the OS setting changes, but only while the stored
   * preference is actually "system" — an explicit "light"/"dark"
   * choice shouldn't move just because the OS did. Call once, from
   * main.tsx; there's no matching unsubscribe since this is meant to
   * live as long as the page does.
   */
  watchSystemChanges(): void {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (themeService.getPreference() === "system") {
        applyTheme("system");
        notify();
      }
    });
  },

  /** Notified whenever the resolved theme changes (a new preference,
   * or the OS setting moving while on "system"). Returns an
   * unsubscribe function. */
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
