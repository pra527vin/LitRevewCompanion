import { useEffect, useState } from "react";
import { breakSchedulerService } from "../service";
import { BREAK_REMINDERS, BreakReminderDef, BreakSchedulerConfig } from "../types";
import { useBreakReminderControls } from "./BreakReminderProvider";
import "./BreakSchedulerSettings.css";

function formatBound(minutes: number): string {
  return minutes >= 120 ? `${minutes / 60} hr` : `${minutes} min`;
}

/**
 * Settings → Break Reminders: a wellbeing scheduler for the long
 * sittings a literature review turns into. Three fixed reminders (see
 * `BREAK_REMINDERS`), each independently switchable with its own
 * interval, under one master switch that deactivates the lot.
 *
 * A section of the Settings page rather than a page of its own — it's
 * a handful of preferences you set once, which is exactly what that
 * page is for (somewhere to *spend* the break is the Refreshment
 * page's job instead). So this renders bare content, no header or
 * chrome, and `SettingsPage` supplies the heading around it.
 *
 * This only *edits* settings — it doesn't run the clock. The cycle
 * itself lives in `BreakReminderProvider`, mounted around the whole
 * app shell, so reminders keep arriving once you navigate away from
 * Settings (which is the normal case — you set this up and then go
 * read). Everything writes through `breakSchedulerService`, whose
 * subscribers include that provider, so a change here restarts the
 * live timers immediately.
 */
export function BreakSchedulerSettings() {
  const [config, setConfig] = useState<BreakSchedulerConfig>(() =>
    breakSchedulerService.getConfig(),
  );
  const { preview } = useBreakReminderControls();

  useEffect(
    () => breakSchedulerService.subscribe(() => setConfig(breakSchedulerService.getConfig())),
    [],
  );

  const activeReminders = BREAK_REMINDERS.filter((def) => config.reminders[def.key].enabled);
  // The one that fires most often — the closest thing to "what's
  // coming next" without exposing live countdowns the researcher
  // can't act on anyway.
  const soonest = [...activeReminders].sort(
    (a, b) => config.reminders[a.key].intervalMinutes - config.reminders[b.key].intervalMinutes,
  )[0];

  const masterCaption = !config.enabled
    ? "Paused — nothing will interrupt you."
    : activeReminders.length > 0
      ? `${activeReminders.length} of ${BREAK_REMINDERS.length} reminders active.`
      : "No reminders selected below.";

  return (
    <div className="break-settings">
      <div className="break-settings__master">
        <div>
          <div className="break-settings__master-title">Notifications</div>
          <div className="break-settings__master-caption">{masterCaption}</div>
        </div>
        <Toggle
          checked={config.enabled}
          onChange={(next) => breakSchedulerService.setEnabled(next)}
          label="Enable break reminders"
        />
      </div>

      <div
        className={
          "break-settings__list" + (config.enabled ? "" : " break-settings__list--disabled")
        }
      >
        {BREAK_REMINDERS.map((def) => (
          <ReminderCard
            key={def.key}
            def={def}
            enabled={config.reminders[def.key].enabled}
            intervalMinutes={config.reminders[def.key].intervalMinutes}
            masterEnabled={config.enabled}
          />
        ))}
      </div>

      <div className="break-settings__next-up">
        <div>
          <div className="break-settings__next-up-label">Most frequent</div>
          <div className="break-settings__next-up-value">
            {config.enabled && soonest
              ? `${soonest.title} · every ${config.reminders[soonest.key].intervalMinutes} minutes`
              : "Nothing scheduled"}
          </div>
        </div>
        <button
          type="button"
          className="break-settings__preview"
          onClick={() => preview(soonest ?? BREAK_REMINDERS[0])}
        >
          Preview reminder
        </button>
      </div>
    </div>
  );
}

function ReminderCard({
  def,
  enabled,
  intervalMinutes,
  masterEnabled,
}: {
  def: BreakReminderDef;
  enabled: boolean;
  intervalMinutes: number;
  masterEnabled: boolean;
}) {
  // Dimmed when this reminder is off *or* the master switch is —
  // either way it isn't going to fire.
  const live = enabled && masterEnabled;

  return (
    <section className="break-card">
      <div className="break-card__head">
        <div className="break-card__text">
          <div className="break-card__title">{def.title}</div>
          <div className="break-card__sub">{def.description}</div>
        </div>
        <Toggle
          checked={enabled}
          disabled={!masterEnabled}
          onChange={(next) => breakSchedulerService.setReminderEnabled(def.key, next)}
          label={`Enable "${def.title}" reminder`}
        />
      </div>

      <div className={"break-card__slider" + (live ? "" : " break-card__slider--muted")}>
        <div className="break-card__slider-head">
          <label className="break-card__slider-label" htmlFor={`break-interval-${def.key}`}>
            Remind me every
          </label>
          <div className="break-card__slider-value">
            <span className="break-card__slider-number">{intervalMinutes}</span>
            <span className="break-card__slider-unit">min</span>
          </div>
        </div>
        <input
          id={`break-interval-${def.key}`}
          type="range"
          className="break-card__range"
          min={def.minMinutes}
          max={def.maxMinutes}
          step={def.stepMinutes}
          value={intervalMinutes}
          disabled={!masterEnabled}
          onChange={(e) =>
            breakSchedulerService.setReminderInterval(def.key, Number(e.target.value))
          }
        />
        <div className="break-card__slider-bounds">
          <span>{formatBound(def.minMinutes)}</span>
          <span>{formatBound(def.maxMinutes)}</span>
        </div>
      </div>
    </section>
  );
}

/** A plain checkbox styled as a switch — keeps native keyboard
 * handling and `:focus-visible` instead of reimplementing either on a
 * `role="switch"` div. */
function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className={"break-toggle" + (disabled ? " break-toggle--disabled" : "")}>
      <input
        type="checkbox"
        className="break-toggle__input"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
      <span className="break-toggle__track" aria-hidden>
        <span className="break-toggle__knob" />
      </span>
    </label>
  );
}
