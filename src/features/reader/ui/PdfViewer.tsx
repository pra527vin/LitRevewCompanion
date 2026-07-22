import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Paper } from "../../library";
import type { WorkspaceInfo } from "../../workspace";
import { annotationsService, HighlightPopover } from "../../annotations";
import {
  openPaperDocument,
  measurePage,
  loadReadingState,
  saveReadingState,
  getPageText,
} from "../service";
import { PageCache } from "../pageCache";
import { PdfPage } from "./PdfPage";
import { RecentlyStudied } from "./RecentlyStudied";
import type { RecentlyStudiedEntry } from "../repository";
import "./PdfViewer.css";

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <line
        x1="15.5"
        y1="15.5"
        x2="20.5"
        y2="20.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** One occurrence of a search query within the document, in reading
 * order — `indexInPage` is this occurrence's 0-based position among
 * matches on that page alone (a page with the query twice gets two
 * entries here, `indexInPage` 0 and 1), since jumping needs to
 * highlight a specific occurrence, not just "somewhere on this page." */
interface SearchMatch {
  page: number;
  indexInPage: number;
}

export interface PdfViewerProps {
  paper: Paper | null;
  workspace: WorkspaceInfo;
  /** Reports the current page and total page count up to the app
   * shell, so the status bar can show real values. */
  onPageInfo: (page: number, pageCount: number) => void;
  /** Called after a highlight is successfully saved, so the Notebook
   * (which owns its own excerpt list) knows to refetch. */
  onExcerptSaved: () => void;
  /** Set by MainLayout (bridging a click on one of Notebook's excerpt
   * cards) to scroll straight to the page a comment was made on. A
   * `nonce` alongside the page number so clicking the same excerpt
   * twice in a row still scrolls — two requests for the same page
   * would otherwise look like no change at all to the effect below. */
  jumpToPage?: { page: number; nonce: number } | null;
  /** "Continue where you left off" — shown instead of the plain empty
   * message whenever no paper is open (right after selecting a
   * workspace, in particular). Most-recently-studied first; see
   * `listRecentlyStudied`. */
  recentlyStudied: RecentlyStudiedEntry[];
  onOpenPaper: (paper: Paper) => void;
}

interface PendingSelection {
  quote: string;
  anchorRect: DOMRect;
  startPage: number;
  endPage: number;
}

// Must match `.pdf-page`'s margin-bottom in PdfViewer.css — this is
// the vertical gap folded into every page's slot in the virtualized
// offsets math below.
const PAGE_GAP = 24;
// How far past the viewport edge (in px) pages stay mounted, so a
// fast scroll or flick doesn't show blank space while a page catches
// up on rendering.
const BUFFER_PX = 900;
// Fallback aspect ratio (height/width) used for pages that haven't
// been measured yet — close to A4/Letter, just needs to be reasonable
// enough that the scrollbar doesn't jump wildly before real
// measurements arrive.
const DEFAULT_ASPECT = 1.294;
const RESIZE_DEBOUNCE_MS = 150;
const SAVE_SCROLL_DEBOUNCE_MS = 400;
const MEASURE_BATCH_SIZE = 6;
const SEARCH_DEBOUNCE_MS = 300;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.1;

/** Removes any `<mark class="pdf-search-hit">` previously inserted
 * into `container` by `applyHighlight`, merging its text back into the
 * surrounding node — otherwise re-running a search (or navigating to a
 * different match) would leave stale marks behind. */
function clearHighlights(container: HTMLElement): void {
  container.querySelectorAll("mark.pdf-search-hit").forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    parent.removeChild(mark);
    parent.normalize();
  });
}

/**
 * Best-effort visual highlight for one search match, directly in the
 * rendered text layer — pdf.js renders each line of a page as its own
 * `<span>`, and a match is overwhelmingly likely to sit entirely
 * inside one of them, so this walks the spans in order counting
 * occurrences of `query` until it reaches `occurrenceIndex`, then wraps
 * just that substring in a `<mark>` and scrolls it into view. A match
 * that happens to straddle two spans (wrapping mid-line) is skipped
 * rather than forced — the page-level scroll from `scrollToPage`
 * already got the researcher to the right place either way, so a
 * missed highlight here is a cosmetic gap, not a broken feature.
 */
function applyHighlight(container: HTMLElement, query: string, occurrenceIndex: number): void {
  clearHighlights(container);
  const trimmed = query.trim();
  if (!trimmed) return;

  const lowerQuery = trimmed.toLowerCase();
  const spans = Array.from(container.querySelectorAll("span"));
  let occurrence = 0;

  for (const span of spans) {
    const textNode = span.firstChild;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) continue;
    const text = textNode.textContent ?? "";
    const lowerText = text.toLowerCase();

    let fromIndex = 0;
    while (true) {
      const idx = lowerText.indexOf(lowerQuery, fromIndex);
      if (idx === -1) break;
      if (occurrence === occurrenceIndex) {
        try {
          const range = document.createRange();
          range.setStart(textNode, idx);
          range.setEnd(textNode, idx + lowerQuery.length);
          const mark = document.createElement("mark");
          mark.className = "pdf-search-hit";
          range.surroundContents(mark);
          mark.scrollIntoView({ block: "center", behavior: "smooth" });
        } catch {
          // Range couldn't be wrapped (e.g. it crossed a node
          // boundary) — the page-level scroll already happened, so
          // just skip the visual highlight for this one occurrence.
        }
        return;
      }
      occurrence++;
      fromIndex = idx + lowerQuery.length;
    }
  }
}

export function PdfViewer({
  paper,
  workspace,
  onPageInfo,
  onExcerptSaved,
  jumpToPage,
  recentlyStudied,
  onOpenPaper,
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cacheRef = useRef(new PageCache());
  const heightsRef = useRef<number[]>([]);
  const pageElsRef = useRef(new Map<number, HTMLDivElement>());
  // One entry per page, built lazily the first time the search box
  // opens (see `ensureTextIndex`) and held for as long as this
  // document stays open — reset to null on every paper change.
  const pageTextsRef = useRef<string[] | null>(null);
  const lastHighlightedPageRef = useRef<number | null>(null);

  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);

  const [rawWidth, setRawWidth] = useState(0);
  const [renderWidth, setRenderWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [heightsVersion, setHeightsVersion] = useState(0);
  const [initialScrollDone, setInitialScrollDone] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pageJumpInput, setPageJumpInput] = useState("");

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchIndexing, setSearchIndexing] = useState(false);
  const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([]);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);

  // ---- container size tracking (Problem #10: resize handling) ----
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setRawWidth(entry.contentRect.width);
      setViewportHeight(entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Debounce the width that actually drives rendering — raw width
  // still updates immediately above for the (cheap) virtualized range
  // math; only the expensive re-rasterization waits for resizing to
  // stop, and only affected pages re-render once it does (everything
  // reads off this one value). Zoom multiplies straight into this same
  // width rather than being its own separate scale concept — the fit-
  // width pipeline (measure → rasterize → cache) already reacts to any
  // renderWidth change correctly, so "zoom" is just "a wider or
  // narrower fit-width column," not a second thing to keep in sync.
  useEffect(() => {
    const width = Math.max(0, rawWidth - 48) * zoom; // inset padding
    const handle = window.setTimeout(() => setRenderWidth(width), RESIZE_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [rawWidth, zoom]);

  // A render-width change means every cached bitmap is now the wrong
  // resolution — drop them all rather than let each page discover
  // this individually.
  useEffect(() => {
    cacheRef.current.clear();
  }, [renderWidth]);

  // ---- load a new document whenever the active paper changes ----
  useEffect(() => {
    let cancelled = false;

    cacheRef.current.clear();
    heightsRef.current = [];
    pageElsRef.current.clear();
    pageTextsRef.current = null;
    lastHighlightedPageRef.current = null;
    setPendingSelection(null);
    setInitialScrollDone(false);
    setHeightsVersion((v) => v + 1);
    setSearchOpen(false);
    setSearchQuery("");
    setSearchMatches([]);
    setActiveMatchIndex(0);
    setPageJumpInput("");

    if (!paper) {
      setPdf(null);
      setNumPages(0);
      return;
    }

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const { pdf: doc, numPages: count } = await openPaperDocument(paper, workspace);
        if (cancelled) return;
        heightsRef.current = new Array(count).fill(0);
        setPdf(doc);
        setNumPages(count);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Only the paper identity should retrigger a load, not workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper?.id]);

  // ---- dimension prefetch: measure every page's exact height once
  // the document and a real render width are both known. Pages up to
  // the saved reading position are measured first and awaited, so the
  // initial scroll lands on an exact offset instead of an estimate;
  // everything after that is measured in the background, in small
  // batches so it never blocks the main thread for long (Problem #4:
  // an estimate-based initial scroll would land close but not exact,
  // then visibly jump once real heights arrived — indistinguishable
  // from the old scroll-reset bug). ----
  useEffect(() => {
    if (!pdf || numPages === 0 || renderWidth === 0) return;
    // Narrowed local copy — TS can't carry the `pdf !== null` guard
    // above into the nested async closures below on its own.
    const doc = pdf;
    let cancelled = false;

    async function measureRange(from: number, to: number): Promise<void> {
      for (let p = from; p <= to; p += MEASURE_BATCH_SIZE) {
        if (cancelled) return;
        const batchEnd = Math.min(to, p + MEASURE_BATCH_SIZE - 1);
        const batch = await Promise.all(
          Array.from({ length: batchEnd - p + 1 }, (_, i) => measurePage(doc, p + i, renderWidth)),
        );
        if (cancelled) return;
        batch.forEach((dims, i) => {
          heightsRef.current[p + i - 1] = dims.height;
        });
      }
    }

    (async () => {
      const startPage = paper ? await loadReadingState(paper.id, numPages) : 1;
      if (cancelled) return;

      await measureRange(1, startPage);
      if (cancelled) return;
      setHeightsVersion((v) => v + 1);

      const offset = heightsRef.current
        .slice(0, startPage - 1)
        .reduce((sum, h) => sum + h + PAGE_GAP, 0);
      if (containerRef.current) containerRef.current.scrollTop = offset;
      setScrollTop(offset);
      setInitialScrollDone(true);

      if (startPage < numPages) {
        await measureRange(startPage + 1, numPages);
        if (!cancelled) setHeightsVersion((v) => v + 1);
      }
    })();

    return () => {
      cancelled = true;
    };
    // renderWidth intentionally retriggers a full remeasure — a
    // resize/zoom invalidates every previous height.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, numPages, renderWidth]);

  // ---- scroll handling (rAF-throttled) ----
  const scrollRaf = useRef<number | null>(null);
  const handleScroll = useCallback(() => {
    if (scrollRaf.current !== null) return;
    scrollRaf.current = requestAnimationFrame(() => {
      scrollRaf.current = null;
      if (containerRef.current) setScrollTop(containerRef.current.scrollTop);
    });
  }, []);

  // ---- offsets derived from measured/estimated heights ----
  const estimatedPageHeight = renderWidth > 0 ? renderWidth * DEFAULT_ASPECT : 0;
  const offsets = useMemo(() => {
    const arr = new Array(numPages + 1).fill(0);
    for (let i = 0; i < numPages; i++) {
      const h = heightsRef.current[i] || estimatedPageHeight;
      arr[i + 1] = arr[i] + h + PAGE_GAP;
    }
    return arr;
    // heightsVersion is the real trigger; heightsRef itself is a plain
    // mutable ref so it can't be a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numPages, heightsVersion, estimatedPageHeight]);

  const totalHeight = offsets[numPages] ?? 0;

  // Binary search over the monotonically increasing `offsets` array
  // for the page (0-based) whose span contains `offset`.
  function pageIndexAtOffset(offset: number): number {
    let lo = 0;
    let hi = Math.max(0, numPages - 1);
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (offsets[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  const startIndex = numPages > 0 ? pageIndexAtOffset(Math.max(0, scrollTop - BUFFER_PX)) : 0;
  const endIndex =
    numPages > 0
      ? pageIndexAtOffset(Math.min(totalHeight, scrollTop + viewportHeight + BUFFER_PX))
      : -1;

  const visiblePageNumbers = useMemo(() => {
    const pages: number[] = [];
    for (let i = startIndex; i <= endIndex; i++) pages.push(i + 1);
    return pages;
  }, [startIndex, endIndex]);

  const topSpacer = offsets[startIndex] ?? 0;
  const bottomSpacer = Math.max(0, totalHeight - (offsets[endIndex + 1] ?? 0));

  // ---- current page, derived from scroll position rather than
  // tracked as separate state (Problem #9) — the page whose span
  // contains a point roughly a third of the way down the viewport. ----
  const currentPage = numPages > 0 ? pageIndexAtOffset(scrollTop + viewportHeight * 0.3) + 1 : 0;

  useEffect(() => {
    onPageInfo(currentPage, numPages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, numPages]);

  // Persist reading position, debounced — continuous scroll fires far
  // more update ticks than the old page-turn buttons ever did, so
  // (unlike this feature's usual save-on-every-change convention)
  // saving needs to wait for scrolling to actually stop.
  useEffect(() => {
    if (!paper || numPages === 0 || !initialScrollDone) return;
    const handle = window.setTimeout(() => {
      saveReadingState(paper.id, currentPage, numPages).catch(() => {
        // Best-effort — not surfacing a toast for a background save failure.
      });
    }, SAVE_SCROLL_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [paper, currentPage, numPages, initialScrollDone]);

  const registerPageEl = useCallback((pageNumber: number, el: HTMLDivElement | null) => {
    if (el) pageElsRef.current.set(pageNumber, el);
    else pageElsRef.current.delete(pageNumber);
  }, []);

  const handleMeasured = useCallback((pageNumber: number, height: number) => {
    if (heightsRef.current[pageNumber - 1] !== height) {
      heightsRef.current[pageNumber - 1] = height;
      setHeightsVersion((v) => v + 1);
    }
  }, []);

  function scrollToPage(targetPage: number) {
    const clamped = Math.min(Math.max(1, targetPage), numPages);
    const offset = offsets[clamped - 1] ?? 0;
    containerRef.current?.scrollTo({ top: offset, behavior: "smooth" });
  }

  // A sibling (MainLayout, bridging Notebook's excerpt clicks) asked
  // to jump to a page — keyed on `nonce` rather than `page` so
  // clicking the same excerpt twice in a row still re-scrolls.
  useEffect(() => {
    if (!jumpToPage || numPages === 0) return;
    scrollToPage(jumpToPage.page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpToPage?.nonce, numPages]);

  function handlePageJumpSubmit(e: React.FormEvent) {
    e.preventDefault();
    const target = Number(pageJumpInput);
    if (Number.isFinite(target)) scrollToPage(target);
    setPageJumpInput("");
  }

  function handleZoomIn() {
    setZoom((z) => Math.min(MAX_ZOOM, Number((z + ZOOM_STEP).toFixed(2))));
  }
  function handleZoomOut() {
    setZoom((z) => Math.max(MIN_ZOOM, Number((z - ZOOM_STEP).toFixed(2))));
  }
  function handleZoomReset() {
    setZoom(1);
  }

  // ---- in-document search ----

  /** Extracts every page's plain text once, the first time it's
   * needed, and holds it in a ref for the rest of this document's
   * session — searching itself just re-scans the already-extracted
   * strings, so retyping a query doesn't re-hit pdf.js at all. */
  async function ensureTextIndex(doc: PDFDocumentProxy): Promise<string[]> {
    if (pageTextsRef.current) return pageTextsRef.current;
    setSearchIndexing(true);
    try {
      const texts = new Array<string>(numPages).fill("");
      for (let p = 1; p <= numPages; p += MEASURE_BATCH_SIZE) {
        const batchEnd = Math.min(numPages, p + MEASURE_BATCH_SIZE - 1);
        const batch = await Promise.all(
          Array.from({ length: batchEnd - p + 1 }, (_, i) => getPageText(doc, p + i)),
        );
        batch.forEach((text, i) => {
          texts[p + i - 1] = text;
        });
      }
      pageTextsRef.current = texts;
      return texts;
    } finally {
      setSearchIndexing(false);
    }
  }

  async function runSearch(query: string) {
    const trimmed = query.trim();
    if (!trimmed || !pdf) {
      setSearchMatches([]);
      setActiveMatchIndex(0);
      return;
    }

    const texts = await ensureTextIndex(pdf);
    const lowerQuery = trimmed.toLowerCase();
    const matches: SearchMatch[] = [];
    texts.forEach((text, i) => {
      const lower = text.toLowerCase();
      let fromIndex = 0;
      let indexInPage = 0;
      while (true) {
        const idx = lower.indexOf(lowerQuery, fromIndex);
        if (idx === -1) break;
        matches.push({ page: i + 1, indexInPage });
        indexInPage++;
        fromIndex = idx + lowerQuery.length;
      }
    });

    setSearchMatches(matches);
    setActiveMatchIndex(0);
    if (matches.length > 0) scrollToPage(matches[0].page);
  }

  // Debounced re-search as the query changes, same convention as the
  // rest of the app's typed-field autosaves.
  useEffect(() => {
    if (!searchOpen) return;
    const handle = window.setTimeout(() => {
      runSearch(searchQuery);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, searchOpen]);

  function goToMatch(index: number) {
    if (searchMatches.length === 0) return;
    const clamped = ((index % searchMatches.length) + searchMatches.length) % searchMatches.length;
    setActiveMatchIndex(clamped);
    scrollToPage(searchMatches[clamped].page);
  }

  function handleNextMatch() {
    goToMatch(activeMatchIndex + 1);
  }
  function handlePrevMatch() {
    goToMatch(activeMatchIndex - 1);
  }

  function clearActiveHighlight() {
    const page = lastHighlightedPageRef.current;
    if (page === null) return;
    const textLayer = pageElsRef.current
      .get(page)
      ?.querySelector<HTMLElement>(".pdf-page__text-layer");
    if (textLayer) clearHighlights(textLayer);
    lastHighlightedPageRef.current = null;
  }

  function handleCloseSearch() {
    clearActiveHighlight();
    setSearchOpen(false);
    setSearchQuery("");
    setSearchMatches([]);
    setActiveMatchIndex(0);
  }

  // Applies the visual highlight for whichever match is active, once
  // its page has actually rendered a text layer — a page scrolled to
  // for the first time takes a render pass or two to get there (see
  // PdfPage's own effect), so this polls briefly rather than assuming
  // it's ready the instant `scrollToPage` is called.
  useEffect(() => {
    const match = searchMatches[activeMatchIndex];
    if (!match) {
      clearActiveHighlight();
      return;
    }

    if (lastHighlightedPageRef.current !== null && lastHighlightedPageRef.current !== match.page) {
      clearActiveHighlight();
    }

    const targetPage = match.page;
    const occurrenceIndex = match.indexInPage;
    let cancelled = false;
    let attempts = 0;

    function tryHighlight() {
      if (cancelled) return;
      const textLayer = pageElsRef.current
        .get(targetPage)
        ?.querySelector<HTMLElement>(".pdf-page__text-layer");
      if (textLayer && textLayer.childElementCount > 0) {
        applyHighlight(textLayer, searchQuery, occurrenceIndex);
        lastHighlightedPageRef.current = targetPage;
        return;
      }
      attempts++;
      if (attempts < 20) window.setTimeout(tryHighlight, 100);
    }
    tryHighlight();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMatchIndex, searchMatches]);

  function pageNumberForNode(node: Node | null): number | null {
    const el = node instanceof Element ? node : node?.parentElement ?? null;
    const pageEl = el?.closest<HTMLElement>("[data-page-number]");
    const attr = pageEl?.getAttribute("data-page-number");
    return attr ? Number(attr) : null;
  }

  // Milestone 07 — detect a finished text selection inside a text
  // layer and surface the "save this as a highlight" popover. Fires
  // on mouseup (selection finished), not on every selectionchange.
  function handleMouseUp() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

    const rawText = selection.toString();
    if (!rawText.trim()) return;

    const range = selection.getRangeAt(0);
    const rangeStartPage = pageNumberForNode(range.startContainer);
    const rangeEndPage = pageNumberForNode(range.endContainer);
    if (rangeStartPage === null || rangeEndPage === null) return;

    // ─── EXACT ADDITION HERE ─────────────────────────────────────────
    // Prevent cross-page selection bleeding. If selection spans over 
    // different pages, clear ranges and reject it immediately.
    if (rangeStartPage !== rangeEndPage) {
      window.getSelection()?.removeAllRanges();
      return;
    }
    // ─────────────────────────────────────────────────────────────────

    // pdf.js's text layer renders each line as its own absolutely-
    // positioned span; a selection crossing multiple lines picks up a
    // newline between each one via `Range.toString()`, even for text
    // that's one continuous sentence wrapping across a line or page
    // boundary. Collapsing to single spaces gives back the sentence
    // as it actually reads.
    const text = rawText.replace(/\s+/g, " ").trim();
    if (!text) return;

    setPendingSelection({
      quote: text,
      anchorRect: range.getBoundingClientRect(),
      startPage: Math.min(rangeStartPage, rangeEndPage),
      endPage: Math.max(rangeStartPage, rangeEndPage),
    });
  }

  async function handleSaveHighlight(quote: string, note: string) {
    if (!paper || !pendingSelection || !quote.trim()) return;
    try {
      await annotationsService.saveExcerpt(
        paper.id,
        quote.trim(),
        pendingSelection.startPage,
        note || null,
        pendingSelection.endPage,
      );
      onExcerptSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      window.getSelection()?.removeAllRanges();
      setPendingSelection(null);
    }
  }

  function handleCancelHighlight() {
    window.getSelection()?.removeAllRanges();
    setPendingSelection(null);
  }

  useEffect(() => {
    if (!pendingSelection) return;

    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Element | null;
      if (target?.closest(".highlight-popover")) return;
      handleCancelHighlight();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") handleCancelHighlight();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSelection]);

  return (
    <div className="pdf-viewer">
      {searchOpen && (
        <div className="pdf-viewer__search">
          <input
            className="pdf-viewer__search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (e.shiftKey) handlePrevMatch();
                else handleNextMatch();
              }
              if (e.key === "Escape") handleCloseSearch();
            }}
            placeholder="Search in this document…"
            autoFocus
          />
          <span className="pdf-viewer__search-count">
            {searchIndexing
              ? "Indexing…"
              : searchMatches.length > 0
                ? `${activeMatchIndex + 1} / ${searchMatches.length}`
                : searchQuery.trim()
                  ? "No matches"
                  : ""}
          </span>
          <button
            type="button"
            onClick={handlePrevMatch}
            disabled={searchMatches.length === 0}
            aria-label="Previous match"
            title="Previous match"
          >
            &lsaquo;
          </button>
          <button
            type="button"
            onClick={handleNextMatch}
            disabled={searchMatches.length === 0}
            aria-label="Next match"
            title="Next match"
          >
            &rsaquo;
          </button>
          <button
            type="button"
            className="pdf-viewer__search-close"
            onClick={handleCloseSearch}
            aria-label="Close search"
          >
            &times;
          </button>
        </div>
      )}

      <div
        className="pdf-viewer__scroll"
        ref={containerRef}
        onScroll={handleScroll}
        onMouseUp={handleMouseUp}
      >
        {!paper && (
          <RecentlyStudied
            workspace={workspace}
            entries={recentlyStudied}
            onOpenPaper={onOpenPaper}
          />
        )}
        {paper && loading && <p className="pdf-viewer__status">Loading…</p>}
        {paper && error && <p className="pdf-viewer__status pdf-viewer__status--error">{error}</p>}
        {paper && !loading && !error && pdf && renderWidth > 0 && (
          <div className="pdf-viewer__document" style={{ width: renderWidth }}>
            <div style={{ height: topSpacer }} />
            {visiblePageNumbers.map((pageNumber) => (
              <PdfPage
                key={pageNumber}
                pdf={pdf}
                pageNumber={pageNumber}
                targetWidth={renderWidth}
                cache={cacheRef.current}
                estimatedHeight={heightsRef.current[pageNumber - 1] || estimatedPageHeight}
                onMeasured={handleMeasured}
                registerPageEl={registerPageEl}
              />
            ))}
            <div style={{ height: bottomSpacer }} />
          </div>
        )}
      </div>

      {numPages > 0 && (
        <div className="pdf-viewer__nav">
          <div className="pdf-viewer__nav-group">
            <button
              type="button"
              className={
                "pdf-viewer__search-toggle" + (searchOpen ? " pdf-viewer__search-toggle--active" : "")
              }
              onClick={() => setSearchOpen((open) => !open)}
              aria-label={searchOpen ? "Close search" : "Search in this document"}
              title={searchOpen ? "Close search" : "Search in this document"}
            >
              <SearchIcon />
            </button>
          </div>

          <div className="pdf-viewer__nav-group">
            <button onClick={() => scrollToPage(currentPage - 1)} disabled={currentPage <= 1}>
              &lsaquo; Prev
            </button>
            <form className="pdf-viewer__page-jump" onSubmit={handlePageJumpSubmit}>
              <input
                type="number"
                min={1}
                max={numPages}
                value={pageJumpInput}
                onChange={(e) => setPageJumpInput(e.target.value)}
                placeholder={String(currentPage)}
                aria-label="Jump to page"
              />
              <button type="submit">Go</button>
            </form>
            <span className="pdf-viewer__nav-label">
              Page {currentPage} / {numPages}
            </span>
            <button
              onClick={() => scrollToPage(currentPage + 1)}
              disabled={currentPage >= numPages}
            >
              Next &rsaquo;
            </button>
          </div>

          <div className="pdf-viewer__nav-group pdf-viewer__zoom">
            <button type="button" onClick={handleZoomOut} aria-label="Zoom out" title="Zoom out">
              &minus;
            </button>
            <button
              type="button"
              className="pdf-viewer__zoom-level"
              onClick={handleZoomReset}
              title="Reset zoom"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" onClick={handleZoomIn} aria-label="Zoom in" title="Zoom in">
              +
            </button>
          </div>
        </div>
      )}

      {pendingSelection && (
        <HighlightPopover
          quote={pendingSelection.quote}
          anchorRect={pendingSelection.anchorRect}
          onSave={handleSaveHighlight}
        />
      )}
    </div>
  );
}