import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // No shared code exists until #18; an empty run must not fail CI.
    passWithNoTests: true,
  },
});
