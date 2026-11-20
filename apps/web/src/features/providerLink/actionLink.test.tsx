import { describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import {
  providerActionPath,
  providerBookingRequestSchema,
  providerLinkActionBodySchema,
  providerLinkActionResultSchema,
  type ProviderLinkActionResult,
} from '@coldlink/shared';
import { bodyOf, errorResponse, jsonResponse, mockApi, requestsTo } from '../../test/api';
import { renderApp, SCREEN_TIMEOUT } from '../../test/renderApp';

const TOKEN = 'Hk3_q-9ZxYv0LmN2pQrStUvWxYz0123456789abcDE';
const LINK = providerActionPath(TOKEN);
const OPEN = `GET /actions/${TOKEN}`;
const ANSWER = `POST /actions/${TOKEN}`;

const signedOut = { 'POST /auth/refresh': errorResponse(401, 'unauthorized') };

// Due at 15:45 in Lagos (14:45 UTC) on Tuesday 10 November 2026.
const request = providerBookingRequestSchema.parse({
  code: 'CL-7K3Q9',
  facility_name: 'Bodija Cold Room',
  crop_name: 'Tomatoes',
  quantity: 10,
  capacity_unit: 'crates',
  start_date: '2026-12-01',
  duration_days: 30,
  end_date: '2026-12-31',
  payout_kobo: 1_350_000,
  response_due_at: '2026-11-10T14:45:00.000Z',
});
const opened = { [OPEN]: jsonResponse(200, request) };
const answered = (status: ProviderLinkActionResult['status']) =>
  jsonResponse(200, providerLinkActionResultSchema.parse({ status }));
const dropped = () => Promise.reject(new TypeError('Failed to fetch'));

// The text a person sees: the page without renderApp's location probe, which prints the URL.
const pageText = () => {
  const page = document.body.cloneNode(true) as HTMLElement;
  page.querySelectorAll('[data-testid^="location"]').forEach((probe) => probe.remove());
  return page.textContent;
};

const findHeading = (name: string | RegExp) =>
  screen.findByRole('heading', { name }, SCREEN_TIMEOUT);
const acceptButton = () => screen.findByRole('button', { name: 'Accept booking' }, SCREEN_TIMEOUT);
const sentActions = (fetchMock: ReturnType<typeof mockApi>) =>
  requestsTo(fetchMock, 'POST', `/actions/${TOKEN}`).map(
    (call) => providerLinkActionBodySchema.parse(bodyOf(call)).action,
  );

describe('provider action link', () => {
  it('shows the booking with its code, payout and Lagos deadline, signed out and without the nav', async () => {
    mockApi({ ...signedOut, ...opened });
    renderApp(LINK);

    expect(await findHeading('New booking at Bodija Cold Room')).toBeInTheDocument();
    expect(screen.getByText('CL-7K3Q9')).toBeInTheDocument();
    expect(screen.getByText('₦13,500')).toBeInTheDocument();
    expect(screen.getByText('Answer by 3:45 pm, Tue, 10 Nov')).toBeInTheDocument();
    expect(screen.getByText('Tomatoes, 10 crates')).toBeInTheDocument();
    expect(screen.getByText('Tue, 1 Dec 2026 to Thu, 31 Dec 2026 (30 days)')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(pageText()).not.toContain(TOKEN);
  });

  it('accepts straight away and shows the booking confirmed with its code', async () => {
    const fetchMock = mockApi({ ...signedOut, ...opened, [ANSWER]: answered('confirmed') });
    const user = renderApp(LINK);

    await user.click(await acceptButton());

    expect(await findHeading('Booking confirmed')).toBeInTheDocument();
    expect(screen.getByText("We've sent the farmer your address.", { exact: false })).toBeVisible();
    expect(screen.getByText('CL-7K3Q9')).toBeInTheDocument();
    expect(sentActions(fetchMock)).toEqual(['accept']);
    expect(pageText()).not.toContain(TOKEN);
  });

  it('asks once more before rejecting, then shows the booking rejected', async () => {
    const fetchMock = mockApi({ ...signedOut, ...opened, [ANSWER]: answered('rejected') });
    const user = renderApp(LINK);

    await user.click(await screen.findByRole('button', { name: 'Reject booking' }, SCREEN_TIMEOUT));
    expect(
      screen.getByText('Reject this booking? The farmer will get a full refund.'),
    ).toBeInTheDocument();
    expect(sentActions(fetchMock)).toEqual([]);

    await user.click(screen.getByRole('button', { name: "Don't reject" }));
    await user.click(screen.getByRole('button', { name: 'Reject booking' }));
    await user.click(screen.getByRole('button', { name: 'Yes, reject it' }));

    expect(await findHeading('Booking rejected')).toBeInTheDocument();
    expect(screen.getByText('The farmer will get a full refund.', { exact: false })).toBeVisible();
    expect(sentActions(fetchMock)).toEqual(['reject']);
  });

  it('sends one request for a double tap', async () => {
    let release = () => {};
    const fetchMock = mockApi({
      ...signedOut,
      ...opened,
      [ANSWER]: () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(answered('confirmed'));
        }),
    });
    renderApp(LINK);

    const button = await acceptButton();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(await screen.findByRole('button', { name: 'Accepting...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject booking' })).toBeDisabled();
    release();

    expect(await findHeading('Booking confirmed')).toBeInTheDocument();
    expect(sentActions(fetchMock)).toEqual(['accept']);
  });

  it('shows one message for a link that is unknown, used or expired', async () => {
    mockApi({ ...signedOut, [OPEN]: errorResponse(404, 'not_found') });
    renderApp(LINK);

    expect(await findHeading('This link has expired or has already been used')).toBeInTheDocument();
    expect(screen.getByText("If you've just answered, your answer was saved.")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /accept|reject|try again/i })).toBeNull();
  });

  it('says so when the booking was already answered or is past its deadline', async () => {
    mockApi({ ...signedOut, ...opened, [ANSWER]: errorResponse(409, 'conflict') });
    const user = renderApp(LINK);

    await user.click(await acceptButton());

    expect(
      await findHeading('This booking has already been answered or is past its deadline'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /accept|reject|try again/i })).toBeNull();
  });

  it('asks the provider to wait after too many tries', async () => {
    mockApi({
      ...signedOut,
      [OPEN]: errorResponse(429, 'rate_limited', { headers: { 'Retry-After': '240' } }),
    });
    renderApp(LINK);

    expect(await findHeading('Too many tries')).toBeInTheDocument();
    expect(screen.getByText('Wait 4 minutes, then open the link again.')).toBeInTheDocument();
  });

  it('offers Try again when the booking cannot be loaded for lack of network', async () => {
    mockApi({ ...signedOut, [OPEN]: [dropped, dropped, jsonResponse(200, request)] });
    const user = renderApp(LINK);

    expect(await findHeading("Couldn't load this booking")).toBeInTheDocument();
    expect(screen.getByText(/No network connection/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await findHeading('New booking at Bodija Cold Room')).toBeInTheDocument();
  });

  it('keeps the booking on screen when an answer does not get through', async () => {
    const fetchMock = mockApi({
      ...signedOut,
      ...opened,
      [ANSWER]: [dropped, answered('confirmed')],
    });
    const user = renderApp(LINK);

    await user.click(await acceptButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(/No network connection/);
    expect(screen.getByRole('heading', { name: 'New booking at Bodija Cold Room' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Accept booking' }));

    expect(await findHeading('Booking confirmed')).toBeInTheDocument();
    expect(sentActions(fetchMock)).toEqual(['accept', 'accept']);
  });

  it('describes any other failure with the shared message', async () => {
    mockApi({ ...signedOut, [OPEN]: errorResponse(500, 'internal') });
    renderApp(LINK);

    expect(await findHeading("Couldn't load this booking")).toBeInTheDocument();
    expect(
      screen.getByText('Something went wrong on our side. Try again in a moment.'),
    ).toBeInTheDocument();
  });

  it('sends no referrer while the page is open, and restores the page after', async () => {
    mockApi({ ...signedOut, ...opened });
    renderApp(LINK);
    await findHeading('New booking at Bodija Cold Room');

    expect(document.head.querySelector('meta[name="referrer"]')).toHaveAttribute(
      'content',
      'no-referrer',
    );
    cleanup();
    expect(document.head.querySelector('meta[name="referrer"]')).toBeNull();
  });
});
