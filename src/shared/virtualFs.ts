import type { AppDirectoryHandle, AppFileHandle, AppHandle, AppWritable } from "./storageHandles";

/**
 * An IndexedDB-backed stand-in for the real File System Access API,
 * for browsers that don't implement it (Firefox, Safari — see
 * `browserSupport.ts`). Implements exactly `AppDirectoryHandle`/
 * `AppFileHandle`, so the rest of the app (workspace/library/reader/
 * exports) works against it unmodified — it never knows whether it's
 * talking to a real folder or this.
 *
 * The honest tradeoff (surfaced to the user in the launcher): a
 * "workspace" here is rows in this browser profile's IndexedDB, not a
 * real folder anyone can see in a file manager or move between
 * machines. It's still local-only and still private, but it lives and
 * dies with this browser's site data for this origin.
 *
 * Storage shape: one flat object store (`nodes`), keyed by a synthetic
 * path string (`/Thesis/papers/abc123.pdf`), each row holding its own
 * `parent` path — an index on `parent` is what makes "list this
 * folder's children" (`entries()`) a single indexed query rather than
 * a full-store scan.
 */

const DB_NAME = "litreview-vfs";
const STORE_NAME = "nodes";
const DB_VERSION = 1;
const ROOT_PATH = "/";

interface NodeRecord {
  path: string;
  parent: string;
  name: string;
  kind: "file" | "directory";
  data?: Blob;
  updatedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE_NAME, { keyPath: "path" });
        store.createIndex("parent", "parent");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

function joinPath(parent: string, name: string): string {
  return parent === ROOT_PATH ? `${ROOT_PATH}${name}` : `${parent}/${name}`;
}

async function getNode(path: string): Promise<NodeRecord | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(path);
    request.onsuccess = () => resolve(request.result as NodeRecord | undefined);
    request.onerror = () => reject(request.error);
  });
}

async function putNode(node: NodeRecord): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(node);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteNodeRow(path: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(path);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function listChildren(parent: string): Promise<NodeRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const index = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).index("parent");
    const request = index.getAll(IDBKeyRange.only(parent));
    request.onsuccess = () => resolve(request.result as NodeRecord[]);
    request.onerror = () => reject(request.error);
  });
}

async function deleteRecursive(path: string): Promise<void> {
  const node = await getNode(path);
  if (!node) return;
  if (node.kind === "directory") {
    for (const child of await listChildren(path)) {
      await deleteRecursive(child.path);
    }
  }
  await deleteNodeRow(path);
}

class VirtualWritable implements AppWritable {
  private chunks: BlobPart[] = [];
  constructor(
    private readonly path: string,
    private readonly parent: string,
    private readonly name: string,
  ) {}

  async write(data: BufferSource | Blob | string): Promise<void> {
    this.chunks.push(data as BlobPart);
  }

  async close(): Promise<void> {
    await putNode({
      path: this.path,
      parent: this.parent,
      name: this.name,
      kind: "file",
      data: new Blob(this.chunks),
      updatedAt: Date.now(),
    });
  }
}

export class VirtualFileHandle implements AppFileHandle {
  readonly kind = "file" as const;
  constructor(
    public readonly name: string,
    private readonly path: string,
    private readonly parent: string,
  ) {}

  async getFile(): Promise<File> {
    const node = await getNode(this.path);
    return new File([node?.data ?? new Blob([])], this.name, {
      lastModified: node?.updatedAt ?? Date.now(),
    });
  }

  async createWritable(): Promise<AppWritable> {
    return new VirtualWritable(this.path, this.parent, this.name);
  }
}

export class VirtualDirectoryHandle implements AppDirectoryHandle {
  readonly kind = "directory" as const;
  constructor(
    public readonly name: string,
    private readonly path: string,
  ) {}

  async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<AppDirectoryHandle> {
    const childPath = joinPath(this.path, name);
    const existing = await getNode(childPath);
    if (existing) {
      if (existing.kind !== "directory") {
        throw new DOMException(`"${name}" is a file, not a folder.`, "TypeMismatchError");
      }
      return new VirtualDirectoryHandle(name, childPath);
    }
    if (!options?.create) {
      throw new DOMException(`No such directory: "${name}".`, "NotFoundError");
    }
    await putNode({
      path: childPath,
      parent: this.path,
      name,
      kind: "directory",
      updatedAt: Date.now(),
    });
    return new VirtualDirectoryHandle(name, childPath);
  }

  async getFileHandle(name: string, options?: { create?: boolean }): Promise<AppFileHandle> {
    const childPath = joinPath(this.path, name);
    const existing = await getNode(childPath);
    if (existing) {
      if (existing.kind !== "file") {
        throw new DOMException(`"${name}" is a folder, not a file.`, "TypeMismatchError");
      }
      return new VirtualFileHandle(name, childPath, this.path);
    }
    if (!options?.create) {
      throw new DOMException(`No such file: "${name}".`, "NotFoundError");
    }
    await putNode({ path: childPath, parent: this.path, name, kind: "file", updatedAt: Date.now() });
    return new VirtualFileHandle(name, childPath, this.path);
  }

  async removeEntry(name: string, options?: { recursive?: boolean }): Promise<void> {
    const childPath = joinPath(this.path, name);
    const existing = await getNode(childPath);
    if (!existing) throw new DOMException(`No such entry: "${name}".`, "NotFoundError");
    if (existing.kind === "directory" && !options?.recursive) {
      const children = await listChildren(childPath);
      if (children.length > 0) {
        throw new DOMException(`"${name}" is not empty.`, "InvalidModificationError");
      }
    }
    await deleteRecursive(childPath);
  }

  async *entries(): AsyncIterableIterator<[string, AppHandle]> {
    for (const child of await listChildren(this.path)) {
      const handle: AppHandle =
        child.kind === "directory"
          ? new VirtualDirectoryHandle(child.name, child.path)
          : new VirtualFileHandle(child.name, child.path, this.path);
      yield [child.name, handle];
    }
  }
}

/** The single, always-available virtual root — no picker and no
 * permission prompt needed (IndexedDB requires neither), so unlike
 * the real API's `tryGetWorkspacesRoot`/`pickWorkspacesRoot` split,
 * this resolves synchronously-in-spirit every time. Idempotent: safe
 * to call on every launch. */
export async function getVirtualRoot(): Promise<VirtualDirectoryHandle> {
  const existing = await getNode(ROOT_PATH);
  if (!existing) {
    await putNode({ path: ROOT_PATH, parent: "", name: "", kind: "directory", updatedAt: Date.now() });
  }
  return new VirtualDirectoryHandle("", ROOT_PATH);
}
