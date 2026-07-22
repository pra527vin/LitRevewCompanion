// A workspace is a real folder on disk, reached via the File System
// Access API rather than an OS path string (the browser sandbox never
// exposes an absolute path — only a handle to the folder itself, plus
// its own name).
export interface WorkspaceInfo {
  dirHandle: FileSystemDirectoryHandle;
  name: string;
  createdAt: string;
  schemaVersion: number;
}

// The launcher's "existing workspaces" list — just enough to render
// and open (or remove) one.
export interface WorkspaceSummary {
  dirHandle: FileSystemDirectoryHandle;
  name: string;
  createdAt: string;
}
