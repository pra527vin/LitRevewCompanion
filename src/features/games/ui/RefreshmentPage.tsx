import { useState } from "react";
import { TicTacToeGame } from "./TicTacToeGame";
import "./RefreshmentPage.css";

export interface RefreshmentPageProps {
  /** Named `onClose` for the same reason every other page in this app
   * does — it's what the shell wires "back to the reader" to. */
  onClose: () => void;
}

interface GameDef {
  id: string;
  title: string;
  eyebrow: string;
  description: string;
  /** Rendered when this game is opened. Kept as a render function so
   * a game is one entry in `GAMES` and nothing else — adding another
   * needs no changes to the page around it. */
  render: () => JSX.Element;
}

const GAMES: GameDef[] = [
  {
    id: "tic-tac-toe",
    title: "Tic Tac Toe",
    eyebrow: "Three in a row",
    description: "Against the CPU, or two players sharing the screen.",
    render: () => <TicTacToeGame />,
  },
];

/**
 * The Toolbar's "Refreshment" page — somewhere to actually spend the
 * break the scheduler (Settings → Break Reminders) keeps nudging you
 * into. A grid of games; picking one swaps it in over the grid, with
 * a link back.
 *
 * Deliberately session-only: nothing here is written to the workspace
 * or `localStorage`. A game of tic-tac-toe isn't research data, and a
 * scoreboard that survives a reload would invite treating it as if it
 * were.
 */
export function RefreshmentPage({ onClose }: RefreshmentPageProps) {
  const [activeGameId, setActiveGameId] = useState<string | null>(null);
  const activeGame = GAMES.find((g) => g.id === activeGameId) ?? null;

  return (
    <div className="refreshment-page">
      <header className="refreshment-page__header">
        <h2>Refreshment</h2>
        <button type="button" className="refreshment-page__done" onClick={onClose}>
          Back to Reader
        </button>
      </header>

      <div className="refreshment-page__content">
        {activeGame ? (
          <div className="refreshment-page__game">
            <button
              type="button"
              className="refreshment-page__back"
              onClick={() => setActiveGameId(null)}
            >
              ‹ All games
            </button>
            {activeGame.render()}
          </div>
        ) : (
          <div className="refreshment-page__inner">
            <p className="refreshment-page__intro">
              Step away from the paper for a few minutes. Nothing here is saved — it's just
              somewhere to rest your head before the next section.
            </p>
            <div className="refreshment-page__grid">
              {GAMES.map((game) => (
                <button
                  key={game.id}
                  type="button"
                  className="refreshment-card"
                  onClick={() => setActiveGameId(game.id)}
                >
                  <span className="refreshment-card__eyebrow">{game.eyebrow}</span>
                  <span className="refreshment-card__title">{game.title}</span>
                  <span className="refreshment-card__description">{game.description}</span>
                  <span className="refreshment-card__cta">Play →</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
