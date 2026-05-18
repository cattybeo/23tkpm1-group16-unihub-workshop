-- Storage policies cho bucket workshop-assets.
-- READ public đã có sẵn từ trước. Bổ sung INSERT/UPDATE/DELETE giới hạn role=organizer.
-- FE supabase-js (anon key + JWT user) sẽ pass auth.uid() và đi qua các policy này.

drop policy if exists "workshop_assets_insert_organizer" on storage.objects;
drop policy if exists "workshop_assets_update_organizer" on storage.objects;
drop policy if exists "workshop_assets_delete_organizer" on storage.objects;

create policy "workshop_assets_insert_organizer"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'workshop-assets'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'organizer'
    )
  );

create policy "workshop_assets_update_organizer"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'workshop-assets'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'organizer'
    )
  )
  with check (
    bucket_id = 'workshop-assets'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'organizer'
    )
  );

create policy "workshop_assets_delete_organizer"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'workshop-assets'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'organizer'
    )
  );
