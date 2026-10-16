import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import oxlint from 'eslint-plugin-oxlint';

// oxlint handles everything it can; ESLint only adds the type-aware typescript-eslint rules.
export default defineConfig(
  { ignores: ['dist'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  ...oxlint.buildFromOxlintConfigFile('./.oxlintrc.json'),
);
