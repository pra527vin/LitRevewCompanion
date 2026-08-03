import { BREAK_REMINDERS, BreakReminderKey, BreakSchedulerConfig } from "./types";

/**
 * The break scheduler's persisted settings. Stored in `localStorage`
 * — global to the browser profile rather than per-workspace, same
 * reasoning as `themeService`: how often you want to be told to
 * stretch isn't a property of any one research project.
 *
 * `subscribe` exists for the same reason it does there, too: the
 * scheduler page and the app-wide reminder host (which lives in a
 * different part of the tree entirely — see `useBreakReminders`) both
 * read this, and changing a setting on the page has to restart the
 * running timers immediately, not on the next reload.
 */
const STORAGE_KEY = "litreview-break-scheduler";

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

function defaultConfig(): BreakSchedulerConfig {
  const reminders = {} as BreakSchedulerConfig["reminders"];
  for (const def of BREAK_REMINDERS) {
    reminders[def.key] = {
      // Look Away and Drink Water start on; Stretch/Walk starts off,
      // so a first run nudges rather than nags.
      enabled: def.key !== "stretch",
      intervalMinutes: def.defaultMinutes,
    };
  }
  return { enabled: true, reminders };
}

/**
 * Rebuilds a config from whatever's in storage, field by field, rather
 * than trusting a parsed blob: stored settings outlive the code that
 * wrote them, so a reminder added to `BREAK_REMINDERS` later (absent
 * from an older stored object) has to fall back to its default, and a
 * stored interval has to be clamped in case its definition's range
 * has since narrowed.
 */
function parse(raw: string | null): BreakSchedulerConfig {
  const fallback = defaultConfig();
  if (!raw) return fallback;

  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    return fallback;
  }
  if (typeof stored !== "object" || stored === null) return fallback;

  const storedConfig = stored as Partial<BreakSchedulerConfig>;
  const config = defaultConfig();
  if (typeof storedConfig.enabled === "boolean") config.enabled = storedConfig.enabled;

  for (const def of BREAK_REMINDERS) {
    const entry = storedConfig.reminders?.[def.key];
    if (!entry) continue;
    if (typeof entry.enabled === "boolean") config.reminders[def.key].enabled = entry.enabled;
    if (typeof entry.intervalMinutes === "number" && Number.isFinite(entry.intervalMinutes)) {
      config.reminders[def.key].intervalMinutes = Math.min(
        def.maxMinutes,
        Math.max(def.minMinutes, entry.intervalMinutes),
      );
    }
  }
  return config;
}

function save(config: BreakSchedulerConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  notify();
}

export const breakSchedulerService = {
  getConfig(): BreakSchedulerConfig {
    return parse(localStorage.getItem(STORAGE_KEY));
  },

  /** The master switch — off deactivates the scheduler entirely
   * (no timers run, nothing pops up) without disturbing the
   * per-reminder choices underneath. */
  setEnabled(enabled: boolean): void {
    save({ ...breakSchedulerService.getConfig(), enabled });
  },

  setReminderEnabled(key: BreakReminderKey, enabled: boolean): void {
    const config = breakSchedulerService.getConfig();
    save({
      ...config,
      reminders: { ...config.reminders, [key]: { ...config.reminders[key], enabled } },
    });
  },

  /** Clamped to the reminder's own range here rather than trusting
   * the caller — the slider already respects it, but this is the one
   * place that writes the value. */
  setReminderInterval(key: BreakReminderKey, intervalMinutes: number): void {
    const def = BREAK_REMINDERS.find((d) => d.key === key);
    if (!def) return;
    const clamped = Math.min(def.maxMinutes, Math.max(def.minMinutes, intervalMinutes));
    const config = breakSchedulerService.getConfig();
    save({
      ...config,
      reminders: {
        ...config.reminders,
        [key]: { ...config.reminders[key], intervalMinutes: clamped },
      },
    });
  },

  /** Notified whenever any setting changes. Returns an unsubscribe. */
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
