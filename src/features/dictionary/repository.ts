import { storageClient } from "../storage";

interface DictionaryCacheRow {
  term: string;
  definition: string;
  source: string;
  cached_at: string;
}

export interface CachedDefinition {
  term: string;
  definition: string;
  source: string;
  cachedAt: string;
}

/**
 * Data-access for `dictionary_cache`. `save` is an upsert keyed on
 * `term` (the table's primary key) — verified against a real SQLite
 * engine before being wired in (see this milestone's log).
 */
export const dictionaryRepository = {
  async get(term: string): Promise<CachedDefinition | null> {
    const rows = await storageClient.select<DictionaryCacheRow>(
      "SELECT * FROM dictionary_cache WHERE term = $1",
      [term],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      term: row.term,
      definition: row.definition,
      source: row.source,
      cachedAt: row.cached_at,
    };
  },

  async save(
    term: string,
    definition: string,
    source: string,
    cachedAt: string,
  ): Promise<void> {
    await storageClient.execute(
      `INSERT INTO dictionary_cache (term, definition, source, cached_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(term) DO UPDATE SET
         definition = excluded.definition,
         source = excluded.source,
         cached_at = excluded.cached_at`,
      [term, definition, source, cachedAt],
    );
  },
};
