# Database

SQL migrations in `migrations/` are the source of truth for the schema (PRD 4.1). Supabase is used as managed Postgres; the Express API is the only client and connects with the service-role connection (PRD 4.4).

No step here needs Docker. Migrations are applied straight to a hosted Supabase project, and CI checks them in a throwaway Postgres.

## Conventions

- **Ids:** every table has `id uuid primary key default gen_random_uuid()`. `gen_random_uuid()` is built into Postgres 13+, so no extension is needed. The exceptions are `app_config`, which is keyed by `key text primary key` because the API reads it by name, and the join table `provider_crop_support`, keyed by `(provider_id, category_id)` (decision 24).
- **Timestamps:** every table has `created_at timestamptz not null default now()` and `updated_at timestamptz not null default now()`. Store UTC; display in Africa/Lagos. The exception is the append-only `booking_events`, which has only `created_at` (decision 27).
- **`updated_at` trigger:** every table gets a `before update` trigger that calls `public.set_updated_at()`:

  ```sql
  create trigger <table>_set_updated_at
    before update on public.<table>
    for each row execute function public.set_updated_at();
  ```

- **Deny by default:** every table has Row Level Security enabled with **no policies**, and `anon` and `authenticated` have no privileges on it. The API bypasses RLS through the service-role connection. Default privileges are revoked, so a new table starts with no client privileges, but you must still enable RLS on it:

  ```sql
  alter table public.<table> enable row level security;
  ```

- **Functions:** `security invoker` (the default), `set search_path = ''`, every object qualified (PostGIS in `extensions`), and the right volatility (`stable` if it reads tables or `now()`). Default privileges stop `anon` and `authenticated` getting EXECUTE, but `PUBLIC` still gets it, so revoke it and grant to the API's role in the same migration (decision 37):

  ```sql
  revoke execute on function public.<name>(<args>) from public, anon, authenticated;
  grant execute on function public.<name>(<args>) to service_role;
  ```

- **Constraints:** name check constraints `<table>_<column>_<rule>` (`users_phone_format`) so API errors can map them. Enum-like values match `packages/shared/src/enums.ts` exactly.
- **Money** is integer kobo in `bigint` (decision 16). A table that stores a pricing snapshot checks it against the pricing rules (decision 17), as `bookings` does. **Extensions** go in the `extensions` schema (`postgis` is there).
- **Reference data** every environment needs (crop categories, crops, `app_config` defaults) goes in a migration, never `seed.sql`, which only runs on `db reset`. Insert it `on conflict do nothing` on a natural key, so it never overwrites a value an admin has changed (decision 40).
- **Forward-only:** never edit or delete a migration that has run anywhere (dev, staging or production). To change something, add a new migration.
- **Naming:** `<timestamp>_<snake_case_description>.sql`, created by `pnpm db:new`. Describe the change (`add_providers`, `index_bookings_by_status`), not the ticket.

## Adding a migration

```bash
pnpm db:new add_providers
```

This creates `supabase/migrations/<timestamp>_add_providers.sql`. Write the SQL, following the conventions above, and add any new rules to `checks/schema.sql`.

## Applying migrations to dev

`apps/api/.env` must hold the dev project's `DATABASE_URL` (the session pooler URL, port 5432). Then:

```bash
pnpm db:push
```

This runs `supabase db push --db-url` with the URL from `apps/api/.env`, applies only the migrations the project has not seen, and records them in `supabase_migrations.schema_migrations`. The URL is never printed. Add `--dry-run` to list pending migrations without applying them. Push only after the PR's CI is green, and never reset, drop or truncate anything in a hosted project.

## Reference data and dev sample data

Crop categories, crops and the `app_config` placeholders (PRD 5.15) are in the `seed_reference_data` migration, so `pnpm db:push` delivers them everywhere. The config values are placeholders, and the description of each one the owner has not decided says "Unconfirmed placeholder (PRD 5.15)". Settling one is an update to its `app_config` row, not a new migration.

Sample providers and their owners for development are in `seeds/dev.sql` (decision 41). Every row is fake and marked as sample data. Load them into the dev project with:

```bash
pnpm db:seed:dev
```

This reads `DATABASE_URL` and `NODE_ENV` from `apps/api/.env`, refuses unless `NODE_ENV` is `development`, and runs the file in one transaction. It is safe to run again: rows that exist are skipped, and nothing is updated or deleted. The file refuses to run any other way, and `[db.seed]` in `config.toml` is off, so neither `db push` nor `db reset` loads it. Never run it against staging or production.

## How CI checks migrations

The `Migrations` job in `.github/workflows/ci.yml` starts a `supabase/postgres` service container, which has Supabase's roles, schemas and extensions. It applies every migration in order with the same `supabase db push` command, then runs `checks/schema.sql` with psql. The checks fail the job if:

- `postgis` is missing from the `extensions` schema
- an expected table, view or index is missing
- any table in `public` lacks RLS, has a policy, or grants anything to `anon` or `authenticated`
- defaults or the `updated_at` trigger are wrong
- `providers.location` is not `extensions.geography(Point,4326)` with a GiST index, or a valid provider at a real point fails to insert
- the crop categories, crops (with onions and a generic crop per category) or `app_config` keys, values and JSON types differ from the reference list, `deposit_percent` is not above `commission_rate`, the default search radius exceeds the maximum, or running the reference data migration again adds or changes a row
- a check constraint accepts a bad value (phone, `coldlink_id`, role, channel, location, OTP attempts, config key, category slug, crop shelf life and temperatures, and every provider enum, phone, capacity, price, temperature, rating, photo and verification rule)
- a user who owns a provider can be deleted
- a valid booking built from the PRD 6.1 worked example fails to insert, or a booking check accepts a bad status, code, unit, date range, rate or inconsistent amount, or `cancelled_by` without `cancelled`
- a `booking_events` row can be updated, deleted or truncated, even by `postgres`, or a booking with events can be deleted
- a payment, payout, rating, notification, action token, search log or reminder check accepts a bad value, or a unique key (booking code, Paystack reference, one payout and one rating per booking, token hash, one reminder of each kind per booking) accepts a duplicate
- a valid delivery partner, delivery request, draft listing or reservation fails to insert, or a check accepts a bad status, vehicle type, context type, phone, fee split, handover code, available quantity or reservation deposit, or a delivery request whose partner, `assigned_at`, `picked_up_at` or `delivered_at` disagrees with its status
- a `delivery_fee` payment can point to a delivery request that does not exist, or a paid delivery, a listing with reservations or a partner's user can be deleted
- `v_listing_price_observations` lacks `security_invoker`, or does not return the listing's crop, Lagos week, price and unit
- `provider_available_quantity` gets any scenario wrong: overlapping bookings add up, back-to-back bookings do not stack, the peak can fall mid-range, an unexpired `payment_pending` hold counts and an expired one does not, `rejected`, `expired`, `cancelled`, `completed` and `no_show` never count, a 1-day range, an over-booked provider floored at 0, and the errors for a bad range or an unknown provider
- `providers_within_radius` returns the wrong providers, order or distance in km, gets the radius boundary wrong, or accepts a bad latitude, longitude or radius
- either function does not use its index (`bookings_provider_capacity_idx`, `providers_location_idx`), counted with `enable_seqscan` off since `EXPLAIN` cannot see inside a function
- `anon` or `authenticated` can execute any non-trigger function in `public`, a new function gets a client grant by default, or the two functions are not `stable`, `security invoker` with an empty `search_path`
- `anon` or `authenticated` can read or write a table or the view, or RLS shows rows when privileges are granted back, including listings through the view

The job then loads `seeds/dev.sql` with the seed script twice and runs `checks/dev_seed.sql`. It fails if the script runs with `NODE_ENV=production` or the file runs without the script, the second run adds anything, the sample rows are not marked or not seven approved, one pending and one suspended, `providers_within_radius` from central Ibadan at the default radius does not return the approved sample providers nearest first, or a sample provider lacks its full capacity in `provider_available_quantity`.

The checks run in one transaction that is rolled back. The job has no secrets and never connects to a Supabase project.
