# Preparação do Bloco B — Diálogo Auditorias

> Atualização posterior — 13/09/2026: múltiplos perfis implementados e migration B.3 aplicada no DEV. O responsável autorizou os quatro perfis para sua conta existente, Engenharia como Coordenação e as 21 obras cadastradas. Ampliação executada por operação privada única, com nova decisão e 84 concessões perfil/obra/módulo, preservando o bootstrap e a aprovação original. Futuras aprovações aceitam combinações de perfis; Meus acessos e histórico exibem os escopos. Testes de serviço, autorização, SQL/RLS e formulário isolado passaram; aprovação com outra conta real adiada pelo responsável para 14/09/2026. Revisão/revogação genérica de contas aprovadas, módulos operacionais e Render continuam fora desta entrega. Evidências e limites em [RETOMADA.md](RETOMADA.md); os parágrafos abaixo preservam estados históricos.

> Atualização posterior — 13/09/2026: bootstrap controlado aplicado no DEV para a conta existente de Emanuel Locchi; migration B.2 versionada e histórico preservado. Área Administração → Usuários e acessos implementada para futuras aprovações com perfil, atuação de Engenharia e pares explícitos obra/módulo. Cadastro permanece pendente por padrão. Conferência remota, testes executados e limites atuais em [RETOMADA.md](RETOMADA.md) e procedimento em [BOOTSTRAP_ADMINISTRATIVO.md](BOOTSTRAP_ADMINISTRATIVO.md). B.2 continua parcial: aprovação com segunda conta real, recusa, revisão/revogação pela interface e concorrência de conexões ainda não validadas/entregues. Módulos operacionais e Render continuam fora desta rodada. O texto abaixo preserva o planejamento e os estados históricos; não repetir o bootstrap ou B.1.

## Estado atual — 13/09/2026 — Cadastro desbloqueado; teste manual pendente

**Migration aplicada pelo responsável no Supabase DEV; estrutura conferida remotamente.** A consulta de catálogo somente leitura confirmou `public.access_requests`, PK/FK e cinco CHECKs, RLS habilitada, uma policy `access_requests_select_own` para SELECT próprio e ausência de escrita por `anon`/`authenticated`. O trigger `dialogo_sync_access_request` está ativo; sua função `SECURITY DEFINER` com `search_path` vazio cria o registro atomicamente com Auth usando `NEW.id`, status constante `PENDENTE_APROVACAO` e confirmação derivada de Auth. A tabela vazia foi informada pelo responsável antes do teste. Isso comprova estrutura, não testes de isolamento com contas reais.

O aviso de solicitação em preparação vinha do gate RPC em `requestAccess()`, antes de `auth.signUp`: qualquer erro ou retorno diferente de `1` bloqueava o cadastro. **Removido somente esse gate temporário; nenhuma policy INSERT, migration nova ou outro `db push` é necessário.** A função de versão continua como diagnóstico e retornou `1` nesta rodada. O erro de transporte da tentativa original não foi recuperado; não atribuir uma causa de rede específica ao relato.

O responsável confirmou Site URL `http://127.0.0.1:3001` e Redirect URL `http://127.0.0.1:3001/auth/callback` salvas no painel. A prévia 3001 foi atualizada com o build corrigido e `APP_URL` somente no processo; a porta 3000 foi preservada. Não existe rota pronta de recuperação. Confirmação continua obrigatória; SMTP corporativo não foi alterado.

**Resultados desta correção:** lint, TypeScript e build aprovados; autenticação **24/24**, Supabase offline **10/10**, ranking **14/14**, acesso **16/16**, contexto **15/15**, navegação e catálogo de Segurança **205 itens** aprovados. Navegador desktop/celular verificou formulários, domínio inválido, senhas divergentes, quatro rotas restritas para anônimo e callback sem código na mesma origem, sem dados operacionais/erros de página. `verify:supabase`: conectado, sessão ausente. `verify:auth-setup`: versão `1`, e-mail/cadastro habilitados, confirmação obrigatória e `ready_for_authorized_test`; falha de conexão no sandbox resolvida na repetição autorizada. O teste com SDK SSR real e transporte simulado confirma POST Auth sem RPC/escrita REST, PKCE/cookies e callback correto; não cria conta nem comprova RLS remoto.

**Próximo passo:** o responsável realiza o cadastro manual em `http://127.0.0.1:3001/solicitar-acesso` e segue confirmação/login/consulta própria/bloqueio operacional/logout. Isolamento entre identidades e impedimento de autoalteração de status continuam pendentes de sessão real autorizada. Não houve conta ou e-mail criado pelo agente. SMTP padrão pode restringir a caixa de teste; não contornar alterando confirmação ou acessos administrativos. **B.1 permanece parcial.** Detalhes, limites e comandos para reabrir estão em [RETOMADA.md](RETOMADA.md).

## Histórico — tentativa de validação anterior à aplicação externa

O registro abaixo descreve a rodada anterior. As instruções de login/migration eram pendências históricas e foram superadas pelo estado atual; não repetir aplicação para esta correção.

**Estado daquela rodada — 13/09/2026, tentativa de validação prática:** migration **não aplicada**; Supabase CLI **2.117.0** disponível via `npx`, mas sem autenticação administrativa. Não havia configuração/vínculo local do CLI. A consulta oficial retornou login necessário, e a execução parou antes de `init`, `link` ou SQL, conforme instrução do responsável. A orientação então era executar diretamente no terminal `npx.cmd --yes supabase@2.117.0 login`, sem enviar credenciais na conversa, e depois retomar o vínculo conferido ao DEV e a aplicação rastreável de **somente `20260913000100_access_requests.sql`**. Não houve instalação de dependência do aplicativo nem mudança no arquivo da migration.

`verify:auth-setup` foi executado novamente: Auth acessível, e-mail/cadastro habilitados, confirmação obrigatória e `requestSchema: migration_pending` (`schema_pending`, saída 1). A existência da tabela, RLS, policies/constraints e inventário remoto **ainda não foi certificada por consulta de catálogo**. Revisão SQL prevê `public.access_requests` com 9 colunas, status exclusivamente `PENDENTE_APROVACAO`, RLS e SELECT apenas próprio, sem escrita pelo usuário. Nenhuma conta criada, mensagem enviada ou teste com privilégios elevados simulando um usuário.

**URLs do teste atual:** Site URL `http://127.0.0.1:3001`; Redirect URL/callback de confirmação `http://127.0.0.1:3001/auth/callback`, derivados de `site-url.ts` e da rota real. GET local confirmou formulário HTTP 200 e retorno do callback HTTP 307 à entrada nessa origem. No painel DEV: **Authentication → URL Configuration → Site URL / Redirect URLs → Add URL**; salvar os valores acima. Estado salvo no painel ainda não conferido/alterado. Não há rota de recuperação pronta; não inventar URL. SMTP e confirmação permanecem inalterados.

Roteiro da conta controlada e revisão completa registrados em [RETOMADA.md](RETOMADA.md). O próprio responsável fará o cadastro somente depois da migration e das URLs. Testes de autoalteração e isolamento devem usar sessão real sem `service_role`; outro usuário autenticado exige contexto adicional autorizado, não se comprova com uma única conta ou chamada anônima. Não executar o SQL com fixtures no DEV compartilhado. **B.1 segue parcial** até comprovar cadastro, solicitação persistida, sessão, logout e RLS.

Lint, TypeScript, build, `verify:supabase` e testes de acesso/autenticação **após a migration não foram executados nesta rodada**, porque a aplicação parou no login administrativo necessário. Executá-los após resolver esse pré-requisito e aplicar/conferir a migration; resultados anteriores abaixo são históricos, não evidência nova. Somente plano e retomada foram atualizados, sem alterar aplicação ou publicar.

## Situação consolidada da primeira parte de B.1

Conexão real com Supabase DEV confirmada pelo responsável e novamente verificada por `npm.cmd run verify:supabase`: configuração presente, clientes inicializados, Auth acessível, nenhuma sessão e estado `connected`. As duas variáveis locais estão configuradas; seus valores não são registrados. O relato anterior de `.env.local` vazio está superado e preservado no histórico da seção 12.

Código entregue para Entrar, Solicitar acesso, cadastro e login pelo Supabase Auth, logout e acompanhamento autenticado sem liberação operacional. Inclui callback de confirmação, clientes oficiais com cookies SSR, renovação/verificação de identidade pelo Proxy e `getUser()`, validação no servidor e bloqueio das rotas operacionais. A identidade autenticada não vira aprovação; qualquer conta continua sem operação nesta subetapa. **B.1 permanece parcial e não concluído:** a estrutura mínima está aplicada, mas cadastro, sessão, logout e RLS com conta controlada ainda precisam de comprovação.

| Entrega ou configuração | Situação atual |
| --- | --- |
| Supabase DEV e configuração local | Conexão real confirmada; nenhuma credencial divulgada. Não comprova tabelas, envio ou permissões. |
| T01 inicial | Telas Entrar, Solicitar acesso e Aguardando liberação; integração real de cadastro/login e logout no código. Recuperação de senha fica em preparação. Resultados finais da execução e das verificações locais em [RETOMADA.md](RETOMADA.md). |
| Solicitação mínima | Migration versionada [20260913000100_access_requests.sql](../supabase/migrations/20260913000100_access_requests.sql) aplicada pelo responsável no DEV; tabela, constraints, trigger e função conferidos no catálogo remoto. Não reaplicar nem executar outro `db push` por esta correção. |
| Proteção no banco | RLS e policy SELECT própria conferidas; cliente sem escrita, status exclusivamente `PENDENTE_APROVACAO`, ID e confirmação derivados do Auth. Testes com sessões reais continuam pendentes. |
| Condição para cadastrar | Validação de formulário/servidor seguida diretamente de `auth.signUp`. A solicitação é criada pelo trigger do Auth, sem INSERT pelo cliente. Gate RPC temporário removido; função de versão mantida somente para diagnóstico. |
| E-mail e teste de conta | E-mail/cadastro habilitados, confirmação obrigatória, URLs da porta 3001 salvas pelo responsável e callback local conferido. SMTP corporativo, remetente autorizado e entrega real permanecem pendentes. Nenhuma conta corporativa criada nem mensagem enviada pelo agente. |
| Testes SQL | [access_requests.sql](../supabase/tests/access_requests.sql) preparado para banco local isolado e transação com `ROLLBACK`, sem chamadas Auth HTTP ou envio. **Não executado**; testes offline não comprovam RLS efetivo. |
| Aprovação e operação | Administrativo funcional, permissões por obra/módulo/responsabilidade, persistência de auditorias/agenda e Storage não implementados. Não há liberação automática, chave privilegiada na aplicação ou mudança de D01/D02/D03. |

**Próxima ação concreta:** o responsável tenta novamente Solicitar acesso com a conta controlada e valida a sequência de confirmação, login, solicitação própria pendente e logout. Banco e URLs já não aguardam aplicação/configuração inicial. A seção 7 detalha os limites restantes; não solicitar credenciais nem avançar automaticamente para B.2.

Conferência local da correção: lint, TypeScript, build, 24 testes de autenticação e regressões existentes passaram, com os limites registrados em [RETOMADA.md](RETOMADA.md). Navegador aprovado no build atualizado em `http://127.0.0.1:3001`; o processo anterior na porta 3000 foi preservado. Sessão real e testes RLS com usuários continuam pendentes; inspeção do catálogo não equivale a esses testes. A prévia local não significa publicação do piloto.

Registro original: 12/09/2026, após a conferência visual do Bloco A relatada pelo responsável. Naquela rodada houve **somente documentação de preparação**, sem implementação. A autorização posterior cobre o recorte de B.1 descrito acima; não estende automaticamente a autorização às demais subetapas, serviços ou publicação.

**Decisão vigente — D03, infraestrutura e retenção, 13/09/2026:** GitHub para código, primeira instância paga do Render para o piloto e Supabase Free para autenticação/banco/arquivos; desenvolvimento separado do piloto, com expansão futura sem contratar capacidade de longo prazo agora. A escolha não comprovava configuração na rodada documental; a conexão do Supabase DEV foi confirmada posteriormente, conforme estado atual acima. Contratação/publicação do piloto não foram executadas. Fotos avulsas: elegibilidade em publicação concluída registrada pelo servidor + 30 dias corridos, sujeita a todas as proteções; PDF com imagens incorporadas e dados estruturados preservados. Decisão integral em [ADENDO_INFRAESTRUTURA_RETENCAO.md](ADENDO_INFRAESTRUTURA_RETENCAO.md). **P12 parcialmente resolvida**, configuração/envio/responsáveis/backup/exceções e outros detalhes pendentes. Nenhuma rotina, simulação ou exclusão de fotos implementada ou executada.

**Decisão preservada — D02, cadastro/autenticação:** o responsável confirmou e-mail corporativo do domínio exato `dialogo.com.br` + senha própria da plataforma, solicitação de acesso, confirmação de e-mail pelo serviço e aprovação administrativa obrigatória. A senha criada no cadastro continua após aprovação, independente da Microsoft. Decisão completa e histórico de precedência em [ADENDO_CADASTRO_AUTENTICACAO.md](ADENDO_CADASTRO_AUTENTICACAO.md). Implementação iniciada apenas no recorte atual; o fluxo integral não está concluído. P11 parcialmente resolvida; a situação de P12 pendente à época foi atualizada por D03. As subetapas abaixo foram compatibilizadas com os adendos, sem modificar o escopo original.

## 1. Base e limites

O [escopo revisado](../PROMPT_DIALOGO_AUDITORIAS_ESCOPO_REVISADO.md) foi relido por intervalos até **FIM DO ESCOPO REVISADO**. A definição do B está na Parte I, seção 12: contas reais, usuários/vínculos, obras, rascunhos e arquivos persistentes, com isolamento dos dados; avanço condicionado a provedor/configuração definidos e testes reais de acesso/salvamento. Complementam o recorte T01/T02/T04–T09/T13/T18/T19 e as seções 17–18 da Parte II.

Foram examinados AGENTS.md, CLAUDE.md, package.json, README, [RETOMADA.md](RETOMADA.md), [PLANO.md](PLANO.md), [MATRIZ_ACESSOS.md](MATRIZ_ACESSOS.md), [PERMISSOES.md](PERMISSOES.md), [MAPA_TELAS.md](MAPA_TELAS.md), [PENDENCIAS_ESCOPO_REVISADO.md](PENDENCIAS_ESCOPO_REVISADO.md), pendências metodológicas e o código atual. A matriz antiga continua superada; as matrizes canônicas não foram substituídas por outra proposta neste plano.

**Confirmado:** quatro perfis principais, Engenharia com Equipe da obra/Coordenação; D01 atribui agendamento e reagendamento ao Administrativo. Auditor realiza sua auditoria autorizada, sem receber edição da agenda. Autoria administrativa e responsabilidade técnica são diferentes. A consulta da Coordenação à agenda é condicional; documentos/anexos não se tornam irrestritos para AD.

**Documental:** catálogos e versões locais, incluindo pesos já fornecidos, devem ser preservados. **Confirmado posteriormente em D02:** método, domínio e fluxo de cadastro/liberação. **Confirmado em D03:** infraestrutura inicial, separação de ambientes e retenção das fotos avulsas. **Proposta técnica:** a divisão B.0–B.6 e desenho de integração abaixo. **Pendente:** demais decisões aplicáveis de P01–P12, configuração dos serviços escolhidos e detalhes de operação/backup. As decisões confirmadas não comprovam implementação.

D01 prevalece sobre as frases residuais das seções 02/03 que ainda atribuem agenda ao auditor. **Não resolve P08:** agenda/ata do comitê permanece sem responsável definido. Cálculo oficial, publicação, aprovação de auditorias, planos e comitê operacional não fazem parte desta preparação nem serão habilitados como efeito da persistência. Não há comitê de Qualidade, modo offline ou integração automática com sistemas externos neste recorte.

## 2. Conferências relatadas pelo usuário

Fonte das evidências abaixo: relato do responsável nesta rodada. Não foram repetidas pelo agente nem ampliadas para cenários não relatados.

| Conferência manual/visual relatada | O que foi observado | O que não comprova |
| --- | --- | --- |
| Agendamento administrativo | AD agenda e a visita aparece para o auditor designado. | Gravação persistente, autoria autenticada ou negação de requisição direta. O relato desta rodada não certifica reagendamento persistente. |
| Rascunhos | Preenchimento e retomada na mesma sessão; respostas/observações independentes por item. | Recuperação após recarregar, sair/entrar ou trocar de aparelho. |
| Engenharia / Equipe da obra | Sem ações de criação ou edição do rascunho do auditor na interface mostrada. | Impossibilidade de obter/alterar dados por API, banco ou arquivo. |
| Auditor de Qualidade | F.175/F.176 disponíveis e ausência de Comitê de Segurança no menu mostrado. | Todas as combinações de permissões, concessões e acesso direto. |
| Coordenação / Jardim Norte | Agenda indisponível conforme a concessão do cenário de teste. | Proteção real da consulta ou correção de todos os indicadores do painel. |

Essas observações complementam as evidências locais anteriores do A, mas **não aprovam todos os testes de segurança nem o piloto**. A02, A06, A09, A14 e A16 operacionais continuam pendentes; os demais aceites mantêm os limites do mapa canônico.

## 3. Diagnóstico histórico do código na preparação documental

Esta seção preserva o exame anterior à instalação dos clientes e à primeira parte funcional de B.1. As ausências de configuração/autenticação descritas aqui não substituem o estado atual no início deste plano. Agenda, auditorias, respostas demonstrativas e arquivos continuam sem persistência operacional; a migration do cadastro mínimo foi aplicada posteriormente e sua estrutura conferida no DEV.

### Identidade, vínculos e permissões

`src/domain/prototype-access.ts` define `DemoUser`: `id`, `name`, um `role`, `activity` opcional de Engenharia, `modules`, `workIds`, `agendaWorkIds` e `documentWorkIds`. `demoUsers` contém seis identidades fictícias fixas. Não são contas provisionadas. `ProfileSimulator`, em `prototype-workspace.tsx`, escolhe uma delas; `userId` fica no estado React de `prototype-app.tsx`.

As funções `canAccessWork`, `canAccessModule`, `canConsultAgenda`, `canReadVisit`, `canReadAudit`, `canEditAudit` e `canReadOperationalDocuments` filtram consultas e comandos locais. Edição verifica auditor responsável, obra, disciplina e situação não publicada. `canEditCommitteeSchedule` retorna falso por P08. As concessões de teste C† não são autorizações reais aprovadas.

**Lacuna de modelagem:** `modules` e `workIds` são listas independentes. Seu cruzamento não representa uma concessão por combinação específica de obra, disciplina e atuação. Uma conta autorizada a Qualidade em uma obra e Segurança em outra não pode herdar ambas em todas as obras. Um `role` único também não resolve a proposta de múltiplas funções de P11. Não basta gravar `DemoUser` no banco e tratá-lo como modelo final.

**Lacuna de proteção:** os dados iniciais e a política são importados por componentes cliente; as listas são filtradas depois de carregadas. O usuário do simulador é fornecido pelo próprio cliente. Isso não constitui autenticação, isolamento de dados ou autorização de requisições. No B, identidade e concessões precisarão vir de fonte verificada no servidor; resultados não autorizados não devem ser enviados ao navegador para então serem ocultados.

### Agenda, auditorias, respostas e arquivos

| Dados | Local/estrutura real | Limitação |
| --- | --- | --- |
| Obras e auditorias iniciais | Constantes `workRecords`/`auditRecords` em `operational-records.ts`; duas obras e duas auditorias com `isDemo: true`, sem nota final. | Sem cadastro, banco ou recuperação de alterações. Nomes de engenheiro/coordenador são textos de exemplo, não concessões de acesso. |
| Visitas iniciais | `initialVisits` em `prototype-access.ts`. | Exemplos em código; `Visit` não tem marcador próprio `isDemo`, embora todo o fluxo atual seja demonstrativo. Não importar automaticamente para ambiente real. |
| Visitas criadas/reagendadas | `useState(visits)` em `prototype-app.tsx`. `Visit` guarda `createdBy`/`createdAt`, `auditorId` e histórico de datas/autoria. | Histórico somente em memória. IDs e horários são produzidos no cliente; não são trilha confiável de servidor. |
| Auditorias da sessão | `useState(session)` com `PrototypeAuditState.audits`. `beginPrototypeAudit` cria ou retoma por visita. | A função aceita apenas obra demonstrativa e cria `isDemo: true`. Não remover essa proteção para converter exemplos em dados operacionais. |
| Respostas/observações | `session.responses[auditId][modelId][criterion.id]`; `ItemResponse` em `audit-draft.ts` contém resposta opcional e `note`. | Não há gravação externa nem controle de versão concorrente. Justificativa usa a observação; não há estrutura persistente de medições/anexos. |
| Modelo/versão | IDs/labels fixos para IT.07 R02, F.175/00 e F.176/00 e catálogos locais. | É base reaproveitável, mas não há repositório persistente de revisões nem cópia protegida da versão usada. |
| Fotos/anexos | Não há implementação de seleção/envio, metadados de arquivo, armazenamento privado ou download autorizado. | Texto digitado como evidência não é arquivo anexado. Medições continuam com botão desabilitado. |
| Relatório | `AuditPreview` e `window.print()` mostram identificação do contexto. | Sem respostas/anexos, exportação recuperável, PDF armazenado ou publicação. |
| Marco para retenção D03 | `AuditRecord` tem data de inspeção, sem data/hora de publicação concluída emitida pelo servidor. | A data da inspeção e estados demonstrativos de teste não iniciam prazo; não há rotina de retenção nem publicação real. |

Fechar ou recarregar a página perde visitas, histórico e preenchimentos criados na sessão. As constantes reaparecem porque estão nos arquivos; não contêm os dados digitados. Não há `localStorage`, `sessionStorage`, IndexedDB, autosalvamento persistente ou backup/restauração implementados.

`VisitAgenda` usa callbacks síncronos e confirma registro **nesta sessão**. Ao integrar persistência, os callbacks deverão aguardar confirmação real, tratar falhas e manter o conteúdo não confirmado visível. Acrescentar uma chamada assíncrona sem mudar esse contrato poderia anunciar sucesso antes de gravar.

### Configuração: somente existência e situação

A inspeção considerou os arquivos locais, dependências, estrutura de `src` e pontos de integração. Nenhum valor de variável, senha, token ou chave foi impresso ou incluído neste documento. Não houve acesso a painéis de fornecedores ou tentativa de conexão externa.

| Configuração/integração | Existe no projeto examinado? | Situação |
| --- | --- | --- |
| Aplicação Next.js/React/TypeScript | Sim. | Base existente; nenhuma dependência instalada ou alterada nesta preparação. |
| Autenticação real e sessão verificada | Não identificada. | Pendente. |
| Integração Microsoft / autenticação corporativa externa | Não identificada. | Nenhuma integração removida; D02 confirma senha própria da aplicação. |
| Confirmação/recuperação por e-mail, remetente e fila de solicitações | Não identificados. | Fluxo confirmado em D02; serviços/configuração/implementação pendentes. |
| Banco, cliente de dados e migrações | Não identificados. | Pendente. |
| Armazenamento privado de arquivos | Não identificado. | Pendente. |
| API/ações de servidor para gravação e autorização | Não identificadas. | Pendente. |
| Arquivos `.env*` na raiz | Não encontrados. | Configuração das integrações pendente; não há contrato de variáveis do provedor implementado. |
| Uso de configuração de ambiente em `src` para essas integrações | Não identificado. | Pendente. |
| Backup/restauração e ambiente de homologação conectado | Não identificados. | Pendente. |
| Serviços/contas eventualmente existentes fora do projeto | Não verificados. | O responsável deve informar existência e situação, sem fornecer credenciais no chat. |

Ausência local não prova inexistência de uma conta corporativa externa. Supabase era proposta na documentação anterior; **D03 confirma Supabase Free como escolha inicial**, sem comprovar conta/projeto configurado nem autorizar sua criação nesta execução. Render pago para o piloto e GitHub para o código também são decisões, não verificações de contratação/configuração externa.

### O que aproveitar

- Layout e CSS existentes, contexto visível, catálogos e navegação de `audit-workspace.tsx`, incluindo busca, orientações, zero e observações independentes.
- `prototype-access.ts` como referência testável de intenção, separando os dados fictícios da futura política de servidor e refinando concessões por contexto.
- `prototype-audits.ts`, `audit-draft.ts` e identificadores dos itens para preservar início vazio, retomada e independência; adaptar a camada de dados sem reconstruir o formulário.
- `visit-agenda.tsx` e `Visit` para campos, D01 e histórico; preservar distinção entre programação e inspeção.
- Telas de Obras/Administração para os cadastros mínimos aprovados; referências de roteiro fixas para o primeiro armazenamento, sem implementar a manutenção completa do C.
- Testes de navegação, catálogo, acesso, contexto e ranking como regressões. Os testes puros atuais não substituem testes com sessões reais, requisições diretas e armazenamento.

## 4. Subetapas propostas

As regras confirmadas em D02/D03 orientam o plano; a divisão técnica permanece referência de desenvolvimento. B.1 recebeu autorização posterior somente para a primeira parte funcional descrita no estado atual. As demais entregas não estão automaticamente autorizadas ou concluídas. Cada subetapa termina com evidência, pendências e conferência antes da próxima autorização. Caminhos inicialmente propostos cedem aos arquivos efetivamente implementados no registro atual e na retomada.

### B.0 — Definições mínimas e ambiente de teste

- **Entrega esperada:** detalhar configuração autorizada do Supabase Free de desenvolvimento, separado do piloto; responsáveis, identificação/região do projeto, disponibilidade e configuração segura. Definir envio de e-mails e remetente autorizado. Aplicar método/domínio D02 e escolhas D03 sem pedi-los novamente. Delimitar a próxima entrega a B.1, sem contratar Render ou configurar o piloto nesta etapa.
- **Pré-requisitos:** informações da seção 7 deste plano. Decisões parciais pertinentes de P11/P12; os IDs permanecem abertos para as demais questões. Não criar serviços para descobrir depois se são aceitos.
- **Arquivos/componentes:** documentação deste plano, retomada e registro de decisões. Nenhum código, conta, serviço ou migração nesta preparação.
- **Testes de acesso e salvamento:** não executáveis nesta subetapa documental. Revisar se o desenho prevê identidade individual, separação de ambientes, permissões verificadas e confirmação de gravação; marcar testes operacionais como pendentes.
- **Condição para avançar:** responsável completa os pré-requisitos e autoriza especificamente a configuração de desenvolvimento/B.1 e seus recursos. Escolha de fornecedor não autoriza criar serviços automaticamente; sem essa definição, a integração não começa.

### B.1 — Solicitação de acesso, confirmação e sessão restrita de conta

**Andamento atual: parcial.** Código de Entrar/Solicitar acesso, Auth real, callback, logout e estado autenticado pendente implementados no recorte. Migration mínima aplicada no DEV, estrutura/policy/trigger conferidos e gate RPC temporário removido; testes com contas reais e SQL de instância isolada não executados. Recuperação, reenvio completo, aprovação e demais controles de B.2 continuam fora da entrega atual. Não tratar conexão, catálogo ou SDK com transporte simulado como comprovação de cadastro, entrega de e-mail, sessão ou isolamento real.

- **Entrega esperada:** T01 com Entrar, Solicitar acesso, Confirmar e-mail/reenvio, Acompanhar a própria solicitação, Esqueci minha senha, Definir nova senha, Minha conta e Sair. E-mail válido do domínio exato `dialogo.com.br` e senha própria criada pelo solicitante. Após confirmação pelo serviço, pessoa autenticada vê “E-mail confirmado. Aguardando liberação do Administrativo.” Somente dados próprios de conta/solicitação, sem dados operacionais ou lista corporativa de obras.
- **Pré-requisitos:** B.0; autenticação, banco de solicitações e envio de mensagens autorizados/configurados; remetente aprovado; caixas corporativas reais de teste controladas e autorização para envio. Validação de formato/domínio no servidor, comparação consistente de e-mails sem remover pontos/sufixos da parte local, política de senha/links/reenvios e configuração segura detalhadas antes do código. Não enviar a endereços fictícios. Procedimento do primeiro AD controlado, nunca pelo primeiro cadastro.
- **Arquivos/componentes:** T01 em `page.tsx`, `prototype-app.tsx` e `prototype-workspace.tsx`; novos módulos de identidade, solicitações e sessão restrita no servidor, callbacks de confirmação/recuperação e armazenamento protegido quando autorizados; testes de integração. Não persistir senhas nos registros da aplicação. Demonstração isolada. Detalhamento funcional e fonte das regras: D02 e `MAPA_TELAS.md`.
- **Testes de acesso e salvamento:** D02-T01–T05, T08, T10, T12–T14/T16 no alcance já implementado: domínio/formatos rejeitados, confirmação não forjável, conta pendente sem operação, acompanhamento próprio, senhas/links protegidos, recuperação sem concessão e reenvios sem sobrescrita de conta existente. Sessão anônima/expirada e troca de ID não contornam o bloqueio. Solicitação confirmada persiste após nova entrada. Não executar entrega real a endereços sintéticos. Testes integrados com decisão/revogação dependem de B.2.
- **Condição para avançar:** concluir cadastro, confirmação, login, consulta própria, logout e testes RLS com sessões autorizadas; migration e URLs já conferidas não precisam ser reaplicadas. Resolver envio autorizado se o SMTP padrão impedir o teste. Pendente continua sem dados operacionais. Identidade, e-mail, aprovação, atividade e concessões são controles separados, sem fallback para o simulador. A fila e a liberação completa ficam em B.2, não são declaradas concluídas por B.1. O escopo integral de B.1 permanece aberto; etapas seguintes exigem nova autorização.

### B.2 — Fila administrativa, liberação e concessões de usuários/obras

- **Entrega esperada:** T19 → Solicitações pendentes somente com e-mail confirmado pelo serviço; mostrar nome, e-mail confirmado, informações declaradas, datas de solicitação/confirmação. AD autorizado aprova e define acessos ou recusa; consulta quem decidiu/quando; revisa permissões e revoga preservando autoria/histórico. Aprovação mantém a senha criada no cadastro. Persistir os cadastros mínimos de T18 necessários às concessões, por combinação específica de obra, módulo e atuação. Aprovação de acesso não é aprovação de auditoria.
- **Pré-requisitos:** B.1; primeiro AD designado por procedimento controlado; banco/políticas aprovados; campos mínimos e concessões iniciais documentados (P11), recorte de P09 aplicável. “Aguardando aprovação” é situação, não perfil. Cargo/área e obra de referência não viram obrigatórios ou concessões por inferência. Múltiplas funções, alteração de e-mail e reapresentação após recusa dependem do detalhamento pertinente. Cópia/recuperação antes de migrações com dados existentes.
- **Arquivos/componentes:** `operational-records.ts`, separação/refino de `prototype-access.ts`, `Works` em `operational-views.tsx`, `AdministrativePanel`, contexto da aplicação; novos repositórios de solicitação/decisão/concessão no servidor, políticas de banco e migrações somente quando autorizadas. Identidade, confirmação, aprovação, atividade e acessos não são campos confiados ao cliente.
- **Testes de acesso e salvamento:** D02-T04–T12/T15–T16: fila só de confirmados; aprovação por AD autorizado e com decisão persistente; entrada com a senha original; sem autoaprovação/autoelevação; repetição/concorrência sem conta ou decisão sobrescrita; recuperação sem aprovar/reativar/promover. Conta revogada com sessão já aberta perde acesso operacional; não presumir vínculo com bloqueio Microsoft. Testar isolamento direto por obra/módulo/responsabilidade, C† e combinações sem cruzamento de listas. Senhas e tokens nunca presentes nos cadastros/logs. Nenhuma lista de obras disponibilizada ao solicitante pendente.
- **Condição para avançar:** fluxo T01/T19 completo testado com contas reais autorizadas, concessões persistidas e verificadas no servidor/dados, sem exemplos convertidos em registros reais. Falha de acesso/salvamento bloqueia avanço. B.3 exige autorização específica; aprovação de conta não habilita publicação ou novos fluxos técnicos.

### B.3 — Agenda persistente com D01

- **Entrega esperada:** AD cria/reagenda visitas com gravação confirmada, autor administrativo obtido da sessão verificada e auditor designado validado; histórico persistente de datas/autoria; consulta conforme disciplina/obra/responsável e C†. Preservar a data da inspeção já iniciada.
- **Pré-requisitos:** B.1/B.2; cadastro e vínculos do auditor válidos; convenção de datas/fuso registrada. Cancelar visita, substituir auditor e trocar modelo/versão continuam indisponíveis enquanto P10 estiver pendente. Sem notificações/recorrência/atrasos presumidos em P04.
- **Arquivos/componentes:** `visit-agenda.tsx`, callbacks de `prototype-app.tsx`, domínio de visitas atualmente em `prototype-access.ts`; novo repositório/serviço autorizado de agenda, histórico e testes de integração.
- **Testes de acesso e salvamento:** AD grava e recarrega; auditor designado consulta em sessão independente, mas requisição direta de criação/reagendamento por AQ/AS/Engenharia falha; AD não cria auditoria técnica. EO só consulta suas obras; EC sem C† não recebe agenda nem contagem. Conferir histórico, identidade do autor e persistência após sair/entrar. Repetir requisição não duplica visita/histórico; duas edições concorrentes não se sobrescrevem silenciosamente; falha de gravação não mostra salvo.
- **Condição para avançar:** D01 funciona com sessões reais e dados confirmados, inclusive testes negativos diretos; reagendamento não modifica respostas/inspeção. Não avançar com falha de concorrência/salvamento conhecida.

### B.4 — Rascunhos e respostas persistentes

- **Entrega esperada:** T06/T08/T09 retomam o registro confirmado em outra sessão/aparelho, mantendo obra, auditor responsável, modelo/versão e item estável. Exibir salvando/salvo/falha de modo fiel. Congelar a referência da versão utilizada sem criar administração de modelos do C. Notas permanecem pendentes; opções qualitativas atuais não se tornam metodologia oficial.
- **Pré-requisitos:** B.1/B.2 e agenda B.3 para o fluxo vinculado; contrato de dados e salvamento aprovados. P01/P02 não impedem guardar coleta sem nota; P05/P06 não são resolvidas pelo salvamento. P10 mantém bloqueadas transferência de autoria/migração de modelo/versão.
- **Arquivos/componentes:** adaptar `prototype-audits.ts` e a camada de estado de `prototype-app.tsx`; aproveitar `audit-draft.ts`, `audit-workspace.tsx`, `StartAudit` e `AuditList`; novos repositórios e políticas para auditorias/respostas, sem alterar o conteúdo dos catálogos.
- **Testes de acesso e salvamento:** dois auditores da mesma disciplina/obra não editam os rascunhos um do outro, inclusive por requisição direta; AQ/AS não cruzam disciplinas; AD/Engenharia não preenchem. Obra ou auditor adulterados no pedido não mudam autoria. Preencher dois itens com 5/10 e observações próprias, depois 0/N/A/vazio; confirmar, recarregar e entrar em outro navegador/aparelho. F.175/F.176 separados; nova auditoria vazia; repetir início pela visita não duplica; manter respostas ao navegar durante salvamento; simular atraso, falha e conflito de abas.
- **Condição para avançar:** nenhum sucesso antes da confirmação persistente, recuperação reproduzível e ausência de mistura/sobrescrita silenciosa. Operações sobre qualquer registro marcado publicado são recusadas na camada de dados; isso testa o bloqueio, não implementa nem aprova emissão/imutabilidade integral do D.

### B.5 — Anexos privados da inspeção

- **Entrega esperada:** upload e consulta autorizada de evidências por auditoria, versão e item; metadados persistentes vinculados ao arquivo; estados de envio/confirmado/falha. Arquivo e vínculo devem estar confirmados antes de aparecer como salvo. Classificar fotos avulsas separadamente de PDFs, planos, apresentações e outras categorias, preservando vínculos para a futura retenção D03. Tipos e limites técnicos definidos pelo responsável, sem inventar anexos obrigatórios de publicação (P06). Não implementar publicação ou limpeza em B.5.
- **Pré-requisitos:** B.4; Supabase Storage privado configurado com autorização; decisões de tipos, tamanho, volume, capacidade e cópias pertinentes a P12; concessões necessárias de consulta em P09. Prazo/marco da retenção já confirmados em D03; detalhes de backup/exceções ainda pendentes. Não liberar AD ou consulta externa à discussão por inferência. Regras de substituição/remoção de rascunhos e tratamento de envio incompleto precisam ser registradas antes de habilitar tais ações; D03 não autoriza limpar fotos de rascunhos.
- **Arquivos/componentes:** estender `ItemResponse` ou criar entidade própria de evidência, formulário T09 em `audit-workspace.tsx`, serviços/metadados de arquivo, autorização no servidor e políticas de armazenamento; testes de upload/download. Não usar pasta pública da aplicação para evidências.
- **Testes de acesso e salvamento:** somente auditor responsável autorizado envia; outro auditor, obra, disciplina, usuário anônimo ou revogado não obtém arquivo/metadados por URL/ID. Testar acesso direto, listagem, prévia e download; proteger também miniaturas. Se houver URLs temporárias, validade e efeitos da revogação devem ser definidos e testados, sem prometer revogação instantânea de URL ainda válida. Validar tipo/tamanho no servidor, confirmar arquivo e vínculo, recarregar e recuperar; simular falha parcial e repetição sem duplicidade/arquivo trocado entre itens.
- **Condição para avançar:** arquivos efetivamente privados e recuperáveis com seus vínculos; falhas não geram indicação falsa de envio. Nenhuma substituição de evidência publicada. A exceção D03 só poderá remover a cópia fotográfica avulsa em etapa posterior específica, após publicação, backup e todas as proteções; não habilitar limpeza no B. Não aprovar A15, pois documento emitido ainda não existe.

### B.6 — Conferência integrada do recorte persistente

- **Entrega esperada:** roteiro reproduzível de contas, obras, vínculos, agenda, rascunhos e arquivos; resultados por cenário e evidência; limites de recuperação documentados. Consolidar testes de falha, concorrência e separação da demonstração que já devem acompanhar cada gravação em B.3–B.5.
- **Pré-requisitos:** subetapas anteriores verificadas; conjunto de contas individuais e obras de teste aprovado; ambiente isolado para falhas/recuperação, sem afetar dados operacionais. Política de backup definida para o recorte armazenado.
- **Arquivos/componentes:** testes de integração/navegador, scripts autorizados de verificação/recuperação e documentação. Reusar regressões existentes de catálogo/navegação/acesso/contexto/ranking. Não ampliar para cálculos, publicação, planos ou comitê.
- **Testes de acesso e salvamento:** percorrer D01 com contas distintas; salvar, sair/entrar e conferir em segundo contexto de navegador e aparelho quando disponível; negar acesso direto e metadados de outra obra; revogar durante a sessão; rede intermitente, timeout após gravação, reenvio e duas abas. Conferir banco/arquivos/vínculos por recuperação em ambiente de teste se autorizada; nunca restaurar por cima de dados existentes para testar. Reportar separadamente o que não foi executado.
- **Condição para avançar:** evidências reais do recorte, falhas relevantes corrigidas e decisão do responsável sobre o próximo trabalho. Recuperação limitada de rascunhos não aprova A16 completo nem o piloto do F. Blocos C–F exigem autorização própria.

## 5. Contratos de dados e salvamento a detalhar antes do código

As regras de identidade/liberação de D02 e infraestrutura/retenção de D03 são confirmadas; a estrutura técnica abaixo ainda será detalhada na respectiva subetapa e não é um esquema de banco já implementado:

| Área | Contrato a preservar na implementação futura |
| --- | --- |
| Identidade | ID estável da identidade autenticada, separado do nome apresentado; permissões vindas de fonte protegida, nunca de um perfil enviado livremente pelo cliente. |
| Solicitação e liberação | Identidade autenticada, confirmação do e-mail pelo serviço, aprovação administrativa, conta ativa e concessões vigentes são controles separados. Fila só após confirmação. Acompanhamento restrito à própria pessoa autenticada; solicitante não escolhe permissões nem consulta lista de obras. |
| Credencial e decisão | Senha mantida pelo serviço autorizado; não consta dos registros da aplicação. Aprovar não troca senha; recuperar senha não aprova/reativa/promove. Solicitação repetida não altera conta existente. Decisões têm autor/horário protegidos; revogação considera sessões abertas. |
| Concessão | Relação explícita entre conta/função/atuação/obra/disciplina e condições de consulta; autoria/data da concessão e revogação. Não usar listas soltas como autorização de todas as combinações. |
| Visita | Autor administrativo e auditor designado distintos; data prevista separada da inspeção; histórico persistente. Data/hora de registro emitidas por fonte confiável de servidor. |
| Auditoria/resposta | Identidade da auditoria e versão do modelo, item estável, conteúdo independente e versão de edição. A designação de uma visita não confere ao AD autoria de resposta. |
| Salvamento | Confirmação do servidor identifica o registro e a versão gravada. Uma alteração posterior não pode ser marcada salva pela confirmação de uma versão anterior. Navegar de item não descarta envio pendente nem associa sua resposta ao item seguinte. |
| Concorrência/reenvio | Verificação atômica de versão e repetição segura desde a primeira gravação persistente. Conflito é informado; não resolver com sobrescrita silenciosa. Em falha, preservar o conteúdo possível no formulário sem prometer recuperação após fechamento. |
| Evidência | Conteúdo privado e metadados por auditoria/versão/item, identificação de quem enviou e situação do envio; não usar URL pública como proteção. |
| Retenção D03 | Distinguir categoria e vínculos do objeto; prever eventos de ciclo de vida separados da auditoria/PDF imutável. Somente foto avulsa da inspeção pode ser elegível em publicação concluída registrada pelo servidor + 30 dias corridos, após todas as proteções de D03. Sem publicação, inclusive rascunhos, não inicia prazo. PDF e dados estruturados não são excluídos. Publicação, incorporação das imagens, backup e limpeza são entregas posteriores, não rotinas já existentes. |
| Dados demonstrativos | Manter exemplos no ambiente local isolado ou conjunto de testes explicitamente segregado. Não importar `demoUsers`, obras/auditorias/visitas iniciais ou respostas da sessão como registros reais. O modo real não volta silenciosamente a exemplos quando a conexão falha. |
| Catálogos/histórico | Preservar origem, IDs, textos, pesos documentais e versão usada. Não reescrever a versão antiga nem habilitar nota oficial. Manutenção completa/emitido pertencem a C/D. |

O desenho deverá verificar o acesso nas operações, consultas, banco e arquivos. Totais, pesquisas, erros e conteúdo retornado também precisam respeitar os vínculos. Não criar exportação nova só para preencher uma coluna de teste; enquanto não existir, seu aceite fica pendente e as futuras exportações terão a mesma autorização.

## 6. Pendências e critérios de aceite

P11 está **parcialmente resolvida por D02**: método, domínio e fluxo de solicitação/confirmar/aprovar estão definidos; implementação iniciada somente no recorte de B.1 descrito acima. P12 está **parcialmente resolvida por D03**, com infraestrutura inicial e retenção confirmadas, e conexão do Supabase DEV agora verificada. Configurações restantes, responsáveis e demais detalhes seguem pendentes; P01–P10 continuam abertas no registro canônico. Decidir ou implementar um detalhe não encerra o ID inteiro.

| Pendência | Efeito nesta preparação / momento necessário |
| --- | --- |
| P01/P02 | Não bloqueiam contas nem persistência de coleta sem nota. Bloqueiam metodologia/nota/classificação oficial; opções operacionais de Qualidade não são inferidas. |
| P03 | Formulários oficiais/AUTODOC continuam fora do B proposto; sem envio ou integração presumidos. |
| P04 | Sem prazo automático, recorrência ou alerta; agenda B.3 limita-se a data informada. |
| P05/P06 | Acordo, condições finais e obrigatoriedade de evidências permanecem pendentes; persistir não publica. |
| P07 | Sem plano/parecer ou novas regras de aprovação/complementação no B. |
| P08 | Agenda/ata/composição do comitê não atribuídas ao Administrativo por D01. |
| P09 | Necessária por funcionalidade antes de ampliar consultas, anexos ou pesos. Ausência de concessão continua ausência de acesso, sem tornar a proposta de visibilidade uma regra definitiva. |
| P10 | Manter indisponíveis cancelamento, substituição de auditor e migração de modelo/versão enquanto não decididos. Não é necessário inventá-los para gravar o próprio rascunho. |
| P11 | Parcialmente resolvida: e-mail `dialogo.com.br` + senha própria, confirmação e liberação AD definidos em D02. Responsáveis técnicos/primeiro AD, campos finais/auxiliares, múltiplas funções e detalhes de conta permanecem pendentes. Não perguntar método/domínio novamente. |
| P12 | Parcial por D03: GitHub, Render primeira instância paga para piloto, Supabase Free, ambientes separados e retenção fotográfica definidos. Configuração/envio/remetente/responsáveis ainda pendentes; limites/capacidade e cópias antes de dados que precisem de preservação; destino/rotina de backup e exceções antes da limpeza. Validar custos/condições efetivos sem presumir contratação. |

| Aceite | Evidência futura possível no B | Situação nesta execução |
| --- | --- | --- |
| A01/A02 | Separação de módulos/obras/responsabilidade e acesso direto em servidor/banco/arquivos, com contas reais. Exportações futuras exigem testes próprios. | Pendente operacional; relato visual não aprova segurança. |
| A03 | Regressão dos catálogos preservados. | Verificação de Segurança repetida nesta correção: 205 itens aprovados; catálogos preservados. Não comprova cálculo oficial. |
| A04/A05 | Recuperação de respostas/observações e arquivos independentes; zero/N/A/vazio. Medições não implementadas não podem receber aprovação implícita. | Somente evidência local anterior e relato de sessão; persistência/arquivos pendentes. |
| A06 | Confirmação de salvamento e recuperação em outra sessão/aparelho. | Não executado; pendente. |
| A13 | Nova auditoria persistente vazia e histórico autorizado. Consulta do relatório original emitido pertence a D. | Evidência local do A; alcance persistente pendente. |
| A14 | Falha/duplicidade/concorrência de agenda, rascunho e arquivos. Planos/apresentações continuam E. | Não executado operacionalmente. |
| A07–A12/A15 | Emissão, cálculo, imutabilidade completa, retroatividade, planos/comitê e documento final exigem C/D/E/F conforme o mapa. | Nenhuma aprovação operacional atribuída ao B; A09 apenas pode receber teste parcial de bloqueio. |
| A16 | Recuperação limitada de dados/arquivos do recorte, se autorizada; restauração completa com relatórios pertence a F. | Não executado; pendente. |

Antes de código futuro, consultar os guias pertinentes em `node_modules/next/dist/docs/`, conforme AGENTS.md. Regressões disponíveis: `npm.cmd run verify:security`, `npm.cmd run test:navigation`, `npm.cmd run test:access`, `npm.cmd run test:audit-context`, `npm.cmd run test:ranking`, `npm.cmd run lint`, `npx.cmd tsc --noEmit` e `npm.cmd run build`. Planejar os testes de integração do provedor escolhido, sem inventar comandos que ainda não existem e sem interromper o servidor atual por suposição.

## 7. Primeira subetapa recomendada e o que o responsável precisa providenciar

**Próxima ação: testar manualmente Solicitar acesso com a conta individual controlada.** A migration foi aplicada pelo responsável, a estrutura conferida remotamente e as URLs salvas; o gate temporário da aplicação foi removido. Não é necessária nova migration ou outro `db push`. Não criar as estruturas funcionais do restante do B. Método, domínio, provedor e autorização do recorte atual já foram definidos; não solicitá-los novamente.

| Informação necessária agora | O que fornecer, sem segredos |
| --- | --- |
| Migration no DEV | Aplicação concluída externamente; arquivo original intacto. Catálogo e RPC versão `1` conferidos. Nenhuma aplicação adicional solicitada nesta correção. |
| Conferência do banco mínimo | Após o cadastro manual, conferir a identidade no Auth e sua solicitação criada pelo trigger. Autoalteração de status e leitura por outra identidade exigem sessões reais autorizadas; não usar privilégios administrativos como evidência de RLS. SQL com fixtures continua restrito à instância isolada, não ao DEV compartilhado. |
| Confirmação e retorno | Confirmação habilitada; Site URL `http://127.0.0.1:3001` e Redirect URL `http://127.0.0.1:3001/auth/callback` salvas pelo responsável. Callback local sem código conferido. Recuperação não possui rota pronta; confirmação real ainda será testada no mesmo navegador do cadastro. |
| Envio de e-mails | Se o envio padrão impedir a caixa controlada, informar a limitação e aguardar decisão do responsável, sem alterar SMTP ou confirmação. O envio padrão é restrito à equipe da organização e tem limites; SMTP corporativo definitivo continua pendente. Domínio permitido não autoriza envio em nome dele; não inventar remetente oficial. |
| Responsáveis e contas de teste | Providenciar uma caixa corporativa existente e controlada com autorização expressa para o envio e para criar/testar sua conta. Nenhuma conta corporativa real ou mensagem foi criada/enviada nesta execução. Primeiro Administrativo exige procedimento controlado em B.2; primeiro cadastro não vira AD. |
| Limite da sequência | Validar cadastro, confirmação, login, consulta própria, bloqueio operacional e logout antes de ampliar. Recuperação/reenvio integral e B.2 permanecem pendentes; não antecipar permissões por obra, agenda persistente, auditorias, Storage, limpeza ou publicação. |

**Para depois, antes de B.2/B.5:** relação de obras e campos mínimos; pessoa → perfil/atuação → obra → disciplina; concessões C† explícitas; decisões pertinentes de múltiplas funções; tipos/tamanhos/volume/capacidade de arquivos e responsabilidade por cópias/recuperação. A retenção fotográfica já está definida, mas destino/rotina de backup e detalhes de preservação permanecem pendentes. Definir recuperação antes de guardar dados que precisem de preservação e antes do piloto; comprovar backup do PDF antes da limpeza. Não é necessário implementar relatórios/limpeza para criar o ambiente vazio de desenvolvimento. P01–P08 não precisam ser encerradas para autenticar contas.

A conexão e a estrutura mínima do Supabase DEV já foram conferidas; não repetir criação de projeto ou migration nem substituir sua configuração. Para completar B.1 faltam confirmação/envio autorizado, recuperação/reenvio e testes reais de conta, sessão, logout e RLS. Parâmetros definitivos de senha, links/reenvios, revogação e alteração de e-mail continuam sujeitos ao detalhamento D02. Nesta entrega, a validação de e-mail usa formato ASCII dot-atom, local até 64 caracteres e total até 254, domínio exato sem diferenciar caixa e sem remover pontos/sufixos; nome e campos auxiliares declarados têm limite técnico de 160 caracteres. Alteração de e-mail não é oferecida e a migration impede mudanças em contas com solicitação até existir política específica. A conexão verificada não comprova entrega de e-mails. Pré-requisitos gerais preservados em D03, seção 10; não solicitar senhas, tokens ou chaves no chat.

## 8. Ajuste visual pendente do Bloco A

**A-V01 — quantidade de visitas sem autorização. Situação: pendente, não implementado nesta execução.**

Em `prototype-app.tsx`, visitas são filtradas por `canReadVisit`. Em `PrototypeDashboard`, no arquivo `prototype-workspace.tsx`, a métrica usa `visits.length` mesmo quando `canConsultAgenda` é falso; `Metric` formata zero como `00`. O botão está desabilitado, mas o número sugere quantidade conhecida, indevidamente.

Proposta registrada pelo usuário: quando não houver consulta autorizada, mostrar **“—”** e **“Consulta não autorizada”**, sem apresentar `00 visitas`. Manter ação indisponível. Para consulta autorizada e carregada sem registros, zero é uma quantidade válida. Em futura integração, carregando/falha também não devem virar zero por falta de dados.

Teste futuro: Coordenação/Jardim Norte mostra “—” e a mensagem; contexto autorizado realmente vazio mostra zero; contexto autorizado com visita mostra a quantidade correta. No B, conferir também que nenhum total proibido é retornado pelo servidor. Essa correção visual exige uma próxima autorização; foi somente documentada aqui.

## 9. Histórico — preparação inicial do Bloco B, anterior a D02

Criado este plano; atualizada a retomada com o relato e o diagnóstico; atualizado o índice de planejamento para apontar a preparação. Somente documentação foi modificada. Leituras e inspeções de estrutura/configuração foram feitas sem revelar valores de ambiente. Uma tentativa inicial de inspeção por Node falhou por passagem de aspas no PowerShell; foi repetida corretamente em modo somente leitura, sem alterar arquivos da aplicação.

Não foram executados novamente lint, TypeScript, build, testes de domínio, navegador, login, salvamento ou segurança operacional. Os resultados de testes do A continuam como histórico, não como uma execução nova. Revisão de consistência e conferência de arquivos/documentação não equivalem a testes de acesso.

Conferência documental final: links locais válidos, sete subetapas com os cinco campos solicitados, sem marcadores de conflito ou BOM. Comparação dos arquivos antes/depois identificou somente este plano, `RETOMADA.md` e `PLANO.md` alterados, sem remoções. As verificações auxiliares de leitura/codificação foram ajustadas antes da execução documental final bem-sucedida.

Não houve dependência instalada, conta/serviço criado, migração, limpeza de dados, alteração de funcionamento, reinício/interrupção do servidor, publicação ou alteração em `nexobra-main`. Trabalho de preparação encerrado; aguardar autorização.

## 10. Registro posterior — consolidação D02

Atualizados plano, retomada, índice geral, detalhamento funcional T01/T19, matriz e pendência P11 com referência ao adendo posterior. A redação antiga que deixava método/domínio em aberto ou não detalhava a senha foi superada explicitamente pela seção 1 de D02; o documento original não foi sobrescrito. Código reexaminado: continua sem autenticação real/Microsoft, banco, envio de e-mails ou fila de liberação. Nenhum recurso implementado nesta rodada.

Testes futuros detalhados em D02-T01–T17: domínio exato e formato; não confirmado/pendente sem acesso; AD autorizado aprova; mesma senha após aprovação; bloqueio de autoaprovação/elevação; isolamento por obra/módulo; recuperação sem mudar aprovação/atividade; revogação com sessão aberta; pedidos repetidos sem duplicidade/sobrescrita; links/reenvios protegidos, privacidade e mudança de e-mail. **Nenhum executado ou aprovado agora.** Os testes anteriores do A mantêm seu alcance histórico e A-V01 continua pendente.

Somente documentação. Nenhuma instalação, configuração, migração, mensagem ou publicação; aguardar autorização.

## 11. Registro posterior — D03, 13/09/2026

Criado o adendo de infraestrutura e retenção, preservando o original e D02. A antiga retenção integral de evidências recebe exceção somente para a cópia fotográfica avulsa: **publicação concluída com data/hora do servidor + 30 dias corridos**. Exigem-se PDF definitivo salvo/íntegro/legível, foto incorporada e no item correto, backup confirmado, ausência de bloqueio e de outro vínculo que exija o objeto. Condição ausente ou falha preserva a foto e registra pendência. Não contar upload/visita/mês seguinte nem incluir fotos de rascunhos.

PDFs com todas as imagens incorporadas e dados estruturados permanecem no histórico; planos, apresentações e outras categorias não entram nessa limpeza. Eventos de retenção ficam separados do conteúdo imutável; futura consulta informa que a imagem permanece no relatório e oferece o PDF autorizado, sem links quebrados. Proposta de simulação sem excluir arquivos antes de execução real, sempre com autorização posterior específica.

**Sequência proposta:** B.5 prepara categorias/vínculos/metadados privados; D implementa publicação e PDF com imagens, condicionado às pendências metodológicas/de emissão; F valida backup/restauração e simulação. Limpeza real depende de todas as proteções e autorização própria. Não faz parte de B.1 nem se habilita automaticamente com persistência.

Testes futuros D03-T01–T13 no adendo, **não executados nem aprovados**. Não foram repetidos testes da aplicação, lint ou build; conferência apenas documental. A-V01 continua pendente. Nenhum serviço contratado/configurado, agendamento, exclusão ou publicação nesta rodada; protótipo, servidor e `nexobra-main` preservados.

Conferência documental D03: nove Markdown novos/alterados e 67 links locais válidos, sem erros de UTF-8, BOM ou marcadores de conflito; sete subetapas mantêm os cinco campos. Comparação dos arquivos confirma somente documentação, sem remoções; original e código preservados. Corpo histórico de D02, matrizes e P01–P10 conferidos como preservados. Nenhum resultado equivale a aprovação de acesso ou salvamento operacional.

## 12. Histórico — infraestrutura básica anterior ao cadastro/login

**Estado daquela rodada — 13/09/2026:** instalados `@supabase/supabase-js` e `@supabase/ssr`; criadas fábricas navegador/servidor e verificação por comando, sem tela técnica pública ou mudanças no protótipo. Supabase DEV foi informado como configurado externamente, mas `.env.local` estava vazio na versão salva no disco; conexão real permanecia pendente. Lint, TypeScript, build, regressões do Bloco A e dez testes offline da verificação passaram naquela execução. Não haviam sido implementados cadastro/login, confirmação/recuperação, aprovação, tabelas/agenda persistente ou Storage. A próxima ação era salvar a configuração no editor e confirmar via `npm.cmd run verify:supabase`.

Esse estado foi superado pela confirmação real da conexão e pela primeira parte funcional de B.1 registradas no início deste plano. A versão atual não exige salvar novamente valores que já estão configurados. O histórico completo e os resultados reais da execução mais recente estão em [RETOMADA.md](RETOMADA.md); não inferir aprovação de testes de Auth, RLS ou SMTP pelos resultados históricos de infraestrutura ou do Bloco A.

