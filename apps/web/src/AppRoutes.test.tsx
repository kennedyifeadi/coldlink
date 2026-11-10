import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { errorResponse, jsonResponse, mockApi, sessionFixture } from './test/api';
import { renderApp, SCREEN_TIMEOUT } from './test/renderApp';

const signedOut = { 'POST /auth/refresh': errorResponse(401, 'unauthorized') };
const signedIn = { 'POST /auth/refresh': jsonResponse(200, sessionFixture()) };

const findHeading = (name: string) => screen.findByRole('heading', { name }, SCREEN_TIMEOUT);

describe('app routes', () => {
  it('shows the not-found page for an unknown URL', async () => {
    mockApi(signedOut);
    renderApp('/no-such-page');

    expect(await findHeading('Page not found')).toBeInTheDocument();
  });

  it('takes the user back to the start from the not-found page', async () => {
    mockApi(signedOut);
    const user = renderApp('/bookings/123');

    await user.click(await screen.findByRole('button', { name: 'Go to start' }, SCREEN_TIMEOUT));

    expect(await findHeading('Find cold storage near you.')).toBeInTheDocument();
  });

  it('opens farmer screens for a signed-in user after a reload', async () => {
    mockApi(signedIn);
    renderApp('/duration');

    expect(await findHeading('How long do you need storage?')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Page not found' })).not.toBeInTheDocument();
  });

  it('sends a signed-out user to sign in, then back to the screen they asked for', async () => {
    mockApi({
      ...signedOut,
      'POST /auth/otp/request': jsonResponse(200, {
        expires_in_seconds: 600,
        resend_after_seconds: 60,
      }),
      'POST /auth/otp/verify': jsonResponse(200, sessionFixture()),
    });
    const user = renderApp('/duration');

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

    expect(await findHeading('How long do you need storage?')).toBeInTheDocument();
  });

  it('skips the sign-in screen for a signed-in user', async () => {
    mockApi(signedIn);
    renderApp('/onboarding');

    expect(await findHeading('Where are you storing from?')).toBeInTheDocument();
  });

  it('offers a retry when the API cannot be reached on load', async () => {
    mockApi({
      'POST /auth/refresh': [
        () => Promise.reject(new TypeError('Failed to fetch')),
        jsonResponse(200, sessionFixture()),
      ],
    });
    const user = renderApp('/duration');

    expect(await findHeading("Can't reach ColdLink")).toBeInTheDocument();
    expect(
      screen.getByText('No network connection. Check your data or Wi-Fi, then try again.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await findHeading('How long do you need storage?')).toBeInTheDocument();
  });
});
