# Milestone 03 — Library Module

**Status:** done
**Depends on:** Milestone 01 (Workspace System), Milestone 02 (Storage Module)

## Schema status this milestone

**No schema files touched.** Confirmed by hash — `0001`–`0004` in
`src-tauri/migrations/` are byte-identical to Milestones 01 and 02.
This milestone only *populates* the `papers` table that Milestone 01
already created; no new columns or tables needed.

## What this milestone covers

"Add Paper" (Design_Decisions.md → Paper Import): copy the PDF into
the workspace library, dedupe by file hash. Plus a minimal Library
panel to actually see what's been imported — the design doc doesn't
specify a persistent library sidebar (the wireframe only shows a
toolbar "Add Paper" button), so this is a lightweight modal rather
than permanent UI, kept out of the way of "PDF should always remain
the visual focus."

1. **Rust (filesystem only):**
   - `hash_pdf_file(path)` — streams the file through SHA-256, returns
     the hex digest. Read-only, no writes — lets the JS side check for
     a duplicate before paying the cost of copying anything.
   - `copy_pdf_into_workspace(workspace_path, source_path, file_hash)` —
     copies into `<workspace>/papers/<hash>.pdf`. Using the hash as
     the filename makes storage content-addressable: re-importing the
     same file is a no-op copy (`.exists()` check), and there's no way
     for two different source files to collide on disk.
2. **JS `library` feature** (repository → service → UI), same layering
   as `workspace`:
   - `repository.ts` — `findByHash`, `insert`, `listAll` against
     `papers`, via `storageClient` from Milestone 02. This is the
     first real usage of `storageClient.select`/`.execute` — confirms
     the Milestone 02 plumbing actually gets used as intended.
   - `service.ts` — `importPaper(workspacePath)`: opens a PDF picker →
     hashes it → checks for a duplicate → copies if new → inserts a
     catalog row with a placeholder title (from the filename; DOI
     metadata resolution is Milestone 08's job) → returns an
     `ImportResult` (`imported` / `duplicate` / `cancelled`) so the UI
     can react to each case distinctly.
3. **`LibraryPanel`** — modal listing imported papers (title, added
   date) with an "Add Paper…" button. Opened from the toolbar's "Add
   Paper" action (previously a stub). Clicking a paper closes the
   panel and shows a placeholder status — actually opening a paper in
   the reader is Milestone 04.

## Files added

```
src-tauri/src/features/library/mod.rs        hash_pdf_file, copy_pdf_into_workspace

src/features/library/types.ts                Paper, PaperRow, fromRow
src/features/library/repository.ts           findByHash, insert, listAll
src/features/library/service.ts              importPaper, listPapers
src/features/library/ui/LibraryPanel.tsx
src/features/library/ui/LibraryPanel.css
src/features/library/index.ts                public exports

docs/milestones/03-library-module.md         (this file)
```

## Files changed

```
src-tauri/Cargo.toml     + sha2 (file hashing)
src-tauri/src/features/mod.rs    registers `pub mod library`
src-tauri/src/lib.rs              wires hash_pdf_file / copy_pdf_into_workspace into
                                    invoke_handler, updated header comment
src/App.tsx                        "add-paper" toolbar action opens LibraryPanel instead of
                                     a stub status message; new handleOpenPaper placeholder
src/features/README.md              marked library/ as done
```

## Verified

- `npx tsc --noEmit` — clean
- `npx vite build` — clean
- Confirmed via `md5sum` that no migration file changed this milestone
- **Not verified:** the actual import flow end-to-end (`cargo tauri
  dev`, picking a real PDF, confirming the row lands in `papers` and
  a re-import of the same file is correctly flagged as duplicate) —
  same sandbox limitation as prior milestones, no Rust toolchain here.
  This is the first milestone doing real file I/O and real DB writes
  together, so it's worth testing deliberately: import a PDF, close
  and reopen the workspace, confirm it's still listed; try importing
  the same file twice and confirm the second attempt says "already in
  your library" instead of creating a duplicate row.

## Open items for later milestones

- `crypto.randomUUID()` is used for paper IDs (browser Web Crypto API,
  available in Tauri's webview). No issue expected, but flagging it
  since it's the first place the frontend generates IDs rather than
  Rust — worth knowing if it ever needs to move to a Rust-generated
  UUID for consistency.
- Placeholder titles come straight from the filename. Milestone 08
  (Metadata & DOI) is expected to overwrite `title`/`authors`/`doi`
  once real metadata resolution exists — no migration needed for that,
  just an `UPDATE`.
- `page_count` stays `null` until Milestone 04 opens the file with
  pdf.js and can report how many pages it has.
- No delete/remove-paper flow yet. Not blocking anything so far; add
  when it's actually needed.
