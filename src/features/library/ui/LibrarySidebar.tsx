import { useEffect, useState } from "react";
import { libraryService, PendingImport, ImportReviewEntry } from "../service";
import { Paper, Category, Tag, IMPORTANT_TAG_NAME, READ_TAG_NAME } from "../types";
import type { WorkspaceInfo } from "../../workspace";
import { ConfirmDialog } from "../../../shared/ConfirmDialog";
import { downloadBlob } from "../../../shared/downloadFile";
import { ImportReviewDialog } from "./ImportReviewDialog";
import { PaperThumbnail } from "./PaperThumbnail";
import { MoreIcon, DownloadIcon, TagIcon, TrashIcon, SearchIcon, SlidersIcon } from "./icons";
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

type SortOption = "recent" | "title" | "year" | "lastStudied" | "custom";

/** Compares two possibly-null numbers, always sorting `null` last
 * regardless of direction — used instead of `?? Infinity`/`?? -Infinity`
 * substitutions, which silently produce `NaN` (an invalid comparator
 * result) whenever *both* sides are null, since `Infinity - Infinity`
 * and `-Infinity - (-Infinity)` both equal `NaN`. That's not a corner
 * case here: most papers have no year yet, are never opened, or have
 * never been dragged, so ties on null were the common case, not the
 * rare one — every one of "Year", "Last studied", and "Custom order"
 * was sorting close to arbitrarily. */
function compareNullableDesc(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

function sortPapers(papers: Paper[], sortBy: SortOption): Paper[] {
  const sorted = [...papers];
  switch (sortBy) {
    case "title":
      sorted.sort((a, b) => (a.title || a.filePath).localeCompare(b.title || b.filePath));
      break;
    case "year":
      sorted.sort((a, b) => compareNullableDesc(a.year, b.year));
      break;
    case "lastStudied":
      sorted.sort((a, b) =>
        compareNullableDesc(
          a.lastOpenedAt ? Date.parse(a.lastOpenedAt) : null,
          b.lastOpenedAt ? Date.parse(b.lastOpenedAt) : null,
        ),
      );
      break;
    case "custom":
      // Never-dragged papers (sortOrder null) sort to the end, in
      // whatever order they arrived in (Array#sort is stable, so that
      // stays "most recently added first" — the same order `papers`
      // itself loads in). Ascending, unlike the other two — a lower
      // sortOrder is earlier in the list — so this can't reuse
      // compareNullableDesc as-is.
      sorted.sort((a, b) => {
        if (a.sortOrder === null && b.sortOrder === null) return 0;
        if (a.sortOrder === null) return 1;
        if (b.sortOrder === null) return -1;
        return a.sortOrder - b.sortOrder;
      });
      break;
    case "recent":
    default:
      sorted.sort((a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt));
  }
  return sorted;
}

/** A filesystem-safe download filename derived from a paper's title
 * (falling back to its stored filename) — the researcher's own title
 * edits, not the content-hashed name it's actually stored under. */
function downloadFilename(paper: Paper): string {
  const base = (paper.title || paper.filePath.split("/").pop() || "paper")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .trim();
  return `${base || "paper"}.pdf`;
}

/** A brief pause between programmatically-triggered downloads —
 * browsers (Chrome especially) can silently block a burst of
 * auto-triggered downloads fired with no gap between them. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
 * removing several papers in one go, and every row gets its own
 * category picker, so a paper can be filed — or refiled — after
 * import, not only during the "Add Paper" review step.
 *
 * Search pass: the toolbar's always-visible category/tag/sort
 * dropdowns were replaced with one search box (matches title,
 * category, and tag names at once) plus an "Advanced" toggle that
 * reveals those same three dropdowns for combining a precise
 * category + tag + sort filter alongside the free-text search.
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
  const [tags, setTags] = useState<Tag[]>([]);
  // The main search box — matches title, category name, and tag
  // names at once. "" = no text filter.
  const [searchQuery, setSearchQuery] = useState("");
  // Advanced panel — the old always-visible category/tag/sort
  // dropdowns, now tucked behind a toggle so the default toolbar is
  // just "Add Paper…" + search.
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // "" = all papers, "__none__" = uncategorized only, else a category id.
  const [categoryFilter, setCategoryFilter] = useState("");
  // Same convention as categoryFilter, but "__none__" means "no tags at all".
  const [tagFilter, setTagFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [resizing, setResizing] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Paper | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDownloading, setBulkDownloading] = useState(false);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkNewTagName, setBulkNewTagName] = useState("");

  const [tagPopoverFor, setTagPopoverFor] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState("");
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const [reviewState, setReviewState] = useState<ReviewState | null>(null);
  const [reviewCategories, setReviewCategories] = useState<Category[]>([]);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [allPapers, allCategories, allTags] = await Promise.all([
        libraryService.listPapers(),
        libraryService.listCategories(),
        libraryService.listTags(),
      ]);
      setPapers(allPapers);
      setCategories(allCategories);
      setTags(allTags);
    } finally {
      setLoading(false);
    }
  }

  const searchTerm = searchQuery.trim().toLowerCase();
  const filteredPapers = papers.filter((p) => {
    if (categoryFilter) {
      const matchesCategory =
        categoryFilter === "__none__" ? p.categoryId === null : p.categoryId === categoryFilter;
      if (!matchesCategory) return false;
    }
    if (tagFilter) {
      const matchesTag =
        tagFilter === "__none__" ? p.tags.length === 0 : p.tags.some((t) => t.id === tagFilter);
      if (!matchesTag) return false;
    }
    if (searchTerm) {
      const haystack = [p.title, p.filePath, p.categoryName, ...p.tags.map((t) => t.name)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(searchTerm)) return false;
    }
    return true;
  });
  // Search/filter narrow which papers show; sortBy still governs the
  // order they show in.
  const sortedPapers = sortPapers(filteredPapers, sortBy);
  // Custom tags offered in the popover, ahead of which Important/Read
  // already get their own dedicated quick-toggle chips.
  const otherTags = tags.filter((t) => t.name !== IMPORTANT_TAG_NAME && t.name !== READ_TAG_NAME);

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
  }, [papers, categoryFilter, tagFilter, searchQuery]);

  // Closes whichever tag popover or context menu is open on a click
  // anywhere else — the popovers/menus themselves stop propagation,
  // so this only ever fires for a genuine "clicked away."
  useEffect(() => {
    if (!tagPopoverFor && !bulkTagOpen && !menuOpenFor) return;
    function handleDocumentClick() {
      setTagPopoverFor(null);
      setBulkTagOpen(false);
      setMenuOpenFor(null);
      setNewTagName("");
      setBulkNewTagName("");
    }
    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, [tagPopoverFor, bulkTagOpen, menuOpenFor]);

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

  /** "Remove" in a row's context menu — for a wrong file that got
   * imported. Just queues the confirm dialog; the actual delete (and
   * its "this can't be undone" warning) happens in `confirmDelete`
   * once the user accepts, since it removes the copied PDF and every
   * note/excerpt/reading-position tied to it, not just the catalog
   * entry. */
  function handleDelete(paper: Paper) {
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

  /** "Download" in a row's context menu — saves a copy of the paper's
   * PDF to the researcher's real disk. */
  async function handleDownload(paper: Paper) {
    try {
      const file = await libraryService.getPaperFile(workspace, paper);
      downloadBlob(file, downloadFilename(paper));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  /** "Download" on the selection bar — one at a time, staggered, so a
   * browser blocking a burst of auto-downloads doesn't drop most of
   * the batch. A single failed file doesn't stop the rest. */
  async function handleDownloadSelected() {
    const targets = papers.filter((p) => selectedIds.has(p.id));
    if (targets.length === 0) return;
    setBulkDownloading(true);
    try {
      for (const p of targets) {
        try {
          const file = await libraryService.getPaperFile(workspace, p);
          downloadBlob(file, downloadFilename(p));
        } catch {
          // Best-effort — one missing/locked file shouldn't stop the batch.
        }
        await delay(250);
      }
    } finally {
      setBulkDownloading(false);
    }
  }

  /** A single-paper tag chip's click (the quick Important/Read
   * toggles, and any custom tag already listed) — unambiguous here
   * since only one paper is involved, so it just flips membership. */
  async function toggleTag(paper: Paper, tagName: string) {
    const existing = paper.tags.find(
      (t) => t.name.toLowerCase() === tagName.trim().toLowerCase(),
    );
    try {
      if (existing) {
        await libraryService.removeTagFromPaper(paper.id, existing.id);
      } else {
        await libraryService.addTagToPaper(paper.id, tagName);
      }
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  /** The tag popover's "new tag" input — always adds, rather than
   * toggling, so typing a name that happens to match an already-
   * assigned tag can't accidentally remove it. */
  async function handleAddNewTag(paper: Paper) {
    const name = newTagName.trim();
    if (!name) return;
    setNewTagName("");
    try {
      await libraryService.addTagToPaper(paper.id, name);
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  /** "Tag Selected" — applies one tag to every selected paper at
   * once. Always adds (never toggles/removes): with several papers
   * potentially in different states already, "add this tag to all of
   * them" is the only unambiguous bulk action. */
  async function applyTagToSelected(tagName: string) {
    const name = tagName.trim();
    const targets = papers.filter((p) => selectedIds.has(p.id));
    if (!name || targets.length === 0) return;
    setMessage(null);
    try {
      for (const p of targets) {
        await libraryService.addTagToPaper(p.id, name);
      }
      setBulkTagOpen(false);
      setBulkNewTagName("");
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  /** A card's drag start — plain HTML5 drag-and-drop, not pointer
   * tracking, since (unlike the sidebar's resize handle) this never
   * needs to keep tracking outside the list itself. */
  function handleRowDragStart(e: React.DragEvent, paperId: string) {
    setDraggedId(paperId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleRowDragOver(e: React.DragEvent, paperId: string) {
    e.preventDefault();
    if (draggedId && paperId !== draggedId && dragOverId !== paperId) {
      setDragOverId(paperId);
    }
  }

  function handleRowDragEnd() {
    setDraggedId(null);
    setDragOverId(null);
  }

  /** Dropping a card onto another one — reorders within whatever's
   * currently visible (a category/tag filter may be narrowing that)
   * and switches to "Custom order" so the new arrangement is actually
   * what's shown, rather than being immediately overridden by
   * whichever sort was active. Optimistic: the visible order updates
   * immediately, `reorderPapers` persists it in the background. */
  async function handleRowDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    const sourceId = draggedId;
    setDraggedId(null);
    setDragOverId(null);
    if (!sourceId || sourceId === targetId) return;

    const ids = sortedPapers.map((p) => p.id);
    if (!ids.includes(sourceId) || !ids.includes(targetId)) return;
    const without = ids.filter((id) => id !== sourceId);
    const insertAt = without.indexOf(targetId);
    without.splice(insertAt, 0, sourceId);
    const reorderedIds = without;

    const orderById = new Map(reorderedIds.map((id, i) => [id, i]));
    setPapers((prev) =>
      prev.map((p) => (orderById.has(p.id) ? { ...p, sortOrder: orderById.get(p.id)! } : p)),
    );
    setSortBy("custom");

    try {
      await libraryService.reorderPapers(reorderedIds);
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
        <div className="library-sidebar__search">
          <span className="library-sidebar__search-icon" aria-hidden>
            <SearchIcon />
          </span>
          <input
            type="text"
            className="library-sidebar__search-input"
            placeholder="Search title, category, or tag…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search papers by title, category, or tag"
          />
        </div>
        <button
          type="button"
          className={
            "library-sidebar__advanced-toggle" +
            (advancedOpen ? " library-sidebar__advanced-toggle--active" : "")
          }
          onClick={() => setAdvancedOpen((v) => !v)}
          aria-expanded={advancedOpen}
          title="Advanced search"
        >
          <SlidersIcon /> Advanced
        </button>
      </div>

      {advancedOpen && (
        <div className="library-sidebar__advanced-panel">
          <select
            className="library-sidebar__toolbar-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
            title="Filter by category"
          >
            <option value="">All categories</option>
            <option value="__none__">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            className="library-sidebar__toolbar-select"
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            aria-label="Filter by tag"
            title="Filter by tag"
          >
            <option value="">All tags</option>
            <option value="__none__">No tags</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            className="library-sidebar__toolbar-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            aria-label="Sort by"
            title="Sort by"
          >
            <option value="recent">Sort: Recently added</option>
            <option value="title">Sort: Title (A–Z)</option>
            <option value="year">Sort: Year (newest)</option>
            <option value="lastStudied">Sort: Last studied</option>
            <option value="custom">Sort: Custom order</option>
          </select>
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="library-sidebar__selection-bar">
          <span>{selectedIds.size} selected</span>
          <div className="library-sidebar__selection-actions">
            <button type="button" onClick={clearSelection}>
              Cancel
            </button>
            <button type="button" onClick={handleDownloadSelected} disabled={bulkDownloading}>
              {bulkDownloading ? "Downloading…" : "Download"}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setBulkTagOpen((v) => !v);
              }}
            >
              Tag…
            </button>
            <button
              type="button"
              className="library-sidebar__selection-delete"
              onClick={() => setBulkDeleteOpen(true)}
            >
              Delete Selected
            </button>
          </div>
          {bulkTagOpen && (
            <div
              className="library-sidebar__tag-popover library-sidebar__tag-popover--bulk"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="library-sidebar__tag-popover-quick">
                <button
                  type="button"
                  className="library-sidebar__tag-chip library-sidebar__tag-chip--pickable library-sidebar__tag-chip--important"
                  onClick={() => applyTagToSelected(IMPORTANT_TAG_NAME)}
                >
                  ★ Important
                </button>
                <button
                  type="button"
                  className="library-sidebar__tag-chip library-sidebar__tag-chip--pickable library-sidebar__tag-chip--read"
                  onClick={() => applyTagToSelected(READ_TAG_NAME)}
                >
                  ✓ Read
                </button>
              </div>
              {otherTags.length > 0 && (
                <div className="library-sidebar__tag-popover-list">
                  {otherTags.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="library-sidebar__tag-chip library-sidebar__tag-chip--pickable"
                      onClick={() => applyTagToSelected(t.name)}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
              <form
                className="library-sidebar__tag-popover-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  applyTagToSelected(bulkNewTagName);
                }}
              >
                <input
                  className="library-sidebar__tag-popover-input"
                  placeholder="New tag…"
                  value={bulkNewTagName}
                  onChange={(e) => setBulkNewTagName(e.target.value)}
                  autoFocus
                />
                <button type="submit" disabled={!bulkNewTagName.trim()}>
                  Add
                </button>
              </form>
            </div>
          )}
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
          <p className="library-sidebar__empty">No papers match this filter.</p>
        )}
        {sortedPapers.map((p) => (
          <div
            key={p.id}
            draggable
            onDragStart={(e) => handleRowDragStart(e, p.id)}
            onDragOver={(e) => handleRowDragOver(e, p.id)}
            onDrop={(e) => handleRowDrop(e, p.id)}
            onDragEnd={handleRowDragEnd}
            className={
              "library-sidebar__row" +
              (p.id === activePaperId ? " library-sidebar__row--active" : "") +
              (draggedId === p.id ? " library-sidebar__row--dragging" : "") +
              (dragOverId === p.id ? " library-sidebar__row--drag-over" : "")
            }
          >
            <span className="library-sidebar__row-drag-handle" aria-hidden title="Drag to reorder">
              ⠿
            </span>
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
                {p.tags.length > 0 && (
                  <span className="library-sidebar__row-tags">
                    {p.tags.map((t) => (
                      <span
                        key={t.id}
                        className={
                          "library-sidebar__tag-chip" +
                          (t.name === IMPORTANT_TAG_NAME
                            ? " library-sidebar__tag-chip--important"
                            : "") +
                          (t.name === READ_TAG_NAME ? " library-sidebar__tag-chip--read" : "")
                        }
                      >
                        {t.name}
                      </span>
                    ))}
                  </span>
                )}
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
            <div className="library-sidebar__row-actions">
              <button
                type="button"
                className="library-sidebar__row-menu-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setTagPopoverFor(null);
                  setMenuOpenFor(menuOpenFor === p.id ? null : p.id);
                }}
                disabled={deletingId === p.id}
                title="More actions"
                aria-label="More actions"
              >
                <MoreIcon />
              </button>

              {menuOpenFor === p.id && (
                <div className="library-sidebar__context-menu" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="library-sidebar__context-menu-item"
                    onClick={() => {
                      setMenuOpenFor(null);
                      handleDownload(p);
                    }}
                  >
                    <span className="library-sidebar__context-menu-icon" aria-hidden>
                      <DownloadIcon />
                    </span>
                    Download
                  </button>
                  <button
                    type="button"
                    className="library-sidebar__context-menu-item"
                    onClick={() => {
                      setMenuOpenFor(null);
                      setTagPopoverFor(p.id);
                    }}
                  >
                    <span className="library-sidebar__context-menu-icon" aria-hidden>
                      <TagIcon />
                    </span>
                    Add Tags{p.tags.length > 0 ? ` (${p.tags.length})` : ""}
                  </button>
                  <button
                    type="button"
                    className="library-sidebar__context-menu-item library-sidebar__context-menu-item--danger"
                    onClick={() => {
                      setMenuOpenFor(null);
                      handleDelete(p);
                    }}
                  >
                    <span className="library-sidebar__context-menu-icon" aria-hidden>
                      <TrashIcon />
                    </span>
                    Delete
                  </button>
                </div>
              )}

              {tagPopoverFor === p.id && (
                <div className="library-sidebar__tag-popover" onClick={(e) => e.stopPropagation()}>
                  <div className="library-sidebar__tag-popover-quick">
                    <button
                      type="button"
                      className={
                        "library-sidebar__tag-chip library-sidebar__tag-chip--pickable library-sidebar__tag-chip--important" +
                        (p.tags.some((t) => t.name === IMPORTANT_TAG_NAME)
                          ? " library-sidebar__tag-chip--active"
                          : "")
                      }
                      onClick={() => toggleTag(p, IMPORTANT_TAG_NAME)}
                    >
                      ★ Important
                    </button>
                    <button
                      type="button"
                      className={
                        "library-sidebar__tag-chip library-sidebar__tag-chip--pickable library-sidebar__tag-chip--read" +
                        (p.tags.some((t) => t.name === READ_TAG_NAME)
                          ? " library-sidebar__tag-chip--active"
                          : "")
                      }
                      onClick={() => toggleTag(p, READ_TAG_NAME)}
                    >
                      ✓ Read
                    </button>
                  </div>
                  {otherTags.length > 0 && (
                    <div className="library-sidebar__tag-popover-list">
                      {otherTags.map((t) => {
                        const active = p.tags.some((pt) => pt.id === t.id);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            className={
                              "library-sidebar__tag-chip library-sidebar__tag-chip--pickable" +
                              (active ? " library-sidebar__tag-chip--active" : "")
                            }
                            onClick={() => toggleTag(p, t.name)}
                          >
                            {t.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <form
                    className="library-sidebar__tag-popover-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleAddNewTag(p);
                    }}
                  >
                    <input
                      className="library-sidebar__tag-popover-input"
                      placeholder="New tag…"
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      autoFocus
                    />
                    <button type="submit" disabled={!newTagName.trim()}>
                      Add
                    </button>
                  </form>
                </div>
              )}
            </div>
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
