import { todayInLagos } from '@coldlink/shared';
import { expect, registerThroughScreens, test } from '../src/fixtures.js';
import { payOnPaystackTestCheckout } from '../src/paystack.js';

const BOOKING_CODE = /CL-[A-HJ-NP-Z2-9]{5}/;
const COMMENT = 'Cold all week and the staff were helpful.';

test('a farmer books and pays, the cold room answers and stores it, and the farmer rates it', async ({
  page,
  providerPage,
  facility,
  run,
  api,
  providerContext,
}) => {
  let bookingCode = '';

  await test.step('farmer registers with the dev code and consent', async () => {
    await registerThroughScreens(page, run.farmerPhone);
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('button', { name: 'Find storage' })
      .click();
    await page.getByRole('button', { name: 'Find cold storage' }).click();
  });

  await test.step('farmer searches near the test facility', async () => {
    await expect(page.getByRole('heading', { name: 'Where are you storing from?' })).toBeVisible();
    await page.getByRole('button', { name: 'Pick your area' }).click();
    await page.getByLabel('Search for your area').fill('Kishi');
    await page.getByRole('button', { name: 'Kishi', exact: true }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('heading', { name: 'What do you want to store?' })).toBeVisible();
    await page.getByRole('button', { name: 'Tomatoes', exact: true }).click();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(
      page.getByRole('heading', { name: 'How much do you want to store?' }),
    ).toBeVisible();
    await page.getByLabel('Amount', { exact: true }).fill('5');
    await page.getByRole('radio', { name: 'Crates' }).check();
    // Check-in opens on the start date (decision 99), so the booking starts today in Lagos.
    await expect(page.getByLabel('Start date')).toHaveValue(todayInLagos());
    await page.getByRole('button', { name: 'Find cold storage' }).click();
  });

  await test.step('farmer picks the test facility by name and reviews the booking', async () => {
    await expect(page.getByRole('heading', { name: 'Cold storage near you' })).toBeVisible();
    // Other facilities may be listed too.
    const result = page.getByRole('article', { name: facility.name });
    await result.getByRole('button', { name: 'Book' }).click();

    await expect(page.getByRole('heading', { name: facility.name })).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('heading', { name: 'Review your booking' })).toBeVisible();
    await page.getByRole('button', { name: /^Pay / }).click();
  });

  await test.step("farmer pays on Paystack's test checkout and lands on the confirmation", async () => {
    await expect(page.getByRole('heading', { name: 'Pay for your booking' })).toBeVisible();
    await page.getByRole('button', { name: /^Pay / }).click();
    await payOnPaystackTestCheckout(page);

    await expect(
      page.getByRole('heading', { name: `Waiting for ${facility.name} to confirm` }),
    ).toBeVisible({ timeout: 60_000 });
    bookingCode =
      (await page.getByText(BOOKING_CODE).first().textContent())?.match(BOOKING_CODE)?.[0] ?? '';
    expect(bookingCode).toMatch(BOOKING_CODE);
  });

  await test.step("provider opens the facility's dashboard and the request", async () => {
    // A fresh load reads the session again, which now has the provider role.
    await providerPage.goto('/');
    await providerPage.getByRole('button', { name: /Your facilities/ }).click();
    await providerPage.getByRole('link', { name: facility.name }).click();

    const requests = providerPage.getByRole('region', { name: /To answer/ });
    await requests.getByRole('link', { name: bookingCode }).click();
    await expect(providerPage.getByText(bookingCode).first()).toBeVisible();
  });

  await test.step('provider accepts, checks in, then marks collected', async () => {
    await providerPage.getByRole('button', { name: 'Accept booking' }).click();
    await expect(providerPage.getByText('Booking accepted.')).toBeVisible();

    await providerPage.getByRole('button', { name: 'Check in produce' }).click();
    await expect(providerPage.getByText('Produce checked in.')).toBeVisible();

    await providerPage.getByRole('button', { name: 'Mark collected' }).click();
    await expect(providerPage.getByText('Booking marked collected.')).toBeVisible();
  });

  await test.step('farmer sees the booking completed in My bookings', async () => {
    await page.goto('/');
    await page.getByRole('button', { name: /My bookings/ }).click();
    const card = page.getByRole('link', { name: bookingCode });
    await expect(card).toContainText('Collected');
    await card.click();
  });

  await test.step('farmer rates it 4 stars with a comment', async () => {
    await page.getByRole('button', { name: 'Rate your stay' }).click();
    await expect(page.getByRole('heading', { name: `How was ${facility.name}?` })).toBeVisible();
    await page.getByRole('button', { name: '4 out of 5' }).click();
    await expect(page.getByText('4 out of 5: Very good')).toBeVisible();
    await page.getByLabel(/Anything to add\?/).fill(COMMENT);
    await page.getByRole('button', { name: 'Send rating' }).click();
    await expect(
      page.getByRole('heading', { name: `Thank you for rating ${facility.name}` }),
    ).toBeVisible();
  });

  await test.step('the booking detail shows the rating', async () => {
    await page.getByRole('button', { name: 'See booking' }).click();
    await expect(page.getByText('4 out of 5: Very good')).toBeVisible();
    await expect(page.getByText(COMMENT)).toBeVisible();
  });

  await test.step("the facility's public rating counts it once paused", async () => {
    const token = await api.refreshSession(providerContext.request);
    await api.pauseProvider(token, facility.id);
    // A paused facility is still public (GET /providers/:id filters on approval only).
    const publicView = await api.publicProvider(facility.id);
    expect(publicView.is_accepting_bookings).toBe(false);
    expect(publicView.avg_rating).toBe(4);
    expect(publicView.rating_count).toBe(1);
  });
});
