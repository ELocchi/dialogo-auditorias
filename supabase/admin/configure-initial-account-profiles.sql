-- Controlled DEV operation authorized by Emanuel Locchi on 2026-09-13:
-- all four profiles, Engenharia/Coordenação, both modules on exactly 21 works.
-- Execute only after migration 003 and read-only confirmation of these IDs.
-- IDs read from the 21 existing active works on 2026-09-13; no name matching or
-- implicit grant to works created later. Any absent/inactive ID aborts atomically.
-- No Auth mutation, repeated bootstrap, request rewrite or client self-approval.
begin;
select dialogo_private.configure_initial_account_profiles(
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
  'Ajuste inicial autorizado explicitamente por Emanuel Locchi em 13/09/2026: Administrativo, Auditor de Segurança, Auditor de Qualidade e Engenharia como Coordenação nas 21 obras existentes; executado por operador postgres no Supabase DEV, preservando o bootstrap e o histórico anteriores.'
) as initial_profiles_decision_id;
commit;
