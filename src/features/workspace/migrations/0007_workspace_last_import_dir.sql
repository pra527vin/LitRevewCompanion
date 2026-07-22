-- Post-Milestone-13 bugfix pass — "Add Paper" remembers the last
-- folder a PDF was picked from, workspace-scoped rather than global,
-- since different workspaces (different research projects) tend to
-- draw from different source folders.
ALTER TABLE workspace_meta ADD COLUMN last_import_dir TEXT;
