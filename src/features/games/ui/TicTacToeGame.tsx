import { useEffect, useRef, useState } from "react";
import { Board, GameResult, Mark, bestMove, emptyBoard, winnerOf } from "../ticTacToe";
import "./TicTacToeGame.css";

/** How long the CPU "thinks" before playing. Purely cosmetic — the
 * move itself is computed instantly — but an opponent that answers
 * in the same frame you clicked reads as a glitch rather than a
 * player. */
const CPU_DELAY_MS = 420;

const GLYPH: Record<Mark, string> = { X: "✕", O: "◯" };

/**
 * Tic Tac Toe — the Refreshment section's first game. Two modes,
 * toggled in place: against the CPU (see `bestMove`) or two players
 * sharing the keyboard.
 *
 * The board is always played X-first, and in CPU mode the human is
 * always X — so "is it the CPU's turn" is exactly "turn === 'O' &&
 * vsCpu", with no separate side-assignment state to keep in sync.
 * Scores persist across rounds until cleared, but only for the
 * session; there's nothing here worth writing to a workspace.
 */
export function TicTacToeGame() {
  const [board, setBoard] = useState<Board>(emptyBoard);
  const [turn, setTurn] = useState<Mark>("X");
  const [winner, setWinner] = useState<Mark | "draw" | null>(null);
  const [line, setLine] = useState<number[] | null>(null);
  const [hover, setHover] = useState(-1);
  const [scoreX, setScoreX] = useState(0);
  const [scoreO, setScoreO] = useState(0);
  const [vsCpu, setVsCpu] = useState(true);
  const [thinking, setThinking] = useState(false);

  const cpuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (cpuTimerRef.current) clearTimeout(cpuTimerRef.current);
    };
  }, []);

  function applyResult(next: Board, result: GameResult) {
    setBoard(next);
    setWinner(result.mark);
    setLine(result.line);
    setThinking(false);
    if (result.mark === "X") setScoreX((s) => s + 1);
    if (result.mark === "O") setScoreO((s) => s + 1);
  }

  function play(index: number) {
    if (winner || board[index] || thinking) return;

    const next = board.slice();
    next[index] = turn;

    const result = winnerOf(next);
    if (result) {
      applyResult(next, result);
      return;
    }

    // Two-player mode (or, defensively, an O-turn click that isn't
    // the CPU's) — just hand the board over.
    if (!vsCpu || turn !== "X") {
      setBoard(next);
      setTurn(turn === "X" ? "O" : "X");
      return;
    }

    setBoard(next);
    setTurn("O");
    setThinking(true);
    setHover(-1);

    if (cpuTimerRef.current) clearTimeout(cpuTimerRef.current);
    cpuTimerRef.current = setTimeout(() => {
      cpuTimerRef.current = null;
      const afterCpu = next.slice();
      afterCpu[bestMove(afterCpu, "O")] = "O";

      const cpuResult = winnerOf(afterCpu);
      if (cpuResult) {
        applyResult(afterCpu, cpuResult);
        return;
      }
      setBoard(afterCpu);
      setTurn("X");
      setThinking(false);
    }, CPU_DELAY_MS);
  }

  function resetRound() {
    if (cpuTimerRef.current) clearTimeout(cpuTimerRef.current);
    cpuTimerRef.current = null;
    setBoard(emptyBoard());
    setTurn("X");
    setWinner(null);
    setLine(null);
    setHover(-1);
    setThinking(false);
  }

  /** Switching opponents mid-round would leave a half-played board
   * belonging to nobody, so the round restarts with it. */
  function toggleMode() {
    setVsCpu((v) => !v);
    resetRound();
  }

  const xName = "You";
  const oName = vsCpu ? "CPU" : "Player 2";
  const acceptingMoves = !winner && !thinking;

  let status: string;
  if (winner === "draw") status = "A draw — nobody blinked.";
  else if (winner === "X") status = `${xName} takes it.`;
  else if (winner === "O") status = `${oName} ${vsCpu ? "wins this one." : "takes it."}`;
  else if (thinking) status = "CPU is thinking…";
  else status = `${turn === "X" ? xName : oName} to move`;

  return (
    <div className="ttt">
      <div className="ttt__scoreboard">
        <div
          className={
            "ttt__score" + (acceptingMoves && turn === "X" ? " ttt__score--active-x" : "")
          }
        >
          <span className="ttt__score-glyph ttt__score-glyph--x">{GLYPH.X}</span>
          <span className="ttt__score-name">{xName}</span>
          <span className="ttt__score-value">{scoreX}</span>
        </div>
        <div className="ttt__score-divider" aria-hidden />
        <div
          className={
            "ttt__score" +
            (thinking || (acceptingMoves && turn === "O") ? " ttt__score--active-o" : "")
          }
        >
          <span className="ttt__score-value">{scoreO}</span>
          <span className="ttt__score-name">{oName}</span>
          <span className="ttt__score-glyph ttt__score-glyph--o">{GLYPH.O}</span>
        </div>
      </div>

      <div className="ttt__board-frame">
        <div className="ttt__board">
          {board.map((mark, i) => {
            // The faint preview of the mark you'd place — only on an
            // empty square, only while the game is actually accepting
            // moves.
            const ghost = !mark && acceptingMoves && hover === i;
            const shown = mark ?? (ghost ? turn : null);
            return (
              <button
                key={i}
                type="button"
                className={
                  "ttt__cell" + (line?.includes(i) ? " ttt__cell--win" : "")
                }
                onClick={() => play(i)}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover((h) => (h === i ? -1 : h))}
                disabled={!acceptingMoves || Boolean(mark)}
                aria-label={
                  mark ? `Square ${i + 1}, ${mark}` : `Square ${i + 1}, empty`
                }
              >
                {shown && (
                  <span
                    className={
                      "ttt__mark ttt__mark--" +
                      shown.toLowerCase() +
                      (mark ? " ttt__mark--placed" : " ttt__mark--ghost")
                    }
                  >
                    {GLYPH[shown]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="ttt__footer">
        <p className="ttt__status">{status}</p>
        <div className="ttt__actions">
          <button type="button" className="ttt__button ttt__button--primary" onClick={resetRound}>
            New round
          </button>
          <button type="button" className="ttt__button" onClick={toggleMode}>
            {vsCpu ? "Playing vs CPU" : "Two players"}
          </button>
          <button
            type="button"
            className="ttt__button"
            onClick={() => {
              setScoreX(0);
              setScoreO(0);
            }}
          >
            Clear score
          </button>
        </div>
      </div>
    </div>
  );
}
