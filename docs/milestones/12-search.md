# Milestone 12 — Search

**Status:** done
**Depends on:** Milestone 03 (Library), Milestone 06 (Notebook), Milestone 07 (Annotations)

## Schema status this milestone

**No schema files touched.** `0001`–`0004` in `src-tauri/migrations/`
are unchanged from Milestone 11. Search is a set of `LIKE` queries
against tables that already exist (`papers`, `notebook_notes`,
`excerpts`) — same "no data lives only here" shape as the Literature
Matrix (Milestone 11) and Paper Summary (Milestone 10), just read
across every paper instead of one paper's Notebook or every paper's
notebook data.

## What's actually new here, vs. Milestones 10/11

Paper Summary and Literature Matrix both compose *existing* per-paper
read methods (`notebookService.loadNotes(paperId)`,
`annotationsService.listExcerpts(paperId)`). Search can't reuse those
directly — a query needs to hit every paper's notes and excerpts in
one pass, not one paper's. So this milestone adds one new
**cross-paper** read method per feature that didn't already have one:

- `paperRepository.search(query)` — `library` already lists all papers
  (`listAll`), so this is really just `listAll` with a `WHERE`. Wrapped
  in `libraryService.searchPapers`.
- `notebookRepository.searchAll(query)` — genuinely new; `notebook`
  previously only ever read `WHERE paper_id = $1`. Wrapped in
  `notebookService.searchNotes`, which also resolves each match's
  section id to a display title so `search/`'s UI doesn't need
  `NOTEBOOK_SECTION_DEFS` imported into it.
- `excerptRepository.search(query)` — same shape, `annotations`
  previously only read per-paper too. Wrapped in
  `annotationsService.searchExcerpts`.

`NotebookNoteRecord` (`notebook/repository.ts`) gained a `paperId`
field — a plain read-shape change, not a schema change. It didn't need
one before (`listByPaper`'s caller already knows the paper id), but
`searchAll`'s caller doesn't, since results span every paper.

Each of these three additions stays entirely inside the feature that
already owned the table (`library`, `notebook`, `annotations`) and is
exposed through that feature's existing `service` — nothing new reads
another feature's repository directly.

## Composition, same shape as Milestones 10 and 11

`src/features/search/service.ts` reads from `libraryService`,
`notebookService`, and `annotationsService` — three services, not
repositories — and none of those three import anything from `search/`
back. Same one-way-dependency rule `paper-summary` and
`literature-matrix` already established; see
`src/features/README.md`'s note on cross-feature composition, extended
below.

`App.tsx` owns `searchOpen` and renders `SearchPanel` itself, the same
way it owns `summaryOpen` and `matrixOpen` — `search/`'s service reads
across three other features, so the trigger can't live inside any one
of them without risking the identical circular-import trap Milestone
10 hit and fixed. "Search" has been a Toolbar action (stubbed) since
Milestone 00, so — like "Review Matrix" in Milestone 11 — no new
trigger UI was needed, just wiring the existing stub.

## Interpretation calls

1. **Three result kinds (paper / note / excerpt), not one merged
   list.** Design_Decisions.md doesn't specify what Search searches —
   it's not mentioned outside the Toolbar bullet and the roadmap
   entry. Chose the three places text a researcher would actually
   remember something by: a paper's own catalog fields, their own
   notebook prose, and a highlighted quote. Each result keeps its kind
   visible (a small badge) rather than presenting a flattened list,
   since "found in your notes" and "found in the PDF text you
   highlighted" are different enough facts to be worth keeping
   distinct — collapsing them would make results harder to scan, not
   easier.
2. **No full-text PDF search.** The PDF's own text isn't indexed
   anywhere — pdf.js can extract text per page, but nothing in this
   app persists it, and Design_Decisions.md's "What the App Does"
   list is about organizing/notebook/comparison, not full-document
   indexing. Searching the PDF itself would be a meaningfully bigger
   feature (an index to build and keep in sync with imported papers)
   than "search what you've already written." Treated as out of scope
   for this milestone; a candidate for Future Ideas if wanted.
3. **Opens the reader, not Paper Summary or a specific notebook
   section.** Every result's paper title reuses `handleOpenPaper`,
   identical to the Literature Matrix's own call in Milestone 11 (see
   that milestone's log, point 3) — and for the same reason: jumping
   straight to a specific notebook section would need `Notebook` to
   accept an "open to this section" prop it doesn't have, which is a
   second new piece of state surface for a feature that doesn't
   otherwise need one. The match itself (section title, or page
   number for an excerpt) is shown right on the result row, so the
   researcher isn't left guessing what they're about to find once the
   paper's open.
4. **`LIKE` substring match, not a ranked/fuzzy search.** No sqlite
   FTS5 virtual table, no relevance scoring. A researcher's own
   workspace is realistically dozens to low hundreds of papers, not a
   corpus that needs ranking — a plain substring match across three
   tables, each already indexed by `paper_id`/`section`, is fast
   enough and easy to reason about. `COLLATE NOCASE` handles the one
   thing that actually matters for a personal tool (case
   sensitivity); true fuzzy matching would be adding search-engine
   complexity Design_Decisions.md's "reduce friction without reducing
   thought" principle doesn't ask for.
5. **Debounced live search (300ms), not a submit button.** Matches
   the debounce `Notebook` already uses for autosave-on-type
   (`SAVE_DEBOUNCE_MS`), reused here as `SEARCH_DEBOUNCE_MS` at the
   same value, for the same reason — feels responsive without firing a
   query per keystroke.
6. **Note/excerpt matches missing their paper are silently dropped**
   (defensive `if (!paper) continue`) rather than shown with a blank
   title. Shouldn't happen given the `ON DELETE CASCADE` foreign keys
   in docs/schema.md, but a search result set is exactly the wrong
   place to throw over one inconsistent row.

## Files added

```
src/features/search/types.ts               SearchResult, SearchResultKind
src/features/search/service.ts              searchService.search(query)
src/features/search/ui/SearchPanel.tsx      debounced input + grouped results,
                                              highlight + centered-snippet helpers
src/features/search/ui/SearchPanel.css
src/features/search/index.ts                public exports

docs/milestones/12-search.md                (this file)
```

## Files changed

```
src/features/library/repository.ts    + paperRepository.search(query)
src/features/library/service.ts        + libraryService.searchPapers(query)
src/features/notebook/repository.ts     NotebookNoteRecord gained `paperId`;
                                          + notebookRepository.searchAll(query)
src/features/notebook/service.ts         + NoteSearchResult type,
                                          + notebookService.searchNotes(query)
src/features/notebook/index.ts           + NoteSearchResult export
src/features/annotations/repository.ts   + excerptRepository.search(query)
src/features/annotations/service.ts       + annotationsService.searchExcerpts(query)
src/App.tsx                               owns searchOpen; wires the existing
                                            "search" Toolbar stub; resets
                                            searchOpen on workspace switch
src/features/README.md                    marked search/ done
```

## Verified

- `npx tsc --noEmit` — clean
- `npx vite build` — clean, explicitly checked output for "circular" —
  none found
- Confirmed via `md5sum` that no migration file changed this milestone
- **Not verified:** actually running the debounced search against a
  real SQLite database through `cargo tauri dev` — no Rust toolchain
  in this sandbox, same limitation every milestone since 03 has
  noted. This milestone adds no new Rust code at all, so the risk
  here is the SQL itself, not the Tauri bridge. Worth a quick local
  check: search for a substring that only appears in one paper's
  title, one note, and one excerpt, and confirm all three show up
  with the right badges and the match highlighted in the snippet.

## Open items for later milestones

- No keyboard navigation (arrow keys / Enter to open the top result)
  in `SearchPanel` — mouse/tap only for now. Small addition if wanted,
  skipped for scope.
- Search doesn't persist recent queries or offer suggestions. Given
  this is a personal research tool, not obviously worth the
  complexity, but noted as a Future Idea candidate.
