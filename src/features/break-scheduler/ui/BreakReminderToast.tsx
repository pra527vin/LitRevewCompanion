import { useEffect } from "react";
import { ActiveReminder, REMINDER_AUTO_DISMISS_MS } from "../types";
import "./BreakReminderToast.css";

export interface BreakReminderToastProps {
  reminder: ActiveReminder;
  onDismiss: () => void;
}

/**
 * The reminder itself — a centered card over a dimmed backdrop,
 * shown wherever the researcher is when a break comes due. Closes
 * itself after `REMINDER_AUTO_DISMISS_MS` (the countdown bar along
 * the bottom shows that happening, so it doesn't read as a glitch);
 * "Got it", the backdrop, and Escape all dismiss it early. The
 * closing itself is the timer's job, not this component's — see
 * `useBreakReminders`.
 *
 * The quote area holds its height while `reminder.quote` is still
 * loading (see `useBreakReminders`' fetch), so the card doesn't jump
 * a moment after it appears.
 */
export function BreakReminderToast({ reminder, onDismiss }: BreakReminderToastProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onDismiss]);

  const { def, quote } = reminder;

  return (
    <div className="break-toast__backdrop" onClick={onDismiss}>
      <div
        className="break-toast"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Break reminder"
      >
        <div className="break-toast__eyebrow">Reminder</div>
        <div className="break-toast__pulse-ring" aria-hidden>
          <span className="break-toast__pulse-dot" />
        </div>
        <h2 className="break-toast__title">{def.title}</h2>
        <p className="break-toast__body">{def.reminderBody}</p>

        <div className={"break-toast__quote" + (quote ? " break-toast__quote--ready" : "")}>
          {quote && (
            <>
              <p className="break-toast__quote-text">“{quote.text}”</p>
              <p className="break-toast__quote-author">{quote.author}</p>
            </>
          )}
        </div>

        <button type="button" className="break-toast__dismiss" onClick={onDismiss} autoFocus>
          Got it
        </button>

        <div className="break-toast__countdown" aria-hidden>
          <span
            className="break-toast__countdown-bar"
            style={{ animationDuration: `${REMINDER_AUTO_DISMISS_MS}ms` }}
          />
        </div>
      </div>
    </div>
  );
}
