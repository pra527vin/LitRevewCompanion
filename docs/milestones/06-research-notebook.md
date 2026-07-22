# Milestone 06 — Research Notebook

**Status:** done
**Depends on:** Milestone 02 (Storage Module), Milestone 04 (PDF Reader, for the active-paper concept)

## Schema status this milestone

**No schema files touched.** Confirmed by hash — `0001`–`0004` in
`src-tauri/migrations/` are byte-identical to every prior milestone.
`notebook_notes` was already created in Milestone 01; this milestone
starts reading and writing it.

## A design decision worth flagging

**"Metadata" is not a free-text section.** The 13 sections listed in
Design_Decisions.md include Metadata, and the DB's `notebook_notes`
CHECK constraint does allow `'metadata'` as a section value — but the
wireframe (`02_Paper_Summary.html`) shows Metadata as "Title, Authors,
DOI, Journal," which is the paper's *catalog* data from the `papers`
table (Milestone 03), not researcher-written prose like every other
section. So the Metadata accordion section renders those fields
directly from the `Paper` object instead of a `notebook_notes`
textarea. The DB still permits `'metadata'` as a value for future
flexibility — nothing needs to change there if this interpretation
ever turns out wrong, just the UI.

This means the 13 "sections" split as: 1 read-only catalog display
(Metadata) + 12 free-text `notebook_notes` sections.

## What this milestone covers

1. **Migrated `Notebook` + `AccordionSection` out of `src/components/notebook/`**
   into `src/features/notebook/ui/`, per the pattern `PdfViewer`
   started in Milestone 04. `components/notebook/` is deleted.
2. **`notebookRepository`** — `listByPaper(paperId)` / `save(paperId,
   section, content, updatedAt)`. `save` is an upsert on the table's
   `UNIQUE (paper_id, section)` constraint. **Verified against a real
   SQLite engine before being wired in**: confirmed a second save
   updates the existing row's `content` in place — and specifically
   confirmed the row's `id` stays the original UUID rather than being
   overwritten by the new one generated on the "insert" attempt (the
   `ON CONFLICT` clause only touches `content`/`updated_at`, `id` is
   never in the `SET` list).
3. **`notebookService`** — `loadNotes(paperId)` returns all 12
   sections as a `Record<sectionId, content>`, defaulting empty
   strings for sections with no row yet. `saveNote(paperId, section,
   content)` upserts one section.
4. **`Notebook` is now per-paper and persisted:**
   - No active paper → "Open a paper to start taking notes" instead
     of a generic empty state.
   - Switching papers loads that paper's saved notes.
   - Typing autosaves, **debounced** (600ms after the last keystroke)
     — unlike the reader's page-turn saves (Milestone 05), text
     editing is high-frequency and would otherwise hit SQLite on
     every keystroke.
   - Switching papers (or unmounting, e.g. on workspace switch)
     **flushes any pending debounced save immediately** first, so a
     quick paper switch mid-sentence can't silently drop the last few
     characters typed.
   - Collapsed-section previews now show real saved content (via
     `AccordionSection`'s existing `preview` prop + CSS ellipsis),
     not static placeholder text.

## Files added

```
src/features/notebook/types.ts                 NOTEBOOK_SECTIONS, section defs
src/features/notebook/repository.ts             notebookRepository (listByPaper, save upsert)
src/features/notebook/service.ts                loadNotes, saveNote
src/features/notebook/ui/AccordionSection.tsx   moved as-is from components/notebook/
src/features/notebook/ui/AccordionSection.css   moved as-is
src/features/notebook/ui/Notebook.tsx           real, per-paper, persisted version
src/features/notebook/ui/Notebook.css           extended: textareas for all sections,
                                                  metadata display block
src/features/notebook/index.ts                  public exports

docs/milestones/06-research-notebook.md         (this file)
```

## Files removed

```
src/components/notebook/AccordionSection.tsx    migrated to features/notebook/ui/
src/components/notebook/AccordionSection.css     migrated to features/notebook/ui/
src/components/notebook/Notebook.tsx              migrated (rewritten) to features/notebook/ui/
src/components/notebook/Notebook.css               migrated (extended) to features/notebook/ui/
```

## Files changed

```
src/components/layout/MainLayout.tsx    imports Notebook from features/notebook now;
                                          passes `paper` through to it
src/features/README.md                   marked notebook/ done; updated the
                                           components/ migration note (Notebook was
                                           the second, and last planned, migration)
```

`App.tsx` needed **no changes** — it already held `activePaper` and
passed it to `MainLayout` since Milestone 04; `MainLayout` just needed
to forward it one level further, into `Notebook`.

## Verified

- Upsert query tested against a real SQLite engine loaded with the
  actual migration files, before being used in application code —
  including specifically checking that the row's original `id`
  survives an update rather than being clobbered.
- `npx tsc --noEmit` — clean
- `npx vite build` — clean
- Confirmed via `md5sum` that no migration file changed this milestone
- **Not verified:** actually typing into a section through `cargo
  tauri dev` and confirming the debounce/flush behavior for real — no
  Rust toolchain in this sandbox. Specifically worth checking locally:
  type in a section, switch papers within ~600ms (before the debounce
  would normally fire), confirm the flush-on-switch caught it and it
  wasn't lost; reopen the same paper later and confirm the text is
  still there; check that collapsed-section previews reflect real
  saved content.

## Open items for later milestones

- No visual "saving…" / "saved" indicator. The status bar's
  center "context-aware status" slot (Design_Decisions.md mentions
  "Highlight saved" as an example) would be a natural home for this —
  not wired up yet, since nothing currently pushes into
  `contextStatus` from the notebook. Worth adding once excerpts
  (Milestone 07) also need to report save status, so it's one pass
  instead of two.
- Excerpts (quote + page + note, assigned to a section) are Milestone
  07's job entirely — this milestone only handles each section's
  free-text prose. The two will render together in the same
  accordion section once 07 lands.
- No character/word count or any writing-aid UI. Not in scope per
  Design_Decisions.md's "What the App Does NOT Do."
