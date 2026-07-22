import initSqlJs, { Database as SqlJsDatabase, SqlJsStatic, SqlValue } from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { StorageError } from "./errors";
import type { AppFileHandle } from "../../shared/storageHandles";

/**
 * The Repository layer's foundation, per Design_Decisions.md's
 * `UI → Service → Repository → SQLite`. Every feature's own
 * repository.ts (papers, notebook, excerpts, ...) calls `select`/
 * `execute` here instead of touching sql.js directly — this is the
 * one place that knows how a connection is opened, closed, persisted
 * to disk, and reported when something goes wrong.
 *
 * Backed by sql.js (WASM SQLite) rather than a native binding, since
 * this app runs as a plain browser page — there is no Rust/Tauri
 * process to host a real SQLite connection. The whole database lives
 * in memory while a workspace is open; every mutating `execute()`
 * debounces a re-serialize + write-back to the workspace's
 * `database.sqlite` file via the File System Access API, so the file
 * on disk stays a real, openable SQLite file at rest.
 *
 * There is exactly one connection at a time, to whichever workspace
 * is currently open. Schema migrations run in
 * `../workspace/repository.ts` against this same connection — see its
 * doc comment for why they live there instead of here.
 */

const WRITE_DEBOUNCE_MS = 300;

let SQL: SqlJsStatic | null = null;
let sqlJsLoading: Promise<SqlJsStatic> | null = null;

function loadSqlJs(): Promise<SqlJsStatic> {
  if (SQL) return Promise.resolve(SQL);
  if (!sqlJsLoading) {
    sqlJsLoading = initSqlJs({ locateFile: () => sqlWasmUrl }).then((lib) => {
      SQL = lib;
      return lib;
    });
  }
  return sqlJsLoading;
}

let db: SqlJsDatabase | null = null;
let fileHandle: AppFileHandle | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Every operation that touches `db`/`fileHandle` (connect, flush,
 * disconnect) is funneled through this chain so at most one runs at a
 * time. Without it, switching workspaces (which disconnects the old
 * one) can race the workspace launcher's own scan of other workspace
 * folders (`workspace/repository.ts`'s `list`, which connects and
 * disconnects once per candidate) — `connect()` itself calls
 * `disconnect()` when a connection is already open, so two
 * `disconnect()` calls can end up in flight together, and whichever's
 * `flush()` resolves second then calls `.close()` on a `db` the other
 * one already nulled out ("Cannot read properties of null (reading
 * 'close')"). Queuing every call here means the second one simply
 * starts after the first has fully finished, `db` included.
 */
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task, task);
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function connectLocked(handle: AppFileHandle): Promise<void> {
  if (db) {
    await disconnectLocked();
  }

  try {
    const lib = await loadSqlJs();
    const file = await handle.getFile();
    const bytes = new Uint8Array(await file.arrayBuffer());
    db = bytes.length > 0 ? new lib.Database(bytes) : new lib.Database();
    fileHandle = handle;
  } catch (cause) {
    db = null;
    fileHandle = null;
    throw new StorageError(`Couldn't open the workspace database.`, cause);
  }
}

/** Re-serializes the in-memory database and writes it back to the
 * workspace's `database.sqlite` file. Debounced writes call this via
 * the timer below; `disconnectLocked()` calls it directly to flush any
 * pending write before closing. */
async function flushLocked(): Promise<void> {
  if (writeTimer !== null) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  if (!db || !fileHandle) return;
  const bytes = db.export();
  const writable = await fileHandle.createWritable();
  await writable.write(bytes as BufferSource);
  await writable.close();
}

function scheduleFlush(): void {
  if (writeTimer !== null) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    enqueue(flushLocked).catch(() => {
      // Best-effort — a transient write failure here shouldn't crash
      // the query that triggered it; the next mutation retries.
    });
  }, WRITE_DEBOUNCE_MS);
}

async function disconnectLocked(): Promise<void> {
  if (!db) return;
  try {
    await flushLocked();
  } finally {
    // `db` may already be null here in principle (nothing else should
    // be able to null it out from under a queued call anymore, but
    // this stays a no-op guard rather than an assumption).
    db?.close();
    db = null;
    fileHandle = null;
  }
}

async function connect(handle: AppFileHandle): Promise<void> {
  return enqueue(() => connectLocked(handle));
}

async function disconnect(): Promise<void> {
  return enqueue(() => disconnectLocked());
}

function isConnected(): boolean {
  return db !== null;
}

function requireConnection(): SqlJsDatabase {
  if (!db) {
    throw new StorageError(
      "No workspace database connection. Call storageClient.connect() before querying.",
    );
  }
  return db;
}

async function select<T = Record<string, unknown>>(
  query: string,
  params: unknown[] = [],
): Promise<T[]> {
  try {
    const database = requireConnection();
    const stmt = database.prepare(query);
    try {
      if (params.length > 0) stmt.bind(params as SqlValue[]);
      const rows: T[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as T);
      }
      return rows;
    } finally {
      stmt.free();
    }
  } catch (cause) {
    if (cause instanceof StorageError) throw cause;
    throw new StorageError(`Query failed: ${query}`, cause);
  }
}

/**
 * Runs a mutating statement (or, when `params` is empty, a batch of
 * semicolon-separated statements — the shape a schema migration
 * comes in). sql.js's `run()` only compiles the first statement in a
 * string when bind params are supplied, so a real bind is routed
 * through `run()` and a bare batch is routed through `exec()`, which
 * runs every statement in the string.
 */
async function execute(
  query: string,
  params: unknown[] = [],
): Promise<{ rowsAffected: number; lastInsertId?: number }> {
  try {
    const database = requireConnection();
    if (params.length > 0) {
      database.run(query, params as SqlValue[]);
    } else {
      database.exec(query);
    }
    const rowsAffected = database.getRowsModified();
    scheduleFlush();
    return { rowsAffected };
  } catch (cause) {
    if (cause instanceof StorageError) throw cause;
    throw new StorageError(`Execute failed: ${query}`, cause);
  }
}

export const storageClient = {
  connect,
  disconnect,
  isConnected,
  select,
  execute,
};
