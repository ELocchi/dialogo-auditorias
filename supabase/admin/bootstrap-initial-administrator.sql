-- Controlled DEV deployment operation, separate from the schema migration.
-- Existing identity verified read-only on 2026-09-13. Never run as an API role.
-- No Auth UPDATE, password reset, new account, email, or declared-data rewrite.
-- The private function checks this UUID + exact email + confirmation + pending
-- request and records BOOTSTRAP once. A repeated call MUST fail, never overwrite.
begin;
select dialogo_private.bootstrap_first_administrator(
  '13044e3f-e8d2-4b4b-9981-22a8de22c610'::uuid,
  'emanuel.locchi@dialogo.com.br',
  'Bootstrap autorizado por Emanuel Locchi para sua conta existente no Supabase DEV; primeira concessão administrativa do Diálogo Auditorias em 13/09/2026.'
) as bootstrap_decision_id;
commit;
