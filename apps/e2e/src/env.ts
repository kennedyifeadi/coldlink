// Where the suite runs. Unset, it starts the built API and web app on this machine (see
// playwright.config.ts); pointing it at staging later means setting the two URLs (decision 135).
const LOCAL_WEB_URL = 'http://localhost:4173';
const LOCAL_API_URL = 'http://localhost:3000/api/v1';

const trimSlash = (url: string) => url.replace(/\/+$/, '');

export interface E2eEnv {
  webUrl: string;
  apiUrl: string;
  /** True when no URL was given, so Playwright starts the servers itself. */
  local: boolean;
  /** Used only to approve the run's own facility until #46 adds an approval endpoint. */
  databaseUrl: string;
  paystackSecretKey: string;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be set to run the end-to-end tests.`);
  return value;
}

/** Refuses anything but a Paystack test key, so a run can never take real money (decision 132). */
export function assertPaystackTestKey(key: string): void {
  if (!key.startsWith('sk_test_')) {
    throw new Error(
      'PAYSTACK_SECRET_KEY must be a Paystack test key (sk_test_...). The end-to-end tests pay on ' +
        "Paystack's checkout and must never run with a live key.",
    );
  }
}

export function readE2eEnv(): E2eEnv {
  const webUrl = process.env.E2E_WEB_URL?.trim();
  const apiUrl = process.env.E2E_API_URL?.trim();
  if (Boolean(webUrl) !== Boolean(apiUrl)) {
    throw new Error('Set E2E_WEB_URL and E2E_API_URL together, or neither to run locally.');
  }
  const paystackSecretKey = required('PAYSTACK_SECRET_KEY');
  assertPaystackTestKey(paystackSecretKey);
  return {
    webUrl: trimSlash(webUrl || LOCAL_WEB_URL),
    apiUrl: trimSlash(apiUrl || LOCAL_API_URL),
    local: !webUrl,
    databaseUrl: required('E2E_DATABASE_URL'),
    paystackSecretKey,
  };
}
