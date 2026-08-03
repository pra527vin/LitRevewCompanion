import { paperRepository } from "./repository";
import { categoryRepository } from "./categoryRepository";
import { tagRepository } from "./tagRepository";
import { Paper, Category, Tag, MetadataUpdate, DoiMetadata } from "./types";
// One-way dependency on workspace (workspace doesn't import library) —
// "Add Paper" remembering its last folder is workspace_meta state,
// which workspace already owns; see workspaceService.getLastImportDir.
import { workspaceService, WorkspaceInfo } from "../workspace";
import type { AppFileHandle } from "../../shared/storageHandles";
import { SUPPORTS_FILE_SYSTEM_ACCESS } from "../../shared/browserSupport";
import { pickFilesViaInput } from "../../shared/filePickerFallback";

/** A picked-and-hashed PDF that hasn't been written into the workspace
 * yet — held in memory between `prepareImports` (pick + dedupe check)
 * and `finalizeImports` (write + catalog) so the researcher can review
 * and edit each one first. `defaultTitle` is what's used if the review
 * step's title field is left untouched or blanked out. */
export interface PendingImport {
  tempId: string;
  fileHash: string;
  buffer: ArrayBuffer;
  defaultTitle: string;
}

export type PrepareImportsResult =
  | { status: "cancelled" }
  | { status: "ready"; pending: PendingImport[]; duplicates: Paper[] };

/** The review step's edits for one pending file — title/category/basic
 * bio metadata, filled in optionally before the paper is actually
 * saved. `doi`/`url` are set by the review dialog's DOI-or-URL lookup
 * (same `lookupCitation` the Notebook's Metadata section uses
 * post-import) rather than typed by hand — a paper imported with a
 * resolved DOI doesn't need that lookup run a second time later. */
export interface ImportReviewEntry {
  tempId: string;
  title: string;
  authors: string[];
  journal: string | null;
  year: number | null;
  categoryId: string | null;
  doi: string | null;
  url: string | null;
}

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Business logic for "Add Paper" (Design_Decisions.md → Paper
 * Import): pick PDF(s), hash each, check for a duplicate *before*
 * copying (dedup by file hash), let the researcher review/edit title,
 * category, and basic metadata, then copy the new ones into the
 * workspace and catalog them. The UI layer calls `prepareImports`,
 * renders a review step over its `pending` list, then calls
 * `finalizeImports` with whatever was edited.
 *
 * Ported off Tauri: the file picker, hashing, and copy all run
 * directly in the browser now (File System Access API +
 * `crypto.subtle`) instead of round-tripping through Rust commands.
 */
export const libraryService = {
  /**
   * Picks one or more PDFs in a single dialog, hashes each, and splits
   * them into ones already in the library (`duplicates`, reported
   * immediately — nothing to review on a file that's already
   * cataloged) and new ones (`pending`, awaiting review before
   * they're actually written anywhere).
   */
  async prepareImports(workspace: WorkspaceInfo): Promise<PrepareImportsResult> {
    let handles: AppFileHandle[];
    if (SUPPORTS_FILE_SYSTEM_ACCESS) {
      const lastDir = await workspaceService.getLastImportDir(workspace).catch(() => null);
      try {
        handles = await window.showOpenFilePicker({
          multiple: true,
          excludeAcceptAllOption: true,
          types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }],
          startIn: lastDir ?? undefined,
        });
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          return { status: "cancelled" };
        }
        throw e;
      }
    } else {
      // Picking files from the researcher's real disk to *import* was
      // never File-System-Access-only — only remembering where to open
      // the picker next time was (see workspaceService.getLastImportDir's
      // own doc comment on why that's skipped here entirely).
      handles = await pickFilesViaInput("application/pdf");
      if (handles.length === 0) {
        return { status: "cancelled" };
      }
    }

    const pending: PendingImport[] = [];
    const duplicates: Paper[] = [];
    for (const selected of handles) {
      const file = await selected.getFile();
      const buffer = await file.arrayBuffer();
      const fileHash = await sha256Hex(buffer);

      const existing = await paperRepository.findByHash(fileHash);
      if (existing) {
        duplicates.push(existing);
        continue;
      }

      pending.push({
        tempId: crypto.randomUUID(),
        fileHash,
        buffer,
        defaultTitle: file.name.replace(/\.pdf$/i, ""),
      });
    }
    return { status: "ready", pending, duplicates };
  },

  /**
   * Writes each reviewed pending import into the workspace's `papers/`
   * folder and catalogs it. `entries` doesn't need to cover every item
   * in `pending` in principle, but the review UI always submits one
   * entry per pending item — an item with no matching entry is
   * skipped defensively rather than guessing at defaults for it.
   */
  async finalizeImports(
    workspace: WorkspaceInfo,
    pending: PendingImport[],
    entries: ImportReviewEntry[],
  ): Promise<Paper[]> {
    const entryByTempId = new Map(entries.map((e) => [e.tempId, e]));
    const results: Paper[] = [];

    for (const item of pending) {
      const entry = entryByTempId.get(item.tempId);
      if (!entry) continue;

      const papersDir = await workspace.dirHandle.getDirectoryHandle("papers", { create: true });
      const relativePath = `papers/${item.fileHash}.pdf`;
      const destHandle = await papersDir.getFileHandle(`${item.fileHash}.pdf`, { create: true });
      const writable = await destHandle.createWritable();
      await writable.write(item.buffer);
      await writable.close();

      const paper: Paper = {
        id: crypto.randomUUID(),
        title: entry.title.trim() || item.defaultTitle,
        authors: entry.authors.length > 0 ? entry.authors : null,
        doi: entry.doi,
        journal: entry.journal,
        year: entry.year,
        sourceType: null,
        url: entry.url,
        filePath: relativePath,
        fileHash: item.fileHash,
        pageCount: null,
        addedAt: new Date().toISOString(),
        lastOpenedAt: null,
        categoryId: entry.categoryId,
        categoryName: null,
        tags: [],
        sortOrder: null,
      };

      await paperRepository.insert(paper);
      results.push(paper);
    }
    return results;
  },

  async listPapers(): Promise<Paper[]> {
    return paperRepository.listAll();
  },

  async listCategories(): Promise<Category[]> {
    return categoryRepository.listAll();
  },

  /** Looks up a category by name, creating it the first time it's
   * used — the review step's "new category" input calls this. */
  async createCategory(name: string): Promise<Category> {
    return categoryRepository.getOrCreate(name);
  },

  /** Renames a category — the Settings page's "click to rename" action. */
  async renameCategory(id: string, name: string): Promise<Category> {
    return categoryRepository.rename(id, name);
  },

  /** Deletes a category — the Settings page's "×" action. Papers using
   * it just lose the tag; nothing else about them changes. */
  async deleteCategory(id: string): Promise<void> {
    return categoryRepository.remove(id);
  },

  /**
   * Removes a paper for good — its catalog row (and every note,
   * excerpt, and reading-position row scoped to it) plus the copied
   * PDF in `papers/`. For when the wrong file got imported. File
   * removal is best-effort: if the PDF is already gone from disk,
   * that shouldn't block clearing the catalog entry.
   */
  async deletePaper(workspace: WorkspaceInfo, paper: Paper): Promise<void> {
    try {
      const papersDir = await workspace.dirHandle.getDirectoryHandle("papers");
      const fileName = paper.filePath.split("/").pop() ?? `${paper.fileHash}.pdf`;
      await papersDir.removeEntry(fileName);
    } catch {
      // Already missing, or the papers/ folder itself is gone — the
      // catalog cleanup below is what actually matters.
    }
    await paperRepository.deleteById(paper.id);
  },

  /**
   * Bulk delete (Library sidebar's multi-select) — same removal as
   * `deletePaper`, one at a time so a single failure (a locked file,
   * say) doesn't abort the rest of the batch. Returns which ids
   * actually got removed, since the caller needs that to clean up
   * `activePaper`/"recently studied" state for exactly those and no
   * others.
   */
  async deletePapers(
    workspace: WorkspaceInfo,
    papers: Paper[],
  ): Promise<{ succeeded: string[]; failed: Paper[] }> {
    const succeeded: string[] = [];
    const failed: Paper[] = [];
    for (const paper of papers) {
      try {
        await libraryService.deletePaper(workspace, paper);
        succeeded.push(paper.id);
      } catch {
        failed.push(paper);
      }
    }
    return { succeeded, failed };
  },

  /** Assigns or clears (`null`) a paper's category — the Library
   * sidebar's per-row category picker, so a paper imported without
   * one (or filed under the wrong one) can be categorized later
   * instead of only during "Add Paper" review. */
  async updateCategory(paperId: string, categoryId: string | null): Promise<void> {
    await paperRepository.updateCategory(paperId, categoryId);
  },

  /** Persists a manual drag-to-reorder — see `paperRepository.reorder`. */
  async reorderPapers(paperIdsInOrder: string[]): Promise<void> {
    await paperRepository.reorder(paperIdsInOrder);
  },

  /** Every tag defined in this workspace — the Library sidebar's tag
   * popover offers these plus a "new tag" input, and Settings' Tags
   * section lists/manages the same set. */
  async listTags(): Promise<Tag[]> {
    return tagRepository.listAll();
  },

  /** Creates a tag by name (or returns the existing one), without
   * assigning it to any paper yet — Settings' "add a tag" input,
   * where there's no paper in scope. */
  async createTag(name: string): Promise<Tag> {
    return tagRepository.getOrCreate(name);
  },

  /** Renames a tag — Settings' "click to rename" action. Every paper
   * carrying it picks up the new name automatically. */
  async renameTag(id: string, name: string): Promise<Tag> {
    return tagRepository.rename(id, name);
  },

  /** Deletes a tag outright — Settings' "×" action. Papers carrying it
   * just lose that one marker, nothing else about them changes. */
  async deleteTag(id: string): Promise<void> {
    return tagRepository.remove(id);
  },

  /** Assigns a tag to a paper, creating the tag by name the first
   * time it's used — the tag popover's chips and "new tag" input, and
   * the bulk "Tag Selected" action, all call this. */
  async addTagToPaper(paperId: string, tagName: string): Promise<Tag> {
    const tag = await tagRepository.getOrCreate(tagName);
    await tagRepository.addToPaper(paperId, tag.id);
    return tag;
  },

  /** Unassigns a tag from a paper — the tag itself still exists for
   * other papers (or to be picked again on this one) unless removed
   * separately. */
  async removeTagFromPaper(paperId: string, tagId: string): Promise<void> {
    await tagRepository.removeFromPaper(paperId, tagId);
  },

  /**
   * Saves a rendered thumbnail (see `../../shared/pdfThumbnail`'s
   * `renderThumbnail`, called from the UI layer — this feature has no
   * pdf.js dependency of its own) into the workspace's `thumbnails/`
   * folder, content-addressed by the same file hash `papers/` uses.
   * Best-effort by convention at the call site: a failed thumbnail
   * write shouldn't block an import or break the listing, just leave
   * that one paper showing a placeholder.
   */
  async saveThumbnail(workspace: WorkspaceInfo, fileHash: string, blob: Blob): Promise<void> {
    const dir = await workspace.dirHandle.getDirectoryHandle("thumbnails", { create: true });
    const handle = await dir.getFileHandle(`${fileHash}.png`, { create: true });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  },

  /** Returns the cached thumbnail for a paper, or null if none has
   * been generated yet — the caller (PaperThumbnail) falls back to
   * rendering one from the PDF itself and saving it via
   * `saveThumbnail` for next time. */
  async loadThumbnailBlob(workspace: WorkspaceInfo, fileHash: string): Promise<Blob | null> {
    try {
      const dir = await workspace.dirHandle.getDirectoryHandle("thumbnails");
      const handle = await dir.getFileHandle(`${fileHash}.png`);
      return await handle.getFile();
    } catch {
      return null;
    }
  },

  /** Reads a cataloged paper's PDF bytes straight from `papers/` —
   * what PaperThumbnail falls back to reading when there's no cached
   * thumbnail yet, so it has something to render from. */
  async readPaperBytes(workspace: WorkspaceInfo, paper: Paper): Promise<ArrayBuffer> {
    const papersDir = await workspace.dirHandle.getDirectoryHandle("papers");
    const fileName = paper.filePath.split("/").pop() ?? `${paper.fileHash}.pdf`;
    const fileHandle = await papersDir.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return file.arrayBuffer();
  },

  /** A cataloged paper's PDF as a `File` — what the Library sidebar's
   * download button hands to `downloadBlob` to save a copy onto the
   * researcher's real disk. Works the same on both storage backends
   * (real File System Access API or the Firefox/Safari IndexedDB
   * virtual filesystem), since both just need to produce a `File`. */
  async getPaperFile(workspace: WorkspaceInfo, paper: Paper): Promise<File> {
    const papersDir = await workspace.dirHandle.getDirectoryHandle("papers");
    const fileName = paper.filePath.split("/").pop() ?? `${paper.fileHash}.pdf`;
    const fileHandle = await papersDir.getFileHandle(fileName);
    return fileHandle.getFile();
  },

  /**
   * Milestone 12 — Search. Empty/whitespace-only queries return no
   * results rather than falling through to a `LIKE '%%'` (which
   * would just be `listPapers` again under a confusing name) — the
   * UI layer treats an empty query as "nothing searched yet," not
   * "show everything."
   */
  async searchPapers(query: string): Promise<Paper[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    return paperRepository.search(trimmed);
  },

  /**
   * Looks up bibliographic metadata for a DOI or a URL directly from
   * the browser (Crossref for a DOI; a `fetch` + citation-meta-tag
   * scrape for a URL — see `fetchByUrl`'s doc comment). Doesn't touch
   * the DB itself — the caller decides whether/how to apply the
   * result via `updateMetadata`.
   */
  async lookupCitation(input: string): Promise<DoiMetadata> {
    const trimmed = input.trim();
    if (!trimmed) {
      throw new Error("Enter a DOI or a URL first.");
    }
    if (looksLikeUrl(trimmed)) {
      return fetchByUrl(trimmed);
    }
    const doi = extractDoi(trimmed) ?? trimmed;
    return fetchByDoi(doi);
  },

  /**
   * Updates a paper's catalog fields — manual edits or an applied DOI
   * lookup both go through here.
   */
  async updateMetadata(paperId: string, metadata: MetadataUpdate): Promise<void> {
    await paperRepository.updateMetadata(paperId, metadata);
  },
};

function looksLikeUrl(input: string): boolean {
  return input.startsWith("http://") || input.startsWith("https://");
}

/**
 * Pulls a DOI out of free-form input — a bare DOI ("10.1177/..."), or
 * one embedded in a pasted link ("https://doi.org/10.1177/..."). DOIs
 * always start with "10." by construction (the registrant prefix), so
 * this just looks for that and takes the rest, trimming anything a
 * URL would have tacked on after it.
 */
function extractDoi(input: string): string | null {
  const idx = input.indexOf("10.");
  if (idx === -1) return null;
  const candidate = input.slice(idx).replace(/[/\s]+$/, "");
  return candidate.length > 3 ? candidate : null;
}

/**
 * Looks up bibliographic metadata for a DOI via the Crossref REST API
 * (https://api.crossref.org/works/{doi}) — a free, public,
 * no-auth-required registry covering most academic DOIs, reachable
 * directly from the browser (Crossref's API sends CORS headers).
 */
async function fetchByDoi(doi: string): Promise<DoiMetadata> {
  const trimmed = doi.trim();
  if (!trimmed) throw new Error("DOI can't be empty.");

  let response: Response;
  try {
    response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(trimmed)}`);
  } catch (e) {
    throw new Error(`Network request failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!response.ok) {
    throw new Error(`DOI lookup failed (${response.status}). Check the DOI and try again.`);
  }

  const body = await response.json();
  const message = body?.message;
  if (!message) throw new Error("Unexpected response from Crossref.");

  const title: string | null = Array.isArray(message.title) ? message.title[0] ?? null : null;

  const authors: string[] = Array.isArray(message.author)
    ? message.author
        .map((entry: { given?: string; family?: string }) =>
          [entry.given, entry.family].filter(Boolean).join(" ").trim(),
        )
        .filter((name: string) => name.length > 0)
    : [];

  const journal: string | null = Array.isArray(message["container-title"])
    ? message["container-title"][0] ?? null
    : null;

  // Crossref records the publication date under different keys
  // depending on the venue type — check them in order of preference.
  let year: number | null = null;
  for (const key of ["published-print", "published-online", "published", "issued"]) {
    const y = message[key]?.["date-parts"]?.[0]?.[0];
    if (typeof y === "number") {
      year = y;
      break;
    }
  }

  return { doi: trimmed, title, authors, journal, year, url: null };
}

/**
 * Fetches a webpage and scrapes citation metadata off it — the
 * counterpart to `fetchByDoi` for citable sources that don't have one
 * (government reports, working papers, other web-published
 * documents). Scholarly repository pages commonly emit Highwire
 * Press-style `citation_*` meta tags for exactly this purpose (Google
 * Scholar indexes off the same tags), so this tries those first. If
 * the page also names its own DOI via `citation_doi`, that's resolved
 * through Crossref instead for a fuller record.
 *
 * Unlike the old Rust version, this runs as a plain browser `fetch` —
 * there's no backend to proxy through, so it only works against sites
 * that send CORS headers permitting a cross-origin read. Most
 * ordinary websites don't, so this will often fail; that's surfaced
 * as a normal error asking the researcher to enter details manually,
 * not a crash.
 */
async function fetchByUrl(url: string): Promise<DoiMetadata> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error(
      "Couldn't reach that page from the browser — many sites block cross-origin " +
        "requests like this one. You can still enter the details manually below.",
    );
  }

  if (!response.ok) {
    throw new Error(`Couldn't reach that page (${response.status}).`);
  }

  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, "text/html");

  function meta(name: string): string | null {
    const el = doc.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
    const content = el?.getAttribute("content")?.trim();
    return content || null;
  }

  function metaAll(name: string): string[] {
    return Array.from(doc.querySelectorAll(`meta[name="${name}"], meta[property="${name}"]`))
      .map((el) => el.getAttribute("content")?.trim())
      .filter((v): v is string => Boolean(v));
  }

  function extractYear(dateStr: string): number | null {
    const match = dateStr.match(/\d{4}/);
    return match ? Number(match[0]) : null;
  }

  const doi = meta("citation_doi");
  if (doi) {
    try {
      const resolved = await fetchByDoi(doi);
      return { ...resolved, url };
    } catch {
      // Page claimed a DOI but Crossref didn't have it — fall through
      // to reading the citation_* tags directly.
    }
  }

  const title = meta("citation_title") ?? meta("og:title");
  const authors = metaAll("citation_author");
  const journal =
    meta("citation_journal_title") ??
    meta("citation_technical_report_institution") ??
    meta("citation_publisher") ??
    meta("og:site_name");
  const dateStr = meta("citation_publication_date") ?? meta("citation_date");
  const year = dateStr ? extractYear(dateStr) : null;

  if (!title && authors.length === 0 && !journal && !year) {
    throw new Error(
      "Couldn't find citation details on that page — this site may not publish them. " +
        "You can still enter them manually below.",
    );
  }

  return { doi: null, title, authors, journal, year, url };
}
