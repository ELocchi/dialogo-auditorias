# Agenda e confirmação de auditorias

Decisão do responsável em 14/09/2026: o Administrativo marca a auditoria, o auditor atribuído recebe uma notificação no sino e confirma a data. O envio por e-mail foi adiado expressamente; nesta etapa o auditor apenas confirma, sem solicitação de reagendamento ou recusa.

## Fluxo implementado

- Administrativo usa o botão + em Visitas agendadas, escolhe obra, disciplina, roteiro, auditor autorizado, data e observação opcional.
- A visita nasce como `pending_confirmation`. O registro persistente alimenta a notificação do auditor, que abre a obra e a disciplina corretas na Agenda.
- Somente o auditor atribuído, no perfil correspondente e com autorização vigente, usa Confirmar data. A visita passa a `confirmed`, com identidade e horário registrados. O Administrativo vê o status e a notificação da confirmação.
- Administrativo pode reagendar a data/observação. Uma alteração cria nova revisão e histórico e exige confirmação novamente. Salvar os mesmos dados não altera a revisão nem apaga uma confirmação existente.
- O sino consulta a agenda a cada 30 segundos enquanto a aba está visível e também ao recuperar foco. Confirmar não envia e-mail. O contador representa os eventos exibidos; não há caixa de notificações lidas/arquivadas nesta etapa.

O layout aprovado permanece: todas as obras/disciplinas autorizadas no acesso administrativo, lista independente à esquerda e Calendário à direita. Os demais perfis preservam seu contexto autorizado. Engenharia não confirma; Coordenação continua sem concessão específica de agenda. Os formulários de auditoria ainda são prévias temporárias e independentes da persistência dos agendamentos.

## Persistência e autorização

Migration B.7: `supabase/migrations/20260914000200_audit_agenda.sql`, posterior a B.1–B.6, aplicada ao Supabase compartilhado em 14/09/2026. Cria somente `audit_visits`, `audit_visit_events` e o controle privado de operações. Não altera contas, senhas, concessões ou obras e não inclui registros demonstrativos.

RPCs `create_audit_visit`, `reschedule_audit_visit`, `confirm_audit_visit` e `read_audit_agenda` revalidam contas, perfis, obras e vínculos. Escritas diretas ficam bloqueadas; histórico é imutável. Cada operação recebe uma chave estável por tentativa e conteúdo, impedindo duplicação após resposta perdida. Revisões e bloqueios de linha rejeitam confirmações antigas. O cliente não escolhe o autor da operação.

Server Actions também conferem a identidade, perfil e atuação exibidos contra a sessão atual. Polling vinculado ao contexto impede que troca de conta/perfil em outra aba atualize uma tela antiga com dados do novo contexto. As respostas usam dados limitados ao perfil; não serializam e-mails ou campos internos dos auditores.

## Ativação e verificação

**Deploy autorizado pelo responsável em 14/09/2026. A migration B.7 foi aplicada ao Supabase compartilhado antes do envio desta versão ao Render.** O histórico remoto confirmou B.1–B.6 e o dry-run apontou somente B.7, sem seeds, roles ou alterações no Vault. A aplicação ficou registrada no histórico de migrations. Se a leitura do banco falhar, a tela indica agenda indisponível e bloqueia agendamento/confirmação; não simula salvamento.

Após a aplicação, consultas remotas confirmaram RLS, políticas de leitura, bloqueio de escritas diretas, permissões das cinco RPCs e histórico imutável. A comparação antes/depois preservou integralmente solicitações, contas, obras, concessões, decisões, histórico de obras e IDs de Auth. As novas tabelas estavam vazias. Não repetir B.1–B.7 nem ajustes de acessos. O banco usado pela LAN é o mesmo do ambiente online.

O ciclo completo pela interface Administrativo → auditor → Administrativo ainda deve ser conferido com sessões autorizadas ao agendar uma visita real; não foram criadas visitas artificiais no banco compartilhado para substituir essa verificação.

Validações locais: `npm run test:agenda`, suítes SQL B.1–B.7 em PostgreSQL/PGlite isolado, ESLint e build/TypeScript. Os testes cobrem dados inválidos, escopo, notificações, identidade/perfil, repetição, revisão antiga e rollback por falha. O harness SQL não substitui concorrência entre conexões reais nem uma sessão Supabase HTTP. Nenhuma notificação foi disparada para uma conta real durante esses testes.
