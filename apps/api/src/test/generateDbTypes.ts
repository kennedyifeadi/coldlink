// Regenerates src/db/schema.ts from the migrated throwaway database in TEST_DATABASE_URL, never
// from dev. Run through `pnpm db:types`; CI runs it after applying the migrations and fails if the
// committed file differs.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { requireTestDatabaseUrl } from './testDatabase.js';

const codegen = fileURLToPath(import.meta.resolve('kysely-codegen/dist/cli/bin.js'));
const outFile = fileURLToPath(new URL('../db/schema.ts', import.meta.url));

const { status } = spawnSync(
  process.execPath,
  [
    codegen,
    '--url',
    requireTestDatabaseUrl(),
    '--dialect',
    'postgres',
    '--include-pattern',
    'public.*',
    // Match the pool's type parsers (src/db/parsers.ts).
    '--type-mapping',
    JSON.stringify({ int8: 'number' }),
    '--numeric-parser',
    'number',
    '--date-parser',
    'string',
    '--out-file',
    outFile,
  ],
  { stdio: 'inherit' },
);
process.exit(status ?? 1);
