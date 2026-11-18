import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { todayInLagos, type FarmerBookingSummary } from '@coldlink/shared';
import { quoteBooking } from '../../api/bookings';
import { isApiError } from '../../api/client';
import { cropsQuery } from '../../api/referenceData';
import { SEARCH_STEPS, useSearchFlow, type SearchNoticeState } from '../search/searchFlow';
import { bookingStepPath, quoteBodyFor, type BookingRoute } from './bookingIntent';

/** The same facility, crop, amount and length of stay as before, starting today in Lagos. */
export const bookAgainRoute = (booking: FarmerBookingSummary, now: Date): BookingRoute => ({
  providerId: booking.provider.id,
  intent: {
    crop_id: booking.crop.id,
    quantity: booking.quantity,
    capacity_unit: booking.capacity_unit,
    days: booking.duration_days,
    start_date: todayInLagos(now),
  },
});

type Fallback = SearchNoticeState['notice'];

// What the quote's refusal means for Book again; anything else is an error to retry.
const fallbackFor = (error: unknown): Fallback | undefined => {
  if (isApiError(error, 'not_found')) return 'bookAgainGone';
  // No space, or terms the facility no longer takes (its unit or shortest stay changed).
  if (isApiError(error, 'conflict') || isApiError(error, 'validation_failed')) {
    return 'bookAgainNoSpace';
  }
  return undefined;
};

/**
 * Book again (PRD 7.9): asks for a quote for the same terms and opens that facility's review, or,
 * when the facility is gone or can't take them, the search with the produce and amount filled in.
 * The place is chosen again, since a booking does not keep where the farmer was (decision 78).
 */
export const useBookAgain = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { update } = useSearchFlow();

  return useMutation({
    mutationFn: async (booking: FarmerBookingSummary) => {
      const route = bookAgainRoute(booking, new Date());
      try {
        await quoteBooking(quoteBodyFor(route));
      } catch (error) {
        const notice = fallbackFor(error);
        if (notice === undefined) throw error;
        const { data: crops } = await queryClient.fetchQuery(cropsQuery);
        const { quantity, capacity_unit, days, start_date } = route.intent;
        update({
          place: undefined,
          crop: crops.find((crop) => crop.id === route.intent.crop_id),
          amount: { quantity, capacity_unit, days, start_date },
        });
        await navigate(SEARCH_STEPS.place, { state: { notice } satisfies SearchNoticeState });
        return;
      }
      await navigate(bookingStepPath('review', route.providerId, route.intent));
    },
  });
};
