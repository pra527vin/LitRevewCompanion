-- Milestone 05 — Reading State (table shipped in Milestone 01, see docs/schema.md)

CREATE TABLE reading_state (
    paper_id TEXT PRIMARY KEY REFERENCES papers(id) ON DELETE CASCADE,
    current_page INTEGER NOT NULL DEFAULT 1,
    progress_pct REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
);
