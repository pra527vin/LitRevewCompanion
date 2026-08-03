import { createContext, useContext, ReactNode } from "react";
import { useBreakReminders } from "../useBreakReminders";
import { BreakReminderDef } from "../types";
import { BreakReminderToast } from "./BreakReminderToast";

interface BreakReminderControls {
  /** Shows a reminder right now without disturbing any countdown —
   * the scheduler page's "Preview reminder" button. */
  preview: (def: BreakReminderDef) => void;
}

const BreakReminderContext = createContext<BreakReminderControls | null>(null);

/** Available to anything rendered inside `BreakReminderProvider` —
 * in practice the scheduler page, which is the only thing that needs
 * to trigger a reminder by hand. */
export function useBreakReminderControls(): BreakReminderControls {
  const ctx = useContext(BreakReminderContext);
  if (!ctx) {
    throw new Error("useBreakReminderControls must be used within BreakReminderProvider");
  }
  return ctx;
}

/**
 * Owns the running reminder cycle and renders whichever reminder is
 * due, on top of whatever page is showing. Wraps the whole private
 * app shell (see `AppRoutes`'s `PrivateLayout`) rather than sitting
 * inside any one route, so the timers survive navigation — walking
 * from the reader to the library must not restart a countdown, and a
 * reminder has to be able to arrive while you're anywhere in the app,
 * not just on the scheduler page.
 */
export function BreakReminderProvider({ children }: { children: ReactNode }) {
  const { active, dismiss, preview } = useBreakReminders();

  return (
    <BreakReminderContext.Provider value={{ preview }}>
      {children}
      {active && <BreakReminderToast reminder={active} onDismiss={dismiss} />}
    </BreakReminderContext.Provider>
  );
}
