import { useEffect, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import type { EquationEntry } from "../equationList";
import type { EquationExportFormat } from "../equationExport";
import "./EquationCard.css";

const EXPORT_LABELS: Record<EquationExportFormat, string> = {
  latex: "Copy LaTeX",
  word: "Copy for Word",
};

export interface EquationCardProps {
  entry: EquationEntry;
  index: number;
  onEdit: () => void;
  onRemove: () => void;
  onExport: (format: EquationExportFormat) => void;
  /** Which export format is in flight for *this* card, if any —
   * tracked per-card by the parent so exporting one equation doesn't
   * gray out the others. */
  exportingFormat: EquationExportFormat | null;
}

/** One saved equation in the Model Specification list: rendered
 * (KaTeX, imperatively into `previewRef` for the same reason
 * `EquationEditor`/`EquationComposerModal` do — KaTeX and React can't
 * both own a node's children) plus its own Edit/Remove/Export
 * controls, since all three are per-equation operations now that
 * there can be more than one. */
export function EquationCard({
  entry,
  index,
  onEdit,
  onRemove,
  onExport,
  exportingFormat,
}: EquationCardProps) {
  const previewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = previewRef.current;
    if (!node) return;
    try {
      katex.render(entry.latex, node, { throwOnError: false, displayMode: true });
    } catch {
      node.textContent = entry.latex;
    }
  }, [entry.latex]);

  return (
    <div className="equation-card">
      <div className="equation-card__top">
        <span className="equation-card__index">#{index + 1}</span>
        <div className="equation-card__actions">
          <button type="button" className="equation-card__edit" onClick={onEdit}>
            Edit
          </button>
          <button type="button" className="equation-card__remove" onClick={onRemove}>
            Remove
          </button>
        </div>
      </div>

      <div className="equation-card__preview" ref={previewRef} />

      <div className="equation-card__export">
        <span className="equation-card__export-label">Copy:</span>
        {(["latex", "word"] as EquationExportFormat[]).map((format) => (
          <button
            key={format}
            type="button"
            className="equation-card__export-button"
            onClick={() => onExport(format)}
            disabled={exportingFormat !== null}
          >
            {exportingFormat === format ? "Copying…" : EXPORT_LABELS[format]}
          </button>
        ))}
      </div>
    </div>
  );
}
