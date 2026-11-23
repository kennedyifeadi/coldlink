import React from 'react';
import { CheckCircle2, Clock, ImagePlus, LoaderCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MAX_PROVIDER_PHOTOS, providerPhotoTypes } from '@coldlink/shared';
import ErrorMessage from '../../components/ui/ErrorMessage';
import { FINAL_PROBLEMS, type PhotoItem, type PhotoManagerState } from './usePhotoManager';

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

/** The photos, each with its state and buttons, and the picker while there is room. */
const PhotoManager = ({ photos, hint }: { photos: PhotoManagerState; hint?: string }) => {
  const { t } = useTranslation();
  const { items, notice, freeSlots } = photos;

  return (
    <section aria-labelledby="photos-heading" className="flex flex-col gap-3">
      <h2 id="photos-heading" className="font-heading font-semibold text-ink text-subtitle">
        {t('provider.photos.count', { count: items.length, max: MAX_PROVIDER_PHOTOS })}
      </h2>
      {hint && <p className="text-copy-muted text-body -mt-1">{hint}</p>}

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
                        onClick={() => photos.retry(item)}
                        className="min-h-12 text-primary-strong font-medium text-body underline"
                      >
                        {t('common.tryAgain')}
                      </button>
                    )}
                  {item.status !== 'uploading' && item.status !== 'removing' && (
                    <button
                      type="button"
                      onClick={() => void photos.remove(item)}
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
            onChange={photos.pick}
            className="sr-only"
          />
        </label>
      )}

      {notice && (
        <ErrorMessage>{t(`provider.photos.${notice}`, { max: MAX_PROVIDER_PHOTOS })}</ErrorMessage>
      )}
    </section>
  );
};

export default PhotoManager;
