import type { PDFDocumentProxy, TextLayer } from "pdfjs-dist";
import { pdfjsLib } from "./engine";
import { paperRepository, Paper } from "../library";
import type { WorkspaceInfo } from "../workspace";
import { readingStateRepository, currentThoughtRepository, RecentlyStudiedEntry } from "./repository";
import type { CachedPage } from "./pageCache";

export interface OpenedDocument {
  pdf: PDFDocumentProxy;
  numPages: number;
}

/**
 * Reads a paper's PDF straight off disk via the File System Access
 * API (the workspace's `papers/` folder handle) and loads it into
 * pdf.js. Also records that the paper was opened: this is the first
 * point the app actually knows the page count, and docs/schema.md
 * notes `papers.page_count` stays null "until first opened."
 */
export async function openPaperDocument(
  paper: Paper,
  workspace: WorkspaceInfo,
): Promise<OpenedDocument> {
  const relativePath = paper.filePath.replace(/^papers[/\\]/, "");
  const papersDir = await workspace.dirHandle.getDirectoryHandle("papers");
  const fileHandle = await papersDir.getFileHandle(relativePath);
  const file = await fileHandle.getFile();
  const buffer = await file.arrayBuffer();

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;

  await paperRepository.recordOpened(paper.id, pdf.numPages, new Date().toISOString());

  return { pdf, numPages: pdf.numPages };
}

export interface PageDimensions {
  scale: number;
  width: number;
  height: number;
}

/**
 * Reads a page's true size at `targetWidth` (fit-width) without
 * rasterizing anything — `getPage`/`getViewport` are metadata-only
 * operations against the already-loaded document (pdf.js caches the
 * page proxy internally too, so repeat calls for the same page number
 * are effectively free), so this is cheap enough to call for every
 * page in the document up front.
 *
 * This is what lets the continuous scroll container size itself
 * accurately instead of guessing page heights and correcting later —
 * see the dimension prefetch in reader/ui/PdfViewer.tsx, which is the
 * fix for Problem #4 ("navigation resets the scroll position" /
 * "preserve natural reading position"): a virtualized list built on
 * guessed heights lands the initial scroll position at approximately
 * the right spot and then jumps once real heights arrive, which reads
 * exactly like the old scroll-reset bug.
 */
export async function measurePage(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  targetWidth: number,
): Promise<PageDimensions> {
  const page = await pdf.getPage(pageNumber);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = targetWidth > 0 ? targetWidth / baseViewport.width : 1;
  return { scale, width: baseViewport.width * scale, height: baseViewport.height * scale };
}

/**
 * Plain text of one page, for the in-document search box (reader
 * enhancements pass). Not cached the way rendered bitmaps are —
 * `PdfViewer` builds its own per-document text index once, the first
 * time the search box is opened, and holds it in a ref for the rest of
 * that document's session instead of calling this per keystroke.
 */
export async function getPageText(pdf: PDFDocumentProxy, pageNumber: number): Promise<string> {
  const page = await pdf.getPage(pageNumber);
  const content = await page.getTextContent();
  return content.items
    .map((item) => ("str" in item ? item.str : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Rasterizes a page to an offscreen canvas and hands back an
 * `ImageBitmap` rather than painting directly onto a live `<canvas>`
 * — this is the object `PageCache` stores, so a page scrolled out of
 * the virtualized window and back in can be repainted with a single
 * `drawImage()` instead of asking pdf.js to render it all over again.
 */
export async function renderPageBitmap(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  scale: number,
): Promise<CachedPage> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });

  const offscreen = document.createElement("canvas");
  offscreen.width = Math.ceil(viewport.width);
  offscreen.height = Math.ceil(viewport.height);
  const context = offscreen.getContext("2d");
  if (!context) throw new Error("2D canvas context unavailable");

  await page.render({ canvasContext: context, viewport }).promise;
  const bitmap = await createImageBitmap(offscreen);

  return { bitmap, width: viewport.width, height: viewport.height, scale };
}

/** Paints a cached bitmap onto a live canvas, sizing the canvas to match. */
export function paintCachedPage(cached: CachedPage, canvas: HTMLCanvasElement): void {
  canvas.width = cached.width;
  canvas.height = cached.height;
  const context = canvas.getContext("2d");
  context?.drawImage(cached.bitmap, 0, 0);
}

/**
 * Builds a fresh selectable text layer for a page and renders it into
 * `container`. Not cached (see PageCache's docstring for why) — always
 * streamed fresh from the open document, same as the original reader
 * did for its two live pages.
 */
export async function renderTextLayer(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  scale: number,
  container: HTMLDivElement,
): Promise<TextLayer> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });

  // pdf.js's TextLayer constructor sizes the container itself via
  // `calc(var(--scale-factor) * pageWidth)`, so setting width/height
  // directly here would just get overwritten — what actually needs
  // setting is --scale-factor, which TextLayer reads but doesn't set.
  container.replaceChildren();
  container.style.setProperty("--scale-factor", String(scale));

  const textLayer = new pdfjsLib.TextLayer({
    textContentSource: page.streamTextContent(),
    container,
    viewport,
  });
  await textLayer.render();
  return textLayer;
}

/**
 * Returns the paper's parked Current Thought, or an empty string if
 * none has been set yet (no `current_thought` row for this paper at
 * all — the normal case for most papers).
 */
export async function loadCurrentThought(paperId: string): Promise<string> {
  return currentThoughtRepository.get(paperId);
}

/**
 * Saves the paper's Current Thought (an empty string is a valid,
 * explicit "cleared" value here — unlike `saveExcerpt`'s optional
 * note, there's no separate "no thought" state to collapse it into,
 * since the row's mere existence isn't otherwise meaningful).
 */
export async function saveCurrentThought(paperId: string, thought: string): Promise<void> {
  await currentThoughtRepository.save(paperId, thought.trim(), new Date().toISOString());
}

/**
 * Returns the page to open a paper on: its last saved reading
 * position, clamped to the document's actual page count (in case the
 * saved state predates a different version of the file), or page 1
 * if there's no saved state yet.
 */
export async function loadReadingState(
  paperId: string,
  numPages: number,
): Promise<number> {
  const state = await readingStateRepository.get(paperId);
  if (!state) return 1;
  return Math.min(Math.max(1, state.currentPage), numPages);
}

/**
 * Saves the current page as the paper's reading position. Called
 * debounced from the scroll handler now rather than on every page
 * turn — continuous scroll fires far more update ticks than the old
 * Prev/Next buttons ever did. See PdfViewer.tsx.
 */
export async function saveReadingState(
  paperId: string,
  currentPage: number,
  numPages: number,
): Promise<void> {
  const progressPct = numPages > 0 ? (currentPage / numPages) * 100 : 0;
  await readingStateRepository.save(
    paperId,
    currentPage,
    progressPct,
    new Date().toISOString(),
  );
}

/**
 * The reader's "Continue where you left off" list — every paper
 * that's actually been opened, most-recently-studied first. Powers
 * `RecentlyStudied.tsx`, shown in place of the reader's plain "no
 * paper open" message whenever there's nothing currently open.
 */
export async function listRecentlyStudied(limit?: number): Promise<RecentlyStudiedEntry[]> {
  return readingStateRepository.listRecentlyStudied(limit);
}
