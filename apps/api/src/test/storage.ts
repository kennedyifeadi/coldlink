import type { PhotoStorage, StoredObject } from '../storage/photoStorage.js';

export const FAKE_STORAGE_ORIGIN = 'https://storage.coldlink.test';

/** An in-memory bucket. Tests never reach Supabase Storage (decision 47). */
export function fakePhotoStorage() {
  const objects = new Map<string, Omit<StoredObject, 'path'>>();
  const storage: PhotoStorage = {
    upload({ path, body, contentType }) {
      if (objects.has(path)) return Promise.reject(new Error(`${path} already exists`));
      objects.set(path, { body, contentType });
      return Promise.resolve();
    },
    remove(path) {
      objects.delete(path);
      return Promise.resolve();
    },
    publicUrl: (path) => `${FAKE_STORAGE_ORIGIN}/${path}`,
  };
  return { storage, objects };
}
