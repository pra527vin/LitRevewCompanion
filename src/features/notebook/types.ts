/**
 * Free-text notebook sections — every one gets a `notebook_notes` row
 * per paper (Design_Decisions.md → Research Notebook → Sections).
 *
 * "metadata" is deliberately **not** in this list even though it's a
 * valid value in the DB's CHECK constraint (see docs/schema.md,
 * migration 0003) — the wireframe (02_Paper_Summary.html) shows
 * Metadata as Title/Authors/DOI/Journal, i.e. the paper's catalog
 * fields from the `papers` table, not researcher-written prose. So
 * the UI renders it specially from `Paper` data instead of a
 * `notebook_notes` textarea. The DB still permits 'metadata' as a
 * section value for `notebook_notes`/`excerpts` in case that
 * changes later — no migration needed if so.
 *
 * This list MUST stay in sync with the CHECK constraint in
 * src/features/workspace/migrations/0003_notebook.sql (as amended by
 * 0009_model_specification.sql, which added "model-specification").
 *
 * "model-specification" is a special case within this otherwise
 * free-text list: its content is LaTeX equation source rather than
 * prose, and Notebook.tsx renders it with `EquationEditor` instead of
 * a plain `<textarea>` — see that component's own doc comment.
 */
export const NOTEBOOK_SECTIONS = [
  "research-problem",
  "research-questions",
  "theory",
  "variables",
  "methodology",
  "model-specification",
  "dataset",
  "findings",
  "limitations",
  "strengths",
  "weaknesses",
  "relevance",
  "general-notes",
] as const;

export type NotebookSectionId = (typeof NOTEBOOK_SECTIONS)[number];

export interface NotebookSectionDef {
  id: NotebookSectionId;
  title: string;
}

// Order matches Design_Decisions.md → Research Notebook → Sections.
export const NOTEBOOK_SECTION_DEFS: NotebookSectionDef[] = [
  { id: "research-problem", title: "Research Problem" },
  { id: "research-questions", title: "Research Questions" },
  { id: "theory", title: "Theory" },
  { id: "variables", title: "Variables" },
  { id: "methodology", title: "Methodology" },
  { id: "model-specification", title: "Model Specification" },
  { id: "dataset", title: "Dataset" },
  { id: "findings", title: "Findings" },
  { id: "limitations", title: "Limitations" },
  { id: "strengths", title: "Strengths" },
  { id: "weaknesses", title: "Weaknesses" },
  { id: "relevance", title: "Relevance to Thesis" },
  { id: "general-notes", title: "General Notes" },
];

export type NotebookNotesMap = Record<NotebookSectionId, string>;
