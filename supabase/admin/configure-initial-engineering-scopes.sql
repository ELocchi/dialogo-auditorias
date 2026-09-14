-- Controlled DEV operation: add Equipe da obra to the designated initial
-- account while preserving Coordenação and the same 21 existing work scopes.
-- Run only after migration 004 and read-only verification of the current account,
-- grants and immutable initial profile decision. No API/browser invocation.
-- The procedure checks all 84 grants against the earlier immutable snapshot;
-- it only updates the activity array and appends one separate history entry.
begin;
select dialogo_private.configure_initial_engineering_scopes(
  '13044e3f-e8d2-4b4b-9981-22a8de22c610'::uuid,
  'emanuel.locchi@dialogo.com.br',
  array[
    'dcd9e7b6-76b1-4a2d-8e0d-a94ee41416d3', -- Alameda Tatuapé
    'ce00857c-9f37-4617-86ac-0f20245c355b', -- Auge Resort Tatuapé
    'be89e616-eae1-4827-afc2-117b7a61c2f0', -- Bosque Diálogo Jd. Prudência
    '0d4d4851-007b-4fdc-a979-295ff53114fe', -- Bosque Santa Cruz
    '6c735db0-abd6-4ed7-b66e-6c253ed8a880', -- BoulevarDiálogo
    '27acb45d-4b58-4f81-9c8e-17f1437626bb', -- Club Station Parque Vila Ema
    'e2401b69-641b-448c-80aa-6714c13e2223', -- Grand High Alto da Boa Vista
    'ff80771d-9b25-4dfc-8ce3-64125c9778c0', -- GranDiálogo Parque da Mooca
    '851dba16-7797-4d05-a270-0e772b86904d', -- Inspire Diálogo
    '59f66e2b-c79c-459d-8daa-1857d93fa5da', -- Landmark Santa Cruz
    'd84b6c27-9283-4837-8ad8-14ab32c7a912', -- Monã Anália Franco
    'abc66a2a-bac1-4972-8e75-18fc15f0b9eb', -- Monã Mooca
    'a41b4c16-dfb0-47c4-af35-512920cc576e', -- Monã The Grand Lodge
    '388d550f-3b36-4cee-afa3-cb8225238aef', -- Okena Moema
    '0cbc3dde-005c-4490-9076-4aed28529a74', -- Parque Diálogo Vila Ema
    '299ddf3f-3c1a-4408-a458-5261eb6db0fc', -- Praça Diálogo Patriarca
    '61030465-bbec-4aae-adbe-786d1a504f01', -- Prisma Vila Ema
    '0478b0da-2a4d-4fca-92ab-57b1d5760282', -- The Grand Padre Adelino
    'fc284d12-1d3d-4524-8914-181b2378b374', -- Vértice Butantã
    'a5a5a0d6-2d83-48d6-ac47-dcf018fe870e', -- Vitrine Tatuapé
    'e7112a56-5be6-4422-a6c5-c9a8f1d5395a'  -- Walk Belém
  ]::uuid[],
  'Inclusão de Engenharia — Equipe da obra na conta inicial de Emanuel Locchi, autorizada pelo titular, mantendo Engenharia — Coordenação, os quatro perfis e exatamente as mesmas 21 obras previamente autorizadas. Operação controlada por postgres no Supabase DEV, sem alterar concessões, bootstrap ou decisões anteriores.'
) as initial_engineering_scopes_decision_id;
commit;
