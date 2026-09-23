-- Immutable source snapshot for the service-specific FVS weights.
begin;

create function dialogo_private.valid_fvs_services(p_services jsonb)
returns boolean language plpgsql immutable set search_path = '' as $function$
declare item jsonb; labels text[] := '{}'; documents text[] := '{}';
begin
  if jsonb_typeof(p_services) is distinct from 'array' or jsonb_array_length(p_services) not between 1 and 500 then return false; end if;
  for item in select value from jsonb_array_elements(p_services) loop
    if jsonb_typeof(item) is distinct from 'object' or not (item ?& array['document','service','weight','label'])
      or (item - array['document','service','weight','label']) <> '{}'::jsonb
      or not dialogo_private.catalog_string(item->'document',1,200)
      or not dialogo_private.catalog_string(item->'service',1,1000)
      or not dialogo_private.catalog_string(item->'label',1,1200)
      or jsonb_typeof(item->'weight') is distinct from 'number'
      or (item->>'weight')::numeric not between 1 and 5
      or (item->>'label') <> ((item->>'document') || ' - ' || (item->>'service'))
      or item->>'label' = any(labels) then return false; end if;
    labels := array_append(labels,item->>'label');
    documents := array_append(documents,item->>'document');
  end loop;
  return true;
end;
$function$;
revoke all on function dialogo_private.valid_fvs_services(jsonb) from public,anon,authenticated,service_role;

create table public.audit_fvs_weight_revisions (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique check (version >= 1),
  revision_label text not null check (char_length(btrim(revision_label)) between 1 and 80),
  change_note text not null check (char_length(btrim(change_note)) between 1 and 2000),
  services jsonb not null check (dialogo_private.valid_fvs_services(services)),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  request_id uuid not null unique
);
alter table public.audit_fvs_weight_revisions enable row level security;
revoke all on public.audit_fvs_weight_revisions from public,anon,authenticated,service_role;
create trigger audit_fvs_weight_revisions_immutable before update or delete on public.audit_fvs_weight_revisions
  for each row execute function dialogo_private.reject_catalog_revision_mutation();
create trigger audit_fvs_weight_revisions_no_truncate before truncate on public.audit_fvs_weight_revisions
  for each statement execute function dialogo_private.reject_catalog_revision_mutation();

create function public.read_fvs_services(p_profile text)
returns jsonb language plpgsql stable security definer set search_path = '' as $function$
begin
  perform dialogo_private.lock_agenda_identity(auth.uid(),p_profile);
  if p_profile not in ('ADMINISTRATIVO','AUDITOR_QUALIDADE')
    or (p_profile = 'ADMINISTRATIVO' and not public.has_current_administrative_module('QUALIDADE'))
    or (p_profile = 'AUDITOR_QUALIDADE' and not exists (select 1 from public.access_grants g
      join public.access_works w on w.id=g.obra_id where g.auth_user_id=auth.uid()
        and g.perfil=p_profile and g.modulo='QUALIDADE' and w.ativo)) then
    raise exception using errcode='42501',message='quality_weight_reader_required';
  end if;
  return (select jsonb_build_object('id',id,'version',version,'label',revision_label,'services',services,'createdAt',created_at)
    from public.audit_fvs_weight_revisions order by version desc limit 1);
end;
$function$;
revoke all on function public.read_fvs_services(text) from public,anon,authenticated,service_role;
grant execute on function public.read_fvs_services(text) to authenticated;

insert into public.audit_fvs_weight_revisions(version,revision_label,change_note,services,created_by,created_at,request_id)
select 1,'Peso FVS — 23/09/2026','Pesos por documento de referência e serviço importados da planilha Peso FVS.',
  $json$[{"document":"FVS-001","service":"Colocação de KIT Porta pronta","weight":5,"label":"FVS-001 - Colocação de KIT Porta pronta"},{"document":"FVS-2A / FVS-2B / FVS -2C","service":"Alvenaria de vedação Bloco Cerâmico ou de Concreto","weight":5,"label":"FVS-2A / FVS-2B / FVS -2C - Alvenaria de vedação Bloco Cerâmico ou de Concreto"},{"document":"FVS-3A / FVS-3B / FVS-3C","service":"Estrutura de Concreto","weight":5,"label":"FVS-3A / FVS-3B / FVS-3C - Estrutura de Concreto"},{"document":"FVS-006","service":"Taliscas e contramarcos","weight":5,"label":"FVS-006 - Taliscas e contramarcos"},{"document":"FVS-6A","service":"Gesso liso sarrafeado","weight":5,"label":"FVS-6A - Gesso liso sarrafeado"},{"document":"FVS-6B","service":"Revestimento interno – Massa Interna","weight":5,"label":"FVS-6B - Revestimento interno – Massa Interna"},{"document":"FVS-008B","service":"Produção de Argamassa – revestimento Externo","weight":3,"label":"FVS-008B - Produção de Argamassa – revestimento Externo"},{"document":"FVS-008A1","service":"Produção de Argamassa - Contrapiso","weight":3,"label":"FVS-008A1 - Produção de Argamassa - Contrapiso"},{"document":"FVS-008A2","service":"Produção de Argamassa – Contrapiso Acústico","weight":3,"label":"FVS-008A2 - Produção de Argamassa – Contrapiso Acústico"},{"document":"FVS-008A3","service":"Produção de Argamassa – Revestimento Interno","weight":3,"label":"FVS-008A3 - Produção de Argamassa – Revestimento Interno"},{"document":"FVS-008A4","service":"Produção de Argamassa – Colante","weight":3,"label":"FVS-008A4 - Produção de Argamassa – Colante"},{"document":"FVS-008A5","service":"Produção de Argamassa – Assentamento Alvenaria","weight":3,"label":"FVS-008A5 - Produção de Argamassa – Assentamento Alvenaria"},{"document":"FVS-008A6","service":"Produção de Argamassa – Revestimento Piscina","weight":3,"label":"FVS-008A6 - Produção de Argamassa – Revestimento Piscina"},{"document":"FVS-9","service":"Locação de obra","weight":5,"label":"FVS-9 - Locação de obra"},{"document":"FVS-10 / FVS-10B","service":"Contrapiso e contrapiso acústico","weight":5,"label":"FVS-10 / FVS-10B - Contrapiso e contrapiso acústico"},{"document":"FVS-11/ FVS-12","service":"Piso cerâmico e Revestimento de paredes com peças cerâmicas","weight":5,"label":"FVS-11/ FVS-12 - Piso cerâmico e Revestimento de paredes com peças cerâmicas"},{"document":"FVS-13","service":"Revestimento externo em argamassa","weight":5,"label":"FVS-13 - Revestimento externo em argamassa"},{"document":"FVS-14","service":"Revestimento em pastilhas","weight":3,"label":"FVS-14 - Revestimento em pastilhas"},{"document":"FVS-16","service":"Piso em pedras naturais","weight":3,"label":"FVS-16 - Piso em pedras naturais"},{"document":"FVS-18","service":"Bancada de Pedra Natural","weight":4,"label":"FVS-18 - Bancada de Pedra Natural"},{"document":"FVS-19","service":"Colocação de batentes metálicos","weight":3,"label":"FVS-19 - Colocação de batentes metálicos"},{"document":"FVS-20","service":"Colocação de caixilho de alumínio","weight":4,"label":"FVS-20 - Colocação de caixilho de alumínio"},{"document":"FVS-23","service":"Forro de gesso","weight":4,"label":"FVS-23 - Forro de gesso"},{"document":"FVS-24","service":"Forro em placas de gesso acartonado","weight":4,"label":"FVS-24 - Forro em placas de gesso acartonado"},{"document":"FVS-25","service":"Pintura PVA e Acrílica","weight":4,"label":"FVS-25 - Pintura PVA e Acrílica"},{"document":"FVS-26","service":"Pintura em tinta esmalte","weight":4,"label":"FVS-26 - Pintura em tinta esmalte"},{"document":"FVS-27","service":"Impermeabilização Interna","weight":5,"label":"FVS-27 - Impermeabilização Interna"},{"document":"FVS-29","service":"Instalação de louças e metais sanitários","weight":4,"label":"FVS-29 - Instalação de louças e metais sanitários"},{"document":"FVS-30","service":"Sapata isolada","weight":5,"label":"FVS-30 - Sapata isolada"},{"document":"FVS-32A","service":"Fundação (Tubulão e Broca)","weight":5,"label":"FVS-32A - Fundação (Tubulão e Broca)"},{"document":"FVS-32B","service":"Fundação (Hélice Continua)","weight":5,"label":"FVS-32B - Fundação (Hélice Continua)"},{"document":"FVS-32C","service":"Fundação (Estaca Strauss)","weight":3,"label":"FVS-32C - Fundação (Estaca Strauss)"},{"document":"FVS-33","service":"Perfil Metálico","weight":5,"label":"FVS-33 - Perfil Metálico"},{"document":"FVS-34","service":"Parede de Diafragma","weight":5,"label":"FVS-34 - Parede de Diafragma"},{"document":"FVS-35","service":"Escavação","weight":5,"label":"FVS-35 - Escavação"},{"document":"FVS-36","service":"Compactação de Aterro","weight":5,"label":"FVS-36 - Compactação de Aterro"},{"document":"FVS-52","service":"Shaft’s Hidráulicos em drywall","weight":4,"label":"FVS-52 - Shaft’s Hidráulicos em drywall"},{"document":"FVS-47","service":"Instalação de gradil","weight":4,"label":"FVS-47 - Instalação de gradil"},{"document":"FVS-55","service":"Piscina","weight":5,"label":"FVS-55 - Piscina"},{"document":"FVS-37A","service":"Instalações Elétricas (Geral)","weight":4,"label":"FVS-37A - Instalações Elétricas (Geral)"},{"document":"FVS-38A","service":"Instalações Hidráulicas - Execução","weight":4,"label":"FVS-38A - Instalações Hidráulicas - Execução"},{"document":"FVS-39","service":"Impermeabilização com manta asfáltica","weight":5,"label":"FVS-39 - Impermeabilização com manta asfáltica"},{"document":"FVS-40","service":"Colocação de banheira","weight":3,"label":"FVS-40 - Colocação de banheira"},{"document":"FVS-41","service":"Lareira / Churrasqueira","weight":3,"label":"FVS-41 - Lareira / Churrasqueira"},{"document":"FVS - 42","service":"Tirantes","weight":5,"label":"FVS - 42 - Tirantes"},{"document":"FVS-48","service":"Alvenaria com embasamento","weight":5,"label":"FVS-48 - Alvenaria com embasamento"},{"document":"FVS-53","service":"Parede de Drywall","weight":4,"label":"FVS-53 - Parede de Drywall"},{"document":"PES.035 / FVS-50","service":"Piso Intertravado","weight":3,"label":"PES.035 / FVS-50 - Piso Intertravado"},{"document":"FVS 002B/ V05","service":"Alvenaria encunhamento","weight":5,"label":"FVS 002B/ V05 - Alvenaria encunhamento"},{"document":"PES.039 / FVS-057","service":"Piso armado subsolo","weight":5,"label":"PES.039 / FVS-057 - Piso armado subsolo"},{"document":"FVS-058","service":"Muro externos","weight":5,"label":"FVS-058 - Muro externos"}]$json$::jsonb,'13044e3f-e8d2-4b4b-9981-22a8de22c610','2026-09-23T18:00:00-03:00','f7500000-2026-4923-8000-000000000001'
where exists (select 1 from auth.users where id='13044e3f-e8d2-4b4b-9981-22a8de22c610');

comment on table public.audit_fvs_weight_revisions is 'Append-only snapshots of the Peso FVS service list used by Quality audit scoring.';
commit;
