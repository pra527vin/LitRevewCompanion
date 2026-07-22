import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { dictionaryService } from "../service";
import "./WordHoverTooltip.css";

export interface WordHoverTooltipProps {
  /** The element to watch for hovers — PdfViewer passes its text
   * layer container, so this only ever fires over actual PDF text. */
  containerRef: React.RefObject<HTMLElement>;
}

const HOVER_DELAY_MS = 400;
const VIEWPORT_MARGIN = 8;
const TOOLTIP_MAX_WIDTH = 260;

function isWordChar(ch: string): boolean {
  return /[A-Za-z'-]/.test(ch);
}

/**
 * Finds the word under viewport point (x, y) by locating the caret
 * position there and expanding outward to word boundaries within that
 * text node. Returns null if the point isn't over text, or the "word"
 * found is a single stray character (not worth a lookup).
 */
function extractWordAtPoint(x: number, y: number): string | null {
  if (typeof document.caretRangeFromPoint !== "function") return null;

  const range = document.caretRangeFromPoint(x, y);
  if (!range || range.startContainer.nodeType !== Node.TEXT_NODE) {
    return null;
  }

  const textNode = range.startContainer as Text;
  const text = textNode.textContent ?? "";
  let start = range.startOffset;
  let end = range.startOffset;

  while (start > 0 && isWordChar(text[start - 1])) start--;
  while (end < text.length && isWordChar(text[end])) end++;

  const word = text.slice(start, end).trim();
  return word.length > 1 ? word : null;
}

export function WordHoverTooltip({ containerRef }: WordHoverTooltipProps) {
  const [word, setWord] = useState<string | null>(null);
  const [definition, setDefinition] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);

  // Tracks the word currently under the cursor so rapid mousemove
  // events (which fire continuously, even from sub-pixel jitter)
  // don't re-trigger a lookup or hide an already-shown tooltip unless
  // the word actually changed.
  const currentWord = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function handleMouseMove(e: MouseEvent) {
      const found = extractWordAtPoint(e.clientX, e.clientY);
      if (found === currentWord.current) return; // same word (or same "no word"), nothing to do

      currentWord.current = found;
      if (timer.current) clearTimeout(timer.current);
      setDefinition(null);

      if (!found) {
        setWord(null);
        setAnchor(null);
        return;
      }

      setWord(found);
      setAnchor({ x: e.clientX, y: e.clientY });

      timer.current = setTimeout(async () => {
        const myRequest = ++requestId.current;
        const result = await dictionaryService.lookupWord(found);
        // Bail if a newer request superseded this one, or the mouse
        // moved off this word while the lookup was in flight.
        if (myRequest !== requestId.current || currentWord.current !== found) return;
        setDefinition(result?.definition ?? null);
      }, HOVER_DELAY_MS);
    }

    function handleMouseLeave() {
      if (timer.current) clearTimeout(timer.current);
      currentWord.current = null;
      setWord(null);
      setDefinition(null);
      setAnchor(null);
    }

    el.addEventListener("mousemove", handleMouseMove);
    el.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      el.removeEventListener("mousemove", handleMouseMove);
      el.removeEventListener("mouseleave", handleMouseLeave);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [containerRef]);

  if (!word || !anchor || !definition) return null;

  const left = Math.min(
    Math.max(VIEWPORT_MARGIN, anchor.x),
    window.innerWidth - TOOLTIP_MAX_WIDTH - VIEWPORT_MARGIN,
  );
  const top = Math.min(anchor.y + 18, window.innerHeight - VIEWPORT_MARGIN);

  // Portalled to document.body rather than rendered inline: PdfViewer's
  // scroll container has `contain: layout style` for paint-isolation
  // (see PdfViewer.css), and per the CSS Containment spec that makes it
  // a containing block for `position: fixed` descendants — same effect
  // as `transform`. Left inline, this tooltip's viewport-relative
  // top/left would resolve against the scrolled container's box instead
  // of the real viewport, pushing it further off-screen the deeper the
  // page is scrolled. A portal sidesteps that without touching the
  // container's `contain` (which is still doing its job for scroll
  // perf).
  return createPortal(
    <div
      className="word-hover-tooltip"
      style={{ top, left }}
    >
      <strong className="word-hover-tooltip__term">{word}</strong>
      <p className="word-hover-tooltip__definition">{definition}</p>
    </div>,
    document.body,
  );
}
