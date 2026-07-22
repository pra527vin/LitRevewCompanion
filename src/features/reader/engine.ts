// The pdfjsLib singleton (and its worker setup) now lives in
// src/shared/pdfjs.ts, not here — the library feature's thumbnail
// generation needs it too, and reader already depends on library (for
// the `Paper` type and `paperRepository`), so it couldn't live inside
// the reader feature without library importing back out of reader and
// creating a real circular dependency between the two. This re-export
// keeps every existing `from "./engine"` import in this feature
// working unchanged.
export { pdfjsLib } from "../../shared/pdfjs";
