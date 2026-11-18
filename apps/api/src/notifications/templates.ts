import * as z from 'zod';
import type { Json, JsonObject } from '../db/schema.js';

export interface PreparedMessage {
  text: string;
  /** What `notifications.payload` stores. */
  payload: JsonObject;
}

/** The text for a resend, or why the queue must not send the message again. */
export type RerenderedMessage = { text: string } | { refused: string };

export interface SmsTemplate<Params extends z.ZodType = z.ZodType> {
  params: Params;
  /** Whether a failed send is queued for a retry. Only a template that can rerender may be. */
  retryable: boolean;
  /** Validates the params, throwing on bad input, and renders the text and payload. */
  prepare(params: unknown): PreparedMessage;
  /** Renders a queued message again from its stored payload, for the queue's resend. */
  rerender(payload: Json): Promise<RerenderedMessage>;
}

export type TemplateRegistry = Record<string, SmsTemplate>;

interface TemplateDefinition<Params extends z.ZodType> {
  params: Params;
  /** Short plain-English text (PRD 7.6) in GSM-7, of one SMS part or at most two. */
  render: (params: z.output<Params>) => string;
}

const PAYLOAD_MISFIT: RerenderedMessage = {
  refused: 'The stored payload no longer fits the template',
};

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
    rerender(payload) {
      const parsed = params.safeParse(payload);
      return Promise.resolve(parsed.success ? { text: render(parsed.data) } : PAYLOAD_MISFIT);
    },
  };
}

/**
 * For a message carrying a link that works without signing in, which is as good as a password:
 * the link is never stored, only the `stored` params. A resend asks `relink` for a fresh link,
 * and is refused when it gives none because the message no longer applies.
 */
export function linkTemplate<Stored extends z.ZodObject>({
  stored,
  render,
  relink,
}: {
  stored: Stored;
  render: (params: z.output<Stored> & { link: string }) => string;
  relink: (params: z.output<Stored>) => Promise<string | undefined>;
}) {
  const link = z.object({ link: z.url() });
  const params = stored.extend(link.shape);
  return {
    params,
    retryable: true,
    prepare(input) {
      const kept = stored.parse(input);
      const { link: url } = link.parse(input);
      return { text: render({ ...kept, link: url }), payload: kept as JsonObject };
    },
    async rerender(payload) {
      const kept = stored.safeParse(payload);
      if (!kept.success) return PAYLOAD_MISFIT;
      const url = await relink(kept.data);
      if (url === undefined) return { refused: 'The message no longer applies' };
      return { text: render({ ...kept.data, link: url }) };
    },
  } satisfies SmsTemplate<typeof params>;
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
    rerender: () => Promise.resolve({ refused: 'Not retryable: the message was never stored' }),
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
