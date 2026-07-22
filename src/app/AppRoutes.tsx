import { useEffect, useState } from "react";
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Toolbar, ToolbarAction } from "../components/layout/Toolbar";
import { MainLayout } from "../components/layout/MainLayout";
import { StatusBar } from "../components/layout/StatusBar";
import { CurrentThoughtEditor } from "../components/layout/CurrentThoughtEditor";
import { WorkspaceLauncher } from "../features/workspace";
import { LibrarySidebar } from "../features/library";
import { PaperSummaryView } from "../features/paper-summary";
import { SynthesisView } from "../features/synthesis";
import { LiteratureMatrixView } from "../features/literature-matrix";
import { SearchPanel } from "../features/search";
import { ExportPanel } from "../features/export";
import { SettingsPage } from "../features/settings";
import { listRecentlyStudied, RecentlyStudiedEntry } from "../features/reader";
import { useAppState } from "./AppStateContext";

/**
 * `/` is always the workspace picker (`WorkspaceLauncher`) — the
 * true, unconditional home page, not just "wherever you land with no
 * workspace." Everything else lives behind an active workspace (and,
 * for two of them, an active paper) as a real, guarded route —
 * "private route" in the same sense a logged-in-only route is in apps
 * that have accounts, except the gate is workspace/paper state
 * instead of auth.
 *
 * The reader itself is `/reader` now (it used to be `/`, before `/`
 * became the permanent launcher) — opening or auto-restoring a
 * workspace navigates there, not to `/`. `/reader`, `/library`,
 * `/summary`, `/synthesis`, `/matrix`, `/search`, `/export` all render
 * the *same* `ReaderRoute` element on purpose (not seven separate
 * components) — React reconciles repeated renders of the same
 * component type at the same tree position without unmounting, so
 * switching between these (e.g. opening the Literature Matrix while a
 * paper is open) never remounts `MainLayout`/`PdfViewer` underneath,
 * exactly like the old boolean-flag overlays never did. `ReaderRoute`
 * itself reads `useLocation()` to decide which overlay (if any) to
 * render on top of the reader. Settings gets its own route/component
 * since it genuinely replaces the reader entirely, same as it always
 * has.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LauncherRoute />} />
      <Route element={<PrivateLayout />}>
        <Route path="/reader" element={<ReaderRoute />} />
        <Route path="/library" element={<ReaderRoute />} />
        <Route path="/summary" element={<ReaderRoute />} />
        <Route path="/synthesis" element={<ReaderRoute />} />
        <Route path="/matrix" element={<ReaderRoute />} />
        <Route path="/search" element={<ReaderRoute />} />
        <Route path="/export" element={<ReaderRoute />} />
        <Route path="/settings" element={<SettingsRoute />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/** The one public route, and always what `/` shows — no redirect-away
 * even if a workspace is already active (restored in the background,
 * or left over from earlier in the session). Picking a workspace here
 * is what actually navigates into the app, at `/reader`. */
function LauncherRoute() {
  const { activateWorkspace } = useAppState();
  const navigate = useNavigate();

  return (
    <WorkspaceLauncher
      onWorkspaceReady={(ws) => {
        activateWorkspace(ws).catch(() => {
          // Best-effort, same rationale as activateWorkspace's own
          // internal try/catch.
        });
        navigate("/reader");
      }}
    />
  );
}

/** Every private route's guard + shared chrome (Toolbar, Current
 * Thought editor). Shows the mount-time restore splash while that's
 * still in flight (so a deep link to e.g. `/matrix` doesn't
 * flash-redirect to `/` before a silently-restorable workspace gets
 * the chance to load), then redirects to `/` — the launcher — if no
 * workspace is active once that settles. */
function PrivateLayout() {
  const {
    workspace,
    restoring,
    clearWorkspace,
    resolvedTheme,
    handleToggleTheme,
    thoughtEditorOpen,
    setThoughtEditorOpen,
    currentThought,
    handleSaveThought,
  } = useAppState();
  const navigate = useNavigate();
  const location = useLocation();

  if (restoring) {
    return <div className="app-restoring">Restoring your last session…</div>;
  }
  if (!workspace) return <Navigate to="/" replace />;

  function handleToolbarAction(action: ToolbarAction) {
    if (action === "switch-workspace") {
      clearWorkspace();
      navigate("/");
      return;
    }
    if (action === "settings") {
      // Toggles — clicking "Settings" again from inside it goes back
      // to the reader, same as its own "Done" button.
      navigate(location.pathname === "/settings" ? "/reader" : "/settings");
      return;
    }
    if (action === "toggle-library") {
      // Same toggle-between-two-routes pattern as Settings — `/library`
      // is a real, bookmarkable page now, not just a boolean flag.
      navigate(location.pathname === "/library" ? "/reader" : "/library");
      return;
    }
    if (action === "review-matrix") {
      navigate("/matrix");
      return;
    }
    if (action === "search") {
      navigate("/search");
      return;
    }
    if (action === "export") {
      navigate("/export");
      return;
    }
  }

  return (
    <div className="app-shell">
      <Toolbar
        workspaceName={workspace.name}
        onAction={handleToolbarAction}
        resolvedTheme={resolvedTheme}
        onToggleTheme={handleToggleTheme}
      />
      <Outlet />
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

const PAPER_REQUIRED_PATHS = new Set(["/summary", "/synthesis"]);

/** The reader itself, mounted for seven different paths (see this
 * file's own doc comment on why they're deliberately all this same
 * component). `/summary`/`/synthesis` redirect back to `/reader` if
 * no paper is open — checked here, not via a wrapping component, so
 * every one of the seven paths renders the exact same element type at
 * the exact same tree position and none of them ever remounts the
 * reader underneath. */
function ReaderRoute() {
  const {
    workspace,
    activePaper,
    sidebarOpen,
    sidebarWidth,
    setSidebarWidth,
    setSidebarOpen,
    handleOpenPaper,
    handlePaperDeleted,
    handlePageInfo,
    excerptsVersion,
    handleExcerptSaved,
    handleMetadataSaved,
    page,
    pageCount,
    contextStatus,
    currentThought,
    handleOpenThought,
  } = useAppState();
  const location = useLocation();
  const navigate = useNavigate();

  const [recentlyStudied, setRecentlyStudied] = useState<RecentlyStudiedEntry[]>([]);

  // Refetches whenever there's no paper open (including right after
  // selecting a workspace) — that's exactly when PdfViewer's "Continue
  // where you left off" empty state is what's showing. No need to
  // keep this fresh while a paper *is* open, since it isn't rendered
  // then.
  useEffect(() => {
    if (activePaper) return;
    let cancelled = false;
    listRecentlyStudied().then((entries) => {
      if (!cancelled) setRecentlyStudied(entries);
    });
    return () => {
      cancelled = true;
    };
  }, [activePaper, workspace?.name]);

  // The context's own `handlePaperDeleted` only touches `activePaper`
  // (clearing it out if the deleted paper was the one open) — it has
  // no reason to know about this route's local `recentlyStudied`
  // state. Deleting a paper that ISN'T the active one (or deleting one
  // while no paper is open at all, i.e. straight off this same list)
  // never changes `activePaper`, so the effect above would never
  // refetch on its own; pruned here immediately instead of waiting for
  // whatever future navigation happens to trigger a refetch.
  function handlePaperDeletedAndPruneRecent(paperId: string) {
    handlePaperDeleted(paperId);
    setRecentlyStudied((prev) => prev.filter((entry) => entry.paper.id !== paperId));
  }

  if (PAPER_REQUIRED_PATHS.has(location.pathname) && !activePaper) {
    return <Navigate to="/reader" replace />;
  }

  // workspace is guaranteed non-null here — PrivateLayout (this
  // route's parent) already redirected away otherwise.
  const ws = workspace!;
  const progressPct = pageCount > 0 ? Math.round((page / pageCount) * 100) : 0;
  // `/library` forces the sidebar open even if the persisted
  // preference is "collapsed" — visiting that URL directly (a
  // bookmark, a reload, someone else's link) should always show the
  // library, not silently do nothing.
  const sidebarVisible = sidebarOpen || location.pathname === "/library";

  return (
    <>
      <div className="app-body">
        {sidebarVisible ? (
          <LibrarySidebar
            workspace={ws}
            width={sidebarWidth}
            onWidthChange={setSidebarWidth}
            activePaperId={activePaper?.id ?? null}
            onOpenPaper={handleOpenPaper}
            onPaperDeleted={handlePaperDeletedAndPruneRecent}
            onClose={() => {
              setSidebarOpen(false);
              // Leave `/library` too — staying on that URL with the
              // sidebar explicitly collapsed would be a page claiming
              // to show something it isn't.
              if (location.pathname === "/library") navigate("/reader");
            }}
          />
        ) : (
          // The toolbar's "Library" button also reopens it, but this
          // edge tab (same pattern as the Notebook drawer's own
          // reopen tab) stays visible right next to the reader —
          // important with no active paper, since the sidebar is
          // then the only way back to "Add Paper…".
          <button
            className="app-body__sidebar-reopen"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open library"
            title="Open library"
          >
            &rsaquo;
          </button>
        )}
        <MainLayout
          paper={activePaper}
          workspace={ws}
          onPageInfo={handlePageInfo}
          excerptsVersion={excerptsVersion}
          onExcerptSaved={handleExcerptSaved}
          onViewSummary={() => navigate("/summary")}
          onViewSynthesis={() => navigate("/synthesis")}
          onMetadataSaved={handleMetadataSaved}
          recentlyStudied={recentlyStudied}
          onOpenPaper={handleOpenPaper}
        />
      </div>
      <StatusBar
        page={page}
        pageCount={pageCount}
        progressPct={progressPct}
        contextStatus={contextStatus}
        currentThought={currentThought}
        onOpenThought={handleOpenThought}
      />

      {location.pathname === "/summary" && activePaper && (
        <PaperSummaryView paper={activePaper} onClose={() => navigate("/reader")} />
      )}
      {location.pathname === "/synthesis" && activePaper && (
        <SynthesisView
          paper={activePaper}
          excerptsVersion={excerptsVersion}
          onClose={() => navigate("/reader")}
        />
      )}
      {location.pathname === "/matrix" && (
        <LiteratureMatrixView
          onClose={() => navigate("/reader")}
          onOpenPaper={(paper) => {
            navigate("/reader");
            handleOpenPaper(paper);
          }}
        />
      )}
      {location.pathname === "/search" && (
        <SearchPanel
          onClose={() => navigate("/reader")}
          onOpenPaper={(paper) => {
            navigate("/reader");
            handleOpenPaper(paper);
          }}
        />
      )}
      {location.pathname === "/export" && (
        <ExportPanel workspace={ws} activePaper={activePaper} onClose={() => navigate("/reader")} />
      )}
    </>
  );
}

function SettingsRoute() {
  const { themePreference, handleThemeChange } = useAppState();
  const navigate = useNavigate();

  return (
    <SettingsPage
      themePreference={themePreference}
      onThemeChange={handleThemeChange}
      onClose={() => navigate("/reader")}
    />
  );
}
