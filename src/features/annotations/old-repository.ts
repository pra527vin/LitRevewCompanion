import { storageClient } from "../storage";
import type { NotebookSectionId } from "../notebook/types";
import { Excerpt } from "./types";

interface ExcerptRow {
  id: string;
  paper_id: string;
  section: string | null;
  quote: string;
  page_number: number;
  end_page: number | null;
  user_note: string | null;
  created_at: string;
}

function fromRow(row: ExcerptRow): Excerpt {
  return {
    id: row.id,
    paperId: row.paper_id,
    section: (row.section as NotebookSectionId | null) ?? null,
    quote: row.quote,
    pageNumber: row.page_number,
    endPage: row.end_page,
    userNote: row.user_note,
    createdAt: row.created_at,
  };
}

/**
 * Data-access for `excerpts`. Queries verified against a real SQLite
 * engine loaded with the actual migration files before being wired
 * in (see this milestone's log) — insert with a null section, update
 * to assign, update back to null to unassign, delete.
 */
export const excerptRepository = {
  async listByPaper(paperId: string): Promise<Excerpt[]> {
    const rows = await storageClient.select<ExcerptRow>(
      "SELECT * FROM excerpts WHERE paper_id = $1 ORDER BY created_at ASC",
      [paperId],
    );
    return rows.map(fromRow);
  },

  async insert(excerpt: Excerpt): Promise<void> {
    await storageClient.execute(
      `INSERT INTO excerpts (id, paper_id, section, quote, page_number, end_page, user_note, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        excerpt.id,
        excerpt.paperId,
        excerpt.section,
        excerpt.quote,
        excerpt.pageNumber,
        excerpt.endPage,
        excerpt.userNote,
        excerpt.createdAt,
      ],
    );
  },

  async updateSection(id: string, section: NotebookSectionId | null): Promise<void> {
    await storageClient.execute("UPDATE excerpts SET section = $1 WHERE id = $2", [
      section,
      id,
    ]);
  },

  async remove(id: string): Promise<void> {
    await storageClient.execute("DELETE FROM excerpts WHERE id = $1", [id]);
  },

  /**
   * Milestone 12 — Search. Reaches across every paper's excerpts,
   * unlike `listByPaper` — matches the highlighted quote itself or
   * the researcher's note on it.
   */
  async search(query: string): Promise<Excerpt[]> {
    const pattern = `%${query}%`;
    const rows = await storageClient.select<ExcerptRow>(
      `SELECT * FROM excerpts
       WHERE quote LIKE $1 COLLATE NOCASE OR user_note LIKE $1 COLLATE NOCASE
       ORDER BY created_at DESC`,
      [pattern],
    );
    return rows.map(fromRow);
  },
};
