import { useEffect, useState } from "react";
import { Paper } from "../../library";
import { literatureMatrixService } from "../service";
import { MATRIX_COLUMNS, MatrixRow } from "../types";
import "./LiteratureMatrixView.css";

export interface LiteratureMatrixViewProps {
  onClose: () => void;
  /** Row's paper title is a link back to its PDF (Design_Decisions.md
   * → Review Matrix: "each paper summary remains linked back to its
   * PDF"). Opening straight into the reader — rather than Milestone
   * 10's Paper Summary — matches that line literally and reuses
   * App.tsx's existing `handleOpenPaper` instead of introducing a
   * second "which paper view opens" state machine. See this
   * milestone's log. */
  onOpenPaper: (paper: Paper) => void;
}

export function LiteratureMatrixView({ onClose, onOpenPaper }: LiteratureMatrixViewProps) {
  const [rows, setRows] = useState<MatrixRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    literatureMatrixService.buildMatrix().then((result) => {
      if (cancelled) return;
      setRows(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="lit-matrix__backdrop" onClick={onClose}>
      <div
        className="lit-matrix"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Literature Matrix"
      >
        <header className="lit-matrix__header">
          <h2>Literature Matrix</h2>
          <button
            className="lit-matrix__close"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
        </header>

        <div className="lit-matrix__body">
          {loading && <p className="lit-matrix__status">Assembling matrix…</p>}

          {!loading && rows && rows.length === 0 && (
            <p className="lit-matrix__status">
              No papers yet. Add papers to your library and take notes
              in their Notebooks, then come back here to compare them
              side by side.
            </p>
          )}

          {!loading && rows && rows.length > 0 && (
            <table className="lit-matrix__table">
              <thead>
                <tr>
                  <th className="lit-matrix__paper-col">Paper</th>
                  {MATRIX_COLUMNS.map((column) => (
                    <th key={column.id}>{column.title}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.paper.id}>
                    <td className="lit-matrix__paper-col">
                      <button
                        className="lit-matrix__paper-link"
                        onClick={() => onOpenPaper(row.paper)}
                        title="Open in reader"
                      >
                        {row.paper.title || "Untitled"}
                      </button>
                      <span className="lit-matrix__paper-byline">
                        {row.paper.authors && row.paper.authors.length > 0
                          ? row.paper.authors.join(", ")
                          : "Unknown authors"}
                        {row.paper.year ? ` · ${row.paper.year}` : ""}
                      </span>
                    </td>
                    {MATRIX_COLUMNS.map((column) => {
                      const value = row.cells[column.id];
                      return (
                        <td key={column.id} className="lit-matrix__cell">
                          {value ? (
                            <span title={value}>{value}</span>
                          ) : (
                            <span className="lit-matrix__cell--empty">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
