import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { createProviderBodySchema } from '@coldlink/shared';
import {
  bodyOf,
  errorResponse,
  jsonResponse,
  mockApi,
  requestsTo,
  sessionFixture,
} from '../../test/api';
import {
  cropCategoriesResponse,
  onboardingBody,
  ownProviderFor,
  photoOne,
  PROVIDER_ID,
} from '../../test/providerFixtures';
import { renderApp, SCREEN_TIMEOUT } from '../../test/renderApp';

// The map itself needs a real browser; this stands in for a tap on it.
vi.mock('../search/PinMap', () => ({
  default: ({ onPick }: { onPick: (lat: number, lng: number) => void }) => (
    <button type="button" onClick={() => onPick(7.4335123, 3.9124456)}>
      Tap the map
    </button>
  ),
}));

const ENTRY = '/provider/onboarding';
const PHOTOS_ROUTE = `POST /providers/${PROVIDER_ID}/photos`;

const farmerSession = sessionFixture();
const providerSession = sessionFixture({ roles: ['farmer', 'provider'], accessToken: 'token-2' });

// A farmer's first listing: GET /providers/mine needs the provider role, so it is a 403.
const newFarmer = {
  'POST /auth/refresh': [jsonResponse(200, farmerSession), jsonResponse(200, providerSession)],
  'GET /providers/mine': errorResponse(403, 'forbidden'),
  'GET /crop-categories': jsonResponse(200, cropCategoriesResponse),
};
const created = (overrides = {}) => ({
  'POST /providers': jsonResponse(201, ownProviderFor(onboardingBody, overrides)),
});

// Walking five steps takes longer than Vitest's default 5 s when the workspace runs in parallel.
const FLOW_TIMEOUT = { timeout: 30_000 };
const PAGE_CHANGE_TIMEOUT = { timeout: 15_000 };

const currentPath = () => screen.getByTestId('location').textContent;
const findHeading = (name: string | RegExp) =>
  screen.findByRole('heading', { name }, SCREEN_TIMEOUT);
const waitForPath = (path: string) =>
  vi.waitFor(() => expect(currentPath()).toBe(path), PAGE_CHANGE_TIMEOUT);
const clickContinue = (user: UserEvent) =>
  user.click(screen.getByRole('button', { name: /^Continue/ }));

const fillContact = async (user: UserEvent) => {
  await user.type(
    await screen.findByLabelText('Name farmers will see', undefined, SCREEN_TIMEOUT),
    'Onboarding Test Cold Room',
  );
  await user.click(screen.getByRole('radio', { name: 'Cold room' }));
  await clickContinue(user);
};

const fillLocation = async (user: UserEvent) => {
  await user.click(await screen.findByRole('button', { name: 'Tap the map' }, SCREEN_TIMEOUT));
  await user.type(screen.getByLabelText('Address'), '3 Bodija Market Road, Ibadan');
  await user.type(screen.getByLabelText(/^Nearby landmark/), 'Beside the market gate');
  await user.selectOptions(screen.getByLabelText(/^Local government area/), 'Ibadan North');
  await clickContinue(user);
};

const fillCapacity = async (user: UserEvent) => {
  await user.click(await screen.findByRole('radio', { name: 'Crates' }, SCREEN_TIMEOUT));
  await user.type(screen.getByLabelText('Total space'), '40');
  await user.type(screen.getByLabelText('Price per crate per day'), '525.50');
  await user.click(screen.getByRole('button', { name: 'One day more' }));
  await user.type(screen.getByLabelText('Lowest'), '2');
  await user.type(screen.getByLabelText('Highest'), '8');
  await user.click(screen.getByRole('radio', { name: 'Generator' }));
  await clickContinue(user);
};

const pickProduce = async (user: UserEvent) => {
  await user.click(await screen.findByRole('button', { name: 'Vegetables' }, SCREEN_TIMEOUT));
  await user.click(screen.getByRole('button', { name: 'Fruits' }));
};

const submitListing = (user: UserEvent) =>
  user.click(screen.getByRole('button', { name: 'Submit listing' }));

/** From the entry, through every form step to the end of step 4, without submitting. */
const fillFormSteps = async (user: UserEvent) => {
  await fillContact(user);
  await fillLocation(user);
  await fillCapacity(user);
  await pickProduce(user);
};

const jpeg = (name = 'front.jpg') => new File(['jpeg bytes'], name, { type: 'image/jpeg' });
const photoInput = () => screen.getByLabelText(/^Choose photos|^Add another photo/);

const hold = () => {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { held, release };
};

beforeEach(() => {
  let next = 0;
  // jsdom has no object URLs; the previews only need a string.
  URL.createObjectURL = () => `blob:preview-${next++}`;
  URL.revokeObjectURL = () => {};
});

describe('entry', FLOW_TIMEOUT, () => {
  it('is offered on Home and asks a signed-out user to sign in', async () => {
    mockApi({ 'POST /auth/refresh': errorResponse(401, 'unauthorized') });
    const user = renderApp('/');

    await user.click(
      await screen.findByRole('button', { name: /List your cold room/ }, SCREEN_TIMEOUT),
    );

    expect(await findHeading('Find cold storage near you.')).toBeInTheDocument();
    expect(currentPath()).toBe('/onboarding');
  });

  it('opens the first step for a user with no facility', async () => {
    mockApi(newFarmer);
    renderApp(ENTRY);

    expect(await findHeading('Tell farmers who you are')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 5: Contact')).toBeInTheDocument();
    expect(currentPath()).toBe('/provider/onboarding/contact');
  });

  it('shows an existing provider their facilities instead of a blank wizard', async () => {
    const approved = ownProviderFor(onboardingBody, { verification_status: 'approved' });
    mockApi({
      'POST /auth/refresh': jsonResponse(200, providerSession),
      'GET /providers/mine': jsonResponse(200, { data: [approved] }),
    });
    const user = renderApp(ENTRY);

    expect(await findHeading('Your facilities')).toBeInTheDocument();
    const card = await screen.findByRole('listitem', undefined, SCREEN_TIMEOUT);
    expect(within(card).getByText('Onboarding Test Cold Room')).toBeInTheDocument();
    expect(within(card).getByText('Live')).toBeInTheDocument();
    expect(
      within(card).getByText('3 Bodija Market Road, Ibadan, Ibadan North'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^List another cold room/ }));
    expect(await findHeading('Tell farmers who you are')).toBeInTheDocument();
  });

  it('offers Try again when the facilities cannot be loaded', async () => {
    const approved = ownProviderFor(onboardingBody, { verification_status: 'approved' });
    mockApi({
      'POST /auth/refresh': jsonResponse(200, providerSession),
      'GET /providers/mine': [
        errorResponse(500, 'internal'),
        jsonResponse(200, { data: [approved] }),
      ],
    });
    const user = renderApp(ENTRY);

    await user.click(await screen.findByRole('button', { name: 'Try again' }, SCREEN_TIMEOUT));

    expect(
      await screen.findByText('Onboarding Test Cold Room', undefined, SCREEN_TIMEOUT),
    ).toBeInTheDocument();
  });
});

describe('step validation', FLOW_TIMEOUT, () => {
  it('asks for a name and a kind of storage on step 1', async () => {
    mockApi(newFarmer);
    const user = renderApp(ENTRY);

    await findHeading('Tell farmers who you are');
    await clickContinue(user);

    expect(screen.getByLabelText('Name farmers will see')).toHaveAccessibleDescription(
      expect.stringContaining('Enter the name farmers will see.'),
    );
    expect(screen.getByText('Choose the kind of storage.')).toBeInTheDocument();
    expect(currentPath()).toBe('/provider/onboarding/contact');
  });

  it('sends booking texts to the own number unless another is given, and checks that one', async () => {
    mockApi(newFarmer);
    const user = renderApp(ENTRY);

    expect(
      await screen.findByRole('radio', { name: 'My number, +234803***4567' }, SCREEN_TIMEOUT),
    ).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Another number' }));
    await user.type(screen.getByLabelText('Phone number for booking texts'), '0123');
    await user.type(screen.getByLabelText(/^WhatsApp number/), '12');
    await clickContinue(user);

    expect(screen.getByLabelText('Phone number for booking texts')).toHaveAccessibleDescription(
      'Enter a Nigerian mobile number, like 0803 123 4567.',
    );
    expect(screen.getByLabelText(/^WhatsApp number/)).toHaveAccessibleDescription(
      expect.stringContaining('or leave it empty'),
    );
  });

  it('asks for the pin and the address on step 2', async () => {
    mockApi(newFarmer);
    const user = renderApp(ENTRY);
    await fillContact(user);

    await findHeading('Where is your storage?');
    await clickContinue(user);

    expect(
      screen.getByText('Tap the map to put the pin where your storage is.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Address')).toHaveAccessibleDescription('Enter the address.');
    expect(currentPath()).toBe('/provider/onboarding/location');
  });

  it('checks space, unit, price and temperatures on step 3', async () => {
    mockApi(newFarmer);
    const user = renderApp(ENTRY);
    await fillContact(user);
    await fillLocation(user);

    await findHeading('How much space, and at what price?');
    await clickContinue(user);
    expect(screen.getByLabelText('Total space')).toHaveAccessibleDescription(
      expect.stringContaining('Enter how much space you have, as a number.'),
    );
    expect(screen.getByText('Choose how you measure your space.')).toBeInTheDocument();
    expect(screen.getByLabelText('Price per unit per day')).toHaveAccessibleDescription(
      expect.stringContaining('Enter the price in naira, as a number.'),
    );

    await user.type(screen.getByLabelText('Total space'), '0');
    await user.type(screen.getByLabelText('Price per unit per day'), '525.555');
    await user.type(screen.getByLabelText('Lowest'), '8');
    await user.type(screen.getByLabelText('Highest'), '2');
    await clickContinue(user);

    expect(screen.getByText('Enter a space above 0.')).toBeInTheDocument();
    expect(
      screen.getByText('Use at most 2 numbers after the decimal point (kobo).'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Highest')).toHaveAccessibleDescription(
      "The highest temperature can't be below the lowest.",
    );
    expect(currentPath()).toBe('/provider/onboarding/capacity');
  });

  it('asks for at least one kind of produce on step 4 and sends nothing', async () => {
    const fetchMock = mockApi({ ...newFarmer, ...created() });
    const user = renderApp(ENTRY);
    await fillContact(user);
    await fillLocation(user);
    await fillCapacity(user);

    await screen.findByRole('button', { name: 'Vegetables' }, SCREEN_TIMEOUT);
    await submitListing(user);

    expect(
      screen.getByText('Pick at least one kind of produce you can store.'),
    ).toBeInTheDocument();
    expect(requestsTo(fetchMock, 'POST', '/providers')).toHaveLength(0);
  });

  it('does not open a later step before the earlier ones are done', async () => {
    mockApi(newFarmer);
    renderApp('/provider/onboarding/capacity');

    expect(await findHeading('Tell farmers who you are')).toBeInTheDocument();
    expect(currentPath()).toBe('/provider/onboarding/contact');
  });
});

describe('moving between steps', FLOW_TIMEOUT, () => {
  it('keeps every entry going back and forward', async () => {
    mockApi(newFarmer);
    const user = renderApp(ENTRY);
    await fillContact(user);
    await fillLocation(user);
    await user.type(await screen.findByLabelText('Total space', undefined, SCREEN_TIMEOUT), '40');

    const back = () => user.click(screen.getByRole('button', { name: 'Go back' }));
    await back();
    expect(await screen.findByLabelText('Address', undefined, SCREEN_TIMEOUT)).toHaveValue(
      '3 Bodija Market Road, Ibadan',
    );
    expect(screen.getByLabelText(/^Local government area/)).toHaveValue('Ibadan North');
    expect(screen.getByText('Pin set. Tap the map again to move it.')).toBeInTheDocument();

    await back();
    expect(
      await screen.findByLabelText('Name farmers will see', undefined, SCREEN_TIMEOUT),
    ).toHaveValue('Onboarding Test Cold Room');
    expect(screen.getByRole('radio', { name: 'Cold room' })).toBeChecked();

    await clickContinue(user);
    await findHeading('Where is your storage?');
    await clickContinue(user);
    expect(await screen.findByLabelText('Total space', undefined, SCREEN_TIMEOUT)).toHaveValue(
      '40',
    );
  });
});

describe('submitting', FLOW_TIMEOUT, () => {
  it('sends a body the API accepts, then shows the facility pending approval', async () => {
    const fetchMock = mockApi({ ...newFarmer, ...created() });
    const user = renderApp(ENTRY);
    await fillFormSteps(user);
    await submitListing(user);

    expect(await findHeading('Add photos')).toBeInTheDocument();
    expect(screen.getByText('Step 5 of 5: Photos')).toBeInTheDocument();
    const [request] = requestsTo(fetchMock, 'POST', '/providers');
    const body = bodyOf(request!);
    // Strict, as the API's is: a body with a stray or missing field fails here too.
    expect(createProviderBodySchema.safeParse(body).success).toBe(true);
    // The pin goes exactly as placed, the price in kobo, and no phone, so SMS go to the owner.
    expect(body).toEqual(onboardingBody);
    expect(new Headers(request![1]?.headers).get('Authorization')).toBe('Bearer access-token-1');

    await user.click(screen.getByRole('button', { name: 'Finish without photos' }));

    expect(await findHeading('Pending approval')).toBeInTheDocument();
    expect(
      screen.getByText(/Farmers can't see or book your storage until it's approved/),
    ).toBeInTheDocument();
    expect(screen.getByText('40 crates at ₦525.50 per crate per day')).toBeInTheDocument();
  });

  it('shows the facility live when approval is not required', async () => {
    mockApi({ ...newFarmer, ...created({ verification_status: 'approved' }) });
    const user = renderApp(ENTRY);
    await fillFormSteps(user);
    await submitListing(user);

    await user.click(
      await screen.findByRole('button', { name: 'Finish without photos' }, SCREEN_TIMEOUT),
    );

    expect(await findHeading('Your storage is live')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('refreshes the session so the new provider role shows, then lists the facility', async () => {
    const pending = ownProviderFor(onboardingBody);
    const fetchMock = mockApi({
      ...newFarmer,
      ...created(),
      'GET /providers/mine': [
        errorResponse(403, 'forbidden'),
        jsonResponse(200, { data: [pending] }),
      ],
    });
    const user = renderApp(ENTRY);
    await fillFormSteps(user);
    await submitListing(user);

    await findHeading('Add photos');
    await vi.waitFor(() => expect(requestsTo(fetchMock, 'POST', '/auth/refresh')).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: 'Finish without photos' }));
    await user.click(
      await screen.findByRole('button', { name: 'See your facilities' }, SCREEN_TIMEOUT),
    );

    expect(await findHeading('Your facilities')).toBeInTheDocument();
    expect(
      await screen.findByText('Onboarding Test Cold Room', undefined, SCREEN_TIMEOUT),
    ).toBeInTheDocument();
    expect(screen.getByText('Pending approval')).toBeInTheDocument();
  });

  it('creates one facility however fast Submit is tapped', async () => {
    const { held, release } = hold();
    const fetchMock = mockApi({
      ...newFarmer,
      'POST /providers': async () => {
        await held;
        return jsonResponse(201, ownProviderFor(onboardingBody));
      },
    });
    const user = renderApp(ENTRY);
    await fillFormSteps(user);

    await user.dblClick(screen.getByRole('button', { name: 'Submit listing' }));
    const button = await screen.findByRole('button', { name: 'Submitting your listing...' });
    expect(button).toBeDisabled();
    await user.click(button);
    release();

    expect(await findHeading('Add photos')).toBeInTheDocument();
    expect(requestsTo(fetchMock, 'POST', '/providers')).toHaveLength(1);
  });

  it('puts a field error from the API next to its field, on its own step', async () => {
    mockApi({
      ...newFarmer,
      'POST /providers': errorResponse(400, 'validation_failed', {
        details: [{ location: 'body', path: 'address_text', message: 'Enter the address' }],
      }),
    });
    const user = renderApp(ENTRY);
    await fillFormSteps(user);
    await submitListing(user);

    await waitForPath('/provider/onboarding/location');
    expect(screen.getByLabelText('Address')).toHaveAccessibleDescription('Enter the address');

    await user.type(screen.getByLabelText('Address'), ', Bodija');
    expect(screen.getByLabelText('Address')).not.toHaveAccessibleDescription();
  });

  it('offers Try again after a network failure, keeping every entry', async () => {
    const fetchMock = mockApi({
      ...newFarmer,
      'POST /providers': [
        () => Promise.reject(new TypeError('Failed to fetch')),
        jsonResponse(201, ownProviderFor(onboardingBody)),
      ],
    });
    const user = renderApp(ENTRY);
    await fillFormSteps(user);
    await submitListing(user);

    expect(
      await screen.findByText(
        'No network connection. Check your data or Wi-Fi, then try again.',
        undefined,
        SCREEN_TIMEOUT,
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await findHeading('Add photos')).toBeInTheDocument();
    const [, retry] = requestsTo(fetchMock, 'POST', '/providers');
    expect(bodyOf(retry!)).toEqual(onboardingBody);
  });
});

describe('photos', FLOW_TIMEOUT, () => {
  const toPhotos = async (routes: Parameters<typeof mockApi>[0]) => {
    const fetchMock = mockApi({ ...newFarmer, ...created(), ...routes });
    const user = renderApp(ENTRY);
    await fillFormSteps(user);
    await submitListing(user);
    await findHeading('Add photos');
    return { fetchMock, user };
  };

  const withPhoto = ownProviderFor(onboardingBody, { photos: [photoOne] });

  it('uploads a photo as its raw bytes after a failure and a retry', async () => {
    const { fetchMock, user } = await toPhotos({
      [PHOTOS_ROUTE]: [
        () => Promise.reject(new TypeError('Failed to fetch')),
        jsonResponse(201, withPhoto),
      ],
    });

    await user.upload(photoInput(), jpeg());

    expect(
      await screen.findByText(
        'No network connection. Check your data or Wi-Fi, then try again.',
        undefined,
        SCREEN_TIMEOUT,
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Uploaded', undefined, SCREEN_TIMEOUT)).toBeInTheDocument();
    const uploads = requestsTo(fetchMock, 'POST', `/providers/${PROVIDER_ID}/photos`);
    expect(uploads).toHaveLength(2);
    expect(new Headers(uploads[1]![1]?.headers).get('Content-Type')).toBe('image/jpeg');
    expect(uploads[1]![1]?.body).toBeInstanceOf(Blob);

    await user.click(screen.getByRole('button', { name: 'Finish' }));
    expect(await findHeading('Pending approval')).toBeInTheDocument();
  });

  it('explains a photo that is too big and offers no retry for it', async () => {
    const { user } = await toPhotos({
      [PHOTOS_ROUTE]: errorResponse(413, 'payload_too_large'),
    });

    await user.upload(photoInput(), jpeg());

    expect(
      await screen.findByText(
        'This photo is too big. Pick one under 5 MB.',
        undefined,
        SCREEN_TIMEOUT,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove photo 1' }));
    expect(screen.queryByText('Photo 1')).not.toBeInTheDocument();
  });

  it('explains a file the API does not take as a photo, and the limit of four', async () => {
    const { user } = await toPhotos({
      [PHOTOS_ROUTE]: [errorResponse(400, 'bad_request'), errorResponse(409, 'conflict')],
    });

    await user.upload(photoInput(), [jpeg('one.jpg'), jpeg('two.jpg')]);

    expect(
      await screen.findByText(
        "This file isn't a JPEG, PNG or WebP photo. Remove it and pick a photo.",
        undefined,
        SCREEN_TIMEOUT,
      ),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        'This facility already has 4 photos. Remove one to add this one.',
        undefined,
        SCREEN_TIMEOUT,
      ),
    ).toBeInTheDocument();
  });

  it('keeps to four photos when more are picked', async () => {
    const { fetchMock, user } = await toPhotos({ [PHOTOS_ROUTE]: jsonResponse(201, withPhoto) });

    await user.upload(
      photoInput(),
      ['1', '2', '3', '4', '5'].map((name) => jpeg(`${name}.jpg`)),
    );

    expect(
      screen.getByText('You can add up to 4 photos. We kept the first ones you picked.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Photos: 4 of 4' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Add another photo/)).not.toBeInTheDocument();
    await vi.waitFor(() =>
      expect(requestsTo(fetchMock, 'POST', `/providers/${PROVIDER_ID}/photos`)).toHaveLength(4),
    );
  });

  it('removes an uploaded photo from the facility', async () => {
    const { fetchMock, user } = await toPhotos({
      [PHOTOS_ROUTE]: jsonResponse(201, withPhoto),
      [`DELETE /providers/${PROVIDER_ID}/photos/${photoOne.id}`]: jsonResponse(
        200,
        ownProviderFor(onboardingBody),
      ),
    });

    await user.upload(photoInput(), jpeg());
    await screen.findByText('Uploaded', undefined, SCREEN_TIMEOUT);
    await user.click(screen.getByRole('button', { name: 'Remove photo 1' }));

    await vi.waitFor(() => expect(screen.queryByText('Photo 1')).not.toBeInTheDocument());
    expect(
      requestsTo(fetchMock, 'DELETE', `/providers/${PROVIDER_ID}/photos/${photoOne.id}`),
    ).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Finish without photos' })).toBeInTheDocument();
  });

  it('has no way back to the details once the facility exists', async () => {
    await toPhotos({});

    expect(screen.queryByRole('button', { name: 'Go back' })).not.toBeInTheDocument();
  });
});
