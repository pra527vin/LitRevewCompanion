import type { Paper } from "../library";
import type { NotebookSectionId } from "../notebook";

/**
 * Fixed comparison columns, matching docs/wireframes/03_Literature_Matrix.html
 * exactly: Methodology, Dataset, Findings, Limitations, Relevance. The
 * wireframe is the only concrete spec for what the matrix shows — it
 * picks 5 of the notebook's 12 sections rather than all of them, and
 * nothing in Design_Decisions.md says otherwise, so that's treated as
 * the deliberate column set rather than an example subset. Each id
 * maps directly onto a `NotebookSectionId` so cell values can be read
 * straight out of `notebookService.loadNotes` with no translation
 * layer (see this milestone's log for why a general "any section"
 * matrix was considered and dropped for scope).
 */
export const MATRIX_COLUMNS: { id: NotebookSectionId; title: string }[] = [
  { id: "methodology", title: "Methodology" },
  { id: "dataset", title: "Dataset" },
  { id: "findings", title: "Findings" },
  { id: "limitations", title: "Limitations" },
  { id: "relevance", title: "Relevance" },
];

export type MatrixColumnId = (typeof MATRIX_COLUMNS)[number]["id"];

export interface MatrixRow {
  paper: Paper;
  cells: Record<MatrixColumnId, string>;
}
