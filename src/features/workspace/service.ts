import { workspaceRepository } from "./repository";
import { WorkspaceInfo, WorkspaceSummary } from "./types";
import { storageClient } from "../storage";
import {
  getHandle,
  setHandle,
  hasReadWritePermission,
  requestReadWritePermission,
  WORKSPACES_ROOT_KEY,
} from "./handleStore";
import type { AppDirectoryHandle } from "../../shared/storageHandles";
import { SUPPORTS_FILE_SYSTEM_ACCESS } from "../../shared/browserSupport";
import { getVirtualRoot } from "../../shared/virtualFs";

/**
 * Business logic for the workspace lifecycle. Owns validation and
 * orchestration; the UI layer just calls these and renders the
 * result or error.
 *
 * There's no silent default folder here the way the old Tauri backend
 * had (`<Documents>/LitReview Companion`) — the browser sandbox never
 * grants folder access without an explicit picker, and even
 * re-requesting permission on a remembered folder needs a live user
 * gesture. `tryGetWorkspacesRoot` (safe to call from a mount effect)
 * and `pickWorkspacesRoot` (must be called from a click handler) split
 * that distinction — the first time someone uses the app,
 * `pickWorkspacesRoot` asks them to choose or create one folder to
 * hold every workspace; after that, the handle is remembered
 * (handleStore.ts) and reused silently across launches, so only that
 * first run feels different from the old default-root behavior. A
 * folder-picker "somewhere else" escape hatch (`openWorkspaceFromPicker`
 * / `createWorkspaceAtCustomLocation`) remains, same as before.
 *
 * Cross-browser pass: on browsers without the File System Access API
 * (`!SUPPORTS_FILE_SYSTEM_ACCESS` — Firefox, Safari), every one of
 * these that would otherwise call `window.showDirectoryPicker` instead
 * resolves the single, always-available IndexedDB-backed virtual root
 * (`shared/virtualFs.ts`) — no picker, no permission prompt, no
 * "choose a folder" step at all, since neither concept applies to
 * browser-profile storage. The two "somewhere else on real disk"
 * escape hatches (open/create at a custom location) have no virtual
 * equivalent — nothing exists outside the virtual root — so they
 * resolve `null`, same shape already used for "user cancelled the
 * picker"; the launcher UI hides the buttons that would call them on
 * this path entirely rather than relying on this fallback silently
 * doing nothing.
 */
export const workspaceService = {
  /** The folder new workspaces are created inside by default, and
   * where `listWorkspaces` looks for existing ones — if a previously-
   * chosen one is already usable without prompting. Safe to call from
   * a mount effect: never shows a picker or permission prompt, both of
   * which the File System Access API only allows inside a genuine
   * user gesture. Returns null when the launcher needs to fall back to
   * `pickWorkspacesRoot` (first launch, or permission no longer
   * granted) from a click handler instead. */
  async tryGetWorkspacesRoot(): Promise<AppDirectoryHandle | null> {
    if (!SUPPORTS_FILE_SYSTEM_ACCESS) return getVirtualRoot();

    const stored = await getHandle<FileSystemDirectoryHandle>(WORKSPACES_ROOT_KEY);
    if (stored && (await hasReadWritePermission(stored))) {
      return stored;
    }
    return null;
  },

  /** Prompts for the workspaces-root folder — re-requesting permission
   * on a remembered folder where possible, otherwise the native folder
   * picker. Must be called directly from a user gesture (a click
   * handler), same requirement the browser places on the underlying
   * APIs themselves. */
  async pickWorkspacesRoot(): Promise<AppDirectoryHandle> {
    if (!SUPPORTS_FILE_SYSTEM_ACCESS) return getVirtualRoot();

    const stored = await getHandle<FileSystemDirectoryHandle>(WORKSPACES_ROOT_KEY);
    if (stored && (await requestReadWritePermission(stored))) {
      return stored;
    }

    const picked = await window.showDirectoryPicker({
      id: "litreview-workspaces-root",
      mode: "readwrite",
    });
    await setHandle(WORKSPACES_ROOT_KEY, picked);
    return picked;
  },

  /** Every workspace found directly inside `root` (most-recently-created
   * first), for the launcher's "open an existing one" list. */
  async listWorkspaces(root: AppDirectoryHandle): Promise<WorkspaceSummary[]> {
    return workspaceRepository.list(root);
  },

  /**
   * Creates a new workspace named `name` inside `parentHandle` (the
   * default root, unless the person used the "choose a different
   * location" escape hatch) and connects the storage client to it.
   */
  async createWorkspace(
    name: string,
    parentHandle: AppDirectoryHandle,
  ): Promise<WorkspaceInfo> {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error("Give the workspace a name first.");
    }
    return workspaceRepository.create(parentHandle, trimmed);
  },

  /** Opens a workspace whose folder handle is already known (the
   * launcher's list, or a summary from `listWorkspaces`) — no picker. */
  async openWorkspaceAt(dirHandle: AppDirectoryHandle): Promise<WorkspaceInfo> {
    return workspaceRepository.open(dirHandle);
  },

  /**
   * Escape hatch: prompts for an existing workspace folder anywhere
   * on disk, rather than picking from the default root's list. Only
   * meaningful with real disk access — resolves `null` (same as a
   * cancelled picker) on browsers without it; the launcher hides the
   * button that calls this there instead of relying on that fallback.
   * Returns null if the user cancelled the picker.
   */
  async openWorkspaceFromPicker(): Promise<WorkspaceInfo | null> {
    if (!SUPPORTS_FILE_SYSTEM_ACCESS) return null;
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
      return this.openWorkspaceAt(dirHandle);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return null;
      throw e;
    }
  },

  /**
   * Escape hatch: prompts for a parent folder anywhere on disk to
   * create a brand-new workspace inside, instead of the default root.
   * Same real-disk-only caveat as `openWorkspaceFromPicker`.
   * Returns null if the user cancelled the picker.
   */
  async createWorkspaceAtCustomLocation(name: string): Promise<WorkspaceInfo | null> {
    if (!SUPPORTS_FILE_SYSTEM_ACCESS) return null;
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error("Give the workspace a name first.");
    }
    try {
      const parentHandle = await window.showDirectoryPicker({ mode: "readwrite" });
      return this.createWorkspace(trimmed, parentHandle);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return null;
      throw e;
    }
  },

  /**
   * Deletes a workspace (folder, database, every imported PDF) from
   * `root` — the launcher's "×" button on a workspace list entry.
   * Irreversible; the UI layer is expected to confirm with the
   * researcher before calling this.
   */
  async deleteWorkspace(root: AppDirectoryHandle, name: string): Promise<void> {
    await workspaceRepository.remove(root, name);
  },

  /** The folder "Add Paper" last picked a PDF from in this workspace,
   * or null if nothing's been imported yet. Real-disk-only (see
   * `workspaceRepository`'s own doc comment on this pair) — the
   * Firefox/Safari file-picker fallback has no `startIn` concept to
   * feed, so this is simply never populated there. */
  async getLastImportDir(workspace: WorkspaceInfo): Promise<FileSystemDirectoryHandle | null> {
    return workspaceRepository.getLastImportDir(workspace.name);
  },

  /** Records the folder a PDF was just picked from, so the next
   * "Add Paper" opens there by default. */
  async setLastImportDir(
    workspace: WorkspaceInfo,
    dir: FileSystemDirectoryHandle,
  ): Promise<void> {
    return workspaceRepository.setLastImportDir(workspace.name, dir);
  },

  /** Closes the current workspace's database connection — called when
   * switching away from an open workspace. */
  async close(): Promise<void> {
    await storageClient.disconnect();
  },
};
