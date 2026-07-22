# Milestone 05 — Reading State

**Status:** done
**Depends on:** Milestone 04 (PDF Reader)

## Schema status this milestone

**No schema files touched.** Confirmed by hash — `0001`–`0004` in
`src-tauri/migrations/` are byte-identical to every prior milestone.
`reading_state` was already created in Milestone 01; this milestone
just starts reading and writing it.

## A scope note before the summary

The original plan (`src/features/README.md`, written in Milestone 00)
called for a separate `reading-state/` feature folder. Built it as
part of `reader/` instead — `reading_state` is only ever touched by
the reader (restore position on open, save on page turn), so a
separate folder would've been a repository file and two functions
pointing at `reader/` for no real separation of concerns. Called out
explicitly in `features/README.md` in case it looks like a missed
milestone rather than a deliberate merge.

## What this milestone covers

1. **`readingStateRepository`** (`src/features/reader/repository.ts`,
   new file) — `get(paperId)` / `save(paperId, currentPage, progressPct, updatedAt)`.
   `save` is a SQLite upsert (`ON CONFLICT(paper_id) DO UPDATE`) since
   `paper_id` is the table's primary key — first page turn inserts,
   every one after updates in place. **Verified against a real SQLite
   engine before wiring it in** (inserted, then upserted again,
   confirmed the row updates rather than duplicating — see the
   verification step in this session).
2. **`loadReadingState(paperId, numPages)`** — returns the saved page,
   clamped to `[1, numPages]` in case the saved position predates a
   different version of the file, or `1` if there's no saved state.
3. **`saveReadingState(paperId, currentPage, numPages)`** — computes
   `progress_pct` and upserts. No debounce: page turns aren't frequent
   enough to need one, and Design_Decisions.md names autosave as a
   stated principle.
4. **`PdfViewer`** now actually uses both: opening a paper restores its
   saved page instead of always starting at 1; every page change
   (including that initial restore — a harmless redundant write)
   triggers a save.

## Files added

```
src/features/reader/repository.ts     readingStateRepository (get/save upsert)
docs/milestones/05-reading-state.md   (this file)
```

## Files changed

```
src/features/reader/service.ts         + loadReadingState, + saveReadingState
src/features/reader/ui/PdfViewer.tsx    restores saved position on open;
                                          saves on every page change
src/features/README.md                   marked milestone 05 done, removed the
                                           stale `reading-state/` planned-folder
                                           row, added a note explaining the merge
```

## Verified

- Upsert query tested against a real SQLite engine loaded with the
  actual migration files, before being used in application code:
  insert → confirmed row; upsert with new values → confirmed the same
  row updated (not duplicated); row count stayed at 1.
- `npx tsc --noEmit` — clean
- `npx vite build` — clean
- Confirmed via `md5sum` that no migration file changed this milestone
- **Not verified:** the actual open → read a few pages → close → reopen
  round-trip through `cargo tauri dev` — no Rust toolchain in this
  sandbox. Worth checking locally: open a paper, page to somewhere in
  the middle, switch workspaces (or just close/reopen the paper via
  the Library panel), confirm it reopens on the same page rather than
  page 1.

## Open items for later milestones

- Every page change writes to SQLite, including the redundant
  initial-restore write. Not a correctness issue, just a few extra
  no-op writes per paper-open. Worth trimming later if it ever shows
  up as a real cost (unlikely at this scale), not now.
- No "resume reading" entry point yet — you still have to go through
  the Library panel to reopen a paper; there's no "continue where you
  left off" shortcut on app start. Not blocking anything, just not
  built.
