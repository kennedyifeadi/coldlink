import { defineConfig } from 'vitest/config';

// Integration tests run against TEST_DATABASE_URL only (src/test/testDatabase.ts). Files run one
// at a time because each test holds a transaction that may lock rows another file writes.
export default defineConfig({
  test: {
    include: ['src/**/*.integration.test.ts'],
    globalSetup: ['src/test/integrationSetup.ts'],
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
