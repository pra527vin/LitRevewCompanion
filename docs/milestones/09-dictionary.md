# Milestone 09 — Dictionary

**Status:** done
**Depends on:** Milestone 02 (Storage Module), Milestone 07 (Annotation System, for the selectable text layer this hovers over)

## Schema status this milestone

**No schema files touched.** Confirmed by hash — `0001`–`0004` in
`src-tauri/migrations/` are byte-identical to every prior milestone.
`dictionary_cache` was already created in Milestone 01; this milestone
starts reading and writing it.

## A scope note

Unlike Milestones 05 and 08, this one **did** get its own feature
folder (`dictionary/`, both Rust and TS) rather than folding into an
existing feature. Reasoning: `dictionary_cache` isn't naturally owned
by anything else — it's not a `papers` column extension like metadata,
and nothing except the dictionary feature itself ever touches it.

Design_Decisions.md lists "Hover academic dictionary" under *Future
Ideas* ("recorded but not implemented until promoted to a milestone"),
but the Development Roadmap section separately lists Milestone 09 as
Dictionary outright — so it's treated here as promoted, not
speculative.

## What this milestone covers

1. **`fetch_word_definition` (Rust)** — looks up a word via
   [dictionaryapi.dev](https://api.dictionaryapi.dev/api/v2/entries/en/{word}),
   a free, public, no-auth API. Returns the first definition of the
   first meaning, prefixed with part of speech when available, as a
   single string — matching `dictionary_cache.definition`'s
   single-TEXT-column shape rather than the API's full multi-meaning
   structure. **Same network-verification limitation as Milestone
   08's Crossref lookup:** `api.dictionaryapi.dev` isn't on this
   sandbox's allowlist, so this could not be tested against the live
   API. Built from the API's documented/well-known response shape.
2. **Cache-first lookup** (`dictionaryService.lookupWord`) — checks
   `dictionary_cache` before ever calling the Rust command; on a
   successful API result, caches it. On any failure (network error,
   word not found), **returns `null` rather than throwing** —
   deliberate, since this backs a hover tooltip, and surfacing an
   error for every stray or unrecognized word the cursor passes over
   would be far worse than the tooltip just not appearing for it.
3. **Word-at-point extraction** (`WordHoverTooltip`) — pdf.js's text
   layer (Milestone 07) has one `<span>` per text *run*, not per word,
   so hovering doesn't naturally tell you which word the cursor is
   over. Uses `document.caretRangeFromPoint(x, y)` — supported by both
   webview engines Tauri ships on (WebView2/Chromium on Windows,
   WebKit on macOS/Linux) — to find the exact character position under
   the cursor, then expands left/right within that text node to find
   word boundaries (`[A-Za-z'-]`, so contractions and hyphenated words
   stay whole).
4. **Debounced, jitter-safe hover handling** — a naive implementation
   would recompute and reset on every raw `mousemove` event, which
   fire continuously even from sub-pixel cursor jitter while
   "holding still," causing a shown tooltip to flicker in and out
   constantly. Instead, the word under the cursor is tracked in a ref;
   nothing happens (no re-lookup, no hiding an existing tooltip) unless
   the *actual word* changes, not just the raw mouse coordinates. Only
   once the word changes does it clear the old definition, reposition,
   and start a fresh 400ms settle timer before fetching — so quickly
   sweeping the cursor across a line of text doesn't fire a lookup for
   every word it passes over, only the one it stops on.
5. Wired into `PdfViewer` scoped specifically to the text layer
   container — hovering only triggers lookups over actual PDF text,
   not other UI chrome.

## An implementation detail worth flagging

Initially wrote a custom `CaretRangeDocument` interface to type
`document.caretRangeFromPoint` as an optional method (assuming it
wasn't in the standard TS DOM lib). **`tsc` caught this immediately**
— it's already declared in the DOM lib types, non-optionally, so the
custom interface conflicted with the existing declaration. Removed the
interface entirely in favor of a plain `typeof document.caretRangeFromPoint
!== "function"` guard. Small thing, but worth noting as a case where
the typechecker corrected an assumption I made without needing to
run anything — exactly the kind of check this sandbox setup *can*
give confidence on, unlike the Rust/network pieces it can't.

## Files added

```
src-tauri/src/features/dictionary/mod.rs        WordDefinition, fetch_word_definition

src/features/dictionary/repository.ts            dictionaryRepository (get/save upsert,
                                                    verified against real SQLite)
src/features/dictionary/service.ts                lookupWord (cache-first, silent failure)
src/features/dictionary/ui/WordHoverTooltip.tsx    word-at-point extraction + debounced hover
src/features/dictionary/ui/WordHoverTooltip.css
src/features/dictionary/index.ts                  public exports

docs/milestones/09-dictionary.md                 (this file)
```

## Files changed

```
src-tauri/src/features/mod.rs         registers `pub mod dictionary`
src-tauri/src/lib.rs                   wires fetch_word_definition into invoke_handler;
                                         updated header comment
src/features/reader/ui/PdfViewer.tsx    renders <WordHoverTooltip> scoped to the text layer
src/features/README.md                   marked dictionary/ done
```

## Verified

- Upsert query tested against a real SQLite engine loaded with the
  actual migration files, before being used in application code.
- `npx tsc --noEmit` — clean (and specifically caught the
  `caretRangeFromPoint` typing mistake described above before it
  shipped).
- `npx vite build` — clean.
- Confirmed via `md5sum` that no migration file changed this milestone.
- **Not verified:** the dictionaryapi.dev network call (same
  limitation as Milestone 08 — no route to the API from this sandbox),
  and the entire hover interaction end-to-end (`caretRangeFromPoint`
  behavior against real rendered PDF text, tooltip positioning,
  debounce feel) through `cargo tauri dev`. This is a second
  DOM-interaction-heavy, unverified-live milestone in a row (after
  Milestone 07's selection handling) — worth testing deliberately:
  hover slowly over a few different words and confirm a tooltip
  appears after a beat without flickering; sweep the cursor quickly
  across a line and confirm it doesn't fire a lookup for every word;
  hover a common word twice and confirm the second time is instant
  (cache hit, no visible delay).

## Open items for later milestones

- No visual "no definition found" state — hovering an unrecognized
  word just never shows a tooltip, indistinguishable from "still
  waiting" until you notice it never appears. Consistent with the
  "fail silently" design choice above, but worth reconsidering if it
  ever feels confusing in practice.
- Tooltip position is pinned to where the cursor was when the word was
  first entered, not the live cursor position — if the mouse drifts
  slightly within the same word while waiting for the definition, the
  tooltip won't follow. Minor, avoids extra repositioning jitter.
- No keyboard-accessible way to trigger a lookup (hover-only). Not
  addressed — matches the "hover dictionary" framing from
  Design_Decisions.md's Future Ideas list, but worth a note for
  accessibility if this app needs to support keyboard-only use later.
