# Database

SQL migrations in `migrations/` are the source of truth for the schema (PRD 4.1). Supabase is used as managed Postgres; the Express API is the only client and connects with the service-role connection (PRD 4.4).

No step here needs Docker. Migrations are applied straight to a hosted Supabase project, and CI checks them in a throwaway Postgres.

## Conventions

- **Ids:** every table has `id uuid primary key default gen_random_uuid()`. `gen_random_uuid()` is built into Postgres 13+, so no extension is needed. The one exception is `app_config`, which is keyed by `key text primary key` because the API reads it by name.
- **Timestamps:** every table has `created_at timestamptz not null default now()` and `updated_at timestamptz not null default now()`. Store UTC; display in Africa/Lagos.
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

- **Constraints:** name check constraints `<table>_<column>_<rule>` (`users_phone_format`) so API errors can map them. Enum-like values match `packages/shared/src/enums.ts` exactly.
- **Money** is integer kobo in `bigint` (decision 16). **Extensions** go in the `extensions` schema (`postgis` is there).
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

## How CI checks migrations

The `Migrations` job in `.github/workflows/ci.yml` starts a `supabase/postgres` service container, which has Supabase's roles, schemas and extensions. It applies every migration in order with the same `supabase db push` command, then runs `checks/schema.sql` with psql. The checks fail the job if:

- `postgis` is missing from the `extensions` schema
- an expected table or index is missing
- any table in `public` lacks RLS, has a policy, or grants anything to `anon` or `authenticated`
- defaults or the `updated_at` trigger are wrong
- a check constraint accepts a bad value (phone, `coldlink_id`, role, channel, location, OTP attempts, config key)
- `anon` or `authenticated` can read or write a table, or RLS shows rows when privileges are granted back

The checks run in one transaction that is rolled back. The job has no secrets and never connects to a Supabase project.
