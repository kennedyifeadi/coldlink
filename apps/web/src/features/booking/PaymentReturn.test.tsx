import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { initializePaymentBodySchema } from '@coldlink/shared';
import {
  bodyOf,
  errorResponse,
  jsonResponse,
  mockApi,
  requestsTo,
  sessionFixture,
} from '../../test/api';
import {
  CHECKOUT_URL,
  DUGBE_BOOKING_ID,
  dugbeBooking,
  PAYMENT_REFERENCE,
  paidDugbeBooking,
  paymentReturnPath,
  verification,
} from '../../test/bookingFixtures';
import { renderApp, SCREEN_TIMEOUT } from '../../test/renderApp';

const signedIn = { 'POST /auth/refresh': jsonResponse(200, sessionFixture()) };
const verifyRoute = `GET /payments/${PAYMENT_REFERENCE}/verify`;
const bookingRoute = `GET /bookings/${DUGBE_BOOKING_ID}`;
const unpaid = verification({ payment_status: 'initiated', booking_status: 'payment_pending' });

// 10:00 in Lagos, half an hour before the fixture's hold ends. Only Date is faked.
const NOW = new Date('2026-11-10T09:00:00Z');
const FLOW_TIMEOUT = { timeout: 20_000 };
const PAGE_CHANGE_TIMEOUT = { timeout: 15_000 };

const currentPath = () => screen.getByTestId('location').textContent;
const waitForPath = (path: string) =>
  vi.waitFor(() => expect(currentPath()).toBe(path), PAGE_CHANGE_TIMEOUT);
const findHeading = (name: string) => screen.findByRole('heading', { name }, SCREEN_TIMEOUT);

let assign: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  assign = vi.fn();
  vi.stubGlobal('location', { ...window.location, assign });
});

describe('coming back from Paystack', FLOW_TIMEOUT, () => {
  it('shows a paid booking waiting for the facility, with its deadline in Lagos time', async () => {
    const fetchMock = mockApi({
      ...signedIn,
      [verifyRoute]: jsonResponse(200, verification()),
      [bookingRoute]: jsonResponse(200, paidDugbeBooking()),
    });
    renderApp(paymentReturnPath);

    expect(await findHeading('Waiting for Dugbe Fridge Fleet (Sample) to confirm')).toBeVisible();
    expect(screen.getByText(/has until 12:05 pm on Tue, 10 Nov to accept/)).toBeVisible();
    expect(currentPath()).toBe(`/confirmation/${DUGBE_BOOKING_ID}`);
    expect(requestsTo(fetchMock, 'GET', `/payments/${PAYMENT_REFERENCE}/verify`)).toHaveLength(1);
  });

  it('offers to pay again when the payment was not finished, and goes back to Paystack', async () => {
    const fetchMock = mockApi({
      ...signedIn,
      [verifyRoute]: jsonResponse(200, unpaid),
      [bookingRoute]: jsonResponse(200, dugbeBooking()),
      'POST /payments/initialize': jsonResponse(200, {
        authorization_url: CHECKOUT_URL,
        reference: PAYMENT_REFERENCE,
      }),
    });
    const user = renderApp(paymentReturnPath);

    expect(await findHeading('Payment not finished')).toBeVisible();
    expect(screen.getByText(/pay again before 10:30 am on Tue, 10 Nov/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Pay ₦10,500' }));

    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith(CHECKOUT_URL));
    const charges = requestsTo(fetchMock, 'POST', '/payments/initialize');
    expect(charges).toHaveLength(1);
    expect(bodyOf(charges[0]!)).toEqual(
      initializePaymentBodySchema.parse({ booking_id: DUGBE_BOOKING_ID }),
    );
  });

  it('shows the booking once a check finds the payment went through after all', async () => {
    mockApi({
      ...signedIn,
      [verifyRoute]: [jsonResponse(200, unpaid), jsonResponse(200, verification())],
      [bookingRoute]: [jsonResponse(200, dugbeBooking()), jsonResponse(200, paidDugbeBooking())],
    });
    const user = renderApp(paymentReturnPath);

    await user.click(await screen.findByRole('button', { name: 'Check again' }, SCREEN_TIMEOUT));

    expect(await findHeading('Waiting for Dugbe Fridge Fleet (Sample) to confirm')).toBeVisible();
    expect(assign).not.toHaveBeenCalled();
  });

  it('says the space was released when the hold ran out while paying again', async () => {
    mockApi({
      ...signedIn,
      [verifyRoute]: jsonResponse(200, unpaid),
      [bookingRoute]: jsonResponse(200, dugbeBooking()),
      'POST /payments/initialize': errorResponse(409, 'conflict'),
    });
    const user = renderApp(paymentReturnPath);

    await user.click(await screen.findByRole('button', { name: 'Pay ₦10,500' }, SCREEN_TIMEOUT));

    expect(await findHeading('Your space was released')).toBeVisible();
    expect(assign).not.toHaveBeenCalled();
  });

  it.each([
    ['the hold has passed', dugbeBooking({ payment_expires_at: '2026-11-10T08:59:00.000Z' })],
    ['the booking has expired', dugbeBooking({ status: 'expired' })],
  ])('explains the space was released when %s, and offers a fresh search', async (_, booking) => {
    mockApi({
      ...signedIn,
      [verifyRoute]: jsonResponse(200, { ...unpaid, booking_status: booking.status }),
      [bookingRoute]: jsonResponse(200, booking),
    });
    const user = renderApp(paymentReturnPath);

    expect(await findHeading('Your space was released')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Search again' }));

    await waitForPath('/location');
  });

  it('explains that a late payment is being refunded in full', async () => {
    mockApi({
      ...signedIn,
      [verifyRoute]: jsonResponse(
        200,
        verification({ payment_status: 'refunded', booking_status: 'expired' }),
      ),
      [bookingRoute]: jsonResponse(200, dugbeBooking({ status: 'expired' })),
    });
    renderApp(paymentReturnPath);

    expect(await findHeading('Your money is coming back')).toBeVisible();
    expect(screen.getByText(/Your payment of ₦10,500 reached us after the space/)).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Pay/ })).not.toBeInTheDocument();
  });

  it.each([
    ['a reference on no account of theirs', paymentReturnPath],
    ['a reference that was edited', '/payment/return?reference=CLP-nonsense'],
    ['no reference', '/payment/return'],
  ])('gives a neutral message for %s', async (_, path) => {
    mockApi({ ...signedIn, [verifyRoute]: errorResponse(404, 'not_found') });
    const user = renderApp(path);

    expect(await findHeading("We couldn't find this payment")).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Go to my bookings' }));

    await waitForPath('/bookings');
  });

  it('offers Try again when the API cannot be reached', async () => {
    mockApi({
      ...signedIn,
      // A network failure is retried once before it shows (decision 79).
      [verifyRoute]: [
        () => Promise.reject(new TypeError('Failed to fetch')),
        () => Promise.reject(new TypeError('Failed to fetch')),
        jsonResponse(200, verification()),
      ],
      [bookingRoute]: jsonResponse(200, paidDugbeBooking()),
    });
    const user = renderApp(paymentReturnPath);

    expect(await findHeading("Couldn't check your payment")).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await findHeading('Waiting for Dugbe Fridge Fleet (Sample) to confirm')).toBeVisible();
  });
});

describe('the booking after payment', FLOW_TIMEOUT, () => {
  const confirmationPath = `/confirmation/${DUGBE_BOOKING_ID}`;

  it('shows the code, the facility, the dates and what was paid and is due, from the booking', async () => {
    mockApi({
      ...signedIn,
      [bookingRoute]: jsonResponse(
        200,
        // Amounts that do not add up, so a figure worked out on screen would show.
        paidDugbeBooking({ total_charged_online_kobo: 1_111_111, balance_due_kobo: 222_222 }),
      ),
    });
    renderApp(confirmationPath);

    expect(await screen.findByText('CL-7KQ2M', undefined, SCREEN_TIMEOUT)).toBeVisible();
    expect(screen.getByText('Dugbe Fridge Fleet (Sample)')).toBeVisible();
    expect(screen.getByText('14 Dugbe Market Road, Ibadan')).toBeVisible();
    expect(screen.getByText('Near Opposite Cocoa House')).toBeVisible();
    expect(screen.getByText('Tomatoes, 10 crates')).toBeVisible();
    expect(screen.getByText('Tue, 10 Nov 2026 to Tue, 17 Nov 2026 (7 days)')).toBeVisible();
    expect(screen.getByText('₦11,111.11')).toBeVisible();
    expect(screen.getByText('₦2,222.22')).toBeVisible();
  });

  it('shares only the code and the address on WhatsApp', async () => {
    mockApi({ ...signedIn, [bookingRoute]: jsonResponse(200, paidDugbeBooking()) });
    renderApp(confirmationPath);

    const share = await screen.findByRole('link', { name: 'Share on WhatsApp' }, SCREEN_TIMEOUT);
    const url = new URL(share.getAttribute('href')!);
    const text = url.searchParams.get('text')!;

    expect(`${url.origin}${url.pathname}`).toBe('https://wa.me/');
    expect(text).toBe(
      'My ColdLink booking code is CL-7KQ2M. Cold room: Dugbe Fridge Fleet (Sample), ' +
        '14 Dugbe Market Road, Ibadan, near Opposite Cocoa House.',
    );
    expect(text).not.toMatch(/₦|\+234|\b0[789]\d{9}\b/);
    expect(text).not.toMatch(/10,500|24,500/);
  });

  it('shows a confirmed booking as confirmed', async () => {
    mockApi({
      ...signedIn,
      [bookingRoute]: jsonResponse(200, paidDugbeBooking({ status: 'confirmed' })),
    });
    renderApp(confirmationPath);

    expect(await findHeading('Booking confirmed')).toBeVisible();
    expect(
      screen.getByText(
        'Dugbe Fridge Fleet (Sample) is expecting your produce on Tue, 10 Nov 2026.',
      ),
    ).toBeVisible();
  });

  it('names the status of a booking that did not go ahead, and leaves out the payment', async () => {
    mockApi({
      ...signedIn,
      [bookingRoute]: jsonResponse(200, paidDugbeBooking({ status: 'rejected' })),
    });
    renderApp(confirmationPath);

    expect(await findHeading('Your booking')).toBeVisible();
    expect(screen.getByText('Status: Turned down')).toBeVisible();
    expect(screen.queryByText('Paid online')).not.toBeInTheDocument();
  });

  it.each([
    ['an unknown booking', confirmationPath],
    ['an edited link', '/confirmation/not-an-id'],
  ])('gives a neutral message for %s', async (_, path) => {
    mockApi({ ...signedIn, [bookingRoute]: errorResponse(404, 'not_found') });
    renderApp(path);

    expect(await findHeading("We couldn't find this booking")).toBeVisible();
  });

  it.each([
    ['View my bookings', '/bookings'],
    ['Back to home', '/'],
  ])('leads on through %s', async (button, path) => {
    mockApi({ ...signedIn, [bookingRoute]: jsonResponse(200, paidDugbeBooking()) });
    const user = renderApp(confirmationPath);

    await user.click(await screen.findByRole('button', { name: button }, SCREEN_TIMEOUT));

    await waitForPath(path);
  });
});
