-- Test fixture requested for validating the orientative report screen and PDF.
-- It is inserted only when the matching confirmed follow-up visit exists.
begin;

do $fixture$
declare
  v_visit public.audit_visits%rowtype;
begin
  select v.*
    into v_visit
  from public.audit_visits v
  where v.obra_id = 'dcd9e7b6-76b1-4a2d-8e0d-a94ee41416d3'::uuid
    and v.visit_kind = 'ACOMPANHAMENTO'
    and v.modulo = 'SEGURANCA'
    and v.data_prevista = date '2026-09-30'
    and v.confirmation_status = 'confirmed'
    and v.cancelled_at is null
  order by v.created_at desc, v.id desc
  limit 1;

  if found and not exists (
    select 1
    from public.follow_up_reports r
    where r.visit_id = v_visit.id
      and r.title = 'Relatório orientativo — Teste'
  ) then
    insert into public.follow_up_reports (
      visit_id,
      auditor_auth_user_id,
      title,
      participants,
      guidance,
      decisions,
      findings
    ) values (
      v_visit.id,
      v_visit.auditor_auth_user_id,
      'Relatório orientativo — Teste',
      'Emanuel Locchi e equipe responsável pela obra',
      'Foi realizada uma visita orientativa de teste para verificar o registro dos participantes, dos assuntos tratados, das decisões e dos apontamentos de Segurança do Trabalho.',
      'A equipe deverá conferir as correções propostas, registrar as providências adotadas e acompanhar os prazos definidos para cada apontamento.',
      jsonb_build_array(
        jsonb_build_object(
          'id', gen_random_uuid(),
          'location', 'Acesso principal da obra',
          'description', 'Área de circulação com sinalização preventiva incompleta durante a inspeção de teste.',
          'correction', 'Completar a sinalização, isolar o trecho necessário e verificar diariamente as condições do acesso.',
          'serious', true
        ),
        jsonb_build_object(
          'id', gen_random_uuid(),
          'location', 'Área de apoio',
          'description', 'Materiais armazenados fora da identificação prevista para o setor.',
          'correction', 'Organizar os materiais por categoria e manter a identificação visível no local.',
          'serious', false
        )
      )
    );
  end if;
end;
$fixture$;

commit;
