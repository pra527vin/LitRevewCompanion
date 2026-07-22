import { useEffect, useState } from "react";
import { libraryService, PendingImport, ImportReviewEntry } from "../service";
import { Paper, Category } from "../types";
import type { WorkspaceInfo } from "../../workspace";
import { ConfirmDialog } from "../../../shared/ConfirmDialog";
import { ImportReviewDialog } from "./ImportReviewDialog";
import { PaperThumbnail } from "./PaperThumbnail";
import "./LibrarySidebar.css";

export interface LibrarySidebarProps {
  workspace: WorkspaceInfo;
  /** Current width in px — owned by App.tsx (persisted across
   * sessions), not this component, so collapsing/reopening the
   * sidebar doesn't lose whatever size was last dragged. */
  width: number;
  onWidthChange: (width: number) => void;
  /** Highlights the paper currently open in the reader, if any. */
  activePaperId: string | null;
  onOpenPaper: (paper: Paper) => void;
  /** Called after a paper is actually removed, so the caller can clear
   * it out of any state it's holding (e.g. close the reader if this
   * was the paper currently open, or drop it from "recently studied").
   * Called once per paper for a bulk delete, not once with a list —
   * every existing caller already handles "one paper was removed," so
   * this doesn't need a second shape for the batch case. */
  onPaperDeleted: (paperId: string) => void;
  /** Collapses the sidebar — same name every other panel in this app
   * uses for "leave me," even though this one docks rather than
   * overlays. */
  onClose: () => void;
}

const MIN_WIDTH = 220;
const MAX_WIDTH = 480;

/** PDFs picked and deduped, awaiting the review step before they're
 * actually written into the workspace — see service.ts's
 * `prepareImports`/`finalizeImports`. `duplicates` are already-known
 * papers found among the picked files; nothing to review on those, so
 * they're just folded into the eventual result message. */
interface ReviewState {
  pending: PendingImport[];
  duplicates: Paper[];
}

function duplicatesMessage(duplicates: Paper[]): string | null {
  if (duplicates.length === 0) return null;
  if (duplicates.length === 1) {
    return `Already in your library as "${duplicates[0].title || duplicates[0].filePath}".`;
  }
  return `${duplicates.length} were already in your library.`;
}

/**
 * The library, docked as a resizable left sidebar rather than a modal
 * over the reader (Milestone 16 — Library Sidebar) — so browsing/
 * importing papers no longer has to interrupt whatever's open in the
 * reader/notebook next to it. Owns the same import/delete/category-
 * filter logic the old modal `LibraryPanel` had; only the chrome
 * around it changed (docked layout, workspace name in the header, a
 * drag handle on the right edge, thumbnails per row).
 *
 * Post-Milestone-16 pass: multi-select + "Delete Selected" for
 * removing several papers in one go; the category filter dropdown now
 * always shows (even with zero categories defined, so "No category"
 * is still reachable and the feature is discoverable from day one);
 * and every row gets its own category picker, so a paper can be filed
 * — or refiled — after import, not only during the "Add Paper" review
 * step.
 */
export function LibrarySidebar({
  workspace,
  width,
  onWidthChange,
  activePaperId,
  onOpenPaper,
  onPaperDeleted,
  onClose,
}: LibrarySidebarProps) {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  // "" = all papers, "__none__" = uncategorized only, else a category id.
  const [categoryFilter, setCategoryFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [resizing, setResizing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Paper | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [reviewState, setReviewState] = useState<ReviewState | null>(null);
  const [reviewCategories, setReviewCategories] = useState<Category[]>([]);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [allPapers, allCategories] = await Promise.all([
        libraryService.listPapers(),
        libraryService.listCategories(),
      ]);
      setPapers(allPapers);
      setCategories(allCategories);
    } finally {
      setLoading(false);
    }
  }

  const filteredPapers = papers.filter((p) => {
    if (!categoryFilter) return true;
    if (categoryFilter === "__none__") return p.categoryId === null;
    return p.categoryId === categoryFilter;
  });

  useEffect(() => {
    refresh();
  }, []);

  // Selection only ever makes sense for papers still on screen — drop
  // anything that's been filtered out (or deleted) from now-stale
  // selection state rather than letting it silently keep counting
  // toward "N selected."
  useEffect(() => {
    setSelectedIds((prev) => {
      const visible = new Set(filteredPapers.map((p) => p.id));
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [papers, categoryFilter]);

  /** Picks PDF(s) and, if any are new, loads the category list and
   * opens the review step. Already-cataloged files need no review —
   * their "already in your library" note is queued for as soon as the
   * review step (if any) finishes, so both notes don't compete for
   * the same message line at once. */
  async function handleImport() {
    setMessage(null);
    setImporting(true);
    try {
      const result = await libraryService.prepareImports(workspace);
      if (result.status === "cancelled") return;

      if (result.pending.length === 0) {
        setMessage(duplicatesMessage(result.duplicates));
        return;
      }

      const cats = await libraryService.listCategories();
      setReviewCategories(cats);
      setReviewError(null);
      setReviewState({ pending: result.pending, duplicates: result.duplicates });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  }

  async function handleConfirmReview(entries: ImportReviewEntry[]) {
    if (!reviewState) return;
    setReviewBusy(true);
    setReviewError(null);
    try {
      const imported = await libraryService.finalizeImports(
        workspace,
        reviewState.pending,
        entries,
      );
      const parts: string[] = [];
      if (imported.length === 1) {
        parts.push(`Added "${imported[0].title}".`);
      } else if (imported.length > 1) {
        parts.push(`Added ${imported.length} papers.`);
      }
      const dupMessage = duplicatesMessage(reviewState.duplicates);
      if (dupMessage) parts.push(dupMessage);

      setMessage(parts.length > 0 ? parts.join(" ") : null);
      setReviewState(null);
      await refresh();
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : String(e));
    } finally {
      setReviewBusy(false);
    }
  }

  function handleCancelReview() {
    if (!reviewState) return;
    setMessage(duplicatesMessage(reviewState.duplicates));
    setReviewState(null);
  }

  /** The "×" on a paper row — for a wrong file that got imported. Just
   * queues the confirm dialog; the actual delete (and its "this can't
   * be undone" warning) happens in `confirmDelete` once the user
   * accepts, since it removes the copied PDF and every note/excerpt/
   * reading-position tied to it, not just the catalog entry. */
  function handleDelete(e: React.MouseEvent, paper: Paper) {
    e.stopPropagation();
    setPendingDelete(paper);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const paper = pendingDelete;
    setMessage(null);
    setDeletingId(paper.id);
    try {
      await libraryService.deletePaper(workspace, paper);
      onPaperDeleted(paper.id);
      setPendingDelete(null);
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  }

  function toggleSelected(paperId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(paperId)) next.delete(paperId);
      else next.add(paperId);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  /** "Delete Selected" — same removal, confirmation, and cleanup as a
   * single delete, just over every checked row at once. Partial
   * failures (one locked file, say) don't block the rest of the
   * batch — see `libraryService.deletePapers`. */
  async function confirmBulkDelete() {
    const targets = papers.filter((p) => selectedIds.has(p.id));
    if (targets.length === 0) {
      setBulkDeleteOpen(false);
      return;
    }
    setMessage(null);
    setBulkDeleting(true);
    try {
      const { succeeded, failed } = await libraryService.deletePapers(workspace, targets);
      succeeded.forEach((id) => onPaperDeleted(id));
      setBulkDeleteOpen(false);
      clearSelection();
      if (failed.length > 0) {
        setMessage(
          `Removed ${succeeded.length}. Couldn't remove ${failed.length} — try again for ${
            failed.length === 1 ? "it" : "those"
          }.`,
        );
      } else {
        setMessage(`Removed ${succeeded.length} paper${succeeded.length === 1 ? "" : "s"}.`);
      }
      await refresh();
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handleCategoryChange(paper: Paper, categoryId: string) {
    const nextCategoryId = categoryId || null;
    if (nextCategoryId === paper.categoryId) return;
    // Optimistic — a category rename/reassignment is low-stakes and
    // should feel instant; refresh() below reconciles with the DB
    // (and picks up the joined category name) right after.
    const nextName = categories.find((c) => c.id === nextCategoryId)?.name ?? null;
    setPapers((prev) =>
      prev.map((p) =>
        p.id === paper.id ? { ...p, categoryId: nextCategoryId, categoryName: nextName } : p,
      ),
    );
    try {
      await libraryService.updateCategory(paper.id, nextCategoryId);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      await refresh();
    }
  }

  /** Drag-to-resize on the right edge. Plain pointer-event listeners
   * on `document` rather than React state-driven drag, so the resize
   * keeps tracking even if the pointer briefly leaves the handle. */
  function handleResizeStart(e: React.PointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    setResizing(true);

    function handleMove(moveEvent: PointerEvent) {
      const next = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, startWidth + (moveEvent.clientX - startX)),
      );
      onWidthChange(next);
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
    <div className="library-sidebar" style={{ width }}>
      <header className="library-sidebar__header">
        <div className="library-sidebar__workspace">
          <span className="library-sidebar__workspace-dot" aria-hidden />
          <span className="library-sidebar__workspace-name">{workspace.name}</span>
        </div>
        <button
          className="library-sidebar__collapse"
          onClick={onClose}
          aria-label="Collapse library"
          title="Collapse library"
        >
          &lsaquo;
        </button>
      </header>

      <div className="library-sidebar__toolbar">
        <button
          className="library-sidebar__import"
          onClick={handleImport}
          disabled={importing}
        >
          {importing ? "Adding…" : "Add Paper…"}
        </button>
        <select
          className="library-sidebar__category-filter"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          <option value="__none__">No category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {selectedIds.size > 0 && (
        <div className="library-sidebar__selection-bar">
          <span>{selectedIds.size} selected</span>
          <div className="library-sidebar__selection-actions">
            <button type="button" onClick={clearSelection}>
              Cancel
            </button>
            <button
              type="button"
              className="library-sidebar__selection-delete"
              onClick={() => setBulkDeleteOpen(true)}
            >
              Delete Selected
            </button>
          </div>
        </div>
      )}

      {message && <p className="library-sidebar__message">{message}</p>}

      <div className="library-sidebar__list">
        {loading && <p className="library-sidebar__empty">Loading…</p>}
        {!loading && papers.length === 0 && (
          <p className="library-sidebar__empty">
            No papers yet. Click "Add Paper…" to import your first PDF.
          </p>
        )}
        {!loading && papers.length > 0 && filteredPapers.length === 0 && (
          <p className="library-sidebar__empty">No papers in this category.</p>
        )}
        {filteredPapers.map((p) => (
          <div
            key={p.id}
            className={
              "library-sidebar__row" +
              (p.id === activePaperId ? " library-sidebar__row--active" : "")
            }
          >
            <input
              type="checkbox"
              className="library-sidebar__row-checkbox"
              checked={selectedIds.has(p.id)}
              onChange={() => toggleSelected(p.id)}
              aria-label={`Select "${p.title || p.filePath}"`}
            />
            <button
              className="library-sidebar__row-open"
              onClick={() => onOpenPaper(p)}
              disabled={deletingId === p.id}
            >
              <PaperThumbnail
                source={{ kind: "paper", workspace, paper: p }}
                className="library-sidebar__row-thumb"
              />
              <span className="library-sidebar__row-info">
                <span className="library-sidebar__row-title">
                  {p.title || p.filePath}
                </span>
                <span className="library-sidebar__row-meta">
                  Added {new Date(p.addedAt).toLocaleDateString()}
                </span>
              </span>
            </button>
            <select
              className="library-sidebar__row-category-select"
              value={p.categoryId ?? ""}
              onChange={(e) => handleCategoryChange(p, e.target.value)}
              aria-label={`Category for "${p.title || p.filePath}"`}
              title="Set category"
            >
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              className="library-sidebar__row-delete"
              onClick={(e) => handleDelete(e, p)}
              disabled={deletingId === p.id}
              title={`Remove "${p.title || p.filePath}"`}
              aria-label={`Remove "${p.title || p.filePath}"`}
            >
              &times;
            </button>
          </div>
        ))}
      </div>

      <div
        className={"library-sidebar__resize" + (resizing ? " library-sidebar__resize--active" : "")}
        onPointerDown={handleResizeStart}
      />

      {pendingDelete && (
        <ConfirmDialog
          title="Remove paper?"
          message={`Remove "${pendingDelete.title || pendingDelete.filePath}"? This deletes the PDF and any notes or highlights on it. This can't be undone.`}
          confirmLabel="Remove"
          busy={deletingId === pendingDelete.id}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {bulkDeleteOpen && (
        <ConfirmDialog
          title="Remove selected papers?"
          message={`Remove ${selectedIds.size} selected paper${selectedIds.size === 1 ? "" : "s"}? This deletes each PDF and any notes or highlights on it. This can't be undone.`}
          confirmLabel="Remove"
          busy={bulkDeleting}
          onConfirm={confirmBulkDelete}
          onCancel={() => setBulkDeleteOpen(false)}
        />
      )}

      {reviewState && (
        <ImportReviewDialog
          pending={reviewState.pending}
          categories={reviewCategories}
          busy={reviewBusy}
          error={reviewError}
          onCreateCategory={libraryService.createCategory}
          onLookupCitation={libraryService.lookupCitation}
          onCancel={handleCancelReview}
          onConfirm={handleConfirmReview}
        />
      )}
    </div>
  );
}
