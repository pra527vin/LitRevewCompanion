import { useCallback, useEffect, useRef, useState } from "react";
import { breakSchedulerService } from "./service";
import { quoteService } from "./quoteService";
import {
  ActiveReminder,
  BREAK_REMINDERS,
  BreakReminderDef,
  BreakReminderKey,
  BreakSchedulerConfig,
  REMINDER_AUTO_DISMISS_MS,
} from "./types";

const TICK_MS = 1000;

/**
 * Runs the break-reminder cycle for as long as the app is open, and
 * reports whichever reminder is currently due. Mounted once, high in
 * the tree (see `AppRoutes`'s `PrivateLayout`), so reminders arrive
 * wherever the researcher happens to be — reading, in the library, on
 * the Progress page — rather than only while the scheduler page
 * itself is open.
 *
 * Each enabled reminder keeps its own next-due timestamp; a 1s tick
 * checks them rather than one `setTimeout` per reminder, so a setting
 * changed mid-cycle takes effect on the next tick with no timer
 * bookkeeping to unwind. Timestamps live in a ref, not state: they
 * change every time a reminder fires and nothing renders off them.
 *
 * Reminders never overlap or queue behind one another. Only one can
 * be on screen (it closes itself after `REMINDER_AUTO_DISMISS_MS`),
 * and when several fall due on the same tick — which the default
 * 20/45/60-minute intervals guarantee will happen — the longest one
 * wins and the rest have their countdowns restarted rather than being
 * held. See the tick below.
 */
export function useBreakReminders() {
  const [config, setConfig] = useState<BreakSchedulerConfig>(() =>
    breakSchedulerService.getConfig(),
  );
  const [active, setActive] = useState<ActiveReminder | null>(null);

  const dueAtRef = useRef<Partial<Record<BreakReminderKey, number>>>({});
  // Read by the tick to decide whether to hold a due reminder back;
  // a ref (not `active` itself) so the interval doesn't need
  // re-creating every time a popup opens or closes.
  const showingRef = useRef(false);
  // Guards against a slow quote fetch landing on a popup that's
  // already been dismissed (or replaced by a later reminder).
  const quoteTokenRef = useRef(0);
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    showingRef.current = active !== null;
  }, [active]);

  useEffect(() => {
    return () => {
      if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
    };
  }, []);

  useEffect(() => breakSchedulerService.subscribe(() => setConfig(breakSchedulerService.getConfig())), []);

  /** Restarts a reminder's countdown from now. */
  const scheduleFrom = useCallback((key: BreakReminderKey, intervalMinutes: number) => {
    dueAtRef.current[key] = Date.now() + intervalMinutes * 60 * 1000;
  }, []);

  const show = useCallback((def: BreakReminderDef) => {
    if (autoDismissRef.current) clearTimeout(autoDismissRef.current);
    setActive({ def, quote: null });

    const token = ++quoteTokenRef.current;
    quoteService.getQuote().then((quote) => {
      // Ignore a quote that arrived after this popup was dismissed
      // or superseded — `getQuote` never rejects, so this is the
      // only staleness check needed.
      if (quoteTokenRef.current !== token) return;
      setActive((current) => (current ? { ...current, quote } : current));
    });

    // Closes itself; nothing about a break reminder needs
    // acknowledging. Not written via `dismiss` so `show` doesn't
    // depend on it (and so the two can't churn each other's
    // identity through useCallback).
    autoDismissRef.current = setTimeout(() => {
      autoDismissRef.current = null;
      quoteTokenRef.current += 1;
      setActive(null);
    }, REMINDER_AUTO_DISMISS_MS);
  }, []);

  const dismiss = useCallback(() => {
    if (autoDismissRef.current) {
      clearTimeout(autoDismissRef.current);
      autoDismissRef.current = null;
    }
    quoteTokenRef.current += 1;
    setActive(null);
  }, []);

  /** The scheduler page's "Preview reminder" — shows one immediately
   * without touching any countdown, so previewing doesn't quietly
   * reset the real schedule. */
  const preview = useCallback((def: BreakReminderDef) => show(def), [show]);

  // (Re)seeds countdowns whenever settings change. A reminder that's
  // still enabled with an unchanged interval keeps its existing
  // deadline — otherwise toggling an unrelated reminder would restart
  // every other one's countdown from zero.
  useEffect(() => {
    if (!config.enabled) {
      dueAtRef.current = {};
      return;
    }
    const next: Partial<Record<BreakReminderKey, number>> = {};
    for (const def of BREAK_REMINDERS) {
      const setting = config.reminders[def.key];
      if (!setting.enabled) continue;
      const existing = dueAtRef.current[def.key];
      const maxDeadline = Date.now() + setting.intervalMinutes * 60 * 1000;
      // Clamped so a shortened interval takes effect now rather than
      // waiting out the longer deadline it was already holding.
      next[def.key] = existing !== undefined ? Math.min(existing, maxDeadline) : maxDeadline;
    }
    dueAtRef.current = next;
  }, [config]);

  useEffect(() => {
    if (!config.enabled) return;

    const timer = setInterval(() => {
      // Never stack popups — one is already up, so this tick does
      // nothing. Combined with the rescheduling below, this is what
      // keeps reminders from overlapping.
      if (showingRef.current) return;

      const now = Date.now();
      const due = BREAK_REMINDERS.filter((def) => {
        const setting = config.reminders[def.key];
        if (!setting.enabled) return false;
        const dueAt = dueAtRef.current[def.key];
        return dueAt !== undefined && now >= dueAt;
      });
      if (due.length === 0) return;

      // Intervals are multiples of one another in practice (20/45/60
      // by default), so several reminders regularly come due on the
      // same tick. The longest interval wins: a walk or a water break
      // supersedes a look-away rather than the two firing one after
      // the other.
      const winner = due.reduce((best, def) =>
        config.reminders[def.key].intervalMinutes > config.reminders[best.key].intervalMinutes
          ? def
          : best,
      );

      // Every reminder that was due — not just the winner — restarts
      // its countdown. The losers' turn is considered served by the
      // break that's about to be shown, instead of queueing up to pop
      // the moment this one closes.
      for (const def of due) {
        scheduleFrom(def.key, config.reminders[def.key].intervalMinutes);
      }
      show(winner);
    }, TICK_MS);

    return () => clearInterval(timer);
  }, [config, scheduleFrom, show]);

  return { active, dismiss, preview };
}
