import type { Paper } from "../library";
import type { NotebookSectionId } from "../notebook";

/**
 * Three angles a query can hit, matching the three places text a
 * researcher would search for actually lives: the catalog entry
 * itself, a notebook section's free-text note, or a captured
 * excerpt's quote/note. Deliberately not a fourth "everything" kind —
 * each result always says *where* the match was found, since that's
 * what tells the researcher whether to expect a whole paper, a
 * paragraph of their own analysis, or a highlighted sentence.
 */
export type SearchResultKind = "paper" | "note" | "excerpt";

export interface SearchResult {
  kind: SearchResultKind;
  paper: Paper;
  /** The matched text — the paper's title for a "paper" result, the
   * note content for a "note" result, the quote for an "excerpt"
   * result. UI truncates/centers this around the match itself. */
  snippet: string;
  /** Set for "note" and "excerpt" results, unset for "paper" results. */
  section?: NotebookSectionId;
  sectionTitle?: string;
  /** Set only for "excerpt" results — pre-formatted ("p. 12" or
   * "p. 12–13" for a highlight spanning a page boundary) via
   * `formatExcerptPages`, so the UI doesn't need its own copy of that
   * formatting logic. */
  pageLabel?: string;
}
