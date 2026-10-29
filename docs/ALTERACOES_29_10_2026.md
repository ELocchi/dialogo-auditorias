# Alterações de 29/10/2026 — pendentes de commit e deploy

Rodada de ajustes pedida pelo Emanuel. Tudo está no diretório de trabalho da branch `main`, **sem commit**. O deploy (push na `main` → Render publica sozinho) depende de um passo no Supabase descrito no fim.

## 1. Alterações

### 1.1 Apontamentos das auditorias: ✓/× colorido no status
- Na lista "Apontamentos das auditorias" (e na aba Apontamentos da engenharia), o status mostra ícone e cor: × vermelho (Não conforme / nota 0), ! laranja (parcial / nota 5), ✓ verde (Conforme / 10), — cinza (N/A). Item grave: × vermelho com "Item grave".
- Corrige o "Não conforme" que aparecia em verde.
- Arquivos: `src/app/components/engineering-resource-panels.tsx` e `.module.css`.

### 1.2 PDF da auditoria (Qualidade)
- **✓/× ao lado dos itens não quantitativos**, à esquerda da nota do item.
- **Nota do grupo = soma** dos resultados dos itens sobre a soma dos pesos aplicáveis (ex.: "1,63 / 3,00"), no lugar de "x / 10". N/A e itens sem resposta não entram. Legenda do sumário: "GRUPOS: SOMA DOS RESULTADOS / SOMA DOS PESOS APLICÁVEIS". A nota final e o relatório de Segurança não mudam.
- **Fotos clicáveis**: no PDF publicado cada foto leva a `/api/audits/<id>/photos/<arquivo>` (rota protegida: exige login e acesso à auditoria). Na prévia, o link passou a usar o endereço completo. O link usa `APP_URL`. O PDF não consegue forçar nova guia; no Chrome/Edge, Ctrl+clique abre em outra guia. PDFs já publicados continuam sem link.
- **Fotos que não cabem continuam na página seguinte**: a nova página abre com o título do grupo (regra mantida), o item com "CONTINUAÇÃO" e o rótulo da seção. Linha de fotos nunca é cortada. Vale também para "Itens verificados" e textos longos.
- Arquivos: `src/lib/pdf/audit-report.ts`, `src/lib/pdf/audit-format.ts` (`qualityGroupTotalLabel`), `src/domain/audit-draft.ts` (`calculateQualityGroupTotals`), `src/lib/publications/service.ts`, `src/lib/pdf/run-job.ts`, `src/lib/auth/site-url.ts` (`applicationUrl`), `scripts/test-pdf-worker.mjs` (legenda).

### 1.3 Tela de revisão da auditoria
- Nota do grupo como soma, igual ao PDF, e legenda atualizada. A lista de itens do preenchimento já somava e não mudou.
- Arquivo: `src/app/components/audit-workspace.tsx`.

### 1.4 Preenchimento: itens quantitativos incompletos (alteração que já estava no arquivo)
- Já existia, sem commit, em `audit-workspace.tsx` antes desta rodada; o Emanuel autorizou incluir no deploy.
- Item quantitativo só conta como respondido com todas as verificações completas (nome, Conforme/Não conforme e, em FVS, serviço com peso); mensagem do que falta em cada verificação; caixa "Para revisar, complete: 01.04, …" com códigos clicáveis; "Incompleto" na lista de itens.
- Faltavam os estilos; criados em `src/app/audit-workspace.css` (`.pending-items`, `.quantity-check-issue`, `.link-button`).

### 1.5 Agenda: acompanhamentos passados saem da lista
- Acompanhamentos de dias anteriores a hoje (horário de São Paulo) somem da lista "Visitas agendadas" e do contador. Continuam no calendário para consulta. Auditorias passadas permanecem. Nada é apagado do banco (relatórios de acompanhamento dependem do registro da visita).
- Arquivo: `src/app/components/visit-agenda.tsx` (`scheduledListVisits`).

### 1.6 Ranking das Obras: exportar em PDF (Administrativo)
- Botão de download ao lado do título "Ranking das Obras", só no Painel administrativo. Exporta o que está na tela (mensal ou anual, período escolhido), Segurança e Qualidade lado a lado, com logo; continua em outras páginas se necessário. Arquivo: "Ranking das Obras - 2026-10.pdf".
- Arquivos: `src/app/components/admin-monthly-ranking.tsx` e `.module.css`, `src/lib/pdf/ranking-report.ts` (novo), `src/app/components/prototype-workspace.tsx` (`exportable={admin}`).

### 1.7 Chamado de alteração de auditoria publicada
Decisões do Emanuel:
- O auditor dono, no cartão recolhível de "Auditorias publicadas", clica em "Solicitar alteração", escolhe o item e escreve o motivo. Um chamado aberto por auditoria.
- O Administrativo da disciplina (GERAL vale para as duas) aceita ou recusa (recusa exige motivo), pelo sino e pelo cartão em "Relatórios publicados".
- Aceito: o Administrativo edita **só a observação do item do chamado** (e as observações dos itens verificados dele) e clica em "Publicar novamente". Respostas, notas, fotos e pontuação não mudam. Novo PDF pelo mesmo gerador.
- Plano de ação **publicado** bloqueia o chamado. Plano em rascunho é reconstruído com os novos apontamentos, mantendo ação, responsável e datas.
- O PDF e o conteúdo anteriores ficam no histórico (`published_audit_versions`), com quem pediu, quem decidiu e quando; o PDF antigo continua acessível.
- O auditor é avisado no sino quando aceito, recusado (com o motivo) e republicado.
- **Exceção à regra D03 do ESCOPO** (relatório publicado imutável): só as observações do item do chamado, com histórico.

Implementação:
- Migração: `supabase/migrations/20261030000100_audit_change_requests.sql`. Reversão: `supabase/reversoes/20261030000100_audit_change_requests.sql` (recusa rodar se já houver republicação).
- Banco: `published_audits.content_revision`; tabelas `audit_change_requests` e `published_audit_versions` (RLS, sem escrita direta); trigger de imutabilidade substituído por `guard_published_audit_mutation`, que só deixa passar a republicação controlada; funções `request_audit_change`, `decide_audit_change`, `read_audit_change_requests`, `read_audit_change_items`, `read_audit_change_source`, `republish_audit_change`, `read_published_audit_version_report`; `can_read_published_audit_file` aceita PDFs anteriores; fingerprint do resumo passou a `audit-overview-v3`.
- Código: `src/domain/audit-change.ts`, `src/lib/audits/change-requests.ts`, rotas em `src/app/api/audits/change-requests/` e `src/app/api/audits/[auditId]/change-requests/`, tela `src/app/components/audit-change-request.tsx` e `.module.css`; ajustes em `prototype-workspace.tsx`, `prototype-workspace.module.css`, `prototype-app.tsx` (sino, consulta a cada minuto), `auth/AdminNotifications.tsx` (4 tipos novos), `src/lib/audits/service.ts` e `src/app/api/audits/[auditId]/report/route.ts` (parâmetro `versao` para PDFs anteriores).
- Testes: `supabase/tests/audit_change_requests.sql` (via `scripts/test-access-database.mjs --audit-change-only`) e `scripts/test-audit-change-requests.mjs` (incluído em `npm run test:publication`; `package.json` alterado).
- Republicação síncrona: pode levar dezenas de segundos em auditorias com muitas fotos. O rascunho do auditor mantém as observações antigas (os relatórios usam o conteúdo publicado).

## 2. Testes (29/10/2026)
- `tsc --noEmit`, `eslint` (0 erros; 2 avisos antigos) e `next build --webpack` passam.
- Chamado: suíte SQL PASS (inclui aplicar, reverter e reaplicar a migração); `test:publication` 23/23.
- PDF 6/6, operational-improvements 7/7, published-audits 17/17, workspace-sections 9/9, audit-photo-store 7/7, audit-navigation 1/1, audit-context 23/23, standalone-reports 19/19, work-details 18/18, profile-workspace 38/38, access 17/17, access-administration 69/69, ranking 20/20, calendar 8/8, jobs 5/5, reference-documents 18/18.
- Falhas **já existentes antes desta rodada** (conferidas numa cópia limpa do commit `d204811`, mesmos números): catalog-revisions 2, lists 1, auth 1 (`next/navigation` sem `unstable_rethrow` no teste de confirmação de e-mail), agenda 1 e performance 1 (ambas "short and empty lists do not show unnecessary page controls").
- Rodar `npm run test:jobs` altera `docs/evidence/jobs-20261006/integration.json`; restaurar com `git checkout -- docs/evidence/jobs-20261006/integration.json` antes do commit.

## 3. Para publicar
1. **Autorização do Emanuel** para aplicar a migração no Supabase compartilhado (o mesmo do Render). Não há `.env.local` neste computador; as migrações anteriores foram aplicadas pelo SQL Editor.
2. Aplicar `supabase/migrations/20261030000100_audit_change_requests.sql` no SQL Editor **antes** do push (o código novo chama as funções novas).
3. Commit(s) na `main` (incluindo `audit-workspace.tsx` e este documento) e push para `origin`; o Render (`render.yaml`: branch `main`, deploy a cada commit) publica sozinho.
4. Conferir o site depois do deploy: lista de apontamentos, PDF publicado (fotos clicáveis e continuação), agenda, exportação do ranking, chamado (pedido → aceite → edição → republicação → sino).

Alternativa: publicar tudo menos o chamado (itens 1.1 a 1.6) e deixar o 1.7 para quando a migração estiver aplicada — exige separar os arquivos do chamado, inclusive trechos de `prototype-workspace.tsx`, `prototype-app.tsx`, `AdminNotifications.tsx` e `publications/service.ts`.
