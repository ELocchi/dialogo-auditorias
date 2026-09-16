-- B.9: create a work with its optional details in one transaction.
-- Existing IDs, access grants and work revisions remain unchanged.
begin;

create function public.create_access_work_full(p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $function$
declare
  v_data jsonb;
  v_id uuid;
begin
  -- The existing RPC locks and verifies current Administrative authority,
  -- supplies created_by from auth.uid(), and enforces unique work names.
  v_data := dialogo_private.normalize_work_details(p_data);
  v_id := public.create_access_work(v_data ->> 'nome');
  update public.access_works set
    logradouro = v_data ->> 'logradouro', numero = v_data ->> 'numero',
    complemento = v_data ->> 'complemento', bairro = v_data ->> 'bairro',
    cidade = v_data ->> 'cidade', uf = v_data ->> 'uf', cep = v_data ->> 'cep',
    responsavel_tecnico = v_data ->> 'responsavel_tecnico',
    registro_tecnico = v_data ->> 'registro_tecnico',
    coordenacao = v_data ->> 'coordenacao', observacoes = v_data ->> 'observacoes',
    equipe_obra = v_data -> 'equipe_obra'
  where id = v_id;
  return v_id;
end;
$function$;

revoke all on function public.create_access_work_full(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.create_access_work_full(jsonb) to authenticated;
comment on function public.create_access_work_full(jsonb) is
  'Authenticated current-Administrator RPC. Creates one active work with normalized optional details atomically; no user accounts or access grants are created.';

commit;
