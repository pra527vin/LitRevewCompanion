import { notebookService, NOTEBOOK_SECTION_DEFS, parseEquationList } from "../notebook";
import { annotationsService } from "../annotations";
import { PaperSummary, SummarySection } from "./types";

/**
 * Assembles a read-only summary purely from the paper's own
 * structured notebook data — free-text notes and assigned excerpts,
 * fetched and formatted, nothing generated. Design_Decisions.md is
 * explicit under "What the App Does NOT Do" that this app has no AI
 * summaries and no AI-generated literature reviews; Paper Summary is
 * "generated after reading from the structured notebook" (per the
 * doc's Review Matrix section) in the sense of *assembled*, not
 * *authored* — every word in the output already existed in the
 * researcher's own notes or highlights.
 *
 * Sections with neither notes nor excerpts are omitted — a summary
 * padded with a dozen empty headings would defeat the point of
 * "summary." (Interpretation call, not stated explicitly in
 * Design_Decisions.md; see this milestone's log.)
 */
export const paperSummaryService = {
  async buildSummary(paperId: string): Promise<PaperSummary> {
    const [notes, excerpts] = await Promise.all([
      notebookService.loadNotes(paperId),
      annotationsService.listExcerpts(paperId),
    ]);

    const sections: SummarySection[] = NOTEBOOK_SECTION_DEFS.map((def) => {
      const sectionExcerpts = excerpts.filter((e) => e.section === def.id);
      const rawContent = notes[def.id] ?? "";
      // model-specification's content is a JSON-encoded equation list
      // (see equationList.ts), not prose — rendered here as numbered
      // LaTeX lines so both this summary and its markdown export show
      // something readable instead of the raw JSON.
      const content =
        def.id === "model-specification"
          ? parseEquationList(rawContent)
              .map((eq, i) => `${i + 1}. ${eq.latex}`)
              .join("\n")
          : rawContent;
      return {
        id: def.id,
        title: def.title,
        content,
        excerpts: sectionExcerpts,
      };
    }).filter((s) => s.content.trim().length > 0 || s.excerpts.length > 0);

    return { sections };
  },
};
