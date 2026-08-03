/**
 * Saves a `File`/`Blob` to the researcher's real disk via the
 * browser's normal download flow — a momentarily-appended
 * `<a download>` click, same object-URL create/revoke pairing
 * `PaperThumbnail` already uses for `<img src>`. Works the same
 * regardless of which storage backend (real File System Access API
 * or the Firefox/Safari IndexedDB virtual filesystem) the file
 * actually came from, since both just hand over a `Blob`.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
