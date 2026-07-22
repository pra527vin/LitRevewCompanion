-- Milestone 01 — Workspace System
-- See docs/schema.md for full rationale.

CREATE TABLE workspace_meta (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    schema_version INTEGER NOT NULL
);

CREATE TABLE papers (
    id TEXT PRIMARY KEY,
    title TEXT,
    authors TEXT,
    doi TEXT,
    journal TEXT,
    year INTEGER,
    file_path TEXT NOT NULL,
    file_hash TEXT NOT NULL UNIQUE,
    page_count INTEGER,
    added_at TEXT NOT NULL,
    last_opened_at TEXT
);

CREATE INDEX idx_papers_file_hash ON papers(file_hash);
