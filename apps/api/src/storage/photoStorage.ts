export interface StoredObject {
  /** The object's path inside the bucket, such as `providers/<id>/<uuid>.jpg`. */
  path: string;
  body: Buffer;
  contentType: string;
}

export interface PhotoStorage {
  /** Resolves once the object is stored, or rejects with a `PhotoStorageError`. Never overwrites. */
  upload(object: StoredObject): Promise<void>;
  /** Removes the object; an object that is already gone counts as removed. */
  remove(path: string): Promise<void>;
  /** The URL anyone can load the object from. */
  publicUrl(path: string): string;
}

/** A storage call that failed. The message never holds a credential, so it can be logged. */
export class PhotoStorageError extends Error {
  override readonly name = 'PhotoStorageError';
}
