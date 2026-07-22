-- Milestones 06/07 — Research Notebook & Annotation System
-- (tables shipped in Milestone 01, see docs/schema.md)
--
-- NOTEBOOK_SECTIONS must stay in sync with
-- src/features/notebook/types.ts

CREATE TABLE notebook_notes (
    id TEXT PRIMARY KEY,
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    section TEXT NOT NULL CHECK (section IN (
        'metadata', 'research-problem', 'research-questions', 'theory',
        'variables', 'methodology', 'dataset', 'findings', 'limitations',
        'strengths', 'weaknesses', 'relevance', 'general-notes'
    )),
    content TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    UNIQUE (paper_id, section)
);

CREATE TABLE excerpts (
    id TEXT PRIMARY KEY,
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    section TEXT CHECK (section IS NULL OR section IN (
        'metadata', 'research-problem', 'research-questions', 'theory',
        'variables', 'methodology', 'dataset', 'findings', 'limitations',
        'strengths', 'weaknesses', 'relevance', 'general-notes'
    )),
    quote TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    user_note TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX idx_excerpts_paper_id ON excerpts(paper_id);
CREATE INDEX idx_excerpts_section ON excerpts(section);

CREATE TABLE current_thought (
    paper_id TEXT PRIMARY KEY REFERENCES papers(id) ON DELETE CASCADE,
    thought TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
);
