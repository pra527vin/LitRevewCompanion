# Post-Milestone-13 Bugfix Pass

Not a numbered roadmap milestone — Design_Decisions.md's roadmap
(00–13) is complete. This is a round of fixes against real usage
after Milestone 13, reported directly by the person using the app.
Filed as "13a" only so it sits next to `13-export.md` chronologically
in this folder; it isn't milestone 14 of anything.

## Issues reported, and what actually caused each one

### 1–3. Workspace flow

**Reported:** workspace location had to be picked by hand every time;
the launcher had no way to see or reopen an existing workspace; and
opening a workspace with papers already in it didn't show them.

**Fix:**
- New Rust command `get_workspaces_root` resolves
  `<Documents>/LitReview Companion` via `AppHandle::path().document_dir()`,
  creating it on first call. `create_workspace` itself didn't change
  — it still takes a `parent_dir` — but `WorkspaceLauncher` now passes
  this default root instead of opening a folder-picker dialog for
  every "New workspace."
- New Rust command `list_workspaces(root)` scans one level into that
  folder for anything with a `database.sqlite`, reads each one's name
  via the existing `read_workspace_info`, and returns them
  newest-first. `WorkspaceLauncher` calls this on mount and renders
  the results as a clickable list above the "New workspace" field —
  clicking one calls the existing `open_workspace` directly, no
  dialog.
- `App.tsx`'s `handleWorkspaceReady` now also calls `setLibraryOpen(true)`
  right after a workspace becomes active. `LibraryPanel` already
  listed every paper in the workspace on mount (`libraryService.listPapers()`)
  — it just wasn't being shown automatically. A brand-new workspace
  shows the panel's existing empty state ("Add Paper…"); an existing
  one shows its papers immediately, so "resume reading" is one click
  from launch instead of requiring the toolbar first.
- The old folder-picker flow wasn't deleted — `workspaceService.openWorkspaceFromPicker()`
  is still there, now as an explicit "Open a workspace from another
  location…" link at the bottom of the launcher, for a workspace that
  genuinely lives somewhere else (an external drive, a synced folder).
  `workspaceService.createWorkspaceAtCustomLocation()` exists for the
  equivalent "create somewhere else" case but isn't wired to a launcher
  button yet — the default-root flow covers the reported problem; that
  method is there if a "choose a different location" option turns out
  to be wanted later.

New capability needed: `core:path:default`, for the `document_dir()`
resolver call — added to `src-tauri/capabilities/default.json`.

### 4. PDF pages opening scrolled to the bottom

**Root cause:** `PdfViewer`'s page-render effect never reset the
scroll container's `scrollTop`. Turning a page kept whatever offset
the *previous* page was left at — reading to the bottom of a long
page and clicking Next opened the next page already scrolled to that
same offset, i.e. its bottom, not its top.

**Fix:** the same effect that re-renders on `[pdf, pageNumber]` now
also sets `containerRef.current.scrollTop = 0` before rendering.

### 5. Highlighting: stray text captured, and the save/cancel popup cut off

Two related but separate problems here:

**Popup positioning.** `HighlightPopover` always anchored itself
`anchorRect.bottom + 8`, in `position: fixed`, with no check against
the viewport's actual bottom edge. A selection made near the bottom of
the reader viewport put the popover partly or entirely off-screen,
with no way to reach Save or Cancel. Fixed with a `useLayoutEffect`
that measures the popover's real height after its first paint and
flips it above the selection (anchored to `anchorRect.top`) when
there isn't room below — same idea a native tooltip uses. Also now
clamps both axes to stay within `VIEWPORT_MARGIN` of every edge.

**Stray text in the captured quote.** Two contributing causes, one
fixed, one inherent:
- pdf.js renders each line of a page as its own absolutely-positioned
  text-layer span. A mouse selection crossing several lines picks up
  a newline between every one of them via `Range.toString()`, even
  for a sentence that's just wrapping normally — which reads like the
  selection grabbed broken-up, extra text. `PdfViewer.handleMouseUp`
  now collapses the raw selection through `.replace(/\s+/g, " ").trim()`
  before it ever reaches the popover, so a normal sentence reads like
  one again.
- What's *not* fully fixable here: PDF text-layer selection precision
  is bounded by the PDF's own underlying text-positioning data —
  tightly-packed multi-column academic layouts are a known
  hard case for any PDF text layer, this app's included, and no
  in-app change can fully guarantee pixel-perfect selection against
  an arbitrary PDF producer's output. The pragmatic fix: the quote
  field in `HighlightPopover` is now an editable `<textarea>`
  (pre-filled with the captured selection) instead of a read-only
  `<blockquote>`, so a stray word or line can just be trimmed before
  saving rather than requiring the mouse selection itself to be
  perfect. Save is disabled if the field is emptied out entirely.

### 6. Metadata not showing in Paper Summary after a DOI lookup

**Root cause:** `PaperSummaryView` renders its metadata block straight
from its `paper` prop, which is `App.tsx`'s `activePaper` state.
`MetadataSection` (inside the Notebook) writes DOI-resolved or
manually-typed metadata straight to the database via
`libraryService.updateMetadata`, but never told anything above it that
the write happened — so `activePaper` kept holding the *original*
`Paper` object (the one with empty metadata) from whenever the paper
was first opened, even though the database was correct immediately
after saving. Paper Summary opened from that same stale object.

**Fix:** `MetadataSection` gained an `onSaved: (updated: Paper) => void`
prop, called with the merged `Paper` object after every successful
write (both the debounced autosave on typed fields and the immediate
save after a DOI lookup). Threaded up through `Notebook` →
`MainLayout` → `App.tsx`'s new `handleMetadataSaved`, which calls
`setActivePaper(updated)`. Same "lift state to the common ancestor"
shape the rest of this app already uses for excerpts/summary/matrix —
see `src/features/README.md`'s composition note.

### 7. Current Thought didn't exist yet

**Found while investigating:** the `current_thought` table has existed
in the schema since Migration 0003 (Milestone 06/07's migration file
— see `docs/schema.md`'s migration table, which already listed it),
but no repository, service, or UI ever actually read or wrote it.
Design_Decisions.md's Bottom Status Bar section describes it plainly
("Clicking Current Thought opens a small editor"), and `StatusBar.tsx`
already had the `currentThought`/`onOpenThought` props ready for it —
`App.tsx` just wired `onOpenThought` to a "coming soon" stub.

(An earlier version of this fix added a `current_thought` column onto
`reading_state` via a new migration, before the pre-existing dedicated
table was noticed — reverted once found. No new migration was needed
here after all.)

**Built:**
- `reader/repository.ts` gained `currentThoughtRepository` — `get(paperId)`
  and `save(paperId, thought, updatedAt)`, an upsert against the
  existing `current_thought` table.
- `reader/service.ts` gained `loadCurrentThought`/`saveCurrentThought`,
  exported from `reader/index.ts`.
- New `src/components/layout/CurrentThoughtEditor.tsx` — a small
  popover (not a full modal) anchored above the status bar's existing
  thought button, matching "opens a small editor" and "a short
  reminder" rather than a long-form note (that's what the notebook's
  General Notes section is already for).
- `App.tsx` loads the active paper's thought whenever `activePaper`
  changes, and clears it back to `""` when no paper is open — a
  thought belongs to a specific paper, not the workspace as a whole.
  Clicking the status bar's thought button with no paper open shows a
  context-status message ("Open a paper first to add a thought")
  instead of opening an editor with nothing to attach the thought to.

### 8. Settings

Left alone, as asked — still the one remaining stub, with no assigned
milestone in Design_Decisions.md's roadmap.

### 9. Reader/Notebook split ratio

`--reader-w`/`--notebook-w` in `src/styles/tokens.css` changed from
60%/40% to 70%/30%. Both live layout components (`PdfViewer.css`,
`Notebook.css` under `src/features/`) already read from these two
variables, so this was a one-line change in each of the two variable
values, nothing structural.

## Unrelated cleanup found along the way

`src/components/reader/` and `src/components/notebook/` — leftover
pre-feature-refactor skeleton files from Milestones 00/04/06 — were
still present in the project despite `REMOVED_FILES.txt` already
documenting that the `notebook/` half of this was supposed to have
been deleted in Milestone 06. Neither directory is imported from
anywhere (confirmed via `grep` before removing). Both are now
actually gone; `REMOVED_FILES.txt` updated to reflect that the cleanup
finally happened for real, and to note the `reader/` half had the same
problem.

## Files touched

```
src/styles/tokens.css                          70/30 split

src/features/reader/ui/PdfViewer.tsx            scroll-to-top on page
                                                  change; whitespace
                                                  normalization on
                                                  captured selections;
                                                  handleSaveHighlight
                                                  now takes an edited
                                                  quote

src/features/annotations/ui/HighlightPopover.tsx  viewport-aware
                                                    flip/clamp
                                                    positioning;
                                                    editable quote
                                                    textarea
src/features/annotations/ui/HighlightPopover.css   matching styles

src/features/notebook/ui/MetadataSection.tsx     onSaved prop; save()
                                                   merges + reports the
                                                   updated Paper back up
src/features/notebook/ui/Notebook.tsx             onMetadataSaved prop,
                                                    threaded to
                                                    MetadataSection
src/components/layout/MainLayout.tsx              onMetadataSaved prop,
                                                    threaded to Notebook

src/features/reader/repository.ts                + currentThoughtRepository
src/features/reader/service.ts                   + loadCurrentThought,
                                                    saveCurrentThought
src/features/reader/index.ts                      exports both
src/components/layout/CurrentThoughtEditor.tsx    new
src/components/layout/CurrentThoughtEditor.css    new

src/features/workspace/types.ts                  + WorkspaceSummary
src/features/workspace/repository.ts             + getWorkspacesRoot,
                                                    list
src/features/workspace/service.ts                 rewritten — default-
                                                    root create/list,
                                                    picker flows kept as
                                                    an explicit escape
                                                    hatch
src/features/workspace/ui/WorkspaceLauncher.tsx   rewritten — lists
                                                    existing workspaces,
                                                    creates in the
                                                    default root, no
                                                    dialog by default
src/features/workspace/ui/WorkspaceLauncher.css   new list/status styles

src-tauri/src/features/workspace/mod.rs          + get_workspaces_root,
                                                    list_workspaces,
                                                    WorkspaceSummary
src-tauri/src/lib.rs                              imports + registers
                                                    both new commands
src-tauri/capabilities/default.json               + core:path:default

src/App.tsx                                       handleWorkspaceReady
                                                    (auto-opens Library);
                                                    Current Thought
                                                    state/wiring;
                                                    handleMetadataSaved

REMOVED_FILES.txt                                 updated — dead
                                                    components/reader
                                                    and
                                                    components/notebook
                                                    actually deleted now

docs/milestones/13a-bugfixes.md                   (this file)
```

## Verified

- `npx tsc --noEmit` — clean
- `npx vite build` — clean, checked for "circular" — none found
- Confirmed via `md5sum` that no `.sql` migration file changed (the
  `current_thought` table already existed; nothing new was added to
  the schema this pass)
- **Not verified — no Rust toolchain in this sandbox** (same
  limitation noted throughout this project's build logs since
  Milestone 03): `get_workspaces_root` and `list_workspaces` weren't
  compiled or run. Worth a local `cargo check` before relying on them,
  and in particular: confirm `AppHandle::path().document_dir()`
  resolves correctly on your actual OS (Linux without a
  `xdg-user-dirs` config can occasionally fall back oddly — if
  `get_workspaces_root` ever errors on Linux, that's the first thing
  to check), and confirm `list_workspaces` correctly skips a folder
  that isn't a workspace (e.g. drop an empty folder into
  `~/Documents/LitReview Companion` and make sure the launcher doesn't
  choke on it).

## Open items

- `workspaceService.createWorkspaceAtCustomLocation()` exists but has
  no launcher button — see the workspace section above.
- The "stray text in highlight selections" issue is only mitigated
  (whitespace cleanup + an editable quote field), not eliminated —
  true pixel-perfect PDF text-layer selection on multi-column academic
  layouts is a harder problem than this pass's scope. Worth watching
  whether the editable-quote workaround is enough in practice.

---

## Follow-up: highlighting across a page boundary

**Reported separately, after the fixes above landed:** a sentence
wrapping from the bottom of one page onto the top of the next
couldn't be highlighted as one continuous excerpt.

**Root cause:** the reader has always rendered one page at a time —
only the current page's canvas and text layer ever existed in the
DOM. A browser text selection can only span elements that are
actually present to select; text on the next page simply wasn't there
yet, so a selection could never cross into it, no matter how
carefully the person dragged.

**Fix — the reader now renders two pages at once.** `PdfViewer` keeps
the current ("primary") page and the page directly after it ("peek")
both rendered and stacked vertically in the same scrollable container,
separated by a small "Page N" divider (`user-select: none`, so
dragging across it can't pull its label text into a highlight). Both
text layers exist simultaneously, so a drag-select can flow from the
bottom of the primary page straight into the top of the peek page,
exactly like it already could between two lines on the same page.

Prev/Next still move one page at a time and still reset scroll to the
top of the new primary page (the fix from the first pass in this
log) — the peek page is a rendering detail, not a second "current
page"; reading position tracking, `current_thought`, etc. all still
key off `pageNumber` (the primary page) alone.

**Schema:** `excerpts.end_page` (nullable, migration
`0005_excerpt_end_page.sql`) — `page_number` keeps meaning "starts on"
for every row, old and new; `end_page` is only set when a highlight
actually crosses into the peek page. A new
`formatExcerptPages(excerpt)` helper in `annotations/types.ts` is now
the single place that turns that into "p. 12" or "p. 12–13" — reused
in the Notebook's excerpt cards (both the unassigned list and each
section's list), Paper Summary, Search results, and the Markdown
export, replacing four separate ad hoc `p. {pageNumber}` renders that
would otherwise have needed the same range logic copied into each.

**Detecting which pages a selection touches:** `PdfViewer.handleMouseUp`
checks whether the selection's `anchorNode`/`focusNode` fall inside
the primary text layer, the peek text layer, or both — checking both
nodes (not just `anchorNode`, which was enough back when only one page
existed) because a selection dragged in either direction should be
handled the same way. If it touches both layers, the excerpt is
recorded as `page_number = <primary>`, `end_page = <peek>` regardless
of which direction the person actually dragged in, since the peek
page is always spatially and logically the one right after the
primary page.

### Files touched (this follow-up)

```
src-tauri/migrations/0005_excerpt_end_page.sql   new
src-tauri/src/features/workspace/mod.rs           registers migration 5

src/features/annotations/types.ts                + Excerpt.endPage,
                                                    + formatExcerptPages()
src/features/annotations/repository.ts             end_page in
                                                     ExcerptRow/fromRow/insert
src/features/annotations/service.ts                 saveExcerpt() takes
                                                       an optional endPage
src/features/annotations/index.ts                    exports
                                                        formatExcerptPages

src/features/reader/ui/PdfViewer.tsx               rewritten — renders
                                                      primary + peek page,
                                                      cross-page selection
                                                      detection
src/features/reader/ui/PdfViewer.css                stacked-page layout,
                                                       page-break divider

src/features/notebook/ui/Notebook.tsx               both excerpt-page
                                                       renders use
                                                       formatExcerptPages
src/features/paper-summary/ui/PaperSummaryView.tsx   same
src/features/search/types.ts                          pageNumber ->
                                                         pageLabel (string)
src/features/search/service.ts                        populates pageLabel
                                                         via formatExcerptPages
src/features/search/ui/SearchPanel.tsx                 renders pageLabel
src/features/export/service.ts                         Markdown export uses
                                                          formatExcerptPages

docs/schema.md                                       documents end_page
```

### Other edge cases worth checking against real papers

Went through these while building the fix; some are handled, some are
worth a deliberate look with an actual PDF before calling this fully
solved:

1. **A highlight spanning more than two pages.** Not handled — the
   reader only ever renders primary + one peek page ahead, by design
   (rendering the whole document at once would be a much bigger
   change — full continuous-scroll virtualization, discussed below).
   A selection that somehow extended past the peek page's text layer
   into nothing would just stop being "inside a text layer" at that
   point, the same way a selection dragged past the reader entirely
   into the Notebook pane does today — it wouldn't crash, but it also
   couldn't happen physically, since there's no third page's text in
   the DOM to drag into. In practice this is rare (multi-page
   sentences are uncommon beyond two), but worth knowing it's a real
   ceiling, not just a theoretical one.
2. **The last page of a document.** `hasPeek` is `false` once
   `pageNumber === numPages` — no peek page renders at all, matching
   the reasonable expectation that there's nothing to span into.
   Confirm the last-page highlight flow (select → popover → save)
   still works normally with no peek page present at all — it should,
   since the primary-only code path is unchanged from before this fix,
   but worth a direct check.
3. **A single-page document (numPages === 1).** Same as above —
   `hasPeek` is `false` from the start, so this always behaves like
   the pre-fix single-page reader. Should be a non-event, but is the
   kind of boundary condition worth a real check rather than an
   assumption.
4. **Peek-page render failure.** If the peek page fails to render
   (corrupt page data, a pdf.js error on that specific page) it's
   swallowed rather than surfacing a reader-wide error — the primary
   page the person actually asked to see still renders fine, and a
   highlight just can't span into that particular next page. Worth
   confirming this doesn't leave a blank gap that looks broken rather
   than simply "no peek page available."
5. **Selecting only within the peek page, without pressing Next
   first.** Handled deliberately — the person can scroll down into the
   peek page and highlight something there without ever clicking
   Next. `startPage`/`endPage` both correctly resolve to
   `pageNumber + 1` in that case (see the `touchesPrimary` /
   `touchesPeek` logic). What's *not* handled: `pageNumber` itself
   (and therefore the saved reading position, and the status bar's
   page display) doesn't advance just because the person scrolled down
   and read/highlighted the peek page — only clicking Next moves it.
   This is an intentional scope boundary (see below), but is worth
   being aware of: reading position and "what's currently visible on
   screen" can now genuinely disagree for as long as someone lingers
   on the peek page before clicking Next.
6. **Very short pages, or a peek page much taller than the primary
   one.** Rendering is independent per page (each fit to the same
   container width, native aspect ratio otherwise) — a short primary
   page followed by a tall peek page (or vice versa) should still
   stack and scroll correctly, but hasn't been checked against an
   actual PDF with a mixed page-size layout (e.g. a landscape figure
   page between portrait text pages).
7. **Highlighting across the page-break divider itself.** The divider
   (`.pdf-viewer__page-break`, the "Page N" label between the two
   pages) has `user-select: none` specifically so a drag crossing it
   can't pull "Page 13" text into the middle of a highlight's quote.
   Worth a manual check that a real click-drag starting above the
   divider and ending below it produces a clean quote with no
   divider text mixed in — `user-select: none` is well-supported but
   this hasn't been checked against an actual browser selection in
   this sandbox (no windowed browser available here — see "Verified"
   below).
8. **Performance on very long documents.** Rendering two pages instead
   of one roughly doubles per-page-turn render cost (two canvas
   renders, two text-layer builds). For a typical academic paper
   (roughly 10–40 pages) this should be unnoticeable; it hasn't been
   checked against something unusually long (a 300-page dissertation,
   say). If that ever becomes noticeable, the peek page's render could
   be deferred slightly (render primary first, peek a beat later)
   rather than always rendering both in the same tick — not done here
   since there was no evidence it's actually needed yet.
9. **The genuinely bigger version of this fix.** What's implemented is
   a *two-page window* (primary + one peek page), not full
   continuous-scroll rendering of the whole document. That was a
   deliberate scope call — true continuous scroll (every page
   available, page-tracking driven by an `IntersectionObserver`
   instead of button clicks) is a substantially larger change
   touching reading-state tracking, memory use on long documents, and
   probably needs virtualization to stay fast. The two-page window
   fixes the specific, common case reported (a sentence wrapping one
   page to the next) without that larger rewrite. If cross-page
   highlighting needs to work for spans wider than two pages, or if
   "scroll to keep reading" (rather than click Next) becomes a wanted
   reading mode in its own right, that's the point to revisit this as
   a real continuous-scroll rearchitecture rather than extending the
   two-page window further (a three- or four-page window would still
   just move the same ceiling from item 1 further out, not remove it).

### Verified

- `npx tsc --noEmit` — clean
- `npx vite build` — clean, checked for "circular" — none found
- Confirmed via `md5sum` that `0001`–`0004` are byte-identical to the
  previous pass; only the new `0005_excerpt_end_page.sql` was added
- **Not verified — no windowed browser or Rust toolchain in this
  sandbox:** the actual drag-select-across-a-page-boundary interaction
  (items 1–8 above all really want a hands-on check against a real
  multi-page academic PDF), and the `0005` migration wasn't run
  against a live SQLite database. The `ALTER TABLE ... ADD COLUMN`
  syntax matches `0002`/`0003`/`0004`'s style closely enough that it
  should apply cleanly, but "should" isn't "confirmed" — worth
  opening an existing workspace (one created before this change) and
  confirming it migrates forward without error before trusting it
  against real data.
