import { useEffect, useRef, useState } from "react";
import { Paper } from "../../library";
import { searchService } from "../service";
import { SearchResult, SearchResultKind } from "../types";
import "./SearchPanel.css";

export interface SearchPanelProps {
  onClose: () => void;
  /** Same contract the Library panel and Literature Matrix use — a
   * result's paper opens straight into the reader via App.tsx's
   * existing `handleOpenPaper`. Deliberately not a deeper link into a
   * specific notebook section or page: `Notebook` doesn't currently
   * accept an "open to this section" prop, and the matrix's own log
   * made the identical call for the identical reason — not worth the
   * added state surface for this milestone. The match itself (with
   * its section/page label) is shown right in the result row, so the
   * researcher knows what they're looking for once the paper opens. */
  onOpenPaper: (paper: Paper) => void;
}

// Matches the debounce Notebook uses for its own high-frequency
// input (typing), rather than firing a query on every keystroke.
const SEARCH_DEBOUNCE_MS = 300;

const KIND_LABEL: Record<SearchResultKind, string> = {
  paper: "Paper",
  note: "Note",
  excerpt: "Excerpt",
};

/**
 * Returns a short window of `text` centered on the first
 * case-insensitive occurrence of `query`, so a match buried in the
 * middle of a long note doesn't get truncated away by a naive
 * "first N characters" cut.
 */
function centeredSnippet(text: string, query: string, radius = 90): string {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text.length > radius * 2 ? text.slice(0, radius * 2) + "…" : text;

  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + query.length + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return prefix + text.slice(start, end) + suffix;
}

/** Splits `text` into parts around case-insensitive occurrences of
 * `query`, for rendering the match in bold without `dangerouslySetInnerHTML`. */
function highlightParts(text: string, query: string): { text: string; match: boolean }[] {
  if (!query) return [{ text, match: false }];
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const parts: { text: string; match: boolean }[] = [];
  let cursor = 0;
  let idx = lower.indexOf(q, cursor);
  while (idx !== -1) {
    if (idx > cursor) parts.push({ text: text.slice(cursor, idx), match: false });
    parts.push({ text: text.slice(idx, idx + query.length), match: true });
    cursor = idx + query.length;
    idx = lower.indexOf(q, cursor);
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });
  return parts;
}

export function SearchPanel({ onClose, onOpenPaper }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Tracks the query a result set was actually built for, so
  // rendering can highlight/center against the right string even
  // after the debounce delay.
  const searchedQuery = useRef("");

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    const trimmed = query.trim();
    if (!trimmed) {
      setResults(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceTimer.current = setTimeout(async () => {
      const result = await searchService.search(trimmed);
      searchedQuery.current = trimmed;
      setResults(result);
      setLoading(false);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query]);

  return (
    <div className="search-panel__backdrop" onClick={onClose}>
      <div
        className="search-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Search"
      >
        <header className="search-panel__header">
          <input
            ref={inputRef}
            className="search-panel__input"
            type="text"
            placeholder="Search papers, notes, and excerpts…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="search-panel__close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </header>

        <div className="search-panel__body">
          {!query.trim() && (
            <p className="search-panel__status">
              Search across paper titles/authors, your notebook notes, and
              your saved excerpts.
            </p>
          )}

          {query.trim() && loading && <p className="search-panel__status">Searching…</p>}

          {query.trim() && !loading && results && results.length === 0 && (
            <p className="search-panel__status">No matches for "{query.trim()}".</p>
          )}

          {query.trim() && !loading && results && results.length > 0 && (
            <ul className="search-panel__results">
              {results.map((result, i) => (
                <li key={`${result.kind}-${result.paper.id}-${i}`}>
                  <button
                    className="search-panel__result"
                    onClick={() => onOpenPaper(result.paper)}
                  >
                    <div className="search-panel__result-top">
                      <span
                        className={`search-panel__badge search-panel__badge--${result.kind}`}
                      >
                        {KIND_LABEL[result.kind]}
                      </span>
                      <span className="search-panel__result-title">
                        {result.paper.title || "Untitled"}
                      </span>
                      {result.sectionTitle && (
                        <span className="search-panel__result-section">
                          {result.sectionTitle}
                        </span>
                      )}
                      {result.pageLabel != null && (
                        <span className="search-panel__result-page">
                          {result.pageLabel}
                        </span>
                      )}
                    </div>
                    {result.kind !== "paper" && (
                      <p className="search-panel__result-snippet">
                        {highlightParts(
                          centeredSnippet(result.snippet, searchedQuery.current),
                          searchedQuery.current,
                        ).map((part, j) =>
                          part.match ? (
                            <mark key={j}>{part.text}</mark>
                          ) : (
                            <span key={j}>{part.text}</span>
                          ),
                        )}
                      </p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
