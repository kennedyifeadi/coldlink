import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import oxlint from 'eslint-plugin-oxlint';
import i18next from 'eslint-plugin-i18next';

// oxlint handles everything it can; ESLint only adds the type-aware typescript-eslint rules
// and the guard against hardcoded UI text.
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
  {
    // User-facing text must come from the i18n resources: JSX text, and string literals in
    // the attributes and props below. Class names, routes and other props are not checked.
    files: ['src/**/*.tsx'],
    ignores: ['**/*.test.tsx'],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': [
        'error',
        {
          mode: 'jsx-only',
          'should-validate-template': true,
          'jsx-attributes': {
            include: [
              'aria-label',
              'aria-description',
              'alt',
              'placeholder',
              'title',
              'label',
              '\\w+Label',
              'aside',
              'value',
            ],
          },
        },
      ],
    },
  },
  ...oxlint.buildFromOxlintConfigFile('./.oxlintrc.json'),
);
