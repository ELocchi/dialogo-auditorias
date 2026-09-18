-- Private photos for follow-up findings. Object paths are scoped to the owner.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('follow-up-photos', 'follow-up-photos', false, 3145728, array['image/jpeg', 'image/png']);

create policy "follow_up_photos_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'follow-up-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}_[0-9a-f-]{36}\.(jpg|png)$');

create policy "follow_up_photos_read_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'follow-up-photos'
    and (storage.foldername(name))[1] = auth.uid()::text);

create policy "follow_up_photos_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'follow-up-photos'
    and (storage.foldername(name))[1] = auth.uid()::text);

commit;
