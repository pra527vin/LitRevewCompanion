import { useState } from "react";
import "./CurrentThoughtEditor.css";

export interface CurrentThoughtEditorProps {
  initialValue: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}

/**
 * Design_Decisions.md, Bottom Status Bar: "Clicking Current Thought
 * opens a small editor." This is that editor — a lightweight popover
 * anchored above the status bar's thought button (bottom-right of the
 * app shell), not a full modal, matching "a short reminder," not a
 * long-form note (General Notes/the notebook sections already cover
 * that).
 */
export function CurrentThoughtEditor({
  initialValue,
  onSave,
  onCancel,
}: CurrentThoughtEditorProps) {
  const [value, setValue] = useState(initialValue);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      onSave(value);
    } else if (e.key === "Escape") {
      onCancel();
    }
  }

  return (
    <div className="thought-editor__backdrop" onClick={onCancel}>
      <div
        className="thought-editor"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Current Thought"
      >
        <textarea
          className="thought-editor__input"
          placeholder="Where did you stop thinking?"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          rows={3}
        />
        <div className="thought-editor__actions">
          <button className="thought-editor__cancel" onClick={onCancel}>
            Cancel
          </button>
          <button className="thought-editor__save" onClick={() => onSave(value)}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
