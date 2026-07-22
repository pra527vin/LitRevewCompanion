import { useEffect, useState } from "react";
import { workspaceService } from "../service";
import { WorkspaceInfo, WorkspaceSummary } from "../types";
import { ConfirmDialog } from "../../../shared/ConfirmDialog";
import { SUPPORTS_FILE_SYSTEM_ACCESS } from "../../../shared/browserSupport";
import type { AppDirectoryHandle } from "../../../shared/storageHandles";
import "./WorkspaceLauncher.css";

export interface WorkspaceLauncherProps {
  onWorkspaceReady: (workspace: WorkspaceInfo) => void;
}

/**
 * Post-Milestone-13 bugfix pass: the launcher used to open straight
 * into a folder-picker for both "create" and "open," with no way to
 * see what workspaces already existed short of remembering their
 * folder location yourself. It now loads a remembered workspaces root
 * on mount, lists whatever's already there so returning researchers
 * can jump straight back in, and creates new workspaces inside that
 * same root without asking — see workspaceService's own doc comment
 * for the reasoning, and this pass's bugfix log.
 *
 * Ported off Tauri to the browser's File System Access API: there's
 * no silent default folder anymore (the browser sandbox never grants
 * folder access without a picker). Unlike the old Rust version, the
 * picker (and even re-requesting permission on a remembered folder)
 * can only run inside a genuine user gesture — a mount effect can't
 * call it — so the very first launch (and any launch where permission
 * wasn't remembered) shows an explicit "choose a folder" prompt
 * instead of an automatic picker; every launch after that reuses the
 * remembered handle silently, no click needed.
 *
 * Post-removal-feature pass: each entry in "Your workspaces" now has
 * a "×" button so a workspace created by mistake (or no longer
 * needed) can be removed without leaving the app — see `handleRemove`.
 *
 * Cross-browser pass: on browsers without the File System Access API
 * (`!SUPPORTS_FILE_SYSTEM_ACCESS` — Firefox, Safari),
 * `workspaceService` transparently swaps in an IndexedDB-backed
 * virtual root (see `shared/virtualFs.ts`) for every method here — no
 * picker, no permission prompt, no "choose a folder" step, since none
 * of that applies to browser-profile storage. This component doesn't
 * need to know which backend is actually in use for any of that: it
 * already only ever calls `tryGetWorkspacesRoot`/`pickWorkspacesRoot`/
 * etc. through `workspaceService`. The one thing that genuinely has no
 * virtual equivalent — "open a workspace from another location," a
 * real folder somewhere else on disk — is hidden rather than left
 * clickable-but-broken; see `SUPPORTS_FILE_SYSTEM_ACCESS` below.
 */
export function WorkspaceLauncher({ onWorkspaceReady }: WorkspaceLauncherProps) {
  const [root, setRoot] = useState<AppDirectoryHandle | null>(null);
  const [needsRootPrompt, setNeedsRootPrompt] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<WorkspaceSummary | null>(null);

  async function loadWorkspaces(dirHandle: AppDirectoryHandle) {
    try {
      const found = await workspaceService.listWorkspaces(dirHandle);
      setWorkspaces(found);
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
      setWorkspaces([]);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await workspaceService.tryGetWorkspacesRoot();
      if (cancelled) return;
      if (!stored) {
        setNeedsRootPrompt(true);
        return;
      }
      setRoot(stored);
      await loadWorkspaces(stored);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Only ever called from the button below — `pickWorkspacesRoot`
   * needs a live user gesture to show a picker or permission prompt
   * (on browsers with the real API; the virtual root resolves
   * immediately regardless, so this still reads as "just works" on
   * the very first click there too). */
  async function handleChooseRoot() {
    setError(null);
    setBusy(true);
    try {
      const picked = await workspaceService.pickWorkspacesRoot();
      setNeedsRootPrompt(false);
      setRoot(picked);
      await loadWorkspaces(picked);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleOpen(dirHandle: AppDirectoryHandle) {
    setError(null);
    setBusy(true);
    try {
      const workspace = await workspaceService.openWorkspaceAt(dirHandle);
      onWorkspaceReady(workspace);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    if (!root) return;
    setError(null);
    setBusy(true);
    try {
      const workspace = await workspaceService.createWorkspace(name, root);
      onWorkspaceReady(workspace);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenFromPicker() {
    setError(null);
    setBusy(true);
    try {
      const workspace = await workspaceService.openWorkspaceFromPicker();
      if (workspace) onWorkspaceReady(workspace);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  /** The "×" on a workspace row — just queues the confirm dialog; the
   * actual delete happens in `confirmRemove` since it removes the
   * folder (database, every imported PDF) for good. */
  function handleRemove(e: React.MouseEvent, ws: WorkspaceSummary) {
    e.stopPropagation();
    setPendingRemove(ws);
  }

  async function confirmRemove() {
    if (!pendingRemove || !root) return;
    const ws = pendingRemove;
    setError(null);
    setBusy(true);
    try {
      await workspaceService.deleteWorkspace(root, ws.name);
      setWorkspaces((prev) => (prev ? prev.filter((w) => w.name !== ws.name) : prev));
      setPendingRemove(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const loadingList = !needsRootPrompt && workspaces === null && !listError;

  return (
    <div className="launcher">
      <div className="launcher__card">
        <h1 className="launcher__title">LitReview Companion</h1>
        <p className="launcher__subtitle">
          A deep reading environment for researchers.
        </p>

        {!SUPPORTS_FILE_SYSTEM_ACCESS && (
          <p className="launcher__hint">
            This browser doesn't support saving workspaces as real folders on
            disk, so they're kept in this browser's own storage instead —
            still private and local-only, just not visible outside the app or
            portable between browsers/devices the way a real folder is.
          </p>
        )}

        {needsRootPrompt ? (
          <div className="launcher__section">
            <p className="launcher__status">
              Choose a folder to keep your workspaces in. You won't be asked
              again on this browser.
            </p>
            <button
              className="launcher__button launcher__button--primary"
              onClick={handleChooseRoot}
              disabled={busy}
            >
              Choose folder…
            </button>
          </div>
        ) : (
          <>
            {loadingList && <p className="launcher__status">Looking for your workspaces…</p>}

            {workspaces && workspaces.length > 0 && (
              <div className="launcher__section">
                <span className="launcher__label">Your workspaces</span>
                <ul className="launcher__workspace-list">
                  {workspaces.map((ws) => (
                    <li key={ws.name} className="launcher__workspace-row">
                      <button
                        className="launcher__workspace"
                        onClick={() => handleOpen(ws.dirHandle)}
                        disabled={busy}
                      >
                        <span className="launcher__workspace-name">{ws.name}</span>
                        <span className="launcher__workspace-date">
                          {new Date(ws.createdAt).toLocaleDateString()}
                        </span>
                      </button>
                      <button
                        className="launcher__workspace-remove"
                        onClick={(e) => handleRemove(e, ws)}
                        disabled={busy}
                        title={`Delete "${ws.name}"`}
                        aria-label={`Delete "${ws.name}"`}
                      >
                        &times;
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="launcher__section">
              <label className="launcher__label" htmlFor="workspace-name">
                New workspace
              </label>
              <div className="launcher__row">
                <input
                  id="workspace-name"
                  className="launcher__input"
                  placeholder="e.g. Thesis Lit Review"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                  disabled={busy || !root}
                />
                <button
                  className="launcher__button launcher__button--primary"
                  onClick={handleCreate}
                  disabled={busy || !root || !name.trim()}
                >
                  Create
                </button>
              </div>
              {root && SUPPORTS_FILE_SYSTEM_ACCESS && (
                <p className="launcher__hint">Saved in "{root.name}"</p>
              )}
            </div>

            {SUPPORTS_FILE_SYSTEM_ACCESS && (
              <>
                <div className="launcher__divider">
                  <span>or</span>
                </div>

                <button
                  className="launcher__button launcher__button--secondary"
                  onClick={handleOpenFromPicker}
                  disabled={busy}
                >
                  Open a workspace from another location…
                </button>
              </>
            )}
          </>
        )}

        {(error || listError) && (
          <p className="launcher__error">{error || listError}</p>
        )}
      </div>

      {pendingRemove && (
        <ConfirmDialog
          title="Delete workspace?"
          message={`Delete "${pendingRemove.name}"? This removes its database and every imported PDF. This can't be undone.`}
          confirmLabel="Delete"
          busy={busy}
          onConfirm={confirmRemove}
          onCancel={() => setPendingRemove(null)}
        />
      )}
    </div>
  );
}
