import { describe, expect, it } from 'vitest';
import { PhotoStorageError } from './photoStorage.js';
import { createSupabasePhotoStorage } from './supabaseStorage.js';

const config = {
  supabaseUrl: 'https://abcdefghij.supabase.co',
  serviceRoleKey: 'service-role-key-123',
};
const path = 'providers/6f1c1a8e-0c4b-4f5e-9a3d-2b7e8c9d0a1f/1b2c.jpg';

function fakeFetch(respond: () => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch: typeof globalThis.fetch = (url, init = {}) => {
    calls.push({ url: url instanceof Request ? url.url : url.toString(), init });
    return Promise.resolve(respond());
  };
  return { fetch, calls };
}

describe('createSupabasePhotoStorage', () => {
  it('uploads to the provider-photos bucket with the service-role key, never overwriting', async () => {
    const { fetch, calls } = fakeFetch(() => new Response('{}', { status: 200 }));
    const storage = createSupabasePhotoStorage(config, { fetch });
    await storage.upload({ path, body: Buffer.from([1, 2, 3]), contentType: 'image/jpeg' });

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe(
      `https://abcdefghij.supabase.co/storage/v1/object/provider-photos/${path}`,
    );
    expect(call?.init.method).toBe('POST');
    expect(call?.init.headers).toMatchObject({
      Authorization: 'Bearer service-role-key-123',
      apikey: 'service-role-key-123',
      'Content-Type': 'image/jpeg',
      'x-upsert': 'false',
    });
  });

  it('reports a refused upload by status only, without the key', async () => {
    const { fetch } = fakeFetch(() => new Response('denied', { status: 403 }));
    const storage = createSupabasePhotoStorage(config, { fetch });
    const upload = storage.upload({ path, body: Buffer.from([1]), contentType: 'image/png' });
    await expect(upload).rejects.toThrow(new PhotoStorageError('Storage upload returned HTTP 403'));
  });

  it('reports a network failure', async () => {
    const storage = createSupabasePhotoStorage(config, {
      fetch: () => Promise.reject(new TypeError('fetch failed')),
    });
    await expect(storage.remove(path)).rejects.toThrow('Storage delete failed before a response');
  });

  it('deletes the object, and treats one already gone as removed', async () => {
    const { fetch, calls } = fakeFetch(() => new Response('', { status: 404 }));
    const storage = createSupabasePhotoStorage(config, { fetch });
    await storage.remove(path);
    expect(calls[0]?.init.method).toBe('DELETE');
  });

  it('refuses a failed delete', async () => {
    const { fetch } = fakeFetch(() => new Response('', { status: 500 }));
    const storage = createSupabasePhotoStorage(config, { fetch });
    await expect(storage.remove(path)).rejects.toThrow('Storage delete returned HTTP 500');
  });

  it('builds the public URL', () => {
    const storage = createSupabasePhotoStorage(config);
    expect(storage.publicUrl(path)).toBe(
      `https://abcdefghij.supabase.co/storage/v1/object/public/provider-photos/${path}`,
    );
  });
});
