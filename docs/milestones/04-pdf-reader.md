# Milestone 04 — PDF Reader

**Status:** done
**Depends on:** Milestone 02 (Storage Module), Milestone 03 (Library Module)

## Schema status this milestone

**No schema files touched.** Confirmed by hash — `0001`–`0004` in
`src-tauri/migrations/` are byte-identical to every prior milestone.
This milestone reads/updates existing `papers` columns
(`page_count`, `last_opened_at`) that Milestone 01 already defined;
no new tables or columns needed.

## What this milestone covers

Actual PDF rendering, replacing the placeholder from Milestone 00.
Selecting a paper in the Library panel (Milestone 03) now really opens
it instead of showing a "coming in Milestone 04" message.

1. **Rust — `read_pdf_bytes(workspace_path, relative_path)`.** Reads a
   paper's PDF off disk and returns it via `tauri::ipc::Response`
   (raw binary), not the default JSON serialization — a multi-MB PDF
   as a JSON array of numbers would be needlessly slow on both ends.
   Uses `std::fs` directly rather than `tauri-plugin-fs`, continuing
   the Milestone 01/03 pattern: workspace paths are arbitrary
   user-chosen locations, and the fs plugin's capability-scope system
   is built around a fixed set of known directories — fighting it for
   this case isn't worth it. `tauri-plugin-fs` stays registered
   (unused so far) since it's still the natural fit for Milestone 13's
   Export.
2. **pdf.js wiring** (`src/features/reader/engine.ts`) — imports
   `pdfjs-dist`, points `GlobalWorkerOptions.workerSrc` at the worker
   bundle via Vite's `?url` import. Needed a new `src/vite-env.d.ts`
   (`/// <reference types="vite/client" />`) so TypeScript recognizes
   that import — first time this project needed Vite's ambient types.
3. **`openPaperDocument`** (`src/features/reader/service.ts`) — calls
   `read_pdf_bytes`, loads the bytes into pdf.js, and calls
   `paperRepository.recordOpened()` (new method) to set `page_count`
   and `last_opened_at` — the first real moment the app knows a
   paper's page count, per docs/schema.md's note that it stays null
   "until first opened."
4. **`renderPage`** — renders one page to a canvas, scaled to fit the
   reader pane's width. No zoom controls, no continuous scroll — fit
   width, one page at a time, is the whole scope here.
5. **`PdfViewer`** — migrated out of `src/components/reader/` (deleted)
   into `src/features/reader/ui/`, now a real component: loads on
   paper change, shows loading/error states, prev/next page nav,
   reports `(page, pageCount)` up to `App.tsx` for the status bar.
   This is the first feature migration the `features/README.md` table
   predicted back in Milestone 00 — `Notebook` is next, in Milestone 06.
6. **App wiring** — `App.tsx` now holds `activePaper`, `page`, and
   `pageCount` state; the status bar shows real values instead of
   hardcoded `0`s. `progressPct` is computed as a plain derived
   display value (`page / pageCount`) — **not persisted**. Saving and
   restoring reading position is explicitly Milestone 05's job, so
   every open still starts at page 1, on purpose.

## Files added

```
src-tauri/src/features/reader/mod.rs         read_pdf_bytes

src/vite-env.d.ts                             Vite ambient types (new — needed for ?url import)
src/features/reader/engine.ts                 pdf.js + worker setup
src/features/reader/service.ts                openPaperDocument, renderPage
src/features/reader/ui/PdfViewer.tsx          real reader (was a placeholder in components/)
src/features/reader/ui/PdfViewer.css
src/features/reader/index.ts                  public exports

docs/milestones/04-pdf-reader.md              (this file)
```

## Files removed

```
src/components/reader/PdfViewer.tsx           migrated to features/reader/ui/
src/components/reader/PdfViewer.css           migrated to features/reader/ui/
```

## Files changed

```
src-tauri/src/features/mod.rs                registers `pub mod reader`
src-tauri/src/lib.rs                           wires read_pdf_bytes into invoke_handler,
                                                 updated header comment
src/components/layout/MainLayout.tsx            imports PdfViewer from features/reader now;
                                                  takes paper/workspacePath/onPageInfo props
src/App.tsx                                       holds activePaper + page/pageCount state;
                                                    "switch-workspace" now also resets them;
                                                    handleOpenPaper actually opens the paper
src/features/library/repository.ts                + recordOpened(id, pageCount, openedAt)
src/features/README.md                              marked reader/ as done, updated the
                                                       components/ migration note
```

## Verified

- `npx tsc --noEmit` — clean
- `npx vite build` — clean, and notably confirms the pdf.js worker
  `?url` import resolved correctly (emitted as its own asset,
  `pdf.worker.min-*.mjs`, ~1.3MB — that's the whole PDF engine, expected)
- Confirmed via `md5sum` that no migration file changed this milestone
- **Not verified:** actually opening a real PDF through `cargo tauri
  dev` — no Rust toolchain in this sandbox, and this is the first
  milestone moving real binary data across the Tauri IPC boundary via
  `tauri::ipc::Response`, so I'd treat this as the highest-risk
  unverified piece so far. Specifically worth checking locally:
  - a real multi-page PDF renders correctly and prev/next nav works
  - `page`/`pageCount` in the status bar update as expected
  - closing the Library panel and reopening it still shows the paper
    with a `page_count` now filled in (confirms `recordOpened` wrote
    correctly)
  - a large PDF (dozens of MB) doesn't stall or crash — the binary
    transfer path is new and untested at scale

## Open items for later milestones

- **Bundle size warning:** Vite flagged the JS chunk at ~520KB gzipped
  ~158KB, plus the 1.3MB pdf.js worker. Not a correctness problem, but
  worth revisiting with dynamic `import()` / code-splitting once the
  app has enough features that initial load time starts to matter.
  Not addressed now — premature for a skeleton this size.
- No zoom controls, no continuous/vertical scroll mode, no text
  selection wired to anything yet. Text selection specifically is
  needed for Milestone 07 (Annotation System) — this milestone only
  renders pages, it doesn't make their text interactive.
- No "jump to page" input, only prev/next buttons.
- Page rendering isn't debounced/cancelled if the user clicks
  next/prev rapidly — could render an already-stale page briefly.
  Minor, revisit if it's noticeable in practice.
