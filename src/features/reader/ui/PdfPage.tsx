import { memo, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, TextLayer } from "pdfjs-dist";
import { WordHoverTooltip } from "../../dictionary";
import { measurePage, renderPageBitmap, paintCachedPage, renderTextLayer } from "../service";
import type { PageCache } from "../pageCache";

export interface PdfPageProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  /** Fit-width target, in CSS px, already including zoom. */
  targetWidth: number;
  cache: PageCache;
  /** Best-known height before this page's own render effect has run —
   * either a real measurement from an earlier pass, or the document's
   * running estimate. Used only for layout (skeleton height / avoiding
   * a 0-height flash), never for anything that needs to be exact. */
  estimatedHeight: number;
  /** Reports this page's exact rendered height back up once known, so
   * the parent's virtualization offsets can be corrected from
   * estimate to reality. */
  onMeasured: (pageNumber: number, height: number) => void;
  /** Registers/unregisters this page's DOM node under its page number
   * so the parent can resolve "which page did this selection land in"
   * without hardcoding an assumption about how many pages are mounted. */
  registerPageEl: (pageNumber: number, el: HTMLDivElement | null) => void;
}

function PdfPageImpl({
  pdf,
  pageNumber,
  targetWidth,
  cache,
  estimatedHeight,
  onMeasured,
  registerPageEl,
}: PdfPageProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const textLayerInstance = useRef<TextLayer | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    registerPageEl(pageNumber, wrapperRef.current);
    return () => registerPageEl(pageNumber, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber]);

  // The actual render pipeline: measure (cheap, always) → paint from
  // cache or rasterize fresh (expensive, cached) → stream a text
  // layer (cheap, never cached). Deliberately keyed only on
  // [pdf, pageNumber, targetWidth] — `cache`/`onMeasured`/
  // `registerPageEl` are stable references from the parent, and
  // `estimatedHeight` changing shouldn't retrigger a render.
  useEffect(() => {
    let cancelled = false;
    setReady(false);

    async function run() {
      const dims = await measurePage(pdf, pageNumber, targetWidth);
      if (cancelled) return;
      onMeasured(pageNumber, dims.height);

      let cached = cache.get(pageNumber, dims.scale);
      if (!cached) {
        const rendered = await renderPageBitmap(pdf, pageNumber, dims.scale);
        if (cancelled) {
          rendered.bitmap.close();
          return;
        }
        cache.set(pageNumber, rendered);
        cached = rendered;
      }
      if (canvasRef.current) paintCachedPage(cached, canvasRef.current);

      if (textLayerRef.current) {
        textLayerInstance.current?.cancel();

        // ─── EXACT ADDITION HERE ─────────────────────────────────────────
        // Explicitly resize the text layer container to match the page dimensions
        textLayerRef.current.style.width = `${dims.width}px`;
        textLayerRef.current.style.height = `${dims.height}px`;
        // ─────────────────────────────────────────────────────────────────

        textLayerInstance.current = await renderTextLayer(
          pdf,
          pageNumber,
          dims.scale,
          textLayerRef.current,
        );
      }

      if (!cancelled) setReady(true);
    }

    run().catch((e) => {
      if (!cancelled) console.error(`Failed to render page ${pageNumber}:`, e);
    });

    return () => {
      cancelled = true;
      textLayerInstance.current?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, pageNumber, targetWidth]);

  return (
    <div ref={wrapperRef} className="pdf-page" data-page-number={pageNumber}>
      <div className="pdf-page__number">{pageNumber}</div>
      {!ready && (
        <div className="pdf-page__skeleton" style={{ height: estimatedHeight || undefined }} />
      )}
      <canvas
        ref={canvasRef}
        className="pdf-page__canvas"
        style={{ display: ready ? "block" : "none" }}
      />
      <div ref={textLayerRef} className="pdf-page__text-layer textLayer" />
      <WordHoverTooltip containerRef={textLayerRef} />
    </div>
  );
}

// Wrapped in memo so scrolling (which changes the parent's spacer
// heights and the visible-page window) doesn't re-render every
// already-mounted page — only ones whose actual props changed do.
export const PdfPage = memo(PdfPageImpl);