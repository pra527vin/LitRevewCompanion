import type { WorkspaceInfo } from "../workspace";
import { writeExportFile } from "../../shared/exportFile";

/**
 * Data-access layer. Writes straight into the workspace's own
 * `exports/` folder via the File System Access API — no backend
 * round-trip needed now that the workspace folder handle is already
 * in hand. The actual write lives in `shared/exportFile.ts` now (it
 * also backs the Model Specification section's equation exports),
 * generalized to take a `Blob` too; every export this feature itself
 * produces is still plain text.
 */
export const exportRepository = {
  async writeFile(workspace: WorkspaceInfo, filename: string, contents: string): Promise<string> {
    return writeExportFile(workspace.dirHandle, workspace.name, filename, contents);
  },
};
