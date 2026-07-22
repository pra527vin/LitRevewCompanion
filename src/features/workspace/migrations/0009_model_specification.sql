-- Model Specification (equation) section, positioned right after
-- 'methodology' per src/features/notebook/types.ts's ordering.
--
-- SQLite can't ALTER a CHECK constraint in place, so both tables that
-- constrain `section` to the fixed NOTEBOOK_SECTIONS list are rebuilt
-- here with 'model-specification' added to the allowed list. Column
-- lists mirror the *current* shape of each table (0003 plus 0005's
-- `end_page` on excerpts), not just their original CREATE TABLE.
--
-- NOTEBOOK_SECTIONS must stay in sync with
-- src/features/notebook/types.ts

CREATE TABLE notebook_notes_new (
    id TEXT PRIMARY KEY,
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    section TEXT NOT NULL CHECK (section IN (
        'metadata', 'research-problem', 'research-questions', 'theory',
        'variables', 'methodology', 'model-specification', 'dataset', 'findings',
        'limitations', 'strengths', 'weaknesses', 'relevance', 'general-notes'
    )),
    content TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    UNIQUE (paper_id, section)
);
INSERT INTO notebook_notes_new SELECT * FROM notebook_notes;
DROP TABLE notebook_notes;
ALTER TABLE notebook_notes_new RENAME TO notebook_notes;

CREATE TABLE excerpts_new (
    id TEXT PRIMARY KEY,
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    section TEXT CHECK (section IS NULL OR section IN (
        'metadata', 'research-problem', 'research-questions', 'theory',
        'variables', 'methodology', 'model-specification', 'dataset', 'findings',
        'limitations', 'strengths', 'weaknesses', 'relevance', 'general-notes'
    )),
    quote TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    user_note TEXT,
    created_at TEXT NOT NULL,
    end_page INTEGER
);
INSERT INTO excerpts_new SELECT * FROM excerpts;
DROP TABLE excerpts;
ALTER TABLE excerpts_new RENAME TO excerpts;

CREATE INDEX idx_excerpts_paper_id ON excerpts(paper_id);
CREATE INDEX idx_excerpts_section ON excerpts(section);
