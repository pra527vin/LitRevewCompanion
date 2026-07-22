# LitReview Companion

A deep reading environment for researchers — not a PDF reader, not a
reference manager, not an AI assistant. See `docs/Design_Decisions.md`
for the full product spec this was built from.

**Status:** Milestone 13 — Export, plus a post-Milestone-13 bugfix
pass. Every milestone in `Design_Decisions.md`'s roadmap (00–13) is
done. "Search" and "Export" — both toolbar actions stubbed since
Milestone 00 — now open real panels: Search matches across paper
titles/authors, notebook notes, and saved excerpts (Milestone 12);
Export writes a Paper Summary to Markdown or the Literature Matrix to
CSV into the workspace's own `exports/` folder (Milestone 13). A
round of fixes on top of that — workspace location/launcher, reader
scroll position, highlight popup positioning, stale metadata, and a
real Current Thought — is in
`docs/milestones/13a-bugfixes.md`. Per-milestone build logs live in
`docs/milestones/`.

## Stack

- React 18 + TypeScript + Vite — runs as a plain browser page, no native
  shell or install step beyond Node
- [pdf.js](https://mozilla.github.io/pdf.js/) — PDF rendering (wired in Milestone 04, fit-width single-page only so far)
- [sql.js](https://sql.js.org) (WASM SQLite) — per-workspace storage (wired in Milestone 02; ported off `tauri-plugin-sql` in the browser port below)
- File System Access API (`showDirectoryPicker`/`showOpenFilePicker`) — a
  workspace is still a real folder on disk, just reached from the browser
  instead of a native dialog. **Chromium-based browsers only** (Chrome,
  Edge, Brave, Opera) — Firefox and Safari don't implement this API yet.

This was originally built as a Tauri 2 desktop app (Rust backend, native
window); it was later ported to run entirely in the browser so it needs
nothing beyond Node to develop or use. See `docs/milestones/` for the
Tauri-era build log and `git log` for the port itself.

## Getting started

Prerequisites: Node.js 18+, and Chrome or Edge to run it in.

```bash
npm install
npm run dev
```

Open the printed `http://localhost:1420` URL in Chrome or Edge. The first
launch prompts you to choose (or create) a folder to hold your
workspaces; every launch after that reuses it without asking again.

### Building

```bash
npm run build
npm run preview
```

`build` type-checks and produces a static bundle in `dist/`; `preview`
serves it locally to sanity-check the production build.

## Project structure

```
src/                      React frontend
  components/              Milestone 00 shell (toolbar, layout, status bar,
                            reader placeholder, notebook accordion)
  features/                Where Milestones 01+ live — see features/README.md
  features/workspace/migrations/  SQL schema migrations (formerly src-tauri/migrations)
  styles/                  Design tokens + global styles

docs/
  Design_Decisions.md       Full product spec (source of truth)
```

## Roadmap

Milestones, in build order, from `Design_Decisions.md`:

00. Project Skeleton ✅
01. Workspace System ✅
02. Storage Module ✅
03. Library Module ✅
04. PDF Reader ✅
05. Reading State ✅
06. Research Notebook ✅
07. Annotation System ✅
08. Metadata & DOI ✅
09. Dictionary ✅
10. Paper Summary ✅
11. Literature Matrix ✅
12. Search ✅
13. Export ✅ *(this)*

Every milestone should produce a usable application increment — no
milestone leaves the app in a broken or half-wired state. This is the
last milestone in `Design_Decisions.md`'s roadmap; ideas beyond it
live in that doc's "Future Ideas" section, promoted to a milestone
only if/when that happens.

## Design principles this repo follows

- Feature-based modular architecture (`src/features/<name>/ui|service|repository`)
- `UI → Service → Repository → SQLite` — UI never talks to SQLite directly
- Offline-first, autosave
- Small, single-feature implementation prompts
- No AI summarization, no AI-generated literature reviews, no automatic
  critiques. The app organizes and structures; the researcher thinks.
