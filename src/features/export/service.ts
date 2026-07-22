import { paperSummaryService, PaperSummary } from "../paper-summary";
import { literatureMatrixService, MATRIX_COLUMNS, MatrixRow } from "../literature-matrix";
import { formatExcerptPages } from "../annotations";
import { libraryService, formatApa7Citation, apa7SortKey } from "../library";
import type { Paper } from "../library";
import type { WorkspaceInfo } from "../workspace";
import { exportRepository } from "./repository";

/**
 * Milestone 13 — Export. A composition feature, same one-way-
 * dependency shape as `paper-summary` and `literature-matrix`
 * themselves: `export/` reads from `paper-summary` and
 * `literature-matrix` (their service layers only), and neither of
 * those imports anything back. Deliberately reuses their assembly
 * logic rather than re-querying `library`/`notebook`/`annotations`
 * directly — the content of an export should never be able to drift
 * from what the in-app Paper Summary / Literature Matrix views show,
 * and duplicating that assembly here would risk exactly that.
 *
 * No new table, no dialog/file-picker — exports land in the
 * workspace's own `exports/` folder (created alongside `papers/` when
 * the workspace itself is created, per Design_Decisions.md's
 * Workspace System structure), keeping the export a part of the same
 * self-contained, portable archive as everything else.
 */

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug || "untitled";
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/**
 * Minimal RFC 4180-ish CSV field escaping: quote a field only if it
 * contains a comma, quote, or newline, doubling any embedded quotes.
 */
function csvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvRow(fields: string[]): string {
  return fields.map(csvField).join(",");
}

/**
 * Renders a `PaperSummary` (already text the researcher wrote
 * themselves — see paperSummaryService's own doc comment on why this
 * isn't AI-generated content) as Markdown. Mirrors
 * `PaperSummaryView.tsx`'s section-by-section layout: heading,
 * free-text note if present, then each assigned excerpt as a
 * blockquote with its page number and optional note.
 */
function summaryToMarkdown(paper: Paper, summary: PaperSummary): string {
  const lines: string[] = [`# ${paper.title || "Untitled"}`, ""];

  const byline = [
    paper.authors && paper.authors.length > 0 ? paper.authors.join(", ") : "Unknown authors",
    paper.journal || null,
    paper.year ? String(paper.year) : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
  lines.push(byline);

  if (paper.doi) {
    lines.push("", `DOI: ${paper.doi}`);
  } else if (paper.url) {
    lines.push("", `Retrieved from: ${paper.url}`);
  }

  if (summary.sections.length === 0) {
    lines.push("", "_No notes or highlights captured yet._");
  }

  for (const section of summary.sections) {
    lines.push("", `## ${section.title}`);
    if (section.content) {
      lines.push("", section.content);
    }
    for (const excerpt of section.excerpts) {
      const note = excerpt.userNote ? ` — ${excerpt.userNote}` : "";
      lines.push("", `> (${formatExcerptPages(excerpt)}) ${excerpt.quote}${note}`);
    }
  }

  return lines.join("\n") + "\n";
}

/**
 * Renders the Literature Matrix as CSV — a comparison table is a
 * spreadsheet's native shape, so unlike Paper Summary's Markdown this
 * targets "open in Excel/Sheets" rather than "read as prose."
 * Columns mirror `LiteratureMatrixView.tsx`'s table exactly (Paper +
 * the fixed `MATRIX_COLUMNS`), with Authors/Year split out as their
 * own columns since a spreadsheet benefits from them being
 * separately sortable/filterable rather than folded into one cell.
 */
function matrixToCsv(rows: MatrixRow[]): string {
  const header = ["Paper", "Authors", "Year", ...MATRIX_COLUMNS.map((c) => c.title)];
  const lines = [csvRow(header)];

  for (const row of rows) {
    const fields = [
      row.paper.title || "Untitled",
      row.paper.authors ? row.paper.authors.join("; ") : "",
      row.paper.year ? String(row.paper.year) : "",
      ...MATRIX_COLUMNS.map((c) => row.cells[c.id] || ""),
    ];
    lines.push(csvRow(fields));
  }

  return lines.join("\n") + "\n";
}

/**
 * Renders every paper in the workspace as an APA7 reference list in
 * Markdown, alphabetized by first-author surname (`apa7SortKey`) —
 * the standard ordering for an APA reference list, and consistent
 * with how a researcher would expect to scan it before pasting into a
 * paper's own References section. Sources with no discernible author
 * sort by title, same fallback `apa7SortKey` itself uses.
 */
function bibliographyToMarkdown(papers: Paper[]): string {
  const sorted = [...papers].sort((a, b) => apa7SortKey(a).localeCompare(apa7SortKey(b)));
  const lines: string[] = ["# Bibliography", ""];

  if (sorted.length === 0) {
    lines.push("_No papers in this workspace yet._");
  } else {
    for (const paper of sorted) {
      lines.push(formatApa7Citation(paper), "");
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}

export const exportService = {
  /** Exports the given paper's Paper Summary as a `.md` file into
   * `<workspace>/exports/`. Returns the path written, for display. */
  async exportPaperSummary(workspace: WorkspaceInfo, paper: Paper): Promise<string> {
    const summary = await paperSummaryService.buildSummary(paper.id);
    const markdown = summaryToMarkdown(paper, summary);
    const filename = `paper-summary-${slugify(paper.title || paper.id)}-${timestamp()}.md`;
    return exportRepository.writeFile(workspace, filename, markdown);
  },

  /** Exports the whole-workspace Literature Matrix as a `.csv` file
   * into `<workspace>/exports/`. Returns the path written, for display. */
  async exportLiteratureMatrix(workspace: WorkspaceInfo): Promise<string> {
    const rows = await literatureMatrixService.buildMatrix();
    const csv = matrixToCsv(rows);
    const filename = `literature-matrix-${timestamp()}.csv`;
    return exportRepository.writeFile(workspace, filename, csv);
  },

  /** Exports every paper in the workspace as an APA7 reference list
   * (`.md`) into `<workspace>/exports/`. Returns the path written,
   * for display. */
  async exportBibliography(workspace: WorkspaceInfo): Promise<string> {
    const papers = await libraryService.listPapers();
    const markdown = bibliographyToMarkdown(papers);
    const filename = `bibliography-${timestamp()}.md`;
    return exportRepository.writeFile(workspace, filename, markdown);
  },
};
