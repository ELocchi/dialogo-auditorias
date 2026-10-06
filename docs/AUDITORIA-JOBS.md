# Operações demoradas e processamento em segundo plano

Data: 06/10/2026. Implementação e validação locais; migração e aplicação ainda não publicadas.

Decisão do usuário: **manter somente o serviço atual do Render**. O processo web e o consumidor da fila rodam nesse mesmo serviço. Não foi criado outro serviço, Redis ou integração paga.

## Inventário e decisões

| Entrada / operação | Caminho identificado | Decisão implementada |
| --- | --- | --- |
| `POST /api/publications/[id]/publish-audit` | rota → `publicationService.publishAudit` → baixar evidências → PDF → Storage → `publication_command` | Enfileirar; retornar 202, ID, Location e status. PDF e publicação são executados pelo worker. |
| `POST /api/publications/[id]/publish-plan` | rota → `publicationService.publishPlan` → PDF → Storage → publicação | Mesmo contrato de fila, preservando a revisão do plano. |
| `POST /api/publications/[id]/save-audit` | multipart → decodificação/redimensionamento Sharp → Storage → revisão do rascunho | Até 2 fotos e 8 MB totais: caminho direto. Acima disso: transferir originais uma vez para bucket privado temporário e enfileirar a normalização. Máximo do pacote: 32 MB; cada foto: 8 MB. Upload continua sendo I/O do request; não prometemos 202 antes de receber os bytes. |
| Salvar relatório orientativo agendado ou independente | Server Action → RPC de gravação → geração e preservação do PDF | Trigger grava a tarefa na mesma transação do relatório. A ação retorna recibo; renderização fica no worker. Se a consulta do recibo falhar depois da gravação, a tarefa já está persistida. |
| `GET /app/acompanhamento/relatorio/[visitId]/pdf` e `/avulso/[reportId]/pdf` | autorização → arquivo preservado; antes, ausência podia gerar PDF no request | Arquivo existente: resposta direta. Ausente: enfileirar e retornar 202. Navegação direta com `Accept: text/html`: redirecionar para o processamento correspondente. |
| Importação de agenda XLSX | `visit-agenda` → ExcelJS → validação → Server Action → `create_agenda_visits_batch` | Leitura XLSX em Web Worker, limite de 2 MB, 200 agendamentos, 20 colunas e timeout de 30 s. Banco continua em uma RPC transacional limitada. Sem fallback pesado na thread da interface. |
| Prévia de auditoria/plano no navegador | `pdf/client` → worker de PDF existente | Preservar Web Worker. Fallback direto somente para documentos sem fotos e até 10 itens/linhas; navegador sem suporte recebe erro claro para documentos maiores. |
| Modelo de planilha, revisões de catálogo e pesos | arquivo pequeno e operações limitadas de metadados | Manter caminho direto. Não há processamento de PDFs/fotos ou integração externa nesse salvamento. |
| Miniaturas e upload individual de acompanhamento | autorização → Storage → Sharp limitado | Manter caminho simples: miniaturas de 320 px, concorrência 2, cache limitado e timeout Sharp existente. Upload individual tem limite próprio de 3 MB. |
| Downloads de documentos de referência, auditoria/plano publicados e PDF já preservado | autorização → arquivo existente | Manter leitura direta; não gerar novamente nem colocar download de arquivo pronto na fila. |
| Confirmação de e-mail/cadastro e administração de acessos | chamadas Supabase Auth/RPC | Manter resposta direta necessária para confirmar o resultado. Cliente Supabase comum já tem timeout de 15 s. Não foi localizado envio Microsoft ativo nesses requests. Microsoft 365 e backups continuam adiados conforme decisão anterior. |
| Retenção de fotos | regras existentes de retenção | Exclusão automática de fotos da aplicação continua desativada. A limpeza nova alcança somente entradas temporárias da fila. |

## Fluxo persistente

1. Autenticar usuário/perfil e autorizar o documento. Persistir trabalho no PostgreSQL.
2. Retornar recibo com ID e `statusUrl`. A interface mostra fila, etapa, conclusão ou falha; ações ficam desabilitadas durante o acompanhamento.
3. `npm start` inicia Next e `scripts/jobs-worker.mjs` pelo supervisor. O consumidor reserva uma tarefa e inicia um processo filho isolado.
4. O filho verifica novamente o acesso, processa evidências/PDF, grava o arquivo e conclui a operação autorizada no banco.
5. Cliente consulta `/api/jobs/[id]`. A página `/app/processamentos`, também acessível no menu, permite voltar depois, tentar novamente e abrir o resultado.

O fechamento da aba interrompe apenas o polling. O trabalho continua persistido. A lista traz os últimos 40 trabalhos do perfil; não retorna payload, token da reserva ou arquivos. A obtenção do resultado verifica novamente a autorização.

Não usamos porcentagem fictícia: as etapas são “Na fila”, “Processando fotos”, “Gerando PDF”, “Gravando arquivo” e “Concluindo”. O painel mantém as linhas em falhas de consulta, oferece recarregar, possui skeleton inicial, vazio e estados acessíveis. O foco permanece no item ao solicitar nova tentativa. Reduced motion usa o comportamento já existente do skeleton.

## Idempotência, falhas e limites

- Chave única: usuário + perfil + escopos + operação + documento + revisão. Reenvio igual devolve o mesmo ID; payload diferente para a mesma chave é conflito.
- Até 10 trabalhos ativos por usuário no ingresso da fila. Uma tarefa por vez por consumidor, sem `Promise.all` de PDFs.
- Reserva com `FOR UPDATE SKIP LOCKED`, token e validade de 240 s. A gravação da publicação verifica esse token na mesma transação da mutação. Um processo com reserva vencida não publica.
- Processo filho: heap V8 de 192 MB, cache Sharp desativado e concorrência Sharp 1. Watchdog no processo pai mata o filho após 180 s, inclusive se o JavaScript do filho estiver bloqueado. Só libera a vaga após a saída do filho.
- Downloads/RPCs do cliente privilegiado: timeout de 30 s. Pipeline de fotos orientativas: 60 s e limite agregado de derivados de 32 MB; Sharp possui timeout próprio de 8/10 s, conforme operação.
- Até 3 tentativas automáticas com espera crescente; retry manual estende o limite em 3, até 9 tentativas totais. Erros permanentes de permissão, validação, revisão ou limite não são repetidos automaticamente.
- Salvamento de auditoria registra a nova revisão junto da mutação. Se o processo morrer depois do commit, a próxima tentativa usa esse checkpoint em vez de alterar a revisão outra vez.
- PDF preservado usa chave imutável. Repetir uma tarefa não substitui relatório publicado.
- Entradas originais temporárias ficam em `job-inputs`, privado. Limpeza a cada 10 min, até 100 objetos maiores de 48 h por rodada, somente órfãos ou vinculados exclusivamente a tarefas concluídas. Entradas de tarefas pendentes, em execução ou com falha são preservadas. Retenção de falhas prolongadas exige acompanhamento operacional do espaço.
- Interface aguarda até 10 min; depois informa que o trabalho continua e orienta consultar Processamentos. Isso não cancela o trabalho no banco.

## Observabilidade e operação no mesmo serviço

Logs JSON: `worker_started`, `job_dispatched`, `job_started`, `job_progress`, `job_completed`, `job_failed`, `worker_error`, `maintenance_failed`, `input_cleanup` e `queue_metrics`. Campos incluem ID, tipo, tentativa, etapa, espera, duração, código e pico RSS quando disponível. Não são registrados bytes de arquivos, JWTs ou credenciais.

Métricas da fila: quantidade esperando, executando, falhas nas últimas 24 h e idade do trabalho mais antigo. Emitidas a cada 10 min pelo consumidor. Monitorar atrasos acima de 5 min, falhas, reinícios e memória do serviço; alertas externos não foram configurados.

O supervisor encerra os dois processos se um deles terminar, permitindo ao Render reiniciar o serviço. SIGTERM interrompe o filho; trabalho sem confirmação é recuperado pela reserva expirada. Não há dependência de disco persistente local para a fila ou o resultado.

**Limite desta escolha:** processos separados isolam o event loop, mas compartilham CPU e memória do serviço Render. O limite de heap não limita buffers nativos ou o RSS total. O ensaio de 30 fotos mediu cerca de 292 MiB de pico RSS do filho; não é a soma com Next/consumidor nem uma garantia para todo documento. O consumo real no Render deve ser acompanhado após publicação, especialmente durante tráfego simultâneo. Não houve teste de carga em produção.

## Evidências obtidas

Artefatos em [`evidence/jobs-20261006`](evidence/jobs-20261006/).

| Validação | Resultado / evidência |
| --- | --- |
| Migração real em PostgreSQL PGlite, rotas reais de publicação, cliente Supabase, processos filhos, Sharp e pdf-lib | 5 testes aprovados em `jobs-tests.log`. Inclui fluxo auditoria e plano, PDFs orientativos, permissões, checkpoint, duplicidade, falha transitória, lease vencido, limite de retries e watchdog. |
| Consumidor de produção | O próprio `scripts/jobs-worker.mjs` buscou, reservou, executou e concluiu a tarefa contra a infraestrutura local; logs em `integration.json`. |
| Limpeza temporária | Teste confirma preservação de entradas recentes, pendentes e com falha, além de fotos/PDFs fora do bucket temporário. |
| Relatório com 30 fotos sintéticas de 1200 × 900 | 31 páginas, aproximadamente 21,9 MB; 1,82 s no ensaio final e pico RSS 299.168 KiB. Downloads tiveram atraso artificial de 20 ms. Detalhes em `integration.json`. |
| Registro/recuperação do recibo do mesmo relatório | 1,95 ms na chamada SQL local idempotente. **Não é latência HTTP completa, upload, nem comparação percentual com produção.** Geração do PDF ficou fora dessa chamada. |
| Chrome, APIs com atraso de 600 ms e falha 503 | 6 verificações aprovadas: skeleton, retry por teclado/foco, 202 até PDF, falha sem apagar lista, XLSX real em Web Worker mantendo interação, mobile 390 px/reduced motion/árvore de acessibilidade. `browser.json` e capturas. |
| Regressões existentes | 389 testes de performance e 16 de publicação aprovados; 21 testes finais de rotas/mutações aprovados (há sobreposição entre suítes). Logs separados. |
| Compilação e lint | Build Next + 37 módulos do worker. Lint sem erros; 2 avisos preexistentes em arquivos fora desta implementação. |

O banco de teste executa SQL real, mas Storage/PostgREST são adaptadores HTTP locais com dados fictícios. PGlite não substitui um ensaio de concorrência com várias conexões no PostgreSQL hospedado. O navegador usa respostas controladas; não equivale a teste autenticado no Render ou validação manual com NVDA. Essas limitações estão registradas também nos artefatos.

## Arquivos e reprodução

O inventário exato e os hashes estão em `evidence/jobs-20261006/files.json`. Principais grupos:

- Banco: `supabase/migrations/20261006000900_background_jobs.sql`.
- Servidor: `src/lib/jobs/`, `src/jobs/execute.ts`, rotas `/api/jobs`, publicações, downloads orientativos e ações de acompanhamento.
- Runtime: `scripts/build-jobs.mjs`, `scripts/start-with-jobs.mjs`, `scripts/jobs-worker.mjs`, `scripts/lib/job-process.mjs`, `package.json`.
- Interface: `jobs-panel`, página Processamentos, feedback de publicação/PDF, menu, importação de agenda e worker da planilha.
- Testes: `test-jobs.mjs`, `test-jobs-browser.mjs`, fixture do watchdog, testes de rotas/mutações/PDF adaptados e página fictícia `/revisao-jobs` (indisponível em produção normal).

Com dependências instaladas, `npm run test:jobs` aceita `PGLITE_MODULE_PATH` apontando para o PGlite de teste, que já era utilizado na auditoria N+1. `npm run test:jobs-browser` aceita `PLAYWRIGHT_MODULE` e `JOBS_TEST_URL`.

Para revisão local isolada: `npm run build`, iniciar com `ACCESSIBILITY_REVIEW_ONLY=1 npm run start:web -- --hostname 127.0.0.1 --port 3017` e executar o teste de navegador. Não fornecer credenciais reais a esse servidor de revisão. A suíte de integração usa exclusivamente URLs locais e chaves fictícias.

## Sequência para futura publicação

1. Aplicar migração `20261006000900` antes da aplicação. Ela adiciona fila, RPCs restritas, bucket temporário e triggers de gravação dos relatórios.
2. Build existente do Render executa `npm run build`, agora incluindo o worker. Não são necessárias novas dependências de runtime nem novo serviço.
3. `npm start` inicia supervisor, Next e consumidor usando as variáveis Supabase já configuradas no servidor. `start:web` é apenas a alternativa de revisão local sem consumidor.
4. Conferir `worker_started`, saúde `/entrar`, etapas em Processamentos e publicação/arquivo de teste autorizado; acompanhar memória e `queue_metrics`.

Nenhuma migração hospedada, push ou deploy foi executado nesta tarefa.
