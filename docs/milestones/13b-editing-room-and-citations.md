# Editing Room + APA7 Citations

Continuation of the post-Milestone-13 bugfix pass (`13a-bugfixes.md`),
picked up after that session ran out of budget mid-change. Filed
separately since it's a distinct batch of work, landed at once, rather
than another entry appended to 13a's already-long log.

## 1. Dictionary tooltip — root cause confirmed to be shared with "dictionary isn't working"

`WordHoverTooltip` is `position: fixed`, mounted inside `PdfViewer`'s
`.pdf-viewer__scroll` container, which has `contain: layout style` as
a paint-isolation perf hint. Per the CSS Containment spec, `contain:
layout` makes an element a containing block for `position: fixed`
descendants (same effect as `transform`) — so the tooltip's
viewport-relative `top`/`left` were resolving against the *scrolled
container's* box, not the real viewport. The deeper a page was
scrolled, the further off-screen the tooltip rendered. This is almost
certainly the entire "dictionary is not working" report too — the
lookup itself (`fetch_word_definition` → dictionaryapi.dev → cache in
`dictionary_cache`) has no other obvious fault, and a tooltip that's
always invisible looks identical to a feature that does nothing.

**Fix:** `WordHoverTooltip` now renders through a `react-dom` portal
into `document.body`, sidestepping the containing-block issue entirely
without touching `.pdf-viewer__scroll`'s `contain` (still doing its
job for scroll-repaint cost). Also added the same viewport-edge
clamping `HighlightPopover` already got in 13a, since a portalled
tooltip near the window's right/bottom edge had no clamp before.

**Not independently verified:** no windowed browser in this sandbox
(same limitation noted throughout 13a) — worth confirming the tooltip
now appears correctly scrolled deep into a long paper, and that a
lookup for a real word returns a definition from the live API.

## 2. Editable excerpts — "editing room" workflow

`excerptRepository`/`annotationsService` gained `updateContent` /
`updateExcerpt(id, quote, userNote)` — an excerpt's captured quote and
note can now be edited in place (paraphrase directly, trim stray text
a PDF selection picked up) instead of requiring a new excerpt every
time.

New `annotations/ui/ExcerptCard.tsx` — a single editable card
component (view mode + an inline edit mode with its own Save/Cancel)
replacing two near-identical read-only blocks that had drifted apart
slightly (Notebook's "Unassigned Highlights" list and its per-section
list). `.excerpt-card*` CSS moved from `Notebook.css` to
`ExcerptCard.css` alongside it; new edit-mode rules added there too.

## 3. Synthesis — the final editing room, with a button to reach it

New `src/features/synthesis/` — `SynthesisView`, opened via a new
"Synthesis" button in the Notebook header (next to "View Summary"),
same App.tsx-owns-the-trigger ownership shape Paper Summary/Matrix/
Search/Export already use, for the same reason (avoids a circular
import — Synthesis reads across notebook + annotations).

Unlike Paper Summary (read-only, drops empty sections) or Notebook
(accordion, one section open at a time), Synthesis shows every
section's notes and every excerpt — including still-unassigned ones —
open and editable simultaneously: the pass meant for tightening prose
and paraphrasing highlights right before an export, without hopping
back into the reader or expanding accordion sections one at a time.
Notes autosave debounced (same 600ms convention as Notebook); excerpts
use the same `ExcerptCard` as Notebook, including reassigning a
highlight's section from here.

## 4. APA7 citations

New `library/citation.ts` — `formatApa7Citation(paper)` builds a
best-effort APA7 reference-list entry from a `Paper`'s catalog fields.
Deliberately simplified against the full APA7 spec: this app has one
generic journal/container field rather than separate volume/issue/
page-range fields (see `library/types.ts`'s note on `SourceType`), so
it produces correct author/year/title ordering and punctuation with
whatever venue + DOI-or-URL locator is on hand, not a complete
journal-article reference. Author-name-to-"Last, F."
conversion is heuristic (the schema stores plain name strings, not
structured given/family fields) and falls back to the name unchanged
for anything that doesn't parse as "Last, First" or "First Last".

- **Per-paper:** MetadataSection gained a live citation preview and a
  "Copy APA7 Citation" button. Builds from the form's *current* state
  via a new shared `updateFromForm` helper (previously duplicated
  inline inside `save()`) — not the `paper` prop, which can be a
  keystroke or a debounce interval behind whatever's actually typed.
- **Workspace-wide:** `exportService.exportBibliography` (new
  `ExportTarget` value `"bibliography"`) assembles every paper's
  citation into one Markdown reference list, alphabetized by
  first-author surname (`apa7SortKey`), written to
  `<workspace>/exports/bibliography-<timestamp>.md`. New "Bibliography"
  section added to `ExportPanel`, same pattern as the two existing
  export options.

### Verified

- `npx tsc --noEmit` — clean
- `npx vite build` — clean
- **Not verified — no Rust toolchain in this sandbox:** nothing here
  touches `src-tauri/`, so no migration or Rust-side risk was
  introduced by this pass. Still worth a real run to confirm the
  dictionary lookup itself succeeds against the live
  dictionaryapi.dev API, and to click through the new Synthesis view
  and citation buttons against a real workspace.
