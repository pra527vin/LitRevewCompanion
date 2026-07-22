import { useEffect, useState } from "react";
import { Toolbar, ToolbarAction } from "./components/layout/Toolbar";
import { MainLayout } from "./components/layout/MainLayout";
import { StatusBar } from "./components/layout/StatusBar";
import { CurrentThoughtEditor } from "./components/layout/CurrentThoughtEditor";
import { WorkspaceLauncher, WorkspaceInfo } from "./features/workspace";
import { storageClient } from "./features/storage";
import { LibraryPanel, Paper } from "./features/library";
import { PaperSummaryView } from "./features/paper-summary";
import { LiteratureMatrixView } from "./features/literature-matrix";
import { SearchPanel } from "./features/search";
import { ExportPanel } from "./features/export";
import { loadCurrentThought, saveCurrentThought } from "./features/reader";

/**
 * Milestone 00 — Project Skeleton (chrome).
 * Milestone 01 — Workspace System (this file now gates the chrome
 * behind an active workspace, per Design_Decisions.md's "Workspace
 * System" — nothing else renders until one is created or opened).
 * Milestone 02 — Storage Module (switching workspaces now closes the
 * old database connection instead of just dropping the React state).
 * Milestone 03 — Library Module ("Add Paper" opens the Library panel).
 * Milestone 04 — PDF Reader (selecting a paper now actually opens it;
 * page/pageCount are real values from the reader, not hardcoded 0/0.
 * progressPct here is a plain derived display value — persisting
 * reading position is Milestone 05, not this one).
 * Milestone 07 — Annotation System (excerptsVersion is bumped whenever
 * the reader saves a highlight, so Notebook — which owns its own
 * excerpt list — knows to refetch instead of the two features sharing
 * state directly).
 * Milestone 10 — Paper Summary (summaryOpen lives here rather than in
 * Notebook, deliberately — Notebook rendering PaperSummaryView itself
 * would create a real circular import, since paper-summary's service
 * needs notebookService/NOTEBOOK_SECTION_DEFS from notebook. App.tsx
 * sits above both, so it can own the trigger without either feature
 * importing the other).
 * Milestone 11 — Literature Matrix ("Review Matrix" toolbar action,
 * stubbed since Milestone 00, now opens it). Same ownership pattern
 * as Milestone 10 and for the identical reason — literature-matrix's
 * service reads across library + notebook, so App.tsx (which sits
 * above every feature) owns matrixOpen rather than either of those
 * features rendering the view themselves. A matrix row's paper title
 * reuses the existing handleOpenPaper flow to open it in the reader,
 * same as the Library panel does.
 * Milestone 12 — Search ("Search" toolbar action, stubbed since
 * Milestone 00, now opens it). Same ownership pattern again —
 * search/service.ts reads across library + notebook + annotations,
 * so App.tsx owns searchOpen. A result's paper title reuses
 * handleOpenPaper, same as Library and the Matrix.
 * Milestone 13 — Export ("Export" toolbar action, stubbed since
 * Milestone 00, now opens it). export/service.ts reads across
 * paper-summary + literature-matrix (their service layers), so
 * App.tsx owns exportOpen and passes it the currently active paper
 * (Paper Summary export needs one; Literature Matrix export doesn't).
 *
 * Post-Milestone-13 bugfix pass (see docs/milestones/13a-bugfixes.md):
 * - Opening a workspace now auto-opens the Library panel, so a
 *   workspace with existing papers shows them immediately instead of
 *   requiring a trip to the "Add Paper" toolbar button first.
 * - Current Thought (Design_Decisions.md's Bottom Status Bar — "a
 *   short reminder of where the researcher stopped thinking") is
 *   wired up for real: loaded per-paper on open, editable via the
 *   status bar's existing button, persisted to `reading_state`.
 * - `activePaper` now gets refreshed after a metadata edit
 *   (`handleMetadataSaved`) — previously it silently went stale the
 *   moment a DOI lookup or manual metadata edit landed, since nothing
 *   told App.tsx the object it was holding was now out of date.
 */
export default function App() {
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [activePaper, setActivePaper] = useState<Paper | null>(null);
  const [contextStatus, setContextStatus] = useState("Ready");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [thoughtEditorOpen, setThoughtEditorOpen] = useState(false);
  const [currentThought, setCurrentThought] = useState("");
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [excerptsVersion, setExcerptsVersion] = useState(0);

  // Load the active paper's parked Current Thought whenever the
  // paper changes (including clearing it back to "" when no paper is
  // open — a thought belongs to a specific paper, not the workspace).
  useEffect(() => {
    if (!activePaper) {
      setCurrentThought("");
      return;
    }
    let cancelled = false;
    loadCurrentThought(activePaper.id).then((thought) => {
      if (!cancelled) setCurrentThought(thought);
    });
    return () => {
      cancelled = true;
    };
  }, [activePaper?.id]);

  function handleWorkspaceReady(ws: WorkspaceInfo) {
    setWorkspace(ws);
    // Show the researcher what's already in this workspace right
    // away — a brand-new workspace just shows the Library panel's
    // normal empty state ("Add Paper…" front and center), and an
    // existing one shows its papers so they can resume reading
    // immediately, without a separate trip to the toolbar first.
    setLibraryOpen(true);
  }

  function handleToolbarAction(action: ToolbarAction) {
    if (action === "switch-workspace") {
      storageClient.disconnect().catch(() => {
        // Best-effort — the connection may already be gone. Nothing
        // useful to surface to the user here since we're leaving
        // this workspace regardless.
      });
      setWorkspace(null);
      setActivePaper(null);
      setPage(0);
      setPageCount(0);
      setSummaryOpen(false);
      setMatrixOpen(false);
      setSearchOpen(false);
      setExportOpen(false);
      setThoughtEditorOpen(false);
      return;
    }
    if (action === "add-paper") {
      setLibraryOpen(true);
      return;
    }
    if (action === "review-matrix") {
      setMatrixOpen(true);
      return;
    }
    if (action === "search") {
      setSearchOpen(true);
      return;
    }
    if (action === "export") {
      setExportOpen(true);
      return;
    }
    // Stubbed until the relevant milestone lands (Settings).
    setContextStatus(`${action.replace("-", " ")} — coming soon`);
  }

  function handleOpenPaper(paper: Paper) {
    setLibraryOpen(false);
    setActivePaper(paper);
    setContextStatus(`Opened "${paper.title}"`);
  }

  function handlePageInfo(nextPage: number, nextPageCount: number) {
    setPage(nextPage);
    setPageCount(nextPageCount);
  }

  function handleExcerptSaved() {
    setExcerptsVersion((v) => v + 1);
    setContextStatus("Highlight saved");
  }

  function handleMetadataSaved(updated: Paper) {
    setActivePaper(updated);
  }

  function handleOpenThought() {
    if (!activePaper) {
      setContextStatus("Open a paper first to add a thought");
      return;
    }
    setThoughtEditorOpen(true);
  }

  function handleSaveThought(value: string) {
    setThoughtEditorOpen(false);
    setCurrentThought(value);
    if (!activePaper) return;
    saveCurrentThought(activePaper.id, value).catch(() => {
      // Best-effort, consistent with the rest of the app's autosave.
    });
  }

  if (!workspace) {
    return <WorkspaceLauncher onWorkspaceReady={handleWorkspaceReady} />;
  }

  const progressPct = pageCount > 0 ? Math.round((page / pageCount) * 100) : 0;

  return (
    <div className="app-shell">
      <Toolbar workspaceName={workspace.name} onAction={handleToolbarAction} />
      <MainLayout
        paper={activePaper}
        workspacePath={workspace.path}
        onPageInfo={handlePageInfo}
        excerptsVersion={excerptsVersion}
        onExcerptSaved={handleExcerptSaved}
        onViewSummary={() => setSummaryOpen(true)}
        onMetadataSaved={handleMetadataSaved}
      />
      <StatusBar
        page={page}
        pageCount={pageCount}
        progressPct={progressPct}
        contextStatus={contextStatus}
        currentThought={currentThought}
        onOpenThought={handleOpenThought}
      />
      {libraryOpen && (
        <LibraryPanel
          workspacePath={workspace.path}
          onClose={() => setLibraryOpen(false)}
          onOpenPaper={handleOpenPaper}
        />
      )}
      {summaryOpen && activePaper && (
        <PaperSummaryView
          paper={activePaper}
          onClose={() => setSummaryOpen(false)}
        />
      )}
      {matrixOpen && (
        <LiteratureMatrixView
          onClose={() => setMatrixOpen(false)}
          onOpenPaper={(paper) => {
            setMatrixOpen(false);
            handleOpenPaper(paper);
          }}
        />
      )}
      {searchOpen && (
        <SearchPanel
          onClose={() => setSearchOpen(false)}
          onOpenPaper={(paper) => {
            setSearchOpen(false);
            handleOpenPaper(paper);
          }}
        />
      )}
      {exportOpen && (
        <ExportPanel
          workspacePath={workspace.path}
          activePaper={activePaper}
          onClose={() => setExportOpen(false)}
        />
      )}
      {thoughtEditorOpen && (
        <CurrentThoughtEditor
          initialValue={currentThought}
          onSave={handleSaveThought}
          onCancel={() => setThoughtEditorOpen(false)}
        />
      )}
    </div>
  );
}
