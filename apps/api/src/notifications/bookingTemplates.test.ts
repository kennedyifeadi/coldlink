import { describe, expect, it, vi } from 'vitest';
import * as z from 'zod';
import {
  createBookingSmsTemplates,
  formatNgn,
  type BookingSmsTemplates,
} from './bookingTemplates.js';
import { gsm7Parts } from './gsm7.js';
import type { TemplateParams } from './templates.js';

const bookingId = '5b0c2f4e-8d55-4c1a-9f7e-1f2a3b4c5d6e';
// A 43-character token, as issueProviderActionToken makes, behind a long origin.
const token = 'Xq3vT9bLk2NwPz7RfYc5HmA8sD1gJ4eU6oVtKiQ0lBn';
const link = `https://coldlink-web-production.onrender.com/a/${token}`;
// 14:45 UTC is 3:45 PM in Lagos.
const dueAt = '2026-11-10T14:45:00.000Z';

const relinkProvider = vi.fn<(bookingId: string) => Promise<string | undefined>>();
const templates = createBookingSmsTemplates({ relinkProvider });

type Params<Name extends keyof BookingSmsTemplates> = TemplateParams<BookingSmsTemplates, Name>;

const received: Params<'booking_received'> = {
  booking_id: bookingId,
  code: 'CL-AB2CD',
  facility_name: 'Bodija Cold Room',
  crop_name: 'Tomatoes',
  quantity: 2,
  capacity_unit: 'sqm',
  start_date: '2026-12-01',
  end_date: '2026-12-31',
  payout_kobo: 3_048_300,
  response_due_at: dueAt,
  link,
};
const paid: Params<'booking_paid'> = {
  code: 'CL-AB2CD',
  facility_name: 'Bodija Cold Room',
  response_due_at: dueAt,
};
const confirmed: Params<'booking_confirmed'> = {
  code: 'CL-AB2CD',
  facility_name: 'Bodija Cold Room',
  address_text: '12 Ring Road, Ibadan',
  landmark: 'Opposite the market gate',
  facility_phone: '+2348031234567',
  start_date: '2026-12-01',
};
const rejected: Params<'booking_rejected'> = {
  code: 'CL-AB2CD',
  facility_name: 'Bodija Cold Room',
  reason: 'rejected',
  refund_kobo: 4_064_400,
};

const expiry: Params<'expiry_reminder'> = {
  code: 'CL-AB2CD',
  facility_name: 'Bodija Cold Room',
  end_date: '2026-12-31',
  kind: 'expiry_two_days_before',
};
const collection: Params<'collection_reminder'> = {
  code: 'CL-AB2CD',
  facility_name: 'Bodija Cold Room',
  end_date: '2026-12-31',
};

// Each typed field as long as providerFields allows, in characters that are not GSM-7, and the
// largest numbers a booking could carry. Typed so a new template fails until it is added here.
const longName = 'Ọ̀yọ́ '.repeat(20).slice(0, 80);
const longest: { [Name in keyof BookingSmsTemplates]: Params<Name>[] } = {
  booking_received: [
    {
      ...received,
      facility_name: longName,
      crop_name: 'Other meat and poultry from the long list',
      quantity: 12_345.67,
      capacity_unit: 'crates',
      start_date: '2026-12-28',
      end_date: '2027-12-28',
      payout_kobo: 99_999_999_999,
      response_due_at: '2026-12-28T11:59:00.000Z',
    },
  ],
  booking_paid: [{ ...paid, facility_name: longName, response_due_at: '2026-12-28T11:59:00.000Z' }],
  booking_confirmed: [
    {
      ...confirmed,
      facility_name: longName,
      address_text: `₦ ${'Plot 12, Ring Road – Ibadan’s '.repeat(10)}`.slice(0, 200),
      landmark: '“Opposite” '.repeat(12).slice(0, 120),
    },
  ],
  booking_rejected: (['rejected', 'expired'] as const).map((reason) => ({
    ...rejected,
    facility_name: longName,
    reason,
    refund_kobo: 99_999_999_999,
  })),
  expiry_reminder: (['expiry_two_days_before', 'expiry_last_day'] as const).map((kind) => ({
    ...expiry,
    facility_name: longName,
    end_date: '2027-12-28',
    kind,
  })),
  collection_reminder: [{ ...collection, facility_name: longName, end_date: '2027-12-28' }],
};

function render<Name extends keyof BookingSmsTemplates>(name: Name, params: Params<Name>): string {
  return templates[name].prepare(params).text;
}

describe('booking SMS templates', () => {
  describe.each(Object.entries(longest))('%s', (name, cases) => {
    it.each(cases)('stays within two GSM-7 parts at its longest', (params) => {
      const text = render(name as keyof BookingSmsTemplates, params as never);
      expect(gsm7Parts(text)).toBeGreaterThanOrEqual(1);
      expect(gsm7Parts(text)).toBeLessThanOrEqual(2);
      expect(text).not.toContain('₦');
    });
  });

  describe('booking_received', () => {
    it('tells the provider what was booked, the payout and where to answer', () => {
      expect(render('booking_received', received)).toBe(
        'ColdLink booking CL-AB2CD for Bodija Cold Room: 2 sqm of Tomatoes, 1 Dec to 31 Dec 2026. ' +
          `ColdLink pays you NGN 30,483. Accept or reject by 3:45 PM, 10 Nov: ${link}`,
      );
    });

    it('stores everything but the link', () => {
      const { payload } = templates.booking_received.prepare(received);
      const { link: _link, ...rest } = received;
      expect(payload).toEqual(rest);
      expect(JSON.stringify(payload)).not.toContain(token);
    });

    it('is resent with a fresh link', async () => {
      const { payload } = templates.booking_received.prepare(received);
      relinkProvider.mockResolvedValueOnce('https://app.coldlink.test/a/fresh');

      await expect(templates.booking_received.rerender(payload)).resolves.toEqual({
        text: expect.stringMatching(/: https:\/\/app\.coldlink\.test\/a\/fresh$/) as string,
      });
      expect(relinkProvider).toHaveBeenLastCalledWith(bookingId);
    });

    it('is not resent once the booking stops waiting', async () => {
      const { payload } = templates.booking_received.prepare(received);
      relinkProvider.mockResolvedValueOnce(undefined);

      await expect(templates.booking_received.rerender(payload)).resolves.toEqual({
        refused: 'The message no longer applies',
      });
    });

    it.each([
      ['one crate', { quantity: 1, capacity_unit: 'crates' }, '1 crate of'],
      ['crates', { quantity: 1_200, capacity_unit: 'crates' }, '1,200 crates of'],
      ['kg with a fraction', { quantity: 2.5, capacity_unit: 'kg' }, '2.5 kg of'],
    ] as const)('writes %s plainly', (_case, change, expected) => {
      expect(render('booking_received', { ...received, ...change })).toContain(expected);
    });

    it('writes both years when the booking crosses into the next', () => {
      expect(
        render('booking_received', {
          ...received,
          start_date: '2026-12-20',
          end_date: '2027-01-19',
        }),
      ).toContain('20 Dec 2026 to 19 Jan 2027.');
    });

    it.each([
      ['2026-11-10T23:30:00.000Z', '12:30 AM, 11 Nov'],
      ['2026-11-10T11:05:00.000Z', '12:05 PM, 10 Nov'],
    ])('gives the deadline %s on the Lagos clock as %s', (instant, expected) => {
      expect(render('booking_received', { ...received, response_due_at: instant })).toContain(
        `Accept or reject by ${expected}:`,
      );
    });

    it('refuses a booking without a link', () => {
      const { link: _link, ...withoutLink } = received;
      expect(() => templates.booking_received.prepare(withoutLink)).toThrow(z.ZodError);
    });
  });

  describe('booking_paid', () => {
    it('gives the farmer the code and who must confirm by when', () => {
      expect(render('booking_paid', paid)).toBe(
        'ColdLink: payment received for booking CL-AB2CD. Waiting for Bodija Cold Room to confirm ' +
          'by 3:45 PM, 10 Nov. We will text you their answer.',
      );
    });
  });

  describe('booking_confirmed', () => {
    it('gives the farmer the code, the address and landmark, and the facility phone', () => {
      expect(render('booking_confirmed', confirmed)).toBe(
        'ColdLink: Bodija Cold Room confirmed booking CL-AB2CD. Bring your produce from 1 Dec 2026 ' +
          'to 12 Ring Road, Ibadan (near Opposite the market gate). Call 0803 123 4567',
      );
    });

    it.each([null, '', '  '])('leaves out a landmark of %j', (landmark) => {
      expect(render('booking_confirmed', { ...confirmed, landmark })).toContain(
        'to 12 Ring Road, Ibadan. Call',
      );
    });
  });

  describe('booking_rejected', () => {
    it('tells the farmer a rejection is being refunded', () => {
      expect(render('booking_rejected', rejected)).toBe(
        'ColdLink: Bodija Cold Room could not take booking CL-AB2CD. ' +
          'Your refund of NGN 40,644 is on its way.',
      );
    });

    it('tells the farmer an unanswered booking is being refunded', () => {
      expect(render('booking_rejected', { ...rejected, reason: 'expired' })).toBe(
        'ColdLink: Bodija Cold Room did not answer in time for booking CL-AB2CD. ' +
          'Your refund of NGN 40,644 is on its way.',
      );
    });
  });
});

describe('reminders', () => {
  it('tells the farmer two days ahead which booking ends, where and on what day', () => {
    expect(render('expiry_reminder', expiry)).toBe(
      'ColdLink: your booking CL-AB2CD at Bodija Cold Room ends on 31 Dec 2026. ' +
        'Please collect your produce by then.',
    );
  });

  it('tells the farmer on the last day that it is today', () => {
    expect(render('expiry_reminder', { ...expiry, kind: 'expiry_last_day' })).toBe(
      'ColdLink: your booking CL-AB2CD at Bodija Cold Room ends today, 31 Dec 2026. ' +
        'Please collect your produce today.',
    );
  });

  it('tells the provider the produce is due for collection today', () => {
    expect(render('collection_reminder', collection)).toBe(
      'ColdLink: the produce for booking CL-AB2CD at Bodija Cold Room is due for collection ' +
        'today, 31 Dec 2026.',
    );
  });

  it('fit one part with an ordinary facility name', () => {
    expect(gsm7Parts(render('expiry_reminder', expiry))).toBe(1);
    expect(gsm7Parts(render('expiry_reminder', { ...expiry, kind: 'expiry_last_day' }))).toBe(1);
    expect(gsm7Parts(render('collection_reminder', collection))).toBe(1);
  });

  it('are resent from their stored params', async () => {
    const { payload } = templates.collection_reminder.prepare(collection);
    expect(payload).toEqual(collection);
    await expect(templates.collection_reminder.rerender(payload)).resolves.toEqual({
      text: render('collection_reminder', collection),
    });
  });

  it('refuse a kind that is not an expiry reminder', () => {
    expect(() => templates.expiry_reminder.prepare({ ...expiry, kind: 'collection_due' })).toThrow(
      z.ZodError,
    );
  });
});

describe('formatNgn', () => {
  it.each([
    [0, 'NGN 0'],
    [3_048_300, 'NGN 30,483'],
    [3_048_350, 'NGN 30,483.50'],
    [1, 'NGN 0.01'],
  ])('writes %i kobo as %s', (kobo, expected) => {
    expect(formatNgn(kobo)).toBe(expected);
  });
});
