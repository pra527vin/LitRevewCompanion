import { notebookRepository } from "./repository";
import {
  NOTEBOOK_SECTIONS,
  NOTEBOOK_SECTION_DEFS,
  NotebookSectionId,
  NotebookNotesMap,
} from "./types";

/** Milestone 12 — Search result shape: a note match, already resolved
 * to a human-readable section title so `search/`'s UI doesn't need to
 * know about `NOTEBOOK_SECTION_DEFS` itself. */
export interface NoteSearchResult {
  paperId: string;
  section: NotebookSectionId;
  sectionTitle: string;
  content: string;
}

function emptyNotesMap(): NotebookNotesMap {
  const map = {} as NotebookNotesMap;
  for (const id of NOTEBOOK_SECTIONS) {
    map[id] = "";
  }
  return map;
}

export const notebookService = {
  /**
   * Loads every section's saved content for a paper, defaulting to
   * empty strings for sections that don't have a row yet (i.e. every
   * section the researcher hasn't written in). A row with an unknown
   * `section` value (shouldn't happen given the CHECK constraint, but
   * defensive) is silently skipped rather than thrown away loudly.
   */
  async loadNotes(paperId: string): Promise<NotebookNotesMap> {
    const rows = await notebookRepository.listByPaper(paperId);
    const map = emptyNotesMap();
    for (const row of rows) {
      if ((NOTEBOOK_SECTIONS as readonly string[]).includes(row.section)) {
        map[row.section as NotebookSectionId] = row.content;
      }
    }
    return map;
  },

  async saveNote(
    paperId: string,
    section: NotebookSectionId,
    content: string,
  ): Promise<void> {
    await notebookRepository.save(paperId, section, content, new Date().toISOString());
  },

  /**
   * Milestone 12 — Search. Rows whose `section` isn't one of the
   * canonical IDs are dropped (same defensive stance `loadNotes`
   * takes) rather than surfaced with a missing title.
   */
  async searchNotes(query: string): Promise<NoteSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const rows = await notebookRepository.searchAll(trimmed);
    const results: NoteSearchResult[] = [];
    for (const row of rows) {
      if (!(NOTEBOOK_SECTIONS as readonly string[]).includes(row.section)) continue;
      const def = NOTEBOOK_SECTION_DEFS.find((d) => d.id === row.section);
      if (!def) continue;
      results.push({
        paperId: row.paperId,
        section: row.section as NotebookSectionId,
        sectionTitle: def.title,
        content: row.content,
      });
    }
    return results;
  },
};
