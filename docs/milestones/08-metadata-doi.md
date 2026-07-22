# Milestone 08 — Metadata & DOI

**Status:** done
**Depends on:** Milestone 03 (Library Module), Milestone 06 (Research Notebook, for the Metadata accordion section)

## Schema status this milestone

**No schema files touched.** Confirmed by hash — `0001`–`0004` in
`src-tauri/migrations/` are byte-identical to every prior milestone.
`title`/`authors`/`doi`/`journal`/`year` are all existing `papers`
columns from Milestone 01; this milestone adds a way to actually
populate and edit them.

## A scope note before the summary

Same call as Milestone 05: the original plan called for a separate
`metadata/` feature folder. Built it into `library/` instead —
metadata fields are just `papers` columns that `library` already owns,
so a DOI lookup command and an `updateMetadata` method are natural
additions to the module that already has `paperRepository` and
`libraryService`, not a reason for a new folder. Documented in
`features/README.md`.

## What this milestone covers

1. **`fetch_doi_metadata` (Rust, in `library/mod.rs`)** — looks up a
   DOI via the [Crossref REST API](https://api.crossref.org/works/{doi}),
   a free, public, no-auth-required registry. Parses the response as
   loosely-typed `serde_json::Value` rather than a strict struct,
   since Crossref's schema varies across record types (journal
   articles, books, preprints) and a strict deserializer would break
   on shapes this app doesn't need to fully model — missing fields
   degrade to `None`/empty instead of failing the whole lookup.
   Publication year is checked across `published-print`,
   `published-online`, `published`, and `issued` in that order, since
   Crossref records it under different keys depending on venue type.

   **This is a mechanical/factual lookup of existing bibliographic
   data, not AI-generated content** — worth being explicit about,
   since Design_Decisions.md's "What the App Does NOT Do" lists AI
   summaries and AI-generated content. DOI resolution is squarely
   "Organizes papers" instead.

2. **Verification limitation, stated plainly:** this sandbox's network
   allowlist doesn't include `api.crossref.org`, so **the actual HTTP
   round-trip could not be tested against the live API**. Everything
   here is built from Crossref's documented/well-known response shape
   and careful manual review of the Rust (see below), not a live
   request. This is a materially higher-risk unverified piece than
   prior milestones' "no Rust toolchain" caveat — those were things I
   was confident would compile and just couldn't run; this is
   additionally unverified *behaviorally* against the real service.
   **Test with a real DOI before trusting this.**

3. **Manual review in place of compilation** (no `cargo` in this
   sandbox, as always) — one specific fix worth flagging: I initially
   wrote `client.get(&url)` passing a `&String`. I wasn't fully
   certain `&String` (as opposed to `String` or `&str`) satisfies
   reqwest's `IntoUrl` trait bound across versions without compiling
   to check, so I changed it to pass the `String` by value
   (`client.get(url)`) instead, which is unambiguously covered. Small
   thing, but the kind of detail that's easy to get subtly wrong when
   reviewing Rust by eye instead of letting the compiler check it.

4. **`libraryService.lookupDoi` / `.updateMetadata`** — thin wrappers:
   the former just `invoke`s the Rust command, the latter delegates to
   `paperRepository.updateMetadata` (query verified against a real
   SQLite engine before being wired in — confirmed the update doesn't
   touch `file_path`/`file_hash`).

5. **`MetadataSection`** (new component,
   `src/features/notebook/ui/MetadataSection.tsx`) replaces the
   read-only `<dl>` Milestone 06 left as a placeholder. Editable
   fields (Title, Authors, Journal, Year) autosave debounced, same
   600ms convention as the free-text notebook sections, with the same
   flush-on-paper-switch/unmount safety net. A DOI field has a "Look
   Up" button — a discrete action, not typed text, so applying a
   lookup result saves immediately rather than waiting on the
   debounce.

## Files added

```
src/features/notebook/ui/MetadataSection.tsx    editable metadata + DOI lookup form
src/features/notebook/ui/MetadataSection.css

docs/milestones/08-metadata-doi.md               (this file)
```

## Files changed

```
src-tauri/Cargo.toml                       + reqwest (rustls-tls, json — no native-tls/OpenSSL dep)
src-tauri/src/features/library/mod.rs       + DoiMetadata struct, + fetch_doi_metadata command;
                                              updated module doc header
src-tauri/src/lib.rs                         registers fetch_doi_metadata; updated header comment

src/features/library/types.ts                + MetadataUpdate, + DoiMetadata
src/features/library/repository.ts            + updateMetadata (verified against real SQLite)
src/features/library/service.ts                + lookupDoi, + updateMetadata
src/features/library/index.ts                   exports the two new types

src/features/notebook/ui/Notebook.tsx            Metadata section now renders <MetadataSection>
                                                   instead of a static read-only <dl>
src/features/notebook/ui/Notebook.css             removed the now-dead .notebook__metadata /
                                                    .notebook__metadata-note rules (moved to
                                                    MetadataSection.css)
src/features/README.md                             marked milestone 08 done; added the
                                                      library-merge note (matching milestone 05's)
```

## Verified

- `updateMetadata`'s query tested against a real SQLite engine loaded
  with the actual migration files, before being used in application
  code — confirmed the update writes title/authors/doi/journal/year
  correctly and leaves `file_path`/`file_hash` untouched.
- `npx tsc --noEmit` — clean
- `npx vite build` — clean
- Confirmed via `md5sum` that no migration file changed this milestone
- **Not verified, and worth repeating:** the actual Crossref API call.
  No Rust toolchain *and* no network access to the target API in this
  sandbox. Test with a real DOI (e.g. `10.1038/nphys1170`) as close to
  first thing as convenient — if the response shape differs from what
  the parsing code assumes anywhere, fields will just come back empty
  rather than the command erroring, which could look like "it's
  working but returning nothing" rather than an obvious failure.

## Open items for later milestones

- No handling for a paper without a DOI at all — manual entry of every
  field always works regardless, so this isn't a blocker, just means
  "Look Up" is a no-op convenience for DOI-having papers only (which
  is most academic papers, but not book chapters, working papers, etc.).
- DOI isn't URL-encoded before being interpolated into the Crossref
  request path. Standard-format DOIs (the vast majority) work fine
  as-is; a DOI containing unusual characters could break the request.
  Not fixed now — flagging as a known gap rather than silently hoping
  it doesn't come up.
- `activePaper` in `App.tsx` doesn't get updated when metadata changes
  in the Notebook (it's a snapshot from when the paper was opened via
  the Library panel). The only place this is currently visible is the
  status bar's one-time "Opened "..."" message staying stale after an
  edit — cosmetic, not a data-integrity issue, since `MetadataSection`
  manages its own form state independent of that stale prop. Worth
  fixing if it becomes actually confusing in practice.
