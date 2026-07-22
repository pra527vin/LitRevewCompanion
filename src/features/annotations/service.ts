import { excerptRepository } from "./repository";
import { Excerpt } from "./types";
import type { NotebookSectionId } from "../notebook/types";

export const annotationsService = {
  /**
   * Saves a captured highlight. Always starts unassigned
   * (`section: null`) — per Design_Decisions.md's workflow, Read →
   * Highlight → Assign to notebook section → Continue reading are
   * deliberate, separate steps. Interrupting the highlight moment to
   * ask "which section?" would work against "reduce friction without
   * reducing thought." Assignment happens afterward, in the Notebook's
   * unassigned-highlights list.
   */
  async saveExcerpt(
    paperId: string,
    quote: string,
    pageNumber: number,
    userNote: string | null,
    endPage: number | null = null,
  ): Promise<Excerpt> {
    const excerpt: Excerpt = {
      id: crypto.randomUUID(),
      paperId,
      section: null,
      quote: quote.trim(),
      pageNumber,
      // Collapse "endPage === pageNumber" to null — a single-page
      // highlight should read as "same page," not "spans a
      // zero-page range," and formatExcerptPages already treats the
      // two identically, but storing null keeps existing single-page
      // rows and new ones consistent.
      endPage: endPage != null && endPage > pageNumber ? endPage : null,
      userNote: userNote?.trim() || null,
      createdAt: new Date().toISOString(),
    };
    await excerptRepository.insert(excerpt);
    return excerpt;
  },

  async listExcerpts(paperId: string): Promise<Excerpt[]> {
    return excerptRepository.listByPaper(paperId);
  },

  async reassignExcerpt(id: string, section: NotebookSectionId): Promise<void> {
    await excerptRepository.updateSection(id, section);
  },

  async unassignExcerpt(id: string): Promise<void> {
    await excerptRepository.updateSection(id, null);
  },

  /**
   * Edits an already-saved excerpt's quote and/or note in place — the
   * "editing room" workflow: paraphrase a highlight directly, or clean
   * up stray text a PDF selection picked up, without creating a
   * duplicate excerpt. An emptied-out quote is rejected rather than
   * silently saved (mirrors HighlightPopover's save-guard on capture)
   * — callers should disable Save on their end for the same reason,
   * this is the belt-and-suspenders check.
   */
  async updateExcerpt(id: string, quote: string, userNote: string | null): Promise<void> {
    const trimmedQuote = quote.trim();
    if (!trimmedQuote) return;
    await excerptRepository.updateContent(id, trimmedQuote, userNote?.trim() || null);
  },

  async deleteExcerpt(id: string): Promise<void> {
    await excerptRepository.remove(id);
  },

  /** Milestone 12 — Search. Empty query short-circuits to no results,
   * same convention `libraryService.searchPapers` uses. */
  async searchExcerpts(query: string): Promise<Excerpt[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    return excerptRepository.search(trimmed);
  },
};
