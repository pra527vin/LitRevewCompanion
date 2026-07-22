import type { AppDirectoryHandle } from "./storageHandles";

/**
 * Writes a file into a workspace's `exports/` folder — the data-access
 * layer behind `features/export`'s Paper Summary/Literature Matrix/
 * Bibliography exports. Lives in `shared/` (a dependency-free, plain
 * function rather than a method on `export`'s own repository) so
 * anything else that ever needs to drop a file into a workspace's own
 * `exports/` folder can reuse it without creating a dependency on the
 * `export` feature itself.
 */
export async function writeExportFile(
  dirHandle: AppDirectoryHandle,
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
