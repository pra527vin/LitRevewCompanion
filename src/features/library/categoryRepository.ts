import { storageClient } from "../storage";
import { Category } from "./types";

interface CategoryRow {
  id: string;
  name: string;
  created_at: string;
}

function fromRow(row: CategoryRow): Category {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

/**
 * Data-access layer for the fixed `categories` list (Milestone 14b —
 * Categorization). No business rules here — `getOrCreate`'s
 * find-then-insert shape lives here rather than in service.ts only
 * because it's a single atomic-enough read+write against the same
 * table; every other repository in this app keeps that split.
 */
export const categoryRepository = {
  async listAll(): Promise<Category[]> {
    const rows = await storageClient.select<CategoryRow>(
      "SELECT * FROM categories ORDER BY name COLLATE NOCASE ASC",
    );
    return rows.map(fromRow);
  },

  /**
   * Looks up a category by name (case-insensitive), creating it if
   * this is the first time it's been used — the "fixed list you
   * manage" is built up incrementally from whatever's typed into the
   * import review step's "new category" field, rather than needing a
   * separate management screen up front.
   */
  async getOrCreate(name: string): Promise<Category> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error("Category name can't be empty.");
    }

    const existing = await storageClient.select<CategoryRow>(
      "SELECT * FROM categories WHERE name = $1 COLLATE NOCASE",
      [trimmed],
    );
    if (existing[0]) return fromRow(existing[0]);

    const row: CategoryRow = {
      id: crypto.randomUUID(),
      name: trimmed,
      created_at: new Date().toISOString(),
    };
    await storageClient.execute(
      "INSERT INTO categories (id, name, created_at) VALUES ($1, $2, $3)",
      [row.id, row.name, row.created_at],
    );
    return fromRow(row);
  },

  /**
   * Renames a category in place — every paper pointing at it by
   * `category_id` picks up the new name automatically (the join in
   * `paperRepository.listAll`/`search`), no paper rows need touching.
   * `categories.name` is UNIQUE, so renaming to a name already in use
   * by another category surfaces that constraint as a normal error
   * rather than silently merging the two.
   */
  async rename(id: string, name: string): Promise<Category> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error("Category name can't be empty.");
    }
    await storageClient.execute("UPDATE categories SET name = $1 WHERE id = $2", [trimmed, id]);
    const rows = await storageClient.select<CategoryRow>(
      "SELECT * FROM categories WHERE id = $1",
      [id],
    );
    if (!rows[0]) throw new Error("That category no longer exists.");
    return fromRow(rows[0]);
  },

  /**
   * Deletes a category outright. `categories.id` is declared
   * `ON DELETE SET NULL` on `papers.category_id` (see migration 0008),
   * but sql.js never runs `PRAGMA foreign_keys = ON` so that's never
   * actually enforced (same gotcha as `paperRepository.deleteById`) —
   * papers pointing at this category are uncategorized by hand first,
   * rather than left with a dangling id that just happens to still
   * display correctly today because of how the listing query joins.
   */
  async remove(id: string): Promise<void> {
    await storageClient.execute("UPDATE papers SET category_id = NULL WHERE category_id = $1", [
      id,
    ]);
    await storageClient.execute("DELETE FROM categories WHERE id = $1", [id]);
  },
};
