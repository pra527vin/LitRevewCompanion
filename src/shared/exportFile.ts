/**
 * Writes a file into a workspace's `exports/` folder — the same
 * destination and naming convention `features/export/repository.ts`
 * uses, just generalized to accept binary content (a `Blob`, for the
 * equation PDF/Word exports) alongside plain text. Lives in `shared/`
 * rather than being reused from `features/export` directly: `export`
 * reads from `paper-summary`/`literature-matrix`, which read from
 * `notebook` — so `notebook` importing `features/export` back would
 * be a real circular dependency (see `EquationEditor`'s own doc
 * comment for where this is used).
 */
export async function writeExportFile(
  dirHandle: FileSystemDirectoryHandle,
  workspaceName: string,
  filename: string,
  contents: string | Blob,
): Promise<string> {
  if (!filename || filename.includes("/") || filename.includes("\\") || filename.includes("..")) {
    throw new Error("Invalid export filename.");
  }

  const exportsDir = await dirHandle.getDirectoryHandle("exports", { create: true });
  const fileHandle = await exportsDir.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(contents);
  await writable.close();

  return `${workspaceName}/exports/${filename}`;
}
