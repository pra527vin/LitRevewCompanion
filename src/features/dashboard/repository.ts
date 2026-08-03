import { storageClient } from "../storage";
import { paperFromRow, PaperRow } from "../library";
import { CategoryBreakdown, ProgressEntry } from "./types";

const RECENT_LIMIT = 5;

type ProgressRow = PaperRow & { progress_pct: number; updated_at: string };

function toProgressEntry(row: ProgressRow): ProgressEntry {
  return { paper: paperFromRow(row), progressPct: row.progress_pct, updatedAt: row.updated_at };
}

/**
 * Data-access for the Dashboard — its own queries against `papers`/
 * `reading_state`/`categories`/`tags` rather than routing through
 * `library`'s or `reader`'s repositories, since none of their
 * existing methods return "every paper's progress" or "papers
 * grouped by category" in the shape a dashboard needs. Read-only:
 * nothing here writes anything.
 */
export const dashboardRepository = {
  async countTotalPapers(): Promise<number> {
    const rows = await storageClient.select<{ count: number }>(
      "SELECT COUNT(*) as count FROM papers",
    );
    return rows[0]?.count ?? 0;
  },

  /**
   * Every paper's progress (and when it was last touched), keyed by
   * paper id — only papers that have actually been scrolled at least
   * once have a `reading_state` row (see `reader/repository.ts`'s own
   * note: `last_opened_at` is stamped the moment a paper is opened,
   * but `reading_state` isn't written until the scroll handler's
   * debounced save actually fires, so the two aren't the same
   * signal). A paper missing from this map counts as "not started"
   * for KPI purposes — that's a deliberate simplification, not a bug:
   * "opened but never scrolled" and "never opened" both read as
   * "hasn't really been engaged with yet."
   */
  async listProgressByPaper(): Promise<Map<string, { progressPct: number; updatedAt: string }>> {
    const rows = await storageClient.select<{
      paper_id: string;
      progress_pct: number;
      updated_at: string;
    }>("SELECT paper_id, progress_pct, updated_at FROM reading_state");
    return new Map(
      rows.map((r) => [r.paper_id, { progressPct: r.progress_pct, updatedAt: r.updated_at }]),
    );
  },

  /** Papers tagged `tagName` (case-sensitive exact match — tag names
   * are already normalized on write, see `tagRepository.getOrCreate`)
   * with no `reading_state` row, or one under 100% — the "Important &
   * Unread" KPI tile. */
  async countUnreadByTag(tagName: string): Promise<number> {
    const rows = await storageClient.select<{ count: number }>(
      `SELECT COUNT(*) as count
       FROM papers
       JOIN paper_tags ON paper_tags.paper_id = papers.id
       JOIN tags ON tags.id = paper_tags.tag_id AND tags.name = $1
       LEFT JOIN reading_state ON reading_state.paper_id = papers.id
       WHERE reading_state.progress_pct IS NULL OR reading_state.progress_pct < 100`,
      [tagName],
    );
    return rows[0]?.count ?? 0;
  },

  /** Started, not finished — most-recently-touched first ("Continue
   * Reading"). */
  async listInProgress(limit = RECENT_LIMIT): Promise<ProgressEntry[]> {
    const rows = await storageClient.select<ProgressRow>(
      `SELECT papers.*, categories.name AS category_name,
              reading_state.progress_pct AS progress_pct,
              reading_state.updated_at AS updated_at
       FROM reading_state
       JOIN papers ON papers.id = reading_state.paper_id
       LEFT JOIN categories ON categories.id = papers.category_id
       WHERE reading_state.progress_pct < 100
       ORDER BY reading_state.updated_at DESC
       LIMIT $1`,
      [limit],
    );
    return rows.map(toProgressEntry);
  },

  /** Paper count per category, most-populated first, plus a
   * synthetic "Uncategorized" bucket appended at the end when any
   * papers have no category — categories with zero papers still
   * appear (via the `LEFT JOIN`), so a freshly-created, unused
   * category doesn't just silently disappear from the breakdown. */
  async listCategoryBreakdown(): Promise<CategoryBreakdown[]> {
    const rows = await storageClient.select<{ id: string; name: string; count: number }>(
      `SELECT categories.id AS id, categories.name AS name, COUNT(papers.id) AS count
       FROM categories
       LEFT JOIN papers ON papers.category_id = categories.id
       GROUP BY categories.id
       ORDER BY count DESC, categories.name COLLATE NOCASE ASC`,
    );
    const uncategorized = await storageClient.select<{ count: number }>(
      "SELECT COUNT(*) as count FROM papers WHERE category_id IS NULL",
    );

    const breakdown: CategoryBreakdown[] = rows.map((r) => ({
      categoryId: r.id,
      categoryName: r.name,
      count: r.count,
    }));
    const uncategorizedCount = uncategorized[0]?.count ?? 0;
    if (uncategorizedCount > 0) {
      breakdown.push({ categoryId: null, categoryName: "Uncategorized", count: uncategorizedCount });
    }
    return breakdown;
  },
};
