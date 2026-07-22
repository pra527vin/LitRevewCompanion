import type { EquationSymbol } from "../equationSymbols";
import "./RecentSymbolsBar.css";

export interface RecentSymbolsBarProps {
  symbols: EquationSymbol[];
  onInsert: (symbol: EquationSymbol) => void;
}

/**
 * Quick-access row for whatever's actually been used, right under the
 * live preview — the whole point is reinserting a symbol you just
 * used a moment ago (e.g. the same Greek letter in three terms of one
 * equation) without leaving the editor column to dig through the
 * categorized picker on the right. Hidden entirely until there's at
 * least one recent symbol; `EquationComposerModal` owns the actual
 * "recent" list (shared with the picker so using a symbol from either
 * place updates both).
 */
export function RecentSymbolsBar({ symbols, onInsert }: RecentSymbolsBarProps) {
  if (symbols.length === 0) return null;

  return (
    <div className="recent-symbols-bar">
      <span className="recent-symbols-bar__label">Recently used</span>
      <div className="recent-symbols-bar__keys">
        {symbols.map((symbol, i) => (
          <button
            key={`${symbol.insert}-${i}`}
            type="button"
            className="recent-symbols-bar__key"
            onClick={() => onInsert(symbol)}
            title={symbol.keywords ? `${symbol.insert.trim()} — ${symbol.keywords}` : symbol.insert.trim()}
          >
            {symbol.label}
          </button>
        ))}
      </div>
    </div>
  );
}
