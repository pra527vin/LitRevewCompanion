import { storageClient } from "../storage";

interface NotebookNoteRow {
  id: string;
  paper_id: string;
  section: string;
  content: string;
  updated_at: string;
}

export interface NotebookNoteRecord {
  paperId: string;
  section: string;
  content: string;
  updatedAt: string;
}

/**
 * Data-access for `notebook_notes`. `save` is an upsert keyed on the
 * table's `UNIQUE (paper_id, section)` constraint — the first save
 * for a (paper, section) pair inserts, every one after updates the
 * same row in place. Verified against a real SQLite engine before
 * being wired in (see this milestone's log).
 */
export const notebookRepository = {
  async listByPaper(paperId: string): Promise<NotebookNoteRecord[]> {
    const rows = await storageClient.select<NotebookNoteRow>(
      "SELECT * FROM notebook_notes WHERE paper_id = $1",
      [paperId],
    );
    return rows.map((r) => ({
      paperId: r.paper_id,
      section: r.section,
      content: r.content,
      updatedAt: r.updated_at,
    }));
  },

  async save(
    paperId: string,
    section: string,
    content: string,
    updatedAt: string,
  ): Promise<void> {
    await storageClient.execute(
      `INSERT INTO notebook_notes (id, paper_id, section, content, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT(paper_id, section) DO UPDATE SET
         content = excluded.content,
         updated_at = excluded.updated_at`,
      [crypto.randomUUID(), paperId, section, content, updatedAt],
    );
  },

  /**
   * Milestone 12 — Search. Unlike `listByPaper`, this reaches across
   * every paper's notes — `trim(content) != ''` skips rows that
   * exist only because a section was opened and left blank (every
   * section gets a row shape via `save`'s upsert once touched, most
   * of them empty), which would otherwise show up as junk "matches"
   * on an empty-string search-adjacent query.
   */
  async searchAll(query: string): Promise<NotebookNoteRecord[]> {
    const pattern = `%${query}%`;
    const rows = await storageClient.select<NotebookNoteRow>(
      `SELECT * FROM notebook_notes
       WHERE content LIKE $1 COLLATE NOCASE AND trim(content) != ''
       ORDER BY updated_at DESC`,
      [pattern],
    );
    return rows.map((r) => ({
      section: r.section,
      content: r.content,
      updatedAt: r.updated_at,
      paperId: r.paper_id,
    }));
  },
};
