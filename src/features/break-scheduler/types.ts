export type BreakReminderKey = "lookAway" | "water" | "stretch";

/** How long a reminder stays up before closing itself. Short on
 * purpose — it's a nudge, not something to be dealt with, and the
 * message is readable at a glance. Dismissing early (button,
 * backdrop, Escape) still works. Shared by the timer that closes it
 * and the countdown bar that shows it closing. */
export const REMINDER_AUTO_DISMISS_MS = 3000;

/** The fixed catalog of reminders — a closed set (not user-created),
 * so the definition (label, range, default) lives in code and only
 * the *choices* (on/off, chosen interval) are persisted per-user. */
export interface BreakReminderDef {
  key: BreakReminderKey;
  title: string;
  /** Shown under the title on the scheduler page. */
  description: string;
  /** Shown in the reminder popup itself when this one fires. */
  reminderBody: string;
  /** Interval bounds, in minutes. `step` is what the slider snaps to
   * and what the keyboard arrows move by. */
  minMinutes: number;
  maxMinutes: number;
  stepMinutes: number;
  defaultMinutes: number;
}

export const BREAK_REMINDERS: BreakReminderDef[] = [
  {
    key: "lookAway",
    title: "Look Away",
    description: "Rest your eyes on something twenty feet away for twenty seconds.",
    reminderBody: "Find a distant point and let your eyes settle there for twenty seconds.",
    minMinutes: 5,
    maxMinutes: 60,
    stepMinutes: 5,
    defaultMinutes: 20,
  },
  {
    key: "water",
    title: "Drink Water",
    description: "A few sips is enough — steady beats a litre at 4pm.",
    reminderBody: "Time for a few sips. Refill the glass while you're up.",
    minMinutes: 15,
    maxMinutes: 120,
    stepMinutes: 15,
    defaultMinutes: 45,
  },
  {
    key: "stretch",
    title: "Stretch / Walk",
    description: "Stand, roll the shoulders, take a short lap.",
    reminderBody: "Stand up, roll your shoulders, and take a short lap.",
    minMinutes: 20,
    maxMinutes: 180,
    stepMinutes: 10,
    defaultMinutes: 60,
  },
];

/** The persisted half — everything in `BREAK_REMINDERS` that a
 * researcher can actually change. `enabled` is the master switch;
 * turning it off deactivates the whole scheduler without losing the
 * per-reminder choices underneath it. */
export interface BreakSchedulerConfig {
  enabled: boolean;
  reminders: Record<BreakReminderKey, { enabled: boolean; intervalMinutes: number }>;
}

/** A motivational quote — from the API when reachable, from the
 * bundled fallback list otherwise (see `quoteService`). */
export interface Quote {
  text: string;
  author: string;
}

/** A reminder that's currently showing. `def` is what fired;
 * `quote` arrives a moment later (the fetch resolves after the popup
 * is already up) and is null until then. */
export interface ActiveReminder {
  def: BreakReminderDef;
  quote: Quote | null;
}
