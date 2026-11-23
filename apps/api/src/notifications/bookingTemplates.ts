import {
  bookingCodeSchema,
  capacityUnitSchema,
  e164PhoneSchema,
  koboSchema,
  type CapacityUnit,
} from '@coldlink/shared';
import * as z from 'zod';
import { clipGsm7 } from './gsm7.js';
import { linkTemplate, retryableTemplate, type TemplateRegistry } from './templates.js';

// Typed fields are clipped so that, with the longest of everything else, each message stays
// within two GSM-7 parts (decision 105). Facility names may be 80 characters, addresses 200 and
// landmarks 120 (providerFields).
const MAX_FACILITY_NAME = 30;
const MAX_CROP_NAME = 25;
const MAX_ADDRESS = 90;
const MAX_LANDMARK = 45;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Lagos is UTC+1 all year.
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

// ASCII digits and commas whatever the server's locale; "₦" is not GSM-7 (decision 105).
const nairaFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nairaWithKoboFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 });
const quantityFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

/** "NGN 30,483", or "NGN 30,483.50" when there are kobo. */
export function formatNgn(kobo: number): string {
  const naira = kobo / 100;
  return `NGN ${(Number.isInteger(naira) ? nairaFormat : nairaWithKoboFormat).format(naira)}`;
}

function day(date: Date, withYear: boolean): string {
  const text = `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
  return withYear ? `${text} ${date.getUTCFullYear()}` : text;
}

/** A 'YYYY-MM-DD' calendar date as "1 Dec 2026". */
function formatDate(isoDate: string): string {
  return day(new Date(`${isoDate}T00:00:00Z`), true);
}

/** "1 Dec to 31 Dec 2026", with the first year only when the years differ. */
function formatPeriod(startDate: string, endDate: string): string {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  return `${day(start, !sameYear)} to ${day(end, true)}`;
}

/** An instant on the Lagos clock as "3:45 PM, 10 Nov". */
function formatDeadline(isoInstant: string): string {
  const lagos = new Date(Date.parse(isoInstant) + LAGOS_OFFSET_MS);
  const hours = lagos.getUTCHours();
  const minutes = String(lagos.getUTCMinutes()).padStart(2, '0');
  const period = hours < 12 ? 'AM' : 'PM';
  return `${hours % 12 || 12}:${minutes} ${period}, ${day(lagos, false)}`;
}

const unitNames: Record<CapacityUnit, { one: string; many: string }> = {
  crates: { one: 'crate', many: 'crates' },
  kg: { one: 'kg', many: 'kg' },
  sqm: { one: 'sqm', many: 'sqm' },
};

/** "2 sqm", "1 crate", "250 kg". */
function formatQuantity(quantity: number, unit: CapacityUnit): string {
  const name = unitNames[unit];
  return `${quantityFormat.format(quantity)} ${quantity === 1 ? name.one : name.many}`;
}

/** "+2348031234567" as "0803 123 4567", as Nigerians write and dial it. */
function formatPhone(phone: string): string {
  const local = `0${phone.slice(4)}`;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

const facility = (name: string) => clipGsm7(name, MAX_FACILITY_NAME);

const code = bookingCodeSchema;
const kobo = koboSchema.nonnegative();

export const bookingReceivedParams = z.object({
  booking_id: z.uuid(),
  code,
  facility_name: z.string(),
  crop_name: z.string(),
  quantity: z.number().positive(),
  capacity_unit: capacityUnitSchema,
  start_date: z.iso.date(),
  end_date: z.iso.date(),
  payout_kobo: kobo,
  response_due_at: z.iso.datetime(),
});

export interface BookingSmsTemplateDependencies {
  /** A fresh accept/reject link for a resend, or undefined once the booking is not waiting. */
  relinkProvider: (bookingId: string) => Promise<string | undefined>;
}

/** The booking SMS and reminders of PRD 7.6, plus `booking_paid` (decision 105). */
export function createBookingSmsTemplates({ relinkProvider }: BookingSmsTemplateDependencies) {
  return {
    booking_received: linkTemplate({
      stored: bookingReceivedParams,
      render: (p) =>
        `ColdLink booking ${p.code} for ${facility(p.facility_name)}: ` +
        `${formatQuantity(p.quantity, p.capacity_unit)} of ${clipGsm7(p.crop_name, MAX_CROP_NAME)}, ` +
        `${formatPeriod(p.start_date, p.end_date)}. ColdLink pays you ${formatNgn(p.payout_kobo)}. ` +
        `Accept or reject by ${formatDeadline(p.response_due_at)}: ${p.link}`,
      relink: ({ booking_id }) => relinkProvider(booking_id),
    }),
    booking_paid: retryableTemplate({
      params: z.object({ code, facility_name: z.string(), response_due_at: z.iso.datetime() }),
      render: (p) =>
        `ColdLink: payment received for booking ${p.code}. Waiting for ` +
        `${facility(p.facility_name)} to confirm by ${formatDeadline(p.response_due_at)}. ` +
        `We will text you their answer.`,
    }),
    booking_confirmed: retryableTemplate({
      params: z.object({
        code,
        facility_name: z.string(),
        address_text: z.string(),
        landmark: z.string().nullable(),
        facility_phone: e164PhoneSchema,
        start_date: z.iso.date(),
      }),
      render: (p) => {
        const landmark = clipGsm7(p.landmark ?? '', MAX_LANDMARK);
        const near = landmark === '' ? '' : ` (near ${landmark})`;
        return (
          `ColdLink: ${facility(p.facility_name)} confirmed booking ${p.code}. ` +
          `Bring your produce from ${formatDate(p.start_date)} to ` +
          `${clipGsm7(p.address_text, MAX_ADDRESS)}${near}. Call ${formatPhone(p.facility_phone)}`
        );
      },
    }),
    booking_rejected: retryableTemplate({
      params: z.object({
        code,
        facility_name: z.string(),
        reason: z.enum(['rejected', 'expired']),
        refund_kobo: kobo,
      }),
      render: (p) => {
        const answer = p.reason === 'rejected' ? 'could not take' : 'did not answer in time for';
        return (
          `ColdLink: ${facility(p.facility_name)} ${answer} booking ${p.code}. ` +
          `Your refund of ${formatNgn(p.refund_kobo)} is on its way.`
        );
      },
    }),
    // The reminders of PRD 7.6, from the reminder job (decision 116). end_date is the day the
    // produce must be collected (decision 107's "Collect today").
    expiry_reminder: retryableTemplate({
      params: z.object({
        code,
        facility_name: z.string(),
        end_date: z.iso.date(),
        kind: z.enum(['expiry_two_days_before', 'expiry_last_day']),
      }),
      render: (p) => {
        const ends =
          p.kind === 'expiry_last_day'
            ? `ends today, ${formatDate(p.end_date)}. Please collect your produce today.`
            : `ends on ${formatDate(p.end_date)}. Please collect your produce by then.`;
        return `ColdLink: your booking ${p.code} at ${facility(p.facility_name)} ${ends}`;
      },
    }),
    collection_reminder: retryableTemplate({
      params: z.object({ code, facility_name: z.string(), end_date: z.iso.date() }),
      render: (p) =>
        `ColdLink: the produce for booking ${p.code} at ${facility(p.facility_name)} is due ` +
        `for collection today, ${formatDate(p.end_date)}.`,
    }),
  } satisfies TemplateRegistry;
}

export type BookingSmsTemplates = ReturnType<typeof createBookingSmsTemplates>;
