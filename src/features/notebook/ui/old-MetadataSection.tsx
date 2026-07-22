import { useEffect, useRef, useState } from "react";
import {
  Paper,
  libraryService,
  SourceType,
  SOURCE_TYPE_LABELS,
  CONTAINER_FIELD_LABELS,
} from "../../library";
import "./MetadataSection.css";

export interface MetadataSectionProps {
  paper: Paper;
  /** Called with the merged, up-to-date `Paper` after each successful
   * save (typed-field autosave or an applied citation lookup). Without
   * this, whoever's holding the `Paper` object above this component
   * — App.tsx's `activePaper` — never finds out it changed, so
   * anything reading `paper` elsewhere (Paper Summary's metadata
   * block, notably) keeps showing stale data even though the
   * database itself is correct. See this pass's bugfix log. */
  onSaved: (updated: Paper) => void;
}

interface FormState {
  title: string;
  authorsText: string;
  doi: string;
  journal: string;
  year: string;
  sourceType: SourceType | "";
  url: string;
}

const SOURCE_TYPE_OPTIONS = Object.entries(SOURCE_TYPE_LABELS) as [SourceType, string][];

// Typed edits autosave debounced, same convention as the free-text
// notebook sections. A lookup result is a discrete action, not typed
// text, so that path saves immediately instead (see handleLookup).
const SAVE_DEBOUNCE_MS = 600;

function formFromPaper(paper: Paper): FormState {
  return {
    title: paper.title ?? "",
    authorsText: paper.authors?.join(", ") ?? "",
    doi: paper.doi ?? "",
    journal: paper.journal ?? "",
    year: paper.year != null ? String(paper.year) : "",
    sourceType: paper.sourceType ?? "",
    url: paper.url ?? "",
  };
}

/**
 * The Metadata accordion section's content — editable catalog fields
 * plus a DOI-or-URL lookup. Milestone 06 rendered this as a read-only
 * <dl>; Milestone 08 added the DOI lookup. Post-Milestone-13 bugfix
 * pass: broadened for sources that aren't DOI-having journal articles
 * — a "Source Type" selector, a generic container/publisher field
 * (relabeled per type instead of a fixed "Journal"), a URL field, and
 * a lookup that accepts a page URL as well as a DOI (scraping citation
 * meta tags for pages without one — see lookup_citation in
 * src-tauri/src/features/library/mod.rs).
 */
export function MetadataSection({ paper, onSaved }: MetadataSectionProps) {
  const [form, setForm] = useState<FormState>(() => formFromPaper(paper));
  // The lookup field is deliberately its own bit of transient state,
  // not part of `form` — it's a search box ("what do I look up"), not
  // a persisted catalog field the way `doi`/`url` below it are. A
  // successful lookup writes its results into those persisted fields
  // directly; this box doesn't need to remember what was typed into it.
  const [lookupInput, setLookupInput] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const latestForm = useRef(form);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Holds the *previous* paper's full object (not just its id) until
  // the effect below re-points it — `save()` needs it to merge edited
  // fields back onto every field `Paper` has, not just the ones this
  // form edits.
  const paperRef = useRef(paper);

  function flush() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      void save(paperRef.current, latestForm.current);
    }
  }

  // Reset the form whenever a different paper is opened, flushing any
  // pending save for the previous one first (same pattern as
  // Notebook's flushPending for the free-text sections).
  useEffect(() => {
    flush();
    paperRef.current = paper;
    const next = formFromPaper(paper);
    setForm(next);
    latestForm.current = next;
    setLookupInput("");
    setLookupError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper.id]);

  useEffect(() => {
    return () => flush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(basePaper: Paper, values: FormState) {
    const authors = values.authorsText
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
    const yearNum = values.year.trim() ? Number(values.year.trim()) : NaN;

    const update = {
      title: values.title.trim() || null,
      authors: authors.length > 0 ? authors : null,
      doi: values.doi.trim() || null,
      journal: values.journal.trim() || null,
      year: Number.isNaN(yearNum) ? null : yearNum,
      sourceType: values.sourceType || null,
      url: values.url.trim() || null,
    };

    try {
      await libraryService.updateMetadata(basePaper.id, update);
      // The DB write only touches the catalog fields above — merge
      // them onto the rest of `basePaper` (id, filePath, fileHash,
      // pageCount, addedAt, lastOpenedAt) rather than constructing a
      // partial object, so callers always get a complete `Paper`.
      onSaved({ ...basePaper, ...update });
    } catch {
      // Best-effort, consistent with the rest of the app's autosave —
      // but only for the write itself. A failed write means onSaved
      // correctly doesn't fire, so nothing upstream mistakenly thinks
      // stale data is now current.
    }
  }

  function handleFieldChange(patch: Partial<FormState>) {
    const next = { ...form, ...patch };
    setForm(next);
    latestForm.current = next;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void save(paper, next);
    }, SAVE_DEBOUNCE_MS);
  }

  async function handleLookup() {
    const query = lookupInput.trim();
    if (!query) {
      setLookupError("Enter a DOI or a URL first.");
      return;
    }
    setLookingUp(true);
    setLookupError(null);
    try {
      const metadata = await libraryService.lookupCitation(query);
      const next: FormState = {
        title: metadata.title ?? form.title,
        authorsText:
          metadata.authors.length > 0 ? metadata.authors.join(", ") : form.authorsText,
        doi: metadata.doi ?? form.doi,
        journal: metadata.journal ?? form.journal,
        year: metadata.year != null ? String(metadata.year) : form.year,
        // Only guess a source type from a DOI hit (overwhelmingly
        // articles/proceedings on Crossref) and only if nothing's been
        // chosen yet — a bare URL scrape has no reliable signal for
        // report vs. working paper vs. webpage, so that's left for the
        // researcher to pick.
        sourceType: form.sourceType || (metadata.doi ? "article" : form.sourceType),
        url: metadata.url ?? form.url,
      };
      setForm(next);
      latestForm.current = next;

      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      await save(paper, next);
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : String(e));
    } finally {
      setLookingUp(false);
    }
  }

  const containerLabel = form.sourceType
    ? CONTAINER_FIELD_LABELS[form.sourceType]
    : "Journal / Publisher";

  return (
    <div className="metadata-form">
      <label className="metadata-form__field">
        <span>Source Type</span>
        <select
          value={form.sourceType}
          onChange={(e) => handleFieldChange({ sourceType: e.target.value as SourceType | "" })}
        >
          <option value="">Select type…</option>
          {SOURCE_TYPE_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="metadata-form__field">
        <span>Look Up (DOI or URL)</span>
        <div className="metadata-form__doi-row">
          <input
            value={lookupInput}
            onChange={(e) => setLookupInput(e.target.value)}
            placeholder="10.xxxx/xxxxx or https://…"
          />
          <button onClick={handleLookup} disabled={lookingUp} type="button">
            {lookingUp ? "Looking up…" : "Look Up"}
          </button>
        </div>
        {/* Not every citable source has a DOI, and not every page
         * publishes citation metadata — when the lookup comes up
         * empty, the DOI/URL/Title/etc. fields below stay right here,
         * editable, as the manual-entry fallback. */}
      </label>

      {lookupError && <p className="metadata-form__error">{lookupError}</p>}

      <label className="metadata-form__field">
        <span>Title</span>
        <input
          value={form.title}
          onChange={(e) => handleFieldChange({ title: e.target.value })}
        />
      </label>

      <label className="metadata-form__field">
        <span>Authors</span>
        <input
          value={form.authorsText}
          onChange={(e) => handleFieldChange({ authorsText: e.target.value })}
          placeholder="Comma-separated"
        />
      </label>

      <label className="metadata-form__field">
        <span>{containerLabel}</span>
        <input
          value={form.journal}
          onChange={(e) => handleFieldChange({ journal: e.target.value })}
        />
      </label>

      <label className="metadata-form__field">
        <span>DOI</span>
        <input
          value={form.doi}
          onChange={(e) => handleFieldChange({ doi: e.target.value })}
          placeholder="10.xxxx/xxxxx (optional)"
        />
      </label>

      <label className="metadata-form__field">
        <span>URL</span>
        <input
          value={form.url}
          onChange={(e) => handleFieldChange({ url: e.target.value })}
          placeholder="Link to the source online (optional)"
        />
      </label>

      <label className="metadata-form__field">
        <span>Year</span>
        <input
          value={form.year}
          onChange={(e) => handleFieldChange({ year: e.target.value })}
          inputMode="numeric"
        />
      </label>
    </div>
  );
}
