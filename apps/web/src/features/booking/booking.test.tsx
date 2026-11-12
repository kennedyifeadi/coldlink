import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { bookingQuoteBodySchema } from '@coldlink/shared';
import {
  bodyOf,
  errorResponse,
  jsonResponse,
  mockApi,
  requestsTo,
  sessionFixture,
} from '../../test/api';
import {
  dugbeDetailsPath,
  dugbeProvider,
  dugbeQuote,
  dugbeReviewPath,
  tenCratesForAWeek,
} from '../../test/bookingFixtures';
import { renderApp, SCREEN_TIMEOUT } from '../../test/renderApp';
import { cropsResponse, dugbe, searchResponse } from '../../test/searchFixtures';
import { searchFromBodija } from '../../test/searchSteps';

const signedOut = { 'POST /auth/refresh': errorResponse(401, 'unauthorized') };
const signedIn = { 'POST /auth/refresh': jsonResponse(200, sessionFixture()) };
const crops = { 'GET /crops': jsonResponse(200, cropsResponse) };
const providerRoute = `GET /providers/${dugbe.provider.id}`;
const dugbeFound = { [providerRoute]: jsonResponse(200, dugbeProvider) };
// What POST /bookings/quote accepts: its schema is strict, so the crop must not go with it.
const dugbeQuoteBody = bookingQuoteBodySchema.parse({
  provider_id: dugbe.provider.id,
  quantity: tenCratesForAWeek.quantity,
  capacity_unit: tenCratesForAWeek.capacity_unit,
  days: tenCratesForAWeek.days,
  start_date: tenCratesForAWeek.start_date,
});
const quoted = (quote = dugbeQuote()) => ({ 'POST /bookings/quote': jsonResponse(200, quote) });

// 10:00 in Lagos on the day the fixtures start. Only Date is faked, so the screens' own timers and
// the test's waits stay real.
const NOW = new Date('2026-11-10T09:00:00Z');

// Walking the search steps first takes longer than Vitest's default 5 s under a full run.
const FLOW_TIMEOUT = { timeout: 20_000 };
const PAGE_CHANGE_TIMEOUT = { timeout: 15_000 };

const currentPath = () => screen.getByTestId('location').textContent;
const currentQuery = () => screen.getByTestId('location-search').textContent;
const findHeading = (name: string | RegExp) =>
  screen.findByRole('heading', { name }, SCREEN_TIMEOUT);
const waitForPath = (path: string) =>
  vi.waitFor(() => expect(currentPath()).toBe(path), PAGE_CHANGE_TIMEOUT);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

describe('facility details', FLOW_TIMEOUT, () => {
  it('opens without signing in and shows the facility with the quote', async () => {
    const fetchMock = mockApi({ ...signedOut, ...dugbeFound, ...quoted() });
    renderApp(dugbeDetailsPath);

    expect(await findHeading('Dugbe Fridge Fleet (Sample)')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 3: Details')).toBeInTheDocument();
    expect(screen.getByText('Fridge fleet')).toBeInTheDocument();
    expect(screen.getByText('Rated 4.5 out of 5 from 12 ratings')).toBeInTheDocument();
    expect(screen.getByText('14 Dugbe Market Road, Ibadan')).toBeInTheDocument();
    expect(screen.getByText('Near Opposite Cocoa House')).toBeInTheDocument();
    expect(screen.getByText('₦500 per crate per day')).toBeInTheDocument();
    // The quote's free space for these dates, not the search result's.
    expect(screen.getByText('30 crates')).toBeInTheDocument();
    expect(screen.getByText('2°C to 8°C')).toBeInTheDocument();
    expect(screen.getByText('Solar')).toBeInTheDocument();
    expect(screen.getByText('Vegetables')).toBeInTheDocument();
    expect(screen.getByText('Fruits')).toBeInTheDocument();
    expect(bodyOf(requestsTo(fetchMock, 'POST', '/bookings/quote')[0]!)).toEqual(dugbeQuoteBody);
  });

  it('loads photos lazily in boxes sized before they arrive', async () => {
    mockApi({ ...signedOut, ...dugbeFound, ...quoted() });
    renderApp(dugbeDetailsPath);

    const photos = await screen.findAllByRole('img', { name: /Photo \d of Dugbe/ }, SCREEN_TIMEOUT);

    expect(photos).toHaveLength(2);
    for (const photo of photos) {
      expect(photo).toHaveAttribute('loading', 'lazy');
      expect(photo).toHaveAttribute('width');
      expect(photo).toHaveAttribute('height');
    }
    expect(photos[0]).toHaveAttribute('src', dugbeProvider.photos[0]!.url);
  });

  it('says when a facility has no ratings, and leaves out what it has not given', async () => {
    mockApi({
      ...signedOut,
      [providerRoute]: jsonResponse(200, {
        ...dugbeProvider,
        avg_rating: 0,
        rating_count: 0,
        landmark: null,
        temp_min_c: null,
        temp_max_c: null,
        has_backup_power: 'unknown',
        photos: [],
      }),
      ...quoted(),
    });
    renderApp(dugbeDetailsPath);

    expect(await findHeading('Dugbe Fridge Fleet (Sample)')).toBeInTheDocument();
    expect(screen.getByText('No ratings yet')).toBeInTheDocument();
    expect(screen.queryByText(/^Near /)).not.toBeInTheDocument();
    expect(screen.queryByText('Temperature')).not.toBeInTheDocument();
    expect(screen.queryByText('Backup power')).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /^Photo/ })).not.toBeInTheDocument();
  });

  it('shows a skeleton while loading', async () => {
    let answer!: (response: Response) => void;
    mockApi({
      ...signedOut,
      ...dugbeFound,
      'POST /bookings/quote': () => new Promise<Response>((resolve) => (answer = resolve)),
    });
    renderApp(dugbeDetailsPath);

    expect(
      await screen.findByText('Checking available space...', undefined, SCREEN_TIMEOUT),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Dugbe/ })).not.toBeInTheDocument();
    answer(jsonResponse(200, dugbeQuote()));

    expect(await findHeading('Dugbe Fridge Fleet (Sample)')).toBeInTheDocument();
    expect(screen.queryByText('Checking available space...')).not.toBeInTheDocument();
  });

  it('shows the distance from search while its results are cached', async () => {
    mockApi({
      ...signedOut,
      ...crops,
      'POST /search': jsonResponse(200, searchResponse([dugbe])),
      ...dugbeFound,
      ...quoted(),
    });
    const user = renderApp('/location');
    await searchFromBodija(user);

    await user.click(await screen.findByRole('button', { name: 'Book' }, SCREEN_TIMEOUT));

    expect(await findHeading('Dugbe Fridge Fleet (Sample)')).toBeInTheDocument();
    expect(screen.getByText('5.8 km from where you searched')).toBeInTheDocument();
  });

  it('leaves the distance out after a reload, since the search point is not in the URL', async () => {
    mockApi({ ...signedOut, ...dugbeFound, ...quoted() });
    renderApp(dugbeDetailsPath);

    expect(await findHeading('Dugbe Fridge Fleet (Sample)')).toBeInTheDocument();
    expect(screen.queryByText(/km from where you searched/)).not.toBeInTheDocument();
  });

  it('continues to the review with the same terms', async () => {
    mockApi({ ...signedOut, ...dugbeFound, ...quoted(), ...crops });
    const user = renderApp(dugbeDetailsPath);

    await user.click(await screen.findByRole('button', { name: /^Continue/ }, SCREEN_TIMEOUT));

    await waitForPath(`/review/${dugbe.provider.id}`);
    expect(`/review/${dugbe.provider.id}${currentQuery()}`).toBe(dugbeReviewPath);
  });
});

describe('booking screen states', FLOW_TIMEOUT, () => {
  it.each([
    ['details', '/details'],
    ['review', '/review'],
  ])('sends an edited %s link back to search with a message', async (_name, step) => {
    mockApi({ ...signedOut });
    renderApp(`${step}/${dugbe.provider.id}?crop=${tenCratesForAWeek.crop_id}&quantity=lots`);

    expect(
      await screen.findByText(
        'That booking link was incomplete. Search again to choose a cold room.',
        undefined,
        SCREEN_TIMEOUT,
      ),
    ).toBeInTheDocument();
    expect(currentPath()).toBe('/location');
  });

  it('sends a link with a made-up facility id back to search', async () => {
    mockApi({ ...signedOut });
    renderApp(dugbeDetailsPath.replace(dugbe.provider.id, 'dugbe'));

    await waitForPath('/location');
  });

  it('says when the cold room is no longer available', async () => {
    mockApi({
      ...signedOut,
      [providerRoute]: errorResponse(404, 'not_found'),
      'POST /bookings/quote': errorResponse(404, 'not_found'),
    });
    const user = renderApp(dugbeDetailsPath);

    expect(await findHeading('This cold room is no longer available')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Find another cold room' }));

    await waitForPath('/location');
  });

  it('offers to change the amount when there is not enough space', async () => {
    mockApi({
      ...signedOut,
      ...dugbeFound,
      'POST /bookings/quote': errorResponse(409, 'conflict', {
        details: { provider_id: dugbe.provider.id, available_quantity: 4 },
      }),
    });
    const user = renderApp(dugbeDetailsPath);

    expect(await findHeading('Only 4 crates free on these dates')).toBeInTheDocument();
    expect(
      screen.getByText('You asked for 10 crates. Choose a smaller amount or other dates.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Continue/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Change amount or dates' }));

    await waitForPath('/location');
  });

  it('says when no space at all is free', async () => {
    mockApi({
      ...signedOut,
      ...dugbeFound,
      'POST /bookings/quote': errorResponse(409, 'conflict', {
        details: { provider_id: dugbe.provider.id, available_quantity: 0 },
      }),
    });
    renderApp(dugbeDetailsPath);

    expect(await findHeading('No space free on these dates')).toBeInTheDocument();
  });

  it("shows the API's message for terms the facility refuses", async () => {
    mockApi({
      ...signedOut,
      ...dugbeFound,
      'POST /bookings/quote': errorResponse(400, 'validation_failed', {
        details: [
          { location: 'body', path: 'days', message: 'This facility stores for at least 14 days' },
        ],
      }),
    });
    renderApp(dugbeDetailsPath);

    expect(await findHeading("This cold room can't take this booking")).toBeInTheDocument();
    expect(screen.getByText('This facility stores for at least 14 days')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change amount or dates' })).toBeInTheDocument();
  });

  it('shows a plain error, not the API message, for a 400 the farmer cannot fix', async () => {
    mockApi({
      ...signedOut,
      ...dugbeFound,
      'POST /bookings/quote': errorResponse(400, 'validation_failed', {
        details: [{ location: 'body', path: '', message: 'Unrecognized key: "crop_id"' }],
      }),
    });
    renderApp(dugbeDetailsPath);

    expect(await findHeading("Couldn't load this cold room")).toBeInTheDocument();
    expect(
      screen.getByText('Something went wrong on our side. Try again in a moment.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Unrecognized key/)).not.toBeInTheDocument();
  });

  it('offers Try again when the network drops', async () => {
    const offline = () => Promise.reject(new TypeError('Failed to fetch'));
    mockApi({
      ...signedOut,
      // Each query retries a dropped connection once by itself (decision 79).
      [providerRoute]: [offline, offline, jsonResponse(200, dugbeProvider)],
      'POST /bookings/quote': jsonResponse(200, dugbeQuote()),
    });
    const user = renderApp(dugbeDetailsPath);

    expect(await findHeading("Couldn't load this cold room")).toBeInTheDocument();
    expect(
      screen.getByText('No network connection. Check your data or Wi-Fi, then try again.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await findHeading('Dugbe Fridge Fleet (Sample)')).toBeInTheDocument();
  });
});

describe('review', FLOW_TIMEOUT, () => {
  it('shows the booking and the price, without signing in', async () => {
    mockApi({ ...signedOut, ...dugbeFound, ...quoted(), ...crops });
    renderApp(dugbeReviewPath);

    expect(await findHeading('Dugbe Fridge Fleet (Sample)')).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 3: Review')).toBeInTheDocument();
    expect(screen.getByText('Tomatoes')).toBeInTheDocument();
    expect(screen.getByText('10 crates')).toBeInTheDocument();
    expect(screen.getByText('Tue, 10 Nov 2026')).toBeInTheDocument();
    expect(screen.getByText('Tue, 17 Nov 2026')).toBeInTheDocument();
    expect(screen.getByText('7 days')).toBeInTheDocument();
    expect(screen.getByText('₦35,000')).toBeInTheDocument();
    expect(screen.getByText('₦10,500')).toBeInTheDocument();
    expect(screen.getByText('You pay now: ₦10,500')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Pay ₦10,500/ })).toBeInTheDocument();
  });

  it('shows every amount exactly as the quote gives it', async () => {
    // Figures no rule would produce from each other, so any sum or rounding on screen shows up.
    mockApi({
      ...signedOut,
      ...dugbeFound,
      ...crops,
      ...quoted(
        dugbeQuote({
          quantity: 9,
          duration_days: 11,
          start_date: '2026-11-12',
          end_date: '2026-11-23',
          storage_subtotal_kobo: 3_512_345,
          deposit_kobo: 1_053_701,
          balance_due_kobo: 2_458_607,
          service_fee_kobo: 10_099,
          delivery_fee_kobo: 2_503,
          total_charged_online_kobo: 1_111_111,
        }),
      ),
    });
    renderApp(dugbeReviewPath);

    expect(await findHeading('Dugbe Fridge Fleet (Sample)')).toBeInTheDocument();
    const rows = (label: string) => screen.getByText(label).parentElement!;
    expect(within(rows('Storage for 11 days')).getByText('₦35,123.45')).toBeInTheDocument();
    expect(within(rows('Deposit, paid now')).getByText('₦10,537.01')).toBeInTheDocument();
    expect(within(rows('Service fee, paid now')).getByText('₦100.99')).toBeInTheDocument();
    expect(within(rows('Delivery, paid now')).getByText('₦25.03')).toBeInTheDocument();
    expect(
      within(rows('Balance, paid at the facility')).getByText('₦24,586.07'),
    ).toBeInTheDocument();
    expect(screen.getByText('You pay now: ₦11,111.11')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Pay ₦11,111.11/ })).toBeInTheDocument();
    // The terms shown are the quote's too, not the URL's.
    expect(screen.getByText('9 crates')).toBeInTheDocument();
    expect(screen.getByText('Thu, 12 Nov 2026')).toBeInTheDocument();
    expect(screen.getByText('Mon, 23 Nov 2026')).toBeInTheDocument();
  });

  it('leaves out delivery while it is free', async () => {
    mockApi({ ...signedOut, ...dugbeFound, ...quoted(), ...crops });
    renderApp(dugbeReviewPath);

    expect(await findHeading('Dugbe Fridge Fleet (Sample)')).toBeInTheDocument();
    expect(screen.queryByText('Delivery, paid now')).not.toBeInTheDocument();
  });

  it('shows the latest quote, not the figures search showed', async () => {
    mockApi({
      ...signedOut,
      ...crops,
      'POST /search': jsonResponse(200, searchResponse([dugbe])),
      ...dugbeFound,
      // The price went up between search (₦35,000) and review.
      ...quoted(
        dugbeQuote({
          unit_price_kobo: 60_000,
          storage_subtotal_kobo: 4_200_000,
          deposit_kobo: 1_260_000,
          balance_due_kobo: 2_940_000,
          total_charged_online_kobo: 1_260_000,
        }),
      ),
    });
    const user = renderApp('/location');
    await searchFromBodija(user);
    await user.click(await screen.findByRole('button', { name: 'Book' }, SCREEN_TIMEOUT));
    await user.click(await screen.findByRole('button', { name: /^Continue/ }, SCREEN_TIMEOUT));

    expect(await screen.findByText('₦42,000', undefined, SCREEN_TIMEOUT)).toBeInTheDocument();
    expect(screen.getByText('You pay now: ₦12,600')).toBeInTheDocument();
    expect(screen.queryByText('₦35,000')).not.toBeInTheDocument();
  });

  it('refuses a booking for space that is gone, with no price or Pay button', async () => {
    mockApi({
      ...signedOut,
      ...dugbeFound,
      ...crops,
      'POST /bookings/quote': errorResponse(409, 'conflict', {
        details: { provider_id: dugbe.provider.id, available_quantity: 6 },
      }),
    });
    renderApp(dugbeReviewPath);

    expect(await findHeading('Only 6 crates free on these dates')).toBeInTheDocument();
    expect(screen.queryByText(/^You pay now/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Pay/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change amount or dates' })).toBeInTheDocument();
  });

  it('sends a link for an unknown crop back to search', async () => {
    mockApi({
      ...signedOut,
      ...dugbeFound,
      ...quoted(),
      'GET /crops': jsonResponse(200, { data: [] }),
    });
    renderApp(dugbeReviewPath);

    await waitForPath('/location');
  });

  it('goes back to the amount step to change the booking while the search is in memory', async () => {
    mockApi({
      ...signedOut,
      ...crops,
      'POST /search': jsonResponse(200, searchResponse([dugbe])),
      ...dugbeFound,
      ...quoted(),
    });
    const user = renderApp('/location');
    await searchFromBodija(user);
    await user.click(await screen.findByRole('button', { name: 'Book' }, SCREEN_TIMEOUT));
    await user.click(await screen.findByRole('button', { name: /^Continue/ }, SCREEN_TIMEOUT));

    await user.click(
      await screen.findByRole('button', { name: 'Change amount or dates' }, SCREEN_TIMEOUT),
    );

    await waitForPath('/amount');
    expect(screen.getByLabelText('Amount')).toHaveValue('10');
  });

  it('goes to the start of search to change the booking after a reload', async () => {
    mockApi({ ...signedOut, ...dugbeFound, ...quoted(), ...crops });
    const user = renderApp(dugbeReviewPath);

    await user.click(
      await screen.findByRole('button', { name: 'Change amount or dates' }, SCREEN_TIMEOUT),
    );

    await waitForPath('/location');
  });
});

describe('paying', FLOW_TIMEOUT, () => {
  it('goes on to payment with the same terms when signed in', async () => {
    mockApi({ ...signedIn, ...dugbeFound, ...quoted(), ...crops });
    const user = renderApp(dugbeReviewPath);

    await user.click(await screen.findByRole('button', { name: /^Pay ₦10,500/ }, SCREEN_TIMEOUT));

    await waitForPath(`/payment/${dugbe.provider.id}`);
    expect(currentQuery()).toBe(new URL(dugbeReviewPath, 'http://localhost').search);
  });

  it('asks a signed-out farmer to sign in, then brings them back to the same review', async () => {
    const fetchMock = mockApi({
      ...signedOut,
      ...dugbeFound,
      ...quoted(),
      ...crops,
      'POST /auth/otp/request': jsonResponse(200, {
        expires_in_seconds: 600,
        resend_after_seconds: 60,
      }),
      'POST /auth/otp/verify': jsonResponse(200, sessionFixture()),
    });
    const user = renderApp(dugbeReviewPath);

    await user.click(await screen.findByRole('button', { name: /^Pay ₦10,500/ }, SCREEN_TIMEOUT));
    await user.type(
      await screen.findByLabelText('Phone number', undefined, SCREEN_TIMEOUT),
      '08031234567',
    );
    await user.click(screen.getByRole('button', { name: /^Continue/ }));
    await user.type(
      await screen.findByLabelText('6-digit code', undefined, SCREEN_TIMEOUT),
      '482913',
    );
    await user.click(screen.getByRole('button', { name: /^Continue/ }));

    await waitForPath(`/review/${dugbe.provider.id}`);
    expect(`/review/${dugbe.provider.id}${currentQuery()}`).toBe(dugbeReviewPath);
    expect(
      await screen.findByText('You pay now: ₦10,500', undefined, SCREEN_TIMEOUT),
    ).toBeVisible();
    for (const call of requestsTo(fetchMock, 'POST', '/bookings/quote')) {
      expect(bodyOf(call)).toEqual(dugbeQuoteBody);
    }
  });

  it('brings a farmer who just made an account back to the review after their ColdLink ID', async () => {
    mockApi({
      ...signedOut,
      ...dugbeFound,
      ...quoted(),
      ...crops,
      'POST /auth/otp/request': jsonResponse(200, {
        expires_in_seconds: 600,
        resend_after_seconds: 60,
      }),
      'POST /auth/otp/verify': [
        errorResponse(400, 'consent_required'),
        jsonResponse(200, sessionFixture({ isNewUser: true, coldlinkId: '4820193' })),
      ],
    });
    const user = renderApp(dugbeReviewPath);

    await user.click(await screen.findByRole('button', { name: /^Pay ₦10,500/ }, SCREEN_TIMEOUT));
    await user.type(
      await screen.findByLabelText('Phone number', undefined, SCREEN_TIMEOUT),
      '08031234567',
    );
    await user.click(screen.getByRole('button', { name: /^Continue/ }));
    await user.type(
      await screen.findByLabelText('6-digit code', undefined, SCREEN_TIMEOUT),
      '482913',
    );
    await user.click(screen.getByRole('button', { name: /^Continue/ }));
    await user.click(
      await screen.findByRole(
        'checkbox',
        { name: 'I agree to the ColdLink privacy notice.' },
        SCREEN_TIMEOUT,
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Create my ColdLink ID' }));
    expect(await screen.findByText('482 0193', undefined, SCREEN_TIMEOUT)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Continue/ }));

    await waitForPath(`/review/${dugbe.provider.id}`);
    expect(`/review/${dugbe.provider.id}${currentQuery()}`).toBe(dugbeReviewPath);
    expect(
      await screen.findByText('You pay now: ₦10,500', undefined, SCREEN_TIMEOUT),
    ).toBeVisible();
  });
});
