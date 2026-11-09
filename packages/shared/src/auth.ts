import * as z from 'zod';
import { preferredChannelSchema, userRoleSchema } from './enums.js';
import { phoneSchema } from './phone.js';

// Request and response bodies of the auth and profile endpoints (PRD 7.1, 8).

export const otpCodeSchema = z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from the SMS');

export const otpRequestBodySchema = z.strictObject({ phone: phoneSchema });
export type OtpRequestBody = z.input<typeof otpRequestBodySchema>;

export const otpRequestResponseSchema = z.strictObject({
  expires_in_seconds: z.int().positive(),
  resend_after_seconds: z.int().positive(),
  /** Only in local development with the console SMS provider (decision 57). */
  dev_code: otpCodeSchema.optional(),
});
export type OtpRequestResponse = z.infer<typeof otpRequestResponseSchema>;

export const otpVerifyBodySchema = z.strictObject({
  phone: phoneSchema,
  // Optional only so that a number can register without one while otp_required is off.
  code: otpCodeSchema.optional(),
  // Data-protection consent (PRD 10), required to create an account.
  consent: z.boolean().optional(),
});
export type OtpVerifyBody = z.input<typeof otpVerifyBodySchema>;

export const userProfileSchema = z.strictObject({
  id: z.uuid(),
  coldlink_id: z.string().regex(/^\d{7}$/),
  // The network prefix and last four digits: the full number never leaves the API.
  phone_masked: z.string().regex(/^\+234\d{3}\*{3}\d{4}$/),
  full_name: z.string().nullable(),
  roles: z.array(userRoleSchema).min(1),
  preferred_channel: preferredChannelSchema,
  home_lga: z.string().nullable(),
  home_lat: z.number().nullable(),
  home_lng: z.number().nullable(),
  consented_at: z.iso.datetime().nullable(),
  created_at: z.iso.datetime(),
});
export type UserProfile = z.infer<typeof userProfileSchema>;

export const sessionResponseSchema = z.strictObject({
  access_token: z.string().min(1),
  token_type: z.literal('Bearer'),
  expires_in: z.int().positive(),
  /** True only on the sign-in that created the account, to show the new ColdLink ID. */
  is_new_user: z.boolean(),
  user: userProfileSchema,
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

const { shape: profile } = userProfileSchema;

export const updateProfileBodySchema = z
  .strictObject({
    full_name: z.string().trim().min(1, 'Enter your name').max(100).nullable().optional(),
    preferred_channel: profile.preferred_channel.optional(),
    home_lga: z.string().trim().min(1, 'Enter your LGA').max(60).nullable().optional(),
    home_lat: z.number().min(-90).max(90).nullable().optional(),
    home_lng: z.number().min(-180).max(180).nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'Send at least one field to change' })
  .refine(
    (body) =>
      (body.home_lat === undefined) === (body.home_lng === undefined) &&
      (body.home_lat === null) === (body.home_lng === null),
    { path: ['home_lng'], message: 'Send home_lat and home_lng together' },
  );
export type UpdateProfileBody = z.input<typeof updateProfileBodySchema>;
export type UpdateProfileChanges = z.output<typeof updateProfileBodySchema>;
