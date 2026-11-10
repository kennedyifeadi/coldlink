import type { StorageConfig } from '../config.js';
import { PhotoStorageError, type PhotoStorage } from './photoStorage.js';
import { createSupabasePhotoStorage } from './supabaseStorage.js';

const NOT_CONFIGURED =
  'Photo storage is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY';

// Outside production the API may run without storage, as in CI; only the photo routes then fail.
function unconfiguredPhotoStorage(): PhotoStorage {
  return {
    upload: () => Promise.reject(new PhotoStorageError(NOT_CONFIGURED)),
    remove: () => Promise.reject(new PhotoStorageError(NOT_CONFIGURED)),
    publicUrl: () => {
      throw new PhotoStorageError(NOT_CONFIGURED);
    },
  };
}

export function createPhotoStorage(config: StorageConfig | undefined): PhotoStorage {
  return config === undefined ? unconfiguredPhotoStorage() : createSupabasePhotoStorage(config);
}
