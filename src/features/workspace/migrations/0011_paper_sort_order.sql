-- Manual drag-to-reorder in the Library sidebar. Nullable: a paper
-- that's never been dragged has no manual position yet and falls
-- back to sorting by `added_at` (see LibrarySidebar's "Custom order"
-- sort mode) rather than needing every existing paper backfilled.
ALTER TABLE papers ADD COLUMN sort_order INTEGER;
