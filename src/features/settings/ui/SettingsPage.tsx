import { useEffect, useState } from "react";
import { libraryService, Category, Tag } from "../../library";
import { BreakSchedulerSettings } from "../../break-scheduler";
import { ThemePreference, THEME_PREFERENCE_LABELS } from "../types";
import { ConfirmDialog } from "../../../shared/ConfirmDialog";
import "./SettingsPage.css";

export interface SettingsPageProps {
  themePreference: ThemePreference;
  onThemeChange: (preference: ThemePreference) => void;
  /** Named `onClose` rather than e.g. `onDone` — it's what every other
   * panel in this app calls the callback that leaves it, even though
   * this one isn't a panel, so App.tsx's wiring reads the same way
   * everywhere. */
  onClose: () => void;
}

type SettingsSection = "appearance" | "categories" | "tags" | "breaks";

const SECTIONS: { id: SettingsSection; label: string }[] = [
  { id: "appearance", label: "Appearance" },
  { id: "categories", label: "Categories" },
  { id: "tags", label: "Tags" },
  { id: "breaks", label: "Break Reminders" },
];

const THEME_OPTIONS: ThemePreference[] = ["system", "light", "dark"];

/**
 * Settings (Milestone 15, page redesign): a real page swapped in for
 * `MainLayout`/`StatusBar` in the app shell — see App.tsx — rather
 * than a modal over the reader, with its own sidebar for sections.
 * Four so far: Appearance (light/dark/system — the Toolbar's icon
 * toggle reads/writes the same `themeService`, so the two can never
 * disagree), Categories (add one, click one to rename — the fixed,
 * one-per-paper list assigned at upload), Tags (add one, click one to
 * rename — the free-form, many-per-paper markers assigned from the
 * Library sidebar's per-row tag menu), and Break Reminders (the
 * wellbeing scheduler, which used to be its own "Take a Break"
 * toolbar page — it's a handful of set-once preferences, which is
 * what this page is for; the Refreshment page took over the "actually
 * spend the break" half).
 */
export function SettingsPage({ themePreference, onThemeChange, onClose }: SettingsPageProps) {
  const [section, setSection] = useState<SettingsSection>("appearance");

  return (
    <div className="settings-page">
      <aside className="settings-page__sidebar">
        <h2 className="settings-page__title">Settings</h2>
        <nav className="settings-page__nav" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={
                "settings-page__nav-item" +
                (section === s.id ? " settings-page__nav-item--active" : "")
              }
              onClick={() => setSection(s.id)}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <button type="button" className="settings-page__done" onClick={onClose}>
          Done
        </button>
      </aside>

      <div className="settings-page__content">
        {section === "appearance" && (
          <AppearanceSection themePreference={themePreference} onThemeChange={onThemeChange} />
        )}
        {section === "categories" && <CategoriesSection />}
        {section === "tags" && <TagsSection />}
        {section === "breaks" && <BreaksSection />}
      </div>
    </div>
  );
}

/** Break Reminders — the wellbeing scheduler. Just the section
 * heading here; everything inside it (and the timers it drives) is
 * the `break-scheduler` feature's own, see `BreakSchedulerSettings`. */
function BreaksSection() {
  return (
    <section className="settings-page__section">
      <h3>Break Reminders</h3>
      <p className="settings-page__section-hint">
        Gentle nudges while you read — they appear wherever you are in the app and keep
        running until you pause them here. Looking for somewhere to actually spend the
        break? That's the Refreshment page.
      </p>
      <BreakSchedulerSettings />
    </section>
  );
}

function AppearanceSection({
  themePreference,
  onThemeChange,
}: {
  themePreference: ThemePreference;
  onThemeChange: (preference: ThemePreference) => void;
}) {
  return (
    <section className="settings-page__section">
      <h3>Appearance</h3>
      <p className="settings-page__section-hint">
        "System" follows your OS's light/dark setting automatically; the Toolbar's icon
        button also toggles this, always to an explicit Light or Dark.
      </p>
      <div
        className="settings-page__theme-options"
        role="radiogroup"
        aria-label="Appearance"
      >
        {THEME_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={themePreference === option}
            className={
              "settings-page__theme-option" +
              (themePreference === option ? " settings-page__theme-option--active" : "")
            }
            onClick={() => onThemeChange(option)}
          >
            {THEME_PREFERENCE_LABELS[option]}
          </button>
        ))}
      </div>
    </section>
  );
}

function CategoriesSection() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      setCategories(await libraryService.listCategories());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleAdd() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setAdding(true);
    setError(null);
    try {
      await libraryService.createCategory(trimmed);
      setNewName("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  }

  function startEdit(category: Category) {
    setError(null);
    setEditingId(category.id);
    setEditingName(category.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingName("");
  }

  /** Closes the edit immediately (optimistic) so a browser-level blur
   * fired by the input unmounting can't double-submit — a second call
   * this triggers finds `editingName` already reset to "" for that
   * row's render and no-ops on the empty-trim check below. */
  async function handleSaveEdit(id: string) {
    const trimmed = editingName.trim();
    setEditingId(null);
    setEditingName("");
    if (!trimmed) return;

    setSavingEdit(true);
    setError(null);
    try {
      await libraryService.renameCategory(id, trimmed);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingEdit(false);
    }
  }

  function handleDelete(category: Category) {
    setPendingDelete(category);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const category = pendingDelete;
    setError(null);
    setDeletingId(category.id);
    try {
      await libraryService.deleteCategory(category.id);
      setPendingDelete(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="settings-page__section">
      <h3>Categories</h3>
      <p className="settings-page__section-hint">
        Click a category below to rename it. New papers can be assigned one during the
        "Add Paper" review step.
      </p>

      <div className="settings-page__add-category">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="Add a category…"
          disabled={adding}
        />
        <button type="button" onClick={handleAdd} disabled={adding || !newName.trim()}>
          {adding ? "Adding…" : "Add"}
        </button>
      </div>

      {error && <p className="settings-page__error">{error}</p>}
      {loading && <p className="settings-page__empty">Loading…</p>}
      {!loading && categories.length === 0 && (
        <p className="settings-page__empty">No categories yet — add one above.</p>
      )}

      <div className="settings-page__capsules">
        {categories.map((c) =>
          editingId === c.id ? (
            <span
              key={c.id}
              className="settings-page__capsule settings-page__capsule--editing"
            >
              <input
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveEdit(c.id);
                  if (e.key === "Escape") cancelEdit();
                }}
                onBlur={() => handleSaveEdit(c.id)}
                autoFocus
                disabled={savingEdit}
              />
            </span>
          ) : (
            <span key={c.id} className="settings-page__capsule">
              <button
                type="button"
                className="settings-page__capsule-label"
                onClick={() => startEdit(c)}
                disabled={deletingId === c.id}
                title="Click to rename"
              >
                {c.name}
              </button>
              <button
                type="button"
                className="settings-page__capsule-delete"
                onClick={() => handleDelete(c)}
                disabled={deletingId === c.id}
                aria-label={`Delete "${c.name}"`}
                title={`Delete "${c.name}"`}
              >
                &times;
              </button>
            </span>
          ),
        )}
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete category?"
          message={`Delete category "${pendingDelete.name}"? Papers using it just lose the tag — nothing else about them changes. This can't be undone.`}
          confirmLabel="Delete"
          busy={deletingId === pendingDelete.id}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </section>
  );
}

/** Same shape as `CategoriesSection` — the free-form, many-per-paper
 * counterpart. Tags are more commonly created inline from the Library
 * sidebar's per-row tag menu, but managing (renaming, deleting) the
 * whole set from one place still belongs here, same as categories. */
function TagsSection() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Tag | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      setTags(await libraryService.listTags());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleAdd() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setAdding(true);
    setError(null);
    try {
      await libraryService.createTag(trimmed);
      setNewName("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  }

  function startEdit(tag: Tag) {
    setError(null);
    setEditingId(tag.id);
    setEditingName(tag.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingName("");
  }

  async function handleSaveEdit(id: string) {
    const trimmed = editingName.trim();
    setEditingId(null);
    setEditingName("");
    if (!trimmed) return;

    setSavingEdit(true);
    setError(null);
    try {
      await libraryService.renameTag(id, trimmed);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingEdit(false);
    }
  }

  function handleDelete(tag: Tag) {
    setPendingDelete(tag);
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const tag = pendingDelete;
    setError(null);
    setDeletingId(tag.id);
    try {
      await libraryService.deleteTag(tag.id);
      setPendingDelete(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="settings-page__section">
      <h3>Tags</h3>
      <p className="settings-page__section-hint">
        Click a tag below to rename it. Unlike categories, a paper can carry any number of
        tags — add them from the Library sidebar's tag menu, or create one here ahead of time.
      </p>

      <div className="settings-page__add-category">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="Add a tag…"
          disabled={adding}
        />
        <button type="button" onClick={handleAdd} disabled={adding || !newName.trim()}>
          {adding ? "Adding…" : "Add"}
        </button>
      </div>

      {error && <p className="settings-page__error">{error}</p>}
      {loading && <p className="settings-page__empty">Loading…</p>}
      {!loading && tags.length === 0 && (
        <p className="settings-page__empty">No tags yet — add one above.</p>
      )}

      <div className="settings-page__capsules">
        {tags.map((t) =>
          editingId === t.id ? (
            <span key={t.id} className="settings-page__capsule settings-page__capsule--editing">
              <input
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveEdit(t.id);
                  if (e.key === "Escape") cancelEdit();
                }}
                onBlur={() => handleSaveEdit(t.id)}
                autoFocus
                disabled={savingEdit}
              />
            </span>
          ) : (
            <span key={t.id} className="settings-page__capsule">
              <button
                type="button"
                className="settings-page__capsule-label"
                onClick={() => startEdit(t)}
                disabled={deletingId === t.id}
                title="Click to rename"
              >
                {t.name}
              </button>
              <button
                type="button"
                className="settings-page__capsule-delete"
                onClick={() => handleDelete(t)}
                disabled={deletingId === t.id}
                aria-label={`Delete "${t.name}"`}
                title={`Delete "${t.name}"`}
              >
                &times;
              </button>
            </span>
          ),
        )}
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete tag?"
          message={`Delete tag "${pendingDelete.name}"? Papers carrying it just lose that marker — nothing else about them changes. This can't be undone.`}
          confirmLabel="Delete"
          busy={deletingId === pendingDelete.id}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </section>
  );
}
