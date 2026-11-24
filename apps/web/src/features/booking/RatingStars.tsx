import React from 'react';
import { Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BookingRating } from '@coldlink/shared';
import { formatLagosTime } from '../../i18n/format';

const STAR_VALUES = [1, 2, 3, 4, 5] as const;
export type Stars = (typeof STAR_VALUES)[number];

const WORDS = {
  1: 'booking.rating.words.poor',
  2: 'booking.rating.words.fair',
  3: 'booking.rating.words.good',
  4: 'booking.rating.words.veryGood',
  5: 'booking.rating.words.excellent',
} as const;

/** "4 out of 5: Very good", so a rating never rests on how many stars look filled. */
const useRatingWords = () => {
  const { t } = useTranslation();
  return (stars: number) => t('booking.rating.chosen', { stars, words: t(WORDS[stars as Stars]) });
};

// Filled and outlined stars differ in shape as well as colour (decision 107).
const starClasses = (filled: boolean) =>
  filled ? 'fill-accent text-accent-ink' : 'fill-none text-copy-subtle';

interface StarPickerProps {
  value: Stars | undefined;
  onChange: (stars: Stars) => void;
  disabled: boolean;
  describedBy?: string;
}

/** Five large buttons, one tap each; the choice is said in words below them. */
export const StarPicker = ({ value, onChange, disabled, describedBy }: StarPickerProps) => {
  const { t } = useTranslation();
  const words = useRatingWords();

  return (
    <fieldset aria-describedby={describedBy}>
      <legend className="block text-label font-medium text-copy mb-3">
        {t('booking.rating.starsLabel')}
      </legend>
      <div className="grid grid-cols-5 gap-2">
        {STAR_VALUES.map((stars) => {
          const filled = value !== undefined && stars <= value;
          return (
            <button
              key={stars}
              type="button"
              onClick={() => onChange(stars)}
              disabled={disabled}
              aria-pressed={value === stars}
              aria-label={t('booking.rating.outOf', { stars })}
              className={`flex flex-col items-center justify-center gap-1 min-h-16 rounded-2xl border transition-colors disabled:cursor-not-allowed ${
                value === stars
                  ? 'bg-accent-faint border-accent-ink'
                  : 'bg-surface border-line-strong hover:bg-surface-muted'
              }`}
            >
              <Star
                size={30}
                strokeWidth={1.75}
                className={starClasses(filled)}
                aria-hidden="true"
              />
              <span aria-hidden="true" className="text-label font-semibold text-copy-muted">
                {stars}
              </span>
            </button>
          );
        })}
      </div>
      <p aria-live="polite" className="mt-3 min-h-6 text-ink text-lead font-semibold">
        {value === undefined ? (
          <span className="text-copy-muted font-normal text-body">
            {t('booking.rating.noneChosen')}
          </span>
        ) : (
          words(value)
        )}
      </p>
    </fieldset>
  );
};

/** A rating already given: its stars, in words, the comment and when. */
export const RatingSummary = ({ rating }: { rating: BookingRating }) => {
  const { t } = useTranslation();
  const words = useRatingWords();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1" aria-hidden="true">
        {STAR_VALUES.map((stars) => (
          <Star
            key={stars}
            size={22}
            strokeWidth={1.75}
            className={starClasses(stars <= rating.stars)}
          />
        ))}
      </div>
      <p className="text-ink text-lead font-semibold">{words(rating.stars)}</p>
      {rating.comment !== null && (
        <p className="text-copy text-body leading-relaxed whitespace-pre-line break-words">
          {rating.comment}
        </p>
      )}
      <p className="text-copy-muted text-label">
        {t('booking.rating.ratedOn', { day: formatLagosTime(rating.created_at).day })}
      </p>
    </div>
  );
};
