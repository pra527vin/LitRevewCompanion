import { storageClient } from "../storage";
import { Tag } from "./types";

interface TagRow {
  id: string;
  name: string;
  created_at: string;
}

function fromRow(row: TagRow): Tag {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

/**
 * Data-access layer for `tags`/`paper_tags` — the free-form,
 * many-per-paper counterpart to `categoryRepository`'s fixed,
 * one-per-paper list. `getOrCreate`'s find-then-insert shape lives
 * here for the same reason it does there: a single atomic-enough
 * read+write against one table.
 */
export const tagRepository = {
  async listAll(): Promise<Tag[]> {
    const rows = await storageClient.select<TagRow>(
      "SELECT * FROM tags ORDER BY name COLLATE NOCASE ASC",
    );
    return rows.map(fromRow);
  },

  /** Looks up a tag by name (case-insensitive), creating it the first
   * time it's used — the tag popover's "new tag" input, and the
   * quick Important/Read toggles, both call this rather than
   * requiring tags to be predefined anywhere. */
  async getOrCreate(name: string): Promise<Tag> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error("Tag name can't be empty.");
    }

    const existing = await storageClient.select<TagRow>(
      "SELECT * FROM tags WHERE name = $1 COLLATE NOCASE",
      [trimmed],
    );
    if (existing[0]) return fromRow(existing[0]);

    const row: TagRow = {
      id: crypto.randomUUID(),
      name: trimmed,
      created_at: new Date().toISOString(),
    };
    await storageClient.execute(
      "INSERT INTO tags (id, name, created_at) VALUES ($1, $2, $3)",
      [row.id, row.name, row.created_at],
    );
    return fromRow(row);
  },

  /** Renames a tag in place — every paper carrying it (via
   * `paper_tags`) picks up the new name automatically, no join-table
   * rows need touching. `tags.name` is UNIQUE, so renaming to a name
   * already in use surfaces that constraint as a normal error rather
   * than silently merging the two tags. */
  async rename(id: string, name: string): Promise<Tag> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error("Tag name can't be empty.");
    }
    await storageClient.execute("UPDATE tags SET name = $1 WHERE id = $2", [trimmed, id]);
    const rows = await storageClient.select<TagRow>("SELECT * FROM tags WHERE id = $1", [id]);
    if (!rows[0]) throw new Error("That tag no longer exists.");
    return fromRow(rows[0]);
  },

  /** Every paper→tag assignment in the workspace, grouped by paper —
   * one query for the whole Library list rather than one per row. */
  async listAllAssignments(): Promise<Map<string, Tag[]>> {
    const rows = await storageClient.select<TagRow & { paper_id: string }>(
      `SELECT paper_tags.paper_id AS paper_id, tags.id AS id, tags.name AS name, tags.created_at AS created_at
       FROM paper_tags
       JOIN tags ON tags.id = paper_tags.tag_id
       ORDER BY tags.name COLLATE NOCASE ASC`,
    );
    const byPaper = new Map<string, Tag[]>();
    for (const row of rows) {
      const list = byPaper.get(row.paper_id) ?? [];
      list.push(fromRow(row));
      byPaper.set(row.paper_id, list);
    }
    return byPaper;
  },

  /** Assigns a tag to a paper — a no-op if it's already assigned
   * (`paper_tags`' composite primary key would otherwise reject the
   * duplicate insert). */
  async addToPaper(paperId: string, tagId: string): Promise<void> {
    await storageClient.execute(
      "INSERT OR IGNORE INTO paper_tags (paper_id, tag_id) VALUES ($1, $2)",
      [paperId, tagId],
    );
  },

  async removeFromPaper(paperId: string, tagId: string): Promise<void> {
    await storageClient.execute(
      "DELETE FROM paper_tags WHERE paper_id = $1 AND tag_id = $2",
      [paperId, tagId],
    );
  },

  /** Deletes a tag outright — every paper carrying it just loses that
   * one marker, nothing else about them changes. */
  async remove(id: string): Promise<void> {
    await storageClient.execute("DELETE FROM paper_tags WHERE tag_id = $1", [id]);
    await storageClient.execute("DELETE FROM tags WHERE id = $1", [id]);
  },
};
