// `section` is typed against notebook's canonical section IDs, but
// this is a type-only import (erased at compile time) specifically so
// it can't create a runtime circular dependency with the notebook
// feature, which imports `Excerpt` (also type-only) the other way —
// see this milestone's log for why that matters here.
import type { NotebookSectionId } from "../notebook/types";

export interface Excerpt {
  id: string;
  paperId: string;
  section: NotebookSectionId | null;
  quote: string;
  pageNumber: number;
  /** Set only when the highlight was made across a page boundary —
   * see this bugfix pass's log. `null` means "same page," not
   * "unknown." */
  endPage: number | null;
  userNote: string | null;
  createdAt: string;
}

/**
 * Every place an excerpt's page shows up in the UI (Notebook's
 * excerpt cards, Paper Summary, Search results, the Markdown export)
 * wants the identical "p. 12" / "p. 12–13" formatting — centralized
 * here once rather than four places re-deriving
 * `excerpt.endPage ?? excerpt.pageNumber` slightly differently.
 */
export function formatExcerptPages(excerpt: Pick<Excerpt, "pageNumber" | "endPage">): string {
  const end = excerpt.endPage ?? excerpt.pageNumber;
  return end > excerpt.pageNumber ? `p. ${excerpt.pageNumber}–${end}` : `p. ${excerpt.pageNumber}`;
}
