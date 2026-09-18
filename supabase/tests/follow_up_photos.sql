-- Disposable Storage adapter only; checks the migration's bucket and owner policies.
begin;
do $test$ begin
  if current_setting('dialogo.test_database', true) is distinct from 'isolated-local'
    or session_user <> 'postgres' or exists (select 1 from auth.users) then
    raise exception 'Requires empty disposable local database';
  end if;
end $test$;

do $test$ begin
  if not exists (select 1 from storage.buckets where id = 'follow-up-photos'
    and not public and file_size_limit = 3145728
    and allowed_mime_types = array['image/jpeg','image/png']) then
    raise exception 'Private photo bucket configuration differs';
  end if;
end $test$;

set local role authenticated;
set local "request.jwt.claim.sub" = 'd1a80000-0000-4000-8000-000000000001';
insert into storage.objects(id,bucket_id,name) values
  ('d1a80000-0000-4000-8000-000000000004','follow-up-photos',
   'd1a80000-0000-4000-8000-000000000001/d1a80000-0000-4000-8000-000000000002/d1a80000-0000-4000-8000-000000000003_d1a80000-0000-4000-8000-000000000004.jpg');
do $test$ begin
  if (select count(*) from storage.objects) <> 1 then raise exception 'Owner cannot read photo'; end if;
end $test$;
set local "request.jwt.claim.sub" = 'd1a80000-0000-4000-8000-000000000005';
do $test$ begin
  if (select count(*) from storage.objects) <> 0 then raise exception 'Other user can read photo'; end if;
end $test$;
reset role;
rollback;
