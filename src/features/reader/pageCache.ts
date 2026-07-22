export interface CachedPage {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  scale: number;
}

const SCALE_TOLERANCE = 0.005;
const DEFAULT_MAX_PAGES = 40;

/**
 * A small LRU cache of rasterized pages, keyed by page number. This is
 * what makes scrolling back over an already-visited page instant
 * instead of re-running pdf.js's render pipeline — the old reader's
 * Problems #2/#3/#7 ("rendering pauses and stutters," "pages are
 * repeatedly destroyed and recreated," "no page cache") were really
 * one problem: every page turn re-rasterized a full page from
 * scratch, with nothing kept from the last time it was visible.
 *
 * Deliberately caches only the bitmap, not the text layer — the
 * canvas render is the expensive step (real rasterization work);
 * rebuilding a text layer from the already-open local document is
 * cheap enough that caching it too would add a second, more
 * failure-prone cache for comparatively little benefit. See
 * `renderTextLayer` in service.ts.
 *
 * Bounded to `maxPages` entries so a long document doesn't grow this
 * without limit — each entry is a full-resolution bitmap, so an
 * unbounded cache on a long PDF would be a real amount of memory.
 * Evicts the least-recently-*touched* page (a `get()` counts as a
 * touch), not the least recently rendered, so pages the reader keeps
 * scrolling back to stay warm.
 */
export class PageCache {
  private entries = new Map<number, CachedPage>();
  private lruOrder: number[] = [];
  private readonly maxPages: number;

  constructor(maxPages: number = DEFAULT_MAX_PAGES) {
    this.maxPages = maxPages;
  }

  /**
   * Returns the cached page, or `undefined` on a miss. If
   * `expectedScale` is given and doesn't match the cached entry's
   * scale (e.g. the reader was resized or zoomed since this page was
   * last rendered), this counts as a miss too — a wrong-resolution
   * bitmap isn't useful to the caller.
   */
  get(pageNumber: number, expectedScale?: number): CachedPage | undefined {
    const entry = this.entries.get(pageNumber);
    if (!entry) return undefined;
    if (expectedScale !== undefined && Math.abs(entry.scale - expectedScale) > SCALE_TOLERANCE) {
      return undefined;
    }
    this.touch(pageNumber);
    return entry;
  }

  set(pageNumber: number, entry: CachedPage): void {
    const existing = this.entries.get(pageNumber);
    if (existing && existing.bitmap !== entry.bitmap) existing.bitmap.close();
    this.entries.set(pageNumber, entry);
    this.touch(pageNumber);
    this.evict();
  }

  /**
   * Drops every cached page and releases their bitmaps. Used when the
   * render width changes (container resize or zoom) — every cached
   * bitmap is the wrong resolution afterwards anyway, so there's no
   * point keeping them around waiting to be individually rejected by
   * `get()`'s scale check.
   */
  clear(): void {
    for (const entry of this.entries.values()) entry.bitmap.close();
    this.entries.clear();
    this.lruOrder = [];
  }

  private touch(pageNumber: number): void {
    const idx = this.lruOrder.indexOf(pageNumber);
    if (idx !== -1) this.lruOrder.splice(idx, 1);
    this.lruOrder.push(pageNumber);
  }

  private evict(): void {
    while (this.lruOrder.length > this.maxPages) {
      const oldest = this.lruOrder.shift();
      if (oldest === undefined) break;
      const entry = this.entries.get(oldest);
      entry?.bitmap.close();
      this.entries.delete(oldest);
    }
  }
}
