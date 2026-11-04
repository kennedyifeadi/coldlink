import { configDefaults, defineConfig } from 'vitest/config';

// Unit tests need no database; the integration tests run with vitest.integration.config.ts.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'src/**/*.integration.test.ts'],
  },
});
