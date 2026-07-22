# Milestone 07 — Annotation System

**Status:** done
**Depends on:** Milestone 04 (PDF Reader), Milestone 06 (Research Notebook)

## Schema status this milestone

**No schema files touched.** Confirmed by hash — `0001`–`0004` in
`src-tauri/migrations/` are byte-identical to every prior milestone.
`excerpts` was already created in Milestone 01; this milestone starts
reading and writing it.

**No Rust changes at all this milestone** — first one where that's
true. Text extraction and selection happen entirely in the frontend
via pdf.js; nothing here needed a new Tauri command.

## What this milestone covers

The Read → Highlight → Assign to notebook section → Continue reading
workflow from Design_Decisions.md, end to end.

1. **Selectable text over the PDF.** Milestones 04–06 only ever
   rendered pages to a `<canvas>` — pixels, not text, so nothing was
   selectable. This milestone adds a real text layer using pdf.js's
   core `TextLayer` API (`pdfjsLib.TextLayer`, exported directly from
   `pdfjs-dist` — no need to pull in the full `pdf_viewer.js`/
   `pdf_viewer.css` bundle for one feature). Rendered as an absolutely
   positioned, transparent-text overlay on top of the canvas.

   **A specific gotcha worth flagging:** `TextLayer`'s constructor
   sizes its own container via `calc(var(--scale-factor) * pageWidth)`
   — it reads `--scale-factor` but never sets it. Missing that
   entirely would silently break span positioning (the CSS `calc()`
   would resolve against an undefined variable). `renderPage()` in
   `src/features/reader/service.ts` now sets
   `textLayerContainer.style.setProperty("--scale-factor", ...)`
   before constructing the text layer, and the manual width/height
   assignment from Milestone 04 was removed since `TextLayer`
   overwrites it anyway. Confirmed by reading pdf.js's own source
   (`setLayerDimensions` in `pdf.mjs`) rather than assuming — this
   isn't something the type definitions surface, only the
   implementation.
2. **Selection → popover.** `PdfViewer` listens for `mouseup` inside
   the text layer, checks for a non-empty, non-collapsed selection
   actually inside that page's text layer (not some other UI element),
   and shows `HighlightPopover` anchored to the selection's bounding
   rect. The popover asks for an optional note only — deliberately
   **no section picker here** (see the design decision below).
3. **`excerptRepository`/`annotationsService`** (`src/features/annotations/`)
   — `saveExcerpt` always inserts with `section: null`; `listExcerpts`,
   `reassignExcerpt`, `unassignExcerpt`, `deleteExcerpt` round out CRUD.
   **Verified against a real SQLite engine before being wired in**:
   insert with `NULL` section, update to assign, update back to
   `NULL` to unassign, delete — all confirmed against the actual
   migration files.
4. **Notebook displays excerpts:**
   - An "Unassigned Highlights" tray at the top of the notebook (only
     rendered when non-empty) lists every excerpt with `section: null`
     — quote, page number, optional note, a dropdown to assign it to
     one of the 12 sections, and a remove button.
   - Each of the 12 free-text sections now also renders its assigned
     excerpts above the textarea.
   - Assign/remove are optimistic (local state updates immediately,
     the DB write happens in the background) rather than waiting on a
     round trip — consistent with the "reduce friction" principle.
5. **`excerptsVersion` lifted to `App.tsx`** — bumped whenever
   `PdfViewer` reports a saved highlight (`onExcerptSaved`), passed
   down to `Notebook` so it knows to refetch. Chosen over lifting the
   full excerpt array to `App.tsx`, since Notebook already owns its
   own per-paper data loading pattern (notes work the same way) and a
   version counter is simpler than keeping two components' copies of
   the same array in sync.
6. Saving a highlight now also sets the status bar's context message
   to "Highlight saved" — the exact example string from
   Design_Decisions.md's status bar section, first real use of that
   slot beyond the toolbar-action stubs.

## A design decision worth flagging

**The highlight popover doesn't ask which section to assign to.**
Design_Decisions.md's own workflow diagram lists Highlight and Assign
as separate, sequential steps — not one combined action. Interrupting
an in-progress highlight to make the researcher pick from a 12-option
dropdown works against "reduce friction without reducing thought."
So: every new highlight starts unassigned, and assignment happens
afterward, unhurried, in the Notebook's Unassigned Highlights tray.

## A note on the annotations/notebook dependency direction

`Excerpt.section` is typed as `NotebookSectionId | null` — `annotations`
imports that type from `notebook`. `Notebook` also imports `Excerpt`
(the type) and `annotationsService` from `annotations`, to render and
manage excerpts. That's two features importing from each other, which
would normally be a red flag (a real circular *runtime* dependency).
It isn't one here: both cross-feature imports are `import type` only
(erased entirely at compile time — confirmed no circular-dependency
warning from Rollup in the build output). No UI component is shared
between the two features specifically to keep it this way — the
Unassigned Highlights tray and per-section excerpt cards are written
directly in `Notebook.tsx` rather than imported as a shared
`ExcerptCard` component from `annotations`, which would have forced a
real (non-type) import cycle.

## Files added

```
src/features/annotations/types.ts                Excerpt
src/features/annotations/repository.ts            excerptRepository (CRUD, verified against real SQLite)
src/features/annotations/service.ts                annotationsService (saveExcerpt always unassigned,
                                                      listExcerpts, reassignExcerpt, unassignExcerpt, deleteExcerpt)
src/features/annotations/ui/HighlightPopover.tsx    note-only capture popover
src/features/annotations/ui/HighlightPopover.css
src/features/annotations/index.ts                  public exports

docs/milestones/07-annotation-system.md            (this file)
```

## Files changed

```
src/features/reader/service.ts        renderPage now also renders a TextLayer;
                                        sets --scale-factor explicitly (see gotcha above);
                                        returns the TextLayer so callers can .cancel() it
src/features/reader/ui/PdfViewer.tsx   text layer div added; mouseup selection capture;
                                        shows HighlightPopover; saves via annotationsService;
                                        new onExcerptSaved prop
src/features/reader/ui/PdfViewer.css   .pdf-viewer__page wrapper, .pdf-viewer__text-layer
                                        overlay + span rules (hand-written pdf.js textLayer
                                        conventions, since we use the core API directly
                                        rather than pulling in pdf_viewer.css)
src/components/layout/MainLayout.tsx    threads excerptsVersion/onExcerptSaved through
src/App.tsx                              new excerptsVersion state; handleExcerptSaved bumps it
                                           and sets contextStatus to "Highlight saved"
src/features/notebook/ui/Notebook.tsx    new excerptsVersion prop; loads/displays excerpts
                                           (unassigned tray + per-section lists); assign/remove handlers
src/features/notebook/ui/Notebook.css     .notebook__unassigned tray + .excerpt-card styles
src/features/README.md                    marked annotations/ done
```

## Verified

- Excerpt CRUD tested against a real SQLite engine loaded with the
  actual migration files, before being used in application code
  (insert unassigned, assign, unassign, delete).
- `npx tsc --noEmit` — clean, including the cross-feature `import type`
  usage between `notebook` and `annotations`.
- `npx vite build` — clean, **and explicitly checked for circular
  dependency warnings** (Rollup normally surfaces these) — none found,
  confirming the type-only import strategy didn't create a real cycle.
- The `--scale-factor` requirement was confirmed by reading pdf.js's
  actual bundled source (`setLayerDimensions` in `node_modules/pdfjs-dist/build/pdf.mjs`),
  not assumed from the type definitions or documentation.
- **Not verified:** the actual selection → popover → save → appears-in-Notebook
  flow through `cargo tauri dev` — no Rust toolchain in this sandbox,
  and this is the most interaction-heavy, DOM-API-dependent milestone
  so far (real text selection, real `getBoundingClientRect()`
  positioning, real pdf.js text layer rendering). I'd treat this as
  the single highest-risk unverified milestone in the project so far.
  Specifically worth testing locally:
  - selecting text actually works (the text layer is correctly
    aligned over the canvas — misaligned `--scale-factor` would make
    spans overlap the wrong glyphs)
  - the popover appears in a sane position near the selection, not
    off-screen or misplaced
  - saving a highlight makes it appear in the Notebook's Unassigned
    tray without needing to switch papers or reload
  - assigning it to a section moves it into that section's excerpt
    list and out of the Unassigned tray
  - switching pages clears any in-progress (unsaved) selection state
    correctly, and doesn't throw from the text-layer cancel/rebuild

## Open items for later milestones

- No visual highlight persists on the PDF page itself after saving —
  only the quote text is stored (matches the schema: `excerpts.quote`
  is text, not a stored selection range/rect), so there's no "yellow
  highlight mark" rendered back onto the page on reopen. Adding that
  would need persisting selection geometry, which the current schema
  doesn't have a column for — a real scope decision if wanted later,
  not an oversight.
- No edit for an excerpt's note after saving — only remove. Add if it
  turns out to matter in practice.
- Clicking outside the `HighlightPopover` doesn't dismiss it — only
  explicit Cancel/Save do. Minor polish item, not a correctness issue.
- Rapid page navigation while a text-layer render is in-flight is
  handled (previous layer's `.cancel()` is called), but not
  stress-tested. Same category of open item as Milestone 04's
  "rendering isn't debounced" note.
