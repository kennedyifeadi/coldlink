import type { StorageConfig } from '../config.js';
import { PhotoStorageError, type PhotoStorage } from './photoStorage.js';

/** Created by the `add_provider_photos_bucket` migration, with the same size and type limits. */
export const PROVIDER_PHOTOS_BUCKET = 'provider-photos';

// A 5 MB photo over a slow mobile uplink reaches the API first; this covers the hop to Supabase.
const REQUEST_TIMEOUT_MS = 30_000;
// Every upload gets a fresh random name, so a cached copy can never be stale.
const CACHE_CONTROL = 'max-age=31536000';

export interface SupabaseStorageOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

function objectPath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

/** Talks to Supabase Storage's REST API with the service-role key, which only the API holds. */
export function createSupabasePhotoStorage(
  config: StorageConfig,
  { fetch: fetchFn = fetch, timeoutMs = REQUEST_TIMEOUT_MS }: SupabaseStorageOptions = {},
): PhotoStorage {
  const objectUrl = (path: string) =>
    new URL(`/storage/v1/object/${PROVIDER_PHOTOS_BUCKET}/${objectPath(path)}`, config.supabaseUrl);
  const headers = {
    Authorization: `Bearer ${config.serviceRoleKey}`,
    apikey: config.serviceRoleKey,
  };

  async function call(action: string, url: URL, init: RequestInit): Promise<Response> {
    try {
      return await fetchFn(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      const reason =
        error instanceof DOMException && error.name === 'TimeoutError'
          ? `timed out after ${timeoutMs} ms`
          : 'failed before a response';
      throw new PhotoStorageError(`Storage ${action} ${reason}`);
    }
  }

  return {
    async upload({ path, body, contentType }) {
      const response = await call('upload', objectUrl(path), {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': contentType,
          'Cache-Control': CACHE_CONTROL,
          'x-upsert': 'false',
        },
        body: new Uint8Array(body),
      });
      if (!response.ok) {
        throw new PhotoStorageError(`Storage upload returned HTTP ${response.status}`);
      }
    },
    async remove(path) {
      const response = await call('delete', objectUrl(path), { method: 'DELETE', headers });
      if (!response.ok && response.status !== 404) {
        throw new PhotoStorageError(`Storage delete returned HTTP ${response.status}`);
      }
    },
    publicUrl(path) {
      return new URL(
        `/storage/v1/object/public/${PROVIDER_PHOTOS_BUCKET}/${objectPath(path)}`,
        config.supabaseUrl,
      ).toString();
    },
  };
}
