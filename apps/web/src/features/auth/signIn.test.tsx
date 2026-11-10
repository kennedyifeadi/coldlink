import { describe, expect, it, vi } from 'vitest';
import { act, screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import type { ErrorCode } from '@coldlink/shared';
import {
  bodyOf,
  errorResponse,
  jsonResponse,
  mockApi,
  requestsTo,
  sessionFixture,
} from '../../test/api';
import { renderApp, SCREEN_TIMEOUT } from '../../test/renderApp';

const codeSent = (resendAfterSeconds = 60) =>
  jsonResponse(200, { expires_in_seconds: 600, resend_after_seconds: resendAfterSeconds });

const signedOut = { 'POST /auth/refresh': errorResponse(401, 'unauthorized') };

const findPhoneInput = () => screen.findByLabelText('Phone number', undefined, SCREEN_TIMEOUT);
const continueButton = () => screen.getByRole('button', { name: /^Continue/ });
const currentPath = () => screen.getByTestId('location').textContent;

const enterPhone = async (user: UserEvent, phone = '0803 123 4567') => {
  await user.type(await findPhoneInput(), phone);
  await user.click(continueButton());
};

const enterCode = async (user: UserEvent, code: string) => {
  const input = await screen.findByLabelText('6-digit code', undefined, SCREEN_TIMEOUT);
  await user.clear(input);
  await user.type(input, code);
  await user.click(continueButton());
};

describe('phone screen', () => {
  it.each(['08031234567', '0803 123 4567', '803-123-4567', '2348031234567', '+234 803 123 4567'])(
    'accepts %s and sends it as +234 and ten digits',
    async (typed) => {
      const fetchMock = mockApi({ ...signedOut, 'POST /auth/otp/request': codeSent() });
      const user = renderApp('/onboarding');

      await enterPhone(user, typed);

      expect(
        await screen.findByRole('heading', { name: 'Enter your code' }, SCREEN_TIMEOUT),
      ).toBeInTheDocument();
      const [request] = requestsTo(fetchMock, 'POST', '/auth/otp/request');
      expect(bodyOf(request!)).toEqual({ phone: '+2348031234567' });
    },
  );

  it.each(['0123 456 7890', '0803 123 456', '0201234567', 'my number'])(
    'refuses %s without calling the API',
    async (typed) => {
      const fetchMock = mockApi(signedOut);
      const user = renderApp('/onboarding');

      await enterPhone(user, typed);

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Enter a Nigerian mobile number, like 0803 123 4567.',
      );
      expect(await findPhoneInput()).toHaveAttribute('aria-invalid', 'true');
      expect(requestsTo(fetchMock, 'POST', '/auth/otp/request')).toHaveLength(0);
    },
  );

  it('keeps Continue off until a number is typed', async () => {
    mockApi(signedOut);
    renderApp('/onboarding');

    await findPhoneInput();

    expect(continueButton()).toBeDisabled();
  });

  it.each<[string, Response | (() => Promise<Response>), string]>([
    [
      'rate_limited',
      errorResponse(429, 'rate_limited', { details: { retry_after_seconds: 42 } }),
      'Too many tries. Try again in 42 seconds.',
    ],
    [
      'network failure',
      () => Promise.reject(new TypeError('Failed to fetch')),
      'No network connection. Check your data or Wi-Fi, then try again.',
    ],
    [
      'internal',
      errorResponse(500, 'internal'),
      'Something went wrong on our side. Try again in a moment.',
    ],
  ])('explains %s when asking for a code', async (_, reply, message) => {
    mockApi({ ...signedOut, 'POST /auth/otp/request': reply });
    const user = renderApp('/onboarding');

    await enterPhone(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(currentPath()).toBe('/onboarding');
  });
});

describe('code screen', () => {
  it('sends a returning farmer to search after the right code', async () => {
    const fetchMock = mockApi({
      ...signedOut,
      'POST /auth/otp/request': codeSent(),
      'POST /auth/otp/verify': jsonResponse(200, sessionFixture()),
    });
    const user = renderApp('/onboarding');

    await enterPhone(user);
    expect(
      await screen.findByText('We sent a 6-digit code by SMS to +234 803 123 4567.', {
        normalizer: (text) => text.replace(/\s+/g, ' '),
      }),
    ).toBeInTheDocument();
    await enterCode(user, '482913');

    expect(
      await screen.findByRole('heading', { name: 'Where are you storing from?' }, SCREEN_TIMEOUT),
    ).toBeInTheDocument();
    const [verify] = requestsTo(fetchMock, 'POST', '/auth/otp/verify');
    expect(bodyOf(verify!)).toEqual({ phone: '+2348031234567', code: '482913' });
  });

  it('accepts digits only, up to six', async () => {
    mockApi({ ...signedOut, 'POST /auth/otp/request': codeSent() });
    const user = renderApp('/onboarding');
    await enterPhone(user);
    const input = await screen.findByLabelText('6-digit code', undefined, SCREEN_TIMEOUT);

    await user.type(input, '48a2 9-13999');

    expect(input).toHaveValue('482913');
  });

  it('keeps Continue off until all six digits are in', async () => {
    mockApi({ ...signedOut, 'POST /auth/otp/request': codeSent() });
    const user = renderApp('/onboarding');
    await enterPhone(user);

    await user.type(
      await screen.findByLabelText('6-digit code', undefined, SCREEN_TIMEOUT),
      '48291',
    );

    expect(continueButton()).toBeDisabled();
  });

  it.each<[ErrorCode, number, string]>([
    ['otp_invalid', 400, 'That code is wrong or has expired. Check the SMS or send a new code.'],
    [
      'account_disabled',
      403,
      'This account is turned off. Contact ColdLink support to turn it back on.',
    ],
    ['rate_limited', 429, 'Too many tries. Wait a little, then try again.'],
  ])('explains %s and stays on the code screen', async (code, status, message) => {
    mockApi({
      ...signedOut,
      'POST /auth/otp/request': codeSent(),
      'POST /auth/otp/verify': errorResponse(status, code),
    });
    const user = renderApp('/onboarding');

    await enterPhone(user);
    await enterCode(user, '000000');

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByLabelText('6-digit code')).toHaveAttribute('aria-invalid', 'true');
    expect(currentPath()).toBe('/onboarding/code');
  });

  it('clears the error once the code is changed', async () => {
    mockApi({
      ...signedOut,
      'POST /auth/otp/request': codeSent(),
      'POST /auth/otp/verify': errorResponse(400, 'otp_invalid'),
    });
    const user = renderApp('/onboarding');
    await enterPhone(user);
    await enterCode(user, '000000');
    await screen.findByRole('alert');

    await user.type(screen.getByLabelText('6-digit code'), '{Backspace}');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('goes back to the phone screen to change the number', async () => {
    mockApi({ ...signedOut, 'POST /auth/otp/request': codeSent() });
    const user = renderApp('/onboarding');
    await enterPhone(user);

    await user.click(await screen.findByRole('link', { name: 'Change number' }, SCREEN_TIMEOUT));

    expect(await findPhoneInput()).toBeInTheDocument();
  });

  it('sends a visitor with no pending sign-in to the phone screen', async () => {
    mockApi(signedOut);
    renderApp('/onboarding/code');

    expect(await findPhoneInput()).toBeInTheDocument();
  });
});

describe('resend', () => {
  // Only the countdown's clock: React schedules its own work on setImmediate and timeouts.
  const useClock = () =>
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'], shouldAdvanceTime: true });
  const tick = (ms: number) => act(() => vi.advanceTimersByTime(ms));

  it('counts down from resend_after_seconds before offering a new code', async () => {
    useClock();
    mockApi({ ...signedOut, 'POST /auth/otp/request': codeSent(45) });
    const user = renderApp('/onboarding', { advanceTimers: vi.advanceTimersByTime });
    await enterPhone(user);

    expect(
      await screen.findByRole('button', { name: 'Send a new code in 0:45' }, SCREEN_TIMEOUT),
    ).toBeDisabled();

    await tick(15_000);
    expect(screen.getByRole('button', { name: 'Send a new code in 0:30' })).toBeDisabled();

    await tick(30_000);
    expect(screen.getByRole('button', { name: 'Send a new code' })).toBeEnabled();
  });

  it('sends a new code and starts the countdown again', async () => {
    useClock();
    const fetchMock = mockApi({
      ...signedOut,
      'POST /auth/otp/request': [codeSent(60), codeSent(90)],
    });
    const user = renderApp('/onboarding', { advanceTimers: vi.advanceTimersByTime });
    await enterPhone(user);
    await screen.findByRole('button', { name: /^Send a new code in/ }, SCREEN_TIMEOUT);
    await tick(60_000);

    await user.click(screen.getByRole('button', { name: 'Send a new code' }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      /We sent a new code to \+234\s803\s123\s4567\./,
    );
    expect(screen.getByRole('button', { name: 'Send a new code in 1:30' })).toBeDisabled();
    expect(requestsTo(fetchMock, 'POST', '/auth/otp/request')).toHaveLength(2);
  });

  it('waits as long as the API says when a resend is rate limited', async () => {
    useClock();
    mockApi({
      ...signedOut,
      'POST /auth/otp/request': [
        codeSent(60),
        errorResponse(429, 'rate_limited', { headers: { 'Retry-After': '300' } }),
      ],
    });
    const user = renderApp('/onboarding', { advanceTimers: vi.advanceTimersByTime });
    await enterPhone(user);
    await screen.findByRole('button', { name: /^Send a new code in/ }, SCREEN_TIMEOUT);
    await tick(60_000);

    await user.click(screen.getByRole('button', { name: 'Send a new code' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many tries. Try again in 5 minutes.',
    );
    expect(screen.getByRole('button', { name: 'Send a new code in 5:00' })).toBeDisabled();
  });
});

describe('consent', () => {
  const newUserRoutes = (verifyReplies: Response[]) => ({
    ...signedOut,
    'POST /auth/otp/request': codeSent(),
    'POST /auth/otp/verify': verifyReplies,
  });

  const reachConsent = async (user: UserEvent) => {
    await enterPhone(user);
    await enterCode(user, '482913');
    return screen.findByRole(
      'heading',
      { name: 'Before we create your ColdLink ID' },
      SCREEN_TIMEOUT,
    );
  };

  it('asks a new number for consent, then shows the new ColdLink ID', async () => {
    const fetchMock = mockApi(
      newUserRoutes([
        errorResponse(400, 'consent_required'),
        jsonResponse(200, sessionFixture({ isNewUser: true, coldlinkId: '4820193' })),
      ]),
    );
    const user = renderApp('/onboarding');

    expect(await reachConsent(user)).toBeInTheDocument();
    const create = screen.getByRole('button', { name: 'Create my ColdLink ID' });
    expect(create).toBeDisabled();
    await user.click(
      screen.getByRole('checkbox', { name: 'I agree to the ColdLink privacy notice.' }),
    );
    await user.click(create);

    expect(await screen.findByText('482 0193', undefined, SCREEN_TIMEOUT)).toBeInTheDocument();
    expect(currentPath()).toBe('/userid');
    const [first, second] = requestsTo(fetchMock, 'POST', '/auth/otp/verify');
    expect(bodyOf(first!)).toEqual({ phone: '+2348031234567', code: '482913' });
    expect(bodyOf(second!)).toEqual({ phone: '+2348031234567', code: '482913', consent: true });
  });

  it('links to the privacy notice and keeps the sign-in when coming back', async () => {
    mockApi(newUserRoutes([errorResponse(400, 'consent_required')]));
    const user = renderApp('/onboarding');
    await reachConsent(user);

    await user.click(screen.getByRole('link', { name: 'Read the full privacy notice' }));
    expect(
      await screen.findByRole('heading', { name: 'Privacy notice' }, SCREEN_TIMEOUT),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Go back' }));

    expect(
      await screen.findByRole('heading', { name: 'Before we create your ColdLink ID' }),
    ).toBeInTheDocument();
  });

  it('offers a new code when the code expired while reading', async () => {
    mockApi(
      newUserRoutes([errorResponse(400, 'consent_required'), errorResponse(400, 'otp_invalid')]),
    );
    const user = renderApp('/onboarding');
    await reachConsent(user);

    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Create my ColdLink ID' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That code is wrong or has expired.',
    );
    await user.click(screen.getByRole('button', { name: 'Get a new code' }));

    expect(await screen.findByRole('heading', { name: 'Enter your code' })).toBeInTheDocument();
    expect(screen.getByLabelText('6-digit code')).toHaveValue('');
  });

  it('sends a visitor with no checked code to the phone screen', async () => {
    mockApi(signedOut);
    renderApp('/onboarding/consent');

    expect(await findPhoneInput()).toBeInTheDocument();
  });
});

describe('privacy notice', () => {
  it('is open to everyone and covers the NDPA basics', async () => {
    mockApi(signedOut);
    renderApp('/privacy');

    const main = await screen.findByRole('main', undefined, SCREEN_TIMEOUT);
    for (const heading of ['What we keep', 'Why we keep it', 'Who sees it', 'Your choices']) {
      expect(within(main).getByRole('heading', { name: heading })).toBeInTheDocument();
    }
    expect(main).toHaveTextContent('Nigeria Data Protection Act 2023');
  });
});
