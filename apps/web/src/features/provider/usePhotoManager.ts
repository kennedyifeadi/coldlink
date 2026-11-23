import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  MAX_PROVIDER_PHOTO_BYTES,
  MAX_PROVIDER_PHOTOS,
  providerPhotoTypes,
  type OwnProvider,
} from '@coldlink/shared';
import { isApiError } from '../../api/client';
import { removeProviderPhoto, uploadProviderPhoto } from '../../api/providers';
import { useSessionStore } from '../../session/sessionContext';
import { shrinkPhoto } from './shrinkPhoto';

type PhotoStatus = 'waiting' | 'uploading' | 'uploaded' | 'failed' | 'removing';

/** Keys under provider.photos.problems. */
export type PhotoProblem =
  'tooLarge' | 'wrongType' | 'tooMany' | 'network' | 'sessionEnded' | 'failed' | 'removeFailed';

export interface PhotoItem {
  key: string;
  /** The picked file; absent for a photo that was already uploaded. */
  file?: Blob;
  preview: string;
  status: PhotoStatus;
  photoId?: string;
  problem?: PhotoProblem;
}

// Trying the same file again cannot fix these; the provider has to remove it or pick another.
export const FINAL_PROBLEMS = new Set<PhotoProblem>(['tooLarge', 'wrongType', 'tooMany']);

const isPhotoType = (type: string) => Object.hasOwn(providerPhotoTypes, type);

const problemFor = (error: unknown): PhotoProblem => {
  if (isApiError(error, 'payload_too_large')) return 'tooLarge';
  if (isApiError(error, 'bad_request')) return 'wrongType';
  if (isApiError(error, 'conflict')) return 'tooMany';
  if (isApiError(error, 'network')) return 'network';
  if (isApiError(error, 'unauthorized')) return 'sessionEnded';
  return 'failed';
};

const uploadedItems = (provider: OwnProvider | undefined): PhotoItem[] =>
  (provider?.photos ?? []).map((photo) => ({
    key: photo.id,
    preview: photo.url,
    status: 'uploaded',
    photoId: photo.id,
  }));

/**
 * A facility's photos as the provider adds and removes them: each change goes to the API at once,
 * and `onSaved` gets the facility as the API returns it after each one.
 */
export const usePhotoManager = (
  provider: OwnProvider | undefined,
  onSaved: (provider: OwnProvider) => void,
) => {
  const store = useSessionStore();
  const [items, setItems] = useState<PhotoItem[]>(() => uploadedItems(provider));
  const [notice, setNotice] = useState<'tooManyPicked'>();
  const latest = useRef(provider);
  // One upload at a time, in the order picked, so a slow connection is not shared four ways.
  const queue = useRef(Promise.resolve());
  const nextKey = useRef(0);
  const previews = useRef(new Set<string>());

  useEffect(() => {
    const open = previews.current;
    return () => {
      open.forEach((preview) => URL.revokeObjectURL(preview));
      open.clear();
    };
  }, []);

  const update = (key: string, changes: Partial<PhotoItem>) =>
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...changes } : item)),
    );

  const keep = (saved: OwnProvider) => {
    latest.current = saved;
    onSaved(saved);
  };

  const upload = async (item: PhotoItem) => {
    const current = latest.current;
    if (!current || !item.file) return;
    update(item.key, { status: 'uploading', problem: undefined });
    try {
      const photo = await shrinkPhoto(item.file);
      if (photo.size > MAX_PROVIDER_PHOTO_BYTES) {
        update(item.key, { status: 'failed', problem: 'tooLarge' });
        return;
      }
      const before = new Set(current.photos.map(({ id }) => id));
      const updated = await uploadProviderPhoto(store.authorizedRequest, current.id, photo);
      keep(updated);
      const added = updated.photos.find(({ id }) => !before.has(id));
      update(item.key, { status: 'uploaded', photoId: added?.id });
    } catch (error) {
      update(item.key, { status: 'failed', problem: problemFor(error) });
    }
  };

  const enqueue = (item: PhotoItem) => {
    queue.current = queue.current.then(() => upload(item));
  };

  const freeSlots = MAX_PROVIDER_PHOTOS - items.length;

  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = '';
    setNotice(files.length > freeSlots ? 'tooManyPicked' : undefined);
    const picked = files.slice(0, freeSlots).map((file): PhotoItem => {
      const key = `picked-${nextKey.current++}`;
      const preview = URL.createObjectURL(file);
      previews.current.add(preview);
      return isPhotoType(file.type)
        ? { key, file, preview, status: 'waiting' }
        : { key, file, preview, status: 'failed', problem: 'wrongType' };
    });
    setItems((current) => [...current, ...picked]);
    picked.filter(({ status }) => status === 'waiting').forEach(enqueue);
  };

  const retry = (item: PhotoItem) => {
    update(item.key, { status: 'waiting', problem: undefined });
    enqueue(item);
  };

  const drop = (item: PhotoItem) => {
    if (previews.current.delete(item.preview)) URL.revokeObjectURL(item.preview);
    setItems((current) => current.filter(({ key }) => key !== item.key));
    setNotice(undefined);
  };

  const remove = async (item: PhotoItem) => {
    const current = latest.current;
    if (item.status !== 'uploaded' || !item.photoId || !current) {
      drop(item);
      return;
    }
    update(item.key, { status: 'removing', problem: undefined });
    try {
      keep(await removeProviderPhoto(store.authorizedRequest, current.id, item.photoId));
      drop(item);
    } catch {
      update(item.key, { status: 'uploaded', problem: 'removeFailed' });
    }
  };

  return {
    items,
    notice,
    freeSlots,
    busy: items.some(({ status }) => status !== 'uploaded' && status !== 'failed'),
    uploadedCount: items.filter(({ status }) => status === 'uploaded').length,
    pick,
    retry,
    remove,
  };
};

export type PhotoManagerState = ReturnType<typeof usePhotoManager>;
