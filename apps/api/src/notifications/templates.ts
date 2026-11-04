import * as z from 'zod';
import type { JsonObject } from '../db/schema.js';

export interface PreparedMessage {
  text: string;
  /** What `notifications.payload` stores. */
  payload: JsonObject;
}

export interface SmsTemplate<Params extends z.ZodType = z.ZodType> {
  params: Params;
  /** Whether the queue may send it again. Only a template that stores its params can be. */
  retryable: boolean;
  /** Validates the params, throwing on bad input, and renders the text and payload. */
  prepare(params: unknown): PreparedMessage;
}

export type TemplateRegistry = Record<string, SmsTemplate>;

interface TemplateDefinition<Params extends z.ZodType> {
  params: Params;
  /** Short plain-English text (PRD 7.6) that fits one SMS segment. */
  render: (params: z.output<Params>) => string;
}

/** Stores its params as the payload, so the queue can render it again for a retry. */
export function retryableTemplate<Params extends z.ZodType<JsonObject>>({
  params,
  render,
}: TemplateDefinition<Params>): SmsTemplate<Params> {
  return {
    params,
    retryable: true,
    prepare(input) {
      const parsed = params.parse(input);
      return { text: render(parsed), payload: parsed };
    },
  };
}

/**
 * For a message holding a secret: its params are never stored, so it is sent once and never
 * retried. Only the non-secret `metadata` is kept as the payload.
 */
export function singleAttemptTemplate<Params extends z.ZodType>({
  params,
  render,
  metadata,
}: TemplateDefinition<Params> & {
  metadata: (params: z.output<Params>) => JsonObject;
}): SmsTemplate<Params> {
  return {
    params,
    retryable: false,
    prepare(input) {
      const parsed = params.parse(input);
      return { text: render(parsed), payload: metadata(parsed) };
    },
  };
}

export const smsTemplates = {
  // The code is never stored: otp_codes keeps only its hash (decision 29).
  otp: singleAttemptTemplate({
    params: z.object({
      code: z.string().regex(/^\d{6}$/, 'Must be 6 digits'),
      expires_in_minutes: z.number().int().min(1).max(60),
    }),
    render: ({ code, expires_in_minutes }) =>
      `Your ColdLink code is ${code}. It expires in ${expires_in_minutes} minutes. Don't share it.`,
    metadata: ({ expires_in_minutes }) => ({ expires_in_minutes }),
  }),
} satisfies TemplateRegistry;

export type TemplateParams<
  Registry extends TemplateRegistry,
  Name extends keyof Registry,
> = z.input<Registry[Name]['params']>;
