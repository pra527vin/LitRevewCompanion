import { useMemo, useState } from "react";
import { EQUATION_SYMBOL_CATEGORIES, EquationSymbol } from "../equationSymbols";
import "./EquationSymbolPicker.css";

export interface EquationSymbolPickerProps {
  /** Inserts a symbol wherever the caller's cursor tracking says to —
   * doesn't imply anything closes, so several symbols can be dropped
   * in one after another, same as Word's own Insert Symbol dialog.
   * The caller (`EquationComposerModal`) is also what records it into
   * the shared "recent" list — this component doesn't track that
   * itself, so a symbol used here and one used from the recent-symbols
   * bar under the preview never disagree about what's actually recent. */
  onInsert: (symbol: EquationSymbol) => void;
}

/**
 * The symbol picker's content — categories grouped the way Word's own
 * Insert Equation gallery does (see equationSymbols.ts), shown as a
 * row of pills above the grid rather than a cramped vertical list, so
 * every category name is fully readable at a glance instead of
 * competing for a narrow sidebar's width. A search box flattens every
 * category at once. Deliberately just the picker itself with no modal
 * chrome — `EquationComposerModal` embeds it alongside the equation
 * textarea/preview, so editing and symbol-picking live in one dialog.
 */
export function EquationSymbolPicker({ onInsert }: EquationSymbolPickerProps) {
  const [activeCategory, setActiveCategory] = useState<string>(EQUATION_SYMBOL_CATEGORIES[0].id);
  const [query, setQuery] = useState("");

  const searchResults = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return null;
    const seen = new Set<string>();
    const matches: EquationSymbol[] = [];
    for (const category of EQUATION_SYMBOL_CATEGORIES) {
      for (const symbol of category.symbols) {
        const haystack = `${symbol.label} ${symbol.insert} ${symbol.keywords ?? ""}`.toLowerCase();
        if (haystack.includes(trimmed) && !seen.has(symbol.insert)) {
          seen.add(symbol.insert);
          matches.push(symbol);
        }
      }
    }
    return matches;
  }, [query]);

  const visibleSymbols =
    searchResults ?? EQUATION_SYMBOL_CATEGORIES.find((c) => c.id === activeCategory)?.symbols ?? [];

  return (
    <div className="equation-symbol-picker">
      <div className="equation-symbol-picker__search">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={'Search symbols… (e.g. "infinity", "leq", "sum")'}
        />
      </div>

      {!searchResults && (
        <nav className="equation-symbol-picker__categories" aria-label="Symbol categories">
          {EQUATION_SYMBOL_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              className={
                "equation-symbol-picker__category" +
                (activeCategory === c.id ? " equation-symbol-picker__category--active" : "")
              }
              onClick={() => setActiveCategory(c.id)}
            >
              {c.title}
            </button>
          ))}
        </nav>
      )}

      <div className="equation-symbol-picker__grid">
        {visibleSymbols.length === 0 && (
          <p className="equation-symbol-picker__empty">
            {searchResults ? `No symbols match "${query}".` : "No symbols in this category."}
          </p>
        )}
        {visibleSymbols.map((symbol, i) => (
          <button
            key={`${symbol.insert}-${i}`}
            type="button"
            className="equation-symbol-picker__symbol"
            onClick={() => onInsert(symbol)}
            title={
              symbol.keywords ? `${symbol.insert.trim()} — ${symbol.keywords}` : symbol.insert.trim()
            }
          >
            {symbol.label}
          </button>
        ))}
      </div>
    </div>
  );
}
