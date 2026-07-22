# Feature Modules

Empty for now — this is where Milestones 01+ live. Per the Engineering
Principles in `Design_Decisions.md`, each feature is self-contained and
follows the same internal layering:

```
features/<feature-name>/
  ui/          React components + hooks scoped to this feature
  service/     Business logic, orchestrates repository calls,
               knows nothing about React or SQL
  repository/  Data access only — reads/writes via storageClient
               (sql.js), knows nothing about business rules
  types.ts     Shared types for the feature
  index.ts     Public interface — everything outside the feature
               imports from here only, never reaches into ui/
               service/ repository/ directly
```

Rules carried over from Design_Decisions.md:

- **Stable public interfaces** — a feature's `index.ts` is the contract;
  refactor freely inside, but changing the export shape is a breaking
  change for the rest of the app.
- **Replaceable modules** — e.g. the PDF rendering engine should be
  swappable without touching the Notebook feature.
- **One feature per implementation prompt** — don't build Workspace
  System and Storage Module in the same pass.

## Planned modules (in milestone order)

| Milestone | Feature folder       | Status |
|-----------|-----------------------|--------|
| 01        | `workspace/`           | ✅ done — see docs/milestones/01-workspace-system.md |
| 02        | `storage/` (shared repository layer, not really a "feature") | ✅ done — see docs/milestones/02-storage-module.md |
| 03        | `library/`              | ✅ done — see docs/milestones/03-library-module.md |
| 04        | `reader/`                | ✅ done — see docs/milestones/04-pdf-reader.md |
| 05        | `reader/` (reading state added, no separate folder — see note) | ✅ done — see docs/milestones/05-reading-state.md |
| 06        | `notebook/`                | ✅ done — see docs/milestones/06-research-notebook.md |
| 07        | `annotations/`               | ✅ done — see docs/milestones/07-annotation-system.md |
| 08        | `library/` (metadata + DOI lookup added, no separate folder — see note) | ✅ done — see docs/milestones/08-metadata-doi.md |
| 09        | `dictionary/`                     | ✅ done — see docs/milestones/09-dictionary.md |
| 10        | `paper-summary/`                     | ✅ done — see docs/milestones/10-paper-summary.md |
| 11        | `literature-matrix/`                    | ✅ done — see docs/milestones/11-literature-matrix.md |
| 12        | `search/`                                 | ✅ done — see docs/milestones/12-search.md |
| 13        | `export/`                                    | ✅ done — see docs/milestones/13-export.md |

The `src/components/` tree (Toolbar, MainLayout, StatusBar) is what's
left of the Milestone 00 shell. As each feature above lands, the
relevant piece migrates from `components/` into its feature folder's
`ui/` — `PdfViewer` moved in Milestone 04, `Notebook` +
`AccordionSection` moved in Milestone 06. What's left in
`components/` from here on is genuinely cross-cutting chrome, not a
future feature's UI in waiting.

**Note on Milestone 05:** the original plan (Milestone 00) called for
a separate `reading-state/` folder. In practice it's a few functions
plus one repository file bolted onto `reader/` — `reading_state` only
ever gets read/written *by* the reader (restore-on-open,
save-on-page-turn), nothing else touches it, so a separate feature
folder would've been three files pointing at one another for no
reason. Splitting it out later is easy if that stops being true.

**Note on Milestone 08:** same reasoning, same call. The original plan
called for a separate `metadata/` folder, but DOI-resolved fields
(title, authors, journal, year) are just `papers` columns that
`library/` already owns via `paperRepository`/`libraryService` — the
DOI lookup itself is one Rust command and one service method bolted
onto the module that already handles everything else about a paper's
catalog entry.

**Note on cross-feature composition (Milestone 10, and relevant again
for Milestone 11):** `paper-summary/` reads from `notebook/` and
`annotations/` but neither of those import anything back from it —
composition features that aggregate several other features' data
should stay a one-way dependency. The trap: `paper-summary`'s own UI
naturally wants to be *triggered from* the Notebook panel, which makes
it tempting to have `notebook/` import the summary view component
directly. Don't — that's `notebook → paper-summary → notebook`, a real
circular import (unlike the type-only kind between `notebook` and
`annotations`, this one involves actual runtime values —
`notebookService`, `NOTEBOOK_SECTION_DEFS` — so it can't be waved away
with `import type`). The fix used here: `App.tsx`, which already sits
above both features, owns the "is the summary open" state and renders
`PaperSummaryView` itself; `Notebook` only calls an `onViewSummary`
callback prop, never touches `paper-summary` directly. Milestone 11
(Literature Matrix) will face the identical shape of problem — it
aggregates across every paper's notebook data — and should use the
same pattern.

**Update, Milestone 11:** it did face the identical shape, and used
the identical fix. `literature-matrix/` reads from `library/` and
`notebook/` (services, not repositories) but neither imports anything
back — App.tsx owns `matrixOpen` and renders `LiteratureMatrixView`
directly from the "Review Matrix" toolbar action, which was stubbed
since Milestone 00 and needed no new trigger UI the way Paper Summary
did. `npx vite build` was re-checked for circular-dependency warnings
after wiring it in — clean, same as Milestone 10.

**Update, Milestone 12:** `search/` reads from `library/`, `notebook/`,
and `annotations/` (again, services only) — three features instead of
two, but the same rule and the same fix: none of the three import
anything from `search/`, and App.tsx owns `searchOpen`, wiring the
"Search" toolbar action that had been stubbed since Milestone 00. Each
of the three source features gained one new *cross-paper* read method
on its own service (`searchPapers`, `searchNotes`, `searchExcerpts`)
rather than `search/` reaching into any of their repositories
directly — the new query logic lives inside the feature that owns the
table being queried, same layering everything else in this list
already follows.

**Update, Milestone 13:** `export/` reads from `paper-summary/` and
`literature-matrix/` — one level further removed than usual, since
those two are themselves composition features. The chain is
`export/` → { `paper-summary/`, `literature-matrix/` } → { `library/`,
`notebook/`, `annotations/` }, still strictly one-way at every link.
Reusing the already-assembled `PaperSummary`/`MatrixRow[]` shapes
(rather than re-deriving them from `library`/`notebook`/`annotations`
directly) was flagged as the plan back in Milestone 10's own log, and
held up unchanged. This is also the first milestone since Workspace
System (01) to add a new Rust command reaching outside the
`fs:scope-appdata` capability grant — `write_export_file`, following
the exact same `std::fs`-in-Rust pattern Milestone 03's
`copy_pdf_into_workspace` used for the identical reason (writing into
a workspace folder chosen at runtime, not a path the JS-side fs-plugin
capability is scoped to).
