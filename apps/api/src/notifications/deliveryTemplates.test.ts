import { describe, expect, it, vi } from 'vitest';
import * as z from 'zod';
import { createDeliverySmsTemplates, type DeliverySmsTemplates } from './deliveryTemplates.js';
import { gsm7Parts } from './gsm7.js';
import type { TemplateParams } from './templates.js';

const deliveryId = '6c1d3f5a-9e66-4d2b-8a8f-2a3b4c5d6e7f';
const partnerId = '7d2e4a6b-0f77-4e3c-9b9a-3b4c5d6e7f80';
// A 43-character token, as issueDeliveryToken makes, behind a long origin.
const token = 'Xq3vT9bLk2NwPz7RfYc5HmA8sD1gJ4eU6oVtKiQ0lBn';
const link = `https://coldlink-web-production.onrender.com/d/${token}`;

const relinkJob = vi.fn<(deliveryId: string, partnerId: string) => Promise<string | undefined>>();
const relinkUpdate =
  vi.fn<(deliveryId: string, partnerId: string) => Promise<string | undefined>>();
const handoverCodeForResend = vi.fn<(deliveryId: string) => Promise<string | undefined>>();
const templates = createDeliverySmsTemplates({ relinkJob, relinkUpdate, handoverCodeForResend });

type Params<Name extends keyof DeliverySmsTemplates> = TemplateParams<DeliverySmsTemplates, Name>;

const job: Params<'delivery_job'> = {
  delivery_id: deliveryId,
  partner_id: partnerId,
  booking_code: 'CL-AB2CD',
  direction: 'inbound',
  scheduled_for: '2026-11-18',
  load_quantity: 5,
  load_unit: 'crates',
  vehicle_type: 'bike',
  distance_km: 14.5,
  facility_name: 'Bodija Cold Room',
  payout_kobo: 196_000,
  link,
};
const partnerLink: Params<'delivery_partner_link'> = {
  delivery_id: deliveryId,
  partner_id: partnerId,
  booking_code: 'CL-AB2CD',
  scheduled_for: '2026-11-18',
  link,
};
const update = {
  delivery_id: deliveryId,
  booking_code: 'CL-AB2CD',
  scheduled_for: '2026-11-18',
} as const;
const pickedUp: Params<'delivery_update'> = {
  ...update,
  kind: 'picked_up',
  handover_code: '0427',
};
const cancelled: Params<'delivery_cancelled'> = {
  booking_code: 'CL-AB2CD',
  scheduled_for: '2026-11-18',
};

// Typed names as long as their fields allow, in characters that are not GSM-7, and the largest
// numbers a delivery could carry. Typed so a new template fails until it is added here.
const longName = 'Ọ̀yọ́ '.repeat(20).slice(0, 80);
const longest: { [Name in keyof DeliverySmsTemplates]: Params<Name>[] } = {
  delivery_job: (['inbound', 'outbound'] as const).map((direction) => ({
    ...job,
    direction,
    facility_name: longName,
    load_quantity: 12_345.678,
    load_unit: 'crates',
    vehicle_type: 'tricycle',
    distance_km: 1_234.5,
    payout_kobo: 99_999_999_999,
  })),
  delivery_partner_link: [partnerLink],
  delivery_update: [
    { ...update, kind: 'accepted', partner_name: `${longName} Logistics Nigeria Limited` },
    pickedUp,
    { ...update, kind: 'delivered' },
  ],
  delivery_cancelled: [cancelled],
};

function render<Name extends keyof DeliverySmsTemplates>(name: Name, params: Params<Name>): string {
  return templates[name].prepare(params).text;
}

describe('delivery SMS templates', () => {
  describe.each(Object.entries(longest))('%s', (name, cases) => {
    it.each(cases)('stays within two GSM-7 parts at its longest', (params) => {
      const text = render(name as keyof DeliverySmsTemplates, params as never);
      expect(gsm7Parts(text)).toBeGreaterThanOrEqual(1);
      expect(gsm7Parts(text)).toBeLessThanOrEqual(2);
      expect(text).not.toContain('₦');
    });
  });

  describe('delivery_job', () => {
    it('tells the partner the day, load, vehicle, trip, payout and where to answer', () => {
      expect(render('delivery_job', job)).toBe(
        'ColdLink delivery job for 18 Nov 2026: 5 crates by bike, 14.5 km from the farmer to ' +
          `Bodija Cold Room. You earn NGN 1,960. Accept or decline: ${link}`,
      );
    });

    it('names the facility first for an outbound delivery', () => {
      expect(render('delivery_job', { ...job, direction: 'outbound' })).toContain(
        '14.5 km from Bodija Cold Room to the farmer.',
      );
    });

    it('stores everything but the link', () => {
      const { payload } = templates.delivery_job.prepare(job);
      const { link: _link, ...rest } = job;
      expect(payload).toEqual(rest);
      expect(JSON.stringify(payload)).not.toContain(token);
    });

    it('is resent with a fresh link for the same partner', async () => {
      const { payload } = templates.delivery_job.prepare(job);
      relinkJob.mockResolvedValueOnce('https://app.coldlink.test/d/fresh');

      await expect(templates.delivery_job.rerender(payload)).resolves.toEqual({
        text: expect.stringMatching(/: https:\/\/app\.coldlink\.test\/d\/fresh$/) as string,
      });
      expect(relinkJob).toHaveBeenLastCalledWith(deliveryId, partnerId);
    });

    it('is not resent once the job is no longer offered to that partner', async () => {
      const { payload } = templates.delivery_job.prepare(job);
      relinkJob.mockResolvedValueOnce(undefined);

      await expect(templates.delivery_job.rerender(payload)).resolves.toEqual({
        refused: 'The message no longer applies',
      });
    });
  });

  describe('delivery_partner_link', () => {
    it('gives the partner the link for pickup and delivery', () => {
      expect(render('delivery_partner_link', partnerLink)).toBe(
        'ColdLink: you accepted the delivery for booking CL-AB2CD on 18 Nov 2026. Mark it picked ' +
          `up, then delivered, here: ${link}`,
      );
    });

    it('is resent with a fresh link, and stores none', async () => {
      const { payload } = templates.delivery_partner_link.prepare(partnerLink);
      expect(JSON.stringify(payload)).not.toContain(token);
      relinkUpdate.mockResolvedValueOnce('https://app.coldlink.test/d/again');

      await expect(templates.delivery_partner_link.rerender(payload)).resolves.toEqual({
        text: expect.stringMatching(/here: https:\/\/app\.coldlink\.test\/d\/again$/) as string,
      });
      expect(relinkUpdate).toHaveBeenLastCalledWith(deliveryId, partnerId);
    });
  });

  describe('delivery_update', () => {
    it('tells the farmer who accepted', () => {
      expect(
        render('delivery_update', { ...update, kind: 'accepted', partner_name: 'Swift Riders' }),
      ).toBe('ColdLink: Swift Riders will carry the delivery for booking CL-AB2CD on 18 Nov 2026.');
    });

    it('gives the farmer the handover code at pickup, keeping its leading zero', () => {
      expect(render('delivery_update', pickedUp)).toBe(
        'ColdLink: the load for booking CL-AB2CD has been picked up. Handover code: 0427. Give it ' +
          'only to whoever receives the load; the driver needs it.',
      );
    });

    it('says when it is delivered', () => {
      expect(render('delivery_update', { ...update, kind: 'delivered' })).toBe(
        'ColdLink: the load for booking CL-AB2CD has been delivered.',
      );
    });

    it('never stores the handover code', () => {
      const { payload } = templates.delivery_update.prepare(pickedUp);
      expect(payload).toEqual({ ...update, kind: 'picked_up' });
      expect(JSON.stringify(payload)).not.toContain('0427');
    });

    it('reads the code again for a resend while the load is still picked up', async () => {
      const { payload } = templates.delivery_update.prepare(pickedUp);
      handoverCodeForResend.mockResolvedValueOnce('0427');

      await expect(templates.delivery_update.rerender(payload)).resolves.toEqual({
        text: render('delivery_update', pickedUp),
      });
      expect(handoverCodeForResend).toHaveBeenLastCalledWith(deliveryId);
    });

    it('is not resent at pickup once the delivery has moved on', async () => {
      const { payload } = templates.delivery_update.prepare(pickedUp);
      handoverCodeForResend.mockResolvedValueOnce(undefined);

      await expect(templates.delivery_update.rerender(payload)).resolves.toEqual({
        refused: 'The message no longer applies',
      });
    });

    it('resends the other updates as stored', async () => {
      const delivered = { ...update, kind: 'delivered' } as const;
      const { payload } = templates.delivery_update.prepare(delivered);

      await expect(templates.delivery_update.rerender(payload)).resolves.toEqual({
        text: render('delivery_update', delivered),
      });
    });

    it.each([
      ['a pickup without the code', { ...update, kind: 'picked_up' }],
      ['the code on another update', { ...update, kind: 'delivered', handover_code: '0427' }],
      ['a code that is not 4 digits', { ...pickedUp, handover_code: '427' }],
    ])('refuses %s', (_case, params) => {
      expect(() => templates.delivery_update.prepare(params)).toThrow(z.ZodError);
    });
  });

  describe('delivery_cancelled', () => {
    it('tells the partner not to collect', () => {
      expect(render('delivery_cancelled', cancelled)).toBe(
        "ColdLink: the delivery for booking CL-AB2CD on 18 Nov 2026 is cancelled. Please don't " +
          'collect the load.',
      );
    });
  });
});
