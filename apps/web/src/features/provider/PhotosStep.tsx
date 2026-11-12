import React, { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { CheckCircle2, Clock, ImagePlus, LoaderCircle } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  MAX_PROVIDER_PHOTO_BYTES,
  MAX_PROVIDER_PHOTOS,
  providerPhotoTypes,
  type OwnProvider,
} from '@coldlink/shared';
import ErrorMessage from '../../components/ui/ErrorMessage';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { isApiError } from '../../api/client';
import { removeProviderPhoto, uploadProviderPhoto } from '../../api/providers';
import { useSessionStore } from '../../session/sessionContext';
import { ONBOARDING_STEPS, redirectFor, useOnboardingFlow } from './onboardingFlow';
import { shrinkPhoto } from './shrinkPhoto';
import StepScreen from './StepScreen';

type PhotoStatus = 'waiting' | 'uploading' | 'uploaded' | 'failed' | 'removing';

/** Keys under provider.photos.problems. */
type PhotoProblem =
  'tooLarge' | 'wrongType' | 'tooMany' | 'network' | 'sessionEnded' | 'failed' | 'removeFailed';

interface PhotoItem {
  key: string;
  /** The picked file; absent for a photo that was already uploaded. */
  file?: Blob;
  preview: string;
  status: PhotoStatus;
  photoId?: string;
  problem?: PhotoProblem;
}

// Trying the same file again cannot fix these; the provider has to remove it or pick another.
const FINAL_PROBLEMS = new Set<PhotoProblem>(['tooLarge', 'wrongType', 'tooMany']);

const isPhotoType = (type: string) => Object.hasOwn(providerPhotoTypes, type);

const problemFor = (error: unknown): PhotoProblem => {
  if (isApiError(error, 'payload_too_large')) return 'tooLarge';
  if (isApiError(error, 'bad_request')) return 'wrongType';
  if (isApiError(error, 'conflict')) return 'tooMany';
  if (isApiError(error, 'network')) return 'network';
  if (isApiError(error, 'unauthorized')) return 'sessionEnded';
  return 'failed';
};

const uploadedItems = (provider: OwnProvider): PhotoItem[] =>
  provider.photos.map((photo) => ({
    key: photo.id,
    preview: photo.url,
    status: 'uploaded',
    photoId: photo.id,
  }));

const StatusLine = ({ item }: { item: PhotoItem }) => {
  const { t } = useTranslation();
  if (item.problem)
    return <ErrorMessage>{t(`provider.photos.problems.${item.problem}`)}</ErrorMessage>;
  switch (item.status) {
    case 'waiting':
      return (
        <p className="flex items-center gap-2 text-copy-muted text-body">
          <Clock size={18} aria-hidden="true" className="shrink-0" />
          {t('provider.photos.waiting')}
        </p>
      );
    case 'uploading':
    case 'removing':
      return (
        <p className="flex items-center gap-2 text-copy-muted text-body">
          <LoaderCircle
            size={18}
            aria-hidden="true"
            className="shrink-0 text-primary-strong motion-safe:animate-spin"
          />
          {t(
            item.status === 'uploading' ? 'provider.photos.uploading' : 'provider.photos.removing',
          )}
        </p>
      );
    default:
      return (
        <p className="flex items-center gap-2 text-primary-strong text-body font-medium">
          <CheckCircle2 size={18} aria-hidden="true" className="shrink-0" />
          {t('provider.photos.uploaded')}
        </p>
      );
  }
};

const PhotosStep = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const store = useSessionStore();
  const flow = useOnboardingFlow();
  const created = flow.draft.created;
  const [items, setItems] = useState<PhotoItem[]>(() => (created ? uploadedItems(created) : []));
  const [notice, setNotice] = useState<'tooManyPicked'>();
  const latest = useRef(created);
  // One upload at a time, in the order picked, so a slow connection is not shared four ways.
  const queue = useRef(Promise.resolve());
  const nextKey = useRef(0);
  const previews = useRef(new Set<string>());

  const update = (key: string, changes: Partial<PhotoItem>) =>
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...changes } : item)),
    );

  const keepProvider = (provider: OwnProvider) => {
    latest.current = provider;
    flow.setCreated(provider);
  };

  const upload = async (item: PhotoItem) => {
    const provider = latest.current;
    if (!provider || !item.file) return;
    update(item.key, { status: 'uploading', problem: undefined });
    try {
      const photo = await shrinkPhoto(item.file);
      if (photo.size > MAX_PROVIDER_PHOTO_BYTES) {
        update(item.key, { status: 'failed', problem: 'tooLarge' });
        return;
      }
      const before = new Set(provider.photos.map(({ id }) => id));
      const updated = await uploadProviderPhoto(store.authorizedRequest, provider.id, photo);
      keepProvider(updated);
      const added = updated.photos.find(({ id }) => !before.has(id));
      update(item.key, { status: 'uploaded', photoId: added?.id });
    } catch (error) {
      update(item.key, { status: 'failed', problem: problemFor(error) });
    }
  };

  const enqueue = (item: PhotoItem) => {
    queue.current = queue.current.then(() => upload(item));
  };

  useEffect(() => {
    const open = previews.current;
    return () => {
      open.forEach((preview) => URL.revokeObjectURL(preview));
      open.clear();
    };
  }, []);

  const redirect = redirectFor(flow.draft, 'photos');
  if (redirect) return <Navigate to={redirect} replace />;
  if (!created) return <Navigate to={ONBOARDING_STEPS.contact} replace />;

  const freeSlots = MAX_PROVIDER_PHOTOS - items.length;

  const handlePick = (e: ChangeEvent<HTMLInputElement>) => {
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

  const drop = (item: PhotoItem) => {
    if (previews.current.delete(item.preview)) URL.revokeObjectURL(item.preview);
    setItems((current) => current.filter(({ key }) => key !== item.key));
    setNotice(undefined);
  };

  const remove = async (item: PhotoItem) => {
    if (item.status !== 'uploaded' || !item.photoId) {
      drop(item);
      return;
    }
    update(item.key, { status: 'removing', problem: undefined });
    try {
      keepProvider(await removeProviderPhoto(store.authorizedRequest, created.id, item.photoId));
      drop(item);
    } catch {
      update(item.key, { status: 'uploaded', problem: 'removeFailed' });
    }
  };

  const busy = items.some(({ status }) => status !== 'uploaded' && status !== 'failed');
  const uploadedCount = items.filter(({ status }) => status === 'uploaded').length;

  return (
    <StepScreen
      step="photos"
      title={t('provider.photos.title')}
      intro={t('provider.photos.intro')}
      showBack={false}
      onSubmit={() => {
        if (!busy) void navigate(ONBOARDING_STEPS.done, { replace: true });
      }}
      action={
        <PrimaryButton type="submit" disabled={busy}>
          {busy
            ? t('provider.photos.finishWaiting')
            : uploadedCount === 0
              ? t('provider.photos.finishWithout')
              : t('provider.photos.finish')}
        </PrimaryButton>
      }
    >
      <div className="flex items-center gap-2 bg-primary-faint border border-primary-muted rounded-xl px-4 py-3">
        <CheckCircle2 size={16} className="text-primary-strong shrink-0" aria-hidden="true" />
        <span className="text-ink text-body font-medium">
          {t('provider.photos.saved', { name: created.display_name })}
        </span>
      </div>

      <section aria-labelledby="photos-heading" className="flex flex-col gap-3">
        <h2 id="photos-heading" className="font-heading font-semibold text-ink text-subtitle">
          {t('provider.photos.count', { count: items.length, max: MAX_PROVIDER_PHOTOS })}
        </h2>

        {items.length > 0 && (
          <ul aria-live="polite" className="flex flex-col gap-3">
            {items.map((item, index) => (
              <li
                key={item.key}
                className="flex gap-4 p-3 rounded-2xl border border-line bg-surface shadow-card"
              >
                <img
                  src={item.preview}
                  alt={t('provider.photos.photoAlt', { number: index + 1 })}
                  width={80}
                  height={80}
                  className="w-20 h-20 rounded-xl object-cover bg-surface-muted shrink-0"
                />
                <div className="flex flex-col gap-2 min-w-0 flex-grow">
                  <p className="font-medium text-copy text-body">
                    {t('provider.photos.photoName', { number: index + 1 })}
                  </p>
                  <StatusLine item={item} />
                  <div className="flex flex-wrap gap-x-4">
                    {item.status === 'failed' &&
                      item.problem &&
                      !FINAL_PROBLEMS.has(item.problem) && (
                        <button
                          type="button"
                          onClick={() => {
                            update(item.key, { status: 'waiting', problem: undefined });
                            enqueue(item);
                          }}
                          className="min-h-12 text-primary-strong font-medium text-body underline"
                        >
                          {t('common.tryAgain')}
                        </button>
                      )}
                    {item.status !== 'uploading' && item.status !== 'removing' && (
                      <button
                        type="button"
                        onClick={() => void remove(item)}
                        aria-label={t('provider.photos.removeLabel', { number: index + 1 })}
                        className="min-h-12 text-copy-muted font-medium text-body underline"
                      >
                        {t('provider.photos.remove')}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {freeSlots > 0 && (
          <label className="flex flex-col items-center justify-center gap-2 min-h-28 px-4 py-5 rounded-2xl border-2 border-dashed border-line-strong bg-surface-muted text-center cursor-pointer hover:bg-surface-sunken transition-colors has-focus-visible:outline-2 has-focus-visible:outline-primary-strong">
            <ImagePlus size={28} className="text-primary-strong" aria-hidden="true" />
            <span className="font-semibold text-copy text-lead">
              {items.length === 0 ? t('provider.photos.add') : t('provider.photos.addMore')}
            </span>
            <span className="text-copy-muted text-label">
              {t('provider.photos.addHint', { count: freeSlots })}
            </span>
            <input
              type="file"
              accept={Object.keys(providerPhotoTypes).join(',')}
              multiple
              onChange={handlePick}
              className="sr-only"
            />
          </label>
        )}

        {notice && (
          <ErrorMessage>
            {t(`provider.photos.${notice}`, { max: MAX_PROVIDER_PHOTOS })}
          </ErrorMessage>
        )}
      </section>
    </StepScreen>
  );
};

export default PhotosStep;
