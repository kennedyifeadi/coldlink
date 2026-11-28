import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import {
  farmerBookingSchema,
  farmerDeliverySchema,
  type DeliveryDirection,
  type DeliveryStatus,
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
import {
  bookingDelivery,
  CHECKOUT_URL,
  DELIVERY_ID,
  DUGBE_BOOKING_ID,
  farmerDelivery,
  paidDugbeBooking,
  PAYMENT_REFERENCE,
  paymentReturnPath,
  pickupQuote,
  verification,
} from '../../test/bookingFixtures';
import { renderApp, SCREEN_TIMEOUT } from '../../test/renderApp';

// The map itself needs a real browser; this stands in for a tap on it.
vi.mock('../search/PinMap', () => ({
  default: ({ onPick }: { onPick: (lat: number, lng: number) => void }) => (
    <button type="button" onClick={() => onPick(7.5, 3.9)}>
      Tap the map
    </button>
  ),
}));

// 10:00 in Lagos on 10 November 2026. Only Date is faked.
const NOW = new Date('2026-11-10T09:00:00Z');
const FLOW_TIMEOUT = { timeout: 30_000 };
const PAGE_CHANGE_TIMEOUT = { timeout: 15_000 };

const signedIn = { 'POST /auth/refresh': jsonResponse(200, sessionFixture()) };
const bookingRoute = `GET /bookings/${DUGBE_BOOKING_ID}`;
const deliveryRoute = `GET /deliveries/${DELIVERY_ID}`;
const detailPath = `/bookings/${DUGBE_BOOKING_ID}`;

/** Confirmed, starting in two days, so both windows are open: inbound to 12 Nov, outbound 12-19. */
const confirmed = (changes: Partial<FarmerBooking> = {}) =>
  farmerBookingSchema.parse(
    paidDugbeBooking({
      status: 'confirmed',
      start_date: '2026-11-12',
      end_date: '2026-11-19',
      provider: { ...paidDugbeBooking().provider, phone: '+2348006000001' },
      ...changes,
    }),
  );

const windows = {
  inbound: { earliest_date: '2026-11-10', latest_date: '2026-11-12' },
  outbound: { earliest_date: '2026-11-12', latest_date: '2026-11-19' },
};
const quoted = (direction: DeliveryDirection) => ({
  'POST /deliveries/quote': jsonResponse(200, pickupQuote({ direction, ...windows[direction] })),
});
const initialized = {
  'POST /payments/initialize': jsonResponse(200, {
    authorization_url: CHECKOUT_URL,
    reference: PAYMENT_REFERENCE,
  }),
};
const requested = (direction: DeliveryDirection) => ({
  'POST /deliveries': jsonResponse(201, farmerDelivery({ direction, paid: false })),
});

const currentPath = () => screen.getByTestId('location').textContent;
const waitForPath = (path: string) =>
  vi.waitFor(() => expect(currentPath()).toBe(path), PAGE_CHANGE_TIMEOUT);
const findHeading = (name: string | RegExp) =>
  screen.findByRole('heading', { name }, SCREEN_TIMEOUT);

const labels = {
  inbound: { ask: 'Ask for pickup from your farm', address: 'Pickup address', day: 'Pickup day' },
  outbound: {
    ask: 'Ask for delivery from the cold room',
    address: 'Drop-off address',
    day: 'Delivery day',
  },
} as const;

const phoneLabel = {
  inbound: 'Phone of the person at pickup',
  outbound: 'Phone of the person receiving it',
} as const;

const fillRequest = async (user: UserEvent, direction: DeliveryDirection, day: string) => {
  await user.type(
    await screen.findByLabelText(labels[direction].address, undefined, SCREEN_TIMEOUT),
    'Akinyele farm road',
  );
  await user.click(await screen.findByRole('button', { name: 'Tap the map' }, SCREEN_TIMEOUT));
  await user.type(screen.getByLabelText(phoneLabel[direction]), '0803 123 4567');
  await screen.findByRole('button', { name: 'Pay ₦2,450' }, SCREEN_TIMEOUT);
  await user.type(screen.getByLabelText(labels[direction].day), day);
};

let assign: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  assign = vi.fn();
  vi.stubGlobal('location', { ...window.location, assign });
});

describe('asking for a delivery after booking', FLOW_TIMEOUT, () => {
  it('offers both ways while confirmed', async () => {
    mockApi({ ...signedIn, [bookingRoute]: jsonResponse(200, confirmed()) });
    renderApp(detailPath);

    expect(await findHeading('Delivery')).toBeVisible();
    expect(screen.getByRole('button', { name: labels.inbound.ask })).toBeVisible();
    expect(screen.getByRole('button', { name: labels.outbound.ask })).toBeVisible();
  });

  it('offers only outbound once the produce is in storage', async () => {
    mockApi({
      ...signedIn,
      [bookingRoute]: jsonResponse(200, confirmed({ status: 'in_storage' })),
    });
    renderApp(detailPath);

    expect(
      await screen.findByRole('button', { name: labels.outbound.ask }, SCREEN_TIMEOUT),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: labels.inbound.ask })).not.toBeInTheDocument();
  });

  it('offers nothing while the cold room has not answered', async () => {
    mockApi({ ...signedIn, [bookingRoute]: jsonResponse(200, paidDugbeBooking()) });
    renderApp(detailPath);

    expect(await findHeading('Dugbe Fridge Fleet (Sample)')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Delivery' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Ask for/ })).not.toBeInTheDocument();
  });

  it('does not offer a direction that already has a live delivery', async () => {
    mockApi({
      ...signedIn,
      [bookingRoute]: jsonResponse(200, confirmed({ deliveries: [bookingDelivery()] })),
      [deliveryRoute]: jsonResponse(200, farmerDelivery()),
    });
    renderApp(detailPath);

    expect(
      await screen.findByRole('button', { name: labels.outbound.ask }, SCREEN_TIMEOUT),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: labels.inbound.ask })).not.toBeInTheDocument();
  });

  it.each(['inbound', 'outbound'] as const)(
    'asks for an %s delivery, prices it, then pays it on its own',
    async (direction) => {
      const fetchMock = mockApi({
        ...signedIn,
        [bookingRoute]: jsonResponse(200, confirmed()),
        ...quoted(direction),
        ...requested(direction),
        ...initialized,
      });
      const user = renderApp(detailPath);
      await user.click(
        await screen.findByRole('button', { name: labels[direction].ask }, SCREEN_TIMEOUT),
      );
      await waitForPath(`${detailPath}/delivery/${direction}`);
      await fillRequest(user, direction, windows[direction].latest_date);

      expect(screen.getByText('You pay now: ₦2,450')).toBeVisible();
      expect(screen.getByText('By motorbike, about 14.5 km by road.')).toBeVisible();
      await user.click(screen.getByRole('button', { name: 'Pay ₦2,450' }));

      await vi.waitFor(() => expect(assign).toHaveBeenCalledWith(CHECKOUT_URL));
      expect(bodyOf(requestsTo(fetchMock, 'POST', '/deliveries/quote').at(-1)!)).toEqual({
        direction,
        booking_id: DUGBE_BOOKING_ID,
        location: { lat: 7.5, lng: 3.9 },
        load_quantity: 10,
        load_unit: 'crates',
      });
      const [created] = requestsTo(fetchMock, 'POST', '/deliveries');
      expect(bodyOf(created!)).toEqual({
        booking_id: DUGBE_BOOKING_ID,
        direction,
        address_text: 'Akinyele farm road',
        location: { lat: 7.5, lng: 3.9 },
        contact_phone: '+2348031234567',
        load_description: 'Tomatoes',
        load_quantity: 10,
        load_unit: 'crates',
        scheduled_for: windows[direction].latest_date,
      });
      const charges = requestsTo(fetchMock, 'POST', '/payments/initialize');
      expect(charges.map(bodyOf)).toEqual([{ delivery_request_id: DELIVERY_ID }]);
    },
  );

  it('needs the pin, a phone and a day in the window', async () => {
    const fetchMock = mockApi({
      ...signedIn,
      [bookingRoute]: jsonResponse(200, confirmed()),
      ...quoted('outbound'),
    });
    const user = renderApp(`${detailPath}/delivery/outbound`);

    await user.click(await screen.findByRole('button', { name: 'Continue' }, SCREEN_TIMEOUT));

    expect(screen.getByText('Set the point on the map.')).toBeVisible();
    expect(
      screen.getByText('Enter a Nigerian mobile number, such as 0803 123 4567.'),
    ).toBeVisible();
    expect(screen.getByText('Set the point and amount first, then choose a day.')).toBeVisible();

    await fillRequest(user, 'outbound', '2026-11-11');
    await user.click(screen.getByRole('button', { name: 'Pay ₦2,450' }));

    expect(
      screen.getByText('Choose a day from Thu, 12 Nov 2026 to Thu, 19 Nov 2026.'),
    ).toBeVisible();
    expect(requestsTo(fetchMock, 'POST', '/deliveries')).toHaveLength(0);
  });

  it.each([
    [
      'already a live delivery that way',
      { booking_id: DUGBE_BOOKING_ID, delivery_request_id: DELIVERY_ID },
      'This booking already has a delivery',
    ],
    [
      'the booking no longer taking it',
      { booking_id: DUGBE_BOOKING_ID, status: 'completed', direction: 'outbound' },
      "This booking can't take a delivery now",
    ],
    [
      'the window having closed',
      { booking_id: DUGBE_BOOKING_ID, direction: 'outbound' },
      "It's too late to arrange delivery",
    ],
  ])('explains a 409 for %s and leads back to the booking', async (_case, details, title) => {
    mockApi({
      ...signedIn,
      [bookingRoute]: jsonResponse(200, confirmed()),
      ...quoted('outbound'),
      'POST /deliveries': errorResponse(409, 'conflict', { details }),
    });
    const user = renderApp(`${detailPath}/delivery/outbound`);
    await fillRequest(user, 'outbound', '2026-11-15');

    await user.click(screen.getByRole('button', { name: 'Pay ₦2,450' }));

    expect(await findHeading(title)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Back to booking' }));
    await waitForPath(detailPath);
  });

  it('says so straight away when the booking no longer takes that delivery', async () => {
    mockApi({ ...signedIn, [bookingRoute]: jsonResponse(200, confirmed({ status: 'completed' })) });
    renderApp(`${detailPath}/delivery/inbound`);

    expect(await findHeading("This booking can't take a pickup now")).toBeVisible();
    expect(
      screen.getByText('Pickup can be asked for while the booking is confirmed.'),
    ).toBeVisible();
  });

  it('pays the same request again after a dropped connection, never asking twice', async () => {
    const fetchMock = mockApi({
      ...signedIn,
      [bookingRoute]: jsonResponse(200, confirmed()),
      ...quoted('outbound'),
      ...requested('outbound'),
      'POST /payments/initialize': [
        () => Promise.reject(new TypeError('Failed to fetch')),
        jsonResponse(200, { authorization_url: CHECKOUT_URL, reference: PAYMENT_REFERENCE }),
      ],
    });
    const user = renderApp(`${detailPath}/delivery/outbound`);
    await fillRequest(user, 'outbound', '2026-11-15');
    await user.click(screen.getByRole('button', { name: 'Pay ₦2,450' }));

    await user.click(await screen.findByRole('button', { name: 'Try again' }, SCREEN_TIMEOUT));

    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith(CHECKOUT_URL));
    expect(requestsTo(fetchMock, 'POST', '/deliveries')).toHaveLength(1);
    expect(requestsTo(fetchMock, 'POST', '/payments/initialize')).toHaveLength(2);
  });
});

describe('coming back from paying for a delivery', FLOW_TIMEOUT, () => {
  const deliveryCharge = (paymentStatus: 'success' | 'initiated' | 'refunded') => ({
    [`GET /payments/${PAYMENT_REFERENCE}/verify`]: jsonResponse(
      200,
      verification({
        payment_status: paymentStatus,
        booking_status: 'confirmed',
        delivery_request_id: DELIVERY_ID,
      }),
    ),
  });

  it('shows the booking with the delivery paid', async () => {
    const outbound = { direction: 'outbound' as const, scheduled_for: '2026-11-15' };
    const fetchMock = mockApi({
      ...signedIn,
      ...deliveryCharge('success'),
      [deliveryRoute]: jsonResponse(200, farmerDelivery(outbound)),
      [bookingRoute]: jsonResponse(200, confirmed({ deliveries: [bookingDelivery(outbound)] })),
    });
    renderApp(paymentReturnPath);

    await waitForPath(detailPath);
    expect(await findHeading('Delivery paid')).toBeVisible();
    expect(screen.getByText("We'll text you when a driver takes the job.")).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Delivery from the cold room' })).toBeVisible();
    expect(requestsTo(fetchMock, 'GET', `/deliveries/${DELIVERY_ID}`).length).toBeGreaterThan(0);
  });

  it('offers to pay again when the payment did not finish', async () => {
    const fetchMock = mockApi({
      ...signedIn,
      ...deliveryCharge('initiated'),
      [deliveryRoute]: jsonResponse(200, farmerDelivery({ direction: 'outbound', paid: false })),
      ...initialized,
    });
    const user = renderApp(paymentReturnPath);

    expect(await findHeading('Payment not finished')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Pay ₦2,450' }));

    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith(CHECKOUT_URL));
    expect(requestsTo(fetchMock, 'POST', '/payments/initialize').map(bodyOf)).toEqual([
      { delivery_request_id: DELIVERY_ID },
    ]);
    expect(requestsTo(fetchMock, 'GET', `/bookings/${DUGBE_BOOKING_ID}`)).toHaveLength(0);
  });

  it('says a payment that came too late is being refunded in full', async () => {
    mockApi({
      ...signedIn,
      ...deliveryCharge('refunded'),
      [deliveryRoute]: jsonResponse(
        200,
        farmerDelivery({ direction: 'outbound', paid: false, status: 'cancelled' }),
      ),
      [bookingRoute]: jsonResponse(200, confirmed()),
    });
    const user = renderApp(paymentReturnPath);

    expect(await findHeading('Your money is coming back')).toBeVisible();
    expect(screen.getByText(/Your ₦2,450 for the delivery arrived after/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Back to booking' }));
    await waitForPath(detailPath);
  });
});

describe('delivery status on the booking', FLOW_TIMEOUT, () => {
  const showDelivery = (status: DeliveryStatus, paid = true) => {
    const fetchMock = mockApi({
      ...signedIn,
      [bookingRoute]: jsonResponse(
        200,
        confirmed({ deliveries: [bookingDelivery({ status, paid })] }),
      ),
      [deliveryRoute]: jsonResponse(
        200,
        farmerDeliverySchema.parse(
          farmerDelivery({
            status,
            paid,
            assigned_at: status === 'requested' ? null : '2026-11-10T10:00:00.000Z',
          }),
        ),
      ),
      ...initialized,
    });
    return { fetchMock, user: renderApp(detailPath) };
  };
  const findCard = async () =>
    screen.findByRole('region', { name: 'Pickup from your farm' }, SCREEN_TIMEOUT);

  it.each([
    ['requested', true, 'Waiting for a driver', true],
    ['assigned', true, 'Waiting for a driver', true],
    ['accepted', true, 'Driver on the way to collect', true],
    ['picked_up', true, 'Picked up', true],
    ['delivered', true, 'Delivered', false],
    ['cancelled', true, 'Cancelled', false],
    ['failed', true, 'Failed', false],
    ['requested', false, 'Not paid', false],
  ] as const)(
    'shows a %s delivery (paid: %s) as "%s", with the code: %s',
    async (status, paid, label, showsCode) => {
      showDelivery(status, paid);
      const card = await findCard();

      expect(await within(card).findByText(label, undefined, SCREEN_TIMEOUT)).toBeVisible();
      await within(card).findByText('Bola, +234800***3456', undefined, SCREEN_TIMEOUT);
      expect(within(card).getByText('Tue, 10 Nov 2026')).toBeVisible();
      expect(within(card).getByText('₦2,450')).toBeVisible();
      if (showsCode) {
        expect(within(card).getByText('0427')).toBeVisible();
        expect(
          within(card).getByText(
            'Give it only to whoever receives the load. The driver needs it to finish the delivery.',
          ),
        ).toBeVisible();
      } else {
        expect(within(card).queryByText('0427')).not.toBeInTheDocument();
      }
    },
  );

  it("shows the partner's times on the Lagos clock", async () => {
    showDelivery('assigned');
    const card = await findCard();

    expect(await within(card).findByText('Driver found', undefined, SCREEN_TIMEOUT)).toBeVisible();
    expect(within(card).getByText('11:00 am on Tue, 10 Nov')).toBeVisible();
  });

  it('pays an unpaid request from its card', async () => {
    const { fetchMock, user } = showDelivery('requested', false);
    const card = await findCard();

    await user.click(
      await within(card).findByRole('button', { name: 'Pay ₦2,450' }, SCREEN_TIMEOUT),
    );

    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith(CHECKOUT_URL));
    expect(requestsTo(fetchMock, 'POST', '/payments/initialize').map(bodyOf)).toEqual([
      { delivery_request_id: DELIVERY_ID },
    ]);
  });
});
