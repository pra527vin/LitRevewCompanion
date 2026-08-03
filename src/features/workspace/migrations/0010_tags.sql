-- Tags — quick markers like "Read" or "Important" alongside any
-- free-text label a researcher wants, distinct from the fixed,
-- single-per-paper `categories` list (migration 0008): a paper can
-- carry any number of tags, so this is a join table rather than a
-- column on `papers`. Tags themselves are created on first use, same
-- getOrCreate pattern as categories.
CREATE TABLE tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
);

CREATE TABLE paper_tags (
    paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (paper_id, tag_id)
);

CREATE INDEX idx_paper_tags_tag_id ON paper_tags(tag_id);
