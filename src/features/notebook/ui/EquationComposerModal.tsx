import { useEffect, useRef, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { EquationSymbolPicker } from "./EquationSymbolPicker";
import { RecentSymbolsBar } from "./RecentSymbolsBar";
import { EquationSymbol, loadRecentSymbols, recordRecentSymbol } from "../equationSymbols";
import "./EquationComposerModal.css";

export interface EquationComposerModalProps {
  initialValue: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}

/**
 * The Model Specification section's equation editor — a modal holding
 * all three pieces the feature asked for together: the LaTeX
 * textarea, its live KaTeX-rendered preview, and the symbol picker,
 * rather than spreading them across separate popovers/dialogs. Edits
 * happen on a local `draft`, not the section's actual saved value —
 * only "Save" calls back into `EquationEditor`, so closing without
 * saving (Cancel, backdrop click, Escape-via-×) can't leave the
 * accordion showing a half-finished equation.
 */
export function EquationComposerModal({
  initialValue,
  onSave,
  onCancel,
}: EquationComposerModalProps) {
  const [draft, setDraft] = useState(initialValue);
  const [recent, setRecent] = useState<EquationSymbol[]>(() => loadRecentSymbols());
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = previewRef.current;
    if (!node) return;
    if (!draft.trim()) {
      node.textContent = "Your equation will render here.";
      node.classList.add("equation-composer__preview--empty");
      return;
    }
    node.classList.remove("equation-composer__preview--empty");
    try {
      katex.render(draft, node, { throwOnError: false, displayMode: true });
    } catch {
      node.textContent = draft;
    }
  }, [draft]);

  /** Same cursor-tracking insert as before — reads/sets
   * `selectionStart`/`selectionEnd` directly rather than requiring
   * focus, so inserts from the symbol picker (which has the browser's
   * actual focus while its own inputs are used) still land in the
   * right place and chain correctly across several inserts in a row. */
  function insertSnippet(snippet: string) {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + snippet + draft.slice(end);
    setDraft(next);

    const placeholderIdx = snippet.indexOf("{}");
    const cursor = placeholderIdx >= 0 ? start + placeholderIdx + 1 : start + snippet.length;
    requestAnimationFrame(() => {
      el?.setSelectionRange(cursor, cursor);
    });
  }

  /** Shared by the symbol picker and the recent-symbols bar under the
   * preview — recording usage here (rather than in either of those
   * components) is what keeps them from disagreeing about what's
   * actually recent when a symbol gets used from one and then the
   * other in the same session. */
  function handleInsertSymbol(symbol: EquationSymbol) {
    setRecent(recordRecentSymbol(symbol));
    insertSnippet(symbol.insert);
  }

  return (
    <div className="equation-composer__backdrop" onClick={onCancel}>
      <div
        className="equation-composer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Edit equation"
      >
        <header className="equation-composer__header">
          <h3>Model Specification</h3>
          <button
            type="button"
            className="equation-composer__close"
            onClick={onCancel}
            aria-label="Close"
          >
            &times;
          </button>
        </header>

        <div className="equation-composer__body">
          <div className="equation-composer__editor-column">
            <label className="equation-composer__label" htmlFor="equation-composer-input">
              Equation (LaTeX)
            </label>
            <textarea
              id="equation-composer-input"
              ref={textareaRef}
              className="equation-composer__input"
              placeholder="e.g. y = \beta_0 + \beta_1 x + \epsilon"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
            />
            <div className="equation-composer__label">Preview</div>
            <div className="equation-composer__preview" ref={previewRef} />

            <RecentSymbolsBar symbols={recent} onInsert={handleInsertSymbol} />
          </div>

          <div className="equation-composer__symbols-column">
            <EquationSymbolPicker onInsert={handleInsertSymbol} />
          </div>
        </div>

        <footer className="equation-composer__footer">
          <button type="button" className="equation-composer__cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="equation-composer__save"
            onClick={() => onSave(draft)}
          >
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}
