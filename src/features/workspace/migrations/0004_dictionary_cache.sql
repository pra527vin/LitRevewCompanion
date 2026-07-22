-- Milestone 09 — Dictionary (future idea, table shipped in Milestone 01)

CREATE TABLE dictionary_cache (
    term TEXT PRIMARY KEY,
    definition TEXT NOT NULL,
    source TEXT NOT NULL,
    cached_at TEXT NOT NULL
);
