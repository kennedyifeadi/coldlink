-- The Storage bucket for facility photos (PRD 7.2, 10), with the same limits the API checks
-- (MAX_PROVIDER_PHOTO_BYTES and providerPhotoTypes in packages/shared). Public, so a photo's URL
-- loads without a token; only the API writes, with the service-role key, because storage.objects
-- has RLS on and no policies for clients.
--
-- The Storage service creates storage.buckets' limit columns in its own migrations, which a plain
-- supabase/postgres container (CI) never runs. There the bucket is skipped; the API's tests use a
-- fake storage and never reach it.

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'storage'
      and table_name = 'buckets'
      and column_name = 'allowed_mime_types'
  ) then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      'provider-photos',
      'provider-photos',
      true,
      5242880,
      array['image/jpeg', 'image/png', 'image/webp']
    )
    on conflict (id) do nothing;
  else
    raise notice 'storage.buckets has no limit columns here; provider-photos bucket not created';
  end if;
end;
$$;
