import { defineConfig } from 'vitest/config';

// Unit tests for the suite's own helpers. The Playwright journey in tests/ runs with `pnpm e2e`.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
