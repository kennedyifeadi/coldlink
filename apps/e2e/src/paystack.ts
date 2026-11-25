import { expect, type Page } from '@playwright/test';

// Paystack's published test card that succeeds with no PIN or OTP
// (https://paystack.com/docs/payments/test-payments). Test mode only; nothing else is ever typed.
const TEST_CARD = { number: '4084084084084081', cvv: '408' };

// Paystack's page is a third party: it loads slower and changes without notice, so its steps live
// here, with longer waits than ColdLink's own screens (decision 136).
const PAYSTACK_TIMEOUT = 60_000;

function futureExpiry(now = new Date()): string {
  const year = (now.getUTCFullYear() + 2) % 100;
  return `12${String(year).padStart(2, '0')}`;
}

/**
 * Pays on Paystack's hosted checkout with the test card, from the page the web app sent the
 * browser to, and waits for Paystack to send it back to `/payment/return`.
 */
export async function payOnPaystackTestCheckout(page: Page): Promise<void> {
  await page.waitForURL(/^https:\/\/checkout\.paystack\.com\//, { timeout: PAYSTACK_TIMEOUT });
  await page.getByText('Pay with Card').first().click({ timeout: PAYSTACK_TIMEOUT });
  // The badge Paystack shows on a test-mode checkout: a second guard against a live key.
  await expect(page.getByText('Test', { exact: true }).filter({ visible: true })).toBeVisible({
    timeout: PAYSTACK_TIMEOUT,
  });
  // Test mode first offers its own outcomes; the card is typed in, so it is the published one.
  await page.getByRole('button', { name: 'Use another card' }).click({ timeout: PAYSTACK_TIMEOUT });
  // The fields format as they are typed, so they are typed key by key rather than filled.
  await page.getByRole('textbox', { name: 'Card Number' }).pressSequentially(TEST_CARD.number);
  await page.getByRole('textbox', { name: 'Card Expiry' }).pressSequentially(futureExpiry());
  await page.getByRole('textbox', { name: 'CVV' }).pressSequentially(TEST_CARD.cvv);
  await page.getByRole('button', { name: /^Pay NGN/ }).click();

  await expect(page.getByRole('heading', { name: 'Payment Successful' })).toBeVisible({
    timeout: PAYSTACK_TIMEOUT,
  });
  await page.waitForURL((url) => url.pathname === '/payment/return', { timeout: PAYSTACK_TIMEOUT });
}
