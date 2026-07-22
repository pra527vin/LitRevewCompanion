# Milestone 13 — Export

**Status:** done
**Depends on:** Milestone 01 (Workspace System), Milestone 10 (Paper Summary), Milestone 11 (Literature Matrix)

## Schema status this milestone

**No schema files touched.** `0001`–`0004` in `src-tauri/migrations/`
are unchanged from Milestone 12. Export writes files, not rows — it
doesn't read any table directly at all (see composition note below),
and it doesn't add one either. The one piece of on-disk structure it
relies on, `<workspace>/exports/`, already exists: `create_workspace`
(Milestone 01, `src-tauri/src/features/workspace/mod.rs`) creates it
alongside `papers/` the moment a workspace is created, so this
milestone is the first to actually put anything in a folder that's
been sitting there since Milestone 01.

## Composition, reusing Milestones 10 and 11 rather than re-deriving

`src/features/export/service.ts` calls `paperSummaryService` and
`literatureMatrixService` — not `library`/`notebook`/`annotations`
directly. This was flagged as the intended shape back in Milestone
10's own log ("Open items for later milestones": *"The
section-assembly shape here (`PaperSummary`/`SummarySection`) is
deliberately simple and should be directly reusable when Export needs
the same data"*), and it held up exactly as written — `exportService`
never touches a notebook note or an excerpt itself, only the
already-assembled `PaperSummary`/`MatrixRow[]` shapes those two
milestones built.

Two consequences of reusing them instead of re-querying:

- **No drift risk.** An export can't show different content than the
  in-app Paper Summary / Literature Matrix views, because it's
  rendering the exact same assembled object, not a second copy of the
  assembly logic.
- **One more link in an already one-way chain.** `export/` → {
  `paper-summary/`, `literature-matrix/` } → { `library/`,
  `notebook/`, `annotations/` }. Every arrow points one direction;
  nothing downstream imports anything from `export/`. Same rule
  `search/` (Milestone 12) and the matrix/summary features themselves
  established — see `src/features/README.md`.

## Where files are written, and why no save dialog

Exports land at `<workspace_path>/exports/<generated-filename>` —
no file picker, no "choose a location" step. Two things drove this:

1. **Design_Decisions.md's Workspace System** describes the workspace
   as a self-contained, portable folder (`database.sqlite`, `papers/`,
   `exports/`, `settings.json`) specifically so the whole research
   project can move as one unit, independent of the Downloads folder.
   A save-dialog export defeats that the same way *not* copying PDFs
   into the workspace on import would have (Milestone 03's own
   rationale, reused here).
2. `src-tauri/capabilities/default.json` scopes the frontend's
   `tauri-plugin-fs` grant to `fs:scope-appdata` only — it was never
   opened up to arbitrary filesystem paths, because nothing before
   this milestone needed to write outside a workspace folder chosen by
   `workspaceService`. Writing anywhere the user might pick via a
   dialog would mean widening that scope; writing into a path
   `workspaceService` already resolved doesn't.

The actual write is a new Rust command, `write_export_file` — same
split Milestone 03 used for `copy_pdf_into_workspace`: a JS-invoked
`tauri::command` using `std::fs` directly reaches an arbitrary
workspace path without needing a broader fs-plugin capability grant.
It rejects filenames containing `/`, `\`, or `..` before writing,
even though the only caller (`exportService`) always generates the
filename itself (slug + timestamp, never user-typed) — this command
crosses out of the sandboxed fs-plugin scope, so it doesn't extend
the same trust to its argument that a scoped JS call would get for
free.

## Interpretation calls

1. **Two export targets, not a general "export anything" system:**
   Paper Summary → Markdown, Literature Matrix → CSV.
   Design_Decisions.md's "Review Matrix" section names exactly two
   "levels of information" that get generated after reading — Paper
   Summary and Literature Matrix — so those are the two things Export
   turns into a file. No export of raw notebook notes, raw excerpts,
   or the whole workspace at once; those aren't things the app
   currently *shows* as a single view, and Export exporting a view
   that doesn't otherwise exist would be scope creep past "the
   software should automate repetitive work" into "the software
   invents a new work product."
2. **Markdown for Paper Summary, CSV for Literature Matrix — different
   formats on purpose, not just "pick one and reuse it everywhere."**
   A Paper Summary reads as prose sectioned by notebook heading, which
   is what Markdown is for. A Literature Matrix is inherently tabular
   — "compares many papers side by side" (Design_Decisions.md → Review
   Matrix) — which is what a spreadsheet is for, and CSV opens
   directly into one. A Markdown table version of the matrix was
   considered and dropped: it doesn't sort/filter, and the researcher
   likely wants to paste rows into a working document, not read the
   matrix as prose a second time.
3. **Filenames are generated (slug + timestamp), not typed by the
   researcher.** Consistent with "reduce friction" — an export is a
   snapshot, and asking for a filename on every export interrupts a
   moment that should be one click. Repeated exports don't overwrite
   each other (the timestamp guarantees a unique name), which also
   means nothing here needs "are you sure you want to overwrite"
   handling.
4. **Paper Summary export needs an active paper; Literature Matrix
   export doesn't.** `ExportPanel` takes `activePaper: Paper | null`
   from `App.tsx` (the same paper the reader/Notebook are currently
   showing) and disables the Paper Summary button with an explanatory
   line when nothing's open, rather than offering a paper-picker
   inside the Export panel itself. A second paper-selection UI living
   in `export/` would duplicate what `LibraryPanel` and the
   Literature Matrix's own paper links already do — "open the paper
   you want, then export it" is one extra click, not a missing
   feature.
5. **No "reveal in file manager" / auto-open action.** The success
   message shows the absolute path written
   (`exportRepository.writeFile`'s return value, threaded straight
   through). Actually revealing it would need either `tauri-plugin-
   opener` (not currently a dependency) or a new Rust command wrapping
   the OS-specific "reveal in Finder/Explorer" call — real scope
   beyond "write a file," and the workspace's `exports/` folder is
   already somewhere the researcher chose and can find on their own.

## Files added

```
src-tauri/src/features/export/mod.rs         write_export_file command

src/features/export/types.ts                 ExportTarget
src/features/export/repository.ts             invoke wrapper
src/features/export/service.ts                 exportPaperSummary,
                                                 exportLiteratureMatrix,
                                                 Markdown/CSV rendering
src/features/export/ui/ExportPanel.tsx          two-option modal
src/features/export/ui/ExportPanel.css
src/features/export/index.ts                    public exports

docs/milestones/13-export.md                  (this file)
```

## Files changed

```
src-tauri/src/features/mod.rs      + pub mod export;
src-tauri/src/lib.rs                imports + registers write_export_file
                                      in the invoke_handler list
src/App.tsx                          owns exportOpen; wires the existing
                                       "export" Toolbar stub; passes
                                       activePaper through; resets
                                       exportOpen on workspace switch
src/features/README.md               marked export/ done
```

## Verified

- `npx tsc --noEmit` — clean
- `npx vite build` — clean, explicitly checked output for "circular" —
  none found
- Confirmed via `md5sum` that no migration file changed this milestone
- **Not verified — no Rust toolchain in this sandbox** (same
  limitation noted in every milestone with new Rust code since
  Milestone 03): `write_export_file` was written by close pattern-
  matching against `copy_pdf_into_workspace`
  (`src-tauri/src/features/library/mod.rs`) — same `std::fs` calls,
  same `.map_err(|e| e.to_string())` error shape, same
  `#[tauri::command]` signature style — but hasn't been compiled or
  run. Worth a local `cargo check` before relying on it, and a real
  export-then-open-the-file pass: export a Paper Summary with a mix of
  notes and excerpts across a few sections, confirm the Markdown reads
  correctly; export the Literature Matrix with a few papers, confirm
  the CSV opens cleanly in a spreadsheet app with commas/quotes in
  note content escaped correctly.

## Open items for later milestones

This closes the roadmap in Design_Decisions.md (Milestones 00–13, all
done) — everything below is a Future Idea, not a gap in the plan:

- No "export whole workspace" (every paper's summary as one bundle,
  or a zip of everything in `exports/`). Each export is one file, one
  action, matching how Paper Summary/Literature Matrix are each
  triggered one at a time today.
- No PDF export option. Markdown/CSV were chosen because they're
  plain text a researcher can paste elsewhere (a thesis draft, a
  spreadsheet) — generating a formatted PDF would need a rendering
  step this app has no dependency for yet, and isn't obviously better
  than "open the Markdown file in whatever the researcher already
  writes their thesis in."
- Settings (a Toolbar action that's remained a stub since Milestone
  00, alongside Search/Export before this pair of milestones) is not
  part of the numbered roadmap in Design_Decisions.md and stays
  stubbed. Not this milestone's scope to invent.
