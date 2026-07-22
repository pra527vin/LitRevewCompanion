-- Post-Milestone-13 pass — paper categorization at upload.
--
-- A fixed, user-managed list (not a free-text tag per paper) — rows
-- are created inline from the "Add Paper" review step's "new
-- category" input the first time a name is used, then offered as a
-- dropdown for every paper after that. `category_id` is nullable:
-- categorizing at upload is optional, never required to finish an
-- import.
CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
);

ALTER TABLE papers ADD COLUMN category_id TEXT REFERENCES categories(id) ON DELETE SET NULL;
