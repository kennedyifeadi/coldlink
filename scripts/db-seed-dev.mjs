// Loads the development sample data (supabase/seeds/dev.sql) into the dev project. Run through
// `pnpm db:seed:dev`, which loads DATABASE_URL and NODE_ENV from apps/api/.env. It refuses to run
// unless NODE_ENV is development, and the SQL itself refuses to run outside this script
// (decision 41). Safe to run again: rows that already exist are skipped.
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { readDatabaseUrl, secretMasker } from './database-url.mjs';

if (process.env.NODE_ENV !== 'development') {
  console.error('db:seed:dev only runs with NODE_ENV=development. Sample data must not leave dev.');
  process.exit(1);
}

const databaseUrl = readDatabaseUrl();
const mask = secretMasker(databaseUrl);
const sql = await readFile(new URL('../supabase/seeds/dev.sql', import.meta.url), 'utf8');

const countSampleProviders = async (client) => {
  const { rows } = await client.query(
    `select count(*)::int as count
     from public.providers p
     join public.users u on u.id = p.owner_user_id
     where u.phone like '+23480000000%'`,
  );
  return rows[0].count;
};

const client = new pg.Client({ connectionString: databaseUrl });
try {
  await client.connect();
  await client.query('begin');
  const before = await countSampleProviders(client);
  await client.query(`select set_config('coldlink.seed_target', 'dev', true)`);
  await client.query(sql);
  const after = await countSampleProviders(client);
  await client.query('commit');
  console.log(`Seeded ${after - before} new dev providers; ${after} sample providers in total.`);
} catch (error) {
  console.error(mask(error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
} finally {
  await client.end();
}
