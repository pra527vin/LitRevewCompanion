import { dictionaryRepository } from "./repository";

export interface WordDefinitionResult {
  term: string;
  definition: string;
  source: string;
}

/**
 * Looks up `term` via the free, public, no-auth-required
 * dictionaryapi.dev API, straight from the browser (no backend
 * round-trip needed). Returns a single, compact definition — the
 * first definition of the first meaning, prefixed with its part of
 * speech when available (e.g. "(noun) a unit of...") — matching
 * `dictionary_cache.definition`'s single-TEXT-column shape rather
 * than the full multi-meaning structure the API actually returns.
 */
async function fetchWordDefinition(term: string): Promise<WordDefinitionResult> {
  const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(term)}`);

  if (response.status === 404) {
    throw new Error("No definition found.");
  }
  if (!response.ok) {
    throw new Error(`Dictionary lookup failed (${response.status}).`);
  }

  const body = await response.json();
  const meaning = body?.[0]?.meanings?.[0];
  const partOfSpeech: string | undefined = meaning?.partOfSpeech;
  const defText: string | undefined = meaning?.definitions?.[0]?.definition;

  if (!defText) {
    throw new Error("No definition found.");
  }

  return {
    term,
    definition: partOfSpeech ? `(${partOfSpeech}) ${defText}` : defText,
    source: "dictionaryapi.dev",
  };
}

// Strips surrounding punctuation a word might carry from PDF text
// extraction (trailing commas, parens, quote marks, etc.) without
// stripping internal characters a real word can contain, like the
// apostrophe in "don't" or the hyphen in "well-known".
function normalizeWord(word: string): string {
  return word
    .trim()
    .toLowerCase()
    .replace(/^[^a-z']+|[^a-z']+$/gi, "");
}

export const dictionaryService = {
  /**
   * Looks up a word's definition, cache first. Returns `null` on any
   * failure — including "no definition found" for the word — rather
   * than throwing, since this backs a hover tooltip: surfacing an
   * error for every stray or unrecognized word the cursor passes over
   * would be much worse than just not showing a tooltip for it.
   */
  async lookupWord(rawWord: string): Promise<WordDefinitionResult | null> {
    const term = normalizeWord(rawWord);
    if (!term) return null;

    const cached = await dictionaryRepository.get(term);
    if (cached) {
      return { term: cached.term, definition: cached.definition, source: cached.source };
    }

    try {
      const result = await fetchWordDefinition(term);
      await dictionaryRepository.save(
        result.term,
        result.definition,
        result.source,
        new Date().toISOString(),
      );
      return result;
    } catch {
      return null;
    }
  },
};
