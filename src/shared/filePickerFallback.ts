import type { AppFileHandle } from "./storageHandles";

/** Wraps an already-picked `File` as a read-only `AppFileHandle` —
 * `createWritable()` is never actually called on a file picked for
 * import (the only caller just reads bytes via `getFile()` to hash
 * and copy them into the workspace), so it throws rather than
 * pretending to support writing back to the researcher's original
 * file, which no picker (real or fallback) ever allows anyway. */
function wrapFileAsHandle(file: File): AppFileHandle {
  return {
    kind: "file",
    name: file.name,
    async getFile() {
      return file;
    },
    async createWritable() {
      throw new Error("This file can't be written to — it was only picked for reading.");
    },
  };
}

/**
 * The "Add Paper" file picker for browsers without `showOpenFilePicker`
 * (Firefox, Safari) — a plain, temporarily-inserted
 * `<input type="file" multiple>`, which every browser supports and
 * which needs no directory-handle concept at all: picking files from
 * the researcher's real disk to *import* was never a File System
 * Access API-only operation, only the "remember where I open this
 * workspace/write these files" part was.
 *
 * There's no reliable cross-browser "the picker was cancelled" event
 * for a bare file input, so this falls back to the standard trick:
 * once the window regains focus (the native dialog closing, either
 * way), wait a beat for a `change` event that would already be
 * in-flight if files *were* picked, and treat "still nothing" after
 * that as a cancel — resolving to an empty array, same shape
 * `prepareImports` already treats as "nothing to do."
 */
export function pickFilesViaInput(accept: string): Promise<AppFileHandle[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = accept;
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.appendChild(input);

    let settled = false;
    function finish(handles: AppFileHandle[]) {
      if (settled) return;
      settled = true;
      window.removeEventListener("focus", handleFocus);
      input.remove();
      resolve(handles);
    }

    input.addEventListener(
      "change",
      () => {
        const files = Array.from(input.files ?? []);
        finish(files.map(wrapFileAsHandle));
      },
      { once: true },
    );

    function handleFocus() {
      window.removeEventListener("focus", handleFocus);
      // A genuine selection's `change` event fires before/around this
      // same focus-return; give it a moment to land before concluding
      // the picker was cancelled with nothing chosen.
      setTimeout(() => finish([]), 300);
    }
    window.addEventListener("focus", handleFocus);

    input.click();
  });
}
