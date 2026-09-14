-- Authorized by Emanuel Locchi on 2026-09-14: Luiza Dutra receives the same
-- current four profiles, both Engineering activities and 21 works as Emanuel.
-- Apply B.6 first and verify the existing approved identities and original grants.
-- This appends one operator decision; preserves the original approval and grants;
-- never changes Auth, passwords, confirmation, unrelated accounts or future works.
begin;
select dialogo_private.configure_luiza_general_access(
  '1f60b2cc-8028-453e-a6de-9312aa5a67cb'::uuid,
  'luiza.dutra@dialogo.com.br',
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
  'Ampliação dos acessos gerais de Luiza Dutra autorizada expressamente por Emanuel Locchi em 14/09/2026: mesmos quatro perfis, Engenharia como Equipe da obra e Coordenação, e mesmas 21 obras e 84 combinações perfil/obra/módulo da conta emanuel.locchi@dialogo.com.br. Executada por operador postgres, preservando aprovação original, permissões anteriores e histórico. Sem concessões automáticas a obras futuras.'
) as general_access_decision_id;
commit;
