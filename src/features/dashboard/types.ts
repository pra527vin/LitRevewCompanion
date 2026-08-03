import { Paper } from "../library";

/**
 * Top-line stat tiles. `completed`/`inProgress`/`notStarted` are a
 * strict three-way partition of `totalDocuments` (see repository's
 * doc comment on why "has a `reading_state` row" — not
 * `last_opened_at` — is the completed/in-progress signal, and
 * `notStarted` is derived as the remainder rather than queried
 * directly). `importantUnread` singles out the one tag the app
 * gives a dedicated quick-toggle for (see `library`'s
 * `IMPORTANT_TAG_NAME`) — "papers I flagged as important that I
 * still haven't finished" is the single most actionable number on
 * this page for a literature review.
 */
export interface DashboardKpis {
  totalDocuments: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  /** 0–100, rounded. `0` (not `NaN`) when the library is empty. */
  completionRate: number;
  importantUnread: number;
}

/** A paper paired with its reading progress — "Continue Reading" is
 * this shape ("recently completed"/"recently opened" are now sort
 * options on the documents table instead of their own panels — see
 * `DocumentRow.lastActivityAt`). */
export interface ProgressEntry {
  paper: Paper;
  progressPct: number;
  updatedAt: string;
}

export interface CategoryBreakdown {
  /** `null` for the synthetic "Uncategorized" bucket — not a real
   * `categories` row, so there's nothing to link to. */
  categoryId: string | null;
  categoryName: string;
  count: number;
}

export interface DashboardSummary {
  kpis: DashboardKpis;
  /** Started, not yet finished — most-recently-touched first. */
  continueReading: ProgressEntry[];
  byCategory: CategoryBreakdown[];
}

export type DocumentStatus = "completed" | "in-progress" | "not-started";

/** One row of the All Documents table — every paper in the library,
 * not just a recent-N slice, each paired with a derived status. */
export interface DocumentRow {
  paper: Paper;
  status: DocumentStatus;
  /** The paper's `reading_state.updated_at` — null if it's never been
   * opened. Doubles as both "last opened" and (when `status` is
   * `"completed"`) "completed at," since progress only reaches 100%
   * at whatever moment `reading_state` was last written — powers the
   * table's "Recently Completed"/"Recently Opened" sort options. */
  lastActivityAt: string | null;
}

/**
 * A filter to push into the documents table from elsewhere on the
 * page — a KPI tile ("Completed" → `{status: "completed"}`), a
 * category row ("By Category" → `{categoryId: "…"}"`), or "Total
 * Documents" (`{}`, just scrolls down without changing anything). A
 * field's mere *presence* is what applies it — `status: ""` clears
 * the status filter, `status: undefined`/absent leaves whatever
 * status filter was already set untouched — so DashboardView only
 * needs to name the one field a given click actually means to change.
 * Always pass a brand-new object (never reuse/mutate one) — the
 * table's effect keys off object identity so the same request (e.g.
 * clicking "Completed" twice in a row) still re-applies and re-scrolls.
 */
export interface TableFilterRequest {
  status?: DocumentStatus | "";
  categoryId?: string;
}
