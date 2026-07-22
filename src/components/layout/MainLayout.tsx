import { useEffect, useState } from "react";
import { PdfViewer, RecentlyStudiedEntry } from "../../features/reader";
import { Paper } from "../../features/library";
import { Notebook } from "../../features/notebook";
import type { WorkspaceInfo } from "../../features/workspace";
import "./MainLayout.css";

export interface MainLayoutProps {
  paper: Paper | null;
  workspace: WorkspaceInfo;
  onPageInfo: (page: number, pageCount: number) => void;
  /** Bumped by App.tsx whenever a highlight is saved from the reader,
   * so Notebook (which owns its own excerpt list) knows to refetch. */
  excerptsVersion: number;
  onExcerptSaved: () => void;
  onViewSummary: () => void;
  onViewSynthesis: () => void;
  onMetadataSaved: (updated: Paper) => void;
  /** Threaded straight through to PdfViewer's "no paper open" empty
   * state — see that component's own doc comment. */
  recentlyStudied: RecentlyStudiedEntry[];
  onOpenPaper: (paper: Paper) => void;
}

// Preferences (persisted to localStorage — global to the browser
// profile, same reasoning as the Library sidebar's own open/width
// state in App.tsx), not view state: the drawer doesn't reset on
// paper selection or workspace switch.
const NOTEBOOK_OPEN_KEY = "litreview-notebook-open";
const NOTEBOOK_WIDTH_KEY = "litreview-notebook-width";
const DEFAULT_NOTEBOOK_WIDTH = 380;
const MIN_WIDTH = 280;
const MAX_WIDTH = 640;

export function MainLayout({
  paper,
  workspace,
  onPageInfo,
  excerptsVersion,
  onExcerptSaved,
  onViewSummary,
  onViewSynthesis,
  onMetadataSaved,
  recentlyStudied,
  onOpenPaper,
}: MainLayoutProps) {
  // Bridges Notebook's excerpt-card clicks to the reader sitting right
  // next to it — owned here, not in App.tsx, since both sides of the
  // bridge are this component's own direct children and App.tsx has no
  // other reason to know a jump happened. `nonce` (not just the page
  // number) so clicking the same excerpt twice in a row still
  // re-triggers PdfViewer's effect.
  const [jumpRequest, setJumpRequest] = useState<{ page: number; nonce: number } | null>(null);

  const [notebookOpen, setNotebookOpenState] = useState<boolean>(() => {
    const stored = localStorage.getItem(NOTEBOOK_OPEN_KEY);
    return stored === null ? true : stored === "true";
  });
  const [notebookWidth, setNotebookWidthState] = useState<number>(() => {
    const stored = Number(localStorage.getItem(NOTEBOOK_WIDTH_KEY));
    return Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_NOTEBOOK_WIDTH;
  });
  const [resizing, setResizing] = useState(false);

  function setNotebookOpen(open: boolean) {
    setNotebookOpenState(open);
    localStorage.setItem(NOTEBOOK_OPEN_KEY, String(open));
  }

  function setNotebookWidth(width: number) {
    setNotebookWidthState(width);
    localStorage.setItem(NOTEBOOK_WIDTH_KEY, String(width));
  }

  // The drawer has nothing useful to show with no paper open (Notebook
  // itself just renders "Open a paper to start taking notes" then) —
  // hidden entirely in that case, not merely empty. Opening a paper
  // re-opens it automatically, even if it was manually collapsed for a
  // previously-open one; the collapse button still works per-paper
  // from there.
  useEffect(() => {
    if (paper) setNotebookOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper?.id]);

  const notebookVisible = Boolean(paper) && notebookOpen;

  /** Drag-to-resize on the drawer's left edge — same plain
   * document-level pointer-event pattern as LibrarySidebar's own
   * resize handle, mirrored since this drawer grows from the right
   * (dragging the handle left widens it, not right). */
  function handleResizeStart(e: React.PointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = notebookWidth;
    setResizing(true);

    function handleMove(moveEvent: PointerEvent) {
      const next = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, startWidth + (startX - moveEvent.clientX)),
      );
      setNotebookWidth(next);
    }
    function handleUp() {
      setResizing(false);
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
    }
    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
  }

  return (
    <main className="main-layout">
      <PdfViewer
        paper={paper}
        workspace={workspace}
        onPageInfo={onPageInfo}
        onExcerptSaved={onExcerptSaved}
        jumpToPage={jumpRequest}
        recentlyStudied={recentlyStudied}
        onOpenPaper={onOpenPaper}
      />
      {notebookVisible ? (
        <div className="main-layout__notebook-drawer" style={{ width: notebookWidth }}>
          <div
            className={
              "main-layout__notebook-resize" +
              (resizing ? " main-layout__notebook-resize--active" : "")
            }
            onPointerDown={handleResizeStart}
          />
          <Notebook
            paper={paper}
            excerptsVersion={excerptsVersion}
            onViewSummary={onViewSummary}
            onViewSynthesis={onViewSynthesis}
            onMetadataSaved={onMetadataSaved}
            onJumpToPage={(page) => setJumpRequest({ page, nonce: Date.now() })}
            onClose={() => setNotebookOpen(false)}
          />
        </div>
      ) : (
        paper && (
          <button
            className="main-layout__notebook-reopen"
            onClick={() => setNotebookOpen(true)}
            aria-label="Open notebook"
            title="Open notebook"
          >
            &lsaquo;
          </button>
        )
      )}
    </main>
  );
}
