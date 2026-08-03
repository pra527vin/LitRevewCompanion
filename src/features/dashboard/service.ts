import { dashboardRepository } from "./repository";
import { libraryService, IMPORTANT_TAG_NAME } from "../library";
import { DashboardSummary, DocumentRow, DocumentStatus } from "./types";

/**
 * Business logic for the Dashboard (the Toolbar's "Progress" action,
 * replacing the old global Search page — see AppRoutes.tsx). One call
 * fans out into every query the page needs and assembles them into a
 * single summary; the UI layer just renders whatever comes back.
 */
export const dashboardService = {
  async getSummary(): Promise<DashboardSummary> {
    const [totalDocuments, progressByPaper, importantUnread, continueReading, byCategory] =
      await Promise.all([
        dashboardRepository.countTotalPapers(),
        dashboardRepository.listProgressByPaper(),
        dashboardRepository.countUnreadByTag(IMPORTANT_TAG_NAME),
        dashboardRepository.listInProgress(),
        dashboardRepository.listCategoryBreakdown(),
      ]);

    let completed = 0;
    let inProgress = 0;
    for (const { progressPct } of progressByPaper.values()) {
      if (progressPct >= 100) completed += 1;
      else inProgress += 1;
    }
    // Not derived from a separate query — every paper is one of
    // "has a reading_state row at/past 100%," "has one under 100%,"
    // or "has none at all," so the third count is just what's left.
    const notStarted = Math.max(0, totalDocuments - completed - inProgress);
    const completionRate =
      totalDocuments > 0 ? Math.round((completed / totalDocuments) * 100) : 0;

    return {
      kpis: { totalDocuments, completed, inProgress, notStarted, completionRate, importantUnread },
      continueReading,
      byCategory,
    };
  },

  /**
   * Every paper in the library, most-recently-added first (the same
   * order `libraryService.listPapers()` already returns them in),
   * each paired with a derived reading status and its last activity
   * timestamp — the All Documents table, including its "Recently
   * Completed"/"Recently Opened" sort options. Reuses `library`'s own
   * listing (already joins category name and tags) rather than a
   * separate dashboard query, since nothing about "every paper" is
   * dashboard-specific except the status/activity fields.
   */
  async listDocuments(): Promise<DocumentRow[]> {
    const [papers, progressByPaper] = await Promise.all([
      libraryService.listPapers(),
      dashboardRepository.listProgressByPaper(),
    ]);
    return papers.map((paper) => {
      const progress = progressByPaper.get(paper.id);
      const status: DocumentStatus =
        progress === undefined ? "not-started" : progress.progressPct >= 100 ? "completed" : "in-progress";
      return { paper, status, lastActivityAt: progress?.updatedAt ?? null };
    });
  },
};
