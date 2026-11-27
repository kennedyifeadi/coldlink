import {
  adminDeliverySchema,
  deliveryActionPath,
  errorResponseSchema,
  partnerDeliveryActionResultSchema,
  partnerDeliveryLinkSchema,
  type PartnerDeliveryActionBody,
} from '@coldlink/shared';
import { sql } from 'kysely';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createDatabase, type Database } from '../db/client.js';
import { createDeliveryLinks } from '../deliveries/partnerLinks.js';
import { createBookingServices } from '../services.js';
import { insertBooking, type BookingFixture } from '../test/bookings.js';
import {
  CONTACT_PHONE,
  DELIVERY_FEE,
  deleteDeliveryFixtures,
  deliveryRow,
  deliveryTokens,
  FARMER_ADDRESS,
  HANDOVER_CODE,
  insertPaidDelivery,
  insertPartner,
  PARTNER_PAYOUT,
  PLATFORM_MARGIN,
  tokenIn,
  type PartnerFixture,
} from '../test/deliveries.js';
import { captureLogs, testConfig } from '../test/helpers.js';
import { makeNotificationsDue } from '../test/jobs.js';
import { processNotificationQueue } from '../notifications/queue.js';
import { noTestDatabase, useTestTransaction } from '../test/integration.js';
import { fakeSmsProvider, retryableFailure, type FakeOutcome } from '../test/notifications.js';
import { fakePaymentGateway } from '../test/payments.js';
import { bearer, insertUserWithRoles } from '../test/providerActions.js';
import { requireTestDatabaseUrl } from '../test/testDatabase.js';
import { apiRoutes } from './index.js';

const NOT_FOUND = {
  error: { code: 'not_found', message: 'This link has expired or has already been used' },
};
const UNKNOWN_ID = '0b8f6a3e-2d4c-4b1a-9e7f-3c5d2a1b0e9f';

function build(db: Database, ...smsOutcomes: FakeOutcome[]) {
  const logs = captureLogs();
  const sms = fakeSmsProvider(...smsOutcomes);
  const payments = fakePaymentGateway();
  const services = createBookingServices({
    db,
    config: testConfig,
    logger: logs.logger,
    sms: sms.provider,
    gateway: payments.gateway,
  });
  const routes = apiRoutes({ db, config: testConfig, logger: logs.logger, services });
  const app = createApp(testConfig, { db, logger: logs.logger, routes });
  return { app, logs, sms, payments, services };
}

type Target = ReturnType<typeof build>;

function sentTo(target: Target, phone: string, template: string) {
  return target.sms.sent.filter((message) => message.to === phone && message.template === template);
}

function lastLink(target: Target, phone: string, template: string): string {
  return tokenIn(sentTo(target, phone, template).at(-1)?.text);
}

describe.skipIf(noTestDatabase)('delivery partner links against Postgres', () => {
  const db = useTestTransaction();
  let booking: BookingFixture;
  let deliveryId: string;
  let partner: PartnerFixture;
  let adminAuth: string;
  let farmerPhone: string;
  let target: Target;

  beforeEach(async () => {
    booking = await insertBooking(db(), 'confirmed');
    deliveryId = await insertPaidDelivery(db(), booking);
    partner = await insertPartner(db());
    adminAuth = await bearer(db(), await insertUserWithRoles(db(), ['admin']));
    ({ phone: farmerPhone } = await db()
      .selectFrom('users')
      .select('phone')
      .where('id', '=', booking.farmerId)
      .executeTakeFirstOrThrow());
    target = build(db());
  });

  function assign(partnerId = partner.partnerId, id = deliveryId, auth = adminAuth) {
    return request(target.app)
      .post(`/api/v1/admin/deliveries/${id}/assign`)
      .set('Authorization', auth)
      .send({ partner_id: partnerId });
  }

  async function acceptLink(to = partner): Promise<string> {
    expect((await assign(to.partnerId)).status).toBe(200);
    return lastLink(target, to.phone, 'delivery_job');
  }

  function open(token: string) {
    return request(target.app).get(`/api/v1/delivery-actions/${token}`);
  }

  function act(token: string, body: PartnerDeliveryActionBody) {
    return request(target.app).post(`/api/v1/delivery-actions/${token}`).send(body);
  }

  async function updateLink(): Promise<string> {
    const accepted = await act(await acceptLink(), { action: 'accept' });
    expect(accepted.status).toBe(200);
    return lastLink(target, partner.phone, 'delivery_partner_link');
  }

  async function pickedUpLink(): Promise<string> {
    const token = await updateLink();
    expect((await act(token, { action: 'picked_up' })).status).toBe(200);
    return token;
  }

  function expectNothingPrivate(body: unknown) {
    const text = JSON.stringify(body);
    expect(text).not.toContain(String(DELIVERY_FEE));
    expect(text).not.toContain(String(PLATFORM_MARGIN));
    expect(text).not.toContain(HANDOVER_CODE);
    expect(text).not.toMatch(/fee|margin|handover_code|deposit|total_charged|balance/);
  }

  describe('POST /admin/deliveries/:id/assign', () => {
    it('assigns a live requested delivery and texts the partner an accept link', async () => {
      const response = await assign();

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      const view = adminDeliverySchema.parse(response.body);
      expect(view).toMatchObject({
        id: deliveryId,
        booking_id: booking.bookingId,
        status: 'assigned',
        paid: true,
        partner: { id: partner.partnerId, covers_facility_lga: true },
        partner_payout_kobo: PARTNER_PAYOUT,
      });
      expect(JSON.stringify(view)).not.toContain(HANDOVER_CODE);
      expect(JSON.stringify(view)).not.toContain(CONTACT_PHONE);

      const row = await deliveryRow(db(), deliveryId);
      expect(row).toMatchObject({ status: 'assigned', partner_id: partner.partnerId });
      expect(row.assigned_at).toBeInstanceOf(Date);

      const [job] = sentTo(target, partner.phone, 'delivery_job');
      const token = tokenIn(job?.text);
      expect(job?.text).toContain(`https://app.coldlink.test${deliveryActionPath(token)}`);
      expect(job?.text).toContain('You earn NGN 1,960');
      expect(job?.text).not.toContain(HANDOVER_CODE);
      const tokens = await deliveryTokens(db(), deliveryId);
      expect(tokens).toEqual([
        expect.objectContaining({ purpose: 'delivery_accept', used_at: null }),
      ]);
      expect(JSON.stringify(tokens)).not.toContain(token);
    });

    it('keeps the accept link until the end of the scheduled day in Lagos', async () => {
      await acceptLink();
      const [token] = await deliveryTokens(db(), deliveryId);
      expect(token?.expires_at.toISOString()).toBe('2027-06-15T23:00:00.000Z');
    });

    it('logs delivery_job without its link', async () => {
      const token = await acceptLink();
      const rows = await db()
        .selectFrom('notifications')
        .select(['template', 'payload', 'status'])
        .where('user_id', '=', partner.userId)
        .execute();
      expect(rows).toEqual([expect.objectContaining({ template: 'delivery_job', status: 'sent' })]);
      expect(JSON.stringify(rows)).not.toContain(token);
    });

    it('is for admins only', async () => {
      const farmer = await bearer(db(), booking.farmerId);
      expect((await assign(partner.partnerId, deliveryId, farmer)).status).toBe(403);
      const anonymous = await request(target.app)
        .post(`/api/v1/admin/deliveries/${deliveryId}/assign`)
        .send({ partner_id: partner.partnerId });
      expect(anonymous.status).toBe(401);
      expect((await deliveryRow(db(), deliveryId)).status).toBe('requested');
    });

    it('is a 404 for an unknown delivery', async () => {
      expect((await assign(partner.partnerId, UNKNOWN_ID)).status).toBe(404);
    });

    it('refuses an unpaid delivery with 409', async () => {
      await db()
        .updateTable('delivery_requests')
        .set({ paid_at: null })
        .where('id', '=', deliveryId)
        .execute();
      const response = await assign();
      expect(response.status).toBe(409);
      expect(errorResponseSchema.parse(response.body).error.details).toMatchObject({
        status: 'requested',
      });
    });

    it.each(['cancelled', 'failed'])('refuses a %s delivery with 409', async (status) => {
      await db()
        .updateTable('delivery_requests')
        .set({ status })
        .where('id', '=', deliveryId)
        .execute();
      expect((await assign()).status).toBe(409);
    });

    it('refuses once the partner has accepted, and once delivered', async () => {
      const token = await updateLink();
      expect((await assign()).status).toBe(409);
      await act(token, { action: 'picked_up' });
      await act(token, { action: 'delivered', handover_code: HANDOVER_CODE });
      const response = await assign();
      expect(response.status).toBe(409);
      expect(errorResponseSchema.parse(response.body).error.details).toMatchObject({
        status: 'delivered',
      });
    });

    it.each([
      ['an inactive partner', { isActive: false }, 'This delivery partner is not active'],
      ['a partner without the vehicle', { vehicleTypes: ['van' as const] }, 'needs a bike'],
    ])('refuses %s with 400 on partner_id', async (_case, options, message) => {
      const other = await insertPartner(db(), options);
      const response = await assign(other.partnerId);
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: {
          code: 'validation_failed',
          details: [{ path: 'partner_id', message: expect.stringContaining(message) as string }],
        },
      });
      expect(target.sms.sent).toHaveLength(0);
    });

    it('refuses an unknown partner with 400 on partner_id', async () => {
      const response = await assign(UNKNOWN_ID);
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ error: { details: [{ path: 'partner_id' }] } });
    });

    it("warns, but assigns, when the partner does not cover the facility's LGA", async () => {
      await db()
        .updateTable('providers')
        .set({ lga: 'Ibadan North' })
        .where('id', '=', booking.providerId)
        .execute();
      const far = await insertPartner(db(), { coverageLgas: ['Saki West'] });
      const near = await insertPartner(db(), { coverageLgas: ['ibadan north'] });

      const farView = adminDeliverySchema.parse((await assign(far.partnerId)).body);
      expect(farView).toMatchObject({
        status: 'assigned',
        partner: { covers_facility_lga: false },
      });
      const nearView = adminDeliverySchema.parse((await assign(near.partnerId)).body);
      expect(nearView.partner?.covers_facility_lga).toBe(true);
    });

    it("reassigns before acceptance, revoking the old partner's link and telling them", async () => {
      const oldToken = await acceptLink();
      const other = await insertPartner(db());

      const response = await assign(other.partnerId);

      expect(response.status).toBe(200);
      expect((await open(oldToken)).body).toEqual(NOT_FOUND);
      expect((await act(oldToken, { action: 'accept' })).body).toEqual(NOT_FOUND);
      expect(sentTo(target, partner.phone, 'delivery_cancelled')).toHaveLength(1);
      const newToken = lastLink(target, other.phone, 'delivery_job');
      expect((await open(newToken)).status).toBe(200);
      expect((await deliveryRow(db(), deliveryId)).partner_id).toBe(other.partnerId);
    });
  });

  describe('GET /delivery-actions/:token', () => {
    it("shows the job before acceptance without the farmer's end or the contact", async () => {
      const response = await open(await acceptLink());

      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      const { link, job } = partnerDeliveryLinkSchema.parse(response.body);
      expect(link).toBe('accept');
      expect(job).toMatchObject({
        status: 'assigned',
        direction: 'inbound',
        scheduled_for: '2027-06-15',
        facility: { name: 'Booking test cold room', address: null },
        farmer_address: null,
        contact: null,
        load_quantity: 5,
        load_unit: 'crates',
        vehicle_type: 'bike',
        distance_km: 14.5,
        payout_kobo: PARTNER_PAYOUT,
        handover_attempts_left: 5,
      });
      const text = JSON.stringify(response.body);
      expect(text).not.toContain(CONTACT_PHONE);
      expect(text).not.toContain(FARMER_ADDRESS);
      expectNothingPrivate(response.body);
    });

    it('shows the contact and the full addresses once accepted, and still nothing private', async () => {
      const response = await open(await updateLink());

      const { link, job } = partnerDeliveryLinkSchema.parse(response.body);
      expect(link).toBe('update');
      expect(job).toMatchObject({
        status: 'accepted',
        farmer_address: FARMER_ADDRESS,
        facility: { address: 'Test address' },
        contact: { name: 'Bola', phone: CONTACT_PHONE },
      });
      expectNothingPrivate(response.body);
    });

    it('does not use the link', async () => {
      const token = await acceptLink();
      await open(token);
      expect((await open(token)).status).toBe(200);
    });

    it.each(['malformed', 'Hk3_q-9ZxYv0LmN2pQrStUvWxYz0123456789abcDE'])(
      'is the same 404 for an unknown token: %s',
      async (token) => {
        const response = await open(token);
        expect(response.status).toBe(404);
        expect(response.body).toEqual(NOT_FOUND);
      },
    );

    it('is 404 once expired', async () => {
      const token = await acceptLink();
      await db()
        .updateTable('action_tokens')
        .set({ expires_at: sql<Date>`now() - interval '1 second'` })
        .where('subject_id', '=', deliveryId)
        .execute();
      expect((await open(token)).body).toEqual(NOT_FOUND);
    });

    it("is 404 for the provider's own link kind", async () => {
      const token = await acceptLink();
      await db()
        .updateTable('action_tokens')
        .set({ purpose: 'provider_respond_booking' })
        .where('subject_id', '=', deliveryId)
        .execute();
      expect((await open(token)).body).toEqual(NOT_FOUND);
    });

    it('shows a job the farmer has cancelled as cancelled, without the contact', async () => {
      const token = await updateLink();
      await db()
        .updateTable('delivery_requests')
        .set({ status: 'cancelled' })
        .where('id', '=', deliveryId)
        .execute();
      const { job } = partnerDeliveryLinkSchema.parse((await open(token)).body);
      expect(job).toMatchObject({ status: 'cancelled', contact: null, farmer_address: null });
    });
  });

  describe('accepting', () => {
    it('accepts, uses the link and texts the partner the update link and the farmer', async () => {
      const token = await acceptLink();

      const response = await act(token, { action: 'accept' });

      expect(response.status).toBe(200);
      const result = partnerDeliveryActionResultSchema.parse(response.body);
      expect(result).toMatchObject({
        outcome: 'accepted',
        job: { status: 'accepted', contact: { phone: CONTACT_PHONE } },
      });
      expectNothingPrivate(response.body);
      expect((await deliveryRow(db(), deliveryId)).status).toBe('accepted');
      expect((await open(token)).body).toEqual(NOT_FOUND);

      const updateToken = lastLink(target, partner.phone, 'delivery_partner_link');
      expect(updateToken).not.toBe(token);
      const tokens = (await deliveryTokens(db(), deliveryId)).toSorted((a, b) =>
        a.purpose.localeCompare(b.purpose),
      );
      expect(tokens.map(({ purpose, used_at }) => [purpose, used_at === null])).toEqual([
        ['delivery_accept', false],
        ['delivery_update', true],
      ]);
      expect(tokens[1]?.expires_at.toISOString()).toBe('2027-06-16T23:00:00.000Z');
      const { code } = await db()
        .selectFrom('bookings')
        .select('code')
        .where('id', '=', booking.bookingId)
        .executeTakeFirstOrThrow();
      expect(sentTo(target, farmerPhone, 'delivery_update').map((sms) => sms.text)).toEqual([
        `ColdLink: Swift Riders (test) will carry the delivery for booking ${code} on 15 Jun 2027.`,
      ]);
    });

    it('is a 404 to accept twice', async () => {
      const token = await acceptLink();
      await act(token, { action: 'accept' });
      expect((await act(token, { action: 'accept' })).body).toEqual(NOT_FOUND);
      expect(sentTo(target, partner.phone, 'delivery_partner_link')).toHaveLength(1);
    });

    it('is a 409 for a job the farmer cancelled, and leaves it cancelled', async () => {
      const token = await acceptLink();
      await db()
        .updateTable('delivery_requests')
        .set({ status: 'cancelled' })
        .where('id', '=', deliveryId)
        .execute();
      const response = await act(token, { action: 'accept' });
      expect(response.status).toBe(409);
      expect(errorResponseSchema.parse(response.body).error.details).toMatchObject({
        status: 'cancelled',
      });
      expect((await deliveryRow(db(), deliveryId)).status).toBe('cancelled');
      const [tokenRow] = await deliveryTokens(db(), deliveryId);
      expect(tokenRow?.used_at).toBeNull();
    });

    it.each([
      ['the accept link', 'picked_up'],
      ['the accept link', 'delivered'],
    ] as const)('is a 404 to use %s for %s', async (_link, action) => {
      const token = await acceptLink();
      const body: PartnerDeliveryActionBody =
        action === 'delivered' ? { action, handover_code: HANDOVER_CODE } : { action };
      expect((await act(token, body)).body).toEqual(NOT_FOUND);
      expect((await deliveryRow(db(), deliveryId)).status).toBe('assigned');
    });

    it.each(['accept', 'decline'] as const)(
      'is a 404 to %s with the update link',
      async (action) => {
        const token = await updateLink();
        expect((await act(token, { action })).body).toEqual(NOT_FOUND);
        expect((await deliveryRow(db(), deliveryId)).status).toBe('accepted');
      },
    );
  });

  describe('declining', () => {
    it('returns the job to requested, clears the partner and alerts admins', async () => {
      const token = await acceptLink();

      const response = await act(token, { action: 'decline' });

      expect(response.status).toBe(200);
      expect(partnerDeliveryActionResultSchema.parse(response.body)).toEqual({
        outcome: 'declined',
        job: null,
      });
      expect(await deliveryRow(db(), deliveryId)).toMatchObject({
        status: 'requested',
        partner_id: null,
        assigned_at: null,
      });
      expect(target.logs.output()).toContain('Delivery declined');
      expect(target.logs.output()).toContain(deliveryId);
      expect((await open(token)).body).toEqual(NOT_FOUND);
      expect(sentTo(target, farmerPhone, 'delivery_update')).toHaveLength(0);
    });

    it('can be assigned again afterwards', async () => {
      await act(await acceptLink(), { action: 'decline' });
      expect((await assign()).status).toBe(200);
    });
  });

  describe('picking up', () => {
    it('marks it picked up and texts the farmer the handover code, storing none', async () => {
      const token = await updateLink();

      const response = await act(token, { action: 'picked_up' });

      expect(response.status).toBe(200);
      expect(partnerDeliveryActionResultSchema.parse(response.body).job?.status).toBe('picked_up');
      expectNothingPrivate(response.body);
      const row = await deliveryRow(db(), deliveryId);
      expect(row.status).toBe('picked_up');
      expect(row.picked_up_at).toBeInstanceOf(Date);
      const [pickup] = sentTo(target, farmerPhone, 'delivery_update').slice(-1);
      expect(pickup?.text).toContain(`Handover code: ${HANDOVER_CODE}.`);
      const logged = await db()
        .selectFrom('notifications')
        .select('payload')
        .where('user_id', '=', booking.farmerId)
        .execute();
      expect(JSON.stringify(logged)).not.toContain(HANDOVER_CODE);
      // The update link stays usable for the delivery.
      expect((await open(token)).status).toBe(200);
    });

    it('is a 409 for a second tap', async () => {
      const token = await pickedUpLink();
      const response = await act(token, { action: 'picked_up' });
      expect(response.status).toBe(409);
      expect(errorResponseSchema.parse(response.body).error.details).toMatchObject({
        status: 'picked_up',
      });
    });
  });

  describe('delivering', () => {
    it('is a 409 before pickup', async () => {
      const token = await updateLink();
      const response = await act(token, { action: 'delivered', handover_code: HANDOVER_CODE });
      expect(response.status).toBe(409);
      expect((await deliveryRow(db(), deliveryId)).handover_failed_attempts).toBe(0);
    });

    it('completes with the right code, uses the link and texts the farmer', async () => {
      const token = await pickedUpLink();

      const response = await act(token, { action: 'delivered', handover_code: HANDOVER_CODE });

      expect(response.status).toBe(200);
      const result = partnerDeliveryActionResultSchema.parse(response.body);
      expect(result).toMatchObject({ outcome: 'delivered', job: { status: 'delivered' } });
      expect(result.job?.contact).toBeNull();
      const row = await deliveryRow(db(), deliveryId);
      expect(row.status).toBe('delivered');
      expect(row.delivered_at).toBeInstanceOf(Date);
      expect((await open(token)).body).toEqual(NOT_FOUND);
      expect(sentTo(target, farmerPhone, 'delivery_update').at(-1)?.text).toContain(
        'has been delivered.',
      );
    });

    it('counts a wrong code, commits it and says how many tries are left', async () => {
      const token = await pickedUpLink();

      const response = await act(token, { action: 'delivered', handover_code: '9999' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: {
          code: 'handover_code_invalid',
          message: 'That handover code is not right',
          details: { handover_attempts_left: 4 },
        },
      });
      const row = await deliveryRow(db(), deliveryId);
      expect(row).toMatchObject({ status: 'picked_up', handover_failed_attempts: 1 });
      const { job } = partnerDeliveryLinkSchema.parse((await open(token)).body);
      expect(job.handover_attempts_left).toBe(4);
    });

    it('locks the link on the fifth wrong code, alerts admins, and refuses even the right one', async () => {
      const token = await pickedUpLink();

      const left: unknown[] = [];
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const response = await act(token, { action: 'delivered', handover_code: '1111' });
        expect(response.status).toBe(400);
        left.push(errorResponseSchema.parse(response.body).error.details);
      }
      expect(left).toEqual([4, 3, 2, 1, 0].map((count) => ({ handover_attempts_left: count })));
      expect(target.logs.output().match(/Delivery handover locked/g)).toHaveLength(1);

      const locked = await act(token, { action: 'delivered', handover_code: HANDOVER_CODE });
      expect(locked.status).toBe(409);
      expect(errorResponseSchema.parse(locked.body).error.details).toMatchObject({
        handover_attempts_left: 0,
      });
      expect(await deliveryRow(db(), deliveryId)).toMatchObject({
        status: 'picked_up',
        handover_failed_attempts: 5,
      });
      const { job } = partnerDeliveryLinkSchema.parse((await open(token)).body);
      expect(job.handover_attempts_left).toBe(0);
    });

    it('keeps the count on a fresh update link', async () => {
      const token = await pickedUpLink();
      await act(token, { action: 'delivered', handover_code: '1111' });

      const links = createDeliveryLinks(db(), testConfig.webAppUrl);
      const fresh = tokenIn(await links.relinkUpdate(deliveryId, partner.partnerId));

      expect(fresh).not.toBe(token);
      const { job } = partnerDeliveryLinkSchema.parse((await open(fresh)).body);
      expect(job.handover_attempts_left).toBe(4);
    });
  });

  describe("the farmer's cancellation", () => {
    async function cancel() {
      return request(target.app)
        .post(`/api/v1/deliveries/${deliveryId}/cancel`)
        .set('Authorization', await bearer(db(), booking.farmerId));
    }

    it('is allowed after the partner accepts, and texts the partner', async () => {
      const token = await updateLink();

      const response = await cancel();

      expect(response.status).toBe(200);
      expect((await deliveryRow(db(), deliveryId)).status).toBe('cancelled');
      expect(sentTo(target, partner.phone, 'delivery_cancelled')).toHaveLength(1);
      const pickup = await act(token, { action: 'picked_up' });
      expect(pickup.status).toBe(409);
      expect(errorResponseSchema.parse(pickup.body).error.details).toMatchObject({
        status: 'cancelled',
      });
    });

    it('texts no partner before one is assigned', async () => {
      expect((await cancel()).status).toBe(200);
      expect(target.sms.sent.filter((sms) => sms.template === 'delivery_cancelled')).toEqual([]);
    });

    it('is refused once picked up', async () => {
      await pickedUpLink();
      expect((await cancel()).status).toBe(409);
    });
  });

  describe('a resend from the queue', () => {
    it('relinks delivery_job while the job is still offered, keeping the first link', async () => {
      target = build(db(), retryableFailure());
      const first = await acceptLink();
      await makeNotificationsDue(db(), [partner.userId]);

      expect(await processNotificationQueue(target.services.notifications)).toMatchObject({
        sent: 1,
      });

      const resent = lastLink(target, partner.phone, 'delivery_job');
      expect(resent).not.toBe(first);
      expect(sentTo(target, partner.phone, 'delivery_job')).toHaveLength(2);
      expect((await open(first)).status).toBe(200);
      expect((await open(resent)).status).toBe(200);
    });

    it('sends no job once the partner has declined it', async () => {
      target = build(db(), retryableFailure());
      await act(await acceptLink(), { action: 'decline' });
      await makeNotificationsDue(db(), [partner.userId]);

      expect(await processNotificationQueue(target.services.notifications)).toMatchObject({
        failed: 1,
      });
      expect(sentTo(target, partner.phone, 'delivery_job')).toHaveLength(1);
    });

    it('resends the pickup update with the code, read again from the delivery', async () => {
      target = build(db());
      const token = await updateLink();
      target = build(db(), retryableFailure());
      expect((await act(token, { action: 'picked_up' })).status).toBe(200);
      await makeNotificationsDue(db(), [booking.farmerId]);

      await processNotificationQueue(target.services.notifications);

      const updates = sentTo(target, farmerPhone, 'delivery_update');
      expect(updates).toHaveLength(2);
      expect(updates[1]?.text).toContain(`Handover code: ${HANDOVER_CODE}.`);
    });
  });

  it('never writes a link token to the request log', async () => {
    const token = await acceptLink();
    await open(token);
    await act(token, { action: 'accept' });
    const updateToken = lastLink(target, partner.phone, 'delivery_partner_link');
    await open(updateToken);
    const output = target.logs.output();
    expect(output).toContain('"url":"/api/v1/delivery-actions/[Redacted]"');
    expect(output).not.toContain(token);
    expect(output).not.toContain(updateToken);
  });
});

// Two requests at once need two connections and committed rows: the second waits on the
// booking's lock and sees the first's change only once it commits. The rows are deleted after.
describe.skipIf(noTestDatabase)('delivery links racing', () => {
  let pool: Database | undefined;

  function database(): Database {
    if (pool === undefined) throw new Error('No pool');
    return pool;
  }

  beforeAll(() => {
    pool = createDatabase(
      { databaseUrl: requireTestDatabaseUrl(), databaseSslRootCert: undefined },
      captureLogs().logger,
    );
  });
  afterAll(async () => {
    await pool?.destroy();
  });

  async function waitForLockWaits(count: number): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const { rows } = await sql<{ waiting: number }>`
        select count(*)::int as waiting from pg_catalog.pg_stat_activity
        where datname = current_database() and wait_event_type = 'Lock'
      `.execute(database());
      if ((rows[0]?.waiting ?? 0) >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`${count} requests never waited on the booking lock`);
  }

  /** Holds the booking's lock while `start` sends its requests, then lets them race. */
  async function race(
    bookingId: string,
    start: () => Promise<request.Response>[],
  ): Promise<request.Response[]> {
    const db = database();
    const holder = await db.startTransaction().execute();
    let responses: Promise<request.Response[]> = Promise.resolve([]);
    try {
      await holder
        .selectFrom('bookings')
        .select('id')
        .where('id', '=', bookingId)
        .forUpdate()
        .execute();
      const started = start();
      responses = Promise.all(started);
      await waitForLockWaits(started.length);
      await holder.commit().execute();
    } catch (error) {
      await holder.rollback().execute();
      throw error;
    }
    return responses;
  }

  async function setUp() {
    const db = database();
    const booking = await insertBooking(db, 'confirmed');
    const deliveryId = await insertPaidDelivery(db, booking);
    const partner = await insertPartner(db);
    const admin = await insertUserWithRoles(db, ['admin']);
    const target = build(db);
    const assigned = await request(target.app)
      .post(`/api/v1/admin/deliveries/${deliveryId}/assign`)
      .set('Authorization', await bearer(db, admin))
      .send({ partner_id: partner.partnerId });
    expect(assigned.status).toBe(200);
    const token = lastLink(target, partner.phone, 'delivery_job');
    return { db, booking, deliveryId, partner, target, token, cleanUp: [partner.userId, admin] };
  }

  it('takes one of two accepts at once, and issues one update link', async () => {
    const { db, booking, deliveryId, partner, target, token, cleanUp } = await setUp();
    try {
      const send = () =>
        request(target.app)
          .post(`/api/v1/delivery-actions/${token}`)
          .send({ action: 'accept' })
          .then((response) => response);

      const responses = await race(booking.bookingId, () => [send(), send()]);

      expect(responses.map((r) => r.status).toSorted((a, b) => a - b)).toEqual([200, 404]);
      expect((await deliveryRow(db, deliveryId)).status).toBe('accepted');
      const tokens = await deliveryTokens(db, deliveryId);
      expect(tokens.filter((t) => t.purpose === 'delivery_update')).toHaveLength(1);
      expect(sentTo(target, partner.phone, 'delivery_partner_link')).toHaveLength(1);
    } finally {
      await deleteDeliveryFixtures(db, booking, cleanUp);
    }
  });

  it('never leaves a job accepted after the farmer cancelled it', async () => {
    const { db, booking, deliveryId, partner, target, token, cleanUp } = await setUp();
    try {
      const farmerAuth = await bearer(db, booking.farmerId);
      const responses = await race(booking.bookingId, () => [
        request(target.app)
          .post(`/api/v1/delivery-actions/${token}`)
          .send({ action: 'accept' })
          .then((response) => response),
        request(target.app)
          .post(`/api/v1/deliveries/${deliveryId}/cancel`)
          .set('Authorization', farmerAuth)
          .then((response) => response),
      ]);

      const [accept, cancel] = responses;
      expect(cancel?.status).toBe(200);
      expect([200, 409]).toContain(accept?.status);
      expect((await deliveryRow(db, deliveryId)).status).toBe('cancelled');
      // Accepted first: the cancellation that followed texted the partner. Cancelled first: the
      // partner was assigned, so was texted all the same, and the accept found it cancelled.
      expect(sentTo(target, partner.phone, 'delivery_cancelled')).toHaveLength(1);
    } finally {
      await deleteDeliveryFixtures(db, booking, cleanUp);
    }
  });
});
