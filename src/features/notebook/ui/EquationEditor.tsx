import { useMemo, useState } from "react";
import { EquationComposerModal } from "./EquationComposerModal";
import { EquationCard } from "./EquationCard";
import { ConfirmDialog } from "../../../shared/ConfirmDialog";
import { EquationEntry, parseEquationList, serializeEquationList } from "../equationList";
import { equationExportService, EquationExportFormat } from "../equationExport";
import "./EquationEditor.css";

export interface EquationEditorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/** What the composer modal is open for — a brand new equation, or an
 * edit of one already in the list (by id, so Save knows which entry
 * to replace). */
type ComposerState = { mode: "add" } | { mode: "edit"; id: string; initialValue: string };

/**
 * The Model Specification section — a *list* of equations (Design
 * note: research papers often specify several related equations, e.g.
 * a system's structural form plus its reduced form), each with its
 * own Edit/Remove/Copy (LaTeX source, or a native editable Word
 * equation via MathML — both straight to the clipboard, see
 * `equationExport.ts`). `content` in
 * `notebook_notes` stores that list JSON-encoded (see
 * `equationList.ts`) — the section's storage is still just the one
 * TEXT column every other section uses.
 *
 * Editing itself still happens in `EquationComposerModal` (textarea +
 * live preview + symbol picker) — this component only manages the
 * list around it: which equation is being added/edited, and the
 * remove confirmation.
 */
export function EquationEditor({ value, onChange, disabled }: EquationEditorProps) {
  const equations = useMemo(() => parseEquationList(value), [value]);

  const [composerState, setComposerState] = useState<ComposerState | null>(null);
  const [pendingRemove, setPendingRemove] = useState<EquationEntry | null>(null);
  const [exportingKey, setExportingKey] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  function persist(next: EquationEntry[]) {
    onChange(serializeEquationList(next));
  }

  function handleSaveComposer(latex: string) {
    if (!composerState) return;
    if (composerState.mode === "add") {
      if (latex.trim()) {
        persist([...equations, { id: crypto.randomUUID(), latex }]);
      }
    } else {
      persist(equations.map((e) => (e.id === composerState.id ? { ...e, latex } : e)));
    }
    setComposerState(null);
  }

  function confirmRemove() {
    if (!pendingRemove) return;
    persist(equations.filter((e) => e.id !== pendingRemove.id));
    setPendingRemove(null);
  }

  async function handleExport(entry: EquationEntry, format: EquationExportFormat) {
    const key = `${entry.id}:${format}`;
    if (exportingKey) return;
    setExportingKey(key);
    setStatusMessage(null);
    try {
      if (format === "latex") {
        await equationExportService.copyLatex(entry.latex);
        setStatusMessage("Copied LaTeX to clipboard.");
      } else {
        await equationExportService.copyForWord(entry.latex);
        setStatusMessage("Copied as a Word equation — paste directly into a Word doc.");
      }
    } catch (e) {
      setStatusMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setExportingKey(null);
    }
  }

  return (
    <div className="equation-editor">
      {equations.map((entry, index) => (
        <EquationCard
          key={entry.id}
          entry={entry}
          index={index}
          onEdit={() => setComposerState({ mode: "edit", id: entry.id, initialValue: entry.latex })}
          onRemove={() => setPendingRemove(entry)}
          onExport={(format) => handleExport(entry, format)}
          exportingFormat={
            exportingKey?.startsWith(`${entry.id}:`)
              ? (exportingKey.split(":")[1] as EquationExportFormat)
              : null
          }
        />
      ))}

      <button
        type="button"
        className="equation-editor__add"
        onClick={() => setComposerState({ mode: "add" })}
        disabled={disabled}
      >
        + Add Equation
      </button>

      {statusMessage && <p className="equation-editor__status">{statusMessage}</p>}

      {composerState && (
        <EquationComposerModal
          initialValue={composerState.mode === "edit" ? composerState.initialValue : ""}
          onSave={handleSaveComposer}
          onCancel={() => setComposerState(null)}
        />
      )}

      {pendingRemove && (
        <ConfirmDialog
          title="Remove equation?"
          message="Remove this equation from the Model Specification list? This can't be undone."
          confirmLabel="Remove"
          onConfirm={confirmRemove}
          onCancel={() => setPendingRemove(null)}
        />
      )}
    </div>
  );
}
