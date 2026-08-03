import { useEffect, useState } from "react";
import {
  libraryService,
  Category,
  Paper,
  Tag,
  IMPORTANT_TAG_NAME,
  READ_TAG_NAME,
  MoreIcon,
  DownloadIcon,
  TrashIcon,
  SearchIcon,
  SlidersIcon,
  ResetIcon,
} from "../../library";
import type { WorkspaceInfo } from "../../workspace";
import { ConfirmDialog } from "../../../shared/ConfirmDialog";
import { downloadBlob } from "../../../shared/downloadFile";
import { dashboardService } from "../service";
import { DocumentRow, DocumentStatus, TableFilterRequest } from "../types";
import "./DocumentsTable.css";

export interface DocumentsTableProps {
  workspace: WorkspaceInfo;
  onOpenPaper: (paper: Paper) => void;
  /** Same contract the Library sidebar uses — called once a paper is
   * actually removed, so the caller can clear it out of `activePaper`/
   * other state it's holding if this was the one open. */
  onPaperDeleted: (paperId: string) => void;
  /** Called after any action here that changes the catalog (a paper
   * deleted) — the Dashboard's KPI tiles and summary panels are
   * fetched separately and would otherwise go stale the moment this
   * table's own data changes. */
  onChanged: () => void;
  /** A filter pushed in from elsewhere on the page (a KPI tile, a
   * category row) — see `TableFilterRequest`'s own doc comment for why
   * this needs a fresh object every time rather than a plain value. */
  pendingFilter?: TableFilterRequest | null;
}

const STATUS_LABEL: Record<DocumentStatus, string> = {
  completed: "Completed",
  "in-progress": "In Progress",
  "not-started": "Not Started",
};

type TableSortOption = "recentlyAdded" | "recentlyCompleted" | "recentlyOpened";

const NAME_LIMIT = 100;
const PAGE_SIZE = 10;

function truncateName(name: string): string {
  return name.length > NAME_LIMIT ? `${name.slice(0, NAME_LIMIT)}…` : name;
}

/** A filesystem-safe download filename derived from a paper's title —
 * same helper the Library sidebar's row menu uses. */
function downloadFilename(paper: Paper): string {
  const base = (paper.title || paper.filePath.split("/").pop() || "paper")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .trim();
  return `${base || "paper"}.pdf`;
}

/** Compares two possibly-null timestamps (as epoch ms), always
 * sorting `null` last — see LibrarySidebar's own `compareNullableDesc`
 * for why this can't just be `(b ?? -Infinity) - (a ?? -Infinity)`:
 * when both sides are null that subtraction is `NaN`, an invalid
 * comparator result, and ties on null are the common case here (most
 * papers are never opened, or never completed). */
function compareNullableDesc(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

function sortDocuments(rows: DocumentRow[], sortBy: TableSortOption): DocumentRow[] {
  const sorted = [...rows];
  switch (sortBy) {
    case "recentlyCompleted":
      sorted.sort((a, b) =>
        compareNullableDesc(
          a.status === "completed" && a.lastActivityAt ? Date.parse(a.lastActivityAt) : null,
          b.status === "completed" && b.lastActivityAt ? Date.parse(b.lastActivityAt) : null,
        ),
      );
      break;
    case "recentlyOpened":
      sorted.sort((a, b) =>
        compareNullableDesc(
          a.lastActivityAt ? Date.parse(a.lastActivityAt) : null,
          b.lastActivityAt ? Date.parse(b.lastActivityAt) : null,
        ),
      );
      break;
    case "recentlyAdded":
    default:
      sorted.sort((a, b) => Date.parse(b.paper.addedAt) - Date.parse(a.paper.addedAt));
  }
  return sorted;
}

/**
 * The Dashboard's centerpiece — every paper in the library as a
 * single table (name/category/added/status/tags), rather than the
 * recent-N thumbnail lists the rest of the page shows. Per-row
 * actions are tucked behind a "⋮" menu — same pattern, and the same
 * line icons, as the Library sidebar's rows use — but with only
 * Download and Remove on it: tagging a paper is a Library sidebar
 * action, not something this table's menu duplicates (the Tags
 * column here is read-only, filterable via the advanced panel).
 *
 * Search bar + "Advanced" toggle up top (same pattern as the Library
 * sidebar's own search), with category/tag/status/sort tucked into
 * the panel that opens below it rather than always taking up space.
 */
export function DocumentsTable({
  workspace,
  onOpenPaper,
  onPaperDeleted,
  onChanged,
  pendingFilter,
}: DocumentsTableProps) {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // "" = all, "__none__" = uncategorized/no-tags, else an id — same
  // convention the Library sidebar's own filters use.
  const [categoryFilter, setCategoryFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | "">("");
  const [sortBy, setSortBy] = useState<TableSortOption>("recentlyAdded");
  const [page, setPage] = useState(1);

  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Paper | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [docs, allCategories, allTags] = await Promise.all([
        dashboardService.listDocuments(),
        libraryService.listCategories(),
        libraryService.listTags(),
      ]);
      setDocuments(docs);
      setCategories(allCategories);
      setTags(allTags);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  // A new search/filter/sort always starts back at page 1 — staying
  // on whatever page was showing under the old filter would often
  // just land past the end of the new, smaller result set.
  useEffect(() => {
    setPage(1);
  }, [searchQuery, categoryFilter, tagFilter, statusFilter, sortBy]);

  // Applies a filter pushed in from elsewhere on the page. Keyed off
  // `pendingFilter` itself (object identity, not its field values) —
  // the caller always sends a fresh object, so clicking the same KPI
  // tile twice in a row still re-applies (and this component's parent
  // still re-scrolls) instead of silently no-op'ing because the
  // requested value already matched.
  useEffect(() => {
    if (!pendingFilter) return;
    if (pendingFilter.status !== undefined) setStatusFilter(pendingFilter.status);
    if (pendingFilter.categoryId !== undefined) setCategoryFilter(pendingFilter.categoryId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFilter]);

  // Closes the context menu on a click anywhere else — the menu
  // itself stops propagation, so this only ever fires for a genuine
  // "clicked away."
  useEffect(() => {
    if (!menuOpenFor) return;
    function handleDocumentClick() {
      setMenuOpenFor(null);
    }
    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, [menuOpenFor]);

  async function handleDownload(paper: Paper) {
    try {
      const file = await libraryService.getPaperFile(workspace, paper);
      downloadBlob(file, downloadFilename(paper));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
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
      onChanged();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  }

  const filtered = documents.filter(({ paper, status }) => {
    if (categoryFilter) {
      const matchesCategory =
        categoryFilter === "__none__" ? paper.categoryId === null : paper.categoryId === categoryFilter;
      if (!matchesCategory) return false;
    }
    if (tagFilter) {
      const matchesTag =
        tagFilter === "__none__" ? paper.tags.length === 0 : paper.tags.some((t) => t.id === tagFilter);
      if (!matchesTag) return false;
    }
    if (statusFilter && status !== statusFilter) return false;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      const haystack = [paper.title, paper.filePath, paper.categoryName, ...paper.tags.map((t) => t.name)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const sortedFiltered = sortDocuments(filtered, sortBy);
  const totalPages = Math.max(1, Math.ceil(sortedFiltered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);
  const pageStart = (clampedPage - 1) * PAGE_SIZE;
  const pageItems = sortedFiltered.slice(pageStart, pageStart + PAGE_SIZE);

  const hasActiveFilters = Boolean(
    searchQuery || categoryFilter || tagFilter || statusFilter || sortBy !== "recentlyAdded",
  );

  function handleResetFilters() {
    setSearchQuery("");
    setCategoryFilter("");
    setTagFilter("");
    setStatusFilter("");
    setSortBy("recentlyAdded");
  }

  return (
    <div className="documents-table">
      <div className="documents-table__header-row">
        <h3 className="documents-table__title">All Documents</h3>
        <div className="documents-table__search">
          <span className="documents-table__search-icon" aria-hidden>
            <SearchIcon />
          </span>
          <input
            type="text"
            className="documents-table__search-input"
            placeholder="Search name, category, or tag…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search documents"
          />
        </div>
        <button
          type="button"
          className="documents-table__reset"
          onClick={handleResetFilters}
          disabled={!hasActiveFilters}
          title="Reset search, filters, and sort"
          aria-label="Reset search, filters, and sort"
        >
          <ResetIcon />
        </button>
        <button
          type="button"
          className={
            "documents-table__advanced-toggle" +
            (advancedOpen ? " documents-table__advanced-toggle--active" : "")
          }
          onClick={() => setAdvancedOpen((v) => !v)}
          aria-expanded={advancedOpen}
          title="Advanced search"
        >
          <SlidersIcon /> Advanced
        </button>
      </div>

      {advancedOpen && (
        <div className="documents-table__advanced-panel">
          <select
            className="documents-table__filter-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
            title="Filter by category"
          >
            <option value="">All categories</option>
            <option value="__none__">Uncategorized</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            className="documents-table__filter-select"
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
            className="documents-table__filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as DocumentStatus | "")}
            aria-label="Filter by status"
            title="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="completed">Completed</option>
            <option value="in-progress">In Progress</option>
            <option value="not-started">Not Started</option>
          </select>
          <select
            className="documents-table__filter-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as TableSortOption)}
            aria-label="Sort by"
            title="Sort by"
          >
            <option value="recentlyAdded">Sort: Recently added</option>
            <option value="recentlyOpened">Sort: Recently opened</option>
            <option value="recentlyCompleted">Sort: Recently completed</option>
          </select>
        </div>
      )}

      {message && <p className="documents-table__message">{message}</p>}
      {loading && <p className="documents-table__status">Loading…</p>}
      {!loading && documents.length === 0 && (
        <p className="documents-table__status">No papers yet.</p>
      )}
      {!loading && documents.length > 0 && sortedFiltered.length === 0 && (
        <p className="documents-table__status">No documents match your search/filters.</p>
      )}

      {!loading && sortedFiltered.length > 0 && (
        <div className="documents-table__scroll">
          <table className="documents-table__table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Added</th>
                <th>Status</th>
                <th>Tags</th>
                <th className="documents-table__actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(({ paper, status }) => (
                <tr key={paper.id}>
                  <td>
                    <button
                      type="button"
                      className="documents-table__name"
                      onClick={() => onOpenPaper(paper)}
                      title={paper.title || paper.filePath}
                    >
                      {truncateName(paper.title || paper.filePath)}
                    </button>
                  </td>
                  <td className="documents-table__muted">{paper.categoryName || "Uncategorized"}</td>
                  <td className="documents-table__muted">
                    {new Date(paper.addedAt).toLocaleDateString()}
                  </td>
                  <td>
                    <span className={`documents-table__status-pill documents-table__status-pill--${status}`}>
                      {STATUS_LABEL[status]}
                    </span>
                  </td>
                  <td>
                    <div className="documents-table__tags">
                      {paper.tags.length === 0 && <span className="documents-table__muted">—</span>}
                      {paper.tags.map((t) => (
                        <span
                          key={t.id}
                          className={
                            "documents-table__tag-pill" +
                            (t.name === IMPORTANT_TAG_NAME ? " documents-table__tag-pill--important" : "") +
                            (t.name === READ_TAG_NAME ? " documents-table__tag-pill--read" : "")
                          }
                        >
                          {t.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="documents-table__actions-col">
                    <div className="documents-table__row-actions">
                      <button
                        type="button"
                        className="documents-table__menu-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenFor(menuOpenFor === paper.id ? null : paper.id);
                        }}
                        disabled={deletingId === paper.id}
                        title="More actions"
                        aria-label="More actions"
                      >
                        <MoreIcon />
                      </button>

                      {menuOpenFor === paper.id && (
                        <div
                          className="documents-table__context-menu"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            className="documents-table__context-menu-item"
                            onClick={() => {
                              setMenuOpenFor(null);
                              handleDownload(paper);
                            }}
                          >
                            <span className="documents-table__context-menu-icon" aria-hidden>
                              <DownloadIcon />
                            </span>
                            Download
                          </button>
                          <button
                            type="button"
                            className="documents-table__context-menu-item documents-table__context-menu-item--danger"
                            onClick={() => {
                              setMenuOpenFor(null);
                              setPendingDelete(paper);
                            }}
                          >
                            <span className="documents-table__context-menu-icon" aria-hidden>
                              <TrashIcon />
                            </span>
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && sortedFiltered.length > 0 && totalPages > 1 && (
        <div className="documents-table__pagination">
          <span className="documents-table__pagination-info">
            {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, sortedFiltered.length)} of{" "}
            {sortedFiltered.length}
          </span>
          <div className="documents-table__pagination-actions">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={clampedPage <= 1}
            >
              Previous
            </button>
            <span className="documents-table__pagination-page">
              Page {clampedPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={clampedPage >= totalPages}
            >
              Next
            </button>
          </div>
        </div>
      )}

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
    </div>
  );
}
