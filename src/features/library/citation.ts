import type { Paper } from "./types";

/**
 * Converts one free-typed author name ("Jane A. Smith", "Smith, Jane",
 * "J. Smith") into APA7's "Last, F. M." shape. Best-effort, not a real
 * name parser — this app stores authors as plain strings (see
 * `Paper.authors`), not structured given/family fields, so there's no
 * way to be fully correct against every name format a researcher might
 * type. Handles the two common shapes ("Last, First" and "First
 * Last") and falls back to returning the name unchanged if neither
 * matches cleanly (e.g. a single-word name, an organization name).
 */
function formatAuthorApa(rawName: string): string {
  const name = rawName.trim();
  if (!name) return name;

  // Already "Last, First [Middle]" — just reduce the given names to initials.
  if (name.includes(",")) {
    const [last, rest] = name.split(",", 2).map((p) => p.trim());
    const initials = initialsFrom(rest);
    return initials ? `${last}, ${initials}` : last;
  }

  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return name; // single token — can't split last/first meaningfully
  const last = parts[parts.length - 1];
  const initials = initialsFrom(parts.slice(0, -1).join(" "));
  return initials ? `${last}, ${initials}` : last;
}

function initialsFrom(givenNames: string): string {
  return givenNames
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => `${n[0].toUpperCase()}.`)
    .join(" ");
}

/**
 * Joins APA-formatted author names per APA7's rules: 1 author as-is;
 * 2 joined with "&"; 3–20 comma-separated with "&" before the last;
 * 21+ lists the first 19, an ellipsis, then the final author (APA7's
 * own rule for very long author lists).
 */
function joinAuthorsApa(authors: string[]): string {
  const formatted = authors.map(formatAuthorApa);
  if (formatted.length === 1) return formatted[0];
  if (formatted.length === 2) return `${formatted[0]}, & ${formatted[1]}`;
  if (formatted.length <= 20) {
    return `${formatted.slice(0, -1).join(", ")}, & ${formatted[formatted.length - 1]}`;
  }
  return `${formatted.slice(0, 19).join(", ")}, . . . ${formatted[formatted.length - 1]}`;
}

/**
 * Builds a single APA7 reference-list entry for a paper, from
 * whatever catalog fields it has. Deliberately simplified against the
 * full APA7 spec — this app has one generic "journal/container" field
 * rather than separate volume/issue/page-range fields (see
 * `library/types.ts`'s note on `SourceType`), so this can't produce a
 * complete journal-article reference the way a dedicated citation
 * manager would. What it does produce is the correct author/year/
 * title ordering and punctuation, with whatever venue and locator
 * (DOI or URL) information is on hand — a solid draft to finish by
 * hand if a field the schema doesn't track (page range, issue number)
 * matters for a particular submission.
 */
export function formatApa7Citation(paper: Paper): string {
  const authorPart =
    paper.authors && paper.authors.length > 0 ? `${joinAuthorsApa(paper.authors)} ` : "";
  const yearPart = `(${paper.year ?? "n.d."}).`;
  const titlePart = paper.title ? ` ${paper.title}.` : " Untitled.";
  const venuePart = paper.journal ? ` ${paper.journal}.` : "";
  const locatorPart = paper.doi
    ? ` https://doi.org/${paper.doi.replace(/^https?:\/\/doi\.org\//, "")}`
    : paper.url
      ? ` ${paper.url}`
      : "";

  return `${authorPart}${yearPart}${titlePart}${venuePart}${locatorPart}`.trim();
}

/** First author's surname, for alphabetizing a reference list —
 * "et al." ordering conventions don't apply to sorting, just display. */
export function apa7SortKey(paper: Paper): string {
  const first = paper.authors?.[0];
  if (!first) return paper.title?.toLowerCase() ?? "";
  const formatted = formatAuthorApa(first);
  return formatted.split(",")[0].toLowerCase();
}
