import { existsSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';
import { readE2eEnv } from './src/env.js';

// A local run reads its settings from apps/e2e/.env (never committed); CI sets them on the job.
if (existsSync('.env')) process.loadEnvFile('.env');
const env = readE2eEnv();
const webOrigin = new URL(env.webUrl).origin;
const apiOrigin = new URL(env.apiUrl).origin;

export default defineConfig({
  testDir: './tests',
  // One journey through shared data: running it twice at once would only race itself.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 6 * 60_000,
  expect: { timeout: 15_000 },
  outputDir: 'test-results',
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: env.webUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'mobile-chromium',
      // The full Chromium in its new headless mode, not the separate headless shell: closer to the
      // browser on a farmer's phone, and one download.
      use: { ...devices['Pixel 7'], browserName: 'chromium', channel: 'chromium' },
    },
  ],
  // Locally and in CI the suite starts the built API and web app itself. Given E2E_WEB_URL and
  // E2E_API_URL (staging, later), it starts nothing and tests what is there (decision 135).
  webServer: env.local
    ? [
        {
          command: 'pnpm --filter @coldlink/api start',
          url: `${apiOrigin}/api/v1/health`,
          // Never another API that may be running jobs or other settings against the same database.
          reuseExistingServer: false,
          timeout: 60_000,
          // These win over apps/api/.env: Node's --env-file never overrides a variable already set.
          env: {
            NODE_ENV: 'development',
            SMS_PROVIDER: 'console',
            JOBS_ENABLED: 'false',
            WEB_APP_URL: webOrigin,
            CORS_ORIGINS: webOrigin,
            PAYSTACK_SECRET_KEY: env.paystackSecretKey,
          },
        },
        {
          command: `pnpm --filter web exec vite preview --port ${new URL(webOrigin).port} --strictPort`,
          url: webOrigin,
          reuseExistingServer: false,
          timeout: 60_000,
        },
      ]
    : undefined,
});
