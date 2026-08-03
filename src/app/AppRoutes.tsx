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
import { DashboardView } from "../features/dashboard";
import { BreakReminderProvider } from "../features/break-scheduler";
import { RefreshmentPage } from "../features/games";
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
 * `/summary`, `/synthesis`, `/matrix`, `/export` all render the
 * *same* `ReaderRoute` element on purpose (not six separate
 * components) — React reconciles repeated renders of the same
 * component type at the same tree position without unmounting, so
 * switching between these (e.g. opening the Literature Matrix while a
 * paper is open) never remounts `MainLayout`/`PdfViewer` underneath,
 * exactly like the old boolean-flag overlays never did. `ReaderRoute`
 * itself reads `useLocation()` to decide which overlay (if any) to
 * render on top of the reader. Settings and Dashboard each get their
 * own route/component instead, since both genuinely replace the
 * reader entirely rather than overlaying it — Dashboard used to be one
 * of the shared-`ReaderRoute` overlays, but a page built around a full
 * documents table reads as its own destination, not something layered
 * on top of the PDF view.
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
        <Route path="/export" element={<ReaderRoute />} />
        <Route path="/dashboard" element={<DashboardRoute />} />
        <Route path="/refreshment" element={<RefreshmentRoute />} />
        <Route path="/settings" element={<SettingsRoute />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/** The one public route, and always what `/` shows — no redirect-away
 * even if a workspace is already active (restored in the background,
 * or left over from earlier in the session). Picking a workspace here
 * is what actually navigates into the app, at `/dashboard` — the
 * Progress page is the landing view, so opening a workspace starts
 * with "here's where your reading stands" rather than dropping
 * straight into the reader/library. */
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
        navigate("/dashboard");
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
    if (action === "dashboard") {
      navigate("/dashboard");
      return;
    }
    if (action === "export") {
      navigate("/export");
      return;
    }
    if (action === "refreshment") {
      // Toggles, same as Settings — clicking "Refreshment" again from
      // inside it goes back to the reader.
      navigate(location.pathname === "/refreshment" ? "/reader" : "/refreshment");
      return;
    }
  }

  return (
    // BreakReminderProvider wraps the whole shell (not any one route)
    // so the reminder cycle keeps running across navigation and its
    // popup can appear over whatever page is showing — see its own
    // doc comment. `<Outlet />` sits inside it, which is also what
    // lets the scheduler page reach `preview`.
    <BreakReminderProvider>
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
    </BreakReminderProvider>
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
      {location.pathname === "/export" && (
        <ExportPanel workspace={ws} activePaper={activePaper} onClose={() => navigate("/reader")} />
      )}
    </>
  );
}

/** A full page, same as Settings and Progress — the games grid, for
 * spending the break the scheduler (Settings → Break Reminders) keeps
 * nudging you into. Note the scheduler itself is *not* here: its
 * timers live in `PrivateLayout`'s `BreakReminderProvider` so they run
 * regardless of which page is open. */
function RefreshmentRoute() {
  const navigate = useNavigate();
  return <RefreshmentPage onClose={() => navigate("/reader")} />;
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

/** A full page, not an overlay atop the reader — see this file's own
 * doc comment on why Dashboard was pulled out of the shared
 * `ReaderRoute` list. `workspace` is guaranteed non-null here for the
 * same reason `ReaderRoute` can assume it: `PrivateLayout` (this
 * route's parent) already redirected to `/` otherwise. */
function DashboardRoute() {
  const { workspace, handleOpenPaper, handlePaperDeleted } = useAppState();
  const navigate = useNavigate();

  return (
    <DashboardView
      workspace={workspace!}
      onClose={() => navigate("/reader")}
      onPaperDeleted={handlePaperDeleted}
      onOpenPaper={(paper) => {
        navigate("/reader");
        handleOpenPaper(paper);
      }}
    />
  );
}
