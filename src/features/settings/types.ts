/** What the researcher picked in the Appearance section (or the
 * Toolbar's quick toggle) — "system" tracks the OS light/dark setting
 * live; "light"/"dark" pin it regardless of what the OS is doing. */
export type ThemePreference = "system" | "light" | "dark";

export type ResolvedTheme = "light" | "dark";

export const THEME_PREFERENCE_LABELS: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};
