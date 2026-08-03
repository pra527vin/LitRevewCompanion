import { storageClient } from "../storage";
import { Paper, PaperRow, MetadataUpdate, fromRow } from "./types";
import { tagRepository } from "./tagRepository";

/** Merges in each paper's tags, aggregated by one extra query rather
 * than a per-row JOIN (which would multiply a paper's row once per
 * tag). Used by every listing query — `findByHash`'s single-paper
 * dedup check has no reason to bother, so it leaves `fromRow`'s
 * default empty array as-is. */
async function attachTags(papers: Paper[]): Promise<Paper[]> {
  if (papers.length === 0) return papers;
  const byPaper = await tagRepository.listAllAssignments();
  return papers.map((p) => ({ ...p, tags: byPaper.get(p.id) ?? [] }));
}

/**
 * Data-access layer for `papers`. No business rules here (e.g. "is
 * this a duplicate" lives in service.ts) — just shaped queries.
 */
export const paperRepository = {
  async findByHash(fileHash: string): Promise<Paper | null> {
    const rows = await storageClient.select<PaperRow>(
      "SELECT * FROM papers WHERE file_hash = $1",
      [fileHash],
    );
    return rows[0] ? fromRow(rows[0]) : null;
  },

  async insert(paper: Paper): Promise<void> {
    await storageClient.execute(
      `INSERT INTO papers
        (id, title, authors, doi, journal, year, source_type, url, file_path, file_hash, page_count, added_at, last_opened_at, category_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        paper.id,
        paper.title,
        paper.authors ? JSON.stringify(paper.authors) : null,
        paper.doi,
        paper.journal,
        paper.year,
        paper.sourceType,
        paper.url,
        paper.filePath,
        paper.fileHash,
        paper.pageCount,
        paper.addedAt,
        paper.lastOpenedAt,
        paper.categoryId,
      ],
    );
  },

  async listAll(): Promise<Paper[]> {
    const rows = await storageClient.select<PaperRow>(
      `SELECT papers.*, categories.name AS category_name
       FROM papers
       LEFT JOIN categories ON categories.id = papers.category_id
       ORDER BY papers.added_at DESC`,
    );
    return attachTags(rows.map(fromRow));
  },

  /**
   * Milestone 12 — Search. Matches against the catalog fields a
   * researcher would actually remember a paper by — title, authors
   * (searched against the raw JSON-string column, which is fine for
   * a substring match), journal, DOI. `COLLATE NOCASE` rather than
   * lower()-wrapping both sides, since NOCASE is index-friendly and
   * this repo has no other case-folding convention to stay
   * consistent with.
   */
  async search(query: string): Promise<Paper[]> {
    const pattern = `%${query}%`;
    const rows = await storageClient.select<PaperRow>(
      `SELECT papers.*, categories.name AS category_name
       FROM papers
       LEFT JOIN categories ON categories.id = papers.category_id
       WHERE papers.title LIKE $1 COLLATE NOCASE
          OR papers.authors LIKE $1 COLLATE NOCASE
          OR papers.journal LIKE $1 COLLATE NOCASE
          OR papers.doi LIKE $1 COLLATE NOCASE
       ORDER BY papers.title ASC`,
      [pattern],
    );
    return attachTags(rows.map(fromRow));
  },

  /**
   * Called when a paper is actually opened in the reader (Milestone
   * 04). This is the first point the app truly knows the page count
   * — docs/schema.md notes `page_count` stays null "until first
   * opened." Also stamps `last_opened_at`.
   */
  async recordOpened(id: string, pageCount: number, openedAt: string): Promise<void> {
    await storageClient.execute(
      "UPDATE papers SET page_count = $1, last_opened_at = $2 WHERE id = $3",
      [pageCount, openedAt, id],
    );
  },

  /**
   * Updates the catalog fields (Milestone 08 — Metadata & DOI), from
   * either manual editing or an applied citation lookup. Verified
   * against a real SQLite engine before being wired in (see this
   * milestone's log) — confirmed file_path/file_hash are untouched by
   * this call.
   */
  async updateMetadata(id: string, metadata: MetadataUpdate): Promise<void> {
    await storageClient.execute(
      `UPDATE papers
       SET title = $1, authors = $2, doi = $3, journal = $4, year = $5,
           source_type = $6, url = $7
       WHERE id = $8`,
      [
        metadata.title,
        metadata.authors ? JSON.stringify(metadata.authors) : null,
        metadata.doi,
        metadata.journal,
        metadata.year,
        metadata.sourceType,
        metadata.url,
        id,
      ],
    );
  },

  /**
   * Assigns (or clears, with `null`) a paper's category — the Library
   * sidebar's per-row category picker, for categorizing a paper after
   * the fact rather than only during the "Add Paper" review step.
   */
  async updateCategory(id: string, categoryId: string | null): Promise<void> {
    await storageClient.execute("UPDATE papers SET category_id = $1 WHERE id = $2", [
      categoryId,
      id,
    ]);
  },

  /**
   * Assigns sequential `sort_order` values (0, 1, 2, …) to exactly the
   * papers named, in the order given — the Library sidebar's
   * drag-to-reorder, applied to whatever's currently visible (a
   * category/tag filter may be narrowing that). Papers not named here
   * keep whatever `sort_order` they already had.
   */
  async reorder(paperIdsInOrder: string[]): Promise<void> {
    for (let i = 0; i < paperIdsInOrder.length; i += 1) {
      await storageClient.execute("UPDATE papers SET sort_order = $1 WHERE id = $2", [
        i,
        paperIdsInOrder[i],
      ]);
    }
  },

  /**
   * Removes a paper's row and everything scoped to it in every other
   * table — `reading_state`, `notebook_notes`, `excerpts`,
   * `current_thought` all declare `paper_id ... REFERENCES papers(id)
   * ON DELETE CASCADE` (docs/schema.md), but sql.js never runs
   * `PRAGMA foreign_keys = ON`, so that constraint is never actually
   * enforced — a bare `DELETE FROM papers` would leave every one of
   * those as an orphan row forever. Deleted by hand here instead,
   * child tables first.
   */
  async deleteById(id: string): Promise<void> {
    await storageClient.execute("DELETE FROM reading_state WHERE paper_id = $1", [id]);
    await storageClient.execute("DELETE FROM notebook_notes WHERE paper_id = $1", [id]);
    await storageClient.execute("DELETE FROM excerpts WHERE paper_id = $1", [id]);
    await storageClient.execute("DELETE FROM current_thought WHERE paper_id = $1", [id]);
    await storageClient.execute("DELETE FROM paper_tags WHERE paper_id = $1", [id]);
    await storageClient.execute("DELETE FROM papers WHERE id = $1", [id]);
  },
};
