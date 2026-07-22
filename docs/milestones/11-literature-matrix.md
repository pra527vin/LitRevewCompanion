# Milestone 11 — Literature Matrix

**Status:** done
**Depends on:** Milestone 03 (Library), Milestone 06 (Notebook)

## Schema status this milestone

**No schema files touched.** Confirmed by `md5sum` against every prior
milestone — `0001`–`0004` in `src-tauri/migrations/` are unchanged.
docs/schema.md says it explicitly under "Deliberately NOT in the
schema": *"Literature Matrix rows — the matrix is a query over papers
+ notebook_notes, not its own table."* This milestone is that query,
nothing more.

## The circular-import trap, avoided as predicted

Milestone 10's log (and `src/features/README.md`) flagged that
Literature Matrix would hit the same shape of problem as Paper
Summary: a feature that aggregates *across* other features' data
naturally wants to import both of them, and if either of those tempts
you to trigger it *from inside* one of the features it reads from,
that's a real (runtime, not type-only) circular import.

Here the trigger was never at risk of living inside `library/` or
`notebook/` — "Review Matrix" has been a Toolbar action (and a stub in
`App.tsx`) since Milestone 00, unlike Paper Summary which needed a new
"View Summary" button grafted onto the Notebook panel. So the
one-way-dependency rule just meant: `literature-matrix/service.ts`
imports `libraryService` and `notebookService` (the *service* layer of
each, matching the layering `paper-summary` used, not their
repositories directly), and neither of those features imports
anything from `literature-matrix`. `App.tsx` owns `matrixOpen` and
renders `LiteratureMatrixView` itself, the same ownership pattern as
`summaryOpen`.

Re-ran the same verification Milestone 10 used: `npx vite build`,
explicitly checked the output for "circular" — clean.

## Interpretation calls

1. **Column set: the 5 from the wireframe, not all 12 notebook
   sections.** `docs/wireframes/03_Literature_Matrix.html` shows
   exactly Methodology / Dataset / Findings / Limitations / Relevance
   as columns, next to a Paper column. Design_Decisions.md's own text
   doesn't specify the columns beyond pointing at "the structured
   notebook," so the wireframe is the only concrete spec here. Treated
   it as the deliberate set rather than an illustrative example — a
   12-column table would defeat "compares many papers side by side"
   (Design_Decisions.md → Review Matrix) by making every row require
   horizontal scrolling to read one paper.
2. **Notes only, no excerpts.** Paper Summary (Milestone 10) shows
   both free-text notes *and* assigned excerpt blockquotes per
   section. The matrix wireframe's cells are plain text ("DID", "Nepal
   Panel", "High") — a comparison table reads as a table, not a
   collapsed version of the summary view. Excerpts remain reachable by
   clicking through to the paper (Paper Summary or the reader) rather
   than duplicated inline here.
3. **Row action opens the reader, not Paper Summary.**
   Design_Decisions.md → Review Matrix: "each paper summary remains
   linked back to its PDF." Read that literally — clicking a paper's
   title in the matrix calls the existing `handleOpenPaper` in
   `App.tsx` (same flow the Library panel uses), closing the matrix
   and opening that paper in the reader. Deliberately did **not** wire
   it to open Paper Summary instead, even though that also exists now
   — doing so would mean `LiteratureMatrixView` needs a paper that
   isn't necessarily `activePaper`, which means either threading a
   second "which paper is the summary for" state through `App.tsx` or
   changing `summaryOpen`'s existing contract. Not worth the added
   surface for this milestone; noted below as a clean follow-up.
4. **Read-only, no inline editing.** Matches Design_Decisions.md's
   explicit split — "the matrix is NOT used while reading... it is
   generated after reading from the structured notebook," i.e. a view
   over notebook data, not an alternate way to write it. Editing stays
   in the Notebook accordion (Milestone 06).
5. **Empty cells render as "—".** No signal either way in the spec;
   picked for the same reason Milestone 10 hides empty summary
   sections — an empty string in a dense comparison table reads as "is
   this cell broken," a placeholder dash reads as "nothing captured
   here yet."

## What this milestone covers

1. **`literatureMatrixService.buildMatrix()`** — fetches every paper
   (`libraryService.listPapers()`), then for each one loads its notes
   (`notebookService.loadNotes`) in parallel via `Promise.all`, and
   maps the 5 `MATRIX_COLUMNS` sections onto a `MatrixRow`. N+1 query
   shape (one `loadNotes` call per paper) — acceptable at the scale
   this app targets (Design_Decisions.md's own numbers are in the
   hundreds of papers per researcher, not thousands); flagged below as
   a candidate for batching if it's ever felt.
2. **`LiteratureMatrixView`** — same modal chrome as `LibraryPanel`/
   `PaperSummaryView` (backdrop + card), but wider (1120px vs. 520/640)
   and taller-content-oriented, since it's a table rather than a form
   or document. Sticky header row so column labels stay visible while
   scrolling many papers. Long cell content clamps to 4 lines with the
   full text available via the native `title` tooltip on hover —
   keeps rows scannable without silently losing text.
3. **Wired the "Review Matrix" toolbar action**, stubbed since
   Milestone 00 — no Toolbar/ToolbarAction changes needed, just an
   explicit case in `App.tsx`'s `handleToolbarAction` instead of
   falling through to the generic "coming soon" stub.
4. **`matrixOpen` reset on workspace switch**, same as `summaryOpen` —
   the panel would otherwise keep rendering a query built against a
   database connection that `switch-workspace` just closed.

## Files added

```
src/features/literature-matrix/types.ts                MATRIX_COLUMNS, MatrixRow, MatrixColumnId
src/features/literature-matrix/service.ts                buildMatrix (query only, no new table)
src/features/literature-matrix/ui/LiteratureMatrixView.tsx   read-only table modal
src/features/literature-matrix/ui/LiteratureMatrixView.css
src/features/literature-matrix/index.ts                    public exports

docs/milestones/11-literature-matrix.md                  (this file)
```

## Files changed

```
src/App.tsx                     + matrixOpen state; "review-matrix" case in
                                  handleToolbarAction (no longer falls through to
                                  the generic stub); renders LiteratureMatrixView
                                  as a sibling of LibraryPanel/PaperSummaryView;
                                  resets matrixOpen on workspace switch
src/features/README.md           marked literature-matrix/ done; added a note
                                   confirming Milestone 10's predicted
                                   circular-import shape didn't recur, and why
```

## Verified

- `npx tsc --noEmit` — clean
- `npx vite build` — clean, explicitly checked output for circular
  dependency warnings (none)
- Confirmed via `md5sum` that no migration file changed this milestone
- **Not verified:** actual visual output through `cargo tauri dev` — no
  Rust toolchain in this sandbox, same limitation as every prior
  milestone; this one is pure frontend composition (no new Rust code),
  same lower-risk shape as Milestone 10. Worth a quick local check:
  open a workspace with a few papers that have notes in some but not
  all of the 5 matrix sections, click "Review Matrix," confirm every
  paper appears as a row, empty cells show "—" rather than blank
  space, long cell text clamps with a working hover tooltip, and
  clicking a paper's title closes the matrix and opens that paper in
  the reader.

## Open items for later milestones

- **No sort or filter.** With enough papers the matrix becomes a wall
  of text; Design_Decisions.md doesn't call for sorting here, but
  Milestone 12 (Search) may be a more natural home for "find/filter
  within the matrix" than bolting it on separately.
- **No link from the matrix into Paper Summary.** Noted in
  Interpretation Calls above — reasonable to add once there's an
  actual need to compare full assembled summaries rather than just the
  5-column table, but it means `App.tsx` needs a paper reference for
  `summaryOpen` that isn't `activePaper`. Small, contained change when
  it's wanted.
- **N+1 query per paper.** Fine at current scale; if it's ever felt, a
  single JOIN-shaped query (`papers` × `notebook_notes` filtered to
  the 5 section ids) in a new `literature-matrix/repository.ts` would
  replace the per-paper `notebookService.loadNotes` calls without
  changing `MatrixRow`'s shape or any UI code.
- **Column set is hardcoded to the wireframe's 5 sections.** If the
  researcher ever wants a different comparison axis (e.g. Theory, or
  Weaknesses), `MATRIX_COLUMNS` in `types.ts` is the one place to
  change — but making it user-configurable is a real feature (needs
  its own storage, presumably `settings.json` per Design_Decisions.md's
  workspace structure) and out of scope here.
