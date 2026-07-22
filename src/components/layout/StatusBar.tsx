import "./StatusBar.css";

export interface StatusBarProps {
  page: number;
  pageCount: number;
  progressPct: number;
  contextStatus: string;
  currentThought: string;
  onOpenThought: () => void;
}

export function StatusBar({
  page,
  pageCount,
  progressPct,
  contextStatus,
  currentThought,
  onOpenThought,
}: StatusBarProps) {
  return (
    <footer className="statusbar" role="status">
      <div className="statusbar__left">
        <span className="statusbar__mono">
          Page {page}/{pageCount}
        </span>
        <span className="statusbar__dim">·</span>
        <span className="statusbar__mono">{progressPct}% read</span>
      </div>

      <div className="statusbar__center" aria-live="polite">
        {contextStatus}
      </div>

      <button className="statusbar__thought" onClick={onOpenThought}>
        <span className="statusbar__thought-cursor" aria-hidden />
        {currentThought || "No current thought"}
      </button>
    </footer>
  );
}
