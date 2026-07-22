import { storageClient } from "../storage";
import { paperFromRow, Paper, PaperRow } from "../library";

interface ReadingStateRow {
  paper_id: string;
  current_page: number;
  progress_pct: number;
  updated_at: string;
}

export interface ReadingState {
  currentPage: number;
  progressPct: number;
  updatedAt: string;
}

/** One entry in the "recently studied" list — a paper that has a
 * `reading_state` row at all (i.e. has actually been opened and
 * scrolled at least once), with its progress and the reader's
 * "Continue where you left off" empty state (`RecentlyStudied.tsx`)
 * card. */
export interface RecentlyStudiedEntry {
  paper: Paper;
  progressPct: number;
  studiedAt: string;
}

type RecentlyStudiedRow = PaperRow & { progress_pct: number; studied_at: string };

/**
 * Data-access for `reading_state` (one row per paper — see
 * docs/schema.md). `save` is an upsert since `paper_id` is the
 * primary key: the first page turn on a paper inserts a row, every
 * one after that updates it in place. Verified against a real
 * SQLite engine before wiring this in (see this milestone's log).
 */
export const readingStateRepository = {
  async get(paperId: string): Promise<ReadingState | null> {
    const rows = await storageClient.select<ReadingStateRow>(
      "SELECT * FROM reading_state WHERE paper_id = $1",
      [paperId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      currentPage: row.current_page,
      progressPct: row.progress_pct,
      updatedAt: row.updated_at,
    };
  },

  async save(
    paperId: string,
    currentPage: number,
    progressPct: number,
    updatedAt: string,
  ): Promise<void> {
    await storageClient.execute(
      `INSERT INTO reading_state (paper_id, current_page, progress_pct, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(paper_id) DO UPDATE SET
         current_page = excluded.current_page,
         progress_pct = excluded.progress_pct,
         updated_at = excluded.updated_at`,
      [paperId, currentPage, progressPct, updatedAt],
    );
  },

  /** Every paper with a `reading_state` row (i.e. actually opened at
   * least once), most-recently-updated first — powers the reader's
   * "Continue where you left off" empty state. Reuses `library`'s own
   * `paperFromRow` for the joined columns rather than re-deriving a
   * `Paper` by hand — `reader` already depends on `library` for the
   * `Paper` type itself, so this is the same direction, not a new one. */
  async listRecentlyStudied(limit = 8): Promise<RecentlyStudiedEntry[]> {
    const rows = await storageClient.select<RecentlyStudiedRow>(
      `SELECT papers.*, categories.name AS category_name,
              reading_state.progress_pct AS progress_pct,
              reading_state.updated_at AS studied_at
       FROM reading_state
       JOIN papers ON papers.id = reading_state.paper_id
       LEFT JOIN categories ON categories.id = papers.category_id
       ORDER BY reading_state.updated_at DESC
       LIMIT $1`,
      [limit],
    );
    return rows.map((row) => ({
      paper: paperFromRow(row),
      progressPct: row.progress_pct,
      studiedAt: row.studied_at,
    }));
  },
};

interface CurrentThoughtRow {
  paper_id: string;
  thought: string;
  updated_at: string;
}

/**
 * Data-access for `current_thought` — its own table since Migration
 * 0003 (shipped alongside `notebook_notes`/`excerpts`), but never
 * actually read or written by any application code until this
 * bugfix pass; see docs/milestones/13a-bugfixes.md. One row per
 * paper, same upsert shape as `reading_state.save` above.
 */
export const currentThoughtRepository = {
  async get(paperId: string): Promise<string> {
    const rows = await storageClient.select<CurrentThoughtRow>(
      "SELECT * FROM current_thought WHERE paper_id = $1",
      [paperId],
    );
    return rows[0]?.thought ?? "";
  },

  async save(paperId: string, thought: string, updatedAt: string): Promise<void> {
    await storageClient.execute(
      `INSERT INTO current_thought (paper_id, thought, updated_at)
       VALUES ($1, $2, $3)
       ON CONFLICT(paper_id) DO UPDATE SET
         thought = excluded.thought,
         updated_at = excluded.updated_at`,
      [paperId, thought, updatedAt],
    );
  },
};
