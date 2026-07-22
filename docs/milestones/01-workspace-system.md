# Milestone 01 — Workspace System

**Status:** done
**Depends on:** Milestone 00 (Project Skeleton)

## What this milestone covers

Per the user's request, this milestone also absorbs the **full
database schema design** (originally its own open question) rather
than deferring it — see "Schema" below. All schema files for the
entire roadmap are done as of this milestone, even though most tables
stay empty until their feature milestone lands.

1. Workspace creation — pick a parent folder, name the workspace,
   get a real folder on disk with `papers/`, `exports/`,
   `settings.json`, and a migrated `database.sqlite`.
2. Workspace opening — pick an existing workspace folder, connect to
   its database, auto-catch-up any pending migrations.
3. The app shell now gates behind an active workspace — no workspace,
   no chrome. "Switch Workspace" in the toolbar returns to the
   launcher.

## Schema — done this milestone

Full schema designed and documented in `docs/schema.md`, covering
every table needed through Milestone 09 (Dictionary), even the ones
that won't be read/written until much later. Four migration files
ship now:

- `src-tauri/migrations/0001_workspace_and_papers.sql` — `workspace_meta`, `papers`
- `src-tauri/migrations/0002_reading_state.sql` — `reading_state`
- `src-tauri/migrations/0003_notebook.sql` — `notebook_notes`, `excerpts`, `current_thought`
- `src-tauri/migrations/0004_dictionary_cache.sql` — `dictionary_cache`

All four were run against a real SQLite engine (not just eyeballed) to
verify: tables create cleanly in order, the `notebook_notes`/`excerpts`
section `CHECK` constraint rejects invalid section names, `papers.file_hash`
uniqueness is enforced, and `ON DELETE CASCADE` correctly clears
`reading_state`/`notebook_notes`/`excerpts`/`current_thought` when a
paper is deleted.

**Note for future milestones:** whenever a schema file is added or
changed, this log (or that milestone's own log) must say so explicitly
— per your instruction, schema work gets called out every time, not
just this once.

Migrations are **not** run through `tauri-plugin-sql`'s built-in
migration API — that API keys migrations to a fixed connection string
decided at compile time, which doesn't fit a workspace path chosen by
the user at runtime. Instead `src-tauri/src/features/workspace/mod.rs`
applies them directly via `rusqlite`, tracking progress in
`workspace_meta.schema_version`. Full rationale in `docs/schema.md`.

## Files added

```
docs/schema.md
docs/milestones/01-workspace-system.md          (this file)

src-tauri/migrations/0001_workspace_and_papers.sql
src-tauri/migrations/0002_reading_state.sql
src-tauri/migrations/0003_notebook.sql
src-tauri/migrations/0004_dictionary_cache.sql

src-tauri/src/features/mod.rs
src-tauri/src/features/workspace/mod.rs          create_workspace / open_workspace commands + migration runner

src/features/workspace/types.ts                  WorkspaceInfo (+ raw/camelCase mapping)
src/features/workspace/repository.ts             invoke() wrappers
src/features/workspace/service.ts                folder-picker orchestration, validation
src/features/workspace/ui/WorkspaceLauncher.tsx   first-run screen
src/features/workspace/ui/WorkspaceLauncher.css
src/features/workspace/index.ts                  public exports
```

## Files changed

```
src-tauri/Cargo.toml       + rusqlite (bundled), + chrono
src-tauri/src/lib.rs       registers `mod features`, wires create_workspace/open_workspace
                            into invoke_handler
src/App.tsx                 now holds `workspace: WorkspaceInfo | null` state; renders
                             WorkspaceLauncher until one is set; Toolbar shows the real
                             workspace name; "switch-workspace" action clears it
src/features/README.md      marked workspace/ as done
```

## Verified

- `npx tsc --noEmit` — clean
- `npx vite build` — clean
- All 4 migrations executed against a real SQLite engine with
  constraint/cascade tests (see above) — passed
- **Not verified:** `cargo build` / `cargo tauri dev` — no Rust
  toolchain in this sandbox. The Rust code has been written and
  reviewed carefully, but you should run `cargo tauri dev` locally
  before trusting it fully. Flag anything that doesn't compile and
  I'll fix it immediately.

## Open items for later milestones

- `create_workspace`'s folder-name sanitizer is intentionally basic
  (replaces anything non-alphanumeric with `_`). Fine for now; revisit
  if it ever produces confusing folder names.
- No "recent workspaces" list yet — every open is a manual folder
  pick. Worth considering as a small addition whenever it's annoying
  enough to matter, but not blocking any milestone.
- `settings.json` currently only holds `{ "version": 1 }`. Real
  settings content isn't defined yet — that's implicitly Milestone 03+
  territory as features need workspace-level config.
