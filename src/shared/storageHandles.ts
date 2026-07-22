/**
 * The minimal directory/file-handle shape this app actually calls —
 * deliberately not the full `FileSystemDirectoryHandle`/
 * `FileSystemFileHandle`/`FileSystemWritableFileStream` DOM interfaces
 * (which also carry `isSameEntry`, `resolve`, `seek`, `truncate`,
 * `abort`, `getWriter`, `locked`, ... — none of which anything in this
 * codebase touches). Real File System Access API objects already
 * satisfy these structurally (they have strictly more members, and
 * TypeScript's structural typing allows "more" where "enough" is
 * required) — no adapter needed on that side. `virtualFs.ts`'s
 * IndexedDB-backed classes are the other implementation, used in
 * browsers (Firefox, Safari) that never implemented the real API.
 *
 * Keeping this app-defined and narrow, rather than typing everything
 * against the real DOM interfaces, is what lets one storage layer
 * (workspace, library, reader, exports) work unmodified against
 * either backend.
 */
export interface AppHandle {
  readonly kind: "file" | "directory";
  readonly name: string;
}

export interface AppWritable {
  write(data: BufferSource | Blob | string): Promise<void>;
  close(): Promise<void>;
}

export interface AppFileHandle extends AppHandle {
  readonly kind: "file";
  getFile(): Promise<File>;
  createWritable(): Promise<AppWritable>;
}

export interface AppDirectoryHandle extends AppHandle {
  readonly kind: "directory";
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<AppDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<AppFileHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  /** Same shape the real API's own `entries()` yields (a generic
   * `{kind, name}` handle, not already narrowed to file-or-directory)
   * — callers check `.kind` and cast, same as they already do against
   * the real API (see `workspaceRepository.list`). */
  entries(): AsyncIterableIterator<[string, AppHandle]>;
}
