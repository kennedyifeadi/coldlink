import { describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { providerBookingsResponseSchema } from '@coldlink/shared';
import {
  errorResponse,
  jsonResponse,
  mockApi,
  requestsTo,
  sessionFixture,
  type MockRequest,
  urlOf,
} from '../../test/api';
import {
  actionRoute,
  BOOKING_ID,
  bookingDetail,
  bookingsRoute,
  dashboard,
  dashboardRoute,
  detailRoute,
  pastBooking,
  providerBooking,
  providerSignedIn,
  PROVIDER_ID,
} from '../../test/providerDashboardFixtures';
import { ownProviderFor, onboardingBody } from '../../test/providerFixtures';
import { renderApp, SCREEN_TIMEOUT } from '../../test/renderApp';

const DASHBOARD = `/provider/facilities/${PROVIDER_ID}`;
const BOOKINGS = `${DASHBOARD}/bookings`;
const DETAIL = `${BOOKINGS}/${BOOKING_ID}`;

const dropped = () => Promise.reject(new TypeError('Failed to fetch'));
const ok = (body: unknown) => jsonResponse(200, body);
const findHeading = (name: string | RegExp) =>
  screen.findByRole('heading', { name }, SCREEN_TIMEOUT);
const currentPath = () => screen.getByTestId('location').textContent;

const page = (bookings: ReturnType<typeof providerBooking>[], nextCursor: string | null = null) =>
  ok(providerBookingsResponseSchema.parse({ data: bookings, next_cursor: nextCursor }));

describe('your facilities', () => {
  it('opens a facility’s dashboard from its card', async () => {
    mockApi({
      ...providerSignedIn,
      'GET /providers/mine': ok({ data: [ownProviderFor(onboardingBody)] }),
      [dashboardRoute]: ok(dashboard()),
    });
    const user = renderApp('/provider/onboarding');

    await user.click(
      await screen.findByRole('link', { name: /Onboarding Test Cold Room/ }, SCREEN_TIMEOUT),
    );

    expect(await findHeading('Bodija Cold Room')).toBeInTheDocument();
    expect(currentPath()).toBe(DASHBOARD);
  });
});

describe('provider dashboard', () => {
  it('shows space today, what needs an answer, what is coming and the earnings', async () => {
    mockApi({ ...providerSignedIn, [dashboardRoute]: ok(dashboard()) });
    renderApp(DASHBOARD);

    expect(await findHeading('Bodija Cold Room')).toBeInTheDocument();
    expect(screen.getByText('Space booked today, Tue, 10 Nov 2026')).toBeInTheDocument();
    expect(screen.getByText('7.5 of 50 crates')).toBeInTheDocument();

    const requests = screen.getByRole('region', { name: /To answer/ });
    expect(within(requests).getByText('(6)')).toBeInTheDocument();
    expect(within(requests).getByText('CL-7K3Q9')).toBeInTheDocument();
    expect(within(requests).getByText('Answer by 3:45 pm, Tue, 10 Nov')).toBeInTheDocument();
    expect(within(requests).getByText('Waiting for your answer')).toBeInTheDocument();
    expect(within(requests).getByRole('link', { name: 'See all 6' })).toHaveAttribute(
      'href',
      `${BOOKINGS}?group=requests`,
    );

    const upcoming = screen.getByRole('region', { name: /Coming in/ });
    expect(within(upcoming).getByText('Peppers, 10 crates')).toBeInTheDocument();
    expect(within(upcoming).queryByRole('link', { name: /See all/ })).toBeNull();
    expect(screen.getByText('No produce is in storage.')).toBeInTheDocument();

    expect(screen.getByText('₦40,483.50')).toBeInTheDocument();
    expect(screen.getByText('₦5,000')).toBeInTheDocument();
  });

  it('says so for a facility that is not the user’s', async () => {
    mockApi({ ...providerSignedIn, [dashboardRoute]: errorResponse(404, 'not_found') });
    renderApp(DASHBOARD);

    expect(await findHeading('Facility not found')).toBeInTheDocument();
  });

  it('offers Try again when the connection drops', async () => {
    const fetchMock = mockApi({
      ...providerSignedIn,
      [dashboardRoute]: [dropped, dropped, ok(dashboard())],
    });
    const user = renderApp(DASHBOARD);

    await user.click(await screen.findByRole('button', { name: 'Try again' }, { timeout: 8000 }));

    expect(await findHeading('Bodija Cold Room')).toBeInTheDocument();
    expect(requestsTo(fetchMock, 'GET', `/providers/${PROVIDER_ID}/dashboard`).length).toBe(3);
  });

  it('is not found for a signed-in user who is not a provider', async () => {
    mockApi({ 'POST /auth/refresh': ok(sessionFixture({ roles: ['farmer'] })) });
    renderApp(DASHBOARD);

    expect(await findHeading('Page not found')).toBeInTheDocument();
  });
});

describe('provider bookings list', () => {
  const byGroup = ({ search }: MockRequest) => {
    const query = new URLSearchParams(search);
    if (query.get('group') === 'requests') return page([providerBooking()]);
    if (query.get('cursor') === null)
      return page([pastBooking(0), pastBooking(1)], pastBooking(1).id);
    return page([pastBooking(2)]);
  };

  it('lists a group at a time, and pages with Show more', async () => {
    const fetchMock = mockApi({ ...providerSignedIn, [bookingsRoute]: byGroup });
    const user = renderApp(BOOKINGS);

    const groups = await screen.findByRole(
      'navigation',
      { name: 'Booking groups' },
      SCREEN_TIMEOUT,
    );
    expect(within(groups).getByRole('link', { name: 'To answer' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(await screen.findByText('CL-7K3Q9')).toBeInTheDocument();

    await user.click(within(groups).getByRole('link', { name: 'Past' }));
    expect(await screen.findByText('CL-PAST2')).toBeInTheDocument();
    expect(screen.getByText('CL-PAST3')).toBeInTheDocument();
    expect(screen.getAllByText('Collected')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Show more' }));
    expect(await screen.findByText('CL-PAST4')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();

    const searches = fetchMock.mock.calls
      .map(([input]) => new URL(urlOf(input), 'http://localhost'))
      .filter((url) => url.pathname === `/api/v1/providers/${PROVIDER_ID}/bookings`)
      .map((url) => url.search);
    expect(searches).toEqual([
      '?group=requests',
      '?group=past',
      `?group=past&cursor=${pastBooking(1).id}`,
    ]);
  });

  it('says when a group is empty', async () => {
    mockApi({ ...providerSignedIn, [bookingsRoute]: page([]) });
    renderApp(`${BOOKINGS}?group=in_storage`);

    expect(await screen.findByText('No produce is in storage.', {}, SCREEN_TIMEOUT)).toBeVisible();
  });

  it('offers Try again when the list cannot load', async () => {
    mockApi({
      ...providerSignedIn,
      [bookingsRoute]: [dropped, dropped, page([providerBooking()])],
    });
    const user = renderApp(BOOKINGS);

    await user.click(await screen.findByRole('button', { name: 'Try again' }, { timeout: 8000 }));
    expect(await screen.findByText('CL-7K3Q9')).toBeInTheDocument();
  });
});

describe('provider booking detail', () => {
  it('shows the request with its Lagos deadline, money and history', async () => {
    mockApi({ ...providerSignedIn, [detailRoute]: ok(bookingDetail()) });
    renderApp(DETAIL);

    expect(await findHeading('Tomatoes, 10 crates')).toBeInTheDocument();
    expect(screen.getByText('CL-7K3Q9')).toBeInTheDocument();
    expect(screen.getByText('Answer by 3:45 pm, Tue, 10 Nov')).toBeInTheDocument();
    expect(screen.getByText('₦30,483')).toBeInTheDocument();
    expect(screen.getByText('₦94,836')).toBeInTheDocument();
    expect(screen.getByText('Tue, 1 Dec 2026 to Thu, 31 Dec 2026 (30 days)')).toBeInTheDocument();
    expect(screen.getAllByText('Waiting for your answer').length).toBeGreaterThan(0);
    expect(screen.getByText('Waiting for payment')).toBeInTheDocument();
  });

  it('accepts, then reloads the booking, the list and the dashboard', async () => {
    const fetchMock = mockApi({
      ...providerSignedIn,
      [dashboardRoute]: [ok(dashboard()), ok(dashboard({ requests: { count: 5, items: [] } }))],
      [detailRoute]: [ok(bookingDetail()), ok(bookingDetail({ status: 'confirmed' }))],
      [actionRoute('accept')]: ok(providerBooking({ status: 'confirmed' })),
    });
    const user = renderApp(DASHBOARD);

    await user.click(await screen.findByRole('link', { name: /CL-7K3Q9/ }, SCREEN_TIMEOUT));
    await user.click(await screen.findByRole('button', { name: 'Accept booking' }, SCREEN_TIMEOUT));

    expect(
      await screen.findByText("Booking accepted. We've sent the farmer your address."),
    ).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Check in produce' })).toBeInTheDocument();
    expect(requestsTo(fetchMock, 'POST', `/bookings/${BOOKING_ID}/accept`)).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Go back' }));
    expect(await screen.findByText('(5)')).toBeInTheDocument();
    expect(requestsTo(fetchMock, 'GET', `/providers/${PROVIDER_ID}/dashboard`)).toHaveLength(2);
  });

  it('asks once more before rejecting', async () => {
    const fetchMock = mockApi({
      ...providerSignedIn,
      [detailRoute]: [ok(bookingDetail()), ok(bookingDetail({ status: 'rejected' }))],
      [actionRoute('reject')]: ok(providerBooking({ status: 'rejected' })),
    });
    const user = renderApp(DETAIL);

    await user.click(await screen.findByRole('button', { name: 'Reject booking' }, SCREEN_TIMEOUT));
    expect(
      screen.getByText('Reject this booking? The farmer will get a full refund.'),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: "Don't reject" }));
    expect(requestsTo(fetchMock, 'POST', `/bookings/${BOOKING_ID}/reject`)).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Reject booking' }));
    await user.click(screen.getByRole('button', { name: 'Yes, reject it' }));

    expect(
      await screen.findByText('Booking rejected. The farmer will get a full refund.'),
    ).toBeVisible();
    expect(await screen.findByText('Rejected')).toBeInTheDocument();
    expect(requestsTo(fetchMock, 'POST', `/bookings/${BOOKING_ID}/reject`)).toHaveLength(1);
  });

  it('sends one request for a double tap', async () => {
    let release = () => {};
    const fetchMock = mockApi({
      ...providerSignedIn,
      [detailRoute]: [ok(bookingDetail()), ok(bookingDetail({ status: 'confirmed' }))],
      [actionRoute('accept')]: () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(ok(providerBooking({ status: 'confirmed' })));
        }),
    });
    renderApp(DETAIL);

    const accept = await screen.findByRole('button', { name: 'Accept booking' }, SCREEN_TIMEOUT);
    fireEvent.click(accept);
    fireEvent.click(accept);
    expect(await screen.findByRole('button', { name: 'Accepting...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject booking' })).toBeDisabled();
    release();

    expect(await screen.findByRole('button', { name: 'Check in produce' })).toBeInTheDocument();
    expect(requestsTo(fetchMock, 'POST', `/bookings/${BOOKING_ID}/accept`)).toHaveLength(1);
  });

  it('reloads and explains a 409 when the booking can no longer be answered', async () => {
    const fetchMock = mockApi({
      ...providerSignedIn,
      [detailRoute]: [ok(bookingDetail()), ok(bookingDetail({ status: 'expired' }))],
      [actionRoute('accept')]: errorResponse(409, 'conflict'),
    });
    const user = renderApp(DETAIL);

    await user.click(await screen.findByRole('button', { name: 'Accept booking' }, SCREEN_TIMEOUT));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This booking can no longer be answered.',
    );
    expect(await screen.findByText('Expired')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept booking' })).toBeNull();
    expect(
      requestsTo(fetchMock, 'GET', `/providers/${PROVIDER_ID}/bookings/${BOOKING_ID}`),
    ).toHaveLength(2);
  });

  it('keeps the booking on screen and offers Try again when the connection drops', async () => {
    const fetchMock = mockApi({
      ...providerSignedIn,
      [detailRoute]: [ok(bookingDetail()), ok(bookingDetail({ status: 'confirmed' }))],
      [actionRoute('accept')]: [dropped, ok(providerBooking({ status: 'confirmed' }))],
    });
    const user = renderApp(DETAIL);

    await user.click(await screen.findByRole('button', { name: 'Accept booking' }, SCREEN_TIMEOUT));
    expect(await screen.findByText(/No network connection/)).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Tomatoes, 10 crates' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Check in produce' })).toBeInTheDocument();
    expect(requestsTo(fetchMock, 'POST', `/bookings/${BOOKING_ID}/accept`)).toHaveLength(2);
  });

  it('shows the booking as not found when an action finds it gone', async () => {
    mockApi({
      ...providerSignedIn,
      [detailRoute]: [ok(bookingDetail()), errorResponse(404, 'not_found')],
      [actionRoute('accept')]: errorResponse(404, 'not_found'),
    });
    const user = renderApp(DETAIL);

    await user.click(await screen.findByRole('button', { name: 'Accept booking' }, SCREEN_TIMEOUT));

    expect(await findHeading('Booking not found')).toBeInTheDocument();
  });

  it('says from when check-in opens when it is too early', async () => {
    const confirmed = bookingDetail({ status: 'confirmed', provider_response_due_at: null });
    mockApi({
      ...providerSignedIn,
      [detailRoute]: ok(confirmed),
      [actionRoute('check-in')]: errorResponse(409, 'conflict', {
        details: { booking_id: BOOKING_ID, start_date: '2026-12-01' },
      }),
    });
    const user = renderApp(DETAIL);

    await user.click(
      await screen.findByRole('button', { name: 'Check in produce' }, SCREEN_TIMEOUT),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Check-in opens on Tue, 1 Dec 2026. Check the produce in then.',
    );
    expect(screen.getByRole('button', { name: 'Check in produce' })).toBeEnabled();
  });

  it('checks in, then shows the balance to collect and marks it collected', async () => {
    const fetchMock = mockApi({
      ...providerSignedIn,
      [detailRoute]: [
        ok(bookingDetail({ status: 'confirmed', provider_response_due_at: null })),
        ok(
          bookingDetail({
            status: 'in_storage',
            provider_response_due_at: null,
            checked_in_at: '2026-12-01T08:15:00.000Z',
          }),
        ),
        ok(
          bookingDetail({
            status: 'completed',
            provider_response_due_at: null,
            checked_in_at: '2026-12-01T08:15:00.000Z',
            collected_at: '2026-12-31T09:00:00.000Z',
          }),
        ),
      ],
      [actionRoute('check-in')]: ok(providerBooking({ status: 'in_storage' })),
      [actionRoute('collect')]: ok(providerBooking({ status: 'completed' })),
    });
    const user = renderApp(DETAIL);

    await user.click(
      await screen.findByRole('button', { name: 'Check in produce' }, SCREEN_TIMEOUT),
    );
    expect(
      await screen.findByText('Produce checked in. ColdLink now owes you the payout.'),
    ).toBeVisible();
    expect(await screen.findByText('Collect from the farmer')).toBeInTheDocument();
    expect(screen.getAllByText('₦94,836').length).toBe(2);
    expect(screen.getByText('9:15 am on Tue, 1 Dec')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Mark collected' }));
    expect(await screen.findByText('Booking marked collected.')).toBeVisible();
    expect(await screen.findAllByText('Collected')).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Mark collected' })).toBeNull();
    expect(requestsTo(fetchMock, 'POST', `/bookings/${BOOKING_ID}/collect`)).toHaveLength(1);
  });

  it('explains a 409 on collection and reloads', async () => {
    const stored = { status: 'in_storage' as const, provider_response_due_at: null };
    mockApi({
      ...providerSignedIn,
      [detailRoute]: [
        ok(bookingDetail(stored)),
        ok(bookingDetail({ ...stored, status: 'completed' })),
      ],
      [actionRoute('collect')]: errorResponse(409, 'conflict'),
    });
    const user = renderApp(DETAIL);

    await user.click(await screen.findByRole('button', { name: 'Mark collected' }, SCREEN_TIMEOUT));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This booking can no longer be marked collected.',
    );
    expect(await screen.findByText('Collected')).toBeInTheDocument();
  });

  it('is not found for an unknown booking', async () => {
    mockApi({ ...providerSignedIn, [detailRoute]: errorResponse(404, 'not_found') });
    renderApp(DETAIL);
    expect(await findHeading('Booking not found')).toBeInTheDocument();
  });

  it('offers Try again when the booking cannot load', async () => {
    mockApi({ ...providerSignedIn, [detailRoute]: [dropped, dropped, ok(bookingDetail())] });
    const user = renderApp(DETAIL);

    await user.click(await screen.findByRole('button', { name: 'Try again' }, { timeout: 8000 }));
    expect(await findHeading('Tomatoes, 10 crates')).toBeInTheDocument();
  });
});
