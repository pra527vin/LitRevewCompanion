export type Mark = "X" | "O";
export type Cell = Mark | null;
export type Board = Cell[];

/** Every three-in-a-row on a 3x3 board, as board indices. */
export const WIN_LINES: number[][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export interface GameResult {
  /** `"draw"` when the board filled with no line — otherwise the winner. */
  mark: Mark | "draw";
  /** The winning line's indices, for the board's highlight. Null on a draw. */
  line: number[] | null;
}

export function emptyBoard(): Board {
  return Array<Cell>(9).fill(null);
}

/** The finished state of `board`, or null while it's still in play. */
export function winnerOf(board: Board): GameResult | null {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { mark: board[a] as Mark, line };
    }
  }
  return board.every(Boolean) ? { mark: "draw", line: null } : null;
}

/**
 * The CPU's move for `me`, by the classic three-rule heuristic: take
 * a win if one's there, otherwise block the opponent's, otherwise
 * prefer the centre, then corners, then edges.
 *
 * Deliberately not a full minimax. Tic-tac-toe is small enough to
 * solve exactly, but a perfectly-played opponent can only ever be
 * drawn against — which makes for a joyless three-minute break. The
 * `Math.random() > 0.15` below is the same idea: the CPU passes over
 * its preferred non-centre square now and then, so it's sharp enough
 * to punish carelessness and still losable.
 */
export function bestMove(board: Board, me: Mark): number {
  const other: Mark = me === "X" ? "O" : "X";
  const empty = board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);

  for (const i of empty) {
    const next = board.slice();
    next[i] = me;
    if (winnerOf(next)?.mark === me) return i;
  }
  for (const i of empty) {
    const next = board.slice();
    next[i] = other;
    if (winnerOf(next)?.mark === other) return i;
  }
  for (const i of [4, 0, 2, 6, 8, 1, 3, 5, 7]) {
    if (!empty.includes(i)) continue;
    if (i === 4 || Math.random() > 0.15) return i;
  }
  return empty[0];
}
