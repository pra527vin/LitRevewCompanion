/** Whether the File System Access API (`showDirectoryPicker`,
 * `showOpenFilePicker`, real `FileSystemDirectoryHandle`s) is
 * available — true in Chromium-based browsers, false in Firefox and
 * Safari, which have never implemented it. Checked once at module
 * load rather than inline at every call site, so every branch in the
 * storage layer reads the same value.
 *
 * Everything that depends on this lives behind the storage handle
 * abstraction in `storageHandles.ts`/`virtualFs.ts` — nothing above
 * the workspace/library service layer needs to know which backend is
 * actually in use.
 */
export const SUPPORTS_FILE_SYSTEM_ACCESS =
  typeof window !== "undefined" && "showDirectoryPicker" in window;
