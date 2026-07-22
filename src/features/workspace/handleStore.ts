/**
 * Persists `FileSystemDirectoryHandle`/`FileSystemFileHandle`s across
 * sessions. Handles are structured-cloneable, so a tiny IndexedDB
 * key/value store is enough — no library needed.
 *
 * This is what lets the launcher skip the OS folder picker on every
 * launch: the workspaces-root handle (and, per workspace, its last
 * "Add Paper" folder) is looked up here first, with permission
 * re-requested silently where the browser allows it, before falling
 * back to asking the person to choose again.
 */

const DB_NAME = "litreview-handles";
const STORE_NAME = "handles";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getHandle<T = FileSystemHandle>(key: string): Promise<T | null> {
  const db = await openDb();
  try {
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve((request.result as T) ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function setHandle(key: string, handle: FileSystemHandle): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(handle, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function deleteHandle(key: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/**
 * Checks (without prompting) whether `handle` can already be read/
 * written this session — safe to call from anywhere, including a
 * mount effect, since `queryPermission` never shows UI.
 */
export async function hasReadWritePermission(handle: FileSystemHandle): Promise<boolean> {
  const query = await handle.queryPermission({ mode: "readwrite" });
  return query === "granted";
}

/**
 * Prompts for read/write permission on a previously-granted handle.
 * Unlike `hasReadWritePermission`, this can show a (lightweight,
 * one-click) permission prompt — the File System Access API requires
 * that to happen inside a real user gesture (a click handler), same
 * as `showDirectoryPicker`/`showOpenFilePicker` themselves. Calling it
 * from a `useEffect` or other non-gesture context throws.
 */
export async function requestReadWritePermission(handle: FileSystemHandle): Promise<boolean> {
  const request = await handle.requestPermission({ mode: "readwrite" });
  return request === "granted";
}

export const WORKSPACES_ROOT_KEY = "workspaces-root";
export function lastImportDirKey(workspaceKey: string): string {
  return `last-import-dir:${workspaceKey}`;
}
