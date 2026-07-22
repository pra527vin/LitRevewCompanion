-- Milestone 14 (post-13a) — APA7 metadata for non-DOI source types.
-- See docs/schema.md for full rationale.
--
-- `journal` (added in 0001) is reused as-is rather than renamed — it's
-- displayed as a generic "container/publisher" field now (see
-- MetadataSection.tsx), holding whichever single venue name applies:
-- a journal name, a book/report publisher, or an institution, since
-- this app doesn't attempt full per-type APA7 reference generation.
--
-- source_type: null until the person picks one (or a DOI/URL lookup
-- infers "article"/"report") — no default, since guessing "article"
-- for a freshly-added PDF that might be a government report or
-- working paper would be actively misleading.
--
-- url: for sources with no DOI — working papers, government reports,
-- and other web-published documents an APA7 reference still needs a
-- retrieval URL for.
ALTER TABLE papers ADD COLUMN source_type TEXT;
ALTER TABLE papers ADD COLUMN url TEXT;
