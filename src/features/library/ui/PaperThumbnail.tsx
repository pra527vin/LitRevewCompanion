import { useEffect, useRef, useState } from "react";
import { renderThumbnail } from "../../../shared/pdfThumbnail";
import { libraryService } from "../service";
import type { Paper } from "../types";
import type { WorkspaceInfo } from "../../workspace";
import "./PaperThumbnail.css";

export type ThumbnailSource =
  | { kind: "buffer"; buffer: ArrayBuffer }
  | { kind: "paper"; workspace: WorkspaceInfo; paper: Paper };

export interface PaperThumbnailProps {
  source: ThumbnailSource;
  className?: string;
}

function DocumentIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M6 2h8l5 5v15a1 1 0 01-1 1H6a1 1 0 01-1-1V3a1 1 0 011-1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path d="M14 2v5h5" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

/**
 * A small first-page preview — used both in the "Add Paper" review
 * step (`kind: "buffer"`, rendered live from a picked file's
 * in-memory bytes, before anything's written to disk) and the library
 * sidebar's listing (`kind: "paper"` — loads a cached thumbnail from
 * the workspace's `thumbnails/` folder, or renders and caches one on
 * first use for a paper imported before this feature existed).
 *
 * Shows a placeholder document glyph while loading or if rendering
 * fails outright — a broken thumbnail is a cosmetic gap, never
 * something that should block the surrounding list or dialog.
 */
export function PaperThumbnail({ source, className }: PaperThumbnailProps) {
  const [url, setUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);

    async function run() {
      try {
        let blob: Blob;
        if (source.kind === "buffer") {
          blob = await renderThumbnail(new Uint8Array(source.buffer));
        } else {
          const { workspace, paper } = source;
          const cached = await libraryService.loadThumbnailBlob(workspace, paper.fileHash);
          if (cached) {
            blob = cached;
          } else {
            const bytes = await libraryService.readPaperBytes(workspace, paper);
            blob = await renderThumbnail(new Uint8Array(bytes));
            libraryService.saveThumbnail(workspace, paper.fileHash, blob).catch(() => {
              // Best-effort cache write — a failure here just means
              // this same render happens again next time.
            });
          }
        }
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(blob);
        urlRef.current = objectUrl;
        setUrl(objectUrl);
      } catch {
        // Left as null — the placeholder glyph renders below.
      }
    }
    run();

    return () => {
      cancelled = true;
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
    // Re-render whenever the identity of what's being rendered changes
    // — the buffer's own reference for a pending import, or the
    // paper's content hash for a cataloged one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.kind === "buffer" ? source.buffer : source.paper.fileHash]);

  return (
    <div className={"paper-thumbnail" + (className ? ` ${className}` : "")}>
      {url ? (
        <img src={url} alt="" className="paper-thumbnail__image" />
      ) : (
        <div className="paper-thumbnail__placeholder">
          <DocumentIcon />
        </div>
      )}
    </div>
  );
}
