import { Paper, PaperThumbnail } from "../../library";
import type { WorkspaceInfo } from "../../workspace";
import type { RecentlyStudiedEntry } from "../repository";
import "./RecentlyStudied.css";

export interface RecentlyStudiedProps {
  workspace: WorkspaceInfo;
  entries: RecentlyStudiedEntry[];
  onOpenPaper: (paper: Paper) => void;
}

/**
 * The reader's empty state — shown whenever no paper is open,
 * including right after selecting a workspace. With nothing studied
 * yet (`entries` empty), this is just the plain "no paper open"
 * message it's always been; once there's reading history, it becomes
 * a "continue where you left off" list instead, most-recently-studied
 * first (the query itself sorts — see `readingStateRepository.listRecentlyStudied`).
 */
export function RecentlyStudied({ workspace, entries, onOpenPaper }: RecentlyStudiedProps) {
  if (entries.length === 0) {
    return (
      <div className="recently-studied recently-studied--empty">
        <h2>No paper open</h2>
        <p>Add a paper from the toolbar, or open one from your library.</p>
      </div>
    );
  }

  return (
    <div className="recently-studied">
      <h2 className="recently-studied__title">Continue where you left off</h2>
      <div className="recently-studied__grid">
        {entries.map((entry) => {
          const pct = Math.round(entry.progressPct);
          return (
            <button
              key={entry.paper.id}
              type="button"
              className="recently-studied__card"
              onClick={() => onOpenPaper(entry.paper)}
            >
              <PaperThumbnail
                source={{ kind: "paper", workspace, paper: entry.paper }}
                className="recently-studied__thumb"
              />
              <span className="recently-studied__info">
                <span className="recently-studied__card-title">
                  {entry.paper.title || entry.paper.filePath}
                </span>
                <span className="recently-studied__progress-track">
                  <span
                    className="recently-studied__progress-fill"
                    style={{ width: `${pct}%` }}
                  />
                </span>
                <span className="recently-studied__meta">
                  {pct}% complete · {new Date(entry.studiedAt).toLocaleDateString()}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
