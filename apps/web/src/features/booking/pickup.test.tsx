import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { createBookingBodySchema, type BookingQuoteBody } from '@coldlink/shared';
import { bodyOf, jsonResponse, mockApi, requestsTo, sessionFixture } from '../../test/api';
import {
  CHECKOUT_URL,
  DUGBE_BOOKING_ID,
  dugbeBooking,
  dugbePaymentPath,
  dugbeProvider,
  dugbeQuote,
  dugbeQuoteWithPickup,
  dugbeReviewPath,
  PAYMENT_REFERENCE,
  paidDugbeBooking,
  tenCratesForAWeek,
} from '../../test/bookingFixtures';
import { renderApp, SCREEN_TIMEOUT } from '../../test/renderApp';
import { cropsResponse, dugbe } from '../../test/searchFixtures';

// The map itself needs a real browser; this stands in for a tap on it.
vi.mock('../search/PinMap', () => ({
  default: ({ onPick }: { onPick: (lat: number, lng: number) => void }) => (
    <button type="button" onClick={() => onPick(7.5, 3.9)}>
      Tap the map
    </button>
  ),
}));

const signedIn = { 'POST /auth/refresh': jsonResponse(200, sessionFixture()) };
const crops = { 'GET /crops': jsonResponse(200, cropsResponse) };
const dugbeFound = { [`GET /providers/${dugbe.provider.id}`]: jsonResponse(200, dugbeProvider) };
const PICKUP_FEE = 245_000;
const withPickup = dugbeQuoteWithPickup();

/** The booking quote, with the pickup priced in whenever the request asks for one. */
const quotes = (pickup = withPickup) => ({
  'POST /bookings/quote': ({ body }: { body: unknown }) =>
    jsonResponse(200, (body as BookingQuoteBody).delivery ? pickup : dugbeQuote()),
});
const initialized = {
  'POST /payments/initialize': jsonResponse(200, {
    authorization_url: CHECKOUT_URL,
    reference: PAYMENT_REFERENCE,
  }),
};
const bookedWithPickup = dugbeBooking({
  delivery_fee_kobo: PICKUP_FEE,
  total_charged_online_kobo: 1_050_000 + PICKUP_FEE,
});
const reviewing = { ...signedIn, ...crops, ...dugbeFound, ...quotes() };

// 10:00 in Lagos on the booking's start day, so the pickup can only be today. Only Date is faked.
const NOW = new Date('2026-11-10T09:00:00Z');
const FLOW_TIMEOUT = { timeout: 30_000 };
const PAGE_CHANGE_TIMEOUT = { timeout: 15_000 };

const currentPath = () => screen.getByTestId('location').textContent;
const currentQuery = () => screen.getByTestId('location-search').textContent ?? '';
const waitForPath = (path: string) =>
  vi.waitFor(() => expect(currentPath()).toBe(path), PAGE_CHANGE_TIMEOUT);

const choosePickup = async (user: UserEvent) => {
  await user.click(
    await screen.findByRole('radio', { name: 'Yes, pick it up from my farm' }, SCREEN_TIMEOUT),
  );
};

const fillPickup = async (
  user: UserEvent,
  { phone = '0803 123 4567', day = '2026-11-10' } = {},
) => {
  await user.type(screen.getByLabelText('Pickup address'), 'Akinyele farm road, by the blue gate');
  await user.click(await screen.findByRole('button', { name: 'Tap the map' }, SCREEN_TIMEOUT));
  await user.type(screen.getByLabelText('Phone of the person at pickup'), phone);
  await user.type(screen.getByLabelText(/Name of the person at pickup/), 'Bola');
  await user.type(screen.getByLabelText('Pickup day'), day);
};

let assign: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  assign = vi.fn();
  vi.stubGlobal('location', { ...window.location, assign });
});

describe('pickup at review', FLOW_TIMEOUT, () => {
  it('is off by default, and the booking is priced and paid without it', async () => {
    const fetchMock = mockApi(reviewing);
    const user = renderApp(dugbeReviewPath);

    expect(
      await screen.findByRole('radio', { name: "No, I'll bring it myself" }, SCREEN_TIMEOUT),
    ).toBeChecked();
    expect(screen.queryByLabelText('Pickup address')).not.toBeInTheDocument();
    expect(screen.getByText('You pay now: ₦10,500')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Pay ₦10,500' }));

    await waitForPath(`/payment/${dugbe.provider.id}`);
    expect(new URLSearchParams(currentQuery()).has('pickup')).toBe(false);
    for (const call of requestsTo(fetchMock, 'POST', '/bookings/quote')) {
      expect(bodyOf(call)).not.toHaveProperty('delivery');
    }
  });

  it('holds back the total until the pin and amount are in, then shows the fee in it', async () => {
    const fetchMock = mockApi(reviewing);
    const user = renderApp(dugbeReviewPath);
    await choosePickup(user);

    expect(
      screen.getByText('Set the pickup point and how much to carry to see the full price.'),
    ).toBeVisible();
    expect(screen.queryByText(/^You pay now/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    // The load is the booking's produce and amount, in its unit, until the farmer changes it.
    expect(screen.getByLabelText('What is being carried')).toHaveValue('Tomatoes');
    expect(screen.getByLabelText('How much')).toHaveValue('10');

    await user.click(await screen.findByRole('button', { name: 'Tap the map' }, SCREEN_TIMEOUT));

    expect(
      await screen.findByText('You pay now: ₦12,950', undefined, SCREEN_TIMEOUT),
    ).toBeVisible();
    expect(screen.getByText('Delivery, paid now')).toBeVisible();
    expect(screen.getByText('Delivery fee')).toBeVisible();
    expect(screen.getAllByText('₦2,450')).toHaveLength(2);
    expect(screen.getByText('By motorbike, about 14.5 km by road.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Pay ₦12,950' })).toBeVisible();
    const withDelivery = requestsTo(fetchMock, 'POST', '/bookings/quote').at(-1)!;
    expect(bodyOf(withDelivery)).toMatchObject({
      delivery: { location: { lat: 7.5, lng: 3.9 }, load_quantity: 10, load_unit: 'crates' },
    });
    expect(JSON.stringify(document.body.textContent)).not.toMatch(/payout|margin/i);
  });

  it('drops the fee again when the farmer chooses no', async () => {
    mockApi(reviewing);
    const user = renderApp(dugbeReviewPath);
    await choosePickup(user);
    await user.click(await screen.findByRole('button', { name: 'Tap the map' }, SCREEN_TIMEOUT));
    await screen.findByText('You pay now: ₦12,950', undefined, SCREEN_TIMEOUT);

    await user.click(screen.getByRole('radio', { name: "No, I'll bring it myself" }));

    expect(
      await screen.findByText('You pay now: ₦10,500', undefined, SCREEN_TIMEOUT),
    ).toBeVisible();
    expect(screen.queryByText('Delivery, paid now')).not.toBeInTheDocument();
  });

  it('asks for the address, pin, phone and a day in the window before paying', async () => {
    mockApi(reviewing);
    const user = renderApp(dugbeReviewPath);
    await choosePickup(user);
    await user.clear(screen.getByLabelText('How much'));

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByText('Describe where the driver should go.')).toBeVisible();
    expect(screen.getByText('Set the point on the map.')).toBeVisible();
    expect(
      screen.getByText('Enter a Nigerian mobile number, such as 0803 123 4567.'),
    ).toBeVisible();
    expect(screen.getByText('Enter a whole number of crates.')).toBeVisible();
    expect(screen.getByLabelText('Pickup address')).toHaveAttribute('aria-invalid', 'true');
    expect(currentPath()).toBe(`/review/${dugbe.provider.id}`);
  });

  it('refuses a phone that is not a Nigerian mobile and a day outside the window', async () => {
    mockApi(reviewing);
    const user = renderApp(dugbeReviewPath);
    await choosePickup(user);
    await fillPickup(user, { phone: '1234', day: '2026-11-11' });
    await screen.findByText('You pay now: ₦12,950', undefined, SCREEN_TIMEOUT);

    expect(screen.getByText('Any day from Tue, 10 Nov 2026 to Tue, 10 Nov 2026.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Pay ₦12,950' }));

    expect(
      screen.getByText('Enter a Nigerian mobile number, such as 0803 123 4567.'),
    ).toBeVisible();
    expect(
      screen.getByText('Choose a day from Tue, 10 Nov 2026 to Tue, 10 Nov 2026.'),
    ).toBeVisible();
    expect(screen.queryByText('Describe where the driver should go.')).not.toBeInTheDocument();
    expect(currentPath()).toBe(`/review/${dugbe.provider.id}`);
  });

  it('books with the pickup and pays the total with its fee', async () => {
    const fetchMock = mockApi({
      ...reviewing,
      'POST /bookings': jsonResponse(201, bookedWithPickup),
      ...initialized,
    });
    const user = renderApp(dugbeReviewPath);
    await choosePickup(user);
    await fillPickup(user);
    await user.click(await screen.findByRole('button', { name: 'Pay ₦12,950' }, SCREEN_TIMEOUT));

    await waitForPath(`/payment/${dugbe.provider.id}`);
    expect(new URLSearchParams(currentQuery()).get('pickup')).toBe('1');
    // The details themselves never go in the URL.
    expect(currentQuery()).not.toMatch(/Akinyele|8031234567|7\.5/);
    expect(await screen.findByText('Pickup', undefined, SCREEN_TIMEOUT)).toBeVisible();
    expect(screen.getByText('Akinyele farm road, by the blue gate')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Pay ₦12,950' }));

    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith(CHECKOUT_URL));
    const [booking] = requestsTo(fetchMock, 'POST', '/bookings');
    expect(bodyOf(booking!)).toEqual(
      createBookingBodySchema.parse({
        ...tenCratesForAWeek,
        provider_id: dugbe.provider.id,
        delivery: {
          address_text: 'Akinyele farm road, by the blue gate',
          location: { lat: 7.5, lng: 3.9 },
          contact_phone: '+2348031234567',
          contact_name: 'Bola',
          load_description: 'Tomatoes',
          load_quantity: 10,
          load_unit: 'crates',
          scheduled_for: '2026-11-10',
        },
      }),
    );
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('stops before Paystack when the fee changed since review', async () => {
    const fetchMock = mockApi({
      ...reviewing,
      'POST /bookings': jsonResponse(
        201,
        dugbeBooking({ delivery_fee_kobo: 260_000, total_charged_online_kobo: 1_310_000 }),
      ),
      [`GET /bookings/${DUGBE_BOOKING_ID}`]: jsonResponse(
        200,
        dugbeBooking({ delivery_fee_kobo: 260_000, total_charged_online_kobo: 1_310_000 }),
      ),
      ...initialized,
    });
    const user = renderApp(dugbeReviewPath);
    await choosePickup(user);
    await fillPickup(user);
    await user.click(await screen.findByRole('button', { name: 'Pay ₦12,950' }, SCREEN_TIMEOUT));
    await waitForPath(`/payment/${dugbe.provider.id}`);
    await user.click(await screen.findByRole('button', { name: 'Pay ₦12,950' }, SCREEN_TIMEOUT));

    expect(await screen.findByText('The price changed', undefined, SCREEN_TIMEOUT)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Pay ₦13,100' })).toBeVisible();
    expect(requestsTo(fetchMock, 'POST', '/payments/initialize')).toHaveLength(0);
    expect(assign).not.toHaveBeenCalled();
  });

  it('asks for the pickup again after a reload loses it, never showing a total without it', async () => {
    const fetchMock = mockApi(reviewing);
    renderApp(`${dugbePaymentPath}&pickup=1`);

    expect(
      await screen.findByText(
        "Enter the pickup details again. They aren't kept when the page reloads.",
        undefined,
        SCREEN_TIMEOUT,
      ),
    ).toBeVisible();
    expect(currentPath()).toBe(`/review/${dugbe.provider.id}`);
    expect(screen.getByRole('radio', { name: 'Yes, pick it up from my farm' })).toBeChecked();
    expect(screen.queryByText(/^You pay now/)).not.toBeInTheDocument();
    expect(requestsTo(fetchMock, 'POST', '/bookings')).toHaveLength(0);
  });
});

describe('a booking with pickup after payment', FLOW_TIMEOUT, () => {
  const paidWithPickup = paidDugbeBooking({
    delivery_fee_kobo: PICKUP_FEE,
    total_charged_online_kobo: 1_050_000 + PICKUP_FEE,
  });

  it('shows the fee within the amount paid on confirmation', async () => {
    mockApi({
      ...signedIn,
      [`GET /bookings/${DUGBE_BOOKING_ID}`]: jsonResponse(200, paidWithPickup),
    });
    renderApp(`/confirmation/${DUGBE_BOOKING_ID}`);

    expect(await screen.findByText('Paid online', undefined, SCREEN_TIMEOUT)).toBeVisible();
    expect(screen.getByText('₦12,950')).toBeVisible();
    expect(screen.getByText('Includes pickup')).toBeVisible();
    expect(screen.getByText('₦2,450')).toBeVisible();
  });

  it('shows the fee and the total on the booking detail', async () => {
    mockApi({
      ...signedIn,
      [`GET /bookings/${DUGBE_BOOKING_ID}`]: jsonResponse(200, paidWithPickup),
    });
    renderApp(`/bookings/${DUGBE_BOOKING_ID}`);

    expect(await screen.findByText('Delivery, online', undefined, SCREEN_TIMEOUT)).toBeVisible();
    expect(screen.getByText('₦2,450')).toBeVisible();
    expect(screen.getByText('Total online')).toBeVisible();
    expect(screen.getByText('₦12,950')).toBeVisible();
  });
});
