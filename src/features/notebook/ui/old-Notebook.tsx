import { useEffect, useRef, useState } from "react";
import { AccordionSection } from "./AccordionSection";
import { MetadataSection } from "./MetadataSection";
import { NOTEBOOK_SECTION_DEFS, NotebookSectionId, NotebookNotesMap } from "../types";
import { notebookService } from "../service";
import { Paper } from "../../library";
import { annotationsService, Excerpt, formatExcerptPages } from "../../annotations";
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
  /** Bubbled straight up from MetadataSection — App.tsx owns
   * `activePaper` and is the only place that can actually refresh it
   * after a metadata edit. See MetadataSection's own doc comment. */
  onMetadataSaved: (updated: Paper) => void;
}

// Text editing is high-frequency (unlike reader page turns), so saves
// are debounced rather than firing on every keystroke.
const SAVE_DEBOUNCE_MS = 600;

export function Notebook({ paper, excerptsVersion, onViewSummary, onMetadataSaved }: NotebookProps) {
  const [openId, setOpenId] = useState<string>("metadata");
  const [notes, setNotes] = useState<NotebookNotesMap | null>(null);
  const [loading, setLoading] = useState(false);
  const [excerpts, setExcerpts] = useState<Excerpt[]>([]);

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

  async function handleRemoveExcerpt(excerptId: string) {
    setExcerpts((prev) => prev.filter((e) => e.id !== excerptId));
    try {
      await annotationsService.deleteExcerpt(excerptId);
    } catch {
      // Same best-effort rationale as handleAssign.
    }
  }

  if (!paper) {
    return (
      <div className="notebook">
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
          onClick={onViewSummary}
        >
          View Summary
        </button>
      </div>

      {unassigned.length > 0 && (
        <div className="notebook__unassigned">
          <h3 className="notebook__unassigned-title">
            Unassigned Highlights ({unassigned.length})
          </h3>
          {unassigned.map((excerpt) => (
            <div key={excerpt.id} className="excerpt-card">
              <div className="excerpt-card__top">
                <span className="excerpt-card__page">{formatExcerptPages(excerpt)}</span>
                <button
                  className="excerpt-card__remove"
                  onClick={() => handleRemoveExcerpt(excerpt.id)}
                  aria-label="Remove highlight"
                >
                  &times;
                </button>
              </div>
              <blockquote className="excerpt-card__quote">{excerpt.quote}</blockquote>
              {excerpt.userNote && (
                <p className="excerpt-card__note">{excerpt.userNote}</p>
              )}
              <select
                className="excerpt-card__assign"
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    handleAssign(excerpt.id, e.target.value as NotebookSectionId);
                  }
                }}
              >
                <option value="">Assign to section…</option>
                {NOTEBOOK_SECTION_DEFS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </div>
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
          return (
            <AccordionSection
              key={s.id}
              id={s.id}
              title={s.title}
              preview={content || (sectionExcerpts.length > 0 ? `${sectionExcerpts.length} highlight(s)` : "")}
              isOpen={openId === s.id}
              onToggle={handleToggle}
            >
              {sectionExcerpts.map((excerpt) => (
                <div key={excerpt.id} className="excerpt-card">
                  <div className="excerpt-card__top">
                    <span className="excerpt-card__page">{formatExcerptPages(excerpt)}</span>
                    <button
                      className="excerpt-card__remove"
                      onClick={() => handleRemoveExcerpt(excerpt.id)}
                      aria-label="Remove highlight"
                    >
                      &times;
                    </button>
                  </div>
                  <blockquote className="excerpt-card__quote">{excerpt.quote}</blockquote>
                  {excerpt.userNote && (
                    <p className="excerpt-card__note">{excerpt.userNote}</p>
                  )}
                </div>
              ))}
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
            </AccordionSection>
          );
        })}
      </div>
    </div>
  );
}
