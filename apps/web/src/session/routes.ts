import * as z from 'zod';

export const SIGN_IN_PATH = '/onboarding';
export const SIGNED_IN_HOME = '/';
export const MY_BOOKINGS_PATH = '/bookings';
export const PROVIDER_ONBOARDING_PATH = '/provider/onboarding';

/** Router state a guard leaves for the sign-in screen, to come back after signing in. */
export const returnToStateSchema = z.object({ returnTo: z.string().startsWith('/') });
export type ReturnToState = z.infer<typeof returnToStateSchema>;
