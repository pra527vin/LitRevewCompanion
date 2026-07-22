import { useState } from "react";
import type { PendingImport, ImportReviewEntry } from "../service";
import type { Category, DoiMetadata } from "../types";
import { PaperThumbnail } from "./PaperThumbnail";
import "./ImportReviewDialog.css";

export interface ImportReviewDialogProps {
  pending: PendingImport[];
  categories: Category[];
  busy: boolean;
  error: string | null;
  onCreateCategory: (name: string) => Promise<Category>;
  /** Same DOI-or-URL lookup the Notebook's Metadata section uses
   * post-import (Crossref for a DOI, a citation-meta-tag scrape for a
   * URL) — run here instead so title/authors/journal/year (and the
   * DOI itself) can be filled in automatically before the paper is
   * ever saved. */
  onLookupCitation: (query: string) => Promise<DoiMetadata>;
  onCancel: () => void;
  onConfirm: (entries: ImportReviewEntry[]) => void;
}

interface RowState {
  title: string;
  authorsText: string;
  journal: string;
  year: string;
  categoryId: string | null;
  doi: string | null;
  url: string | null;
  lookupInput: string;
  lookingUp: boolean;
  lookupError: string | null;
}

function initialRows(pending: PendingImport[]): Record<string, RowState> {
  return Object.fromEntries(
    pending.map((p) => [
      p.tempId,
      {
        title: p.defaultTitle,
        authorsText: "",
        journal: "",
        year: "",
        categoryId: null,
        doi: null,
        url: null,
        lookupInput: "",
        lookingUp: false,
        lookupError: null,
      },
    ]),
  );
}

/**
 * The "Add Paper" review step (Milestone 14b — Categorization, 14c —
 * DOI auto-fill): shown after PDFs are picked and deduped but before
 * anything's written into the workspace, so a wrong file, a bad
 * rename, or a wrong category pick can be corrected here rather than
 * after the fact. Pasting a DOI or URL into a row's lookup box and
 * running it fills title/authors/journal/year (and stores the
 * resolved DOI/URL) straight from Crossref/the page's citation
 * metadata — the same lookup the Notebook's Metadata section runs
 * post-import, just run here instead so it doesn't need repeating
 * later. Everything is still editable by hand afterward, and leaving
 * a title blank falls back to the file's own name (`defaultTitle`),
 * handled by `libraryService.finalizeImports`.
 */
export function ImportReviewDialog({
  pending,
  categories,
  busy,
  error,
  onCreateCategory,
  onLookupCitation,
  onCancel,
  onConfirm,
}: ImportReviewDialogProps) {
  const [rows, setRows] = useState<Record<string, RowState>>(() => initialRows(pending));
  const [categoryList, setCategoryList] = useState(categories);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  function patchRow(tempId: string, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [tempId]: { ...prev[tempId], ...patch } }));
  }

  async function handleAddCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    setAddingCategory(true);
    setCategoryError(null);
    try {
      const created = await onCreateCategory(name);
      setCategoryList((prev) =>
        prev.some((c) => c.id === created.id)
          ? prev
          : [...prev, created].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setNewCategoryName("");
    } catch (e) {
      setCategoryError(e instanceof Error ? e.message : String(e));
    } finally {
      setAddingCategory(false);
    }
  }

  async function handleLookup(tempId: string) {
    const query = rows[tempId].lookupInput.trim();
    if (!query) {
      patchRow(tempId, { lookupError: "Enter a DOI or a URL first." });
      return;
    }
    patchRow(tempId, { lookingUp: true, lookupError: null });
    try {
      const metadata = await onLookupCitation(query);
      setRows((prev) => {
        const current = prev[tempId];
        return {
          ...prev,
          [tempId]: {
            ...current,
            title: metadata.title || current.title,
            authorsText:
              metadata.authors.length > 0 ? metadata.authors.join(", ") : current.authorsText,
            journal: metadata.journal ?? current.journal,
            year: metadata.year != null ? String(metadata.year) : current.year,
            doi: metadata.doi,
            url: metadata.url,
            lookingUp: false,
          },
        };
      });
    } catch (e) {
      patchRow(tempId, {
        lookingUp: false,
        lookupError: e instanceof Error ? e.message : String(e),
      });
    }
  }

  function handleConfirm() {
    const entries: ImportReviewEntry[] = pending.map((p) => {
      const row = rows[p.tempId];
      const yearNum = row.year.trim() ? Number(row.year.trim()) : NaN;
      return {
        tempId: p.tempId,
        title: row.title,
        authors: row.authorsText
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
        journal: row.journal.trim() || null,
        year: Number.isNaN(yearNum) ? null : yearNum,
        categoryId: row.categoryId,
        doi: row.doi,
        url: row.url,
      };
    });
    onConfirm(entries);
  }

  return (
    <div className="import-review__backdrop">
      <div className="import-review" role="dialog" aria-label="Review new papers">
        <header className="import-review__header">
          <h2>
            Review {pending.length} new {pending.length === 1 ? "paper" : "papers"}
          </h2>
        </header>

        <div className="import-review__new-category">
          <span className="import-review__label">New category</span>
          <div className="import-review__new-category-row">
            <input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
              placeholder="e.g. Methodology"
              disabled={busy || addingCategory}
            />
            <button
              type="button"
              onClick={handleAddCategory}
              disabled={busy || addingCategory || !newCategoryName.trim()}
            >
              {addingCategory ? "Adding…" : "Add"}
            </button>
          </div>
          {categoryError && <p className="import-review__error">{categoryError}</p>}
        </div>

        <div className="import-review__list">
          {pending.map((p) => {
            const row = rows[p.tempId];
            return (
              <div key={p.tempId} className="import-review__item">
                <PaperThumbnail
                  source={{ kind: "buffer", buffer: p.buffer }}
                  className="import-review__item-thumb"
                />

                <div className="import-review__item-fields">
                <label className="import-review__field import-review__field--title">
                  <span>Title</span>
                  <input
                    value={row.title}
                    onChange={(e) => patchRow(p.tempId, { title: e.target.value })}
                    placeholder={p.defaultTitle}
                    disabled={busy}
                  />
                </label>

                <div className="import-review__field import-review__field--lookup">
                  <span>Look Up (DOI or URL)</span>
                  <div className="import-review__lookup-row">
                    <input
                      value={row.lookupInput}
                      onChange={(e) => patchRow(p.tempId, { lookupInput: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && handleLookup(p.tempId)}
                      placeholder="10.xxxx/xxxxx or https://…"
                      disabled={busy || row.lookingUp}
                    />
                    <button
                      type="button"
                      onClick={() => handleLookup(p.tempId)}
                      disabled={busy || row.lookingUp}
                    >
                      {row.lookingUp ? "Looking up…" : "Look Up"}
                    </button>
                  </div>
                  {row.doi && !row.lookupError && (
                    <p className="import-review__lookup-status">
                      Metadata filled in from DOI {row.doi}.
                    </p>
                  )}
                  {row.lookupError && (
                    <p className="import-review__error">{row.lookupError}</p>
                  )}
                </div>

                <label className="import-review__field">
                  <span>Category</span>
                  <select
                    value={row.categoryId ?? ""}
                    onChange={(e) => patchRow(p.tempId, { categoryId: e.target.value || null })}
                    disabled={busy}
                  >
                    <option value="">No category</option>
                    {categoryList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="import-review__field">
                  <span>Authors</span>
                  <input
                    value={row.authorsText}
                    onChange={(e) => patchRow(p.tempId, { authorsText: e.target.value })}
                    placeholder="Comma-separated (optional)"
                    disabled={busy}
                  />
                </label>
                <label className="import-review__field">
                  <span>Journal / Publisher</span>
                  <input
                    value={row.journal}
                    onChange={(e) => patchRow(p.tempId, { journal: e.target.value })}
                    placeholder="Optional"
                    disabled={busy}
                  />
                </label>
                <label className="import-review__field import-review__field--year">
                  <span>Year</span>
                  <input
                    value={row.year}
                    onChange={(e) => patchRow(p.tempId, { year: e.target.value })}
                    inputMode="numeric"
                    placeholder="Optional"
                    disabled={busy}
                  />
                </label>
                </div>
              </div>
            );
          })}
        </div>

        {error && <p className="import-review__error">{error}</p>}

        <div className="import-review__actions">
          <button
            type="button"
            className="import-review__cancel"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="import-review__confirm"
            onClick={handleConfirm}
            disabled={busy}
          >
            {busy ? "Saving…" : `Save ${pending.length === 1 ? "paper" : `${pending.length} papers`}`}
          </button>
        </div>
      </div>
    </div>
  );
}
