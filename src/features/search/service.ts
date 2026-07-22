import { libraryService } from "../library";
import { notebookService } from "../notebook";
import { annotationsService, formatExcerptPages } from "../annotations";
import { SearchResult } from "./types";

/**
 * Milestone 12 — Search. A composition feature, same shape as
 * Milestone 10 (Paper Summary) and Milestone 11 (Literature Matrix):
 * it reads across `library`, `notebook`, and `annotations` through
 * their *service* layers, never their repositories directly, and
 * none of those three import anything back from `search/` — see
 * src/features/README.md's note on cross-feature composition for why
 * that one-way rule matters (avoids a real runtime circular import).
 *
 * No new table, no new migration — every match is a query over data
 * those three features already own, same reasoning docs/schema.md
 * gives for why the Literature Matrix isn't its own table either.
 */
export const searchService = {
  async search(query: string): Promise<SearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const [paperMatches, noteMatches, excerptMatches, allPapers] = await Promise.all([
      libraryService.searchPapers(trimmed),
      notebookService.searchNotes(trimmed),
      annotationsService.searchExcerpts(trimmed),
      // Notebook/excerpt matches only carry a paper_id — fetched once
      // up front (rather than per match) to resolve the full `Paper`
      // record, since the same paper can easily show up from more
      // than one angle (a note match and an excerpt match both).
      libraryService.listPapers(),
    ]);

    const paperById = new Map(allPapers.map((p) => [p.id, p]));
    const results: SearchResult[] = [];

    for (const paper of paperMatches) {
      results.push({
        kind: "paper",
        paper,
        snippet: paper.title || paper.filePath,
      });
    }

    for (const match of noteMatches) {
      const paper = paperById.get(match.paperId);
      // Defensive, shouldn't happen given the FK — but a search
      // shouldn't crash the whole result set over one orphaned row.
      if (!paper) continue;
      results.push({
        kind: "note",
        paper,
        snippet: match.content,
        section: match.section,
        sectionTitle: match.sectionTitle,
      });
    }

    for (const excerpt of excerptMatches) {
      const paper = paperById.get(excerpt.paperId);
      if (!paper) continue;
      results.push({
        kind: "excerpt",
        paper,
        snippet: excerpt.quote,
        section: excerpt.section ?? undefined,
        pageLabel: formatExcerptPages(excerpt),
      });
    }

    return results;
  },
};
