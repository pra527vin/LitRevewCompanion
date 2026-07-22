/**
 * Wraps any failure from the storage layer (connection, query, or
 * execute) with a message meant to be readable by a feature's UI
 * layer, plus the original error for debugging.
 */
export class StorageError extends Error {
  cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "StorageError";
    this.cause = cause;
  }
}
