import * as pdfjsLib from "pdfjs-dist";
// Vite's `?url` import gives us the built worker file's final asset
// URL rather than trying to bundle it inline — pdf.js's worker must
// be loaded as a separate script.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Lives outside any feature folder (not in `reader/`) because it's
// needed by more than one: the reader itself, and the library
// feature's thumbnail generation (import review, sidebar listing).
// `reader` already depends on `library` (for the `Paper` type and
// `paperRepository`), so `library` importing pdf.js machinery back out
// of `reader` would be a real circular dependency between the two
// features — this neutral module is what both sides depend on
// instead.
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export { pdfjsLib };
