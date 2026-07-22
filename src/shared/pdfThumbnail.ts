import { pdfjsLib } from "./pdfjs";

/**
 * Rasterizes a PDF's first page to a small PNG, for a thumbnail
 * preview — used both in the "Add Paper" review step (rendered
 * straight from the picked file's in-memory bytes, before anything's
 * written to disk) and the library sidebar's listing (rendered from
 * the saved copy in `papers/`, then cached to `thumbnails/` — see
 * `library/service.ts`'s `saveThumbnail`/`loadThumbnailBlob`).
 *
 * Takes raw bytes rather than an already-open `PDFDocumentProxy`
 * deliberately: the review step has no open document at all yet (just
 * a picked file's buffer), so a shared helper that opens-renders-closes
 * its own short-lived document is simpler than asking every caller to
 * manage that lifecycle themselves for what's normally a one-off call.
 *
 * `bytes.slice()` — not `bytes` itself — is what actually gets handed
 * to pdf.js: passing a typed array as `data` lets pdf.js transfer its
 * underlying `ArrayBuffer` to its worker for a zero-copy load, which
 * *detaches* that buffer (byteLength drops to 0) once the transfer
 * happens. During "Add Paper," the review step's `PendingImport.buffer`
 * is this same buffer reused later by `finalizeImports` to actually
 * write the PDF to disk — without the copy here, that buffer had
 * already been silently emptied by the time the thumbnail rendered,
 * so every imported paper got written as a zero-byte file (surfacing
 * later as pdf.js's "The PDF file is empty" error on open, unrelated
 * to whatever category/DOI was or wasn't filled in during review).
 * `slice()` hands pdf.js a throwaway copy to detach instead.
 */
export async function renderThumbnail(bytes: Uint8Array, maxWidth = 160): Promise<Blob> {
  const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  try {
    const page = await doc.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = maxWidth / baseViewport.width;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("2D canvas context unavailable");

    await page.render({ canvasContext: context, viewport }).promise;

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't create thumbnail"))),
        "image/png",
      );
    });
  } finally {
    await doc.destroy();
  }
}
