import { ResolvedTheme } from "../../features/settings";
import "./Toolbar.css";

export interface ToolbarProps {
  workspaceName: string;
  onAction: (action: ToolbarAction) => void;
  /** The theme actually applied right now ("system" already resolved
   * to one of these) — the icon toggle always sets an explicit
   * light/dark, never "system"; picking "System" back is a Settings
   * page action, not a toolbar one. */
  resolvedTheme: ResolvedTheme;
  onToggleTheme: () => void;
}

export type ToolbarAction =
  | "switch-workspace"
  | "dashboard"
  | "toggle-library"
  | "review-matrix"
  | "export"
  | "refreshment"
  | "settings";

const ACTIONS: { id: ToolbarAction; label: string }[] = [
  { id: "dashboard", label: "Progress" },
  { id: "toggle-library", label: "Library" },
  { id: "review-matrix", label: "Review Matrix" },
  { id: "export", label: "Export" },
  { id: "refreshment", label: "Refreshment" },
  { id: "settings", label: "Settings" },
];

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <circle cx="12" cy="12" r="4.5" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <line x1="12" y1="1.5" x2="12" y2="4" />
        <line x1="12" y1="20" x2="12" y2="22.5" />
        <line x1="1.5" y1="12" x2="4" y2="12" />
        <line x1="20" y1="12" x2="22.5" y2="12" />
        <line x1="4.6" y1="4.6" x2="6.3" y2="6.3" />
        <line x1="17.7" y1="17.7" x2="19.4" y2="19.4" />
        <line x1="4.6" y1="19.4" x2="6.3" y2="17.7" />
        <line x1="17.7" y1="6.3" x2="19.4" y2="4.6" />
      </g>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M20.4 15.3A9 9 0 118.7 3.6a7.2 7.2 0 0011.7 11.7z"
        fill="currentColor"
      />
    </svg>
  );
}

export function Toolbar({
  workspaceName,
  onAction,
  resolvedTheme,
  onToggleTheme,
}: ToolbarProps) {
  return (
    <header className="toolbar" role="banner">
      <button
        className="toolbar__workspace"
        onClick={() => onAction("switch-workspace")}
        title="Switch workspace"
      >
        <span className="toolbar__workspace-dot" aria-hidden />
        {workspaceName}
      </button>

      <nav className="toolbar__actions" aria-label="Primary actions">
        {ACTIONS.map((a) => (
          <button
            key={a.id}
            className="toolbar__action"
            onClick={() => onAction(a.id)}
          >
            {a.label}
          </button>
        ))}
      </nav>

      <button
        className="toolbar__theme-toggle"
        onClick={onToggleTheme}
        title={resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        aria-label={resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      >
        {resolvedTheme === "dark" ? <MoonIcon /> : <SunIcon />}
      </button>
    </header>
  );
}
