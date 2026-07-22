import { useState } from "react";
import type { NotebookSectionDef, NotebookSectionId } from "../../notebook/types";
import { Excerpt, formatExcerptPages } from "../types";
import "./ExcerptCard.css";

export interface ExcerptCardAssignControl {
  value: NotebookSectionId | "";
  options: NotebookSectionDef[];
  onAssign: (section: NotebookSectionId) => void;
}

export interface ExcerptCardProps {
  excerpt: Excerpt;
  onRemove: (id: string) => void;
  /** Persists an edited quote/note. Omitted quote is rejected upstream
   * (see annotationsService.updateExcerpt) — this component also
   * disables Save on an empty quote so that never reaches the call. */
  onUpdate: (id: string, quote: string, userNote: string | null) => void;
  /** Present wherever the excerpt still needs a section chosen (the
   * Notebook's "Unassigned Highlights" list, and Synthesis's — omitted
   * where the excerpt is already shown inside its owning section. */
  assignControl?: ExcerptCardAssignControl;
  /** Scrolls the reader to this excerpt's page — omitted wherever
   * there's no reader alongside this card to jump in (Synthesis,
   * Paper Summary), present in the Notebook where the PDF sits right
   * next to it. Given the page badge itself rather than a whole extra
   * button, since it's already the thing labeled with the page number
   * a click would jump to. */
  onJumpToPage?: (pageNumber: number) => void;
}

/**
 * The excerpt card's edit mode is the "editing room" workflow: a
 * captured highlight and its note can be paraphrased or tightened up
 * directly, in place, rather than requiring a brand-new note to say
 * the same thing better. Two previously-duplicated read-only render
 * blocks (Notebook's unassigned list and its per-section list) are now
 * both this one component.
 */
export function ExcerptCard({
  excerpt,
  onRemove,
  onUpdate,
  assignControl,
  onJumpToPage,
}: ExcerptCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [quoteDraft, setQuoteDraft] = useState(excerpt.quote);
  const [noteDraft, setNoteDraft] = useState(excerpt.userNote ?? "");

  function startEdit() {
    setQuoteDraft(excerpt.quote);
    setNoteDraft(excerpt.userNote ?? "");
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
  }

  function saveEdit() {
    if (!quoteDraft.trim()) return;
    onUpdate(excerpt.id, quoteDraft, noteDraft.trim() || null);
    setIsEditing(false);
  }

  return (
    <div className="excerpt-card">
      <div className="excerpt-card__top">
        {onJumpToPage ? (
          <button
            type="button"
            className="excerpt-card__page excerpt-card__page--jump"
            onClick={() => onJumpToPage(excerpt.pageNumber)}
            title="Jump to this page in the reader"
          >
            {formatExcerptPages(excerpt)}
          </button>
        ) : (
          <span className="excerpt-card__page">{formatExcerptPages(excerpt)}</span>
        )}
        <div className="excerpt-card__actions">
          {!isEditing && (
            <button
              className="excerpt-card__edit"
              onClick={startEdit}
              aria-label="Edit highlight"
              type="button"
            >
              Edit
            </button>
          )}
          <button
            className="excerpt-card__remove"
            onClick={() => onRemove(excerpt.id)}
            aria-label="Remove highlight"
            type="button"
          >
            &times;
          </button>
        </div>
      </div>

      {isEditing ? (
        <div className="excerpt-card__edit-form">
          <textarea
            className="excerpt-card__quote-input"
            value={quoteDraft}
            onChange={(e) => setQuoteDraft(e.target.value)}
            placeholder="Highlighted text…"
            autoFocus
          />
          <textarea
            className="excerpt-card__note-input"
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Your note (optional)…"
          />
          <div className="excerpt-card__edit-actions">
            <button
              className="excerpt-card__save"
              onClick={saveEdit}
              disabled={!quoteDraft.trim()}
              type="button"
            >
              Save
            </button>
            <button className="excerpt-card__cancel" onClick={cancelEdit} type="button">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <blockquote className="excerpt-card__quote">{excerpt.quote}</blockquote>
          {excerpt.userNote && <p className="excerpt-card__note">{excerpt.userNote}</p>}
        </>
      )}

      {assignControl && (
        <select
          className="excerpt-card__assign"
          value={assignControl.value}
          onChange={(e) => {
            if (e.target.value) {
              assignControl.onAssign(e.target.value as NotebookSectionId);
            }
          }}
        >
          <option value="">Assign to section…</option>
          {assignControl.options.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
