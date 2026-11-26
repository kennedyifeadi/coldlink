import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import {
  bookingQuoteBodySchema,
  bookingStatuses,
  cancelBookingBodySchema,
  cancelledBookingSchema,
  createBookingBodySchema,
  farmerBookingSchema,
  farmerBookingsResponseSchema,
  type BookingStatus,
  type FarmerBooking,
} from '@coldlink/shared';
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
  dugbeProvider,
  dugbeQuote,
  dugbeReviewPath,
  PAYMENT_REFERENCE,
  paidDugbeBooking,
  summaryOf,
} from '../../test/bookingFixtures';
import { renderApp, SCREEN_TIMEOUT } from '../../test/renderApp';
import { cropsResponse, dugbe, tomatoes } from '../../test/searchFixtures';
import { pickArea } from '../../test/searchSteps';

// 10:00 in Lagos on 10 November 2026. Only Date is faked.
const NOW = new Date('2026-11-10T09:00:00Z');
const FLOW_TIMEOUT = { timeout: 30_000 };
const PAGE_CHANGE_TIMEOUT = { timeout: 15_000 };

const signedIn = { 'POST /auth/refresh': jsonResponse(200, sessionFixture()) };
const crops = { 'GET /crops': jsonResponse(200, cropsResponse) };
const dugbeFound = { [`GET /providers/${dugbe.provider.id}`]: jsonResponse(200, dugbeProvider) };
const bookingRoute = `GET /bookings/${DUGBE_BOOKING_ID}`;
const cancelRoute = `POST /bookings/${DUGBE_BOOKING_ID}/cancel`;

const listing = (...bookings: FarmerBooking[]) => ({
  'GET /bookings': jsonResponse(
    200,
    farmerBookingsResponseSchema.parse({ data: bookings.map(summaryOf) }),
  ),
});
const detail = (...bookings: FarmerBooking[]) => ({
  [bookingRoute]: bookings.map((booking) => jsonResponse(200, farmerBookingSchema.parse(booking))),
});

const currentPath = () => screen.getByTestId('location').textContent;
const currentFullPath = () =>
  `${currentPath()}${screen.getByTestId('location-search').textContent ?? ''}`;
const waitForPath = (path: string) =>
  vi.waitFor(() => expect(currentPath()).toBe(path), PAGE_CHANGE_TIMEOUT);
const findHeading = (name: string) => screen.findByRole('heading', { name }, SCREEN_TIMEOUT);
const findCard = async (code: string) =>
  (await screen.findByText(code, undefined, SCREEN_TIMEOUT)).closest('li')!;

let assign: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  assign = vi.fn();
  vi.stubGlobal('location', { ...window.location, assign });
});

// A booking in each status, with its own code, so every card can be found.
const codes: Record<BookingStatus, string> = {
  payment_pending: 'CL-AAAA2',
  pending_provider: 'CL-AAAA3',
  confirmed: 'CL-AAAA4',
  rejected: 'CL-AAAA5',
  expired: 'CL-AAAA6',
  in_storage: 'CL-AAAA7',
  cancelled: 'CL-AAAA8',
  no_show: 'CL-AAAA9',
  completed: 'CL-AAAAB',
};

const statusCases: [BookingStatus, string, string][] = [
  ['payment_pending', 'Waiting for payment', 'waiting'],
  ['pending_provider', 'Waiting for the cold room', 'waiting'],
  ['confirmed', 'Confirmed', 'active'],
  ['in_storage', 'In storage', 'active'],
  ['completed', 'Collected', 'done'],
  ['rejected', 'Turned down', 'ended'],
  ['expired', 'Expired', 'ended'],
  ['cancelled', 'Cancelled', 'ended'],
  ['no_show', 'Not brought in', 'ended'],
];

describe('My bookings', FLOW_TIMEOUT, () => {
  it.each(statusCases)(
    'shows a %s booking as "%s" in the %s colour',
    async (status, text, tone) => {
      const bookings = bookingStatuses.map((each, index) =>
        dugbeBooking({
          id: `6b1f0c2e-8d4a-4e7b-9c3f-2a5d8e1b7f4${index}`,
          code: codes[each],
          status: each,
          cancelled_by: each === 'cancelled' ? 'farmer' : null,
        }),
      );
      mockApi({ ...signedIn, ...listing(...bookings) });
      renderApp('/bookings');

      const card = await findCard(codes[status]);
      const badge = within(card).getByText(text);
      expect(badge).toBeVisible();
      expect(badge.closest('[data-tone]')).toHaveAttribute('data-tone', tone);
    },
  );

  it('shows the code, facility, produce and dates of each booking', async () => {
    mockApi({ ...signedIn, ...listing(paidDugbeBooking()) });
    renderApp('/bookings');

    const card = await findCard('CL-7KQ2M');
    expect(within(card).getByRole('heading', { name: dugbeProvider.display_name })).toBeVisible();
    expect(within(card).getByText('Ibadan North-West LGA')).toBeVisible();
    expect(within(card).getByText('Tomatoes, 10 crates')).toBeVisible();
    expect(within(card).getByText('Tue, 10 Nov 2026 to Tue, 17 Nov 2026')).toBeVisible();
  });

  it.each([
    ['days left', '2026-11-17', '7 days left, collect by Tue, 17 Nov 2026'],
    ['one day left', '2026-11-11', '1 day left, collect by Wed, 11 Nov 2026'],
    ['the end date', '2026-11-10', 'Collect today'],
    ['a passed end date', '2026-11-08', 'Collection was due 2 days ago'],
  ])('counts down to the end date of a booking in storage: %s', async (_, endDate, text) => {
    mockApi({ ...signedIn, ...listing(dugbeBooking({ status: 'in_storage', end_date: endDate })) });
    renderApp('/bookings');

    expect(await screen.findByText(text, undefined, SCREEN_TIMEOUT)).toBeVisible();
  });

  it('counts days in Lagos, which is already the next day before UTC midnight', async () => {
    // 23:30 UTC on 9 November is 00:30 on 10 November in Lagos.
    vi.setSystemTime(new Date('2026-11-09T23:30:00Z'));
    mockApi({ ...signedIn, ...listing(dugbeBooking({ status: 'in_storage' })) });
    renderApp('/bookings');

    expect(
      await screen.findByText(
        '7 days left, collect by Tue, 17 Nov 2026',
        undefined,
        SCREEN_TIMEOUT,
      ),
    ).toBeVisible();
  });

  it('shows no countdown for a booking that is not in storage', async () => {
    mockApi({ ...signedIn, ...listing(dugbeBooking({ status: 'confirmed' })) });
    renderApp('/bookings');

    await findCard('CL-7KQ2M');
    expect(screen.queryByText(/left, collect by|Collect today|Collection was due/)).toBeNull();
  });

  it('says so when there are no bookings, and offers a search', async () => {
    mockApi({ ...signedIn, ...listing() });
    const user = renderApp('/bookings');

    expect(await findHeading('No bookings yet')).toBeVisible();
    await user.click(screen.getByRole('button', { name: /^Find cold storage/ }));

    await waitForPath('/location');
  });

  it('shows a loading state until the bookings arrive', async () => {
    let answer!: (response: Response) => void;
    mockApi({
      ...signedIn,
      'GET /bookings': () => new Promise<Response>((resolve) => (answer = resolve)),
    });
    renderApp('/bookings');

    expect(
      await screen.findByText('Loading your bookings...', undefined, SCREEN_TIMEOUT),
    ).toBeVisible();
    answer(jsonResponse(200, { data: [summaryOf(paidDugbeBooking())] }));
    expect(await findCard('CL-7KQ2M')).toBeVisible();
  });

  it('explains a failure and loads again on Try again', async () => {
    mockApi({
      ...signedIn,
      'GET /bookings': [
        errorResponse(500, 'internal'),
        jsonResponse(200, { data: [summaryOf(paidDugbeBooking())] }),
      ],
    });
    const user = renderApp('/bookings');

    expect(await findHeading("Couldn't load your bookings")).toBeVisible();
    expect(
      screen.getByText('Something went wrong on our side. Try again in a moment.'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await findCard('CL-7KQ2M')).toBeVisible();
  });

  it('opens the booking from its card', async () => {
    mockApi({ ...signedIn, ...listing(paidDugbeBooking()), ...detail(paidDugbeBooking()) });
    const user = renderApp('/bookings');

    await user.click(within(await findCard('CL-7KQ2M')).getByRole('link'));

    await waitForPath(`/bookings/${DUGBE_BOOKING_ID}`);
  });
});

const confirmedBooking = paidDugbeBooking({
  status: 'confirmed',
  start_date: '2026-11-12',
  end_date: '2026-11-19',
  provider: { ...paidDugbeBooking().provider, phone: '+2348006000123' },
  status_history: [
    { status: 'payment_pending', at: '2026-11-10T09:00:00.000Z' },
    { status: 'pending_provider', at: '2026-11-10T09:05:00.000Z' },
    { status: 'confirmed', at: '2026-11-10T09:40:00.000Z' },
  ],
  cancellation: {
    allowed: true,
    refund_kobo: 1_050_000,
    deposit_refund_ends_at: '2026-11-10T23:00:00.000Z',
  },
});

const cancelledResult = (booking: FarmerBooking, refund: number) =>
  jsonResponse(
    200,
    cancelledBookingSchema.parse({
      ...booking,
      status: 'cancelled',
      cancelled_by: 'farmer',
      provider: { ...booking.provider, phone: null },
      status_history: [
        ...booking.status_history,
        { status: 'cancelled', at: '2026-11-10T09:10:00.000Z' },
      ],
      cancellation: { allowed: false },
      refund_kobo: refund,
    }),
  );

describe('booking detail', FLOW_TIMEOUT, () => {
  const openDetail = () => renderApp(`/bookings/${DUGBE_BOOKING_ID}`);

  it('shows every fact and amount the API gives, as it gives them', async () => {
    // Deliberately not a sum of its parts: the screen must show the API's figures.
    const booking = confirmedBooking;
    const odd = { ...booking, total_charged_online_kobo: 1_234_567, service_fee_kobo: 2_500 };
    mockApi({ ...signedIn, ...detail(odd) });
    openDetail();

    expect(await findHeading(dugbeProvider.display_name)).toBeVisible();
    expect(screen.getByText('CL-7KQ2M')).toBeVisible();
    expect(document.querySelector('[data-tone]')).toHaveTextContent('Confirmed');
    expect(screen.getByText(dugbeProvider.address_text)).toBeVisible();
    expect(screen.getByText('Near Opposite Cocoa House')).toBeVisible();
    expect(screen.getByText('Tomatoes, 10 crates')).toBeVisible();
    expect(screen.getByText('Thu, 12 Nov 2026 to Thu, 19 Nov 2026 (7 days)')).toBeVisible();
    expect(screen.getByText('₦500 per crate per day')).toBeVisible();
    expect(screen.getByText('₦35,000')).toBeVisible();
    expect(screen.getByText('₦10,500')).toBeVisible();
    expect(screen.getByText('₦25')).toBeVisible();
    expect(screen.getByText('₦12,345.67')).toBeVisible();
    expect(screen.getByText('₦24,500')).toBeVisible();
  });

  it('shows the facility phone once the facility has accepted', async () => {
    mockApi({ ...signedIn, ...detail(confirmedBooking) });
    openDetail();

    const call = await screen.findByRole(
      'link',
      { name: `Call ${dugbeProvider.display_name}` },
      SCREEN_TIMEOUT,
    );
    expect(call).toHaveAttribute('href', 'tel:+2348006000123');
    expect(call).toHaveTextContent('+234 800 600 0123');
  });

  it('has no phone while the API gives none', async () => {
    mockApi({ ...signedIn, ...detail(paidDugbeBooking()) });
    openDetail();

    await findHeading(dugbeProvider.display_name);
    expect(screen.queryByText('Phone')).toBeNull();
  });

  it('lists the status history, oldest first, in Lagos time', async () => {
    mockApi({ ...signedIn, ...detail(confirmedBooking) });
    openDetail();

    const history = await screen.findByRole('region', { name: 'History' }, SCREEN_TIMEOUT);
    const steps = within(history).getAllByRole('listitem');
    expect(steps.map((step) => step.textContent)).toEqual([
      'Waiting for payment10:00 am on Tue, 10 Nov',
      'Waiting for the cold room10:05 am on Tue, 10 Nov',
      'Confirmed10:40 am on Tue, 10 Nov',
    ]);
  });

  it("shows when the cold room must answer while it hasn't yet", async () => {
    mockApi({ ...signedIn, ...detail(paidDugbeBooking()) });
    openDetail();

    expect(
      await screen.findByText('12:05 pm on Tue, 10 Nov', undefined, SCREEN_TIMEOUT),
    ).toBeVisible();
    expect(screen.getByText('Cold room answers by')).toBeVisible();
  });

  it('offers no cancel when the API says it is not allowed', async () => {
    mockApi({ ...signedIn, ...detail(dugbeBooking()) });
    openDetail();

    await findHeading(dugbeProvider.display_name);
    expect(screen.queryByRole('button', { name: 'Cancel booking' })).toBeNull();
  });
});

describe('cancelling a booking', FLOW_TIMEOUT, () => {
  const openDetail = () => renderApp(`/bookings/${DUGBE_BOOKING_ID}`);

  it('shows the policy and the exact refund, then what was refunded', async () => {
    const fetchMock = mockApi({
      ...signedIn,
      ...detail(confirmedBooking),
      ...listing(confirmedBooking),
      [cancelRoute]: cancelledResult(confirmedBooking, 1_050_000),
    });
    const user = openDetail();

    await user.click(await screen.findByRole('button', { name: 'Cancel booking' }, SCREEN_TIMEOUT));

    expect(
      await screen.findByText(
        'Cancel before 12:00 am on Wed, 11 Nov to get your deposit back. The service fee is not refunded.',
      ),
    ).toBeVisible();
    expect(screen.getByText('You get back: ₦10,500')).toBeVisible();
    expect(requestsTo(fetchMock, 'POST', `/bookings/${DUGBE_BOOKING_ID}/cancel`)).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Yes, cancel booking' }));

    expect(await findHeading('Booking cancelled')).toBeVisible();
    expect(
      screen.getByText(
        "We're refunding ₦10,500 to you. It can take a few days to reach your account.",
      ),
    ).toBeVisible();
    expect(screen.getAllByText('Cancelled').length).toBeGreaterThan(0);
    const cancels = requestsTo(fetchMock, 'POST', `/bookings/${DUGBE_BOOKING_ID}/cancel`);
    expect(cancels).toHaveLength(1);
    expect(cancelBookingBodySchema.optional().parse(bodyOf(cancels[0]!))).toBeUndefined();
  });

  it('reads the booking again before asking, and shows the fresh refund', async () => {
    const late = {
      ...confirmedBooking,
      cancellation: { ...confirmedBooking.cancellation, refund_kobo: 0 },
    } as FarmerBooking;
    const fetchMock = mockApi({ ...signedIn, ...detail(confirmedBooking, late) });
    const user = openDetail();

    await user.click(await screen.findByRole('button', { name: 'Cancel booking' }, SCREEN_TIMEOUT));

    expect(
      await screen.findByText(
        'The time to get your deposit back ended at 12:00 am on Wed, 11 Nov, so cancelling now refunds nothing.',
      ),
    ).toBeVisible();
    expect(screen.getByText('You get back: ₦0')).toBeVisible();
    expect(requestsTo(fetchMock, 'GET', `/bookings/${DUGBE_BOOKING_ID}`)).toHaveLength(2);
  });

  it('refunds everything before the facility accepts, and says so', async () => {
    const pending = paidDugbeBooking();
    mockApi({
      ...signedIn,
      ...detail(pending),
      ...listing(pending),
      [cancelRoute]: cancelledResult(pending, 1_050_000),
    });
    const user = openDetail();

    await user.click(await screen.findByRole('button', { name: 'Cancel booking' }, SCREEN_TIMEOUT));

    expect(
      await screen.findByText(
        `${dugbeProvider.display_name} hasn't accepted yet, so cancelling now refunds everything you paid online.`,
      ),
    ).toBeVisible();
    expect(screen.getByText('You get back: ₦10,500')).toBeVisible();
  });

  it('says nothing is refunded when the refund is nothing', async () => {
    const late = {
      ...confirmedBooking,
      cancellation: { ...confirmedBooking.cancellation, refund_kobo: 0 },
    } as FarmerBooking;
    mockApi({
      ...signedIn,
      ...detail(late),
      ...listing(late),
      [cancelRoute]: cancelledResult(late, 0),
    });
    const user = openDetail();

    await user.click(await screen.findByRole('button', { name: 'Cancel booking' }, SCREEN_TIMEOUT));
    await user.click(await screen.findByRole('button', { name: 'Yes, cancel booking' }));

    expect(await screen.findByText('Nothing is refunded for this booking.')).toBeVisible();
  });

  it('keeps the booking when the farmer changes their mind', async () => {
    const fetchMock = mockApi({ ...signedIn, ...detail(confirmedBooking) });
    const user = openDetail();

    await user.click(await screen.findByRole('button', { name: 'Cancel booking' }, SCREEN_TIMEOUT));
    await user.click(await screen.findByRole('button', { name: 'Keep booking' }));

    expect(screen.queryByText('You get back: ₦10,500')).toBeNull();
    expect(requestsTo(fetchMock, 'POST', `/bookings/${DUGBE_BOOKING_ID}/cancel`)).toHaveLength(0);
  });

  it('explains a booking that can no longer be cancelled', async () => {
    const checkedIn = paidDugbeBooking({ status: 'in_storage', cancellation: { allowed: false } });
    mockApi({
      ...signedIn,
      ...detail(confirmedBooking, confirmedBooking, checkedIn),
      [cancelRoute]: errorResponse(409, 'conflict'),
    });
    const user = openDetail();

    await user.click(await screen.findByRole('button', { name: 'Cancel booking' }, SCREEN_TIMEOUT));
    await user.click(await screen.findByRole('button', { name: 'Yes, cancel booking' }));

    expect(
      await screen.findByText("This booking can't be cancelled any more. Its status has changed."),
    ).toBeVisible();
    expect(await screen.findByText('In storage')).toBeVisible();
  });
});

describe('Book again', FLOW_TIMEOUT, () => {
  // Booked earlier for 10 crates over 7 days; Book again starts it today (10 November in Lagos).
  const earlier = paidDugbeBooking({
    status: 'completed',
    start_date: '2026-10-01',
    end_date: '2026-10-08',
  });
  const againQuoteBody = bookingQuoteBodySchema.parse({
    provider_id: dugbe.provider.id,
    quantity: 10,
    capacity_unit: 'crates',
    days: 7,
    start_date: '2026-11-10',
  });

  it("asks for a quote for the same terms from today and opens the facility's review", async () => {
    const fetchMock = mockApi({
      ...signedIn,
      ...crops,
      ...dugbeFound,
      ...listing(earlier),
      'POST /bookings/quote': jsonResponse(200, dugbeQuote()),
    });
    const user = renderApp('/bookings');

    await user.click(
      await screen.findByRole(
        'button',
        { name: `Book again at ${dugbeProvider.display_name}` },
        SCREEN_TIMEOUT,
      ),
    );

    await vi.waitFor(() => expect(currentFullPath()).toBe(dugbeReviewPath), PAGE_CHANGE_TIMEOUT);
    expect(bodyOf(requestsTo(fetchMock, 'POST', '/bookings/quote')[0]!)).toEqual(againQuoteBody);
  });

  it.each([
    [
      'has no space',
      errorResponse(409, 'conflict', {
        details: { provider_id: dugbe.provider.id, available_quantity: 0 },
      }),
      'That cold room has no space for this booking now. Choose where you are to find others nearby. Your produce and amount are filled in.',
    ],
    [
      'is gone',
      errorResponse(404, 'not_found'),
      'That cold room is no longer taking bookings. Choose where you are to find others nearby. Your produce and amount are filled in.',
    ],
  ])(
    'falls back to search with the produce and amount filled in when the facility %s',
    async (_, refusal, notice) => {
      const longer = { ...earlier, quantity: 20, duration_days: 14 };
      mockApi({ ...signedIn, ...crops, ...listing(longer), 'POST /bookings/quote': refusal });
      const user = renderApp('/bookings');

      await user.click(
        await screen.findByRole('button', { name: /^Book again at/ }, SCREEN_TIMEOUT),
      );

      await waitForPath('/location');
      expect(await screen.findByText(notice)).toBeVisible();
      await pickArea(user, 'Bodija, Ibadan');
      expect(
        await screen.findByRole('button', { name: tomatoes.name }, SCREEN_TIMEOUT),
      ).toHaveAttribute('aria-pressed', 'true');
      await user.click(screen.getByRole('button', { name: /^Continue/ }));
      expect(await screen.findByLabelText('Amount', undefined, SCREEN_TIMEOUT)).toHaveValue('20');
      expect(screen.getByRole('radio', { name: 'Crates' })).toBeChecked();
      expect(screen.getByText('14')).toBeInTheDocument();
      expect(screen.getByLabelText('Start date')).toHaveValue('2026-11-10');
    },
  );

  it('stays on the list with a message when the quote fails for another reason', async () => {
    mockApi({
      ...signedIn,
      ...listing(earlier),
      'POST /bookings/quote': errorResponse(500, 'internal'),
    });
    const user = renderApp('/bookings');

    await user.click(await screen.findByRole('button', { name: /^Book again at/ }, SCREEN_TIMEOUT));

    expect(
      await screen.findByText('Something went wrong on our side. Try again in a moment.'),
    ).toBeVisible();
    expect(currentPath()).toBe('/bookings');
  });

  it('is not offered for a booking still waiting for payment', async () => {
    mockApi({ ...signedIn, ...listing(dugbeBooking()) });
    renderApp('/bookings');

    await findCard('CL-7KQ2M');
    expect(screen.queryByRole('button', { name: /^Book again/ })).toBeNull();
  });

  it('reaches payment from Home in 4 taps or fewer (PRD 7.4)', async () => {
    const fetchMock = mockApi({
      ...signedIn,
      ...crops,
      ...dugbeFound,
      ...listing(earlier),
      'POST /bookings/quote': jsonResponse(200, dugbeQuote()),
      'POST /bookings': jsonResponse(201, dugbeBooking()),
      'POST /payments/initialize': jsonResponse(200, {
        authorization_url: CHECKOUT_URL,
        reference: PAYMENT_REFERENCE,
      }),
    });
    const user = renderApp('/');
    let taps = 0;
    const tap = async (button: HTMLElement) => {
      taps += 1;
      await user.click(button);
    };

    await tap(await screen.findByRole('button', { name: /^My bookings/ }, SCREEN_TIMEOUT));
    await tap(await screen.findByRole('button', { name: /^Book again at/ }, SCREEN_TIMEOUT));
    await tap(await screen.findByRole('button', { name: 'Pay ₦10,500' }, SCREEN_TIMEOUT));
    await waitForPath(`/payment/${dugbe.provider.id}`);
    await tap(await screen.findByRole('button', { name: 'Pay ₦10,500' }, SCREEN_TIMEOUT));

    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith(CHECKOUT_URL));
    expect(taps).toBeLessThanOrEqual(4);
    expect(bodyOf(requestsTo(fetchMock, 'POST', '/bookings')[0]!)).toEqual(
      createBookingBodySchema.parse({ ...againQuoteBody, crop_id: tomatoes.id }),
    );
  });
});
