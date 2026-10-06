# Auditoria N+1 — 06/10/2026

## Entrega e escopo

Base: commit `46a464c1665f8ea16bde79930ec88ac87168cd3a`. Correções locais, **sem deploy nem alterações no banco remoto nesta etapa**. Existem três migrações novas, descritas abaixo.

O projeto usa o SDK `@supabase/supabase-js`, PostgREST/RPC e PostgreSQL; não usa Prisma, Sequelize ou outro ORM com relações carregadas automaticamente. Foram examinados os handlers HTTP, Server Actions, serviços, carregadores do cliente, chamadas `rpc/from/storage` e funções SQL de leitura/publicação. Não foi adotado DataLoader global, pois permissões, obra, disciplina e perfil precisam ser revalidados em cada requisição.

Foram corrigidos três grupos em fluxos acessíveis: metadados das fotos, leitura dos apontamentos selecionados ao salvar relatório avulso e validação dos arquivos ao publicar auditoria. A exportação antiga de auditorias, hoje sem chamador nas telas, também tinha assinatura de arquivos por auditoria e foi corrigida separadamente.

## Caminhos completos e ocorrências

### 1. Fotos dos acompanhamentos

**Antes:** `FollowUpWorkspace` / editor → `useFollowUpVisitPhotos` → `createFollowUpPhotoLoader` → um `GET /api/follow-up/visits/[visitId]/photos` por visita visível → `readAuditRequestContext` → `readFollowUpVisitPhotos` → SDK `rpc(can_read_follow_up_visit_photos)` e SDK `storage.list` → `audit_visits`, `access_works`, `access_grants`, `storage.objects` → JSON com nomes das fotos.

Cada endpoint repetia as consultas comuns `read_current_access_account` e `read_current_access_workspace`. O limite de duas solicitações simultâneas controlava concorrência, mas não eliminava N+1. Para N visitas: **N HTTPs de metadados, 4N chamadas de dados**, sendo 2N de acesso e 2N de autorização específica/listagem. A leitura inicial da lista e o download das imagens não fazem parte dessa contagem.

**Depois:** os eventos de visibilidade compartilham um lote, de até 50 visitas, em `GET /api/follow-up/photos?visitId=…&visitId=…`. O handler autentica uma vez e chama `readFollowUpPhotoBatch` → SDK `rpc(read_follow_up_photo_batch)` → joins de visitas, obras e concessões, seguidos de uma consulta aos nomes em `storage.objects` → `{available, visitIds, photos}`. Para até 50 visitas visíveis juntas: **1 HTTP e 3 chamadas de dados**, incluindo as duas comuns de acesso.

A janela de agrupamento usa uma tarefa do navegador. Usar apenas uma microtask não garantia o agrupamento de callbacks distintos de `IntersectionObserver`. A rota antiga permanece compatível e delega ao mesmo serviço, com uma visita.

**Server Action relacionada:** `readFindingPhotosAction` aceitava até 100 IDs e fazia N leituras completas de detalhe de visita, seguidas de N listagens de Storage. Agora chama o mesmo serviço em lotes de 50. Para 42 visitas, **86 → 3 chamadas de dados**, incluindo o acesso comum. Essa ação foi medida separadamente porque o laço anterior era sequencial; seu tempo não foi inferido do carregador do navegador.

Dados retornados: somente `visitId`, `findingId` e `fileName`; nenhum corpo de relatório, histórico de visita, URL assinada ou binário. O lote rejeita IDs sem acesso, respostas inconsistentes e excesso de arquivos, sem truncamento silencioso. A revogação é verificada na próxima chamada. Cancelar/substituir uma visita não cancela as outras integrantes do lote. As fotos continuam privadas.

### 2. Salvar relatório orientativo avulso

`StandaloneReportForm` → Server Action `saveStandaloneReportAction` → `saveStandaloneReport` → SDK `rpc(save_standalone_follow_up_report)` → PostgreSQL → UUID do relatório → preservação do PDF → resultado da ação.

**Antes:** dentro da função SQL, um `foreach` fazia `SELECT … FOR SHARE` em `follow_up_work_findings` e outra consulta com bloqueio em `storage.objects` para cada item selecionado. São **2N consultas desses dados**, além das verificações comuns e da gravação.

**Depois:** uma consulta seleciona, bloqueia e projeta todos os apontamentos; outra bloqueia/confere os caminhos distintos das fotos. **2 consultas**, para até 30 itens. A ordem de bloqueio é estável; a ordem dos itens no snapshot continua sendo a escolhida pelo auditor. São mantidos idempotência, validação de obra/disciplina/autor, exigência da foto e atomicidade. Arquivos compartilhados por registros legados continuam aceitos.

Colunas lidas dos apontamentos: `id`, `location`, `description`, `correction`, `serious`, `photo_file_name`. O `SELECT *` por item foi removido. A latência deste caso mede a função inteira de salvamento, incluindo suas verificações comuns e INSERT, mas não a geração posterior do PDF.

### 3. Publicar auditoria

`useAuditPublication.publish` → `POST /api/publications/[id]/publish-audit` → `createPublicationService.publishAudit` → leitura do rascunho, geração/upload do PDF e evidências → SDK `rpc(publication_command, publish-audit)` → PostgreSQL `storage.objects` / `published_audits` / `audit_drafts` → publicação persistida → JSON da auditoria.

**Antes:** a função SQL executava uma consulta de existência para cada evidência e outra para o PDF: **N+1 statements SQL**. Isso ficava oculto dentro de uma única RPC.

**Depois:** uma relação de arquivos esperados é confrontada com `storage.objects` em um join: **1 statement**. Evidência ausente ou PDF ausente/nulo continuam impedindo a publicação. Os comandos de gravação e as regras de cálculo não mudaram.

A latência medida corresponde ao bloco exato de validação de arquivos, extraído das duas versões. Não inclui download, processamento de imagem, geração de PDF ou upload. As duas versões fazem a mesma quantidade de RPCs de publicação; o ganho está nas consultas internas ao banco.

### 4. Exportação antiga de auditorias

Sem rota/tela atual chamadora → `readPublishedAuditSnapshot` → duas RPCs (`read_published_audit_index` / `read_published_audits`) → uma chamada `createSignedUrls` por auditoria → JSON de auditorias, respostas e critérios.

A assinatura agora agrupa até 100 caminhos por chamada, entre auditorias. Para 42 auditorias com um PDF cada: **42 → 1 chamadas ao Storage**; as duas RPCs permanecem. Metadados de uma auditoria permanecem disponíveis se a assinatura de seus arquivos falhar; respostas só recebem URLs quando todos os arquivos daquela auditoria estiverem disponíveis.

É uma correção preventiva de código legado. Não é apresentada como melhoria nas telas atuais, que usam cabeçalhos paginados, detalhe por ID e assinatura em lote já existente para um documento.

## Medição

Os números consolidados, amostras individuais e contagens por função estão em [benchmark.json](evidence/nplus1-20261006/benchmark.json). A tabela de resultados está em [resultados.md](evidence/nplus1-20261006/resultados.md).

### O que foi contado

- Fotos/ação: chamadas de dados realizadas pelo SDK/adapter até o banco, incluindo as duas leituras comuns de acesso. RPC não equivale a um único statement interno. A confirmação GoTrue da identidade é uma fronteira diferente e não foi simulada como uma consulta SQL.
- Relatório avulso: statements executados para buscar/bloquear apontamentos e fotos. Autorizações e INSERT comuns aos dois lados são excluídos da contagem, mas incluídos no tempo da função.
- Publicação: statements de verificação de arquivos, incluindo o PDF. Os demais passos da publicação são excluídos dessa contagem e desse tempo.
- Legado: chamadas ao Storage contadas separadamente das duas RPCs. Assinar arquivos não foi rotulado como SELECT do PostgreSQL.

### Como foi reproduzido

- Banco descartável PostgreSQL 18.3 via PGlite 0.5.8, com migrações reais e dados fictícios. Nenhuma credencial ou dado de produção.
- Fixtures: 100 visitas, 30 apontamentos selecionáveis, fotos de visitas/obra, 201 arquivos de publicação e 3.000 arquivos não relacionados no mesmo bucket. Casos de 1/10/42 visitas, 1/10/30 apontamentos e 1/42/200 evidências.
- Carregador e serviço anteriores lidos do commit-base; versões novas executadas a partir do workspace. O adapter encaminha cada consulta às funções reais do PostgreSQL local.
- Na simulação de transporte, cada chamada de dados recebe **15 ms de atraso controlado**. Esse valor é configurado pelo teste, não medido na rede do Supabase. Os tempos de execução das consultas locais são reais.
- Cinco amostras pareadas para os caminhos com transporte; nove para as funções/blocos SQL. Aquecimento antes da coleta. Mediana, mínimo, máximo e cada amostra são preservados.
- As contagens internas usam cópias instrumentadas das funções/blocos exatos, com um contador antes de cada statement relevante. **A instrumentação é excluída das medições de latência.** Gravações de benchmark são desfeitas por savepoint; o banco é descartado.
- [EXPLAIN ANALYZE](evidence/nplus1-20261006/photo-batch-explain.json) verifica que a nova chamada em lote não esconde uma varredura de Storage por visita. O teste exige uma execução por nó de leitura de `storage.objects` no cenário de 42 visitas.
- Chrome com build de produção local, hook real e `IntersectionObserver` real: **42 linhas visíveis → 1 requisição**. A API dessa verificação de navegador é simulada, com atraso de 500 ms. Veja [resultado](evidence/nplus1-20261006/browser.json) e [captura](evidence/nplus1-20261006/browser-42-visits.png).

**Não são medidas de produção nem de geração completa de PDF.** Casos pequenos podem ficar ligeiramente mais lentos; esses resultados são preservados. Asserções de regressão usam contagem, tamanho dos lotes e equivalência funcional; não dependem de um limite arbitrário de milissegundos sujeito ao ruído da máquina.

## Outros caminhos examinados

| Caminho | Resultado |
| --- | --- |
| `/api/follow-up/list` → `readListPage` → `read_follow_up_list_page` | Uma RPC de dados por página; filtros e projeções no SQL, sem chamada do serviço por registro |
| `/api/audits/history` → `readPublishedAuditHistory` | Uma RPC por página; achados opcionais retornados no mesmo snapshot |
| `/api/audits/history/coordination` | Duas RPCs fixas, uma por disciplina; não cresce com os registros |
| `/api/agenda` → `readAgendaUpdate` → `read_audit_agenda_month` | Uma RPC mensal. Subconsultas correlacionadas de eventos são trabalho interno do plano SQL, não chamadas adicionais do SDK; não foram declaradas eliminadas nesta entrega |
| Detalhe e comparação de auditorias | Detalhe por ID e comparação em lote já existentes; sem leitura de detalhe por cada linha do histórico |
| Administração e equipes | Contas/históricos paginados; equipe buscada em lote; consultas paralelas da edição de uma obra têm quantidade fixa |
| Catálogos/roteiros | Quantidade fixa por conjunto de modelos; sem consulta individual para os 203/205 critérios |
| Metadados dos planos publicados | IDs da página enviados juntos, até 50; não há consulta por cartão |
| Thumbnails, fotos e PDFs privados | Cada arquivo solicitado continua com autorização e leitura próprias. São respostas binárias independentes; não estão incluídas no ganho dos metadados e não foram substituídas por URLs públicas/cache de permissões |
| Upload/download de arquivos para montar PDF | Transferências dos arquivos distintos são necessárias; não foram apresentadas como queries relacionais N+1 removidas |
| Criação de agenda em lote | Validações/bloqueios e comandos por mutação mantidos; não foi convertido em INSERT irrestrito para reduzir contagem |

Esse inventário distingue número de roundtrips, statements internos, nós do plano e transferências de arquivos. Não significa que todas as consultas do projeto tenham latência otimizada para qualquer volume futuro.

## Testes, arquivos e publicação futura

- `scripts/test-nplus1.mjs`: handlers reais e serviço; orçamento de uma RPC para 1/10/42/50 visitas, validação, perfil, cobertura do lote, erros e ausência de vazamento.
- `scripts/test-follow-up-photo-loader.mjs`: batching, limite de concorrência, cancelamento parcial, StrictMode, upload durante leitura, expiração, retry e revogação.
- `scripts/test-follow-up-mutations.mjs`: ação de fotos com 1/42/50/100 visitas limitada a `ceil(N/50)` RPCs.
- `scripts/test-follow-up-workspace.mjs`: rota antiga delega à consulta em lote, sem Storage listing adicional.
- `scripts/test-published-audits.mjs`: assinatura agrupada do leitor legado e preservação de leitura restrita por documento.
- `scripts/benchmark-nplus1.mjs`, `scripts/lib/nplus1-database.mjs`, `supabase/tests/nplus1*.sql`: reprodução comparativa, contadores, EXPLAIN, paridade de snapshots, arquivos ausentes, cancelamento, duplicatas e revogação.
- `scripts/test-access-database.mjs`: suítes de relatório avulso e publicação executam também as novas migrações.

Validação: **58 testes específicos e 388 de regressão aprovados** (há sobreposição entre suítes); suítes PostgreSQL de publicação e relatórios avulsos aprovadas; build aprovado; lint sem erros, com dois avisos anteriores. Logs e inventário exato em [evidências](evidence/nplus1-20261006).

Migrações pendentes de deploy:

1. `20261006000600_follow_up_photo_batch.sql` — leitura autorizada em lote dos nomes de fotos.
2. `20261006000700_standalone_findings_batch.sql` — snapshots e bloqueios em lote no relatório avulso.
3. `20261006000800_publication_evidence_batch.sql` — verificação em conjunto dos arquivos da publicação.

As migrações preservam as assinaturas dos comandos existentes; a aplicação nova depende da RPC de fotos nova. Aplicar as migrações antes de atualizar o servidor. Não há cache de autorização entre requisições nem fallback para a sequência N+1 se a RPC faltar: a interface oferece erro e retry.

```sh
npm run test:nplus1
PGLITE_MODULE_PATH=/caminho/para/@electric-sql/pglite/dist/index.js npm run benchmark:nplus1
PGLITE_MODULE_PATH=/caminho/para/@electric-sql/pglite/dist/index.js npm run test:publication-database
PGLITE_MODULE_PATH=/caminho/para/@electric-sql/pglite/dist/index.js npm run test:standalone-reports-database
npm run test:performance
npm run build
npm run lint
ACCESSIBILITY_REVIEW_ONLY=1 npm run start -- --hostname 127.0.0.1 --port 3016
# Em outro terminal, com Playwright/Chrome disponíveis:
node scripts/test-nplus1-browser.mjs
```

O benchmark precisa do commit-base no repositório Git. A cópia de build usada nesta validação ficou isolada, sem arquivos de credenciais. Concorrência real entre conexões do Supabase e a sessão HTTP autenticada completa não foram exercitadas; os bloqueios e autorizações foram testados no PostgreSQL isolado.
