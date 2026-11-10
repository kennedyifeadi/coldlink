import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { searchBodySchema } from '@coldlink/shared';
import {
  bodyOf,
  errorResponse,
  jsonResponse,
  mockApi,
  requestsTo,
  sessionFixture,
} from '../../test/api';
import { renderApp, SCREEN_TIMEOUT } from '../../test/renderApp';
import { apata, cropsResponse, dugbe, searchResponse, tomatoes } from '../../test/searchFixtures';

// The map itself needs a real browser; this stands in for a tap on it.
vi.mock('./PinMap', () => ({
  default: ({ onPick }: { onPick: (lat: number, lng: number) => void }) => (
    <button type="button" onClick={() => onPick(7.4335123, 3.9124456)}>
      Tap the map
    </button>
  ),
}));

const signedOut = { 'POST /auth/refresh': errorResponse(401, 'unauthorized') };
const crops = { 'GET /crops': jsonResponse(200, cropsResponse) };

// 10:00 in Lagos. Only Date is faked: the screens' own timers and the test's waits stay real.
const NOW = new Date('2026-11-10T09:00:00Z');
const TODAY = '2026-11-10';

// Most tests walk the three search steps, which takes longer than Vitest's default 5 s when the
// whole workspace runs its tests in parallel.
const FLOW_TIMEOUT = { timeout: 20_000 };
// The first visit to a facility loads the booking screens' chunk, slower still under that load.
const PAGE_CHANGE_TIMEOUT = { timeout: 15_000 };

const currentPath = () => screen.getByTestId('location').textContent;
const findHeading = (name: string | RegExp) =>
  screen.findByRole('heading', { name }, SCREEN_TIMEOUT);

const pickArea = async (user: UserEvent, area: string) => {
  await user.click(await screen.findByRole('button', { name: 'Pick your area' }, SCREEN_TIMEOUT));
  await user.type(screen.getByLabelText('Search for your area'), area.split(',')[0]!);
  await user.click(screen.getByRole('button', { name: area }));
  await user.click(screen.getByRole('button', { name: /^Continue/ }));
};

const pickCrop = async (user: UserEvent, crop: string) => {
  await user.click(await screen.findByRole('button', { name: crop }, SCREEN_TIMEOUT));
  await user.click(screen.getByRole('button', { name: /^Continue/ }));
};

const enterAmount = async (user: UserEvent, quantity: string) => {
  const input = await screen.findByLabelText('Amount', undefined, SCREEN_TIMEOUT);
  await user.clear(input);
  await user.type(input, quantity);
  await user.click(screen.getByRole('button', { name: /^Find cold storage/ }));
};

const searchFromBodija = async (user: UserEvent) => {
  await pickArea(user, 'Bodija, Ibadan');
  await pickCrop(user, 'Tomatoes');
  await enterAmount(user, '10');
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

describe('home', FLOW_TIMEOUT, () => {
  it('opens search without signing in', async () => {
    mockApi(signedOut);
    const user = renderApp('/');

    await user.click(
      await screen.findByRole('button', { name: /^Find cold storage/ }, SCREEN_TIMEOUT),
    );

    expect(await findHeading('Where are you storing from?')).toBeInTheDocument();
    expect(currentPath()).toBe('/location');
  });

  it('links to My bookings, which asks a signed-out farmer to sign in', async () => {
    mockApi(signedOut);
    const user = renderApp('/');

    await user.click(await screen.findByRole('button', { name: /My bookings/ }, SCREEN_TIMEOUT));

    expect(await findHeading('Find cold storage near you.')).toBeInTheDocument();
    expect(currentPath()).toBe('/onboarding');
  });
});

describe('location step', FLOW_TIMEOUT, () => {
  it('keeps Continue off until a place is chosen', async () => {
    mockApi(signedOut);
    const user = renderApp('/location');

    await user.click(await screen.findByRole('button', { name: 'Pick your area' }, SCREEN_TIMEOUT));

    expect(screen.getByRole('button', { name: /^Continue/ })).toBeDisabled();
  });

  it('filters the area list and says when nothing matches', async () => {
    mockApi(signedOut);
    const user = renderApp('/location');
    await user.click(await screen.findByRole('button', { name: 'Pick your area' }, SCREEN_TIMEOUT));

    await user.type(screen.getByLabelText('Search for your area'), 'ogbo');
    expect(screen.getByRole('button', { name: 'Ogbomoso' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bodija, Ibadan' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Search for your area'), 'xyz');
    expect(screen.getByText(/No area called "ogboxyz" yet/)).toBeInTheDocument();
  });

  it('uses the device location, to about 100 m', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      geolocation: {
        getCurrentPosition: (success: PositionCallback) =>
          success({
            coords: { latitude: 7.43356789, longitude: 3.91234567 },
          } as GeolocationPosition),
      },
    });
    const fetchMock = mockApi({
      ...signedOut,
      ...crops,
      'POST /search': jsonResponse(200, searchResponse([dugbe])),
    });
    const user = renderApp('/location');

    await user.click(
      await screen.findByRole('button', { name: /Use my current location/ }, SCREEN_TIMEOUT),
    );
    expect(screen.getByText('Your current location')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Continue/ }));
    await pickCrop(user, 'Tomatoes');
    await enterAmount(user, '10');

    await findHeading('Dugbe Fridge Fleet (Sample)');
    const [search] = requestsTo(fetchMock, 'POST', '/search');
    expect(bodyOf(search!)).toMatchObject({ lat: 7.434, lng: 3.912 });
  });

  it('explains a refused location and leaves the other options open', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      geolocation: {
        getCurrentPosition: (_success: PositionCallback, failure: PositionErrorCallback) =>
          failure({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError),
      },
    });
    mockApi(signedOut);
    const user = renderApp('/location');

    await user.click(
      await screen.findByRole('button', { name: /Use my current location/ }, SCREEN_TIMEOUT),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Location is turned off for ColdLink. Pick your area or drop a pin instead.',
    );
    expect(screen.getByRole('button', { name: /^Continue/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pick your area' })).toBeEnabled();
  });

  it('searches from a pin dropped on the map', async () => {
    const fetchMock = mockApi({
      ...signedOut,
      ...crops,
      'POST /search': jsonResponse(200, searchResponse([dugbe])),
    });
    const user = renderApp('/location');

    await user.click(
      await screen.findByRole('button', { name: /Drop a pin on the map/ }, SCREEN_TIMEOUT),
    );
    await user.click(await screen.findByRole('button', { name: 'Tap the map' }));
    await user.click(screen.getByRole('button', { name: /^Continue/ }));
    await pickCrop(user, 'Tomatoes');
    await enterAmount(user, '10');

    expect(
      await screen.findByRole('button', { name: 'Change place: The spot on your map' }),
    ).toBeInTheDocument();
    const [search] = requestsTo(fetchMock, 'POST', '/search');
    expect(bodyOf(search!)).toMatchObject({ lat: 7.434, lng: 3.912 });
  });
});

describe('produce step', FLOW_TIMEOUT, () => {
  it('lists crops from the API and finds them by local name', async () => {
    mockApi({ ...signedOut, ...crops });
    const user = renderApp('/location');
    await pickArea(user, 'Bodija, Ibadan');

    expect(await screen.findByRole('button', { name: 'Tomatoes' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Search produce'), 'rodo');

    expect(screen.getByRole('button', { name: 'Peppers' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tomatoes' })).not.toBeInTheDocument();
  });

  it('offers a retry when the crops fail to load', async () => {
    mockApi({
      ...signedOut,
      'GET /crops': [errorResponse(500, 'internal'), jsonResponse(200, cropsResponse)],
    });
    const user = renderApp('/location');
    await pickArea(user, 'Bodija, Ibadan');

    expect(await screen.findByRole('alert', undefined, SCREEN_TIMEOUT)).toHaveTextContent(
      'Something went wrong on our side. Try again in a moment.',
    );
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('button', { name: 'Tomatoes' })).toBeInTheDocument();
  });

  it('sends a farmer who reloaded mid-search back to the location step', async () => {
    mockApi({ ...signedOut, ...crops });
    renderApp('/produce');

    expect(await findHeading('Where are you storing from?')).toBeInTheDocument();
  });
});

describe('amount step', FLOW_TIMEOUT, () => {
  const openAmountStep = async () => {
    const fetchMock = mockApi({ ...signedOut, ...crops });
    const user = renderApp('/location');
    await pickArea(user, 'Bodija, Ibadan');
    await pickCrop(user, 'Tomatoes');
    return { fetchMock, user };
  };

  it('starts today, in crates, for 7 days', async () => {
    await openAmountStep();

    expect(await screen.findByLabelText('Start date', undefined, SCREEN_TIMEOUT)).toHaveValue(
      TODAY,
    );
    expect(screen.getByRole('radio', { name: 'Crates' })).toBeChecked();
    expect(screen.getByText('7')).toBeInTheDocument();
  });

  it.each([
    ['ten', 'Enter the amount as a number, like 10.'],
    ['0', 'Enter an amount above 0.'],
    ['-3', 'Enter an amount above 0.'],
    ['2.5001', 'Use up to 3 numbers after the decimal point.'],
  ])('refuses %s without searching', async (typed, message) => {
    const { fetchMock, user } = await openAmountStep();

    await enterAmount(user, typed);

    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(screen.getByLabelText('Amount')).toHaveAttribute('aria-invalid', 'true');
    expect(requestsTo(fetchMock, 'POST', '/search')).toHaveLength(0);
  });

  it('refuses a start date before today', async () => {
    const { fetchMock, user } = await openAmountStep();
    const start = await screen.findByLabelText('Start date', undefined, SCREEN_TIMEOUT);

    await user.clear(start);
    await user.type(start, '2026-11-09');
    await enterAmount(user, '10');

    expect(screen.getByRole('alert')).toHaveTextContent('Pick today or a later date.');
    expect(requestsTo(fetchMock, 'POST', '/search')).toHaveLength(0);
  });
});

describe('results', FLOW_TIMEOUT, () => {
  it('sends a body that matches the search schema', async () => {
    const fetchMock = mockApi({
      ...signedOut,
      ...crops,
      'POST /search': jsonResponse(200, searchResponse([dugbe])),
    });
    const user = renderApp('/location');
    await pickArea(user, 'Bodija, Ibadan');
    await pickCrop(user, 'Tomatoes');
    await user.click(await screen.findByRole('radio', { name: 'Kilograms (kg)' }));
    await user.click(screen.getByRole('button', { name: 'Add a day' }));
    await enterAmount(user, '12.5');

    await findHeading('Dugbe Fridge Fleet (Sample)');
    const [search] = requestsTo(fetchMock, 'POST', '/search');
    const body = bodyOf(search!);
    expect(searchBodySchema.safeParse(body).success).toBe(true);
    expect(body).toEqual({
      lat: 7.4335,
      lng: 3.9124,
      crop_id: tomatoes.id,
      quantity: 12.5,
      capacity_unit: 'kg',
      days: 8,
      start_date: TODAY,
    });
    expect(new Headers(search![1]?.headers).has('Authorization')).toBe(false);
  });

  it('sends the access token when the farmer is signed in', async () => {
    const fetchMock = mockApi({
      'POST /auth/refresh': jsonResponse(200, sessionFixture({ accessToken: 'token-9' })),
      ...crops,
      'POST /search': jsonResponse(200, searchResponse([dugbe])),
    });
    const user = renderApp('/location');
    await searchFromBodija(user);

    await findHeading('Dugbe Fridge Fleet (Sample)');
    const [search] = requestsTo(fetchMock, 'POST', '/search');
    expect(new Headers(search![1]?.headers).get('Authorization')).toBe('Bearer token-9');
  });

  it('shows each result in the order the API ranked them', async () => {
    mockApi({
      ...signedOut,
      ...crops,
      'POST /search': jsonResponse(200, searchResponse([dugbe, apata])),
    });
    const user = renderApp('/location');
    await searchFromBodija(user);

    const cards = await screen.findAllByRole('article', undefined, SCREEN_TIMEOUT);
    expect(cards.map((card) => within(card).getByRole('heading').textContent)).toEqual([
      'Dugbe Fridge Fleet (Sample)',
      'Apata Cold Store (Sample)',
    ]);

    const first = within(cards[0]!);
    expect(first.getByText('Fridge fleet')).toBeInTheDocument();
    expect(first.getByText('5.8 km away')).toBeInTheDocument();
    expect(first.getByText('40 crates free')).toBeInTheDocument();
    expect(first.getByText('₦35,000')).toBeInTheDocument();
    expect(first.getByText('Estimate for 7 days')).toBeInTheDocument();
    expect(first.getByText('Rated 4.5 out of 5 from 12 ratings')).toBeInTheDocument();
    expect(first.getAllByRole('button')).toHaveLength(1);

    const second = within(cards[1]!);
    expect(second.getByText('Only 15 crates free')).toBeInTheDocument();
    expect(second.getByText('No ratings yet')).toBeInTheDocument();
    expect(screen.queryByText(/looked further/)).not.toBeInTheDocument();
  });

  it('says when the search had to look further away', async () => {
    mockApi({
      ...signedOut,
      ...crops,
      'POST /search': jsonResponse(200, searchResponse([dugbe], { expanded: true })),
    });
    const user = renderApp('/location');
    await pickArea(user, 'Ogbomoso');
    await pickCrop(user, 'Tomatoes');
    await enterAmount(user, '10');

    expect(await screen.findByRole('status', undefined, SCREEN_TIMEOUT)).toHaveTextContent(
      'No cold rooms had space close by, so we looked further. These are up to 100 km away.',
    );
    expect(await findHeading('Dugbe Fridge Fleet (Sample)')).toBeInTheDocument();
  });

  it('shows next steps when nothing is found', async () => {
    mockApi({
      ...signedOut,
      ...crops,
      'POST /search': jsonResponse(200, searchResponse([], { expanded: true })),
    });
    const user = renderApp('/location');
    await searchFromBodija(user);

    expect(
      await findHeading('No cold rooms with space for tomatoes were found nearby.'),
    ).toBeInTheDocument();
    expect(screen.getByText('We looked up to 100 km away.')).toBeInTheDocument();
    expect(screen.getByText('Try a smaller amount or fewer days.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try another location' }));

    expect(await findHeading('Where are you storing from?')).toBeInTheDocument();
  });

  it('offers a retry when the search fails, and keeps the summary in place', async () => {
    mockApi({
      ...signedOut,
      ...crops,
      'POST /search': [errorResponse(500, 'internal'), jsonResponse(200, searchResponse([dugbe]))],
    });
    const user = renderApp('/location');
    await searchFromBodija(user);

    expect(await screen.findByRole('alert', undefined, SCREEN_TIMEOUT)).toHaveTextContent(
      'Something went wrong on our side. Try again in a moment.',
    );
    expect(screen.getByRole('button', { name: 'Change produce: Tomatoes' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await findHeading('Dugbe Fridge Fleet (Sample)')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('retries once by itself after a dropped connection', async () => {
    const fetchMock = mockApi({
      ...signedOut,
      ...crops,
      'POST /search': [
        () => Promise.reject(new TypeError('Failed to fetch')),
        jsonResponse(200, searchResponse([dugbe])),
      ],
    });
    const user = renderApp('/location');
    await searchFromBodija(user);

    expect(await findHeading('Dugbe Fridge Fleet (Sample)')).toBeInTheDocument();
    expect(requestsTo(fetchMock, 'POST', '/search')).toHaveLength(2);
  });

  it('shows placeholders, not an empty page, while the search is out', async () => {
    let answer: (response: Response) => void = () => {};
    mockApi({
      ...signedOut,
      ...crops,
      'POST /search': () => new Promise<Response>((resolve) => (answer = resolve)),
    });
    const user = renderApp('/location');
    await searchFromBodija(user);

    expect(await screen.findByText('Finding cold rooms near you...')).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
    answer(jsonResponse(200, searchResponse([dugbe])));

    expect(await findHeading('Dugbe Fridge Fleet (Sample)')).toBeInTheDocument();
    expect(screen.queryByText('Finding cold rooms near you...')).not.toBeInTheDocument();
  });

  it('books a result by opening its facility with the searched terms', async () => {
    mockApi({
      'POST /auth/refresh': jsonResponse(200, sessionFixture()),
      ...crops,
      'POST /search': jsonResponse(200, searchResponse([dugbe, apata])),
    });
    const user = renderApp('/location');
    await searchFromBodija(user);
    const cards = await screen.findAllByRole('article', undefined, SCREEN_TIMEOUT);

    await user.click(within(cards[1]!).getByRole('button', { name: 'Book' }));

    await vi.waitFor(
      () => expect(currentPath()).toBe(`/details/${apata.provider.id}`),
      PAGE_CHANGE_TIMEOUT,
    );
  });

  it('keeps the chosen facility through sign-in', async () => {
    mockApi({
      ...signedOut,
      ...crops,
      'POST /search': jsonResponse(200, searchResponse([dugbe])),
      'POST /auth/otp/request': jsonResponse(200, {
        expires_in_seconds: 600,
        resend_after_seconds: 60,
      }),
      'POST /auth/otp/verify': jsonResponse(200, sessionFixture()),
    });
    const user = renderApp('/location');
    await searchFromBodija(user);

    await user.click(await screen.findByRole('button', { name: 'Book' }, SCREEN_TIMEOUT));
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

    await vi.waitFor(
      () => expect(currentPath()).toBe(`/details/${dugbe.provider.id}`),
      PAGE_CHANGE_TIMEOUT,
    );
  });
});
