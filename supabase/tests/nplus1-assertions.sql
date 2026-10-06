-- Run only after nplus1.sql in the disposable benchmark database.
select pg_temp.assert_true(not has_function_privilege('anon','public.read_follow_up_photo_batch(uuid[],text,text,text)','EXECUTE'),'Anonymous cannot execute batch');
set local role authenticated;
select pg_temp.assert_true(jsonb_array_length(public.read_follow_up_photo_batch(array[pg_temp.id(1001),pg_temp.id(1002)],'AUDITOR_QUALIDADE')->'photos')=2,'Requested photos only');
select pg_temp.assert_true(jsonb_array_length(public.read_follow_up_photo_batch(array[pg_temp.id(1001),pg_temp.id(1001)],'AUDITOR_QUALIDADE')->'visitIds')=1,'Deduplicate visit IDs');
select pg_temp.assert_true(not (public.read_follow_up_photo_batch(array[pg_temp.id(1001),pg_temp.id(9999)],'AUDITOR_QUALIDADE')->>'available')::boolean,'Mixed authorized/unknown IDs fail closed');
select pg_temp.expect_error($s$select public.read_follow_up_photo_batch(array(select pg_temp.id(n) from generate_series(1001,1051)n),'AUDITOR_QUALIDADE')$s$,'22023');
select pg_temp.expect_error($s$select public.read_follow_up_photo_batch(array[null::uuid],'AUDITOR_QUALIDADE')$s$,'22023');
select pg_temp.expect_error($s$select public.read_follow_up_photo_batch(array[pg_temp.id(1001)],'AUDITOR_SEGURANCA')$s$,'42501');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.id(1)::text,true);
update public.audit_visits set cancelled_at=now(),cancelled_by=pg_temp.id(1) where id=pg_temp.id(1002);
select set_config('request.jwt.claim.sub',pg_temp.id(2)::text,true);
select pg_temp.assert_true(not (public.read_follow_up_photo_batch(array[pg_temp.id(1002)],'AUDITOR_QUALIDADE')->>'available')::boolean,'Cancelled visit denied');
delete from storage.objects where id=pg_temp.id(4004);
select pg_temp.assert_true(public.read_follow_up_photo_batch(array[pg_temp.id(1004)],'AUDITOR_QUALIDADE')->'photos'='[]'::jsonb,'Authorized empty visit is distinct from denied');
-- Preserve user-selected order, snapshots and idempotency of a full report save.
select set_config('dialogo.test.old',pg_temp.save_before('AUDITOR_QUALIDADE',pg_temp.id(101),current_date,'Título','','Orientações','',array[pg_temp.id(2003),pg_temp.id(2001)],pg_temp.id(901))::text,true);
select set_config('dialogo.test.new',public.save_standalone_follow_up_report('AUDITOR_QUALIDADE',pg_temp.id(101),current_date,'Título','','Orientações','',array[pg_temp.id(2003),pg_temp.id(2001)],pg_temp.id(902))::text,true);
select pg_temp.assert_true((select a.findings=b.findings and a.photos=b.photos from public.standalone_follow_up_reports a,public.standalone_follow_up_reports b where a.id=current_setting('dialogo.test.old')::uuid and b.id=current_setting('dialogo.test.new')::uuid),'Old and new snapshots match with reversed selection');
select pg_temp.assert_true(public.save_standalone_follow_up_report('AUDITOR_QUALIDADE',pg_temp.id(101),current_date,'Título','','Orientações','',array[pg_temp.id(2003),pg_temp.id(2001)],pg_temp.id(902))::text=current_setting('dialogo.test.new'),'Retry keeps same immutable report');
select pg_temp.expect_error($s$select public.save_standalone_follow_up_report('AUDITOR_QUALIDADE',pg_temp.id(101),current_date,'Título','','Orientações','',array[pg_temp.id(2001),pg_temp.id(2001)],pg_temp.id(903))$s$,'22023');
select pg_temp.expect_error($s$select public.save_standalone_follow_up_report('AUDITOR_QUALIDADE',pg_temp.id(101),current_date,'Título','','Orientações','',array[pg_temp.id(9999)],pg_temp.id(903))$s$,'42501');
delete from storage.objects where id=pg_temp.id(5004);
select pg_temp.expect_error($s$select public.save_standalone_follow_up_report('AUDITOR_QUALIDADE',pg_temp.id(101),current_date,'Título','','Orientações','',array[pg_temp.id(2004)],pg_temp.id(903))$s$,'23514');
select pg_temp.assert_true(not exists(select 1 from public.standalone_follow_up_reports where request_id=pg_temp.id(903)),'Failed batches never publish partial reports');
select pg_temp.expect_error($s$select pg_temp.evidence_after('{"evidenceFiles":["1.jpg","missing.jpg"],"reportFileName":"201.jpg"}')$s$,'23514');
select pg_temp.expect_error($s$select pg_temp.evidence_after('{"evidenceFiles":["1.jpg"],"reportFileName":null}')$s$,'23514');
-- A legacy record may legitimately reuse a stored file; lock distinct paths.
update public.follow_up_work_findings set photo_file_name=(select photo_file_name from public.follow_up_work_findings where id=pg_temp.id(2003)) where id=pg_temp.id(2002);
select pg_temp.assert_true(public.save_standalone_follow_up_report('AUDITOR_QUALIDADE',pg_temp.id(101),current_date,'Título','','Orientações','',array[pg_temp.id(2002),pg_temp.id(2003)],pg_temp.id(904)) is not null,'Shared existing file remains accepted');
-- Revocation is observed on the next request; metadata is not cached server-side.
delete from public.access_grants where auth_user_id=pg_temp.id(2);
set local role authenticated;
select pg_temp.assert_true(not (public.read_follow_up_photo_batch(array[pg_temp.id(1001)],'AUDITOR_QUALIDADE')->>'available')::boolean,'Revoked grants denied on next batch');
reset role;
rollback;
