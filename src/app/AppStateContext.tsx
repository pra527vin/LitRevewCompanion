import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { WorkspaceInfo, workspaceService } from "../features/workspace";
import { Paper, libraryService } from "../features/library";
import { ThemePreference, ResolvedTheme, themeService } from "../features/settings";
import { loadCurrentThought, saveCurrentThought } from "../features/reader";

const SIDEBAR_OPEN_KEY = "litreview-sidebar-open";
const SIDEBAR_WIDTH_KEY = "litreview-sidebar-width";
const DEFAULT_SIDEBAR_WIDTH = 280;
const LAST_WORKSPACE_KEY = "litreview-last-workspace";

function lastPaperKey(workspaceName: string): string {
  return `litreview-last-paper:${workspaceName}`;
}

export interface AppState {
  workspace: WorkspaceInfo | null;
  activePaper: Paper | null;
  contextStatus: string;
  /** True only until the mount-time auto-restore attempt settles —
   * `AppRoutes` shows a splash instead of any route while this is
   * true, so a remembered workspace/paper (or the launcher, if
   * nothing's remembered) never flashes the wrong thing first. */
  restoring: boolean;

  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;

  themePreference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  handleThemeChange: (preference: ThemePreference) => void;
  handleToggleTheme: () => void;

  thoughtEditorOpen: boolean;
  setThoughtEditorOpen: (open: boolean) => void;
  currentThought: string;
  handleOpenThought: () => void;
  handleSaveThought: (value: string) => void;

  page: number;
  pageCount: number;
  excerptsVersion: number;
  handlePageInfo: (page: number, pageCount: number) => void;
  handleExcerptSaved: () => void;
  handleMetadataSaved: (updated: Paper) => void;

  /** Makes `ws` the active workspace, reopening whichever paper was
   * last active in it — shared by the launcher route and the
   * mount-time auto-restore effect, so both behave identically. */
  activateWorkspace: (ws: WorkspaceInfo) => Promise<void>;
  /** Drops the active workspace/paper/reader state — the "Switch
   * Workspace" toolbar action calls this, then navigates to `/` (the
   * launcher) itself; routing isn't this context's concern. */
  clearWorkspace: () => void;
  handleOpenPaper: (paper: Paper) => void;
  handlePaperDeleted: (paperId: string) => void;
}

const AppStateContext = createContext<AppState | null>(null);

export function useAppState(): AppState {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}

/**
 * Everything App.tsx used to hold as local state, lifted into a
 * Context so route components (each its own private route now — see
 * `AppRoutes.tsx`) can all reach the same workspace/paper/reader state
 * without threading two dozen props through the router. The route
 * tree itself is deliberately kept out of this file: this is just
 * state + business logic, same "data vs. navigation" split as
 * everywhere else in this codebase.
 */
export function AppStateProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [activePaper, setActivePaper] = useState<Paper | null>(null);
  const [contextStatus, setContextStatus] = useState("Ready");
  const [restoring, setRestoring] = useState(true);

  const [sidebarOpen, setSidebarOpenState] = useState<boolean>(() => {
    const stored = localStorage.getItem(SIDEBAR_OPEN_KEY);
    return stored === null ? true : stored === "true";
  });
  const [sidebarWidth, setSidebarWidthState] = useState<number>(() => {
    const stored = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_SIDEBAR_WIDTH;
  });

  const [themePreference, setThemePreference] = useState<ThemePreference>(() =>
    themeService.getPreference(),
  );
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    themeService.getResolvedTheme(),
  );

  const [thoughtEditorOpen, setThoughtEditorOpen] = useState(false);
  const [currentThought, setCurrentThought] = useState("");
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [excerptsVersion, setExcerptsVersion] = useState(0);

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

  useEffect(() => {
    return themeService.subscribe(() => {
      setResolvedTheme(themeService.getResolvedTheme());
    });
  }, []);

  function setSidebarOpen(open: boolean) {
    setSidebarOpenState(open);
    localStorage.setItem(SIDEBAR_OPEN_KEY, String(open));
  }

  function setSidebarWidth(width: number) {
    setSidebarWidthState(width);
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
  }

  function handleThemeChange(preference: ThemePreference) {
    themeService.setPreference(preference);
    setThemePreference(preference);
    setResolvedTheme(themeService.getResolvedTheme());
  }

  function handleToggleTheme() {
    handleThemeChange(resolvedTheme === "dark" ? "light" : "dark");
  }

  async function activateWorkspace(ws: WorkspaceInfo) {
    setWorkspace(ws);
    localStorage.setItem(LAST_WORKSPACE_KEY, ws.name);
    setSidebarOpen(true);

    try {
      const lastPaperId = localStorage.getItem(lastPaperKey(ws.name));
      if (!lastPaperId) return;
      const papers = await libraryService.listPapers();
      const match = papers.find((p) => p.id === lastPaperId);
      if (match) {
        setActivePaper(match);
        setContextStatus(`Opened "${match.title}"`);
      }
    } catch {
      // Best-effort — a failed lookup just means the reader opens
      // empty, same as a first-time workspace open.
    }
  }

  function clearWorkspace() {
    workspaceService.close().catch(() => {
      // Best-effort — the connection may already be gone.
    });
    setWorkspace(null);
    setActivePaper(null);
    setPage(0);
    setPageCount(0);
    setThoughtEditorOpen(false);
  }

  // Mount-time only: try to silently resume the last-active workspace
  // (and, within it, the last-active paper) before any route renders.
  // Falls through untouched if nothing's remembered, the folder's
  // gone, or permission isn't silently grantable.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const lastWorkspaceName = localStorage.getItem(LAST_WORKSPACE_KEY);
        if (!lastWorkspaceName) return;
        const root = await workspaceService.tryGetWorkspacesRoot();
        if (!root) return;
        const dirHandle = await root.getDirectoryHandle(lastWorkspaceName);
        const ws = await workspaceService.openWorkspaceAt(dirHandle);
        if (cancelled) return;
        await activateWorkspace(ws);
      } catch {
        // No usable remembered workspace — the launcher route handles it.
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleOpenPaper(paper: Paper) {
    setActivePaper(paper);
    setContextStatus(`Opened "${paper.title}"`);
    if (workspace) localStorage.setItem(lastPaperKey(workspace.name), paper.id);
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

  /** A paper was removed from the Library sidebar. If it was the one
   * open in the reader, close it out too — the reader can't keep
   * showing a PDF whose catalog row (and file) no longer exist. */
  function handlePaperDeleted(paperId: string) {
    if (activePaper?.id !== paperId) return;
    setActivePaper(null);
    setPage(0);
    setPageCount(0);
    setContextStatus("Paper removed");
    if (workspace) localStorage.removeItem(lastPaperKey(workspace.name));
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

  const value: AppState = {
    workspace,
    activePaper,
    contextStatus,
    restoring,
    sidebarOpen,
    setSidebarOpen,
    sidebarWidth,
    setSidebarWidth,
    themePreference,
    resolvedTheme,
    handleThemeChange,
    handleToggleTheme,
    thoughtEditorOpen,
    setThoughtEditorOpen,
    currentThought,
    handleOpenThought,
    handleSaveThought,
    page,
    pageCount,
    excerptsVersion,
    handlePageInfo,
    handleExcerptSaved,
    handleMetadataSaved,
    activateWorkspace,
    clearWorkspace,
    handleOpenPaper,
    handlePaperDeleted,
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}
