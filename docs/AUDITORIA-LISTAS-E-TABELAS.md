# Auditoria de listas e tabelas — 06/10/2026

## Situação da entrega

Implementação local, baseada no commit `cb7df516ce6eb8459c3396fad79091e68f325793`. Nenhum deploy ou alteração no banco remoto foi feito nesta etapa. As cinco migrações abaixo precisam acompanhar a publicação da aplicação. Microsoft 365, backups e ativação da exclusão automática de fotos continuam fora desta entrega.

## Inventário e estratégia adotada

| Lista / fluxo | Problema encontrado | Estratégia implementada |
| --- | --- | --- |
| Apontamentos do acompanhamento | Histórico completo, inclusive busca de todas as páginas antes de mostrar a lista | Cursor por data e identificador, 20 itens inicialmente, opções 10/20/50; busca e filtros no banco |
| Relatórios orientativos, com e sem agendamento | Listagem dependia de históricos completos e da agenda; carregava conteúdo que só seria necessário ao abrir um relatório | Cabeçalhos paginados por cursor, sem corpo do relatório ou fotos; detalhe sob demanda |
| Apontamentos na Engenharia | Limite de consulta e `slice(0, 6)` ocultavam registros sem oferecer navegação | Cursor, filtros e controles explícitos para alcançar as páginas seguintes |
| Relatórios na Engenharia | Cruzamento de listas completas de relatórios e agenda | Consulta paginada independente da agenda, com escopo de obra e disciplina |
| Seleção de apontamentos para relatório avulso | Leitura de todos os apontamentos da obra | Cursor e busca; seleção mantida entre páginas, limite de 30 selecionados; troca de obra limpa a seleção |
| Seleção de apontamentos para relatório de visita | Abertura do editor carregava todos os relatórios e apontamentos | Cabeçalho da visita, consulta paginada dos candidatos e leitura apenas dos IDs selecionados ao salvar |
| Índice dos relatórios de uma visita | Corpos completos dos relatórios para mostrar cartões | Cabeçalhos paginados e detalhe/PDF por ID |
| Auditorias e planos publicados | Paginação existente sem tamanho configurável/persistência consistente; metadados de planos históricos carregados em conjunto | Páginas de 10/20/50, estado por usuário/perfil, metadados apenas dos IDs da página visível (até 50) |
| Rascunhos de auditoria | Índice de publicações consultava todo o histórico de rascunhos | Consulta do mês selecionado; índice não é solicitado nas telas que não precisam dele |
| Calendário e agenda | Snapshot com visitas de todos os meses | Banco retorna o mês solicitado; calendário mantém todos os marcadores desse mês; cartões recebem paginação local configurável |
| Notificações da agenda | Lista derivada do histórico completo | Título explícito “Notificações do mês”, navegação entre meses e paginação dos registros do mês |
| Obras | Cartões sem controle consistente de página/busca ao voltar | Busca e paginação da coleção de metadados autorizados, com estado preservado |
| Contas e solicitações administrativas | Página de contas já limitada a 20, mas cada conta incluía todo o histórico de decisões | Mantida a paginação existente; cartão recebe apenas a última decisão e expande histórico de 20 em 20 |
| Histórico de edição da obra | Apenas 20 alterações acessíveis; navegar pelo servidor poderia perder formulário em edição | Total e páginas de 20, carregadas sem remontar o formulário; estado de falha e retry |
| Seleção de integrantes da equipe | Leitura de até 1.000 usuários e milhares de vínculos, com truncamento possível | Busca no banco e páginas de 20; integrantes já selecionados consultados por ID, até 30; seleção mantida entre páginas |

### Coleções mantidas completas por terem outra finalidade

- Metadados das obras autorizadas e diretório de auditores são necessários aos filtros, permissões e agendamento. Não incluem os históricos operacionais nem corpos de documentos. A lista visual de obras é paginada no cliente.
- Catálogos de critérios, itens de uma auditoria em edição, sumário e linhas de um plano de ação pertencem a um documento. Mantêm a estrutura integral para validação e fechamento; não são consultas de histórico sem limite. Catálogos continuam com carregamento adiado já existente.
- Rankings usam agregados por obra; a visão resumida mantém os cinco primeiros, com expansão prevista na interface. Não carregam todos os documentos para calcular as posições.
- Referências/roteiros são uma coleção pequena definida pelo catálogo. Agendamento em lote e equipe têm limites de domínio já existentes (200 agendamentos por lote e 30 integrantes).
- Não foi encontrado mecanismo de scroll infinito de histórico sem controles. Regiões com rolagem em documentos e no calendário continuam limitadas ao documento ou mês consultado.

## Comportamento comum

- Skeleton e indicação de carregamento; controles de avanço desabilitados durante a operação.
- Vazio, falha de consulta e conclusão da página são estados distintos. Falha oferece “Tentar novamente”.
- Busca com debounce, cancelamento de requisições antigas, prazo de resposta e descarte de respostas fora de ordem.
- Filtros, tamanho e página são preservados por usuário/perfil e lista. Nos históricos por cursor, a posição é capturada antes da navegação e restaurada ao voltar. O teste registrou **549 px antes e 549 px depois**.
- Trocar busca, obra, disciplina ou tamanho reinicia o cursor. Registros selecionados permanecem entre páginas; a troca de obra reinicia a seleção para evitar misturar obras.
- Botões e selects nativos, nomes acessíveis específicos da lista, mensagens de status e foco visível. Preservados os estilos existentes. Restauração de rolagem instantânea, sem impor animação a quem usa reduced motion.
- Históricos administrativos carregados dentro do formulário não fazem navegação de página inteira. O texto ainda não salvo permaneceu intacto durante falha e retry.

## Endpoints e banco

| Endpoint / ação | Alteração |
| --- | --- |
| `GET /api/follow-up/list` | Novo endpoint de cursor: tipo, obra, disciplina, busca, tamanho e visita opcional; resposta limitada a 50 |
| `GET /api/access/list` | Novo endpoint para histórico de decisões, histórico da obra e busca paginada de equipe; exige perfil administrativo geral ativo |
| `GET /api/agenda?mes=AAAA-MM` | Consulta mensal; ausência de `mes` usa o mês atual de Brasília; revisão condicional vinculada ao mês |
| `GET /api/publications` | Rascunhos e planos do mês ou planos dos IDs solicitados, até 50; requisição por IDs não inclui rascunhos |
| `/api/follow-up/workspace`, `/reports`, `/standalone-reports` | Rotas antigas de consulta integral retornam 410 para sessões autenticadas, orientando atualização da página; interface atual usa `/list` |
| Ações de salvar relatório e alterar apontamento | Cabeçalho/detalhe específico e até 30 IDs selecionados; alterações de apontamento consultam apenas o relatório correspondente |

As funções antigas de consulta integral permanecem no código/banco para compatibilidade e comparação nos testes, mas não são utilizadas pelas listas atuais. Não há fallback silencioso para carregar todo o histórico se a migração estiver ausente.

Migrações novas, ainda **não aplicadas no Supabase remoto**:

1. `20261006000100_follow_up_list_pages.sql`: cursores, projeções de cabeçalhos, filtros e índices dos apontamentos/relatórios.
2. `20261006000200_administration_list_pages.sql`: últimas decisões, histórico paginado e opções de equipe.
3. `20261006000300_agenda_month.sql`: janela mensal e índice da agenda.
4. `20261006000400_follow_up_editor_header.sql`: cabeçalho leve e contexto de um apontamento.
5. `20261006000500_publication_month.sql`: índice de publicação por mês/IDs; comandos de gravação preservados.

Permissões são verificadas no endpoint e novamente no banco. O cursor usa ordenação determinística por data e chave, inclusive empates. Filtros são aplicados antes do limite; a consulta usa um registro adicional para indicar a existência da próxima página. Novos índices atendem as consultas de históricos. Não foi medido plano de execução ou latência no banco de produção.

## Medição reproduzível

Comparação entre RPC anterior e nova RPC, no mesmo PostgreSQL isolado, com dados fictícios. O tamanho é o JSON serializado pelo banco, sem compressão HTTP. A agenda compara o histórico inteiro com um mês solicitado; apontamentos comparam a carga integral antiga com a primeira página.

| Consulta | Antes | Depois | Redução de bytes |
| --- | ---: | ---: | ---: |
| Apontamentos | 1.502 registros / 547.141 bytes | 20 registros / 10.190 bytes | 98,14% |
| Agenda | 1.209 visitas / 775.207 bytes | 20 visitas do mês / 14.487 bytes | 98,13% |

Os 1.502 apontamentos foram percorridos em **76 páginas**, sem duplicidade ou perda, incluindo datas iguais. Inserção e revogação de autorização entre páginas também foram exercitadas. No navegador, a abertura da lista fez **uma requisição**, renderizando 20 registros em vez de buscar antecipadamente os 1.502.

Esses números comprovam redução da resposta no cenário testado; não representam medição de tempo ou volume real de produção.

## Testes e evidências

| Validação | Resultado | Evidência |
| --- | --- | --- |
| `npm run test:performance` | 386 aprovados | [regressão](evidence/lists-20261006/regressions.log) |
| `npm run test:lists` | 79 aprovados, com sobreposição à regressão | [listas](evidence/lists-20261006/lists-tests.log) |
| `npm run test:publication` | 16 aprovados | [publicações](evidence/lists-20261006/publication-tests.log) |
| PostgreSQL/PGlite: listas, filtros e autorizações | Aprovado | [SQL e medidas](evidence/lists-20261006/lists-database.log) |
| PostgreSQL/PGlite: persistência e publicação | Aprovado | [SQL de publicação](evidence/lists-20261006/publication-database.log) |
| Chrome/Playwright, build de produção local | 10/10 cenários | [resultados detalhados](evidence/lists-20261006/browser-results.json) |
| Build de produção | Aprovado | [build](evidence/lists-20261006/build.log) |
| ESLint | Sem erros; dois avisos existentes | [lint](evidence/lists-20261006/lint.log) |

Os testes de navegador usam componentes reais em `/revisao-listas`, habilitada apenas no ambiente de revisão, e respostas de API simuladas. Não acessam dados de usuários nem gravam no ambiente remoto. Cobrem:

1. Atraso de 1.800 ms, skeleton, botões desabilitados e avanço por Enter.
2. HTTP 503, retry e resposta vazia.
3. Tamanho 50, filtros reiniciando cursor e resposta atrasada descartada.
4. Voltar do documento preservando página, busca, tamanho e rolagem.
5. Seleção de apontamentos avulsos entre páginas e limpeza ao mudar obra.
6. Largura de 390 px, sem transbordamento horizontal; foco com contorno sólido de 3 px; reduced motion; zero violações no axe para WCAG 2 A/AA e 2.1 AA no conteúdo testado.
7. Calendário solicitando somente o mês escolhido e recuperando falha.
8. Equipe com busca, paginação e seleção mantida.
9. Histórico da obra preservando texto não salvo durante carregamento, falha e retry.
10. Seleção entre páginas no relatório de visita, com obra/visita na consulta.

Capturas numeradas `01` a `10` e arquivos `.aria.txt` estão em [evidências](evidence/lists-20261006). O subdiretório `antes-das-correcoes` guarda falhas intermediárias; não representa o resultado final. A perda de rolagem foi encontrada pelo teste e corrigida, não apenas descrita como intenção.

**Limites da validação:** árvore de acessibilidade e teclado foram testados; não foi executado NVDA manual nesta etapa. O PGlite executa SQL real, mas não substitui GoTrue/PostgREST nem concorrência de múltiplas conexões do Supabase. Os testes de navegador não são uma sessão autenticada completa contra produção.

### Arquivos de implementação e testes

O inventário exato desta entrega está em [arquivos alterados](evidence/lists-20261006/changed-files.txt), excluindo arquivos de trabalhos anteriores que já estavam modificados. Principais grupos:

- Infraestrutura: `list-controls.tsx`, `list-state.ts`, `use-cursor-list.ts`, `use-page-resource.ts`, `history-pagination.tsx`, `src/lib/lists/*`.
- Acompanhamentos: `follow-up-workspace.tsx`, `follow-up-report-page.tsx`, `follow-up-visit-index.tsx`, `standalone-report-form.tsx`, painéis da Engenharia e `src/app/follow-up/actions.ts`.
- Agenda/publicações: `use-agenda.ts`, `agenda-window.tsx`, `visit-agenda.tsx`, `admin-visit-calendar.tsx`, `AdminNotifications.tsx`, `use-audit-publication.ts`, `use-published-plans.ts`, serviços e rotas correspondentes.
- Administração: `AccessDecisionHistory.tsx`, `AccessAdministration.tsx`, `ActiveTeamProfiles.tsx`, `WorkHistory.tsx`, página de edição da obra e `src/lib/works/queries.ts`.
- Novos testes: `scripts/test-list-administration.mjs`, `scripts/test-lists-browser.mjs`, `supabase/tests/list_pagination.sql`.
- Testes atualizados: workspace/relatório/mutações de acompanhamento, renderização administrativa, formulários adiados, agenda mensal/compacta/lote, seleção de recursos por tela, runner SQL e SQL de publicação.

### Como reproduzir

```sh
npm run build
npm run lint
npm run test:performance
npm run test:lists
npm run test:publication
PGLITE_MODULE_PATH=/caminho/para/@electric-sql/pglite/dist/index.js npm run test:lists-database
PGLITE_MODULE_PATH=/caminho/para/@electric-sql/pglite/dist/index.js npm run test:publication-database
ACCESSIBILITY_REVIEW_ONLY=1 npm run start -- --hostname 127.0.0.1 --port 3014
# Em outro terminal, com Playwright/Chrome e axe disponíveis nos caminhos configurados no script:
npm run test:lists-browser
```

A validação desta entrega foi realizada em uma cópia isolada do projeto, sem arquivos de credenciais. O registro de versões, comandos e medições está em [validation-summary.json](evidence/lists-20261006/validation-summary.json).
