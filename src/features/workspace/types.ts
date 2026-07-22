import type { AppDirectoryHandle } from "../../shared/storageHandles";

// A workspace is a real folder on disk, reached via the File System
// Access API, in Chromium-based browsers — or an IndexedDB-backed
// virtual folder (see `shared/virtualFs.ts`) in browsers that never
// implemented that API (Firefox, Safari). `dirHandle` is typed against
// the narrow `AppDirectoryHandle` shape both backends satisfy, not the
// full DOM interface, precisely so the rest of this app never needs to
// know or care which one it's actually holding.
export interface WorkspaceInfo {
  dirHandle: AppDirectoryHandle;
  name: string;
  createdAt: string;
  schemaVersion: number;
}

// The launcher's "existing workspaces" list — just enough to render
// and open (or remove) one.
export interface WorkspaceSummary {
  dirHandle: AppDirectoryHandle;
  name: string;
  createdAt: string;
}
