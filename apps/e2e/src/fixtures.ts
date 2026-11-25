import { randomInt } from 'node:crypto';
import {
  nairaToKobo,
  normalisePhone,
  otpRequestResponseSchema,
  sessionResponseSchema,
  type SessionResponse,
} from '@coldlink/shared';
import { test as base, devices, expect, type BrowserContext, type Page } from '@playwright/test';
import { E2eApi } from './api.js';
import { approveRunFacility } from './db.js';
import { readE2eEnv, type E2eEnv } from './env.js';

/** Kishi's point in the web app's area list (apps/web/src/features/search/areas.ts). */
const KISHI = { lat: 9.0833, lng: 3.85 };

export interface RunData {
  id: string;
  /** As typed on the phone screen: made-up numbers in the toll-free 0800 range (decision 133). */
  farmerPhone: string;
  providerPhone: string;
  facilityName: string;
}

export interface RunFacility {
  id: string;
  name: string;
}

interface Fixtures {
  env: E2eEnv;
  run: RunData;
  api: E2eApi;
  providerContext: BrowserContext;
  providerPage: Page;
  facility: RunFacility;
}

/** A new run's id and numbers: 0800 numbers never reach a person (decision 41), and are fresh each run. */
function newRun(): RunData {
  const id = String(randomInt(100_000, 1_000_000));
  return {
    id,
    farmerPhone: `08001${id}`,
    providerPhone: `08002${id}`,
    facilityName: `E2E cold room ${id} (test)`,
  };
}

const e164 = (localPhone: string) => {
  const phone = normalisePhone(localPhone);
  if (!phone) throw new Error(`Not a phone number: ${localPhone}`);
  return phone;
};

/**
 * Registers a new number through the sign-in screens, with the code the development API returns
 * (decision 57) and consent, and returns the session the API gave the browser.
 */
export async function registerThroughScreens(
  page: Page,
  localPhone: string,
): Promise<SessionResponse> {
  await page.goto('/onboarding');
  await page.getByLabel('Phone number').fill(localPhone);
  const codeRequest = page.waitForResponse(
    (response) =>
      response.url().endsWith('/auth/otp/request') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Continue' }).click();
  const codeResponse = await codeRequest;
  if (!codeResponse.ok()) {
    throw new Error(
      `The sign-in code request answered ${codeResponse.status()}: ${await codeResponse.text()}`,
    );
  }
  const sent = otpRequestResponseSchema.parse(await codeResponse.json());
  if (!sent.dev_code) {
    throw new Error(
      'The API sent no dev_code: it must run with NODE_ENV=development and SMS_PROVIDER=console.',
    );
  }

  await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible();
  await page.getByLabel('6-digit code').fill(sent.dev_code);
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(
    page.getByRole('heading', { name: 'Before we create your ColdLink ID' }),
  ).toBeVisible();
  // The box itself is visually hidden behind its label, which is what a person taps.
  await page.getByText('I agree to the ColdLink privacy notice.').click();
  await expect(
    page.getByRole('checkbox', { name: 'I agree to the ColdLink privacy notice.' }),
  ).toBeChecked();
  const verify = page.waitForResponse(
    (response) => response.url().endsWith('/auth/otp/verify') && response.ok(),
  );
  await page.getByRole('button', { name: 'Create my ColdLink ID' }).click();
  const session = sessionResponseSchema.parse(await (await verify).json());

  await expect(page.getByRole('heading', { name: "You're all set!" })).toBeVisible();
  return session;
}

export const test = base.extend<Fixtures>({
  // oxlint-disable-next-line no-empty-pattern -- Playwright reads a fixture's dependencies from this pattern.
  env: async ({}, use) => {
    await use(readE2eEnv());
  },

  // oxlint-disable-next-line no-empty-pattern -- Playwright reads a fixture's dependencies from this pattern.
  run: async ({}, use, testInfo) => {
    const run = newRun();
    // Every run's rows are found from these, so they go in the report (decision 133).
    await testInfo.attach('run', {
      body: JSON.stringify(run, null, 2),
      contentType: 'application/json',
    });
    await use(run);
  },

  api: async ({ request, env }, use) => {
    await use(new E2eApi(request, env.apiUrl));
  },

  providerContext: async ({ browser, env }, use) => {
    const context = await browser.newContext({ ...devices['Pixel 7'], baseURL: env.webUrl });
    await use(context);
    await context.close();
  },

  providerPage: async ({ providerContext }, use) => {
    await use(await providerContext.newPage());
  },

  /**
   * The provider signs up through the screens first, so the one sign-in code per number every
   * 60 seconds (decision 56) is spent there, and the session it returns lists the run's facility
   * through the API. The facility is approved by the only write outside the API, and paused
   * afterwards whatever happened in the test, never deleted (decision 133).
   */
  facility: async ({ providerPage, providerContext, run, api, env }, use) => {
    const session = await registerThroughScreens(providerPage, run.providerPhone);
    const created = await api.createProvider(session.access_token, {
      display_name: run.facilityName,
      facility_type: 'cold_room',
      description: 'End-to-end test facility. Paused after its run.',
      address_text: `End-to-end test address, run ${run.id}`,
      lga: 'Irepo',
      lat: KISHI.lat,
      lng: KISHI.lng,
      capacity_total: 100,
      capacity_unit: 'crates',
      price_per_unit_per_day_kobo: nairaToKobo(500),
      min_storage_days: 1,
      category_ids: [await api.categoryId('vegetables')],
    });
    if (created.verification_status === 'pending') {
      await approveRunFacility(env.databaseUrl, created.id, e164(run.providerPhone));
    }

    await use({ id: created.id, name: created.display_name });

    const token = await api.refreshSession(providerContext.request);
    await api.pauseProvider(token, created.id);
  },
});

export { expect };
