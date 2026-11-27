import { describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import {
  deliveryActionPath,
  partnerDeliveryActionBodySchema,
  partnerDeliveryActionResultSchema,
  partnerDeliveryLinkSchema,
  type PartnerDeliveryActionResult,
  type PartnerDeliveryJob,
  type PartnerDeliveryLinkKind,
} from '@coldlink/shared';
import { bodyOf, errorResponse, jsonResponse, mockApi, requestsTo } from '../../test/api';
import { renderApp, SCREEN_TIMEOUT } from '../../test/renderApp';

const TOKEN = 'Dq7_x-2ZxYv0LmN2pQrStUvWxYz0123456789abcDE';
const LINK = deliveryActionPath(TOKEN);
const OPEN = `GET /delivery-actions/${TOKEN}`;
const ACT = `POST /delivery-actions/${TOKEN}`;

const signedOut = { 'POST /auth/refresh': errorResponse(401, 'unauthorized') };

const offered: PartnerDeliveryJob = {
  booking_code: 'CL-7K3Q9',
  direction: 'inbound',
  status: 'assigned',
  scheduled_for: '2026-11-18',
  facility: { name: 'Bodija Cold Room', lga: 'Ibadan North', address: null },
  farmer_address: null,
  contact: null,
  load_description: 'Tomatoes in crates',
  load_quantity: 5,
  load_unit: 'crates',
  vehicle_type: 'bike',
  distance_km: 14.5,
  payout_kobo: 196_000,
  handover_attempts_left: 5,
};
const onTheJob = (status: 'accepted' | 'picked_up', changes: Partial<PartnerDeliveryJob> = {}) => ({
  ...offered,
  status,
  facility: { ...offered.facility, address: '12 Ring Road, Bodija' },
  farmer_address: 'Akinyele farm road, by the blue gate',
  contact: { name: 'Bola', phone: '+2348031234567' },
  ...changes,
});

const opened = (link: PartnerDeliveryLinkKind, job: PartnerDeliveryJob) => ({
  [OPEN]: jsonResponse(200, partnerDeliveryLinkSchema.parse({ link, job })),
});
const answered = (result: PartnerDeliveryActionResult) =>
  jsonResponse(200, partnerDeliveryActionResultSchema.parse(result));
const wrongCode = (left: number) =>
  errorResponse(400, 'handover_code_invalid', { details: { handover_attempts_left: left } });
const dropped = () => Promise.reject(new TypeError('Failed to fetch'));

// The text a person sees: the page without renderApp's location probe, which prints the URL.
const pageText = () => {
  const page = document.body.cloneNode(true) as HTMLElement;
  page.querySelectorAll('[data-testid^="location"]').forEach((probe) => probe.remove());
  return page.textContent;
};

const findHeading = (name: string | RegExp) =>
  screen.findByRole('heading', { name }, SCREEN_TIMEOUT);
const findButton = (name: string | RegExp) => screen.findByRole('button', { name }, SCREEN_TIMEOUT);
const sent = (fetchMock: ReturnType<typeof mockApi>) =>
  requestsTo(fetchMock, 'POST', `/delivery-actions/${TOKEN}`).map((call) =>
    partnerDeliveryActionBodySchema.parse(bodyOf(call)),
  );

describe('delivery partner link', () => {
  describe('before accepting', () => {
    it("shows the job and payout, but not the farmer's address or contact, signed out and without the nav", async () => {
      mockApi({ ...signedOut, ...opened('accept', offered) });
      renderApp(LINK);

      expect(await findHeading('Delivery on Wed, 18 Nov 2026')).toBeInTheDocument();
      expect(screen.getByText('CL-7K3Q9')).toBeInTheDocument();
      expect(screen.getByText('₦1,960')).toBeInTheDocument();
      expect(screen.getByText(/The farmer's place, 14.5 km from the cold room/)).toBeVisible();
      expect(screen.getByText('Bodija Cold Room, Ibadan North')).toBeVisible();
      expect(screen.getByText('Tomatoes in crates, 5 crates')).toBeVisible();
      expect(screen.getByText('Motorbike')).toBeVisible();
      expect(screen.queryByText(/Call/)).toBeNull();
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(pageText()).not.toContain(TOKEN);
    });

    it('accepts in one tap and says the update link is on its way, with the contact', async () => {
      const fetchMock = mockApi({
        ...signedOut,
        ...opened('accept', offered),
        [ACT]: answered({ outcome: 'accepted', job: onTheJob('accepted') }),
      });
      const user = renderApp(LINK);

      await user.click(await findButton('Accept job'));

      expect(await findHeading('Job accepted')).toBeInTheDocument();
      expect(screen.getByText(/We've texted you a new link/)).toBeVisible();
      expect(screen.getByRole('link', { name: /^Call \+234.803.123.4567$/ })).toHaveAttribute(
        'href',
        'tel:+2348031234567',
      );
      expect(screen.getByText('Akinyele farm road, by the blue gate')).toBeVisible();
      expect(sent(fetchMock)).toEqual([{ action: 'accept' }]);
    });

    it('asks once more before declining', async () => {
      const fetchMock = mockApi({
        ...signedOut,
        ...opened('accept', offered),
        [ACT]: answered({ outcome: 'declined', job: null }),
      });
      const user = renderApp(LINK);

      await user.click(await findButton('Decline job'));
      expect(screen.getByText(/Decline this job\?/)).toBeVisible();
      expect(sent(fetchMock)).toEqual([]);
      await user.click(screen.getByRole('button', { name: 'Keep the job' }));
      await user.click(screen.getByRole('button', { name: 'Decline job' }));
      await user.click(screen.getByRole('button', { name: 'Yes, decline it' }));

      expect(await findHeading('Job declined')).toBeInTheDocument();
      expect(sent(fetchMock)).toEqual([{ action: 'decline' }]);
    });

    it('sends one request for a double tap', async () => {
      let release = () => {};
      const fetchMock = mockApi({
        ...signedOut,
        ...opened('accept', offered),
        [ACT]: () =>
          new Promise<Response>((resolve) => {
            release = () => resolve(answered({ outcome: 'accepted', job: onTheJob('accepted') }));
          }),
      });
      renderApp(LINK);

      const button = await findButton('Accept job');
      fireEvent.click(button);
      fireEvent.click(button);
      expect(await screen.findByRole('button', { name: 'Accepting...' })).toBeDisabled();
      release();

      expect(await findHeading('Job accepted')).toBeInTheDocument();
      expect(sent(fetchMock)).toHaveLength(1);
    });

    it('shows a job the farmer cancelled once the accept is refused', async () => {
      mockApi({
        ...signedOut,
        [OPEN]: [
          jsonResponse(200, partnerDeliveryLinkSchema.parse({ link: 'accept', job: offered })),
          jsonResponse(
            200,
            partnerDeliveryLinkSchema.parse({
              link: 'accept',
              job: { ...offered, status: 'cancelled' },
            }),
          ),
        ],
        [ACT]: errorResponse(409, 'conflict', { details: { status: 'cancelled' } }),
      });
      const user = renderApp(LINK);

      await user.click(await findButton('Accept job'));

      expect(await findHeading('This job was cancelled')).toBeInTheDocument();
      expect(screen.getByText(/Please don't collect the load/)).toBeVisible();
      expect(screen.queryByRole('button', { name: /accept|decline/i })).toBeNull();
    });
  });

  describe('after accepting', () => {
    it('marks the load picked up and then asks for the handover code', async () => {
      const fetchMock = mockApi({
        ...signedOut,
        ...opened('update', onTheJob('accepted')),
        [ACT]: answered({ outcome: 'picked_up', job: onTheJob('picked_up') }),
      });
      const user = renderApp(LINK);

      expect(await screen.findByText('Akinyele farm road, by the blue gate')).toBeVisible();
      await user.click(await findButton('Mark picked up'));

      const field = await screen.findByLabelText('Handover code');
      expect(field).toHaveAttribute('inputmode', 'numeric');
      expect(field).toHaveAttribute('maxlength', '4');
      expect(sent(fetchMock)).toEqual([{ action: 'picked_up' }]);
    });

    it('delivers with the code and says what ColdLink pays', async () => {
      const fetchMock = mockApi({
        ...signedOut,
        ...opened('update', onTheJob('picked_up')),
        [ACT]: answered({
          outcome: 'delivered',
          job: { ...onTheJob('picked_up'), status: 'delivered', contact: null },
        }),
      });
      const user = renderApp(LINK);

      await user.type(await screen.findByLabelText('Handover code'), '04x27');
      expect(screen.getByLabelText('Handover code')).toHaveValue('0427');
      await user.click(screen.getByRole('button', { name: 'Mark delivered' }));

      expect(await findHeading('Delivered')).toBeInTheDocument();
      expect(screen.getByText('Thanks. ColdLink pays you ₦1,960 for this job.')).toBeVisible();
      expect(sent(fetchMock)).toEqual([{ action: 'delivered', handover_code: '0427' }]);
    });

    it('sends nothing until the code has 4 digits', async () => {
      const fetchMock = mockApi({ ...signedOut, ...opened('update', onTheJob('picked_up')) });
      const user = renderApp(LINK);

      await user.type(await screen.findByLabelText('Handover code'), '042');
      await user.click(screen.getByRole('button', { name: 'Mark delivered' }));

      expect(screen.getByRole('alert')).toHaveTextContent('Enter the 4-digit code.');
      expect(screen.getByLabelText('Handover code')).toHaveAttribute('aria-invalid', 'true');
      expect(sent(fetchMock)).toEqual([]);
    });

    it('says a code is wrong with the tries left, and clears the field', async () => {
      mockApi({
        ...signedOut,
        ...opened('update', onTheJob('picked_up')),
        [ACT]: [wrongCode(4), wrongCode(1)],
      });
      const user = renderApp(LINK);

      await user.type(await screen.findByLabelText('Handover code'), '1111');
      await user.click(screen.getByRole('button', { name: 'Mark delivered' }));

      expect(await screen.findByText('That code is wrong. You have 4 tries left.')).toBeVisible();
      expect(screen.getByLabelText('Handover code')).toHaveValue('');
      await user.type(screen.getByLabelText('Handover code'), '2222');
      await user.click(screen.getByRole('button', { name: 'Mark delivered' }));
      expect(await screen.findByText('That code is wrong. You have 1 try left.')).toBeVisible();
    });

    it('locks after the last wrong code', async () => {
      mockApi({
        ...signedOut,
        ...opened('update', onTheJob('picked_up', { handover_attempts_left: 1 })),
        [ACT]: wrongCode(0),
      });
      const user = renderApp(LINK);

      await user.type(await screen.findByLabelText('Handover code'), '1111');
      await user.click(screen.getByRole('button', { name: 'Mark delivered' }));

      expect(await findHeading('Too many wrong codes')).toBeInTheDocument();
      expect(screen.queryByLabelText('Handover code')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Mark delivered' })).toBeNull();
    });

    it('opens locked when the link takes no more codes', async () => {
      mockApi({
        ...signedOut,
        ...opened('update', onTheJob('picked_up', { handover_attempts_left: 0 })),
      });
      renderApp(LINK);

      expect(await findHeading('Too many wrong codes')).toBeInTheDocument();
      expect(screen.queryByLabelText('Handover code')).toBeNull();
    });

    it('keeps the code and offers Try again when the connection drops', async () => {
      const fetchMock = mockApi({
        ...signedOut,
        ...opened('update', onTheJob('picked_up')),
        [ACT]: [
          dropped,
          answered({
            outcome: 'delivered',
            job: { ...onTheJob('picked_up'), status: 'delivered', contact: null },
          }),
        ],
      });
      const user = renderApp(LINK);

      await user.type(await screen.findByLabelText('Handover code'), '0427');
      await user.click(screen.getByRole('button', { name: 'Mark delivered' }));

      expect(await screen.findByText(/No connection/)).toBeVisible();
      expect(screen.getByLabelText('Handover code')).toHaveValue('0427');
      await user.click(screen.getByRole('button', { name: 'Try again' }));

      expect(await findHeading('Delivered')).toBeInTheDocument();
      expect(sent(fetchMock)).toHaveLength(2);
    });

    it('reads the job again after a second phone marked it picked up', async () => {
      mockApi({
        ...signedOut,
        [OPEN]: [
          jsonResponse(
            200,
            partnerDeliveryLinkSchema.parse({ link: 'update', job: onTheJob('accepted') }),
          ),
          jsonResponse(
            200,
            partnerDeliveryLinkSchema.parse({ link: 'update', job: onTheJob('picked_up') }),
          ),
        ],
        [ACT]: errorResponse(409, 'conflict', { details: { status: 'picked_up' } }),
      });
      const user = renderApp(LINK);

      await user.click(await findButton('Mark picked up'));

      expect(await screen.findByLabelText('Handover code')).toBeVisible();
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  describe('a link that cannot be used', () => {
    it('shows one message for a link that is unknown, used, expired or given to someone else', async () => {
      mockApi({ ...signedOut, [OPEN]: errorResponse(404, 'not_found') });
      renderApp(LINK);

      expect(
        await findHeading('This link has expired or has already been used'),
      ).toBeInTheDocument();
      expect(screen.getByText(/given to another driver/)).toBeVisible();
      expect(screen.queryByRole('button')).toBeNull();
    });

    it('asks the partner to wait after too many tries', async () => {
      mockApi({
        ...signedOut,
        [OPEN]: errorResponse(429, 'rate_limited', { headers: { 'Retry-After': '240' } }),
      });
      renderApp(LINK);

      expect(await findHeading('Too many tries')).toBeInTheDocument();
      expect(screen.getByText('Wait 4 minutes, then open the link again.')).toBeVisible();
    });

    it('offers Try again when the job cannot be loaded for lack of network', async () => {
      mockApi({ ...signedOut, [OPEN]: [dropped, dropped, opened('accept', offered)[OPEN]] });
      const user = renderApp(LINK);

      expect(await findHeading("Couldn't load this job")).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Try again' }));

      expect(await findHeading('Delivery on Wed, 18 Nov 2026')).toBeInTheDocument();
    });

    it('shows a delivery that is over as nothing left to do', async () => {
      mockApi({ ...signedOut, ...opened('update', { ...offered, status: 'delivered' }) });
      renderApp(LINK);

      expect(await findHeading('Nothing left to do on this link')).toBeInTheDocument();
    });
  });

  it('sends no referrer while the page is open, and restores the page after', async () => {
    mockApi({ ...signedOut, ...opened('accept', offered) });
    renderApp(LINK);
    await findHeading('Delivery on Wed, 18 Nov 2026');

    expect(document.head.querySelector('meta[name="referrer"]')).toHaveAttribute(
      'content',
      'no-referrer',
    );
    cleanup();
    expect(document.head.querySelector('meta[name="referrer"]')).toBeNull();
  });
});
