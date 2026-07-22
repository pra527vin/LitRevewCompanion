// Mirrors the `papers` table in docs/schema.md.
//
// Post-Milestone-13 bugfix pass: broadened beyond DOI-having journal
// articles. `journal` is reused as a generic "container/publisher"
// field (see MetadataSection.tsx) rather than renamed — this app
// doesn't attempt full per-type APA7 reference generation, just one
// venue-name slot that fits whichever type applies.
export type SourceType =
  | "article"
  | "book"
  | "report"
  | "working-paper"
  | "thesis"
  | "webpage"
  | "other";

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  article: "Journal Article",
  book: "Book",
  report: "Report",
  "working-paper": "Working Paper",
  thesis: "Thesis / Dissertation",
  webpage: "Web Page",
  other: "Other",
};

// What the "journal" field is actually asking for, per source type —
// shown as MetadataSection's field label instead of a fixed "Journal".
export const CONTAINER_FIELD_LABELS: Record<SourceType, string> = {
  article: "Journal",
  book: "Publisher",
  report: "Institution / Publisher",
  "working-paper": "Series / Institution",
  thesis: "Institution",
  webpage: "Website / Publisher",
  other: "Publisher / Source",
};

export interface Paper {
  id: string;
  title: string | null;
  authors: string[] | null;
  doi: string | null;
  journal: string | null;
  year: number | null;
  sourceType: SourceType | null;
  url: string | null;
  filePath: string; // relative to workspace root, e.g. "papers/<hash>.pdf"
  fileHash: string;
  pageCount: number | null;
  addedAt: string; // ISO 8601
  lastOpenedAt: string | null;
  categoryId: string | null;
  // Joined in from `categories` by the query, not a papers column —
  // null both when uncategorized and when a query didn't join it in
  // (e.g. `findByHash`'s dedup check has no reason to).
  categoryName: string | null;
}

// A fixed, user-managed list (Milestone 14b — Categorization) —
// created once (inline, from the import review step's "new category"
// input) and then reused as a dropdown, rather than a free-text tag
// typed fresh on every paper.
export interface Category {
  id: string;
  name: string;
  createdAt: string;
}

// Raw row shape as it comes back from SQLite — snake_case columns,
// `authors` stored as a JSON array string.
export interface PaperRow {
  id: string;
  title: string | null;
  authors: string | null;
  doi: string | null;
  journal: string | null;
  year: number | null;
  source_type: string | null;
  url: string | null;
  file_path: string;
  file_hash: string;
  page_count: number | null;
  added_at: string;
  last_opened_at: string | null;
  category_id: string | null;
  // Only present on queries that LEFT JOIN categories (listAll/search)
  // — absent (not just null) on a plain `SELECT * FROM papers`.
  category_name?: string | null;
}

export function fromRow(row: PaperRow): Paper {
  return {
    id: row.id,
    title: row.title,
    authors: row.authors ? (JSON.parse(row.authors) as string[]) : null,
    doi: row.doi,
    journal: row.journal,
    year: row.year,
    sourceType: (row.source_type as SourceType | null) ?? null,
    url: row.url,
    filePath: row.file_path,
    fileHash: row.file_hash,
    pageCount: row.page_count,
    addedAt: row.added_at,
    lastOpenedAt: row.last_opened_at,
    categoryId: row.category_id,
    categoryName: row.category_name ?? null,
  };
}

/** Fields a person (or a citation lookup) can update on a paper's catalog entry. */
export interface MetadataUpdate {
  title: string | null;
  authors: string[] | null;
  doi: string | null;
  journal: string | null;
  year: number | null;
  sourceType: SourceType | null;
  url: string | null;
}

/**
 * Result of a citation lookup (Milestone 08; broadened post-Milestone-13
 * to accept a URL as well as a DOI — see `lookupCitation` in
 * `service.ts`). Every field name here is a single word, so no
 * snake_case/camelCase mapping is needed the way `PaperRow` needs one.
 */
export interface DoiMetadata {
  /** `null` when this came from scraping a URL rather than a DOI —
   * not every citable source has one. */
  doi: string | null;
  title: string | null;
  authors: string[];
  journal: string | null;
  year: number | null;
  /** The URL this was resolved from, when the input was a URL. */
  url: string | null;
}
