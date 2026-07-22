import { useEffect, useState } from "react";
import { formatExcerptPages } from "../../annotations";
import { Paper } from "../../library";
import { paperSummaryService } from "../service";
import { PaperSummary } from "../types";
import "./PaperSummaryView.css";

export interface PaperSummaryViewProps {
  paper: Paper;
  onClose: () => void;
}

export function PaperSummaryView({ paper, onClose }: PaperSummaryViewProps) {
  const [summary, setSummary] = useState<PaperSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    paperSummaryService.buildSummary(paper.id).then((result) => {
      if (cancelled) return;
      setSummary(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [paper.id]);

  return (
    <div className="paper-summary__backdrop" onClick={onClose}>
      <div
        className="paper-summary"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Paper Summary"
      >
        <header className="paper-summary__header">
          <h2>Paper Summary</h2>
          <button
            className="paper-summary__close"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
        </header>

        <div className="paper-summary__body">
          <section className="paper-summary__metadata">
            <h1 className="paper-summary__title">{paper.title || "Untitled"}</h1>
            <p className="paper-summary__byline">
              {paper.authors && paper.authors.length > 0
                ? paper.authors.join(", ")
                : "Unknown authors"}
              {paper.journal ? ` · ${paper.journal}` : ""}
              {paper.year ? ` · ${paper.year}` : ""}
            </p>
            {paper.doi && <p className="paper-summary__doi">DOI: {paper.doi}</p>}
            {!paper.doi && paper.url && (
              <p className="paper-summary__doi">
                <a href={paper.url} target="_blank" rel="noreferrer">
                  {paper.url}
                </a>
              </p>
            )}
          </section>

          {loading && <p className="paper-summary__status">Assembling summary…</p>}

          {!loading && summary && summary.sections.length === 0 && (
            <p className="paper-summary__status">
              No notes or highlights yet. Read and take notes in the Notebook,
              then come back here.
            </p>
          )}

          {!loading &&
            summary?.sections.map((section) => (
              <section key={section.id} className="paper-summary__section">
                <h3>{section.title}</h3>
                {section.content && (
                  <p className="paper-summary__content">{section.content}</p>
                )}
                {section.excerpts.map((excerpt) => (
                  <blockquote key={excerpt.id} className="paper-summary__excerpt">
                    <span className="paper-summary__excerpt-page">
                      {formatExcerptPages(excerpt)}
                    </span>
                    {excerpt.quote}
                    {excerpt.userNote && (
                      <span className="paper-summary__excerpt-note">
                        {" "}
                        — {excerpt.userNote}
                      </span>
                    )}
                  </blockquote>
                ))}
              </section>
            ))}
        </div>
      </div>
    </div>
  );
}
