# Roteiro de lacunas — Diálogo Auditorias

**Data:** 30/10/2026 · **Base analisada:** `main` = `c560213` (publicada no Render) · **Banco:** Supabase `bkixtcvnijujqvncotsa`

Fontes: código atual, regras de acesso e permissões lidas da produção (backup de 30/10), pacote do Mac `TRANSFERENCIA_COMMITS_TESTES_2026-10-30` (PKG-01 `bede876`, consolidação `a9a2480`, NVDA `ce3a1d9`), `ESCOPO.md` e `docs/PENDENCIAS_*`.

**Regra de teste:** cada etapa testa só o que muda, com os scripts do próprio requisito e um smoke curto em produção depois de publicar. Nada de suíte inteira por requisito.

---

## Situação dos pacotes do Mac

| Pacote | Situação na `main` | Conduta |
|---|---|---|
| NVDA (acessibilidade, 5 commits) | **Já publicado**, consolidado em `98c6d38` em 05/10 | Nada a portar. Falta só a leitura real com NVDA. |
| PKG-01 (evidências e relatórios orientativos) | **Ausente**. Aplica sem conflitos de código. | Portar na Etapa 1, trocando os 2 `40001` por `PT409` e renumerando as migrations. |
| Consolidação de outubro (`a9a2480`, 86 arquivos e 14 migrations) | **Parcial**: parte está superada ou já resolvida | Portar requisito a requisito (etapas 1 a 4). Nunca aplicar inteira: tem 7 usos de `40001` e 8 conflitos. |

**Não portar:**
- **AUD-05 (jobs):** a `main` já resolve desde `20261027000100`, e a versão do Mac volta a usar `40001`.
- **Função de ranking do PKG-06:** apagaria as notas históricas importadas.
- **Mudança de cálculo IT.07/FVS em `audit-draft.ts`:** altera notas oficiais e depende de decisão de negócio.

---

## Etapa 0 — Higiene de produção (sem mudança de comportamento)

| # | Lacuna | Evidência | Impacto | Esforço | Teste proporcional |
|---|---|---|---|---|---|
| 0.1 | **[Pronto localmente: `20261030000600_restore_function_privileges.sql`. Crítico]** `publication_command` e `background_job_request` assumem a identidade passada em `p_actor` e hoje podem ser chamadas por qualquer usuário, logado ou não. **Permissões de funções perdidas na recriação de 28/10.** 79 das 148 funções podem ser executadas por usuário não logado (`anon`), 75 delas *security definer*, entre elas `background_job_worker`, `publication_command`, `create_audit_visit` e `approve_access_request_v3`. | Consulta a `has_function_privilege` em produção. As migrations originais revogam esse acesso (61 arquivos com `revoke`). | Alto: cada função depende só da própria checagem interna. | S–M | Consultar os privilégios antes e depois, e fazer smoke de login, agenda e publicação. |
| 0.2 | **Produção sem histórico de migrations.** Um `db push` reaplicaria as 82 migrations. | `supabase_migrations.schema_migrations` não existe. | Alto: risco de erro em qualquer publicação. | S | Comparar as funções do backup com os arquivos e então registrar o baseline (`migration repair`). Depois disso, `db push --dry-run` deve mostrar só as migrations novas. |
| 0.3 | **Testes que já falhavam:** paginação da agenda e de desempenho, `catalog-revisions` (2), `lists` (1) e `auth` (1). | Registrados em 29/10 sobre `d204811`. | Médio: tiram a confiança no resultado dos testes. | S | Rodar os próprios scripts. |
| 0.4 | **Limpeza:** tirar a pasta `TRANSFERENCIA_…` de dentro do repositório; decidir se o serviço `dialogo-auditorias-nvda` no Render e o `render.nvda.yaml` continuam. | — | Baixo (custo e risco de commit acidental) | S | — |

## Etapa 1 — Segurança e evidências (PKG-01 + PKG-03 + AUD-02), uma única janela

| # | Requisito | O que falta hoje | Impacto | Esforço |
|---|---|---|---|---|
| 1.1 | **AUD-01:** proteger as fotos de relatórios orientativos fechados, com manifesto imutável. | O autor ainda pode apagar ou substituir fotos (as regras de Storage só verificam a pasta). | Alto: evidência e PDF ficam inconsistentes. | M |
| 1.2 | **H01:** retirar a leitura de fotos de quem perdeu o acesso. | `follow_up_photos_read_own` só verifica a pasta do usuário. | Alto (confidencialidade). | S |
| 1.3 | **H01-R01:** concluir um apontamento preservando foto e registro. | Concluir um apontamento que só existe no rascunho apaga o item e as fotos sem deixar registro (`actions.ts:195-200`). | Médio | S–M |
| 1.4 | **F04:** salvar relatório agendado com item grave, com repetição segura. | `save_follow_up_report` exige 4 campos por item e recusa o campo `serious`. Uma nova tentativa pode duplicar. | Alto, se confirmado (1 teste). | S |
| 1.5 | **AUD-02:** conclusão por RPC transacional. | Hoje é um `upsert` feito direto do navegador. | Médio | M |
| 1.6 | **Leitura de apontamentos exige acesso vigente** (`work_findings_read` e `follow_up_completion_select`). | Hoje basta ser o autor. | Médio (confidencialidade) | S |
| 1.7 | **Apontamento concluído imutável.** | `work_findings_update` permite editar mesmo depois de concluído. | Médio (integridade) | S |
| 1.8 | **Envio de foto exige acesso vigente à obra ou visita.** | `follow_up_photos_insert_own` só verifica a pasta. | Médio | S |
| 1.9 | **Cabeçalhos de segurança HTTP** (CSP, X-Frame-Options) em `next.config.ts`. | Não há `headers()`. | Médio | S |

**Como fazer:**
1. Criar uma branch a partir da `main` e fazer cherry-pick de `bede876`.
2. Renumerar as migrations para depois de `20261030000500`, na ordem AUD-01, H01, R01, F04 e PKG-03.
3. Trocar `40001` por `PT409` e conferir com `grep` que não sobrou nenhum.
4. Na publicação, aplicar migration e código na mesma janela, com o worker parado.

**Testes:**
- os testes do PKG-01: `test-aud01-evidence`, `test-h01-photo-access-database`, `test-r01-completion-database`, `test-f04-scheduled-report*` e `test-follow-up-mutations`;
- 1 teste novo garantindo que um conflito gera uma única resposta 409, sem repetição;
- `tsc`, `lint` e `build`;
- smoke em produção: apagar foto de relatório fechado deve ser bloqueado; acesso revogado não deve conseguir ler; concluir deve preservar a foto; relatório com item grave e nova tentativa não deve duplicar; PDF.

## Etapa 2 — Integridade em campo e acesso

| # | Requisito | O que falta hoje | Impacto | Esforço |
|---|---|---|---|---|
| 2.1 | **AUD-03:** evitar duplicidade de relatórios e apontamentos (`requestId` e índice único). | Inserção direta. Duplo clique ou rede ruim duplicam. | Alto em campo | M |
| 2.2 | **AUD-06:** confirmar antes de sair de um plano de ação não salvo. | Só existe `beforeunload`; a navegação interna descarta sem perguntar. | Médio (perda de trabalho) | S |
| 2.3 | **Preservar texto de relatórios** (`use-unsaved-form`). | Não existe. | Médio | S |
| 2.4 | **Engenharia com duas atuações:** escolher entre elas. | A escolha de perfil decide pela quantidade de perfis, e quem tem duas atuações fica preso à principal. | Médio (bloqueia usuário) | S |
| 2.5 | **Recusar solicitação de acesso**, com motivo e histórico. | Não existe estado RECUSADO; a fila só cresce. | Médio (Administrativo) | M |

**Testes:** os scripts de cada requisito (`test-follow-up-report-attempt`, `test-active-profile`, `test-effective-access` e `test-access-administration`) mais um smoke de cada fluxo.

## Etapa 3 — Agenda e histórico (maior; uma etapa própria)

| # | Requisito | Observação | Esforço |
|---|---|---|---|
| 3.1 | **Reagendar uma visita** sem excluir e recriar, preservando o histórico. | Recriar a partir do Mac usando PT409. Precisa decidir o que acontece com "Liberar preenchimento" (`late_start_allowed`) ao reagendar. Tem 4 conflitos de agenda. | M–L |
| 3.2 | **Histórico de obras inativas:** publicações continuam consultáveis quando a obra é inativada. | Redefine RPCs de leitura usadas pelo chamado de alteração; precisa ser refeito sobre a `main`. | L |
| 3.3 | **Navegação com histórico** (`?secao=`, o botão Voltar não sai do app). | Conflito grande em `prototype-app.tsx`. | M |

## Achados dos testes automatizados (30/10)

- **Recarregar a página durante o preenchimento volta para a tela inicial** (confirma o item 3.3). O rascunho se mantém, mas é preciso entrar de novo em Auditorias e clicar em Retomar.
- **Depois de publicar, a lista "Auditorias publicadas" do auditor não se atualiza**: a nova publicação só aparece depois de recarregar a página. Esforço S.
- **Visitas de "Acompanhamento" agendadas não têm entrada para o relatório.** O cartão com o botão "Relatórios" saiu da aba Acompanhamento em 30/09 (`f524c5a`). A agenda ainda permite agendar Acompanhamento, mas a página `/app/acompanhamento/relatorio/[visitId]` só abre pelo endereço. O relatório avulso (apontamento com foto, item grave e PDF) funciona e foi testado. **Decisão necessária:** devolver a entrada (e então o F04 da Etapa 1 volta a ser prioritário) ou retirar "Acompanhamento" da agenda. Até lá, o F04 tem prioridade baixa.

## Etapa 4 — Pequenos ganhos

- Notificações marcadas como lidas de forma consistente (`mergeDisplayedReadKeys`). S
- Mensagens de processamento sem remeter à tela "Processamentos". S
- Índice `access_work_changes_work_recent`. S
- Rótulos de acessibilidade novos ("Origem: obra/visita", aviso de foto protegida) e conferência de telas criadas depois de 05/10. S
- Leitura real com NVDA (pendência registrada na homologação). S

## Fora do código — decisões e operação

- **Documentação desatualizada:** o `ESCOPO.md` ainda diz "ativação pendente" para preenchimento, publicação e plano de ação, que estão no ar; registra a exceção da regra D03 (chamado de alteração).
- **Pendências de negócio** em `docs/PENDENCIAS_ESCOPO_REVISADO.md`:
  - P01: casos finais do cálculo de Segurança;
  - P03, P04 e P07: plano de ação, prazos e pareceres;
  - P05 e P06: consenso e condições de publicação;
  - P10: substituição de auditor;
  - P12: retenção e backup.
- **Operação:**
  - SMTP próprio, porque o e-mail de acesso só chega à equipe do projeto e não há e-mail da agenda;
  - limpeza dos arquivos de tentativas de publicação abandonadas;
  - retenção de fotos avulsas (30 dias), ainda não ativada;
  - integração com AUTODOC, não iniciada;
  - rotina periódica de backup (o de 30/10 foi manual).

## Ordem recomendada

1. **Etapa 0.1 e 0.2:** permissões e histórico de migrations. São pequenas, sem mudança visível, e reduzem o risco de todo o resto.
2. **Etapa 1**, numa janela só.
3. **Etapa 2**, por partes (2.1 primeiro).
4. **Etapa 3**, depois de decidir a regra de reagendamento com início tardio.
5. **Etapa 4** e a documentação, encaixadas nas publicações anteriores.
