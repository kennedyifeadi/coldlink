import * as z from 'zod';
import {
  otpRequestResponseSchema,
  sessionResponseSchema,
  type OtpRequestBody,
  type OtpVerifyBody,
} from '@coldlink/shared';
import { apiRequest } from './client';

export const requestOtp = (body: OtpRequestBody) =>
  apiRequest('/auth/otp/request', { method: 'POST', body, schema: otpRequestResponseSchema });

export const verifyOtp = (body: OtpVerifyBody) =>
  apiRequest('/auth/otp/verify', { method: 'POST', body, schema: sessionResponseSchema });

export const refreshSession = () =>
  apiRequest('/auth/refresh', { method: 'POST', schema: sessionResponseSchema });

export const logout = () => apiRequest('/auth/logout', { method: 'POST', schema: z.undefined() });
