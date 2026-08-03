import { useEffect, useRef, useState } from "react";
import { Paper, PaperThumbnail } from "../../library";
import type { WorkspaceInfo } from "../../workspace";
import { dashboardService } from "../service";
import { CategoryBreakdown, DashboardSummary, DocumentStatus, ProgressEntry, TableFilterRequest } from "../types";
import { DocumentsTable } from "./DocumentsTable";
import "./DashboardView.css";

export interface DashboardViewProps {
  workspace: WorkspaceInfo;
  onClose: () => void;
  /** Same contract every other overlay in this app uses — opening a
   * paper from a card here just navigates back to the reader with it
   * loaded. */
  onOpenPaper: (paper: Paper) => void;
  /** Threaded down to the documents table's "Remove" action so the
   * caller can clear a deleted paper out of `activePaper`/etc. */
  onPaperDeleted: (paperId: string) => void;
}

/**
 * The Toolbar's "Progress" action (replacing the old global Search
 * page — see AppRoutes.tsx's doc comment) — a full page (like
 * Settings, not a modal over the reader — see AppRoutes.tsx's
 * `DashboardRoute`) giving a researcher managing a literature review a
 * reading-progress overview: how much of the library is actually
 * read, what's mid-flight, what's stalled, and — the centerpiece —
 * every document in one filterable table with per-row actions.
 *
 * Layout, top to bottom: KPI tiles (four of which — Total/Completed/
 * In Progress/Not Started — are clickable, jumping down to the table
 * with its status filter set accordingly), then the documents table
 * side by side with a narrower column holding Continue Reading above
 * By Category (both height-matched to the table, each scrolling
 * internally rather than growing that row taller — see
 * `.dashboard-page__table-row`'s CSS). "Needs Attention" and
 * "Recently Completed" aren't separate panels any more — the table's
 * own "Recently opened"/"Recently completed" sort options (see
 * DocumentsTable.tsx) cover the same ground without a dedicated
 * widget. By Category's rows are clickable too, same jump-with-filter
 * behavior as the KPI tiles — see `handleJump*` below and
 * `TableFilterRequest`'s own doc comment for how a click up here
 * reaches the table without the two needing a shared data/state layer.
 */
export function DashboardView({ workspace, onClose, onOpenPaper, onPaperDeleted }: DashboardViewProps) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingFilter, setPendingFilter] = useState<TableFilterRequest | null>(null);
  const tableSectionRef = useRef<HTMLDivElement>(null);

  async function refreshSummary() {
    setLoading(true);
    try {
      setSummary(await dashboardService.getSummary());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshSummary();
  }, []);

  function scrollToTable() {
    tableSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /** "Total Documents" — just jumps down, doesn't touch any filter. */
  function handleJumpToTable() {
    scrollToTable();
  }

  /** A status KPI tile ("Completed"/"In Progress"/"Not Started") —
   * jumps down and sets the table's status filter. Always a fresh
   * object (see `TableFilterRequest`'s doc comment) so clicking the
   * same tile twice in a row still re-scrolls. */
  function handleJumpWithStatus(status: DocumentStatus) {
    setPendingFilter({ status });
    scrollToTable();
  }

  /** A "By Category" row — jumps down and filters the table to that
   * category (or "__none__" for the synthetic Uncategorized bucket). */
  function handleJumpWithCategory(categoryId: string) {
    setPendingFilter({ categoryId });
    scrollToTable();
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-page__header">
        <h2>Progress</h2>
        <button type="button" className="dashboard-page__done" onClick={onClose}>
          Back to Reader
        </button>
      </header>

      <div className="dashboard-page__content">
        {loading && !summary && <p className="dashboard__status">Loading your dashboard…</p>}

        {summary && summary.kpis.totalDocuments === 0 && (
          <p className="dashboard__status">
            Add papers to your library to start tracking your reading progress here.
          </p>
        )}

        {summary && summary.kpis.totalDocuments > 0 && (
          <>
            <KpiGrid kpis={summary.kpis} onJumpToTable={handleJumpToTable} onJumpWithStatus={handleJumpWithStatus} />

            <div className="dashboard-page__table-row" ref={tableSectionRef}>
              <div className="dashboard-page__table-main">
                <DocumentsTable
                  workspace={workspace}
                  onOpenPaper={onOpenPaper}
                  onPaperDeleted={onPaperDeleted}
                  onChanged={refreshSummary}
                  pendingFilter={pendingFilter}
                />
              </div>
              <div className="dashboard-page__table-side">
                <PaperListSection
                  title="Continue Reading"
                  emptyHint="Nothing in progress — open a paper from your library to start one."
                  entries={summary.continueReading}
                  workspace={workspace}
                  onOpenPaper={onOpenPaper}
                  metaFor={(e) => `${Math.round(e.progressPct)}% complete`}
                />
                <CategorySection
                  breakdown={summary.byCategory}
                  total={summary.kpis.totalDocuments}
                  onSelectCategory={handleJumpWithCategory}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function KpiGrid({
  kpis,
  onJumpToTable,
  onJumpWithStatus,
}: {
  kpis: DashboardSummary["kpis"];
  onJumpToTable: () => void;
  onJumpWithStatus: (status: DocumentStatus) => void;
}) {
  const tiles: {
    label: string;
    value: string;
    tone?: "accent" | "important";
    onClick?: () => void;
  }[] = [
    { label: "Total Documents", value: String(kpis.totalDocuments), onClick: onJumpToTable },
    { label: "Completed", value: String(kpis.completed), onClick: () => onJumpWithStatus("completed") },
    { label: "In Progress", value: String(kpis.inProgress), onClick: () => onJumpWithStatus("in-progress") },
    { label: "Not Started", value: String(kpis.notStarted), onClick: () => onJumpWithStatus("not-started") },
    { label: "Completion Rate", value: `${kpis.completionRate}%`, tone: "accent" },
    { label: "Important & Unread", value: String(kpis.importantUnread), tone: "important" },
  ];
  return (
    <section className="dashboard__section dashboard__section--first">
      <div className="dashboard__kpi-grid">
        {tiles.map((t) => {
          const className = "dashboard__kpi" + (t.tone ? ` dashboard__kpi--${t.tone}` : "");
          if (!t.onClick) {
            return (
              <div key={t.label} className={className}>
                <span className="dashboard__kpi-value">{t.value}</span>
                <span className="dashboard__kpi-label">{t.label}</span>
              </div>
            );
          }
          return (
            <button
              key={t.label}
              type="button"
              className={className + " dashboard__kpi--clickable"}
              onClick={t.onClick}
              title={`Jump to All Documents${t.label === "Total Documents" ? "" : ` filtered to "${t.label}"`}`}
            >
              <span className="dashboard__kpi-value">{t.value}</span>
              <span className="dashboard__kpi-label">{t.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Continue Reading — a single-column list of paper rows (not a
 * grid), sitting above By Category in the table's side column. Both
 * panels share the column's table-matched height and scroll their own
 * lists internally rather than growing it. */
function PaperListSection({
  title,
  emptyHint,
  entries,
  workspace,
  onOpenPaper,
  metaFor,
}: {
  title: string;
  emptyHint: string;
  entries: ProgressEntry[];
  workspace: WorkspaceInfo;
  onOpenPaper: (paper: Paper) => void;
  metaFor: (entry: ProgressEntry) => string;
}) {
  return (
    <section className="dashboard__panel dashboard__panel--scrollable">
      <h3 className="dashboard__section-title">{title}</h3>
      {entries.length === 0 ? (
        <p className="dashboard__empty">{emptyHint}</p>
      ) : (
        <div className="dashboard__list">
          {entries.map((entry) => (
            <button
              key={entry.paper.id}
              type="button"
              className="dashboard__list-item"
              onClick={() => onOpenPaper(entry.paper)}
            >
              <PaperThumbnail
                source={{ kind: "paper", workspace, paper: entry.paper }}
                className="dashboard__list-thumb"
              />
              <span className="dashboard__list-info">
                <span className="dashboard__list-title">
                  {entry.paper.title || entry.paper.filePath}
                </span>
                <span className="dashboard__progress-track">
                  <span
                    className="dashboard__progress-fill"
                    style={{ width: `${Math.round(entry.progressPct)}%` }}
                  />
                </span>
                <span className="dashboard__list-meta">{metaFor(entry)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** Sits beside the documents table, height-matched to it (see
 * `.dashboard-page__table-row`'s CSS) — its own row list scrolls
 * internally rather than growing the table's row taller when there
 * are more categories than fit. Each row jumps to the table filtered
 * to that category. */
function CategorySection({
  breakdown,
  total,
  onSelectCategory,
}: {
  breakdown: CategoryBreakdown[];
  total: number;
  onSelectCategory: (categoryId: string) => void;
}) {
  if (breakdown.length === 0) return null;
  return (
    <section className="dashboard__panel dashboard__panel--category">
      <h3 className="dashboard__section-title">By Category</h3>
      <div className="dashboard__category-list">
        {breakdown.map((c) => {
          const pct = total > 0 ? Math.round((c.count / total) * 100) : 0;
          return (
            <button
              key={c.categoryId ?? "__none__"}
              type="button"
              className="dashboard__category-row"
              onClick={() => onSelectCategory(c.categoryId ?? "__none__")}
              title={`Filter All Documents to "${c.categoryName}"`}
            >
              <div className="dashboard__category-row-top">
                <span className="dashboard__category-name">{c.categoryName}</span>
                <span className="dashboard__category-count">{c.count}</span>
              </div>
              <span className="dashboard__category-bar-track">
                <span className="dashboard__category-bar-fill" style={{ width: `${pct}%` }} />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
