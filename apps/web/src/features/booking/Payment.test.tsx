import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import { createBookingBodySchema, initializePaymentBodySchema } from '@coldlink/shared';
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
  dugbeHeldPaymentPath,
  dugbePaymentPath,
  dugbeProvider,
  dugbeQuote,
  dugbeReviewPath,
  PAYMENT_REFERENCE,
  paidDugbeBooking,
  tenCratesForAWeek,
} from '../../test/bookingFixtures';
import { renderApp, SCREEN_TIMEOUT } from '../../test/renderApp';
import { cropsResponse, dugbe } from '../../test/searchFixtures';

const signedIn = { 'POST /auth/refresh': jsonResponse(200, sessionFixture()) };
const crops = { 'GET /crops': jsonResponse(200, cropsResponse) };
const dugbeFound = { [`GET /providers/${dugbe.provider.id}`]: jsonResponse(200, dugbeProvider) };
const quoted = (quote = dugbeQuote()) => ({ 'POST /bookings/quote': jsonResponse(200, quote) });
const bookingRoute = `GET /bookings/${DUGBE_BOOKING_ID}`;
const initialized = {
  'POST /payments/initialize': jsonResponse(200, {
    authorization_url: CHECKOUT_URL,
    reference: PAYMENT_REFERENCE,
  }),
};
const created = (booking = dugbeBooking()) => ({ 'POST /bookings': jsonResponse(201, booking) });
const newBooking = { ...signedIn, ...crops, ...dugbeFound, ...quoted() };

// What POST /bookings takes: the quote's terms and the crop, checked against the shared schema.
const dugbeBookingBody = createBookingBodySchema.parse({
  provider_id: dugbe.provider.id,
  crop_id: tenCratesForAWeek.crop_id,
  quantity: tenCratesForAWeek.quantity,
  capacity_unit: tenCratesForAWeek.capacity_unit,
  days: tenCratesForAWeek.days,
  start_date: tenCratesForAWeek.start_date,
});
const initializeBody = initializePaymentBodySchema.parse({ booking_id: DUGBE_BOOKING_ID });

// 10:00 in Lagos, half an hour before the fixture's hold ends. Only Date is faked.
const NOW = new Date('2026-11-10T09:00:00Z');
const FLOW_TIMEOUT = { timeout: 20_000 };
const PAGE_CHANGE_TIMEOUT = { timeout: 15_000 };

const currentPath = () => screen.getByTestId('location').textContent;
const currentQuery = () => screen.getByTestId('location-search').textContent ?? '';
const waitForPath = (path: string) =>
  vi.waitFor(() => expect(currentPath()).toBe(path), PAGE_CHANGE_TIMEOUT);
const findPayButton = (amount = '₦10,500') =>
  screen.findByRole('button', { name: `Pay ${amount}` }, SCREEN_TIMEOUT);
const findHeading = (name: string) => screen.findByRole('heading', { name }, SCREEN_TIMEOUT);

let assign: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  assign = vi.fn();
  vi.stubGlobal('location', { ...window.location, assign });
});

describe('paying for a new booking', FLOW_TIMEOUT, () => {
  it("shows the quote's amount, books, and sends the farmer to Paystack's page", async () => {
    const fetchMock = mockApi({ ...newBooking, ...created(), ...initialized });
    const user = renderApp(dugbePaymentPath);

    expect(
      await screen.findByText('You pay now: ₦10,500', undefined, SCREEN_TIMEOUT),
    ).toBeVisible();
    expect(screen.getByText('Step 3 of 3: Pay')).toBeInTheDocument();
    await user.click(await findPayButton());

    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith(CHECKOUT_URL));
    const bookings = requestsTo(fetchMock, 'POST', '/bookings');
    expect(bookings).toHaveLength(1);
    expect(bodyOf(bookings[0]!)).toEqual(dugbeBookingBody);
    const charges = requestsTo(fetchMock, 'POST', '/payments/initialize');
    expect(charges).toHaveLength(1);
    expect(bodyOf(charges[0]!)).toEqual(initializeBody);
    await vi.waitFor(() =>
      expect(new URLSearchParams(currentQuery()).get('booking')).toBe(DUGBE_BOOKING_ID),
    );
  });

  it('makes one booking however often the button is tapped', async () => {
    let answer!: (response: Response) => void;
    const fetchMock = mockApi({
      ...newBooking,
      'POST /bookings': () => new Promise<Response>((resolve) => (answer = resolve)),
      ...initialized,
    });
    const user = renderApp(dugbePaymentPath);
    const pay = await findPayButton();

    await user.click(pay);
    await user.click(pay);
    await user.dblClick(pay);

    expect(await screen.findByRole('button', { name: 'Opening Paystack...' })).toBeDisabled();
    expect(screen.getByText("Taking you to Paystack. Don't close this page.")).toBeVisible();
    answer(jsonResponse(201, dugbeBooking()));
    await vi.waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    expect(requestsTo(fetchMock, 'POST', '/bookings')).toHaveLength(1);
    expect(requestsTo(fetchMock, 'POST', '/payments/initialize')).toHaveLength(1);
  });

  it('shows amounts exactly as the API gives them, adding nothing up', async () => {
    // The total is deliberately not deposit plus fee: the screen must show the API's figure.
    mockApi({
      ...signedIn,
      ...crops,
      ...dugbeFound,
      ...quoted(dugbeQuote({ total_charged_online_kobo: 1_234_567, balance_due_kobo: 98_765 })),
    });
    renderApp(dugbePaymentPath);

    expect(
      await screen.findByText('You pay now: ₦12,345.67', undefined, SCREEN_TIMEOUT),
    ).toBeVisible();
    expect(screen.getByText(/Pay the ₦987\.65 balance at Dugbe/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Pay ₦12,345.67' })).toBeVisible();
  });

  it('goes back to review when the space was taken, which shows what is free now', async () => {
    mockApi({
      ...signedIn,
      ...crops,
      ...dugbeFound,
      'POST /bookings/quote': [
        jsonResponse(200, dugbeQuote()),
        errorResponse(409, 'conflict', { details: { available_quantity: 4 } }),
      ],
      'POST /bookings': errorResponse(409, 'conflict', { details: { available_quantity: 4 } }),
    });
    const user = renderApp(dugbePaymentPath);

    await user.click(await findPayButton());

    await waitForPath(`/review/${dugbe.provider.id}`);
    expect(`/review/${dugbe.provider.id}${currentQuery()}`).toBe(dugbeReviewPath);
    expect(await findHeading('Only 4 crates free on these dates')).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });

  it("shows the API's message for a field it refused", async () => {
    mockApi({
      ...newBooking,
      'POST /bookings': errorResponse(400, 'validation_failed', {
        details: [
          { location: 'body', path: 'crop_id', message: 'This facility does not store that crop' },
        ],
      }),
    });
    const user = renderApp(dugbePaymentPath);

    await user.click(await findPayButton());

    expect(await screen.findByText('This facility does not store that crop')).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Pay/ })).not.toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });

  it('stops before Paystack when the booking costs more than the farmer was shown', async () => {
    const dearer = dugbeBooking({ total_charged_online_kobo: 1_200_000 });
    const fetchMock = mockApi({
      ...newBooking,
      ...created(dearer),
      [bookingRoute]: jsonResponse(200, dearer),
      ...initialized,
    });
    const user = renderApp(dugbePaymentPath);

    await user.click(await findPayButton());

    expect(await findHeading('The price changed')).toBeVisible();
    expect(screen.getByText('You pay now: ₦12,000')).toBeVisible();
    expect(requestsTo(fetchMock, 'POST', '/payments/initialize')).toHaveLength(0);

    await user.click(await findPayButton('₦12,000'));

    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith(CHECKOUT_URL));
    expect(requestsTo(fetchMock, 'POST', '/bookings')).toHaveLength(1);
  });
});

describe('paying for a booking already made', FLOW_TIMEOUT, () => {
  it('pays the same booking after a reload, without booking again or quoting', async () => {
    const fetchMock = mockApi({
      ...signedIn,
      [bookingRoute]: jsonResponse(200, dugbeBooking()),
      ...initialized,
    });
    const user = renderApp(dugbeHeldPaymentPath);

    expect(
      await screen.findByText(
        'Your space is held until 10:30 am on Tue, 10 Nov.',
        undefined,
        SCREEN_TIMEOUT,
      ),
    ).toBeVisible();
    expect(screen.getByText('You pay now: ₦10,500')).toBeVisible();
    await user.click(await findPayButton());

    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith(CHECKOUT_URL));
    expect(bodyOf(requestsTo(fetchMock, 'POST', '/payments/initialize')[0]!)).toEqual(
      initializeBody,
    );
    expect(requestsTo(fetchMock, 'POST', '/bookings')).toHaveLength(0);
    expect(requestsTo(fetchMock, 'POST', '/bookings/quote')).toHaveLength(0);
  });

  it('lets the farmer tap again after coming back from Paystack with the back button', async () => {
    const fetchMock = mockApi({
      ...signedIn,
      [bookingRoute]: jsonResponse(200, dugbeBooking()),
      ...initialized,
    });
    const user = renderApp(dugbeHeldPaymentPath);
    await user.click(await findPayButton());
    await vi.waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Opening Paystack...' })).toBeDisabled();

    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });
    await user.click(await findPayButton());

    await vi.waitFor(() => expect(assign).toHaveBeenCalledTimes(2));
    expect(requestsTo(fetchMock, 'POST', '/bookings')).toHaveLength(0);
  });

  it('offers Try again when the API could not be reached, then pays the same booking', async () => {
    const fetchMock = mockApi({
      ...signedIn,
      [bookingRoute]: jsonResponse(200, dugbeBooking()),
      'POST /payments/initialize': [
        () => Promise.reject(new TypeError('Failed to fetch')),
        jsonResponse(200, { authorization_url: CHECKOUT_URL, reference: PAYMENT_REFERENCE }),
      ],
    });
    const user = renderApp(dugbeHeldPaymentPath);
    await user.click(await findPayButton());

    expect(
      await screen.findByText('No connection. Check your data, then try again.'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith(CHECKOUT_URL));
    for (const call of requestsTo(fetchMock, 'POST', '/payments/initialize')) {
      expect(bodyOf(call)).toEqual(initializeBody);
    }
  });

  it('says the space was released when the hold ran out before Paystack, and starts again', async () => {
    mockApi({
      ...signedIn,
      ...crops,
      ...dugbeFound,
      ...quoted(),
      [bookingRoute]: jsonResponse(200, dugbeBooking()),
      'POST /payments/initialize': errorResponse(409, 'conflict'),
    });
    const user = renderApp(dugbeHeldPaymentPath);
    await user.click(await findPayButton());

    expect(await findHeading('Your space was released')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Start again' }));

    await waitForPath(`/review/${dugbe.provider.id}`);
    expect(`/review/${dugbe.provider.id}${currentQuery()}`).toBe(dugbeReviewPath);
    expect(assign).not.toHaveBeenCalled();
  });

  it.each([
    ['its hold has passed', dugbeBooking({ payment_expires_at: '2026-11-10T08:59:00.000Z' })],
    ['it has expired', dugbeBooking({ status: 'expired' })],
  ])('says the space was released when %s', async (_, booking) => {
    const fetchMock = mockApi({ ...signedIn, [bookingRoute]: jsonResponse(200, booking) });
    renderApp(dugbeHeldPaymentPath);

    expect(await findHeading('Your space was released')).toBeVisible();
    expect(requestsTo(fetchMock, 'POST', '/payments/initialize')).toHaveLength(0);
  });

  it('shows a booking that was paid already instead of paying again', async () => {
    mockApi({ ...signedIn, [bookingRoute]: jsonResponse(200, paidDugbeBooking()) });
    renderApp(dugbeHeldPaymentPath);

    await waitForPath(`/confirmation/${DUGBE_BOOKING_ID}`);
    expect(assign).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown booking', errorResponse(404, 'not_found')],
    [
      'a booking at another facility',
      jsonResponse(
        200,
        dugbeBooking({
          provider: { ...dugbeBooking().provider, id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d' },
        }),
      ),
    ],
  ])('sends a link to %s back to search', async (_, reply) => {
    mockApi({ ...signedIn, [bookingRoute]: reply });
    renderApp(dugbeHeldPaymentPath);

    await waitForPath('/location');
  });
});
