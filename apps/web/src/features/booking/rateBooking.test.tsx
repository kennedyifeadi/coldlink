import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import {
  bookingRatingPath,
  farmerBookingSchema,
  rateBookingBodySchema,
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
import { DUGBE_BOOKING_ID, dugbeBooking, dugbeProvider } from '../../test/bookingFixtures';
import { renderApp, SCREEN_TIMEOUT } from '../../test/renderApp';

// 10:00 in Lagos on 10 December 2026. Only Date is faked.
const NOW = new Date('2026-12-10T09:00:00Z');
const FLOW_TIMEOUT = { timeout: 30_000 };
const PAGE_CHANGE_TIMEOUT = { timeout: 15_000 };

const signedIn = { 'POST /auth/refresh': jsonResponse(200, sessionFixture()) };
const bookingRoute = `GET /bookings/${DUGBE_BOOKING_ID}`;
const rateRoute = `POST /bookings/${DUGBE_BOOKING_ID}/rating`;
const ratePath = bookingRatingPath(DUGBE_BOOKING_ID);
const detailPath = `/bookings/${DUGBE_BOOKING_ID}`;

const completedBooking = dugbeBooking({
  status: 'completed',
  provider: { ...dugbeBooking().provider, phone: '+2348006000123' },
  payment_expires_at: null,
  checked_in_at: '2026-11-10T10:00:00.000Z',
  collected_at: '2026-11-17T10:00:00.000Z',
  status_history: [
    { status: 'payment_pending', at: '2026-11-10T09:00:00.000Z' },
    { status: 'pending_provider', at: '2026-11-10T09:05:00.000Z' },
    { status: 'confirmed', at: '2026-11-10T09:40:00.000Z' },
    { status: 'in_storage', at: '2026-11-10T10:00:00.000Z' },
    { status: 'completed', at: '2026-11-17T10:00:00.000Z' },
  ],
});

const ratedBooking = (stars: number, comment: string | null): FarmerBooking => ({
  ...completedBooking,
  rating: { stars, comment, created_at: '2026-12-10T09:01:00.000Z' },
});

const bookingReply = (booking: FarmerBooking) =>
  jsonResponse(200, farmerBookingSchema.parse(booking));

const currentPath = () => screen.getByTestId('location').textContent;
const waitForPath = (path: string) =>
  vi.waitFor(() => expect(currentPath()).toBe(path), PAGE_CHANGE_TIMEOUT);
const findHeading = (name: string) => screen.findByRole('heading', { name }, SCREEN_TIMEOUT);
const starButton = (stars: number) => screen.getByRole('button', { name: `${stars} out of 5` });
const sendButton = () => screen.getByRole('button', { name: 'Send rating' });
const ratingTitle = `How was ${dugbeProvider.display_name}?`;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

describe('rating screen', FLOW_TIMEOUT, () => {
  it('rates with one tap and a comment, then thanks the farmer and shows the rating', async () => {
    const fetchMock = mockApi({
      ...signedIn,
      [bookingRoute]: [bookingReply(completedBooking), bookingReply(ratedBooking(4, 'Cold'))],
      [rateRoute]: jsonResponse(201, ratedBooking(4, 'Cold')),
    });
    const user = renderApp(ratePath);

    await findHeading(ratingTitle);
    expect(screen.getByText('Tap a star to rate.')).toBeVisible();
    await user.click(starButton(4));
    expect(starButton(4)).toHaveAttribute('aria-pressed', 'true');
    expect(starButton(5)).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('4 out of 5: Very good')).toBeVisible();
    await user.type(screen.getByLabelText(/Anything to add\?/), 'Cold');
    expect(screen.getByText('4 of 500 characters')).toBeVisible();
    await user.click(sendButton());

    expect(await findHeading(`Thank you for rating ${dugbeProvider.display_name}`)).toBeVisible();
    expect(screen.getByText('4 out of 5: Very good')).toBeVisible();
    expect(screen.getByText('Cold')).toBeVisible();
    const sent = requestsTo(fetchMock, 'POST', `/bookings/${DUGBE_BOOKING_ID}/rating`);
    expect(sent.map(bodyOf)).toEqual([{ stars: 4, comment: 'Cold' }]);
    expect(rateBookingBodySchema.safeParse(bodyOf(sent[0]!)).success).toBe(true);
  });

  it('reads the booking again after rating, so its detail shows the rating', async () => {
    const fetchMock = mockApi({
      ...signedIn,
      [bookingRoute]: [bookingReply(completedBooking), bookingReply(ratedBooking(5, null))],
      [rateRoute]: jsonResponse(201, ratedBooking(5, null)),
    });
    const user = renderApp(ratePath);

    await findHeading(ratingTitle);
    await user.click(starButton(5));
    await user.click(sendButton());
    await findHeading(`Thank you for rating ${dugbeProvider.display_name}`);
    await vi.waitFor(() =>
      expect(requestsTo(fetchMock, 'GET', `/bookings/${DUGBE_BOOKING_ID}`)).toHaveLength(2),
    );

    await user.click(screen.getByRole('button', { name: 'See booking' }));
    await waitForPath(detailPath);
    const card = await screen.findByRole('region', { name: 'Your rating' }, SCREEN_TIMEOUT);
    expect(within(card).getByText('5 out of 5: Excellent')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Rate your stay' })).toBeNull();
  });

  it('sends no comment when the box is left blank', async () => {
    const fetchMock = mockApi({
      ...signedIn,
      [bookingRoute]: [bookingReply(completedBooking), bookingReply(ratedBooking(2, null))],
      [rateRoute]: jsonResponse(201, ratedBooking(2, null)),
    });
    const user = renderApp(ratePath);

    await findHeading(ratingTitle);
    await user.click(starButton(2));
    await user.type(screen.getByLabelText(/Anything to add\?/), '   ');
    await user.click(sendButton());

    await findHeading(`Thank you for rating ${dugbeProvider.display_name}`);
    const sent = requestsTo(fetchMock, 'POST', `/bookings/${DUGBE_BOOKING_ID}/rating`);
    expect(sent.map(bodyOf)).toEqual([{ stars: 2 }]);
  });

  it('asks for stars before sending anything', async () => {
    const fetchMock = mockApi({ ...signedIn, [bookingRoute]: bookingReply(completedBooking) });
    const user = renderApp(ratePath);

    await findHeading(ratingTitle);
    await user.click(sendButton());

    expect(screen.getByRole('alert')).toHaveTextContent('Tap a star to rate your stay.');
    expect(requestsTo(fetchMock, 'POST', `/bookings/${DUGBE_BOOKING_ID}/rating`)).toEqual([]);
    await user.click(starButton(3));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('drops a second tap made while the first is still being sent', async () => {
    let answer: (response: Response) => void = () => undefined;
    const fetchMock = mockApi({
      ...signedIn,
      [bookingRoute]: [bookingReply(completedBooking), bookingReply(ratedBooking(5, null))],
      [rateRoute]: () =>
        new Promise<Response>((resolve) => {
          answer = resolve;
        }),
    });
    const user = renderApp(ratePath);

    await findHeading(ratingTitle);
    await user.click(starButton(5));
    const button = sendButton();
    await user.dblClick(button);

    expect(await screen.findByRole('button', { name: 'Sending...' })).toBeDisabled();
    expect(requestsTo(fetchMock, 'POST', `/bookings/${DUGBE_BOOKING_ID}/rating`)).toHaveLength(1);
    answer(jsonResponse(201, ratedBooking(5, null)));
    await findHeading(`Thank you for rating ${dugbeProvider.display_name}`);
    expect(requestsTo(fetchMock, 'POST', `/bookings/${DUGBE_BOOKING_ID}/rating`)).toHaveLength(1);
  });

  it('keeps the stars and comment through a dropped connection and offers Try again', async () => {
    const fetchMock = mockApi({
      ...signedIn,
      [bookingRoute]: [
        bookingReply(completedBooking),
        bookingReply(ratedBooking(3, 'Far from the road')),
      ],
      [rateRoute]: [
        () => Promise.reject(new TypeError('Failed to fetch')),
        jsonResponse(201, ratedBooking(3, 'Far from the road')),
      ],
    });
    const user = renderApp(ratePath);

    await findHeading(ratingTitle);
    await user.click(starButton(3));
    await user.type(screen.getByLabelText(/Anything to add\?/), 'Far from the road');
    await user.click(sendButton());

    const retry = await screen.findByRole('button', { name: 'Try again' }, SCREEN_TIMEOUT);
    expect(screen.getByRole('alert')).toHaveTextContent('No connection.');
    expect(starButton(3)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText(/Anything to add\?/)).toHaveValue('Far from the road');

    await user.click(retry);
    await findHeading(`Thank you for rating ${dugbeProvider.display_name}`);
    const sent = requestsTo(fetchMock, 'POST', `/bookings/${DUGBE_BOOKING_ID}/rating`);
    expect(sent.map(bodyOf)).toEqual([
      { stars: 3, comment: 'Far from the road' },
      { stars: 3, comment: 'Far from the road' },
    ]);
  });

  it('shows the rating already given when another rating got there first', async () => {
    mockApi({
      ...signedIn,
      [bookingRoute]: [bookingReply(completedBooking), bookingReply(ratedBooking(2, 'Too warm'))],
      [rateRoute]: errorResponse(409, 'conflict'),
    });
    const user = renderApp(ratePath);

    await findHeading(ratingTitle);
    await user.click(starButton(5));
    await user.click(sendButton());

    expect(await findHeading("You've rated this stay")).toBeVisible();
    expect(screen.getByText('2 out of 5: Fair')).toBeVisible();
    expect(screen.getByText('Too warm')).toBeVisible();
  });

  it('shows an existing rating instead of the form', async () => {
    mockApi({ ...signedIn, [bookingRoute]: bookingReply(ratedBooking(4, null)) });
    renderApp(ratePath);

    expect(await findHeading("You've rated this stay")).toBeVisible();
    expect(screen.getByText('4 out of 5: Very good')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Send rating' })).toBeNull();
  });

  it.each<BookingStatus>(['confirmed', 'in_storage', 'pending_provider'])(
    'explains a %s booking can be rated once collected, and links back to it',
    async (status) => {
      mockApi({ ...signedIn, [bookingRoute]: bookingReply({ ...completedBooking, status }) });
      const user = renderApp(ratePath);

      expect(await findHeading('You can rate this once your produce is collected')).toBeVisible();
      await user.click(screen.getByRole('button', { name: 'See booking' }));
      await waitForPath(detailPath);
    },
  );

  it.each<BookingStatus>(['cancelled', 'rejected', 'expired', 'no_show'])(
    'says a %s booking cannot be rated',
    async (status) => {
      mockApi({ ...signedIn, [bookingRoute]: bookingReply({ ...completedBooking, status }) });
      renderApp(ratePath);

      expect(await findHeading("This booking can't be rated")).toBeVisible();
      expect(screen.getByRole('button', { name: 'See booking' })).toBeVisible();
    },
  );

  it('explains a booking that stopped being rateable after the screen loaded', async () => {
    mockApi({
      ...signedIn,
      [bookingRoute]: [
        bookingReply(completedBooking),
        bookingReply({ ...completedBooking, status: 'in_storage' }),
      ],
      [rateRoute]: errorResponse(409, 'conflict'),
    });
    const user = renderApp(ratePath);

    await findHeading(ratingTitle);
    await user.click(starButton(1));
    await user.click(sendButton());

    expect(await findHeading('You can rate this once your produce is collected')).toBeVisible();
  });

  it('says the booking was not found for a 404', async () => {
    mockApi({ ...signedIn, [bookingRoute]: errorResponse(404, 'not_found') });
    renderApp(ratePath);

    expect(await findHeading("We couldn't find this booking")).toBeVisible();
  });

  it('says the booking was not found when the rating gets a 404', async () => {
    mockApi({
      ...signedIn,
      [bookingRoute]: [bookingReply(completedBooking), errorResponse(404, 'not_found')],
      [rateRoute]: errorResponse(404, 'not_found'),
    });
    const user = renderApp(ratePath);

    await findHeading(ratingTitle);
    await user.click(starButton(4));
    await user.click(sendButton());

    expect(await findHeading("We couldn't find this booking")).toBeVisible();
  });

  it('says the booking was not found for an id that is not one', async () => {
    mockApi(signedIn);
    renderApp(bookingRatingPath('CL-7KQ2M'));

    expect(await findHeading("We couldn't find this booking")).toBeVisible();
  });

  it('sends a signed-out farmer from the SMS link to sign in first', async () => {
    mockApi({ 'POST /auth/refresh': errorResponse(401, 'unauthorized') });
    renderApp(ratePath);

    await waitForPath('/onboarding');
  });
});

describe('rating from the booking detail', FLOW_TIMEOUT, () => {
  it('offers Rate your stay on a completed booking that has no rating', async () => {
    mockApi({ ...signedIn, [bookingRoute]: bookingReply(completedBooking) });
    const user = renderApp(detailPath);

    await findHeading('How was your stay?');
    await user.click(screen.getByRole('button', { name: 'Rate your stay' }));

    await waitForPath(ratePath);
    expect(await findHeading(ratingTitle)).toBeVisible();
  });

  it('shows the rating instead of the button once rated', async () => {
    mockApi({ ...signedIn, [bookingRoute]: bookingReply(ratedBooking(3, 'Fine')) });
    renderApp(detailPath);

    const card = await screen.findByRole('region', { name: 'Your rating' }, SCREEN_TIMEOUT);
    expect(within(card).getByText('3 out of 5: Good')).toBeVisible();
    expect(within(card).getByText('Fine')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Rate your stay' })).toBeNull();
  });

  it.each<BookingStatus>(['confirmed', 'in_storage', 'cancelled'])(
    'offers no rating on a %s booking',
    async (status) => {
      mockApi({ ...signedIn, [bookingRoute]: bookingReply({ ...completedBooking, status }) });
      renderApp(detailPath);

      await findHeading(dugbeProvider.display_name);
      expect(screen.queryByRole('button', { name: 'Rate your stay' })).toBeNull();
      expect(screen.queryByText('Your rating')).toBeNull();
    },
  );
});
