-- Test works: real, editable works used only for automated and manual test rounds in production.
-- They stay out of the ranking (and so out of the ranking PDFs); the workspace exposes the flag so the
-- client can leave them out of the "NÃO AVALIADA" lists. Idempotent, like 20261029000100.
begin;
alter table public.access_works add column if not exists teste boolean not null default false;
comment on column public.access_works.teste is 'Obra usada só para testes da plataforma; fora do ranking e das exportações.';

do $$
declare v_def text;
  v_columns constant text := 'select w.id,w.nome,w.ativo,w.cidade,w.uf,w.logradouro,w.numero,w.responsavel_tecnico,w.coordenacao';
  v_published constant text := 'from public.published_audits a
      join public.access_works w on w.id = a.work_id';
  v_historical constant text := 'from public.historical_ranking_scores h
      join public.access_works w on w.id = h.work_id';
begin
 v_def := pg_get_functiondef('public.read_current_access_workspace(text,text,text)'::regprocedure);
 if position('w.teste' in v_def) = 0 then
  if position(v_columns in v_def) = 0 then raise exception 'read_current_access_workspace column list not found'; end if;
  execute replace(v_def, v_columns, v_columns || ',w.teste');
 end if;

 v_def := pg_get_functiondef('public.read_global_audit_ranking()'::regprocedure);
 if position('not w.teste' in v_def) = 0 then
  if position(v_published in v_def) = 0 or position(v_historical in v_def) = 0 then
   raise exception 'read_global_audit_ranking sources not found';
  end if;
  v_def := replace(v_def, v_published, v_published || ' and not w.teste');
  execute replace(v_def, v_historical, v_historical || ' and not w.teste');
 end if;
end $$;
notify pgrst, 'reload schema';
commit;
