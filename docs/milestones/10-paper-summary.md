# Milestone 10 — Paper Summary

**Status:** done
**Depends on:** Milestone 03 (Library), Milestone 06 (Notebook), Milestone 07 (Annotations)

## Schema status this milestone

**No schema files touched.** Confirmed by hash — `0001`–`0004` in
`src-tauri/migrations/` are byte-identical to every prior milestone.
Paper Summary has no storage of its own — it's a computed view over
`papers` + `notebook_notes` + `excerpts`, all of which already exist.
Matches docs/schema.md's own note under "Deliberately NOT in the
schema": *"Literature Matrix rows — the matrix is a query over papers
+ notebook_notes, not its own table."* Paper Summary is the same kind
of thing, one milestone earlier.

## A real circular-import bug, caught and fixed before shipping

Built `Notebook` to render `PaperSummaryView` directly at first (a
"View Summary" button opening a modal owned by `Notebook`'s own local
state). That's `notebook → paper-summary` for the component. But
`paper-summary/service.ts` needs `notebookService` and
`NOTEBOOK_SECTION_DEFS` from `notebook` to assemble the summary — so
that's `paper-summary → notebook` too. Together: a real circular
import, and **not** the safe kind from Milestone 07 (which was
type-only in both directions and got erased at compile time). This one
involves actual runtime values on both edges.

**Fixed by lifting ownership to `App.tsx`**, which already sits above
both features in the tree (same pattern `excerptsVersion` used in
Milestone 07 for reader↔notebook coordination):
- `Notebook` takes a new `onViewSummary: () => void` prop and calls it
  on button click — it never imports anything from `paper-summary`.
- `App.tsx` owns `summaryOpen` state and renders `PaperSummaryView`
  itself, as a sibling to `LibraryPanel`.

Confirmed the fix actually works, not just assumed: ran `vite build`
and explicitly grepped its output for "circular" (Rollup surfaces
these) — clean, both before writing this log and as part of normal
verification.

**Added a note to `features/README.md` flagging that Milestone 11
(Literature Matrix) will hit the identical shape of problem** —
aggregating across every paper's notebook data — so it doesn't get
rediscovered the hard way next time.

## What this milestone covers

1. **`paperSummaryService.buildSummary(paperId)`** — fetches notes
   (`notebookService.loadNotes`) and excerpts
   (`annotationsService.listExcerpts`) in parallel, maps them onto the
   12 notebook sections in their defined order, and **filters out
   sections with neither content nor excerpts**. This is an
   interpretation call, not stated explicitly in Design_Decisions.md
   — the wireframe example only shows sections that have content, but
   doesn't say whether that's because empty ones should be hidden or
   just because that's what the example paper happened to have.
   Went with hiding empty sections since a "summary" padded with a
   dozen empty headings undermines the point.
2. **Strictly read-only, generates nothing new.** Every word in the
   output already existed in the researcher's own notes or highlights
   — this is assembly/formatting, not authorship. Called out
   explicitly in `service.ts`'s own doc comment given
   Design_Decisions.md's firm stance against AI summaries and
   AI-generated literature reviews.
3. **`PaperSummaryView`** — a modal (same visual pattern as
   `LibraryPanel`: backdrop + card) showing metadata
   (title/authors/journal/year/DOI) up top, then each non-empty
   section's free text and its assigned excerpts (as blockquotes with
   page numbers), styled to read like an assembled document rather
   than another form — serif type for the prose content, distinct from
   the sans-serif UI chrome used everywhere else.
4. **Trigger:** a small "View Summary" button in a new header bar atop
   the Notebook panel. Design_Decisions.md's Toolbar list doesn't
   include a Paper Summary entry (only Review Matrix, which is
   Milestone 11's job and will presumably link to per-paper summaries
   once it exists) — so this needed its own access point for now
   rather than reusing/pre-wiring an existing toolbar button.

## Files added

```
src/features/paper-summary/types.ts               SummarySection, PaperSummary
src/features/paper-summary/service.ts               buildSummary (assembly only, no generation)
src/features/paper-summary/ui/PaperSummaryView.tsx    read-only modal
src/features/paper-summary/ui/PaperSummaryView.css
src/features/paper-summary/index.ts                  public exports

docs/milestones/10-paper-summary.md                 (this file)
```

## Files changed

```
src/features/notebook/index.ts          + NOTEBOOK_SECTION_DEFS, + NotebookSectionDef
                                          export (paper-summary needs the ordered
                                          section list; wasn't exported before)
src/features/notebook/ui/Notebook.tsx    + header bar with "View Summary" button;
                                           takes onViewSummary callback prop instead
                                           of owning PaperSummaryView directly (see
                                           circular-import fix above)
src/features/notebook/ui/Notebook.css     + .notebook__header / .notebook__summary-button
src/components/layout/MainLayout.tsx      threads onViewSummary through to Notebook
src/App.tsx                                owns summaryOpen state; renders
                                             PaperSummaryView as a LibraryPanel sibling;
                                             resets summaryOpen on workspace switch
src/features/README.md                      marked paper-summary/ done; added a note
                                              about the circular-import trap for
                                              composition features, flagging Milestone
                                              11 will face the same shape of problem
```

## Verified

- `npx tsc --noEmit` — clean
- `npx vite build` — clean, **explicitly checked for circular
  dependency warnings** after the fix (none found)
- Confirmed via `md5sum` that no migration file changed this milestone
- **Not verified:** the actual assembled summary's visual output
  through `cargo tauri dev` — no Rust toolchain in this sandbox, same
  as always, though this milestone has no new Rust code at all (pure
  frontend composition) so the risk here is lower than Milestones
  07–09. Worth a quick local check: open a paper with some notes and a
  few highlights in different sections, click "View Summary," confirm
  sections appear in the right order, empty sections are correctly
  omitted, and excerpts show under the right section with correct
  page numbers.

## Open items for later milestones

- No export/print action from this view yet — that's Milestone 13.
  The section-assembly shape here (`PaperSummary` / `SummarySection`)
  is deliberately simple and should be directly reusable when Export
  needs the same "paper's notes as structured content" data.
- No way to jump from a summary's excerpt back to that exact page in
  the reader (page number is shown as text, not a link). Would need
  the summary modal to close and hand off a "jump to page N" request
  up to `App.tsx`/`PdfViewer` — skipped for scope, not a technical
  blocker if wanted later.
- Metadata display here duplicates `MetadataSection`'s read display
  logic (title/authors/journal/year formatting) in a slightly
  different layout. Small duplication, not worth abstracting yet for
  two call sites.
