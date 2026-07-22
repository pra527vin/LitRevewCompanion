import type { NotebookSectionId } from "../notebook";
import type { Excerpt } from "../annotations";

export interface SummarySection {
  id: NotebookSectionId;
  title: string;
  content: string;
  excerpts: Excerpt[];
}

export interface PaperSummary {
  sections: SummarySection[];
}
