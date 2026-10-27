// Applies pending migrations to the dev project without Docker. Run through `pnpm db:push`, which
// loads DATABASE_URL from apps/api/.env. Extra arguments pass through, e.g. `pnpm db:push --dry-run`.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set. Add it to apps/api/.env.');
  process.exit(1);
}

// The CLI should never print the URL, but mask it and its password in case an error message does.
const { password } = new URL(databaseUrl);
const secrets = [databaseUrl, password, decodeURIComponent(password)].filter(Boolean);
const mask = (text) => secrets.reduce((masked, secret) => masked.replaceAll(secret, '***'), text);

const cli = fileURLToPath(import.meta.resolve('supabase/dist/supabase.js'));
const child = spawn(
  process.execPath,
  [cli, 'db', 'push', '--db-url', databaseUrl, ...process.argv.slice(2)],
  { stdio: ['inherit', 'pipe', 'pipe'] },
);

child.stdout.on('data', (chunk) => process.stdout.write(mask(chunk.toString())));
child.stderr.on('data', (chunk) => process.stderr.write(mask(chunk.toString())));
child.on('close', (code) => process.exit(code ?? 1));
