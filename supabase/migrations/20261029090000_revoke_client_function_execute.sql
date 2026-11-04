-- Postgres grants EXECUTE on every new function to PUBLIC, and Supabase also grants it to anon and
-- authenticated for functions in public, which the Data API then exposes as RPC endpoints. Stop the
-- Supabase grants for functions created by postgres, as for tables, so later functions start
-- without them.
--
-- The PUBLIC grant is a global default, and a per-schema default can only add to it, so it cannot
-- be removed here without also changing extension functions postgres creates elsewhere. Each
-- function revokes it itself instead, and CI fails if anon or authenticated can call any function
-- in public that is not a trigger function.
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;
