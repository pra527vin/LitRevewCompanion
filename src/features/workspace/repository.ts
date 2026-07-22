import { storageClient } from "../storage";
import { WorkspaceInfo, WorkspaceSummary } from "./types";
import { getHandle, setHandle, deleteHandle, lastImportDirKey } from "./handleStore";
import m0001 from "./migrations/0001_workspace_and_papers.sql?raw";
import m0002 from "./migrations/0002_reading_state.sql?raw";
import m0003 from "./migrations/0003_notebook.sql?raw";
import m0004 from "./migrations/0004_dictionary_cache.sql?raw";
import m0005 from "./migrations/0005_excerpt_end_page.sql?raw";
import m0006 from "./migrations/0006_paper_source_type.sql?raw";
import m0007 from "./migrations/0007_workspace_last_import_dir.sql?raw";
import m0008 from "./migrations/0008_categories.sql?raw";
import m0009 from "./migrations/0009_model_specification.sql?raw";

/**
 * Data-access layer. Knows how to reach a workspace folder (via the
 * File System Access API) and how to shape what it finds — nothing
 * about *when* to call it or how to validate input first. That's
 * service.ts's job.
 *
 * A workspace is a folder containing:
 *   database.sqlite   — SQLite DB, migrated below
 *   papers/            — imported PDFs, content-addressed by hash
 *   exports/           — generated .md/.csv exports
 *   settings.json      — workspace-level settings, not in the DB
 *
 * Migrations run here, directly against `storageClient`, rather than
 * through some separate migration API — same reasoning the old Rust
 * backend had for running them by hand instead of tauri-plugin-sql's
 * migration runner: the workspace file is chosen at runtime, not a
 * fixed compile-time connection string.
 */

// (version, sql). Order matters — applied in array order, each only
// runs if `version` is greater than the DB's current
// `workspace_meta.schema_version`. Append new entries here as new
// migration files are added; never edit an existing entry's sql.
const MIGRATIONS: Array<[number, string]> = [
  [1, m0001],
  [2, m0002],
  [3, m0003],
  [4, m0004],
  [5, m0005],
  [6, m0006],
  [7, m0007],
  [8, m0008],
  [9, m0009],
];

const DB_FILENAME = "database.sqlite";

function sanitizeFolderName(name: string): string {
  const cleaned = Array.from(name)
    .map((c) => (/[a-zA-Z0-9 _-]/.test(c) ? c : "_"))
    .join("");
  return cleaned.trim();
}

async function directoryExists(
  parent: FileSystemDirectoryHandle,
  name: string,
): Promise<boolean> {
  try {
    await parent.getDirectoryHandle(name);
    return true;
  } catch {
    return false;
  }
}

async function fileExists(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<boolean> {
  try {
    await dir.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

/** Applies any pending migrations against the currently-connected
 * database and returns the resulting schema version. `nameIfNew`
 * seeds `workspace_meta.name` the first time migration 1 runs (i.e.
 * on a brand-new database) and is ignored on subsequent calls against
 * an already-migrated workspace. */
async function applyMigrations(nameIfNew?: string): Promise<number> {
  const tableCheck = await storageClient.select<{ count: number }>(
    "SELECT COUNT(*) as count FROM sqlite_master WHERE type = 'table' AND name = 'workspace_meta'",
  );
  const workspaceMetaExists = (tableCheck[0]?.count ?? 0) > 0;

  let currentVersion = 0;
  if (workspaceMetaExists) {
    const rows = await storageClient.select<{ schema_version: number }>(
      "SELECT schema_version FROM workspace_meta WHERE id = 1",
    );
    currentVersion = rows[0]?.schema_version ?? 0;
  }

  for (const [version, sql] of MIGRATIONS) {
    if (version <= currentVersion) continue;

    await storageClient.execute(sql);
    currentVersion = version;

    if (version === 1) {
      // Migration 1 just created workspace_meta — seed its row.
      await storageClient.execute(
        "INSERT INTO workspace_meta (id, name, created_at, schema_version) VALUES (1, $1, $2, $3)",
        [nameIfNew || "Untitled Workspace", new Date().toISOString(), currentVersion],
      );
    } else {
      await storageClient.execute(
        "UPDATE workspace_meta SET schema_version = $1 WHERE id = 1",
        [currentVersion],
      );
    }
  }

  return currentVersion;
}

async function readWorkspaceInfo(dirHandle: FileSystemDirectoryHandle): Promise<WorkspaceInfo> {
  const rows = await storageClient.select<{
    name: string;
    created_at: string;
    schema_version: number;
  }>("SELECT name, created_at, schema_version FROM workspace_meta WHERE id = 1");
  const row = rows[0];
  if (!row) throw new Error("Workspace database is missing its metadata row.");
  return {
    dirHandle,
    name: row.name,
    createdAt: row.created_at,
    schemaVersion: row.schema_version,
  };
}

export const workspaceRepository = {
  /** Creates a new workspace folder (with `papers/`, `exports/`,
   * `settings.json`, and a freshly-migrated `database.sqlite`) inside
   * `parentHandle`, named after `name`. */
  async create(parentHandle: FileSystemDirectoryHandle, name: string): Promise<WorkspaceInfo> {
    const folderName = sanitizeFolderName(name);
    if (!folderName) {
      throw new Error("Workspace name can't be empty.");
    }
    if (await directoryExists(parentHandle, folderName)) {
      throw new Error(`A folder named "${folderName}" already exists there.`);
    }

    const dirHandle = await parentHandle.getDirectoryHandle(folderName, { create: true });
    await dirHandle.getDirectoryHandle("papers", { create: true });
    await dirHandle.getDirectoryHandle("exports", { create: true });

    const settingsHandle = await dirHandle.getFileHandle("settings.json", { create: true });
    const settingsWritable = await settingsHandle.createWritable();
    await settingsWritable.write(JSON.stringify({ version: 1 }, null, 2));
    await settingsWritable.close();

    const dbHandle = await dirHandle.getFileHandle(DB_FILENAME, { create: true });
    await storageClient.connect(dbHandle);
    await applyMigrations(name);
    return readWorkspaceInfo(dirHandle);
  },

  /** Opens an existing workspace folder, catching its database up to
   * the current schema if it was created by an older app version. */
  async open(dirHandle: FileSystemDirectoryHandle): Promise<WorkspaceInfo> {
    if (!(await fileExists(dirHandle, DB_FILENAME))) {
      throw new Error(
        "That folder doesn't look like a LitReview workspace (no database.sqlite found).",
      );
    }
    const dbHandle = await dirHandle.getFileHandle(DB_FILENAME);
    await storageClient.connect(dbHandle);
    await applyMigrations();
    return readWorkspaceInfo(dirHandle);
  },

  /** Every workspace found directly inside `root` (most-recently-created
   * first), for the launcher's "open an existing one" list. A
   * subfolder only counts as a workspace if it actually has a
   * `database.sqlite`; anything else is silently skipped rather than
   * surfaced as an error — one bad entry shouldn't block the whole
   * launcher list. */
  async list(root: FileSystemDirectoryHandle): Promise<WorkspaceSummary[]> {
    const summaries: WorkspaceSummary[] = [];

    for await (const [, entry] of root.entries()) {
      if (entry.kind !== "directory") continue;
      const candidate = entry as FileSystemDirectoryHandle;
      if (!(await fileExists(candidate, DB_FILENAME))) continue;

      try {
        const dbHandle = await candidate.getFileHandle(DB_FILENAME);
        await storageClient.connect(dbHandle);
        const info = await readWorkspaceInfo(candidate);
        summaries.push({ dirHandle: candidate, name: info.name, createdAt: info.createdAt });
      } catch {
        // Not a valid workspace database — skip it.
      } finally {
        await storageClient.disconnect();
      }
    }

    summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return summaries;
  },

  /**
   * Deletes a workspace folder (and everything in it — the database,
   * every imported PDF, every export) from `root`. If the workspace
   * being removed is the one currently connected, disconnects first so
   * the deletion doesn't race a pending debounced write-back in
   * storageClient. Also forgets its remembered "last Add Paper folder"
   * entry, keyed by the same folder name — otherwise a future
   * workspace that happens to reuse the name would inherit a stale
   * directory handle.
   */
  async remove(root: FileSystemDirectoryHandle, name: string): Promise<void> {
    if (storageClient.isConnected()) {
      await storageClient.disconnect();
    }
    await root.removeEntry(name, { recursive: true });
    await deleteHandle(lastImportDirKey(name)).catch(() => {
      // Best-effort — nothing useful to surface if this was never set.
    });
  },

  // Post-Milestone-13 bugfix pass — "Add Paper" remembers the last
  // folder a PDF was picked from. A `FileSystemDirectoryHandle` can't
  // live in a SQLite TEXT column, so unlike the rest of workspace_meta
  // this is persisted in the browser's handle store instead (see
  // handleStore.ts), keyed by workspace folder name.
  async getLastImportDir(workspaceKey: string): Promise<FileSystemDirectoryHandle | null> {
    return getHandle<FileSystemDirectoryHandle>(lastImportDirKey(workspaceKey));
  },

  async setLastImportDir(workspaceKey: string, dir: FileSystemDirectoryHandle): Promise<void> {
    await setHandle(lastImportDirKey(workspaceKey), dir);
  },
};
