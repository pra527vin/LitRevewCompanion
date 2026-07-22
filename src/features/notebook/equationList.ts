/**
 * The Model Specification section holds *multiple* equations now, but
 * `notebook_notes.content` is still just one TEXT column per (paper,
 * section) — same as every other section, no schema change needed.
 * So this list is JSON-encoded into that single column rather than
 * getting its own table: `[{id, latex}, ...]`.
 *
 * Backward compatibility: a paper saved before multi-equation support
 * has `content` as a single raw LaTeX string, not JSON — `parseEquationList`
 * treats anything that doesn't parse as our array shape as exactly
 * one legacy equation, so nothing gets lost silently.
 */
export interface EquationEntry {
  id: string;
  latex: string;
}

function isEquationEntry(value: unknown): value is EquationEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as EquationEntry).id === "string" &&
    typeof (value as EquationEntry).latex === "string"
  );
}

export function parseEquationList(content: string): EquationEntry[] {
  const trimmed = content.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed) && parsed.every(isEquationEntry)) {
      return parsed;
    }
  } catch {
    // Not JSON — a plain LaTeX string saved before multi-equation support existed.
  }
  return [{ id: crypto.randomUUID(), latex: content }];
}

export function serializeEquationList(equations: EquationEntry[]): string {
  return JSON.stringify(equations);
}
