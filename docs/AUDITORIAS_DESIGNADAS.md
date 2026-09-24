# Auditorias designadas e obras de acompanhamento

## Regra implementada

As obras liberadas pelo Administrativo no perfil do auditor representam seu acompanhamento
regular. Elas continuam definindo acesso à situação da obra, aos documentos e aos resultados
da disciplina autorizada.

Uma auditoria pode ser designada a um auditor de Segurança ou Qualidade que não acompanha
aquela obra. O agendamento permite consultar a própria visita, confirmar sua data e iniciar
a auditoria na data confirmada, respeitando a disciplina do perfil. Não cria concessões de
acompanhamento nem inclui a obra na lista geral de obras autorizadas.

O agendamento de acompanhamento continua exigindo vínculo com a obra e a disciplina.
Auditores ativos podem receber auditorias mesmo sem nenhuma obra de acompanhamento.

## Limites de acesso

- A agenda fornece somente o nome necessário para identificar a obra externa.
- O preenchimento exige correspondência exata de visita, obra, modelo e auditor responsável.
- A remoção da visita ou uma agenda indisponível elimina suas permissões na atualização do contexto.
- A designação não libera outras auditorias, histórico, ranking, documentos ou dados de acompanhamento.
- Os leitores de relatórios publicados continuam respeitando as concessões gerais de obra e disciplina.
- Os perfis e as permissões existentes não são ampliados por esses dados de apresentação.

## Banco e alterações da LAN

A migração `20260924000800_audit_assignment_access.sql` separa a autorização de auditoria
designada da autorização de acompanhamento. Atualiza leitura da agenda, seleção de auditores,
confirmação e acesso aos roteiros necessários, incluindo auditores sem obras vinculadas.

As alterações de cadastro de obras preparadas na LAN também dependem das migrações anteriores:

- `20260924000600_work_stage.sql`: etapa da obra.
- `20260924000700_work_team_roles.sql`: cargos dos integrantes vinculados à equipe.

Aplicar a sequência de migrações junto da versão correspondente da aplicação. O registro da
publicação dos ambientes deve ser feito separadamente após sua confirmação.

Em 24/09/2026, o cliente oficial confirmou a aplicação das migrações 006, 007 e 008
no projeto Supabase vinculado `dialogo-auditorias-dev`. Nenhum usuário fictício foi criado
no banco. A versão da aplicação segue pelo branch `main` do GitHub para o Render.

## Validação

A execução conjunta de regressões desta entrega registrou **135 testes aprovados**.
O helper de contexto possui **6 testes** para autoria, disciplina, confirmação, revogação,
identificação mínima da obra e preservação das concessões.
Build de produção e ESLint também passaram. A suíte SQL completa B.1–B.25 passou em
PostgreSQL isolado (PGlite), incluindo as três migrações, RLS e a preservação dos vínculos.

```sh
node --experimental-strip-types --test scripts/test-prototype-access.mjs scripts/test-prototype-audits.mjs scripts/test-agenda.mjs scripts/test-workspace-context.mjs
node --experimental-strip-types --test scripts/test-assigned-audit-context.mjs
```

Esses testes usam dados isolados e não criam auditorias ou concessões no banco de produção.

## Limitação preexistente

O preenchimento e a conclusão do relatório nesse fluxo ainda são mantidos no estado React
da sessão. O botão de conclusão não chama uma RPC de publicação de auditoria no Supabase.
Esta entrega não adiciona persistência de rascunhos, respostas ou relatórios produzidos por
esse fluxo; recarregar a página pode perder esse estado. A leitura dos relatórios já publicados
no banco permanece um fluxo separado.
