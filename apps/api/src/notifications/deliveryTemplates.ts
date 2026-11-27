import {
  bookingCodeSchema,
  capacityUnitSchema,
  deliveryDirectionSchema,
  handoverCodeSchema,
  koboSchema,
  vehicleTypeSchema,
  type DeliveryDirection,
} from '@coldlink/shared';
import * as z from 'zod';
import { formatDate, formatNgn, formatQuantity } from './bookingTemplates.js';
import { clipGsm7 } from './gsm7.js';
import {
  linkTemplate,
  retryableTemplate,
  type SmsTemplate,
  type TemplateRegistry,
} from './templates.js';

// As decision 105: typed names are GSM-7 and clipped, so each message stays within two parts with
// a link on a 44-character origin; most fit one.
const MAX_FACILITY_NAME = 30;
const MAX_COMPANY_NAME = 30;

const distanceFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

const ids = { delivery_id: z.uuid(), partner_id: z.uuid() };
const booking_code = bookingCodeSchema;
const scheduled_for = z.iso.date();

/** "from the farmer to Bodija Cold Room", or the other way for an outbound delivery. */
function route(direction: DeliveryDirection, facilityName: string): string {
  const facility = clipGsm7(facilityName, MAX_FACILITY_NAME);
  return direction === 'inbound'
    ? `from the farmer to ${facility}`
    : `from ${facility} to the farmer`;
}

export const deliveryJobParams = z.object({
  ...ids,
  booking_code,
  direction: deliveryDirectionSchema,
  scheduled_for,
  load_quantity: z.number().positive(),
  load_unit: capacityUnitSchema,
  vehicle_type: vehicleTypeSchema,
  distance_km: z.number().nonnegative(),
  facility_name: z.string(),
  payout_kobo: koboSchema.nonnegative(),
});

export const partnerLinkParams = z.object({ ...ids, booking_code, scheduled_for });

const deliveryUpdateKinds = ['accepted', 'picked_up', 'delivered'] as const;

const deliveryUpdateStored = z.object({
  delivery_id: z.uuid(),
  booking_code,
  scheduled_for,
  kind: z.enum(deliveryUpdateKinds),
  /** Who carries it, for `accepted`. */
  partner_name: z.string().optional(),
});

const deliveryUpdateParams = deliveryUpdateStored
  .extend({ handover_code: handoverCodeSchema.optional() })
  .refine((p) => (p.kind === 'picked_up') === (p.handover_code !== undefined), {
    path: ['handover_code'],
    message: 'The handover code goes with picked_up, and only with it',
  });

type DeliveryUpdate = z.output<typeof deliveryUpdateParams>;

function renderDeliveryUpdate(p: DeliveryUpdate): string {
  if (p.kind === 'accepted') {
    const carrier = clipGsm7(p.partner_name ?? 'A driver', MAX_COMPANY_NAME);
    return (
      `ColdLink: ${carrier} will carry the delivery for booking ${p.booking_code} ` +
      `on ${formatDate(p.scheduled_for)}.`
    );
  }
  if (p.kind === 'picked_up') {
    return (
      `ColdLink: the load for booking ${p.booking_code} has been picked up. Handover code: ` +
      `${p.handover_code ?? ''}. Give it only to whoever receives the load; the driver needs it.`
    );
  }
  return `ColdLink: the load for booking ${p.booking_code} has been delivered.`;
}

export interface DeliverySmsTemplateDependencies {
  /** A fresh accept link while the delivery is still offered to that partner. */
  relinkJob: (deliveryId: string, partnerId: string) => Promise<string | undefined>;
  /** A fresh update link while that partner still has the job in hand. */
  relinkUpdate: (deliveryId: string, partnerId: string) => Promise<string | undefined>;
  /** The handover code, while the delivery is still picked up and not yet delivered. */
  handoverCodeForResend: (deliveryId: string) => Promise<string | undefined>;
}

/**
 * `delivery_update` to the farmer. The pickup message carries the handover code, which is never
 * stored in `notifications` (decision 152): a resend reads it from the delivery again, and only
 * while it is still picked up.
 */
function deliveryUpdateTemplate(
  handoverCodeForResend: DeliverySmsTemplateDependencies['handoverCodeForResend'],
): SmsTemplate<typeof deliveryUpdateParams> {
  return {
    params: deliveryUpdateParams,
    retryable: true,
    prepare(input) {
      const parsed = deliveryUpdateParams.parse(input);
      return {
        text: renderDeliveryUpdate(parsed),
        payload: deliveryUpdateStored.parse(parsed),
      };
    },
    async rerender(payload) {
      const stored = deliveryUpdateStored.safeParse(payload);
      if (!stored.success) return { refused: 'The stored payload no longer fits the template' };
      if (stored.data.kind !== 'picked_up') return { text: renderDeliveryUpdate(stored.data) };
      const code = await handoverCodeForResend(stored.data.delivery_id);
      if (code === undefined) return { refused: 'The message no longer applies' };
      return { text: renderDeliveryUpdate({ ...stored.data, handover_code: code }) };
    },
  };
}

/** The delivery SMS of PRD 7.6 and decision 154. */
export function createDeliverySmsTemplates(deps: DeliverySmsTemplateDependencies) {
  return {
    // To the partner on assignment. The link carries the accept token, so it is never stored.
    delivery_job: linkTemplate({
      stored: deliveryJobParams,
      render: (p) =>
        `ColdLink delivery job for ${formatDate(p.scheduled_for)}: ` +
        `${formatQuantity(p.load_quantity, p.load_unit)} by ${p.vehicle_type}, ` +
        `${distanceFormat.format(p.distance_km)} km ${route(p.direction, p.facility_name)}. ` +
        `You earn ${formatNgn(p.payout_kobo)}. Accept or decline: ${p.link}`,
      relink: (p) => deps.relinkJob(p.delivery_id, p.partner_id),
    }),
    // To the partner once they accept: the link that marks the job picked up and delivered.
    delivery_partner_link: linkTemplate({
      stored: partnerLinkParams,
      render: (p) =>
        `ColdLink: you accepted the delivery for booking ${p.booking_code} on ` +
        `${formatDate(p.scheduled_for)}. Mark it picked up, then delivered, here: ${p.link}`,
      relink: (p) => deps.relinkUpdate(p.delivery_id, p.partner_id),
    }),
    delivery_update: deliveryUpdateTemplate(deps.handoverCodeForResend),
    // To the partner when a job they were given is cancelled (decision 148).
    delivery_cancelled: retryableTemplate({
      params: z.object({ booking_code, scheduled_for }),
      render: (p) =>
        `ColdLink: the delivery for booking ${p.booking_code} on ${formatDate(p.scheduled_for)} ` +
        `is cancelled. Please don't collect the load.`,
    }),
  } satisfies TemplateRegistry;
}

export type DeliverySmsTemplates = ReturnType<typeof createDeliverySmsTemplates>;
