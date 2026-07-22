import { useLayoutEffect, useRef, useState } from "react";
import "./HighlightPopover.css";

export interface HighlightPopoverProps {
  quote: string;
  /** Bounding rect of the text selection, in viewport coordinates
   * (from `Range.getBoundingClientRect()`), used to anchor the popover. */
  anchorRect: DOMRect;
  onSave: (quote: string, note: string) => void;
}

const POPOVER_WIDTH = 280;
const VIEWPORT_MARGIN = 8;

export function HighlightPopover({
  quote,
  anchorRect,
  onSave,
}: HighlightPopoverProps) {
  const [editedQuote, setEditedQuote] = useState(quote);
  const [note, setNote] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  // Selections can happen anywhere on the page, including right at
  // the bottom of the reader viewport — a popover always anchored
  // below the selection (the original behavior) could render
  // partly or entirely off-screen there, with no way to reach its
  // Save/Cancel buttons. Measure the popover's actual height after
  // its first paint and flip it above the selection instead when
  // there isn't enough room below, same idea a native OS tooltip
  // uses. Runs once per mount (a new popover mounts fresh on every
  // new selection — see PdfViewer's `key`-less pendingSelection
  // state, which always fully unmounts/remounts this component).
  const [placement, setPlacement] = useState<React.CSSProperties>({
    position: "fixed",
    top: anchorRect.bottom + VIEWPORT_MARGIN,
    left: Math.max(
      VIEWPORT_MARGIN,
      Math.min(anchorRect.left, window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN),
    ),
    width: POPOVER_WIDTH,
    visibility: "hidden", // avoid a flash at the wrong spot before measuring
  });

  useLayoutEffect(() => {
    const el = popoverRef.current;
    if (!el) return;
    const height = el.offsetHeight;

    const spaceBelow = window.innerHeight - anchorRect.bottom;
    const fitsBelow = spaceBelow >= height + VIEWPORT_MARGIN * 2;
    const spaceAbove = anchorRect.top;
    const shouldFlipAbove = !fitsBelow && spaceAbove >= height + VIEWPORT_MARGIN * 2;

    const top = shouldFlipAbove
      ? Math.max(VIEWPORT_MARGIN, anchorRect.top - height - VIEWPORT_MARGIN)
      : Math.min(
          anchorRect.bottom + VIEWPORT_MARGIN,
          window.innerHeight - height - VIEWPORT_MARGIN,
        );

    setPlacement({
      position: "fixed",
      top: Math.max(VIEWPORT_MARGIN, top),
      left: Math.max(
        VIEWPORT_MARGIN,
        Math.min(anchorRect.left, window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN),
      ),
      width: POPOVER_WIDTH,
      visibility: "visible",
    });
    // Only ever needs to run once, right after mount — the popover
    // doesn't track the selection live after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={popoverRef} className="highlight-popover" style={placement}>
      {/* Editable, not just a display of the raw selection — text-layer
       * selection across PDF columns/line-wrapping can grab a stray
       * word or line break the researcher didn't mean to include;
       * this is the chance to trim it before it's saved. */}
      <textarea
        className="highlight-popover__quote"
        value={editedQuote}
        onChange={(e) => setEditedQuote(e.target.value)}
        rows={3}
      />
      <textarea
        className="highlight-popover__note"
        placeholder="Add a note (optional)…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="highlight-popover__actions">
        <span className="highlight-popover__hint">Click elsewhere to dismiss</span>
        <button
          className="highlight-popover__save"
          onClick={() => onSave(editedQuote.trim(), note)}
          disabled={!editedQuote.trim()}
        >
          Save Highlight
        </button>
      </div>
    </div>
  );
}

