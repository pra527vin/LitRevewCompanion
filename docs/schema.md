# Database Schema

Every workspace has its own `database.sqlite` (per `Design_Decisions.md`
→ Workspace System). This doc defines the **full schema up front**, even
though most tables are only *populated* by later milestones. Rationale:
foreign keys and section-name constraints need to be consistent from
the start, and designing incrementally risks a Milestone 07 migration
that doesn't fit the Milestone 01 shape.

Each table below is tagged with the milestone that first **reads/writes**
it. A table existing early (empty) is fine — that's expected and desired.

Migrations live in `src-tauri/migrations/` as numbered SQL files, applied
in order by `tauri-plugin-sql` on workspace connect. **Never edit an
already-shipped migration file** — add a new one, even for a one-column
fix. This is a hard rule once a workspace has been created by a real
user, since existing `database.sqlite` files won't be reformatted.

---

## Migration tracking

**Not** handled by `tauri-plugin-sql`'s built-in migration runner —
that API keys migrations to a fixed connection string chosen at
compile time, but a workspace's `database.sqlite` path is chosen by
the user at runtime (they pick/create the workspace folder). Instead,
`src-tauri/src/features/workspace/mod.rs` opens the DB directly via
`rusqlite` and applies any migration with `version > workspace_meta.schema_version`,
in order, on every `create_workspace`/`open_workspace` call. This makes
opening an older workspace with a newer app build safe — it just
catches the DB up.

`tauri-plugin-sql` (JS side, `Database.load(...)`) is still what later
features use for everyday `select`/`execute` queries once a workspace
is open — this split only applies to schema migrations themselves.

---

## `workspace_meta`
*Milestone 01 — Workspace System*

Single-row table holding workspace-level info that isn't really
"settings" (those live in `settings.json` per the workspace folder
structure) but is still worth versioning in the DB.

| column         | type    | notes                                  |
|----------------|---------|-----------------------------------------|
| id             | INTEGER | PRIMARY KEY, always `1` (single row)     |
| name           | TEXT    | Display name, e.g. "Thesis Lit Review"    |
| created_at     | TEXT    | ISO 8601                                   |
| schema_version | INTEGER | Highest migration applied, for diagnostics  |

---

## `papers`
*Milestone 01 (table), Milestone 03 (Library Module writes/reads it)*

One row per paper imported into the workspace. The PDF itself lives in
`Workspace/papers/` (copied on import, per Design_Decisions.md); this
row is the catalog entry pointing at it.

| column          | type    | notes                                            |
|-----------------|---------|----------------------------------------------------|
| id              | TEXT    | PRIMARY KEY, UUID                                    |
| title           | TEXT    | nullable until metadata resolved                      |
| authors         | TEXT    | nullable, stored as JSON array string                  |
| doi             | TEXT    | nullable                                                 |
| journal         | TEXT    | nullable                                                  |
| year            | INTEGER | nullable                                                   |
| file_path       | TEXT    | relative to workspace root, e.g. `papers/<hash>.pdf`        |
| file_hash       | TEXT    | UNIQUE — dedup check on import, per Design_Decisions.md       |
| page_count      | INTEGER | nullable until first opened                                     |
| added_at        | TEXT    | ISO 8601                                                          |
| last_opened_at  | TEXT    | nullable                                                           |

Indexes: `UNIQUE(file_hash)`.

---

## `reading_state`
*Milestone 05 — Reading State*

Where the reader left off. One row per paper. Split from `papers` so
Milestone 03 (Library) can ship without this table needing values yet.

| column        | type    | notes                              |
|---------------|---------|--------------------------------------|
| paper_id      | TEXT    | PRIMARY KEY, REFERENCES papers(id)    |
| current_page  | INTEGER | default 1                              |
| progress_pct  | REAL    | 0–100, derived from current_page/page_count |
| updated_at    | TEXT    | ISO 8601                                     |

`ON DELETE CASCADE` from `papers`.

---

## `notebook_notes`
*Milestone 06 — Research Notebook*

The free-text portion of each accordion section (not excerpts — those
are `excerpts`, below). One row per (paper, section) pair — each
section's prose note is a single evolving blob, not a list.

| column     | type | notes                                                |
|------------|------|--------------------------------------------------------|
| id         | TEXT | PRIMARY KEY, UUID                                        |
| paper_id   | TEXT | REFERENCES papers(id)                                       |
| section    | TEXT | CHECK constraint — see `NOTEBOOK_SECTIONS` below              |
| content    | TEXT | the researcher's own free text, may be empty                   |
| updated_at | TEXT | ISO 8601                                                          |

Indexes: `UNIQUE(paper_id, section)`. `ON DELETE CASCADE` from `papers`.

**`NOTEBOOK_SECTIONS`** (shared constant, mirrored in
`src/features/notebook/types.ts` — keep both in sync):
`metadata, research-problem, research-questions, theory, variables,
methodology, model-specification, dataset, findings, limitations,
strengths, weaknesses, relevance, general-notes`

`model-specification` (added in `0009_model_specification.sql`) holds
LaTeX equation source rather than prose — rendered/edited via
`EquationEditor` instead of a plain textarea, see
`src/features/notebook/ui/EquationEditor.tsx`.

---

## `excerpts`
*Milestone 07 — Annotation System*

A captured highlight: quote + page + the researcher's note on it,
optionally assigned to a notebook section. Per Design_Decisions.md's
workflow: Read → Highlight → Assign to section → Continue reading —
so `section` starts nullable (highlighted but not yet assigned).

| column      | type    | notes                                       |
|-------------|---------|------------------------------------------------|
| id          | TEXT    | PRIMARY KEY, UUID                                |
| paper_id    | TEXT    | REFERENCES papers(id)                               |
| section     | TEXT    | nullable, same CHECK values as `notebook_notes`      |
| quote       | TEXT    | the highlighted excerpt                                |
| page_number | INTEGER | the page the highlight *starts* on                      |
| end_page    | INTEGER | nullable — `0005_excerpt_end_page.sql`. NULL means "doesn't cross a page boundary, ends on page_number too"; set only for a highlight spanning two pages. See `formatExcerptPages` in src/features/annotations/types.ts, the one place every UI surface derives its "p. 12" / "p. 12–13" display from. |
| user_note   | TEXT    | nullable                                                  |
| created_at  | TEXT    | ISO 8601                                                    |

Indexes: `paper_id`, `section`. `ON DELETE CASCADE` from `papers`.

---

## `current_thought`
*Milestone 05/06 — powers the status bar's "Current Thought"*

A short reminder of where the researcher stopped thinking, scoped per
paper (matches "Current Thought" living in the status bar while a
specific paper is open).

| column     | type | notes                             |
|------------|------|-------------------------------------|
| paper_id   | TEXT | PRIMARY KEY, REFERENCES papers(id)     |
| thought    | TEXT |                                          |
| updated_at | TEXT | ISO 8601                                  |

`ON DELETE CASCADE` from `papers`.

---

## `dictionary_cache`
*Milestone 09 — Dictionary (future idea, not yet promoted — table exists so the cache survives if/when it lands)*

| column      | type | notes                    |
|-------------|------|----------------------------|
| term        | TEXT | PRIMARY KEY, lowercased      |
| definition  | TEXT |                                |
| source      | TEXT | e.g. "wordnet", "custom"         |
| cached_at   | TEXT | ISO 8601                          |

---

## Deliberately NOT in the schema

- **Settings** — live in `settings.json` in the workspace folder, not
  the DB, per Design_Decisions.md's workspace structure.
- **Literature Matrix rows** — the matrix (Milestone 11) is a *query*
  over `papers` + `notebook_notes`, not its own table. No data lives
  only in the matrix.
- **AI summaries / AI-generated content of any kind** — out of scope
  per Design_Decisions.md § What the App Does NOT Do. No table should
  ever be designed assuming model-generated content lives in it.

---

## Migration file plan

| file                              | tables created                          |
|------------------------------------|-------------------------------------------|
| `0001_workspace_and_papers.sql`     | `workspace_meta`, `papers`                  |
| `0002_reading_state.sql`             | `reading_state`                              |
| `0003_notebook.sql`                   | `notebook_notes`, `excerpts`, `current_thought` |
| `0004_dictionary_cache.sql`            | `dictionary_cache`                               |

All four ship in Milestone 01 (this milestone) even though most tables
stay empty until their feature milestone. This keeps foreign keys valid
from day one and avoids a later migration having to retrofit
`ON DELETE CASCADE` onto an existing column.
