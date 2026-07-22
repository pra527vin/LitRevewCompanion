import { useEffect, useRef, useState } from "react";
import { AccordionSection } from "./AccordionSection";
import { MetadataSection } from "./MetadataSection";
import { EquationEditor } from "./EquationEditor";
import { parseEquationList } from "../equationList";
import { NOTEBOOK_SECTION_DEFS, NotebookSectionId, NotebookNotesMap } from "../types";
import { notebookService } from "../service";
import { Paper } from "../../library";
import { annotationsService, Excerpt, ExcerptCard } from "../../annotations";
import { ConfirmDialog } from "../../../shared/ConfirmDialog";
import "./Notebook.css";

export interface NotebookProps {
  paper: Paper | null;
  /** Bumped by App.tsx whenever the reader saves a new highlight, so
   * this component knows to refetch excerpts for the active paper. */
  excerptsVersion: number;
  /** Notebook doesn't own the Paper Summary view itself — App.tsx does
   * (see this milestone's log for why: notebook -> paper-summary ->
   * notebook would otherwise be a real circular import). This just
   * bubbles the "open it" request up. */
  onViewSummary: () => void;
  /** Same ownership shape as `onViewSummary` — Synthesis reads across
   * notebook + annotations (and paper-summary's assembly logic), so
   * App.tsx owns the trigger to avoid a circular import. See
   * Synthesis's own doc comment. */
  onViewSynthesis: () => void;
  /** Bubbled straight up from MetadataSection — App.tsx owns
   * `activePaper` and is the only place that can actually refresh it
   * after a metadata edit. See MetadataSection's own doc comment. */
  onMetadataSaved: (updated: Paper) => void;
  /** Clicking an excerpt card's page badge asks the reader (its
   * sibling in MainLayout, which owns the actual bridging state) to
   * scroll there. */
  onJumpToPage: (pageNumber: number) => void;
  /** Collapses the drawer this sits in — MainLayout owns the actual
   * open/width state, same split of responsibility as LibrarySidebar's
   * own `onClose`. */
  onClose: () => void;
}

// Text editing is high-frequency (unlike reader page turns), so saves
// are debounced rather than firing on every keystroke.
const SAVE_DEBOUNCE_MS = 600;

export function Notebook({
  paper,
  excerptsVersion,
  onViewSummary,
  onViewSynthesis,
  onMetadataSaved,
  onJumpToPage,
  onClose,
}: NotebookProps) {
  const [openId, setOpenId] = useState<string>("metadata");
  const [notes, setNotes] = useState<NotebookNotesMap | null>(null);
  const [loading, setLoading] = useState(false);
  const [excerpts, setExcerpts] = useState<Excerpt[]>([]);
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

  // Tracks in-flight debounce timers per section, keyed by section id,
  // so a paper/component switch can flush anything still pending
  // instead of silently dropping the last few keystrokes.
  const pendingTimers = useRef<
    Partial<Record<NotebookSectionId, ReturnType<typeof setTimeout>>>
  >({});
  const activePaperId = useRef<string | null>(null);
  const latestNotes = useRef<NotebookNotesMap | null>(null);

  function flushPending() {
    const paperId = activePaperId.current;
    const currentNotes = latestNotes.current;
    if (!paperId || !currentNotes) return;

    for (const [section, timer] of Object.entries(pendingTimers.current)) {
      if (!timer) continue;
      clearTimeout(timer);
      notebookService
        .saveNote(paperId, section as NotebookSectionId, currentNotes[section as NotebookSectionId])
        .catch(() => {
          // Best-effort — matches the pattern used elsewhere for
          // background saves (storageClient.disconnect(), reader's
          // saveReadingState).
        });
    }
    pendingTimers.current = {};
  }

  // Load a new paper's notes whenever it changes, flushing any
  // pending saves for the *previous* paper first so switching papers
  // quickly can't lose an unsaved edit.
  useEffect(() => {
    flushPending();
    activePaperId.current = paper?.id ?? null;

    if (!paper) {
      setNotes(null);
      latestNotes.current = null;
      return;
    }

    let cancelled = false;
    setLoading(true);

    notebookService.loadNotes(paper.id).then((loaded) => {
      if (cancelled) return;
      setNotes(loaded);
      latestNotes.current = loaded;
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper?.id]);

  // Flush on unmount too (e.g. workspace switch removes the whole shell).
  useEffect(() => {
    return () => flushPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load excerpts whenever the paper changes OR the reader reports a
  // new highlight was saved (excerptsVersion). Separate from the
  // notes-loading effect above so saving a note doesn't trigger an
  // unnecessary excerpt refetch and vice versa.
  useEffect(() => {
    if (!paper) {
      setExcerpts([]);
      return;
    }
    let cancelled = false;
    annotationsService.listExcerpts(paper.id).then((loaded) => {
      if (!cancelled) setExcerpts(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [paper?.id, excerptsVersion]);

  function handleChange(section: NotebookSectionId, value: string) {
    if (!paper || !notes) return;

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

  function handleToggle(id: string) {
    setOpenId((current) => (current === id ? "" : id));
  }

  async function handleAssign(excerptId: string, section: NotebookSectionId) {
    setExcerpts((prev) =>
      prev.map((e) => (e.id === excerptId ? { ...e, section } : e)),
    );
    try {
      await annotationsService.reassignExcerpt(excerptId, section);
    } catch {
      // Best-effort optimistic update; a failed write here just means
      // the assignment won't survive a reload. Not surfaced as an
      // error — consistent with the app's other background saves.
    }
  }

  async function handleUpdateExcerpt(id: string, quote: string, userNote: string | null) {
    setExcerpts((prev) =>
      prev.map((e) => (e.id === id ? { ...e, quote, userNote } : e)),
    );
    try {
      await annotationsService.updateExcerpt(id, quote, userNote);
    } catch {
      // Best-effort, same rationale as handleAssign/handleRemoveExcerpt.
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
      // Same best-effort rationale as handleAssign.
    }
  }

  const pendingRemoveExcerpt = excerpts.find((e) => e.id === pendingRemoveId) ?? null;

  if (!paper) {
    return (
      <div className="notebook">
        <div className="notebook__header">
          <button
            className="notebook__collapse"
            onClick={onClose}
            aria-label="Collapse notebook"
            title="Collapse notebook"
          >
            &rsaquo;
          </button>
        </div>
        <div className="notebook__empty-state notebook__empty-state--full">
          Open a paper to start taking notes.
        </div>
      </div>
    );
  }

  const unassigned = excerpts.filter((e) => e.section === null);

  return (
    <div className="notebook">
      <div className="notebook__header">
        <button
          className="notebook__summary-button"
          onClick={onViewSynthesis}
        >
          Synthesis
        </button>
        <button
          className="notebook__summary-button"
          onClick={onViewSummary}
        >
          View Summary
        </button>
        <button
          className="notebook__collapse"
          onClick={onClose}
          aria-label="Collapse notebook"
          title="Collapse notebook"
        >
          &rsaquo;
        </button>
      </div>

      {unassigned.length > 0 && (
        <div className="notebook__unassigned">
          <h3 className="notebook__unassigned-title">
            Unassigned Highlights ({unassigned.length})
          </h3>
          {unassigned.map((excerpt) => (
            <ExcerptCard
              key={excerpt.id}
              excerpt={excerpt}
              onRemove={handleRemoveExcerpt}
              onUpdate={handleUpdateExcerpt}
              onJumpToPage={onJumpToPage}
              assignControl={{
                value: "",
                options: NOTEBOOK_SECTION_DEFS,
                onAssign: (section) => handleAssign(excerpt.id, section),
              }}
            />
          ))}
        </div>
      )}

      <div className="notebook__sections">
        <AccordionSection
          id="metadata"
          title="Metadata"
          preview={paper.title ?? paper.filePath}
          isOpen={openId === "metadata"}
          onToggle={handleToggle}
        >
          <MetadataSection paper={paper} onSaved={onMetadataSaved} />
        </AccordionSection>

        {NOTEBOOK_SECTION_DEFS.map((s) => {
          const content = notes?.[s.id] ?? "";
          const sectionExcerpts = excerpts.filter((e) => e.section === s.id);
          // model-specification's `content` is a JSON-encoded equation
          // list (see equationList.ts), not prose — the raw string
          // would be unreadable as an accordion preview.
          const preview =
            s.id === "model-specification"
              ? (() => {
                  const count = parseEquationList(content).length;
                  return count > 0 ? `${count} equation${count === 1 ? "" : "s"}` : "";
                })()
              : content || (sectionExcerpts.length > 0 ? `${sectionExcerpts.length} highlight(s)` : "");
          return (
            <AccordionSection
              key={s.id}
              id={s.id}
              title={s.title}
              preview={preview}
              isOpen={openId === s.id}
              onToggle={handleToggle}
            >
              {sectionExcerpts.map((excerpt) => (
                <ExcerptCard
                  key={excerpt.id}
                  excerpt={excerpt}
                  onRemove={handleRemoveExcerpt}
                  onUpdate={handleUpdateExcerpt}
                  onJumpToPage={onJumpToPage}
                />
              ))}
              {s.id === "model-specification" ? (
                <EquationEditor
                  value={content}
                  onChange={(next) => handleChange(s.id, next)}
                  disabled={loading}
                />
              ) : (
                <textarea
                  className={
                    s.id === "general-notes"
                      ? "notebook__scratchpad"
                      : "notebook__textarea"
                  }
                  placeholder={
                    s.id === "general-notes"
                      ? "Ideas that don't belong in a structured category yet…"
                      : `Notes on ${s.title.toLowerCase()}…`
                  }
                  value={content}
                  onChange={(e) => handleChange(s.id, e.target.value)}
                  disabled={loading}
                />
              )}
            </AccordionSection>
          );
        })}
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
    </div>
  );
}
