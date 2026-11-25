import pg from 'pg';

// As the API's pool does (apps/api/src/db/client.ts): sslmode comes out of the URL, since
// node-postgres would read sslmode=require as verify-full and fail on Supabase's own CA.
function clientConfig(databaseUrl: string): pg.ClientConfig {
  const url = new URL(databaseUrl);
  const sslMode = url.searchParams.get('sslmode');
  url.searchParams.delete('sslmode');
  if (sslMode === 'disable') return { connectionString: url.toString(), ssl: false };
  return { connectionString: url.toString(), ssl: { rejectUnauthorized: false } };
}

/**
 * Approves the run's own facility. There is no approval endpoint until the admin API (#46), so
 * this is the one write the suite makes outside the API (decision 133). The statement names the
 * facility and its owner's number and only moves it from pending, so it can never touch a row
 * another run or a person created; it must change exactly one row.
 */
export async function approveRunFacility(
  databaseUrl: string,
  providerId: string,
  ownerPhone: string,
): Promise<void> {
  const client = new pg.Client(clientConfig(databaseUrl));
  await client.connect();
  try {
    const { rowCount } = await client.query(
      `update public.providers p
       set verification_status = 'approved'
       from public.users u
       where p.id = $1
         and p.verification_status = 'pending'
         and u.id = p.owner_user_id
         and u.phone = $2`,
      [providerId, ownerPhone],
    );
    if (rowCount !== 1) {
      throw new Error(`Expected to approve exactly one facility, approved ${rowCount ?? 0}.`);
    }
  } finally {
    await client.end();
  }
}
