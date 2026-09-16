-- Authorized on 2026-09-16: mirror Emanuel's current access to Ibrahim.
-- The original approval and all previous history remain immutable.
begin;

alter table public.access_decisions drop constraint access_decisions_actor_check;
alter table public.access_decisions add constraint access_decisions_actor_check check (
  (decision_type = 'BOOTSTRAP' and actor_auth_user_id is null
    and actor_database_role is not distinct from 'postgres' and perfil = 'ADMINISTRATIVO'
    and atuacao_engenharia is null and grants_snapshot = '[]'::jsonb
    and before_access_snapshot is null
    and (perfis is null or perfis = array['ADMINISTRATIVO']::text[]))
  or (decision_type = 'APROVACAO' and actor_auth_user_id is not null
    and actor_auth_user_id <> auth_user_id and actor_database_role is null
    and before_access_snapshot is null)
  or (decision_type = 'AJUSTE_PERFIS_INICIAL' and actor_auth_user_id is null
    and actor_database_role is not distinct from 'postgres' and perfil = 'ADMINISTRATIVO'
    and perfis is not null and perfis = array['ADMINISTRATIVO', 'AUDITOR_SEGURANCA',
      'AUDITOR_QUALIDADE', 'ENGENHARIA']::text[]
    and atuacao_engenharia is not distinct from 'COORDENACAO' and before_access_snapshot is not null)
  or (decision_type = 'AJUSTE_ATUACAO_INICIAL' and actor_auth_user_id is null
    and auth_user_id = '13044e3f-e8d2-4b4b-9981-22a8de22c610'::uuid
    and actor_database_role is not distinct from 'postgres' and perfil = 'ADMINISTRATIVO'
    and perfis is not null and perfis = array['ADMINISTRATIVO', 'AUDITOR_SEGURANCA',
      'AUDITOR_QUALIDADE', 'ENGENHARIA']::text[]
    and atuacao_engenharia is not distinct from 'COORDENACAO'
    and atuacoes_engenharia is not null
    and atuacoes_engenharia = array['EQUIPE_OBRA', 'COORDENACAO']::text[]
    and before_access_snapshot is not null and jsonb_array_length(grants_snapshot) = 84)
  or (decision_type = 'AJUSTE_ACESSOS_GERAIS' and actor_auth_user_id is null
    and auth_user_id in ('1f60b2cc-8028-453e-a6de-9312aa5a67cb'::uuid,
      'f482050c-0c13-4ef1-addb-14699cfc656c'::uuid)
    and actor_database_role is not distinct from 'postgres' and perfil = 'ADMINISTRATIVO'
    and perfis is not null and perfis = array['ADMINISTRATIVO', 'AUDITOR_SEGURANCA',
      'AUDITOR_QUALIDADE', 'ENGENHARIA']::text[]
    and atuacao_engenharia is not distinct from 'COORDENACAO'
    and atuacoes_engenharia is not null
    and atuacoes_engenharia = array['EQUIPE_OBRA', 'COORDENACAO']::text[]
    and before_access_snapshot is not null and jsonb_array_length(grants_snapshot) = 84)
  or (decision_type in ('VINCULO_OBRA', 'DESVINCULO_OBRA')
    and actor_auth_user_id is not null and actor_database_role is null
    and before_access_snapshot is null)
);

commit;
