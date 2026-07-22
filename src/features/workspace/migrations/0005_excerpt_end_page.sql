-- Post-Milestone-13 bugfix pass — cross-page highlights.
--
-- The reader used to render one page at a time, so a highlight could
-- never physically span a page boundary — the text simply wasn't
-- both on screen at once for the browser to select. Now that the
-- reader renders the current page and the next one together (see
-- src/features/reader/ui/PdfViewer.tsx), a single highlight can start
-- on one page and end on the next.
--
-- `page_number` keeps meaning "the page the highlight starts on" for
-- every existing row. `end_page` is nullable — NULL means "doesn't
-- span a page boundary, ends on page_number too" — rather than
-- backfilling every single-page highlight's end_page to equal its
-- own page_number. Application code treats
-- `end_page ?? page_number` as the true end page throughout.

ALTER TABLE excerpts ADD COLUMN end_page INTEGER;
