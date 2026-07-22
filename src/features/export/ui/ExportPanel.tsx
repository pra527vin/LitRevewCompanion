import { useState } from "react";
import { Paper } from "../../library";
import type { WorkspaceInfo } from "../../workspace";
import { exportService } from "../service";
import "./ExportPanel.css";

export interface ExportPanelProps {
  workspace: WorkspaceInfo;
  /** The paper currently open in the reader, if any — Paper Summary
   * export needs a specific paper, so that option is disabled with an
   * explanatory message when nothing's open, same "can't act on
   * nothing selected" stance the rest of the app takes rather than
   * letting the researcher pick from a paper list here too. */
  activePaper: Paper | null;
  onClose: () => void;
}

type ExportState =
  | { status: "idle" }
  | { status: "working" }
  | { status: "done"; path: string }
  | { status: "error"; message: string };

export function ExportPanel({ workspace, activePaper, onClose }: ExportPanelProps) {
  const [summaryState, setSummaryState] = useState<ExportState>({ status: "idle" });
  const [matrixState, setMatrixState] = useState<ExportState>({ status: "idle" });
  const [bibliographyState, setBibliographyState] = useState<ExportState>({ status: "idle" });

  async function handleExportSummary() {
    if (!activePaper) return;
    setSummaryState({ status: "working" });
    try {
      const path = await exportService.exportPaperSummary(workspace, activePaper);
      setSummaryState({ status: "done", path });
    } catch (e) {
      setSummaryState({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleExportMatrix() {
    setMatrixState({ status: "working" });
    try {
      const path = await exportService.exportLiteratureMatrix(workspace);
      setMatrixState({ status: "done", path });
    } catch (e) {
      setMatrixState({ status: "error", message: e instanceof Error ? e.message : String(e) });
    }
  }

  async function handleExportBibliography() {
    setBibliographyState({ status: "working" });
    try {
      const path = await exportService.exportBibliography(workspace);
      setBibliographyState({ status: "done", path });
    } catch (e) {
      setBibliographyState({
        status: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return (
    <div className="export-panel__backdrop" onClick={onClose}>
      <div
        className="export-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Export"
      >
        <header className="export-panel__header">
          <h2>Export</h2>
          <button className="export-panel__close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </header>

        <div className="export-panel__body">
          <section className="export-panel__option">
            <div className="export-panel__option-text">
              <h3>Paper Summary</h3>
              <p>
                {activePaper
                  ? `Export "${activePaper.title || "Untitled"}" as a Markdown file.`
                  : "Open a paper in the reader first."}
              </p>
            </div>
            <button
              className="export-panel__action"
              onClick={handleExportSummary}
              disabled={!activePaper || summaryState.status === "working"}
            >
              {summaryState.status === "working" ? "Exporting…" : "Export .md"}
            </button>
          </section>
          {summaryState.status === "done" && (
            <p className="export-panel__result export-panel__result--ok">
              Saved to {summaryState.path}
            </p>
          )}
          {summaryState.status === "error" && (
            <p className="export-panel__result export-panel__result--error">
              {summaryState.message}
            </p>
          )}

          <section className="export-panel__option">
            <div className="export-panel__option-text">
              <h3>Literature Matrix</h3>
              <p>Export every paper's comparison row as a CSV file.</p>
            </div>
            <button
              className="export-panel__action"
              onClick={handleExportMatrix}
              disabled={matrixState.status === "working"}
            >
              {matrixState.status === "working" ? "Exporting…" : "Export .csv"}
            </button>
          </section>
          {matrixState.status === "done" && (
            <p className="export-panel__result export-panel__result--ok">
              Saved to {matrixState.path}
            </p>
          )}
          {matrixState.status === "error" && (
            <p className="export-panel__result export-panel__result--error">
              {matrixState.message}
            </p>
          )}

          <section className="export-panel__option">
            <div className="export-panel__option-text">
              <h3>Bibliography</h3>
              <p>Export every paper's APA7 citation as one Markdown reference list.</p>
            </div>
            <button
              className="export-panel__action"
              onClick={handleExportBibliography}
              disabled={bibliographyState.status === "working"}
            >
              {bibliographyState.status === "working" ? "Exporting…" : "Export .md"}
            </button>
          </section>
          {bibliographyState.status === "done" && (
            <p className="export-panel__result export-panel__result--ok">
              Saved to {bibliographyState.path}
            </p>
          )}
          {bibliographyState.status === "error" && (
            <p className="export-panel__result export-panel__result--error">
              {bibliographyState.message}
            </p>
          )}

          <p className="export-panel__note">
            Exports are saved into this workspace's <code>exports/</code> folder.
          </p>
        </div>
      </div>
    </div>
  );
}
