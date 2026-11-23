import { useParams } from 'react-router-dom';
import * as z from 'zod';

/** The facility and booking ids in the URL, or undefined for one that is not an id. */
export const useProviderParams = () => {
  const { providerId, bookingId } = useParams();
  return {
    providerId: z.uuid().safeParse(providerId).data,
    bookingId: z.uuid().safeParse(bookingId).data,
  };
};
