import { libraryService } from "../library";
import { notebookService } from "../notebook";
import { MATRIX_COLUMNS, MatrixColumnId, MatrixRow } from "./types";

/**
 * Assembles the Literature Matrix purely by reading existing data —
 * per docs/schema.md's "Deliberately NOT in the schema" note, matrix
 * rows are a *query* over `papers` + `notebook_notes`, not their own
 * table. No data lives only in the matrix, and this milestone adds
 * no migration.
 *
 * Goes through `libraryService`/`notebookService` (the service layer
 * of each feature), never their repositories directly — the same
 * layering `paper-summary` used in Milestone 10, and the reason this
 * feature can read across `library`/`notebook` without either of
 * them needing to know it exists.
 */
export const literatureMatrixService = {
  async buildMatrix(): Promise<MatrixRow[]> {
    const papers = await libraryService.listPapers();

    return Promise.all(
      papers.map(async (paper) => {
        const notes = await notebookService.loadNotes(paper.id);
        const cells = {} as Record<MatrixColumnId, string>;
        for (const column of MATRIX_COLUMNS) {
          cells[column.id] = (notes[column.id] ?? "").trim();
        }
        return { paper, cells };
      }),
    );
  },
};
