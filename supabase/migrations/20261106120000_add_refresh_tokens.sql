-- Refresh tokens for API sessions (PRD 7.1). Only a SHA-256 hash of each token is stored. Every
-- refresh replaces the token with a new one in the same family, linked by rotated_from_id; a
-- revoked token presented again means it was copied, and the whole family is revoked.

create table public.refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  -- Sessions go with their user; users are normally deactivated, not deleted (decision 25).
  user_id uuid not null references public.users on delete cascade,
  -- Shared by every token descended from one sign-in.
  family_id uuid not null,
  -- The token this one replaced. A token is replaced at most once.
  rotated_from_id uuid unique references public.refresh_tokens on delete set null,
  token_hash text not null unique
    constraint refresh_tokens_token_hash_format check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint refresh_tokens_expires_after_created check (expires_at > created_at)
);

create index refresh_tokens_family_id_idx on public.refresh_tokens (family_id);
create index refresh_tokens_user_id_idx on public.refresh_tokens (user_id);

create trigger refresh_tokens_set_updated_at
  before update on public.refresh_tokens
  for each row execute function public.set_updated_at();

-- Deny by default (decision 21); default privileges already leave it without client grants.
alter table public.refresh_tokens enable row level security;
