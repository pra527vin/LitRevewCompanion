# Milestone 02 — Storage Module

**Status:** done
**Depends on:** Milestone 01 (Workspace System)

## Schema status this milestone

**No schema files touched.** Confirmed by hash — `0001`–`0004` in
`src-tauri/migrations/` are byte-identical to Milestone 01's versions.
This milestone is pure plumbing on top of the existing schema, not a
schema change. (Per your instruction: every milestone log states the
schema status explicitly, even when the answer is "unchanged.")

## What this milestone covers

The shared Repository-layer foundation that every future feature
(Library, Notebook, Annotations, Metadata, ...) builds on, per
`UI → Service → Repository → SQLite`:

1. **`storageClient`** (`src/features/storage/client.ts`) — the single
   connection to the active workspace's `database.sqlite`, opened via
   `@tauri-apps/plugin-sql`. Exposes `connect(dbPath)`, `disconnect()`,
   `isConnected()`, and generic `select<T>(query, params)` /
   `execute(query, params)` — every feature's own repository calls
   these instead of touching `plugin-sql` directly.
2. **`StorageError`** (`src/features/storage/errors.ts`) — wraps
   connection/query/execute failures with a readable message plus the
   original cause, so feature UIs can catch one error type.
3. **Wired into the workspace lifecycle:** `workspaceService.createWorkspace()`
   and `.openWorkspace()` now call `storageClient.connect(workspace.dbPath)`
   right after the Rust side hands back a `WorkspaceInfo`, so the DB
   connection is live by the time the UI shows the workspace as ready.
   `App.tsx`'s "switch workspace" action now calls
   `storageClient.disconnect()` before dropping the workspace, instead
   of just discarding React state and leaking the old connection.

## A Milestone 01 fix bundled in here

`WorkspaceInfo` only exposed the workspace root folder (`path`), not
the database file path. The storage client needs the exact `.sqlite`
file path, and reconstructing it in JS via string concatenation
(`` `${path}/database.sqlite` ``) breaks on Windows (backslash
separator). Fixed at the source instead: the Rust struct now returns
`db_path` directly (computed the same way it already was internally),
and the TS type/mapping picked it up as `dbPath`. This touches
Milestone 01 files, called out explicitly rather than silently folded
in:

- `src-tauri/src/features/workspace/mod.rs` — added `db_path` field
- `src/features/workspace/types.ts` — added `dbPath` (+ raw mapping)

## Files added

```
src/features/storage/client.ts     connect/disconnect/select/execute
src/features/storage/errors.ts     StorageError
src/features/storage/index.ts      public exports
docs/milestones/02-storage-module.md   (this file)
```

## Files changed

```
src-tauri/src/features/workspace/mod.rs   + db_path field on WorkspaceInfo (Milestone 01 fix, see above)
src/features/workspace/types.ts            + dbPath (+ raw mapping)         (same)
src/features/workspace/service.ts          createWorkspace/openWorkspace now call storageClient.connect()
src/App.tsx                                 switch-workspace now calls storageClient.disconnect()
src-tauri/capabilities/default.json          explicit sql:allow-load, sql:allow-close
                                              (don't rely on sql:default alone covering them)
src/features/README.md                        marked storage/ as done
```

## Verified

- `npx tsc --noEmit` — clean
- `npx vite build` — clean
- Confirmed via `md5sum` that no migration file changed this milestone
- **Not verified:** actually opening a live connection through
  `cargo tauri dev` — no Rust toolchain in this sandbox, same
  limitation as Milestone 01. The plugin-sql API surface used here
  (`Database.load`, `.select`, `.execute`, `.close`) matches its
  documented v2 signatures, but you should exercise it for real
  (create a workspace, confirm `storageClient.isConnected()` flips
  true, switch workspaces, confirm it flips false) before trusting it.

## Open items for later milestones

- No retry/backoff on connection failure — if `Database.load()` fails,
  the error surfaces once in the launcher UI and that's it. Fine for
  now; revisit if flaky-connection reports ever come in.
- `select`/`execute` don't currently log anything on success — only on
  failure (via the thrown `StorageError`). Worth adding basic query
  logging behind a debug flag once there are enough real queries to
  make it useful (probably Milestone 06/07).
- Every feature's own repository (Papers, Notebook, Excerpts, ...)
  still needs to be written — this milestone only built the layer
  underneath them, not any of them.
