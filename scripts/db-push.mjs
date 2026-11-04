// Applies pending migrations to the dev project without Docker. Run through `pnpm db:push`, which
// loads DATABASE_URL from apps/api/.env. Extra arguments pass through, e.g. `pnpm db:push --dry-run`.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readDatabaseUrl, secretMasker } from './database-url.mjs';

const databaseUrl = readDatabaseUrl();
const mask = secretMasker(databaseUrl);

const cli = fileURLToPath(import.meta.resolve('supabase/dist/supabase.js'));
const child = spawn(
  process.execPath,
  [cli, 'db', 'push', '--db-url', databaseUrl, ...process.argv.slice(2)],
  { stdio: ['inherit', 'pipe', 'pipe'] },
);

child.stdout.on('data', (chunk) => process.stdout.write(mask(chunk.toString())));
child.stderr.on('data', (chunk) => process.stderr.write(mask(chunk.toString())));
child.on('close', (code) => process.exit(code ?? 1));
