import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { providerPayoutsResponseSchema, type OwnProvider } from '@coldlink/shared';
import {
  bodyOf,
  errorResponse,
  jsonResponse,
  mockApi,
  requestsTo,
  type MockRequest,
} from '../../test/api';
import {
  dashboard,
  dashboardRoute,
  payoutsRoute,
  providerPayout,
  providerSignedIn,
  PROVIDER_ID,
  updateRoute,
} from '../../test/providerDashboardFixtures';
import { onboardingBody, ownProviderFor, photoOne, photoTwo } from '../../test/providerFixtures';
import { renderApp, SCREEN_TIMEOUT } from '../../test/renderApp';

const DASHBOARD = `/provider/facilities/${PROVIDER_ID}`;
const SETTINGS = `${DASHBOARD}/settings`;
const EARNINGS = `${DASHBOARD}/earnings`;
const PHOTOS_ROUTE = `POST /providers/${PROVIDER_ID}/photos`;

const dropped = () => Promise.reject(new TypeError('Failed to fetch'));
const ok = (body: unknown) => jsonResponse(200, body);
const findHeading = (name: string | RegExp) =>
  screen.findByRole('heading', { name }, SCREEN_TIMEOUT);

// 40 crates at ₦525.50 per crate per day; the dashboard has 7.5 crates booked today.
const facility = (overrides: Partial<OwnProvider> = {}) =>
  ownProviderFor(onboardingBody, overrides);
const mine = (provider: OwnProvider = facility()) => ok({ data: [provider] });

/** Your facilities and the edit sharing one facility, so a save shows when it is read again. */
const storedFacility = (changesFor: (body: Record<string, unknown>) => Partial<OwnProvider>) => {
  let current = facility();
  return {
    'GET /providers/mine': () => mine(current),
    [updateRoute]: ({ body }: MockRequest) => {
      current = facility({ ...current, ...changesFor(body as Record<string, unknown>) });
      return ok(current);
    },
  };
};

const settingsRoutes = (routes: Parameters<typeof mockApi>[0] = {}) => ({
  ...providerSignedIn,
  'GET /providers/mine': mine(),
  [dashboardRoute]: ok(dashboard()),
  ...routes,
});

const openSettings = async (routes: Parameters<typeof mockApi>[0] = {}) => {
  const fetchMock = mockApi(settingsRoutes(routes));
  const user = renderApp(SETTINGS);
  await findHeading('Onboarding Test Cold Room');
  return { fetchMock, user };
};

const capacityInput = () => screen.getByRole('textbox', { name: 'Total space' });
const priceInput = () => screen.getByRole('textbox', { name: 'Price per crate per day' });
const save = () => screen.getByRole('button', { name: 'Save changes' });
const patches = (fetchMock: ReturnType<typeof mockApi>) =>
  requestsTo(fetchMock, 'PATCH', `/providers/${PROVIDER_ID}`).map(bodyOf);

const jpeg = (name: string) => new File(['jpeg bytes'], name, { type: 'image/jpeg' });

beforeEach(() => {
  let next = 0;
  // jsdom has no object URLs; the previews only need a string.
  URL.createObjectURL = () => `blob:preview-${next++}`;
  URL.revokeObjectURL = () => {};
});

describe('facility dashboard links', () => {
  it('opens settings and earnings', async () => {
    mockApi({ ...providerSignedIn, [dashboardRoute]: ok(dashboard()) });
    renderApp(DASHBOARD);

    expect(
      await screen.findByRole('link', { name: 'Facility settings' }, SCREEN_TIMEOUT),
    ).toHaveAttribute('href', SETTINGS);
    expect(screen.getByRole('link', { name: 'See payouts' })).toHaveAttribute('href', EARNINGS);
  });
});

describe('facility settings', () => {
  it('shows the facility as it is, with masked numbers and no unit choice', async () => {
    await openSettings();

    expect(capacityInput()).toHaveValue('40');
    expect(priceInput()).toHaveValue('525.5');
    expect(
      screen.getByText(
        "Measured in crates. The unit can't be changed, because your bookings are counted in it.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'In naira. A new price is for new bookings only. Bookings already made keep their price.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByText('+234803***4567')).toBeInTheDocument();
    expect(screen.getByText('Not given')).toBeInTheDocument();
    expect(screen.getByText('Taking bookings')).toBeInTheDocument();
  });

  it('sends only the fields that changed, then reads the facility and the dashboard again', async () => {
    const saved = facility({ capacity_total: 45, price_per_unit_per_day_kobo: 60_000 });
    const { fetchMock, user } = await openSettings({
      'GET /providers/mine': [mine(), mine(saved)],
      [updateRoute]: ok(saved),
    });

    await user.clear(capacityInput());
    await user.type(capacityInput(), '45');
    await user.clear(priceInput());
    await user.type(priceInput(), '600');
    await user.click(save());

    expect(await screen.findByText('Changes saved.')).toBeInTheDocument();
    expect(patches(fetchMock)).toEqual([
      { capacity_total: 45, price_per_unit_per_day_kobo: 60_000 },
    ]);
    expect(priceInput()).toHaveValue('600');
    await vi.waitFor(() => {
      expect(requestsTo(fetchMock, 'GET', '/providers/mine')).toHaveLength(2);
      expect(requestsTo(fetchMock, 'GET', `/providers/${PROVIDER_ID}/dashboard`)).toHaveLength(2);
    });
  });

  it('sends nothing when nothing changed', async () => {
    const { fetchMock, user } = await openSettings();

    await user.click(save());

    expect(screen.getByText('Nothing to save. Change a field first.')).toBeInTheDocument();
    expect(patches(fetchMock)).toEqual([]);
  });

  it('sends a new booking number, and checks it before sending', async () => {
    const { fetchMock, user } = await openSettings(
      storedFacility(() => ({ phone_masked: '+234805***0000' })),
    );

    await user.click(screen.getByRole('button', { name: 'Change the number for booking SMS' }));
    const field = screen.getByRole('textbox', { name: 'New number for booking SMS' });
    await user.type(field, '0805 12');
    await user.click(save());
    expect(
      screen.getByText('Enter a Nigerian mobile number, like 0803 123 4567.'),
    ).toBeInTheDocument();
    expect(patches(fetchMock)).toEqual([]);

    await user.type(field, '3 0000');
    await user.click(save());

    expect(await screen.findByText('Changes saved.')).toBeInTheDocument();
    expect(patches(fetchMock)).toEqual([{ phone: '+2348051230000' }]);
    expect(screen.getByText('+234805***0000')).toBeInTheDocument();
  });

  it("shows the API's message next to its field", async () => {
    const { user } = await openSettings({
      [updateRoute]: errorResponse(400, 'validation_failed', {
        details: [
          {
            location: 'body',
            path: 'price_per_unit_per_day_kobo',
            message: 'Enter a price above 0',
          },
        ],
      }),
    });

    await user.clear(priceInput());
    await user.type(priceInput(), '700');
    await user.click(save());

    expect(await screen.findByText('Enter a price above 0')).toBeInTheDocument();
    expect(priceInput()).toHaveAttribute('aria-invalid', 'true');
    expect(capacityInput()).toHaveAttribute('aria-invalid', 'false');
  });

  it('keeps the entries when the connection drops, and saves on the next try', async () => {
    const { fetchMock, user } = await openSettings({
      [updateRoute]: [dropped, ok(facility({ price_per_unit_per_day_kobo: 70_000 }))],
    });

    await user.clear(priceInput());
    await user.type(priceInput(), '700');
    await user.click(save());

    expect(
      await screen.findByText('No network connection. Check your data or Wi-Fi, then try again.'),
    ).toBeInTheDocument();
    expect(priceInput()).toHaveValue('700');

    await user.click(save());
    expect(await screen.findByText('Changes saved.')).toBeInTheDocument();
    expect(patches(fetchMock)).toEqual([
      { price_per_unit_per_day_kobo: 70_000 },
      { price_per_unit_per_day_kobo: 70_000 },
    ]);
  });

  it("warns, without stopping the save, when the space is below today's bookings", async () => {
    const { fetchMock, user } = await openSettings({
      [updateRoute]: ok(facility({ capacity_total: 5 })),
    });

    await user.clear(capacityInput());
    await user.type(capacityInput(), '5');

    expect(
      screen.getByText(
        'You have 7.5 crates booked today. Those bookings stand. New bookings only fit in the space left.',
      ),
    ).toBeInTheDocument();
    await user.click(save());
    expect(await screen.findByText('Changes saved.')).toBeInTheDocument();
    expect(patches(fetchMock)).toEqual([{ capacity_total: 5 }]);
  });

  it('pauses bookings and takes them again', async () => {
    const { fetchMock, user } = await openSettings(
      storedFacility((body) => ({ is_accepting_bookings: body.is_accepting_bookings === true })),
    );

    await user.click(screen.getByRole('button', { name: 'Pause bookings' }));
    expect(await screen.findByText('Bookings paused')).toBeInTheDocument();
    expect(
      screen.getByText(
        "Farmers can't find or book this facility. Bookings you already have stand.",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Take bookings again' }));
    expect(await screen.findByText('Taking bookings')).toBeInTheDocument();
    expect(patches(fetchMock)).toEqual([
      { is_accepting_bookings: false },
      { is_accepting_bookings: true },
    ]);
  });

  it('says why pausing failed, and keeps the facility as it was', async () => {
    const { user } = await openSettings({ [updateRoute]: dropped });

    await user.click(screen.getByRole('button', { name: 'Pause bookings' }));

    expect(
      await screen.findByText('No network connection. Check your data or Wi-Fi, then try again.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Taking bookings')).toBeInTheDocument();
  });

  it('adds a photo up to the limit of four, then offers no more', async () => {
    const full = facility({
      photos: [
        photoOne,
        photoTwo,
        { ...photoOne, id: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d.jpg' },
        { ...photoOne, id: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e.jpg' },
      ],
    });
    const { fetchMock, user } = await openSettings({
      'GET /providers/mine': mine(facility({ photos: [photoOne, photoTwo, full.photos[2]!] })),
      [PHOTOS_ROUTE]: jsonResponse(201, full),
    });

    expect(screen.getByRole('heading', { name: 'Photos: 3 of 4' })).toBeInTheDocument();
    await user.upload(screen.getByLabelText(/^Add another photo/), [
      jpeg('four.jpg'),
      jpeg('five.jpg'),
    ]);

    expect(
      screen.getByText('You can add up to 4 photos. We kept the first ones you picked.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Photos: 4 of 4' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Add another photo/)).toBeNull();
    await vi.waitFor(() =>
      expect(requestsTo(fetchMock, 'POST', `/providers/${PROVIDER_ID}/photos`)).toHaveLength(1),
    );
  });

  it('removes a photo', async () => {
    const { fetchMock, user } = await openSettings({
      'GET /providers/mine': mine(facility({ photos: [photoOne] })),
      [`DELETE /providers/${PROVIDER_ID}/photos/${photoOne.id}`]: ok(facility()),
    });

    await user.click(screen.getByRole('button', { name: 'Remove photo 1' }));

    expect(await findHeading('Photos: 0 of 4')).toBeInTheDocument();
    expect(
      requestsTo(fetchMock, 'DELETE', `/providers/${PROVIDER_ID}/photos/${photoOne.id}`),
    ).toHaveLength(1);
  });

  it('is not found for a facility that is not the user’s', async () => {
    mockApi(settingsRoutes({ 'GET /providers/mine': ok({ data: [] }) }));
    renderApp(SETTINGS);

    expect(await findHeading('Facility not found')).toBeInTheDocument();
  });
});

describe('earnings', () => {
  const payouts = (
    data: ReturnType<typeof providerPayout>[],
    nextCursor: string | null = null,
    earnings = { owed_kobo: 4_048_350, paid_kobo: 500_000 },
  ) => ok(providerPayoutsResponseSchema.parse({ data, next_cursor: nextCursor, earnings }));

  const paid = providerPayout({
    id: '8f9a0b1c-2d3e-4f4a-9b5c-6d7e8f9a0b1c',
    amount_kobo: 500_000,
    status: 'paid',
    created_at: '2026-11-20T09:30:00.000Z',
    paid_at: '2026-11-25T10:00:00.000Z',
    reference: 'TRF-0042',
    booking: { ...providerPayout().booking, code: 'CL-PA4D2' },
  });

  it('shows what is owed and paid, and each payout', async () => {
    mockApi({ ...providerSignedIn, [payoutsRoute]: payouts([providerPayout(), paid]) });
    renderApp(EARNINGS);

    expect(await findHeading('Earnings')).toBeInTheDocument();
    expect(await screen.findByText('₦40,483.50')).toBeInTheDocument();
    expect(screen.getByText('₦30,483')).toBeInTheDocument();
    expect(screen.getAllByText('₦5,000')).toHaveLength(2);

    const [owedCard, paidCard] = screen.getAllByRole('listitem');
    expect(within(owedCard!).getByText('CL-7K3Q9')).toBeInTheDocument();
    expect(within(owedCard!).getByText('Owed')).toBeInTheDocument();
    expect(within(owedCard!).getByText('Tomatoes')).toBeInTheDocument();
    expect(within(owedCard!).getByText('Tue, 1 Dec 2026 to Thu, 31 Dec 2026')).toBeInTheDocument();
    expect(within(owedCard!).getByText('Owed since Tue, 1 Dec 2026')).toBeInTheDocument();
    expect(within(paidCard!).getByText('Paid')).toBeInTheDocument();
    expect(within(paidCard!).getByText(/Paid on Wed, 25 Nov 2026/)).toBeInTheDocument();
    expect(within(paidCard!).getByText('Reference TRF-0042')).toBeInTheDocument();
  });

  it('says there are no payouts yet', async () => {
    mockApi({
      ...providerSignedIn,
      [payoutsRoute]: payouts([], null, { owed_kobo: 0, paid_kobo: 0 }),
    });
    renderApp(EARNINGS);

    expect(await screen.findByText('No payouts yet', {}, SCREEN_TIMEOUT)).toBeInTheDocument();
    expect(
      screen.getByText(
        "A payout is owed to you once you check a booking's produce in. It will show here.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText('₦0')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
  });

  it('pages with Show more', async () => {
    const fetchMock = mockApi({
      ...providerSignedIn,
      [payoutsRoute]: ({ search }: MockRequest) =>
        search === '' ? payouts([providerPayout()], providerPayout().id) : payouts([paid]),
    });
    const user = renderApp(EARNINGS);

    await user.click(await screen.findByRole('button', { name: 'Show more' }, SCREEN_TIMEOUT));

    expect(await screen.findByText('CL-PA4D2')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show more' })).toBeNull();
    expect(
      requestsTo(
        fetchMock,
        'GET',
        `/providers/${PROVIDER_ID}/payouts?cursor=${providerPayout().id}`,
      ),
    ).toHaveLength(1);
  });

  it('offers Try again when the payouts cannot load', async () => {
    mockApi({
      ...providerSignedIn,
      [payoutsRoute]: [dropped, dropped, payouts([providerPayout()])],
    });
    const user = renderApp(EARNINGS);

    await user.click(await screen.findByRole('button', { name: 'Try again' }, { timeout: 8000 }));
    expect(await screen.findByText('CL-7K3Q9')).toBeInTheDocument();
  });

  it('is not found for a facility that is not the user’s', async () => {
    mockApi({ ...providerSignedIn, [payoutsRoute]: errorResponse(404, 'not_found') });
    renderApp(EARNINGS);

    expect(await findHeading('Facility not found')).toBeInTheDocument();
  });
});
