/**
 * Small inline line icons for the Library sidebar — same convention
 * Toolbar.tsx's `SunIcon`/`MoonIcon` already use (24x24 viewBox,
 * `currentColor`, explicit small pixel size) rather than a font-emoji
 * glyph, so a row's context menu renders identically across
 * platforms instead of however each OS happens to draw "🏷"/"🗑".
 */

export function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <circle cx="12" cy="5" r="1.8" fill="currentColor" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      <circle cx="12" cy="19" r="1.8" fill="currentColor" />
    </svg>
  );
}

export function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v11" />
        <path d="M7.5 10.5L12 15l4.5-4.5" />
        <path d="M4.5 18.5h15" />
      </g>
    </svg>
  );
}

export function TagIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path
        d="M11.6 3.5H5.8A2.3 2.3 0 003.5 5.8v5.8c0 .6.24 1.19.67 1.62l8.43 8.43a2.3 2.3 0 003.25 0l5.8-5.8a2.3 2.3 0 000-3.25l-8.43-8.43a2.3 2.3 0 00-1.62-.67z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="8.3" cy="8.3" r="1.35" fill="currentColor" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 7h15" />
        <path d="M9.3 7V4.9c0-.5.4-.9.9-.9h3.6c.5 0 .9.4.9.9V7" />
        <path d="M6.5 7l.9 12.3c.05.75.68 1.3 1.4 1.3h6.4c.73 0 1.35-.55 1.4-1.3L17.5 7" />
        <path d="M10.2 10.8v6" />
        <path d="M13.8 10.8v6" />
      </g>
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="10.5" cy="10.5" r="6.5" />
        <line x1="15.3" y1="15.3" x2="20.5" y2="20.5" />
      </g>
    </svg>
  );
}

export function ResetIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 12a7.5 7.5 0 1 1 2.4 5.5" />
        <path d="M4.5 17.5V12h5.5" />
      </g>
    </svg>
  );
}

export function SlidersIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <line x1="4" y1="7" x2="20" y2="7" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <line x1="4" y1="17" x2="20" y2="17" />
      </g>
      <g fill="currentColor">
        <circle cx="8.5" cy="7" r="2" />
        <circle cx="15.5" cy="12" r="2" />
        <circle cx="10.5" cy="17" r="2" />
      </g>
    </svg>
  );
}
