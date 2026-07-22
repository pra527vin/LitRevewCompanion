import "./ConfirmDialog.css";

export interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for anything destructive (the only case so far). */
  danger?: boolean;
  /** Disables both buttons and swaps the confirm label for a busy state
   * while the actual delete is in flight. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Shared in-app replacement for `window.confirm()` on every destructive
 * action (paper delete, workspace delete, category delete, excerpt
 * delete) — the native dialog can't be styled to match the app and
 * blocks the whole tab's JS while open. Lives in `shared/` since it's
 * used by library, workspace, settings, notebook, and synthesis, none
 * of which may depend on each other.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Remove",
  cancelLabel = "Cancel",
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div className="confirm-dialog__backdrop" onClick={onCancel}>
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="confirm-dialog__title">{title}</h3>
        <p className="confirm-dialog__message">{message}</p>
        <div className="confirm-dialog__actions">
          <button
            type="button"
            className="confirm-dialog__button confirm-dialog__button--cancel"
            onClick={onCancel}
            disabled={busy}
            autoFocus
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={
              "confirm-dialog__button " +
              (danger ? "confirm-dialog__button--danger" : "confirm-dialog__button--primary")
            }
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Removing…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
