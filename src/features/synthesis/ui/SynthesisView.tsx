import { useEffect, useRef, useState } from "react";
import {
  NOTEBOOK_SECTION_DEFS,
  NotebookSectionId,
  NotebookNotesMap,
  notebookService,
  parseEquationList,
} from "../../notebook";
import { annotationsService, Excerpt, ExcerptCard } from "../../annotations";
import { Paper } from "../../library";
import { ConfirmDialog } from "../../../shared/ConfirmDialog";
import "./SynthesisView.css";

export interface SynthesisViewProps {
  paper: Paper;
  /** Same "App.tsx bumps this whenever the reader saves a new
   * highlight" contract as Notebook's own prop — see App.tsx. */
  excerptsVersion: number;
  onClose: () => void;
}

const SAVE_DEBOUNCE_MS = 600;

/**
 * The "editing room": every section's free-text notes and every
 * assigned (or still-unassigned) excerpt for the current paper, all
 * open and all editable at once — not the accordion browsing view
 * Notebook is, and not the read-only assembled view Paper Summary is.
 * This is deliberately where paraphrasing/tightening prose and
 * excerpts happens right before an export, so nothing here needs a
 * trip back into the reader or the Notebook's collapsed sections.
 *
 * Reuses notebookService/annotationsService directly rather than
 * paperSummaryService.buildSummary — buildSummary drops sections with
 * no content, which is right for a summary but wrong here: an empty
 * section is still something the editing room should let you write
 * into, and unassigned excerpts (which buildSummary doesn't surface
 * at all) still need a home before export.
 */
export function SynthesisView({ paper, excerptsVersion, onClose }: SynthesisViewProps) {
  const [notes, setNotes] = useState<NotebookNotesMap | null>(null);
  const [excerpts, setExcerpts] = useState<Excerpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

  const pendingTimers = useRef<
    Partial<Record<NotebookSectionId, ReturnType<typeof setTimeout>>>
  >({});
  const latestNotes = useRef<NotebookNotesMap | null>(null);

  function flushPending() {
    const currentNotes = latestNotes.current;
    if (!currentNotes) return;
    for (const [section, timer] of Object.entries(pendingTimers.current)) {
      if (!timer) continue;
      clearTimeout(timer);
      notebookService
        .saveNote(paper.id, section as NotebookSectionId, currentNotes[section as NotebookSectionId])
        .catch(() => {});
    }
    pendingTimers.current = {};
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([notebookService.loadNotes(paper.id), annotationsService.listExcerpts(paper.id)]).then(
      ([loadedNotes, loadedExcerpts]) => {
        if (cancelled) return;
        setNotes(loadedNotes);
        latestNotes.current = loadedNotes;
        setExcerpts(loadedExcerpts);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper.id, excerptsVersion]);

  useEffect(() => {
    return () => flushPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleNoteChange(section: NotebookSectionId, value: string) {
    if (!notes) return;
    const next = { ...notes, [section]: value };
    setNotes(next);
    latestNotes.current = next;

    const timers = pendingTimers.current;
    if (timers[section]) clearTimeout(timers[section]);
    timers[section] = setTimeout(() => {
      notebookService.saveNote(paper.id, section, value).catch(() => {});
      delete timers[section];
    }, SAVE_DEBOUNCE_MS);
  }

  async function handleAssign(excerptId: string, section: NotebookSectionId) {
    setExcerpts((prev) => prev.map((e) => (e.id === excerptId ? { ...e, section } : e)));
    try {
      await annotationsService.reassignExcerpt(excerptId, section);
    } catch {
      // Best-effort, same rationale as Notebook's handleAssign.
    }
  }

  function handleRemoveExcerpt(excerptId: string) {
    setPendingRemoveId(excerptId);
  }

  async function confirmRemoveExcerpt() {
    if (!pendingRemoveId) return;
    const excerptId = pendingRemoveId;
    setPendingRemoveId(null);
    setExcerpts((prev) => prev.filter((e) => e.id !== excerptId));
    try {
      await annotationsService.deleteExcerpt(excerptId);
    } catch {
      // Best-effort, same rationale as Notebook's handleRemoveExcerpt.
    }
  }

  async function handleUpdateExcerpt(id: string, quote: string, userNote: string | null) {
    setExcerpts((prev) => prev.map((e) => (e.id === id ? { ...e, quote, userNote } : e)));
    try {
      await annotationsService.updateExcerpt(id, quote, userNote);
    } catch {
      // Best-effort, same rationale as Notebook's handleUpdateExcerpt.
    }
  }

  const unassigned = excerpts.filter((e) => e.section === null);
  const pendingRemoveExcerpt = excerpts.find((e) => e.id === pendingRemoveId) ?? null;

  return (
    <>
      <div className="synthesis__backdrop" onClick={onClose}>
      <div
        className="synthesis"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Synthesis"
      >
        <header className="synthesis__header">
          <div>
            <h2>Synthesis</h2>
            <p className="synthesis__subtitle">{paper.title || "Untitled"}</p>
          </div>
          <button className="synthesis__close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </header>

        <div className="synthesis__body">
          {loading && <p className="synthesis__status">Loading…</p>}

          {!loading && unassigned.length > 0 && (
            <section className="synthesis__section">
              <h3>Unassigned Highlights ({unassigned.length})</h3>
              {unassigned.map((excerpt) => (
                <ExcerptCard
                  key={excerpt.id}
                  excerpt={excerpt}
                  onRemove={handleRemoveExcerpt}
                  onUpdate={handleUpdateExcerpt}
                  assignControl={{
                    value: "",
                    options: NOTEBOOK_SECTION_DEFS,
                    onAssign: (section) => handleAssign(excerpt.id, section),
                  }}
                />
              ))}
            </section>
          )}

          {!loading &&
            NOTEBOOK_SECTION_DEFS.map((def) => {
              const sectionExcerpts = excerpts.filter((e) => e.section === def.id);
              return (
                <section key={def.id} className="synthesis__section">
                  <h3>{def.title}</h3>
                  {def.id === "model-specification" ? (
                    // Its content is a JSON-encoded equation list (see
                    // equationList.ts), not prose — exposing that as a
                    // freely-editable textarea here risks corrupting
                    // it, so this is a read-only pointer back to the
                    // Notebook's own Model Specification editor.
                    <p className="synthesis__status">
                      {(() => {
                        const count = parseEquationList(notes?.[def.id] ?? "").length;
                        return count > 0
                          ? `${count} equation${count === 1 ? "" : "s"} — edit in the Notebook's Model Specification section.`
                          : "No equations yet — add them in the Notebook's Model Specification section.";
                      })()}
                    </p>
                  ) : (
                    <textarea
                      className="synthesis__textarea"
                      placeholder={`Notes on ${def.title.toLowerCase()}…`}
                      value={notes?.[def.id] ?? ""}
                      onChange={(e) => handleNoteChange(def.id, e.target.value)}
                    />
                  )}
                  {sectionExcerpts.map((excerpt) => (
                    <ExcerptCard
                      key={excerpt.id}
                      excerpt={excerpt}
                      onRemove={handleRemoveExcerpt}
                      onUpdate={handleUpdateExcerpt}
                      assignControl={{
                        value: def.id,
                        options: NOTEBOOK_SECTION_DEFS,
                        onAssign: (section) => handleAssign(excerpt.id, section),
                      }}
                    />
                  ))}
                </section>
              );
            })}
        </div>
      </div>
      </div>

      {pendingRemoveExcerpt && (
        <ConfirmDialog
          title="Remove highlight?"
          message="Remove this highlight and its note? This can't be undone."
          confirmLabel="Remove"
          onConfirm={confirmRemoveExcerpt}
          onCancel={() => setPendingRemoveId(null)}
        />
      )}
    </>
  );
}
