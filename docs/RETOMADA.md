# Retomada — Diálogo Auditorias

## Estado atual — 14/09/2026 — Acessos gerais de Luiza Dutra

O responsável autorizou expressamente que a conta existente `luiza.dutra@dialogo.com.br` receba os mesmos acessos atuais de `emanuel.locchi@dialogo.com.br`, com atualização no Supabase e Render. A conferência remota encontrou Luiza com e-mail confirmado, conta ativa e já aprovada: quatro perfis, Engenharia como Equipe da obra e três concessões na Alameda Tatuapé. A aprovação original é `002ee997-fbc5-47a3-9864-f0f068661da1`, atribuída a Emanuel; não foi refeita.

Migration B.6 `20260914000100_designated_general_access.sql` aplicada após B.1–B.5; o dry-run continha somente B.6, sem seeds ou roles. A função privada de operação fixa as duas identidades e exige sessão `postgres`, estados anteriores verificados e 21 IDs explícitos. A instalação da migration não concede acesso. A operação separada `supabase/admin/configure-luiza-general-access.sql` foi executada uma vez e registrou a decisão `6c63daea-0d30-4019-a475-492cd0fe3608`, tipo `AJUSTE_ACESSOS_GERAIS`, com autoria do operador do banco e motivo da autorização. Não repetir a operação.

Luiza agora tem Administrativo, Auditor de Segurança, Auditor de Qualidade e Engenharia, esta como Equipe da obra e Coordenação, com Coordenação como atuação primária. Seus 84 pares perfil/obra/módulo em 21 obras são exatamente iguais aos de Emanuel. Foram acrescentadas 81 concessões, preservando integralmente as três originais e os campos da aprovação. Novas obras futuras não recebem concessão automática.

Comparação remota antes/depois confirmou quatro identidades e quatro contas, 21 obras, todas as 91 concessões anteriores e seis decisões anteriores intactas, além dos dados e acessos das outras contas. O total passou a 172 concessões e sete decisões. Dados de identidade conferidos, solicitações, cadastro/histórico de obras e conta de Emanuel permaneceram iguais; nenhuma senha, confirmação de e-mail ou cadastro foi alterado pela operação.

O código do histórico administrativo reconhece a nova ampliação e mostra o operador, o motivo, o estado anterior e os acessos resultantes. B1–B6 passaram em PostgreSQL isolado (PGlite), incluindo preservação, bloqueios de API/RLS, estados divergentes, rollback por falha injetada e execução repetida. ESLint, build/TypeScript e 63 testes de acesso/perfis/contexto também passaram. Essas verificações não substituem o login de Luiza na própria sessão. O site online e a prévia usam o mesmo Supabase; os novos acessos são reconsultados ao abrir/trocar perfil.

## Estado atual — 13/09/2026 — GitHub privado e Render online

**Publicado e conferido:** https://dialogo-auditorias-testes.onrender.com. Repositório privado https://github.com/stefanirlocchi/dialogo-auditorias, branch `main`. O usuário autorizou explicitamente enviar os 142 arquivos de código, testes, migrations e documentação interna após a revisão automática bloquear o payload inicial. `.env.local`, metadados de conexão do Supabase, dependências, builds, planilha e imagem de referência ficaram fora. Primeiro commit local/remoto: **d64a34faf149e1a0f0fa5fc03353ae44307199c9**. O projeto principal local agora possui Git e remote `origin`; alterações precisam de commit/push para atualizar o online.

Render criou exclusivamente o Web Service Node **dialogo-auditorias-testes**, plano Free, serviço `srv-dajlnj7qj5pc73e4ijbg`, Blueprint `exs-dajlmu7qj5pc73e4g3tg`. Primeiro deploy `dep-dajlnjfqj5pc73e4ika0` ficou Live, compilado a partir de d64a34f. Configuração versionada em `render.yaml`, validada contra o schema oficial; dependências públicas conferidas no npm e imports com capitalização exata para Linux. Nenhum serviço de nexobra ou outro projeto foi editado. Não foi contratado plano pago.

O Render recebe somente APP_URL e configuração pública do Supabase existente, além das opções de execução Node. Site URL do Supabase agora é `https://dialogo-auditorias-testes.onrender.com`; Redirect URLs contém exatamente o callback local `http://127.0.0.1:3001/auth/callback` e o callback online `https://dialogo-auditorias-testes.onrender.com/auth/callback`. Um config isolado declarou somente essas duas propriedades Auth: diff revisado antes, aplicação e diff posterior sem alterações declaradas pendentes. Não houve migration, bootstrap, alteração de senha, conta ou concessões nesta publicação. Verificação anônima confirmou Auth alcançável, cadastro habilitado e confirmação de e-mail obrigatória.

Conferência HTTP pública: entrada e solicitar acesso respondem; raiz direciona à entrada; /app, /escolher-perfil, /administracao/usuarios e edição de obra direcionam à entrada sem sessão, com cache privado/no-store. O navegador confirmou a página de entrada e a navegação ao formulário de cadastro sem criar conta. Isso comprova disponibilidade e proteção sem sessão; não substitui o login do responsável no novo domínio nem a aprovação de outra conta real. Nenhuma credencial de usuário foi solicitada ou inserida pelo agente.

Login em outros dispositivos usa a conta e senha existentes. Cadastro de obras e acessos compartilha o mesmo Supabase do uso local; auditorias e agenda ainda têm os limites de prévia já descritos. Novos cadastros com PKCE devem confirmar no navegador/dispositivo de origem. O Free pode demorar no primeiro acesso após inatividade. Próxima confirmação funcional cabe ao responsável na própria conta/dispositivo; teste de aprovação com outra conta continua pendente conforme disponibilidade informada anteriormente. Detalhes em [PUBLICACAO_GITHUB_RENDER.md](PUBLICACAO_GITHUB_RENDER.md). Estados anteriores abaixo permanecem como histórico.

## Estado atual — 13/09/2026 — Publicação de testes autorizada; GitHub conectado

O responsável autorizou vincular GitHub e Render para testar a aplicação online em outros dispositivos. Essa autorização substitui a restrição anterior de não publicar no Render, apenas para o projeto **Diálogo Auditorias** e seu ambiente de testes. **nexobra-main**, serviços de outros projetos e fontes sincronizadas continuam preservados e fora do escopo. Os registros anteriores que dizem “sem Render” descrevem o estado daquelas entregas, não impedem esta nova etapa autorizada.

A conta GitHub **stefanirlocchi** foi autorizada pelo responsável e a conexão pelo GitHub CLI foi concluída. A primeira tentativa de OAuth com escopos amplos havia sido recusada pela revisão automática; a ferramenta posteriormente confirmou autenticação concluída na sessão da conta. A ação rejeitada não foi repetida pelo agente. Não interpretar a autenticação no CLI como autorização para alterar outros repositórios ou serviços.

**Repositório privado criado em https://github.com/stefanirlocchi/dialogo-auditorias. Neste ponto ainda não houve push nem deploy no Render.** Não registrar URL pública, serviço ativo ou integração concluída sem a confirmação correspondente. A preparação local inclui instruções de Node.js 24, variáveis públicas do Supabase, execução na porta 3001 e configuração de publicação descrita em [PUBLICACAO_GITHUB_RENDER.md](PUBLICACAO_GITHUB_RENDER.md). O README foi atualizado para refletir autenticação/perfis e cadastro de obras persistentes, mantendo os limites de prévia das auditorias e da agenda.

Próximos passos: vincular o repositório privado criado, enviar somente os arquivos revisados do aplicativo, conectar o Web Service do Render, definir as variáveis antes do build e configurar no Supabase o endereço HTTPS real e seu callback exato. Não enviar `.env.local`, tokens, senhas, metadados locais do CLI, dependências, builds ou arquivos de referência. Nenhuma publicação exige novo bootstrap ou repetição das migrations B.1–B.5 já aplicadas.

A aplicação publicada continuará usando o Supabase existente: edição de obras e autorizações são persistentes e compartilhadas com o uso local; preenchimentos de auditoria continuam temporários. O teste de aprovação com outra conta real permanece pendente. A preparação e a conexão do GitHub não comprovam cadastro, login ou salvamento no futuro endereço online.


## Estado atual — 13/09/2026 — Cadastro completo e edição de obras

Administrativo pode abrir **Obras → Editar obra** e salvar nome, endereço (logradouro, número, complemento, bairro, cidade, UF e CEP), responsável técnico, registro profissional, coordenação, integrantes da equipe com suas funções e observações. A tela `/administracao/obras/[id]` exige sessão válida e perfil Administrativo selecionado. Equipe é informação descritiva: não cria contas nem concede acessos. Os cartões usam os dados reais cadastrados e o retorno abre diretamente a seção Obras.

Migration versionada B.5 `20260913000500_work_details.sql` aplicada e conferida no Supabase DEV, após B.1–B.4. Os novos campos das 21 obras começam vazios: nenhum endereço, responsável ou integrante foi inventado. Conferência antes/depois preservou integralmente as projeções anteriores de obras, contas, solicitações, decisões e as 84 concessões; permanece uma conta Auth. Não repetir a migration.

Salvamento pela Server Action e RPC `update_access_work`, com identidade e autorização administrativa repetidas no banco, validação estrita, bloqueio de escrita direta e RLS. Histórico append-only separado em `access_work_changes` guarda antes/depois, responsável e horário. Controle de revisão impede sobrescrita silenciosa em edições concorrentes; sem alteração de conteúdo não cria revisão/histórico. A interface conserva os campos em sucesso, erro ou conflito e não repete gravações de resposta incerta. As 21 obras continuam na revisão zero e o histórico novo está vazio até uma edição real.

151 testes offline e suítes SQL isoladas B.1–B.5 passaram, com validação de autorização, RLS, imutabilidade, rollback, conflitos e compatibilidade do cadastro anterior. ESLint, TypeScript e build Webpack passaram no stage. O navegador conferiu o formulário real em harness sintético sem banco, salvamento, conflito, falha sem perda dos campos, integrantes e links restritos ao Administrativo. Isso não substitui o preenchimento de dados reais pelo responsável na própria sessão.

O cadastro de obras agora é persistente; rascunhos de auditoria e demais integrações operacionais ainda mantêm os limites anteriores. Os 25 arquivos revisados de código, migration, testes e documentação foram salvos no projeto principal local Diálogo Auditorias, com cópias anteriores no workspace e conferência de hashes. Build Turbopack/TypeScript do original passou. Prévia reiniciada em http://127.0.0.1:3001 (sessão de terminal 67910); edição de obra e /app exigem entrada sem sessão, enquanto solicitar acesso permanece disponível. O navegador confirmou a proteção da nova rota. Sem Render, nexobra-main, redefinição de senha ou alteração dos fluxos de cadastro/confirmação/PENDENTE_APROVACAO. Aprovação de outra conta continua adiada pelo responsável para 14/09/2026. Detalhes em [CADASTRO_OBRAS.md](CADASTRO_OBRAS.md).

## Estado atual — 13/09/2026 — Engenharia com Equipe da obra e Coordenação

O responsável solicitou acrescentar Engenharia — Equipe da obra à conta `emanuel.locchi@dialogo.com.br` para visualizar suas telas, mantendo Coordenação. Migration versionada B.4 `20260913000400_multiple_engineering_scopes.sql` aplicada no Supabase DEV após B.1–B.3. Novo array `atuacoes_engenharia` admite atuações canônicas; backfill preserva apenas a atuação anterior. O campo legado `atuacao_engenharia = COORDENACAO` continua intacto. Aprovações V2 existentes continuam com uma atuação, sem ampliação automática.

Operação privada `supabase/admin/configure-initial-engineering-scopes.sql` executada para a conta inicial e os mesmos 21 IDs de obras já autorizados. Acrescentou somente `EQUIPE_OBRA` ao conjunto e uma decisão `AJUSTE_ATUACAO_INICIAL`, ID **172ffae1-abc2-4930-9f54-9da50704b7d7**, atribuída à sessão `postgres`, sem atribuir autoaprovação ao usuário. A função exige identidade fixa, estado anterior e vínculos correspondentes à decisão B.3, transação e marcador permanente. Nenhum cliente de API pode executá-la.

Conferência remota confirmou **uma conta Auth, 21 obras ativas, 84 concessões idênticas**, mesmo cadastro, aprovação original, quatro perfis e os dois registros históricos anteriores idênticos em todos os campos antigos. Agora há três decisões. Novas colunas no histórico antigo ficam nulas; não reescrevemos snapshots. RLS e bloqueio de escrita direta permanecem ativos. Engenharia — Equipe da obra e Engenharia — Coordenação usam os mesmos 42 vínculos de Engenharia, separados por obra/módulo, sem herdar vínculos de outro perfil.

O seletor passa a exibir cinco opções para essa conta. Cookie v2 identifica perfil e atuação como preferência revalidada, sem autoridade própria; v1 Engenharia conserva apenas a atuação primária ainda autorizada. A seleção de uma atuação ausente, revogada ou forjada falha. Mesmo com só o perfil Engenharia, duas atuações exigem escolha. Painel, Meus acessos e histórico exibem as atuações corretamente; trocar atuação reinicia o contexto da tela.

138 testes offline passaram, incluindo preferência/guards, escopos exatos e atividades de Engenharia. Suítes PostgreSQL isoladas B.1–B.4 passaram; B.4 valida backfill, compatibilidade V2, constraints, bloqueio de API, rollback com falha injetada, marcador permanente e histórico preservado. ESLint, TypeScript e build do stage passaram. No harness sem banco, o navegador conferiu cinco cards, seleção da Equipe da obra, consulta à agenda e troca de volta à Coordenação sem sua agenda condicional. Isso não representa uma segunda conta real ou integração operacional persistente.

Os arquivos permanecem no projeto principal local Diálogo Auditorias. Prévia no endereço http://127.0.0.1:3001. Atualizar e abrir **Trocar perfil** para visualizar a nova opção. Preenchimentos de auditoria continuam temporários. Sem publicação no Render, alterações de nexobra-main, senha, conta nova ou mensagens. Não repetir migrations/ajustes já aplicados; nova aprovação real continua adiada pelo responsável para 14/09/2026.

## Estado atual — 13/09/2026 — Escolha de perfil e telas restauradas

O responsável solicitou recuperar as telas anteriores e escolher o perfil ao entrar com múltiplos acessos. Implementado `/escolher-perfil`, com somente os perfis aprovados e Engenharia conforme atuação concedida. O link **Trocar perfil** permite mudar de ambiente. Login novo limpa a escolha anterior; perfil único abre diretamente `/app`. A preferência HttpOnly é vinculada à identidade e revalidada contra autorização atual: não concede permissões. A área administrativa requer também o perfil Administrativo selecionado.

`/app` recupera as telas com identidade real e pares exatos de perfil/obra/módulo vindos da sessão/RLS. Administrativo abre a gestão real de usuários/obras/histórico; auditores visualizam seus módulos e roteiros; Engenharia visualiza o contexto de sua atuação. Nenhum dado operacional fictício é apresentado como real. Formulários permanecem temporários, com aviso de descarte ao atualizar/trocar perfil. Gravação operacional, agenda persistente, atribuição de auditores e publicação continuam próximas entregas. Este estado substitui o bloqueio integral das telas descrito abaixo, sem declarar persistência entregue.

128 testes offline passaram, ESLint completo e builds Next.js/TypeScript no stage e no original passaram. Harness isolado no navegador conferiu quatro opções, entrada em cada perfil, roteiros de Qualidade, troca de módulo na Coordenação, link à administração real, início de preenchimento de Segurança e descarte dos rascunhos ao trocar perfil. Uma falha no envio da data foi corrigida e retestada visualmente. Harness com dados sintéticos e sem banco, encerrado após a conferência; não representa login real ou aprovação de outra conta.

30 arquivos revisados foram transferidos ao original com verificação de hashes e cópias anteriores no workspace. Prévia atualizada em http://127.0.0.1:3001, sessão de terminal 1936. Rotas /app, /escolher-perfil e /administracao/usuarios sem sessão redirecionam à entrada; /solicitar-acesso permanece acessível. A seleção autenticada deve ser conferida pelo responsável na sua sessão, sem solicitar credenciais.

Nenhuma mudança no Supabase foi executada nesta rodada. Não repetir migrations, bootstrap ou ampliação: quatro perfis/84 concessões nas 21 obras e histórico permanecem como registrados abaixo. Teste de aprovação de outra pessoa permanece para 14/09/2026 por decisão do responsável. Sem Render, nexobra-main, alteração de senha ou fontes sincronizadas. Detalhes em [SELECAO_PERFIL.md](SELECAO_PERFIL.md).

## Estado atual — 13/09/2026 — Múltiplos perfis aplicados e conta inicial ampliada

O responsável definiu que uma conta pode acumular combinações dos quatro perfis principais e confirmou explicitamente **Administrativo, Auditor de Segurança, Auditor de Qualidade e Engenharia/Coordenação**, com acesso às **21 obras existentes**, para sua conta inicial. Informou não ter outra conta disponível hoje e adiou o teste de aprovação de outra pessoa para **14/09/2026**. Não criar contas, enviar e-mails nem substituir esse teste por uma simulação no DEV.

**Aplicado e conferido no Supabase DEV:** migration `20260913000300_multiple_access_profiles.sql`, após B.1 e B.2 preservadas. A migration converte os acessos antigos sem ampliá-los. Em operação separada, `supabase/admin/configure-initial-account-profiles.sql` concedeu os quatro perfis à conta existente `13044e3f-e8d2-4b4b-9981-22a8de22c610`, com IDs explícitos das 21 obras verificadas. Não há concessão automática a obras futuras.

- Conta continua ativa, com os quatro `perfis` e `atuacao_engenharia = COORDENACAO`; permanece **uma conta Auth** e **21 obras ativas**.
- **84 concessões exatas:** 21 de Auditor de Segurança/Segurança, 21 de Auditor de Qualidade/Qualidade, 21 de Engenharia/Segurança e 21 de Engenharia/Qualidade. Cada linha é perfil/obra/módulo, vinculada à nova decisão, sem transferir escopos entre perfis.
- Nova decisão **AJUSTE_PERFIS_INICIAL**, ID `c925a26d-8e14-4214-96e1-094eb7cfd377`, em **13/09/2026 às 14:59:52 (Brasília)** / `2026-09-13T17:59:52.436712Z`. Autor: sessão do banco `postgres`; `actor_auth_user_id` e `granted_by` nulos, sem atribuir autoaprovação ao responsável. Snapshot registra conta/concessões anteriores e os 84 acessos novos.
- A decisão BOOTSTRAP original continua única e com todos os campos anteriores idênticos; digest da projeção antiga conferido antes/depois. `approved_at = 2026-09-13T06:15:24.050061Z`, `approved_by = NULL`, solicitação, dados declarados e snapshot do bootstrap preservados. O ajuste não executa novo bootstrap.
- RLS e proibição de escrita direta pelas identidades de API conferidas. A função privada exige sessão real `postgres`, identidade inicial designada, estado anterior compatível e exatamente 21 IDs ativos; marcador permanente impede repetição. As funções de bootstrap e ajuste não têm botão, endpoint ou execução por `anon`, `authenticated` ou `service_role`.

**Aplicação atualizada:** aprovação de solicitações confirmadas aceita múltiplos perfis, exige uma concessão para cada perfil técnico, atuação de Engenharia quando selecionada e confirmação/justificativa. A RPC `approve_access_request_v2` repete autorização e validação; a assinatura antiga foi removida. Autoaprovação continua negada. Campos ficam coerentes após erro de envio, preservando as seleções e exigindo nova confirmação; retirar um perfil remove seus escopos do próximo envio.

`/minha-conta` agora é **Meus acessos** e apresenta todos os perfis e suas obras/módulos. Há link no cabeçalho administrativo. Histórico distingue o bootstrap da ampliação e mostra perfis/concessões anteriores e atuais. Campos singulares antigos são somente compatibilidade/exibição histórica; autorização atual usa `perfis` e concessões exatas. `has_current_access_grant(perfil, obra, modulo)` verifica a identidade, a conta e a obra ativas; nem um Administrativo usa esse predicado para obter acesso técnico implícito.

**Validações desta rodada:** 74 testes offline de autenticação, diagnóstico, Supabase, validação de aprovação e autorização efetiva passaram; lint seletivo e TypeScript completo passaram. Builds de produção aprovados com Webpack na cópia revisada e Turbopack no projeto original. Suítes PostgreSQL 18.3/PGlite B.1, B.2 e B.3 passaram; B.3 tem 14 grupos, incluindo migração de dados legados, histórico imutável, escopos distintos, perfis inválidos, RLS, bloqueio de API, rollback após falha no último grant e marcador permanente. Fixtures isoladas, nenhuma conta de teste no DEV.

No navegador, um harness separado do produto usou o componente real com dados sintéticos e ação sem banco: quatro perfis, concessões distintas, erro de envio preservando campos/confirmando de novo e retirada de Engenharia sem permissões residuais foram exercitados. No build original, Meus acessos sem sessão redireciona à entrada. A API pública real, sem sessão, negou aprovação v2 e leitura de concessões/histórico com HTTP 401 / SQLSTATE 42501. Isso não equivale à aprovação pela interface com outra identidade real, adiada pelo responsável, nem à concorrência entre conexões. A nova combinação ainda deve ser conferida pelo responsável em sua própria sessão.

Os 18 arquivos de implementação/documentação revisados foram transferidos ao original com comparação de hashes e cópias anteriores no workspace; este registro e o plano foram atualizados ao concluir. A prévia está no projeto original, **http://127.0.0.1:3001**, com build novo em sessão de terminal. Atualizar a página e abrir **Meus acessos** para conferir os quatro perfis. Não repetir B.1, B.2, B.3, bootstrap ou ajuste inicial.

Recusa, reanálise, alteração genérica de concessões de contas já aprovadas e revogação pela interface continuam futuras. Módulos operacionais persistentes continuam em preparação; a configuração de permissões não declara esses módulos entregues. Cadastro, confirmação, senha e `PENDENTE_APROVACAO` dos novos pedidos permanecem. **Sem publicação no Render, sem alteração de nexobra-main ou das fontes sincronizadas.** Procedimento atualizado em [BOOTSTRAP_ADMINISTRATIVO.md](BOOTSTRAP_ADMINISTRATIVO.md) e decisão de perfis acumuláveis na [MATRIZ_ACESSOS.md](MATRIZ_ACESSOS.md). Estados anteriores abaixo são históricos e não substituem esta confirmação.

## Estado atual — 13/09/2026 — Entrada administrativa confirmada pelo responsável

O responsável enviou captura da área **Administração → Usuários e acessos**, com sua conta `emanuel.locchi@dialogo.com.br` identificada como **Administrativo**, **1 conta com aprovação ativa**, **0 solicitações prontas para análise** e **0 obras ativas disponíveis**. A seção de histórico exibe o registro de Emanuel Locchi como Administrativo. Essa evidência confirma a entrada autenticada e a abertura da área administrativa com a conta existente após o bootstrap; supera a pendência de login descrita no registro anterior.

Antes dessa confirmação, a prévia apresentou `ERR_CONNECTION_REFUSED`: foi verificado que não havia servidor ouvindo na porta 3001, e o build existente foi iniciado em uma sessão de terminal. A tela Entrar foi conferida no navegador. A causa do encerramento do processo anterior e a causa da tentativa inicial de autenticação rejeitada não foram determinadas; a entrada posterior bem-sucedida não deve ser apresentada como diagnóstico dessas causas.

Nenhuma alteração de código, senha, conta, permissão ou banco foi necessária nesta confirmação. O cadastro de obras reais e a aprovação de uma segunda solicitação confirmada pela interface continuam como próximos usos a validar com dados e conta autorizados pelo responsável. A captura não comprova esses dois fluxos. Não repetir o bootstrap. Permanecem preservados os registros e limites da entrega abaixo; sem publicação no Render ou alteração de nexobra-main.

## Estado atual — 13/09/2026 — Diagnóstico seguro de falha no login

Após o bootstrap, o responsável enviou uma captura com a mensagem genérica de falha de entrada. **A causa dessa tentativa ainda não foi confirmada; não registrar login administrativo bem-sucedido nesta rodada.** A conexão ao Supabase DEV foi conferida e está disponível. Consulta mínima do Auth confirmou e-mail verificado, conta não excluída e sem bloqueio; o último login bem-sucedido registrado continuava em `2026-09-13T05:52:42.865583Z`, anterior ao bootstrap. Nenhuma senha, hash, token ou conteúdo de sessão foi consultado.

A mensagem vinha de `signIn()` e agrupava rejeição do provedor, conexão, configuração e erro de gravação da sessão, antes da consulta ao perfil/RLS. A revisão do fluxo não encontrou incompatibilidade concreta com Next.js ou alteração de senha pelo bootstrap. O acesso ao painel do Supabase foi negado pela revisão automática; ele não foi aberto nem seus registros consultados por outro caminho.

Foi implementada somente uma melhoria de diagnóstico e mensagens: códigos fixos permitem diferenciar configuração, sessão, conexão, limite de tentativas, falha do provedor, rejeição de autenticação e exceção inesperada. Rejeições por conta/senha/confirmação mantêm a mesma resposta pública, sem revelar a existência da conta. O registro do servidor contém somente evento fixo, categoria permitida e horário; não recebe FormData, identidade, e-mail, senha, erro bruto, stack, body, URL, tokens ou cookies. Falha no próprio diagnóstico não altera o resultado do login.

Arquivos: `src/lib/auth/login-diagnostics.ts`, `src/lib/auth/login-report.ts`, `src/lib/auth/service.ts`, `src/app/auth/actions.ts`, `scripts/test-login-diagnostics.mjs`, comando `test:auth` e este registro. Cadastro, callback, logout, permissões e migrations preservados. Nenhum login foi tentado automaticamente com credenciais reais ou presumidas, nenhuma conta foi recriada, nenhuma mensagem foi enviada e nenhum reset de senha/bootstrap foi executado.

Validações: **35/35** testes de autenticação/diagnóstico aprovados, ESLint dos arquivos envolvidos e TypeScript do projeto aprovados. Os testes de erros usam SDK e dados inteiramente sintéticos, sem rede. Causa real e entrada autenticada dependem de nova tentativa manual do responsável na prévia atualizada; usar a mesma conta e senha própria da plataforma, sem fornecer senha ao agente.

Aguardando a próxima tentativa para consultar o código seguro gerado pelo servidor. Isso é diagnóstico preparado, **não correção comprovada da causa original**. Sem nova migration ou `db push`; sem Render ou alteração de nexobra-main.


## Estado atual — 13/09/2026 — Bootstrap controlado aplicado no DEV e área administrativa preparada

A conta existente de **Emanuel Locchi** (`emanuel.locchi@dialogo.com.br`) foi tornada o primeiro **Administrativo** no Supabase DEV por operação administrativa controlada, conforme solicitação expressa do responsável. A nova migration **20260913000200_access_administration.sql** foi aplicada pelo CLI 2.117.0 e aparece no histórico junto à B.1. A migration apenas criou os controles; a concessão ocorreu pelo script separado `supabase/admin/bootstrap-initial-administrator.sql`.

### Evidência remota desta execução

- Conta Auth existente: UUID `13044e3f-e8d2-4b4b-9981-22a8de22c610`; e-mail confirmado; criação Auth original `2026-09-13T05:38:51.761616Z` preservada. Continua existindo **uma conta Auth**, nenhuma conta adicional criada.
- Perfil efetivo **ADMINISTRATIVO**, ativo; solicitação passou de `PENDENTE_APROVACAO` para `APROVADO` atomicamente com a concessão e o histórico.
- Decisão única `BOOTSTRAP`: **f7428d19-6f81-4e21-92f8-d90656c85ce5**, em **13/09/2026 às 03:15:24 (Brasília)** / `2026-09-13T06:15:24.050061Z`. Autor técnico da implantação: sessão `postgres`; justificativa registra a autorização de Emanuel. `approved_by` é nulo no bootstrap, sem fingir uma aprovação feita pelo usuário na interface.
- O banco confirmou a igualdade de todos os campos originais da solicitação com o snapshot, exceto status e `updated_at`. Permanecem **Engenharia**, **Sapetuba Diálogo** e `created_at = 2026-09-13T05:38:51.759762Z`. Esses dados são declarações de cadastro; não foram convertidos em concessões técnicas.
- **Zero concessões técnicas e zero obras criadas**. O Administrativo inicial recebe a gestão de usuários e acessos.
- RLS habilitada nas cinco tabelas; INSERT/UPDATE/DELETE/TRUNCATE negados a `anon`, `authenticated` e `service_role`. Schema e função de bootstrap privados, sem uso/execução pelas três identidades de API. Dois triggers protegem histórico contra UPDATE/DELETE e TRUNCATE.
- Conexão DEV confirmada, cadastro/e-mail habilitados e confirmação obrigatória. Rede restrita impediu a primeira verificação; a repetição permitida confirmou o estado. Nenhuma configuração de Auth ou SMTP foi alterada.

### Interface e controles entregues

`/administracao/usuarios`: solicitações pendentes com e-mail confirmado, dados declarados, perfil, atuação obrigatória de Engenharia, pares explícitos obra/módulo, justificativa e confirmação da decisão. Cadastro mínimo de nomes reais de obras para futuras concessões; histórico paginado com quem decidiu, quando, motivo, pedido original e acessos exatos. Nenhuma obra fictícia foi inserida no DEV.

Todas as Server Actions verificam o Administrativo atual, usam cliente Supabase com cookie da própria sessão e chamam funções que repetem autorização/validação no banco. Sem escrita direta de permissões, autor/horário enviados pelo cliente ou `service_role` na aplicação. A função privada de bootstrap não tem botão ou rota web; não pode ser repetida mesmo que todas as contas administrativas sejam desativadas depois.

Cadastro, confirmação, login, callback e logout foram preservados. Novos cadastros continuam **PENDENTE_APROVACAO**. O checkpoint de liberação consulta autorização vigente: Administrativo segue à administração; demais aprovados veem o próprio perfil e concessões em `/minha-conta`. Ausência/falha de consulta, desativação e bloqueio/exclusão no Auth negam o acesso. Nenhum protótipo em memória foi liberado como módulo operacional real.

### Validações desta entrega e limites

- Lint e TypeScript aprovados; build Next.js 16.3.4 aprovado com Webpack na cópia de revisão e com o Turbopack padrão no projeto original, incluindo a rota administrativa. Os 25 arquivos revisados foram transferidos ao diretório original após comparação de hashes, com cópias anteriores guardadas no workspace da tarefa.
- Testes offline: autenticação **24/24**, Supabase **10/10**, ranking **14/14**, acesso do protótipo **16/16**, contexto de auditoria **15/15**, administração/autorização **19/19**; navegação e catálogo de Segurança com **205 itens** aprovados.
- SQL B.1 e B.2 executados em PostgreSQL 18.3/PGlite 0.5.8 isolado, com privilégios e RLS reais, incluindo identidade designada, bootstrap único, autoaprovação negada, metadados forjados, fila confirmada, obras/módulos explícitos, falha intermediária com rollback, histórico imutável e autoridade revogada/bloqueada. Fixtures inteiramente revertidas; nenhum fixture executado no DEV.
- Navegação no build real conferida sem sessão: `/administracao/usuarios`, `/administracao`, `/minha-conta`, `/aguardando-liberacao` e `/app/auditorias` encaminham à entrada; Solicitar acesso continua disponível. Sem erros de página observados.
- Layout da área administrativa conferido no navegador em desktop e celular com os componentes/estilos reais e dados sintéticos em HTML temporário fora da aplicação; sem envio de formulários. Isso não equivale a uma aprovação real pela interface.
- Pela API pública real, sem sessão e com chave publicável, a chamada de aprovação e as consultas de contas/histórico retornaram HTTP 401 / SQLSTATE 42501. Nenhuma gravação ocorreu.
- A assinatura JWT/GoTrue, aprovação pela interface com uma segunda conta real e concorrência simultânea entre conexões não foram exercitadas nesta rodada. A implantação foi conferida por catálogo/ACLs e dados reais mínimos, sem apresentar privilégio `postgres` como se fosse uma sessão de usuário.

Prévia atualizada do projeto original disponível em **http://127.0.0.1:3001**. A primeira tentativa encontrou um processo antigo nessa porta, não visível na inspeção restrita inicial. O processo foi identificado pelo caminho e pelos argumentos do Diálogo Auditorias e reiniciado isoladamente com o build novo; a rota administrativa agora redireciona corretamente ao login quando não há sessão. Nenhum processo de outro projeto foi encerrado.

Próximo uso: entrar com a **mesma conta e senha já criadas** e abrir **Administração → Usuários e acessos**. O histórico deve mostrar a ativação inicial controlada. A fila ficará vazia até surgirem futuras solicitações confirmadas. A validação de uma aprovação real pela interface depende de outra conta existente/controlada e autorizada; não criar uma por suposição.

Recusa, reanálise, revisão de permissões, múltiplos perfis e interface de revogação permanecem para sequência. Módulos operacionais persistentes, SMTP corporativo, recuperação/reenvio completos e outros pontos do Bloco B continuam pendentes. **Sem publicação no Render, sem alteração de nexobra-main, sem alteração em fontes sincronizadas, sem envio de e-mail nem troca de senha.**

Procedimento e limites completos: [BOOTSTRAP_ADMINISTRATIVO.md](BOOTSTRAP_ADMINISTRATIVO.md). A migration B.1 e o histórico documental abaixo foram preservados. O estado anterior que dizia aguardar o primeiro teste de cadastro foi superado pelo teste relatado pelo responsável e pela implantação acima; não repetir B.1 nem o bootstrap.


## Estado atual — 13/09/2026 — Cadastro desbloqueado após conferir a migration no DEV

**A migration `20260913000100_access_requests.sql` foi aplicada pelo responsável no Supabase DEV e a estrutura foi conferida remotamente nesta rodada.** O responsável informou tabela vazia, RLS habilitada, uma policy e URLs de Auth salvas. O bloqueio temporário da aplicação foi removido, sem alterar a migration, RLS ou confirmação de e-mail. A tela Solicitar acesso está pronta para o próximo cadastro manual, sujeito às condições de envio do provedor. **B.1 continua parcial:** ainda faltam cadastro, confirmação, sessão, logout e testes RLS com conta controlada.

### Causa da mensagem e correção

Em `src/lib/auth/service.ts`, `requestAccess()` consultava `access_requests_schema_version()` antes de chamar `supabase.auth.signUp()`. Qualquer erro dessa RPC, ou retorno diferente do número `1`, mostrava **“A solicitação de acesso ainda está em preparação. Tente novamente mais tarde.”** e encerrava o fluxo antes do Auth. Era a proteção temporária da etapa anterior à aplicação da migration, não uma resposta de envio de e-mail ou uma tentativa de INSERT negada pela policy.

Foi removido somente esse gate; o cadastro validado segue diretamente para `auth.signUp`, com nome e informações declaradas permitidas. A RPC continua disponível como diagnóstico independente. **Não foi possível recuperar o erro de transporte/retorno da tentativa original do usuário; não atribuir a ela uma causa de rede específica.** Na verificação desta rodada, uma falha de conexão no sandbox foi resolvida na repetição autorizada, e a RPC retornou versão `1`.

Server Action, callback PKCE, cookies do SDK oficial, validação de domínio/senha, respostas públicas genéricas e bloqueio operacional permanecem. O aviso após cadastro não comprova entrega de e-mail: o tratamento público do provedor não revela a existência de contas. Nenhum usuário, e-mail ou dado de autenticação foi criado manualmente para contornar o fluxo.

### Criação automática e proteção confirmadas no banco

Consulta de catálogo somente leitura pelo CLI, com vínculo conferido internamente contra o DEV configurado em `.env.local`, confirmou:

| Objeto/controle | Estado verificado |
| --- | --- |
| `public.access_requests` | Existe, com as 9 colunas descritas na revisão histórica abaixo; PK, FK e cinco CHECKs esperados. A tabela vazia foi informada pelo responsável antes do novo teste. |
| RLS | Habilitada. |
| Policy | Uma: `access_requests_select_own`, SELECT para `authenticated`, condicionada a `auth.uid() = auth_user_id`. |
| Privilégios do cliente | `authenticated` possui somente SELECT; `anon` não possui acesso à tabela. INSERT/UPDATE/DELETE negados para ambos. |
| Trigger | `dialogo_sync_access_request` existe e está ativo em `auth.users`. |
| Função de sincronização | `sync_dialogo_access_request()`, `SECURITY DEFINER`, `search_path` vazio; definição conferida. |
| Diagnóstico | `access_requests_schema_version()` retorna `1`. |

O trigger cria a solicitação **na mesma transação da criação em Auth**, usando `NEW.id` e status constante `PENDENTE_APROVACAO`. O CHECK também restringe o status. Nenhum `auth_user_id`, status ou perfil fornecido pelo solicitante pode ser usado como concessão. A confirmação deriva de `auth.users.email_confirmed_at`; metadados não aprovam contas. O cliente não precisa de INSERT na tabela. **Nenhuma policy ampla foi adicionada, nenhuma nova migration foi necessária e não é preciso executar outro `db push` por esta correção.**

A inspeção de catálogo comprova a estrutura, mas não substitui testes usando sessões de usuários. Não foram executados fixtures em `auth.users`, testes SQL no DEV compartilhado ou testes com privilégios administrativos apresentados como se fossem o usuário.

### URLs, ambiente e próximo cadastro manual

O responsável confirmou que salvou em **Supabase DEV → Authentication → URL Configuration**:

| Campo | Valor |
| --- | --- |
| Site URL | `http://127.0.0.1:3001` |
| Redirect URL e callback real | `http://127.0.0.1:3001/auth/callback` |

`/auth/callback` continua sendo a única rota de confirmação implementada; recuperação de senha permanece em preparação, sem rota nova. A prévia antiga da porta 3001 foi substituída pelo build corrigido, com rede permitida e `APP_URL` definido somente no processo. O processo original da porta 3000 foi preservado. `.env.local` não foi alterado e seus valores não foram registrados. O teste sem código confirmou retorno à entrada na mesma origem, mas não é teste de confirmação real.

**Próximo passo:** o responsável acessa `http://127.0.0.1:3001/solicitar-acesso` e faz o cadastro da própria conta controlada `@dialogo.com.br`. Depois, conferir conta no Auth, solicitação vinculada com status pendente, confirmação no mesmo navegador que iniciou o PKCE, login com a senha criada, bloqueio de módulos e Sair. O roteiro detalhado de dez testes permanece no histórico abaixo; seus pré-requisitos de migration/URLs já foram atendidos. Autoalteração de status e leitura por outra identidade precisam de sessão real autorizada, sem `service_role`. Não criar uma segunda conta por suposição.

**SMTP corporativo continua pendente e confirmação permanece obrigatória.** O envio padrão do Supabase é restrito a endereços de membros da equipe da organização e, na documentação atual, possui limite de dois e-mails por hora. Isso pode impedir o teste da caixa controlada e não oferece confirmação pronta para produção. Não alterar SMTP, desligar confirmação ou adicionar pessoas à equipe administrativa para contornar o envio. Se bloquear o cadastro, registrar a limitação sem dados sensíveis para decisão do responsável. Fonte: [SMTP do Supabase](https://supabase.com/docs/guides/auth/auth-smtp).

Se for necessário reabrir a prévia, **somente com a porta 3001 livre**, executar na raiz do projeto:

```powershell
$env:APP_URL = 'http://127.0.0.1:3001'
npm.cmd run start -- --hostname 127.0.0.1 --port 3001
```

O build corrigido já foi gerado. Esses comandos não publicam a aplicação nem configuram o piloto.

### Testes realmente executados nesta correção

| Verificação | Resultado |
| --- | --- |
| `npm.cmd run verify:supabase` | Conectado: configuração e clientes presentes, Auth acessível, nenhuma sessão autenticada. |
| `npm.cmd run verify:auth-setup` | Versão `1`, e-mail/cadastro habilitados, confirmação obrigatória; `ready_for_authorized_test`. Primeira tentativa restrita falhou na conexão; repetição autorizada passou. |
| Catálogo remoto via CLI, somente leitura | Tabela, constraints, RLS, policy, privilégios, trigger e função conferidos, sem gravar dados. |
| `npm.cmd run lint` | Aprovado, saída 0. |
| `tsc --noEmit` | Aprovado, saída 0. |
| `npm.cmd run build` | Aprovado, saída 0. |
| `npm.cmd run test:auth` | **24/24**. Inclui SDK SSR oficial com transporte inteiramente simulado: somente POST Auth, sem RPC/escrita REST, callback 3001, PKCE/cookies, metadata restrita e sessão ausente. Não cria contas nem testa RLS remoto. |
| `npm.cmd run test:supabase` | **10/10**, testes offline. |
| Regressões Bloco A | Ranking **14/14**, acesso **16/16**, contexto de auditorias **15/15**, navegação aprovada e catálogo de Segurança **205 itens** verificado. |
| Navegador no build corrigido | Entrar/Solicitar acesso em desktop e celular; domínio inválido e senhas divergentes; `/app`, `/app/auditorias`, `/app/agenda` e `/aguardando-liberacao` protegidos para anônimo; callback sem código na mesma origem. Sem dados operacionais nem erros de página. |
| Cadastro/e-mail, sessão, logout e RLS com conta real | **Não executados pelo agente.** Aguardam o próximo teste manual e contexto autorizado para isolamento entre identidades. |

Arquivos alterados: `src/lib/auth/service.ts`, `scripts/test-auth.mjs`, `docs/RETOMADA.md` e `docs/PLANO_BLOCO_B.md`. Migration original, SQL/RLS, dependências e lockfile preservados. Nenhuma conta ou mensagem criada/enviada pelo agente; sem Render, tabelas operacionais, Storage, limpeza, mudança de D01/D02/D03 ou alteração de `nexobra-main`. **Parar para o responsável realizar o próximo cadastro.**

## Histórico — 13/09/2026 — Validação prática interrompida no login do CLI

**Registro anterior, superado pelo estado atual acima.** As instruções seguintes de login/aplicação da migration eram pendências daquela rodada e não devem ser repetidas para esta correção.

**A migration NÃO foi aplicada nesta execução.** O Supabase CLI foi executado via `npx`, versão **2.117.0**, mas a consulta de autenticação pelo próprio CLI retornou `cliAuthenticated: false`, `loginRequired: true`. Conforme a instrução do responsável, a execução parou antes de solicitar credenciais, vincular o projeto ou aplicar SQL. **B.1 permanece parcial:** cadastro, sessão, logout e RLS com conta controlada ainda não foram comprovados.

Foram lidos AGENTS.md, CLAUDE.md, esta retomada, plano B, D02/D03, a migration e o código do acesso/callback. O arquivo SQL não foi alterado. Nenhum usuário foi criado pelo agente, nenhuma linha foi inserida para simular autenticação, nenhum e-mail enviado e nenhum serviço de produção acessado. Não houve alteração de SMTP, confirmação de e-mail, servidor, configuração local de ambiente, telas ou funcionamento da aplicação.

### Revisão da migration, sem mudança do arquivo

[supabase/migrations/20260913000100_access_requests.sql](../supabase/migrations/20260913000100_access_requests.sql) contém uma transação e cria **somente a tabela funcional `public.access_requests`**, com estas **9 colunas**:

| Coluna | Tipo / obrigatoriedade / regra |
| --- | --- |
| `auth_user_id` | UUID obrigatório; chave primária e FK para `auth.users(id)`, `ON DELETE RESTRICT`. |
| `nome` | Texto obrigatório; nome aparado entre 1 e 160 caracteres. |
| `email` | Texto obrigatório; CHECK de formato e domínio corporativo exato. |
| `status_acesso` | Texto obrigatório; padrão e único valor permitido `PENDENTE_APROVACAO`. |
| `cargo_area_informado` | Texto opcional, até 160 caracteres. |
| `obra_referencia_informada` | Texto opcional, até 160 caracteres. |
| `email_confirmado_em` | Timestamp com fuso, opcional; derivado do Auth. |
| `created_at` | Timestamp com fuso obrigatório; padrão `now()`. |
| `updated_at` | Timestamp com fuso obrigatório; padrão `now()`, atualizado pelo trigger. |

São PK, FK, cinco CHECKs e seis colunas NOT NULL. RLS habilitada; policy única **`access_requests_select_own`**, `SELECT TO authenticated USING ((SELECT auth.uid()) = auth_user_id)`. `authenticated` recebe somente SELECT; `anon` não recebe acesso à tabela. Não há concessão ou policy de INSERT/UPDATE/DELETE para o cliente. Não há perfil efetivo, aprovação administrativa ou matriz de obras nesta tabela.

Funções: `is_dialogo_corporate_email(text)` valida formato/domínio; `sync_dialogo_access_request()` é função de trigger `SECURITY DEFINER`, com `search_path` vazio e execução revogada aos clientes; `access_requests_schema_version()` é `SECURITY INVOKER`, retorna apenas `1` e pode ser consultada por `anon`/`authenticated`. O trigger `dialogo_sync_access_request`, em `auth.users`, responde a INSERT e atualizações de e-mail, pedido de mudança, confirmação e metadados. Cria/sincroniza a solicitação com dados permitidos; confirmação vem de `auth.users.email_confirmed_at`; status/perfil de metadados não concedem acesso.

Não foi identificado bloqueante evidente de segurança/compatibilidade na revisão do SQL. Isso não substitui aplicação em PostgreSQL. Limites intencionais: conta com solicitação não pode ser excluída por causa da FK; mudança de e-mail é bloqueada nesta subetapa; novas identidades exigem domínio/nome válidos; contas anteriores não recebem backfill. Nenhuma tabela de auditoria, agenda, Storage ou permissões completas consta do arquivo.

### Estado remoto efetivamente verificado e bloqueio

- **CLI disponível via npx**, sem instalação como dependência do aplicativo e sem mudança em package.json/lockfile. A primeira tentativa falhou por EACCES no sandbox; a repetição permitida executou a versão 2.117.0. Essa falha de sandbox foi resolvida; o impedimento restante é login administrativo ausente.
- Não existem `supabase/config.toml` nem vínculo local `supabase/.temp/project-ref`. Não foram inicializados nesta rodada. A verificação pelo CLI também considerou seu mecanismo oficial de credenciais; não se concluiu ausência de login apenas pela falta de um arquivo de token.
- `npm.cmd run verify:auth-setup`: Auth acessível, cadastro/e-mail habilitados, confirmação obrigatória; **`requestSchema: migration_pending`, `status: schema_pending`, saída 1**. Consulta somente leitura com chave publicável, sem valores ou respostas brutas expostos.
- A RPC da migration não foi encontrada no catálogo exposto pela API. **Existência da tabela, RLS, constraints, policies, trigger e inventário completo do banco remoto ainda não foram certificados**, pois exigem consulta administrativa de catálogo. Não presumir que uma RPC ausente prova sozinha a ausência de todo objeto da tabela.
- Não houve `init`, `link`, `db push`, SQL Editor ou migration executada pelo agente; nenhuma criação remota de tabela é atribuída a esta execução. Não foi utilizado `service_role`, nem serão usados privilégios administrativos para simular o teste de acesso do usuário.

**Comando que o responsável deve executar agora, diretamente no terminal na raiz do projeto:**

```powershell
npx.cmd --yes supabase@2.117.0 login
```

Concluir o fluxo oficial de autenticação no terminal/navegador. Não enviar token, código, senha ou saída com credenciais na conversa; basta informar que o login foi concluído. Não colocar token ou senha como argumento do comando. Este login é de administração do Supabase CLI, separado da conta de teste do Diálogo Auditorias. Referência: [login do CLI](https://supabase.com/docs/reference/cli/supabase-login).

Depois do login, retomar a conferência do vínculo contra o DEV já configurado, sem imprimir a URL/chave/referência extraída de `.env.local`. A sequência pendente é inicialização local do CLI, vínculo conferido ao DEV, inventário de catálogo antes da alteração, histórico/dry-run indicando **somente `20260913000100_access_requests.sql`**, aplicação rastreável e comparação do catálogo/histórico depois. O rastreamento interno `supabase_migrations` do CLI não é tabela funcional de auditorias. Não usar `db reset`, seed, aplicação indiscriminada de arquivos ou reparo fictício de histórico. Se o CLI solicitar senha, o responsável deve fornecê-la diretamente no terminal; o agente deve parar nessa solicitação e indicar o comando pertinente.

A versão consultada oferece `supabase db query --linked` via Management API, que poderá consultar os catálogos após login/vínculo. Conferir `pg_class` (RLS), `information_schema.columns`, `pg_constraint`, `pg_policies`, privilégios efetivos de `anon`/`authenticated`, `pg_proc`, `pg_trigger` e inventário de tabelas `public` antes/depois. Consultar somente estrutura, sem selecionar hashes de senha ou dados pessoais desnecessários. Uma revisão do arquivo local não equivale a essa conferência remota.

### URLs reais para o teste na porta 3001

Origem de teste informada e respondendo: **`http://127.0.0.1:3001`**. O código de `src/lib/auth/site-url.ts`, usado no `emailRedirectTo` de `signUp`, monta **`/auth/callback`**; a rota real está em `src/app/auth/callback/route.ts` e recebe código PKCE. GET sem código no servidor atual retornou HTTP 307 para a página de entrada **na mesma origem 127.0.0.1:3001**, confirmando a origem utilizada no processo em execução. Não foi enviado código de confirmação real.

No painel, abrir **o projeto Supabase DEV → Authentication → URL Configuration**:

| Campo / ação | Valor para este teste |
| --- | --- |
| **Site URL** → salvar | `http://127.0.0.1:3001` |
| **Redirect URLs** → **Add URL** → adicionar/salvar | `http://127.0.0.1:3001/auth/callback` |
| Callback de confirmação da aplicação | A mesma URL acima; não há outro campo de callback OAuth/Microsoft a configurar neste fluxo. |
| Recuperação de senha | Nenhuma rota de recuperação implementada; não cadastrar caminho inventado. A interface continua “Em preparação”. |

Esses valores foram **derivados do código e da resposta local**, mas o estado salvo no painel Supabase **não foi lido nem alterado** nesta execução. A configuração manual continua pendente de conferência. `localhost:3000` é outro endereço, usado no histórico de desenvolvimento; não substitui `127.0.0.1:3001` no teste atual. Não adicionar curingas ou URLs de módulos operacionais. Após callback, o redirecionamento para `/aguardando-liberacao` é interno à aplicação, não uma segunda URL de retorno que precise ser cadastrada no Auth. Referência: [configuração oficial de Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

O processo atual está usando a origem correta; se for iniciado novamente em modo build/start, manter `APP_URL` com a origem de teste antes de iniciar, conforme os comandos históricos abaixo. Nenhum servidor foi iniciado ou reiniciado nesta rodada.

**Confirmação de e-mail permanece obrigatória. SMTP corporativo continua pendente e não foi alterado.** Se o projeto usar o envio padrão do Supabase, há restrição de destinatários aos endereços da equipe do projeto e limites de envio; isso não equivale a SMTP pronto para produção. Se impedir a caixa controlada, registrar o erro sem dados sensíveis e parar para decisão do responsável. Não desligar confirmação, mudar SMTP ou conceder acesso à equipe do projeto automaticamente para viabilizar o teste. Fonte: [restrições do envio padrão](https://supabase.com/docs/guides/auth/auth-smtp).

### Roteiro da conta controlada — preparado, ainda não executado

**Somente depois da migration aplicada/conferida e das URLs salvas.** O próprio responsável cria **uma** conta individual usando caixa real controlada `@dialogo.com.br`, pela tela `http://127.0.0.1:3001/solicitar-acesso`. O agente não cria a conta por ele. Não enviar a endereços fictícios e não registrar senha como evidência.

| Teste | Evidência esperada / limite |
| --- | --- |
| 1. Solicitar acesso | Cadastro pela tela com nome, senha própria e confirmação; informações auxiliares não são permissões. |
| 2. Senha protegida | Revisar logs/destinos sem copiar a senha; tabela da aplicação não tem coluna de senha. Supabase Auth mantém o mecanismo de credenciais. Logs de argumentos de Server Functions já estão desativados, mas o teste real permanece pendente. |
| 3. Identidade no Auth | Conferir a conta em Authentication → Users, sem exportar registros ou hashes. |
| 4. Solicitação correspondente | Conferir a linha em `access_requests` e o vínculo com o ID do Auth; visão administrativa serve para conferência de existência, não para aprovar RLS de usuário. |
| 5. Situação inicial | `PENDENTE_APROVACAO`, confirmação inicial/concluída coerente com o serviço, nenhuma liberação automática. |
| 6. Autoaprovação negada | Requisição de alteração usando a própria sessão real deve falhar e preservar o status. Não usar SQL Editor/Table Editor administrativo ou `service_role` como se fossem o usuário. |
| 7. Operação bloqueada | Após autenticar, tentar `/app`, `/app/auditorias` e `/app/agenda`; permanecer no estado restrito, sem módulos ou dados operacionais. |
| 8. Confirmação e login | Confirmar conforme exigência atual, no navegador que iniciou PKCE; entrar em `/entrar` com a senha criada; própria solicitação deve permanecer após recarregar. |
| 9. Logout | Usar Sair, realizar nova requisição/recarregar e tentar `/aguardando-liberacao`; exigir autenticação novamente. Não confundir conteúdo anterior no histórico/cache com uma nova consulta autorizada. |
| 10. Outra identidade | Verificar negação de leitura com outra sessão autenticada **já existente e autorizada**, quando disponível. Uma única conta e um pedido anônimo não comprovam isolamento entre duas identidades autenticadas. Não criar segunda conta nesta etapa por suposição; registrar esse teste pendente até haver contexto autorizado. |

Após aplicação será possível testar acesso anônimo sem criar conta, por HEAD/consulta sem retorno de linhas com a chave publicável e sem sessão, além dos privilégios de catálogo. Esse resultado não substitui os testes 6/10 com sessão real. O arquivo `supabase/tests/access_requests.sql` **não foi e não deve ser executado no DEV compartilhado nesta rodada**: insere fixtures em `auth.users` e foi preparado exclusivamente para instância local isolada. Nenhuma policy foi marcada aprovada por inspeção do SQL.

### Resultados desta execução e continuidade

| Verificação realmente executada | Resultado |
| --- | --- |
| Leitura/revisão da migration | Sem bloqueante evidente; arquivo preservado. Não é validação PostgreSQL. |
| `npx.cmd --yes supabase --version` | **2.117.0**, executado após resolver restrição do sandbox. |
| Consulta de autenticação pelo CLI | **Login necessário**; saída filtrada para não mostrar projetos/configurações. |
| `npm.cmd run verify:auth-setup` | Auth acessível, confirmação obrigatória, migration pendente; saída 1 por `schema_pending`. |
| HTTP local `/entrar` | **200**, formulário presente na porta 3001. |
| HTTP local `/auth/callback` sem código | **307**, retorno à entrada na origem correta. Não testa troca real de código ou e-mail. |
| Migration / catálogos remotos / policies | **Não executados**, aguardam autenticação administrativa. |
| Conta controlada, cadastro, sessão, logout, leitura própria/entre usuários | **Não executados.** |
| `verify:supabase`, lint, `tsc --noEmit`, build e testes existentes após migration | **Não executados nesta rodada:** a migration não foi aplicada e o responsável determinou parar se fosse necessário autenticar o CLI. Os resultados anteriores permanecem históricos abaixo. |

Depois da aplicação, executar a bateria solicitada: `npm.cmd run verify:supabase`, `npm.cmd run lint`, `npx.cmd tsc --noEmit`, `npm.cmd run build`, `npm.cmd run test:auth`, `npm.cmd run test:access` e demais regressões pertinentes existentes. Registrar resultados novos, sem reutilizar aprovações históricas como se tivessem sido executadas depois da migration.

Nesta rodada foram alterados somente esta retomada e [PLANO_BLOCO_B.md](PLANO_BLOCO_B.md). A migration, código, `.env.local`, `.gitignore`, dependências e lockfile permaneceram intactos. D01/D02/D03 preservados. Nenhuma publicação Render, limpeza de fotos, tabela funcional adicional ou alteração de `nexobra-main`. **Parar e aguardar o login do CLI pelo responsável.**

## Histórico — 13/09/2026 — Primeira parte funcional de B.1

**Conexão real com Supabase DEV confirmada. Código de cadastro/login entregue; ativação da estrutura mínima e teste completo com conta autorizada pendentes. B.1 NÃO está concluído.** Esta rodada foi autorizada para Entrar, Solicitar acesso, cadastro/login no Supabase Auth, logout e estado autenticado restrito. Não abrange aprovação administrativa, permissões completas, auditorias/agenda persistentes, Storage, SMTP corporativo definitivo ou publicação.

O diagnóstico anterior de arquivo local vazio está superado: as duas variáveis estão agora configuradas no disco, sem seus valores registrados. `.env.local` continua coberto por `.env*` no `.gitignore`; nenhum desses arquivos foi alterado pelo agente. Não foram solicitados nem usados senha do banco, chaves privilegiadas ou tokens administrativos. Não há integração Microsoft removida.

### Implementação entregue

- **Entrar** (`/entrar`) e **Solicitar acesso** (`/solicitar-acesso`), com identidade visual existente, senha própria, confirmação da senha e campos declarados opcionais de cargo/área e obra de referência. Não há listas de obras, escolha de perfil ou concessão de módulos. Recuperação de senha aparece como **em preparação**.
- Server Actions chamam **`supabase.auth.signUp`**, **`signInWithPassword`** e **`signOut({ scope: "local" })`**. Não há autenticação simulada, senha em tabela própria, logs de senha ou gravação manual de tokens em localStorage. Sessão/cookies e PKCE usam o SDK oficial `@supabase/ssr`; nenhuma dependência nova foi instalada nesta rodada.
- Domínio exato `dialogo.com.br` validado no servidor, com domínio sem distinção de caixa; formato ASCII dot-atom, limites de comprimento e rejeição de subdomínios/domínios semelhantes. A aplicação preserva pontos, sufixos e a parte local ao enviar ao Auth; não inventa equivalências. A identidade/e-mail persistidos vêm do serviço Auth. A política final de comparação e demais parâmetros de conta continuam no detalhamento D02. Senha não é aparada; confirmação divergente é rejeitada antes da chamada ao provedor. Nome e campos opcionais têm limite técnico de 160 caracteres.
- Cadastro verifica antes a RPC **`access_requests_schema_version()`**, que deve retornar `1`. Sem essa estrutura, não chama `signUp`: mostra solicitação em preparação. Respostas relacionadas a contas existentes ou recusadas pelo provedor têm aviso público genérico, sem comprovar entrega de e-mail nem revelar existência de funcionário.
- **`/auth/callback`** troca o código PKCE pelo mecanismo oficial, confere a identidade e redireciona somente a destinos internos fixos. O link deve ser aberto no navegador onde o cadastro foi iniciado, pois o verificador PKCE fica nos cookies desse contexto. Nenhum código/link completo é registrado. `APP_URL`, quando necessário, é uma origem confiável configurada no servidor; não é derivada do Host/formulário. Em `npm run dev`, o padrão local é `http://localhost:3000`. Fora de desenvolvimento, definir `APP_URL` explicitamente antes de testar confirmações.
- **`/aguardando-liberacao`** exige identidade consultada no Auth pelo servidor, mostra somente a própria conta/solicitação e Sair. Mensagens: “Seu acesso está aguardando liberação do Administrativo.” e “E-mail/cadastro realizado. Aguardando liberação do Administrativo.” Confirmação exibida vem de `email_confirmed_at` do Auth, nunca de metadados do navegador. Se não houver registro mínimo ou a consulta falhar, informa a pendência sem inventar que a solicitação está salva.
- A raiz leva à entrada; **`/app` e seus subcaminhos são bloqueados no servidor para todas as contas nesta subetapa**. Nenhum status/perfil enviado pelo cliente libera operação. O Proxy renova a sessão pelo SDK e as páginas reconferem a identidade; a proteção não depende só do menu. Respostas privadas usam `no-store` e callback usa `no-referrer`.
- `next.config.ts` desativa logs de argumentos de Server Functions, encaminhamento de console do navegador e logs de requisição de callback em desenvolvimento. A versão instalada do Next registra argumentos por padrão; esse ajuste evita registrar os campos dos formulários. Logs da futura hospedagem também precisam ser revisados antes da publicação, que não ocorreu.

Os componentes, catálogos e regras demonstrativas do Bloco A continuam no código, mas **não são importados pelas novas rotas públicas/autenticadas**. Não foi criada rota de demonstração para contornar o bloqueio. Nenhum exemplo foi convertido em conta, obra ou auditoria real. D01, separação das disciplinas, pesos pendentes, navegação entre itens e A-V01 permanecem preservados.

### Migration e RLS — preparados, ainda não aplicados no DEV

Arquivo: [20260913000100_access_requests.sql](../supabase/migrations/20260913000100_access_requests.sql). Define **somente `public.access_requests`**, com `auth_user_id`, nome/e-mail, `status_acesso`, informações declaradas, `email_confirmado_em`, `created_at` e `updated_at`. A migration é transacional; não cria tabelas de operação, fila administrativa ou matriz de concessões.

- Status aceita apenas **`PENDENTE_APROVACAO`**, inclusive por restrição de banco. Aprovação exige uma próxima implementação/migration; não há aprovação automática ou quinto perfil.
- RLS habilitada e política **`access_requests_select_own`**: `authenticated` consulta apenas linha cujo `auth_user_id = auth.uid()`. Anônimo não consulta solicitações. Sem concessão/política de INSERT, UPDATE ou DELETE para clientes; não há edição direta de cadastro nesta interface.
- Trigger protegido em `auth.users` cria/sincroniza somente nome/informações declaradas e dados confiáveis de e-mail/horário. Ignora status, perfil e aprovação de metadados; deriva confirmação de `auth.users.email_confirmed_at`. Valida domínio inclusive no cadastro direto pela API Auth. A gravação da solicitação participa da transação de criação da identidade.
- Mudança de e-mail é bloqueada nesta subetapa, até implementar a política D02. Não há backfill de contas anteriores, sobrescrita de status ou exclusão de contas. Conta anterior sem solicitação exige reconciliação revisada; continua sem operação. FK usa `ON DELETE RESTRICT`, preservando a solicitação se alguém tentar excluir a identidade.
- A RPC de versão é `SECURITY INVOKER`, sem dados pessoais ou privilégios elevados; `anon` e `authenticated` podem consultar somente seu número. A aplicação não utiliza `service_role`.

**Nenhuma tabela remota foi declarada criada.** Consulta real de prontidão retornou `requestSchema: migration_pending`. Não há sessão administrativa de banco/navegador, Supabase CLI, psql ou Docker disponíveis para aplicar a migration por esta sessão. O responsável recebeu a orientação de aplicar o arquivo versionado no SQL Editor do **projeto DEV correto**; até o fechamento deste registro, não houve confirmação de aplicação. A chave publicável não autoriza executar DDL.

Testes em [supabase/tests/access_requests.sql](../supabase/tests/access_requests.sql) cobrem RLS, ausência de escrita/autoaprovação, identidade própria, confirmação confiável, formato/domínio e integridade/repetição no banco. São transacionais, com fixtures sem senha e `ROLLBACK`, e exigem marcador explícito **somente em banco local isolado**. **Não executar esse arquivo no DEV compartilhado. Testes PostgreSQL não foram executados; revisão estrutural não equivale a aprovação de RLS.** Repetição/concorrência de cadastro pela API Auth ainda precisa de teste autorizado separado.

### Verificações realmente executadas

| Verificação | Resultado nesta rodada |
| --- | --- |
| `npm.cmd run verify:supabase` | **Passou em chamada real:** variáveis presentes, clientes inicializados, `authReachable: true`, `session: none`, `status: connected`. Nenhuma conta ou sessão de usuário criada. |
| `npm.cmd run verify:auth-setup` | Auth acessível; e-mail/cadastro habilitados e **confirmação de e-mail obrigatória**. **Saída 1 esperada pela pendência:** `requestSchema: migration_pending`, `status: schema_pending`. Apenas GET de configuração e RPC de versão; nenhuma alteração. |
| `npm.cmd run test:auth` | **24/24 passaram**, offline: domínio/formato, confirmação de senha, validação anterior ao cliente, campos permitidos, bloqueio por migration ausente, respostas genéricas, login somente pendente, metadados forjados e logout pelo SDK/falhas. Não comprova sessão real ou RLS remoto. |
| `npm.cmd run test:supabase` | **10/10 passaram**, offline. |
| `npm.cmd run lint` | **Passou sem avisos na execução final.** Dois avisos iniciais de argumentos não usados foram corrigidos. |
| `npx.cmd tsc --noEmit` | **Passou**, inclusive após geração dos tipos das novas rotas. |
| `npm.cmd run build` | **Passou**, com as novas rotas dinâmicas e Proxy. Nenhuma publicação. |
| `npm.cmd run verify:security` | **Passou:** 205 itens e respectivos códigos/textos/ordem/documentação preservados. |
| `npm.cmd run test:navigation` | **Passou:** limites, zero, independência de respostas e modelos. |
| `npm.cmd run test:access` | **16/16 passaram**, regras demonstrativas incluindo D01. |
| `npm.cmd run test:audit-context` | **15/15 passaram**, rascunhos/modelos e respostas independentes. |
| `npm.cmd run test:ranking` | **14/14 passaram.** |
| Navegador local do novo acesso | **Passou no build em `http://127.0.0.1:3001`**, Edge sem janela, contexto novo: Entrar/Solicitar acesso em desktop e celular, domínio inválido, senhas divergentes, ausência de módulos/dados demonstrativos, quatro redirecionamentos de rotas restritas, callback sem redirecionamento externo; zero erros de página. Somente formulários inválidos foram enviados, rejeitados antes de Auth; nenhum e-mail ou conta foi criado. |
| Localhost original, porta 3000 | **Não aprovado nesta rodada:** processo existente aceita conexões, mas as páginas não responderam no prazo, inclusive fora do sandbox. Foi preservado, sem interromper/reiniciar. Build conferido em servidor auxiliar limitado ao loopback, porta 3001. |
| Sessão real / RLS PostgreSQL | **Não executados.** Sem conta corporativa autorizada, envio aprovado e migration aplicada. Logout só tem teste offline de delegação/resultado do SDK; não declarar sessão real encerrada em teste. |

Os diagnósticos de rede inicialmente falharam no sandbox e foram repetidos com permissão de rede, obtendo os resultados reais acima. O navegador integrado não estava disponível; foi usado o roteiro local com Playwright já existente em `.tmp/visual-qa`, sem instalar biblioteca. Uma seleção ambígua de alertas no roteiro foi corrigida antes da execução final aprovada. Capturas `auth-*.png` e roteiro `check-auth.cjs` estão nessa pasta temporária, sem promessa de versionamento/backup. O aviso Node `MODULE_TYPELESS_PACKAGE_JSON` permanece não fatal.

O roteiro visual antigo do A pressupõe o simulador na raiz; não foi reaprovado sob as novas rotas de autenticação. As regressões de domínio do A passaram, mas isso não certifica autorização persistente, revogação, isolamento operacional ou salvamento. Nenhum teste de segurança integral foi marcado como aprovado.

### Como conferir e próxima pendência

1. **Aplicar a migration versionada no Supabase DEV** pelo responsável com acesso administrativo ao projeto. Não enviar credenciais na conversa. Não executar SQL de testes no DEV compartilhado. Depois rodar `npm.cmd run verify:auth-setup`; esperar `requestSchema: version_1`. Isso comprova disponibilidade da versão, não substitui os testes RLS.
2. Manter confirmação de e-mail ligada, como verificado. Conferir em **Authentication → URL Configuration** o Site URL local e permitir o retorno exato `http://localhost:3000/auth/callback` para o desenvolvimento padrão. Em porta alternativa, configurar sua origem em `APP_URL` e autorizar o retorno correspondente; não usar curingas amplos ou destino enviado pelo formulário. Nenhuma configuração externa foi alterada nesta rodada.
3. Identificar uma caixa corporativa real de teste controlada e **autorizar explicitamente o envio**. O envio padrão do Supabase tem restrições e é limitado a endereços da equipe do projeto; se a caixa não for elegível, preparar um serviço de e-mail autorizado. **SMTP corporativo/remetente e entrega permanecem pendentes.** Não desabilitar confirmação para contornar o teste, inventar remetente ou enviar a endereços fictícios. Fonte: [documentação oficial de SMTP](https://supabase.com/docs/guides/auth/auth-smtp).
4. Em teste autorizado posterior: solicitar acesso, confirmar no mesmo navegador, entrar com a senha criada, conferir a própria solicitação pendente, tentar URL operacional, sair e confirmar bloqueio em requisição nova. Testar também conta sem confirmação, repetição, acesso direto ao banco e tentativa de alterar status em ambiente isolado. Não marcar essas etapas concluídas por teste offline.

No momento, as telas, validações e bloqueios locais estão operacionais, **mas o cadastro real fica indisponível pela migration pendente e o ciclo cadastro/confirmação/login/logout com uma conta real não foi comprovado**. Aprovação administrativa, recuperação/reenvio completos, primeira conta AD controlada, revisão/revogação com sessões abertas e concessões vigentes seguem pendentes. P11/P12 continuam parciais, sem alterar demais pendências.

**Auditorias, respostas, agenda e anexos não passaram a ser persistentes.** Os antigos rascunhos demonstrativos continuam em memória e não são migrados/salvos ao recarregar. Nenhuma foto, PDF, tabela operacional ou arquivo foi criado/limpo; publicação, cálculo oficial, D03 e `nexobra-main` permanecem intocados.

Para conferir as telas nesta sessão, usar **`http://127.0.0.1:3001/entrar`**, servidor auxiliar do build deixado disponível. A porta 3000 original continua ocupada e não respondeu; não iniciar outro processo nessa porta sem resolver o processo existente. Em uma próxima sessão, **se a porta pretendida estiver livre**, os comandos na raiz são:

```powershell
# Desenvolvimento padrão (retorno local padrão da aplicação)
npm.cmd run dev

# Alternativa para conferir o build pronto, sem usar a porta 3000
$env:APP_URL = 'http://127.0.0.1:3001'
npm.cmd run start -- --hostname 127.0.0.1 --port 3001

# Diagnósticos separados do servidor, sem exibir valores
npm.cmd run verify:supabase
npm.cmd run verify:auth-setup
```

Arquivos novos: `src/lib/auth/{contracts,validation,service,site-url,session}.ts`, `src/lib/supabase/fetch.ts`, `src/proxy.ts`, páginas `entrar`, `solicitar-acesso`, `aguardando-liberacao`, `app/[[...path]]`, `src/app/auth/{actions.ts,callback/route.ts}`, componentes `src/app/components/auth/{AuthShell,AuthForm,LogoutButton}.tsx` e `auth.module.css`, `scripts/check-auth-setup.mjs`, `scripts/test-auth.mjs`, migration e testes SQL. Alterados: `src/app/page.tsx`, `src/lib/supabase/server.ts`, `next.config.ts`, `package.json`, esta retomada e [PLANO_BLOCO_B.md](PLANO_BLOCO_B.md). Sem novas dependências ou mudanças de lockfile nesta rodada. D02/D03 e escopo original preservados. **Parar no recorte atual; não avançar automaticamente para outras partes de B.1/B.2.**

## Histórico — 13/09/2026 — Base de clientes Supabase; conexão externa então pendente

O responsável autorizou **somente a infraestrutura básica Next.js ↔ Supabase DEV**, sem cadastro/login completo, confirmação/recuperação, aprovação administrativa, tabelas de auditoria, agenda persistente, Storage, limpeza ou publicação. **B.1 não está concluído.** A implementação local abaixo foi realizada; a validação da conexão real está bloqueada pela configuração ainda não salva no disco.

### Configuração informada e estado efetivamente verificado

**Supabase DEV configurado externamente, conforme informado pelo responsável.** Nenhum projeto/conta foi criado pelo agente, nem painel externo consultado. A integração ainda não confirmou acesso ao projeto remoto.

O usuário informou que as duas variáveis estavam preenchidas no editor, mas a inspeção sem exibir conteúdo constatou que **`.env.local` existe e sua versão salva no disco está vazia**. `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` não foram encontradas como valores configurados pelo carregador de ambiente. Foi solicitado salvar o arquivo no editor, sem enviar valores na conversa; até a última verificação essa condição permanecia pendente. O agente não editou o arquivo nem solicitou senha de banco, chave privilegiada ou token.

`.gitignore` já contém `.env*`; a regra foi verificada como aplicável a `.env.local`, sem precisar modificar o ignore. O Git não está disponível no terminal e não foi encontrada pasta `.git` na raiz; portanto não foi auditado histórico de commits/rastreamento remoto. A proteção constatada é a regra local de exclusão. Nenhum valor de variável ou credencial foi exibido, copiado para documentação ou usado em testes fictícios.

### Implementado nesta etapa

- Instalados somente os pacotes oficiais diretos **`@supabase/supabase-js` 2.116.0** e **`@supabase/ssr` 0.12.7**, com dependências transitivas registradas no lockfile. Next.js/React permanecem nas versões anteriores. O carregador `@next/env` já acompanha o Next instalado; nenhuma biblioteca adicional foi instalada para configuração ou testes.
- `src/lib/supabase/client.ts`: fábrica de cliente para componentes de navegador, usando `createBrowserClient`.
- `src/lib/supabase/server.ts`: fábrica por requisição para Server Components, Route Handlers e ações de servidor, com `createServerClient`, `await cookies()` e adaptador de leitura/escrita. Escrita em Server Components é limitada pelo Next; renovação de sessões/Proxy e autorização operacional devem ser implementadas/testadas na etapa de autenticação, antes de liberar esse fluxo.
- `src/lib/supabase/config.ts`: leitura das duas variáveis públicas por referências estáticas compatíveis com Next.js, validação e erros sem eco dos valores. Aceita chave no formato publicável; não utiliza chave privilegiada. URL exige HTTPS, exceto HTTP em loopback local, e não aceita credenciais ou parâmetros embutidos.
- `scripts/check-supabase.mjs` / **`npm.cmd run verify:supabase`**: carrega configuração local sem imprimir valores, inicializa a fábrica de navegador e um cliente SSR do SDK em contexto de cookies vazio, consulta `auth.getSession()` e faz somente **GET no endpoint Auth `/auth/v1/settings`**. Confirma conexão apenas com HTTP 200 e resposta no formato esperado. Não imprime configurações remotas, sessão, tokens, cabeçalhos ou erros brutos; falhas produzem estados fixos e saída não zero. Timeout de 15 segundos, sem cache e sem seguir redirecionamentos.
- `scripts/test-supabase.mjs` / **`npm.cmd run test:supabase`**: testes offline com fixtures artificiais, rede real bloqueada e restauração do ambiente após cada caso. Não carrega `.env.local`.

Uma sessão vazia pode ser resolvida localmente pelo SDK, por isso **`session: none` sozinho não comprova conexão**. O GET ao Auth confirma separadamente alcance e aceitação da configuração, sem criar usuários, enviar mensagens, renovar uma sessão existente ou alterar dados. O diagnóstico usa contexto isolado; não lê cookies da aba pessoal. Não é teste de login, permissões ou escrita em banco/arquivos.

Não foi criada tela técnica pública, endpoint de diagnóstico na aplicação ou indicador de conexão. `page.tsx`, telas, estilos, catálogos, navegação e estado demonstrativo do Bloco A permanecem intactos. As fábricas estão disponíveis para a próxima etapa; o protótipo não foi convertido em aplicação autenticada. O adaptador de cookies do Next não foi exercitado com sessão real nesta etapa.

Fontes técnicas consultadas: guias locais da versão instalada do Next sobre cookies/ambiente/limites de componentes; [clientes SSR oficiais do Supabase](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [limites de getSession](https://supabase.com/docs/reference/javascript/auth-getsession) e [especificação oficial de Auth, GET /settings](https://github.com/supabase/auth/blob/master/openapi.yaml). Os exemplos e decisões de infraestrutura anteriores permanecem históricos abaixo.

### Resultados reais dos testes

| Verificação | Resultado desta execução |
| --- | --- |
| `.env.local` / ignore | Arquivo existente, regra `.env*` aplicável; arquivo salvo vazio e variáveis ausentes. Conteúdo não exibido. |
| `npm.cmd run verify:supabase` | **Conexão não verificada:** saída 1, `configuration_error`; ambas as presenças falsas, clientes não inicializados com configuração real, sessão não consultada e chamada HTTP não iniciada. Não foi exibido “conectado”. |
| `npm.cmd run test:supabase` | **10/10 passaram.** Configuração ausente/inválida, rejeição de chave não publicável, ausência de eco, sessão vazia sem falso sucesso, HTTP 200 válido, outros status/HTML/JSON inválidos, erro de rede e timeout simulados. Nenhuma chamada externa. |
| `npm.cmd run lint` | **Passou**, incluindo os novos scripts. |
| `npx.cmd tsc --noEmit` | **Passou.** |
| `npm.cmd run build` | **Passou:** compilação, TypeScript e geração estática. Rotas permanecem `/` e `/_not-found`; sem publicação. |
| `npm.cmd run verify:security` | **Passou:** 205 itens, códigos, ordem, textos, grupos, subgrupos, páginas e orientações preservados. |
| `npm.cmd run test:navigation` | **Passou:** limites, respostas independentes, zero e modelos. |
| `npm.cmd run test:access` | **16/16 passaram**, no domínio demonstrativo. |
| `npm.cmd run test:audit-context` | **15/15 passaram**, no domínio demonstrativo. |
| `npm.cmd run test:ranking` | **14/14 passaram**, sem notas reais acrescentadas. |
| `node .tmp/visual-qa/check-block-a.cjs` | **Passou** em Edge sem janela/contexto novo: quatro perfis/duas atuações, D01 agenda/reagenda, consulta por auditor, rascunhos independentes, C†, respostas/observações, catálogos, navegação, prévia de impressão e celular; nenhum erro de página. |
| Localhost | HTTP 200 antes e depois do build em `http://localhost:3000`, usando servidor existente, sem interromper/reiniciar. |

O aviso Node `MODULE_TYPELESS_PACKAGE_JSON` continua não fatal, também nos testes de domínio anteriores. A primeira instalação falhou por restrição do ambiente (`EACCES` ao npm); a repetição autorizada instalou os dois pacotes com sucesso. O npm informou script de instalação não aprovado de `unrs-resolver`; não foi autorizado script extra e lint/TypeScript/build passaram. Nenhum teste operacional de autenticação, isolamento em servidor/dados, SMTP, persistência, arquivos, publicação ou backup foi aprovado por essas verificações.

### Arquivos e próximo passo

Criados: `src/lib/supabase/client.ts`, `server.ts`, `config.ts`, `scripts/check-supabase.mjs` e `scripts/test-supabase.mjs`. Alterados: `package.json`, `package-lock.json`, esta retomada e o aviso de estado em `docs/PLANO_BLOCO_B.md`. `.env.local` e `.gitignore` não foram alterados pelo agente. Nenhum arquivo existente de interface/domínio foi modificado ou removido; escopo original, D02/D03 e `nexobra-main` preservados. Capturas de regressão estão em `.tmp/visual-qa`, sem garantia de backup/versionamento.

**Próximo passo imediato:** salvar no editor o `.env.local` com as duas variáveis já informadas pelo responsável e executar `npm.cmd run verify:supabase` na raiz. Não compartilhar os valores. Somente após resultado real `connected` registrar sucesso de conexão; testes offline ou build não substituem essa comprovação. Não iniciar cadastro/login enquanto esta validação solicitada estiver pendente.

Para a futura tela real de cadastro/login, continuam necessários SMTP/serviço de envio, remetente autorizado, endereços de retorno, contas corporativas reais para teste com autorização de envios, parâmetros técnicos de conta D02 e primeiro Administrativo por procedimento controlado; também desenhar armazenamento protegido das solicitações e controles de aprovação/atividade/permissões, antes de implementar. Domínio `dialogo.com.br`, senha própria e aprovação AD já estão definidos. **SMTP/e-mail pendente; autenticação funcional completa e persistência de auditorias ainda não implementadas; B.1 permanece aberto.**

Os rascunhos e a agenda continuam em memória: fechar/recarregar perde dados digitados. D01, separação Qualidade/Segurança, pesos pendentes, publicação indisponível e A-V01 foram preservados. Nenhuma tabela, migração, Storage, envio de e-mail, exclusão de foto, contratação, publicação ou rotina D03 executados.

Com o servidor atual, abrir `http://localhost:3000`. Se estiver encerrado em uma próxima sessão, executar `npm.cmd run dev` na raiz. Não iniciar servidor duplicado para rodar o diagnóstico, que é independente do servidor local. A etapa de código foi limitada à infraestrutura solicitada; aguardar configuração salva/resultado de conexão e próxima autorização.

## Histórico — 13/09/2026 — D03, infraestrutura inicial e retenção

As verificações de ausência de integração/configuração abaixo descrevem a rodada documental anterior. A base de clientes e a pendência da configuração salva estão atualizadas acima; decisões de D03 permanecem válidas.

**Somente documentação nesta execução.** Criado [D03 — Infraestrutura inicial e retenção](ADENDO_INFRAESTRUTURA_RETENCAO.md), identificador disponível, sem sobrescrever outra decisão. O escopo revisado original foi preservado. [D02](ADENDO_CADASTRO_AUTENTICACAO.md) continua com cadastro restrito ao domínio exato `dialogo.com.br`, senha própria, confirmação pelo serviço e aprovação AD; a mesma senha é usada após liberação. D01 continua atribuindo agenda/reagenda ao Administrativo e auditoria ao auditor responsável.

### Decisões confirmadas, não configuradas

- GitHub para o código.
- Primeira instância paga do Render para a aplicação publicada do piloto.
- Supabase Free para autenticação, banco e arquivos.
- Desenvolvimento separado do piloto; preparar expansão sem contratar capacidade de longo prazo agora.

Essas escolhas não comprovam contratação, provisionamento ou integração. Não foram consultados painéis ou configurações externas, verificados preços/cotas atuais, criadas contas ou configurados serviços. O vínculo externo do GitHub também não foi comprovado por esta rodada. Não presumir backup de PDF incluído no plano escolhido.

### Retenção fotográfica registrada

A regra anterior de preservação de todas as evidências permanece no escopo original. D03 estabelece exceção posterior **somente para a cópia fotográfica avulsa da inspeção**: **data/hora de publicação concluída registrada pelo servidor + 30 dias corridos**. O prazo não começa no upload, na visita ou no mês seguinte. Sem publicação concluída não há início; fotos de rascunhos ficam fora da rotina.

Completar o prazo é apenas uma das condições. Também são obrigatórios: PDF definitivo salvo, íntegro e legível; foto incorporada ao documento e no item correto; backup desse PDF confirmado; ausência de bloqueio de preservação; ausência de outro vínculo que exija manter o objeto. Falha ou falta de comprovação preserva a foto e gera pendência; não apagar para liberar espaço a qualquer custo.

PDFs publicados permanecem no histórico **com todas as imagens incorporadas**, sem depender de links externos para as cópias avulsas. Preservar respostas, notas, observações, medições, versões e vínculos. Planos, apresentações e outras categorias não entram automaticamente na limpeza. O adendo não autoriza editar, reabrir, retificar, recalcular, substituir ou excluir publicados.

Planejar registro de execução/resultados separado do conteúdo imutável e consulta que informe que a imagem permanece no relatório, com acesso autorizado ao PDF e sem links quebrados. **Simulação sem excluir arquivos proposta antes de habilitar execução real.** Mecanismo, periodicidade, responsáveis e detalhes de preservação continuam pendentes; nenhuma rotina ou agendamento foi criado.

### Estado técnico e documentação alterada

Reexaminados instruções, dependências, escopo/adendos, planos, mapas e código relevante. Continuam usuários demonstrativos e controle local; visitas, auditorias e respostas digitadas ficam somente em memória e se perdem ao recarregar/fechar. Não foram identificados autenticação/banco/arquivos privados integrados, upload de fotos, PDF definitivo persistido, publicação real, backup/restauração ou rotina de limpeza. `AuditRecord` possui data de inspeção, sem marco de publicação concluída emitido pelo servidor. `window.print()` continua prévia; não comprova PDF salvo com respostas/imagens. Configuração das integrações locais: **pendente**; nenhum segredo foi exibido.

Documentos desta rodada: novo `ADENDO_INFRAESTRUTURA_RETENCAO.md`; atualizados `PLANO_BLOCO_B.md`, `PLANO.md`, esta retomada, `PENDENCIAS_ESCOPO_REVISADO.md`, `ESCOPO.md`, `MAPA_TELAS.md` e `MATRIZ_ACESSOS.md`; D02 recebeu somente aviso de precedência da decisão posterior de infraestrutura. Matrizes originais preservadas; complementos de retenção são planejamento futuro, não novas permissões humanas para apagar evidências.

### Pendências e primeira configuração recomendada

**P12 parcialmente resolvida por D03:** escolhas de infraestrutura inicial e retenção confirmadas. Continuam pendentes configuração dos ambientes, envio de e-mails/remetente autorizado, responsáveis técnicos e do piloto, destino/rotina/responsável do backup e restauração, limites/capacidade e validação de custos/condições efetivos, além dos detalhes das exceções de preservação. **P11 continua parcialmente resolvida por D02**; responsáveis, primeiro AD controlado, campos finais/múltiplas funções e detalhes técnicos de conta ainda pendentes. P01–P10 não foram resolvidas por esta rodada. A-V01 continua pendente: Agenda não autorizada deve mostrar “— / Consulta não autorizada”, em vez de `00 visitas`.

Primeiro preparar **o Supabase de desenvolvimento separado do piloto**. O responsável precisa providenciar:

1. Identificação de quem administra a conta/organização Supabase e configura o projeto; informar se a estrutura já existe e se o acesso administrativo está disponível, sem credenciais no chat.
2. Identificação/nome e região do projeto de desenvolvimento, com separação do piloto aprovada; conferir disponibilidade e condições do Free antes da criação.
3. Responsável por inserir configuração segura e definição das origens/endereços de retorno autorizados; não colocar segredos no código/GitHub ou documentos.
4. Autorização específica para criar/configurar o ambiente de desenvolvimento e o recorte B.1, sem contratar Render, publicar ou avançar para o piloto.

Para completar B.1: serviço de envio e remetente legítimo autorizado, caixas corporativas reais de teste com autorização para envios, parâmetros de conta/links/reenvios D02 e procedimento do primeiro Administrativo. `dialogo.com.br` permitido no cadastro não autoriza envio em nome do domínio. Não inventar remetente nem solicitar senhas/tokens/chaves no chat; método, domínio e Supabase Free já estão definidos.

Definir backup/recuperação antes de guardar dados que precisem de preservação e do piloto; comprovar cópia/restauração de PDFs e resolver bloqueios/exceções antes de limpeza. Não é preciso implementar relatório/limpeza para configurar um ambiente vazio de desenvolvimento. Sequência proposta: B.5 prepara anexos/vínculos/categorias; D publica com data do servidor e imagens incorporadas; F valida backup e simulação; remoção real somente após todas as proteções e autorização específica. Nenhuma dessas etapas foi implementada.

### Verificações e limites da rodada D03

Realizadas leituras e conferência documental de escopo, referências e coerência com o código. **Nenhum teste da aplicação, autenticação, salvamento, acesso direto, backup, restauração, simulação de limpeza ou exclusão foi executado nesta rodada.** D03-T01–T13 são testes futuros; D02-T01–T17 e aceites operacionais continuam pendentes. Testes anteriores do A e relatos manuais abaixo permanecem históricos, com seu alcance limitado.

**Conferência documental realizada:** nove arquivos Markdown novos/alterados, 67 links locais válidos, UTF-8 válido sem BOM/caractere de substituição/marcador de conflito. B.0–B.6 mantêm os cinco campos de planejamento; D02 conserva 17 casos futuros e D03 registra 13. Comparação antes/depois: somente documentação alterada, nenhuma remoção e escopo original/código preservados. Conferência literal preservou o corpo histórico de D02, as duas matrizes e P01–P10. Esses resultados não aprovam autenticação, persistência ou segurança operacional.

Não houve dependência instalada, serviço contratado/configurado, migração, mensagem, agendamento, exclusão, publicação, mudança de funcionamento, interrupção/reinício do servidor ou alteração em `nexobra-main`. Comandos existentes para abrir a aplicação permanecem no histórico abaixo; nenhum foi executado nesta rodada. Trabalho encerrado após o registro documental.

## Histórico — 12/09/2026 — D02, cadastro e autenticação consolidados

O registro a seguir mantém a decisão e as verificações daquela execução. As menções a P12 pendente e Supabase ainda como possibilidade descrevem o estado **anterior a D03**; infraestrutura e retenção vigentes estão acima. O fluxo D02 permanece válido.

**Somente documentação nesta execução; nenhuma autenticação, tela ou função alterada.** A definição consolidada mais recente do responsável foi registrada em [ADENDO_CADASTRO_AUTENTICACAO.md](ADENDO_CADASTRO_AUTENTICACAO.md), como decisão posterior ao escopo revisado original, que permanece intacto. A preparação inicial do B e os testes do A foram mantidos abaixo como histórico.

### Fluxo confirmado, ainda não implementado

1. **Solicitar acesso:** nome, e-mail corporativo válido do domínio exato `dialogo.com.br`, senha própria da plataforma e confirmação da senha. Cargo/área e obra de referência são campos propostos, com obrigatoriedade a validar. Sem escolha de permissões e sem exposição da lista corporativa de obras; obra declarada não concede vínculo.
2. **Confirmar e-mail:** envio e confirmação pelo serviço responsável. Não confiar em campo de confirmação enviado pelo navegador.
3. **Aguardar AD:** somente após confirmação, solicitação entra na fila administrativa. Pessoa autenticada acompanha só sua própria solicitação, sem dados operacionais, com a mensagem **“E-mail confirmado. Aguardando liberação do Administrativo.”**
4. **Aprovar/recusar:** AD autorizado confere, decide e define acessos; registrar quem/quando. Aprovar não recria, revela ou solicita a senha do usuário.
5. **Entrar após liberação:** e-mail corporativo e a mesma senha criada no cadastro. A senha é independente da Microsoft; “Entrar com Microsoft” não é necessário.

Validar formato/domínio no servidor, orientar no formulário e comparar o domínio sem diferenciar caixa. Não aceitar subdomínios, texto apenas contido no endereço ou outros domínios; não remover pontos/sufixos da parte anterior ao `@` para inventar equivalências. Política consistente de comparação da parte local ainda deve ser detalhada com o serviço. Domínio válido sozinho não autoriza operações.

Identidade autenticada, e-mail confirmado, aprovação administrativa, conta ativa e permissões vigentes são controles separados, verificados no servidor e nos dados, inclusive acesso direto a URL/API/arquivos. “Aguardando aprovação” não é quinto perfil. Concessões por combinação de obra/módulo/atuação e responsabilidade; sem cruzamento de listas independentes.

T01 detalhada com Entrar, Solicitar acesso, Confirmar/reenvio, Acompanhar solicitação própria, Esqueci minha senha, Definir nova senha, Minha conta e Sair. T19: Administração → Usuários e acessos → Solicitações pendentes, com nome/e-mail confirmado/informações declaradas/datas; aprovar/definir acessos, recusar, consultar decisão, revisar permissões e revogar preservando autoria/histórico. Essas telas continuam planejadas.

AD nunca vê a senha. O serviço autorizado deve proteger as credenciais; cadastros da aplicação, JSON, localStorage, logs, mensagens e documentação não guardam senhas. Confirmação/recuperação usam links temporários/de uso único, protegidos contra abuso; logs sem tokens ou links completos. Páginas públicas não revelam se um funcionário possui conta. Solicitações repetidas não sobrescrevem senha, conta, decisão ou permissões existentes.

Recuperar senha não aprova, reativa ou promove. Revogação deve alcançar sessões abertas; não presumir efeito automático do bloqueio Microsoft. Primeiro AD por procedimento controlado, nunca pelo primeiro cadastro. Política de alteração de e-mail ainda a validar, sem contornar domínio, confirmação ou controles administrativos.

### Estado técnico conferido

Reexaminados AGENTS.md, CLAUDE.md, package.json, planejamento, retomada, T01/T19/P11/P12 da fonte e código atual. Continuam `DemoUser`/seis identidades fictícias, controles no cliente e `useState` de visitas/rascunhos. Não foram identificados autenticação real, integração Microsoft, banco, envio de e-mails, remetente configurado, fila persistente ou armazenamento privado. Nenhuma integração foi removida. Configuração das integrações: **pendente**; arquivos de ambiente na raiz não identificados. Serviços externos da empresa não foram consultados. Nenhum valor de variável, senha, token ou chave foi impresso.

Os dados digitados continuam somente em memória e se perdem ao recarregar/fechar; catálogos/exemplos ficam no código, sem guardar a sessão. A impressão continua prévia de identificação, não exportação das respostas ou publicação. Nada disso foi alterado por uma decisão documental.

### Pendências e primeira configuração de B.1

**P11 parcialmente resolvida:** método, domínio e fluxo definidos em D02. Persistem responsáveis técnicos, designação/procedimento do primeiro AD, campos finais/auxiliares, múltiplas funções e detalhes de conta (comparação de e-mails, política de senha/links/reenvios, recuperação/revogação, mudança de e-mail, reapresentação após recusa e dados próprios editáveis). **P12 continua pendente.** Nenhum peso, cálculo, aprovação de auditoria ou critério de publicação foi definido por analogia.

Primeira configuração futura: ambiente de teste isolado com autenticação e-mail/senha, confirmação/recuperação, banco protegido das solicitações e serviço/remetente autorizado de e-mails. Antes de executar, escolher/autorizar provedores, ambiente/custos e responsáveis; identificar remetente legítimo e caixas corporativas reais de teste autorizadas; definir primeiro AD por procedimento controlado. Supabase permanece possibilidade, não contratação. O domínio dos usuários não autoriza enviar em nome de `dialogo.com.br`; não inventar endereço remetente. Não solicitar segredos no chat nem perguntar novamente método/domínio.

B.1 prepara cadastro/confirmar/recuperar e sessão restrita própria; B.2 entrega a fila AD e a liberação/concessões, necessárias para completar o fluxo. O detalhamento está em [PLANO_BLOCO_B.md](PLANO_BLOCO_B.md). Não iniciar essas etapas sem autorização.

### Documentos e verificações desta rodada

- Criado `docs/ADENDO_CADASTRO_AUTENTICACAO.md` (D02).
- Atualizados `docs/PLANO_BLOCO_B.md`, `docs/RETOMADA.md` e `docs/PLANO.md`.
- Atualizados `docs/MAPA_TELAS.md`, `docs/MATRIZ_ACESSOS.md`, `docs/PENDENCIAS_ESCOPO_REVISADO.md` e `docs/ESCOPO.md` com referências ao adendo e detalhamento funcional/estado de P11.

Planejados D02-T01–T17: domínio, não confirmado/pendente, aprovação AD, mesma senha, autoaprovação/elevação, isolamento, recuperação sem liberação, revogação com sessão aberta, repetição/concorrência, links/reenvios e privacidade. **Não executados e não aprovados agora.** Somente leitura, inspeção local e revisão documental nesta rodada; testes de código/navegador e envios não foram executados. Dados sintéticos de testes de formato não podem receber mensagens; testes futuros de entrega exigem caixas reais autorizadas.

D01, catálogos, pesos pendentes, navegação e testes históricos do A preservados. Aprovação de conta não cria aprovação administrativa para publicar auditorias. Relatórios publicados continuam somente consulta; P08/comitê não ganha responsável por D02. A-V01 (“— / Consulta não autorizada” no indicador de Agenda sem concessão) permanece pendente, sem alteração visual.

Nenhuma dependência, conta/serviço, configuração, migração, limpeza, envio de e-mail ou publicação; servidor e `nexobra-main` preservados. **Consolidação documental encerrada; aguardar autorização.**

---

## Histórico — 12/09/2026 — Conferência do A e preparação inicial do B, anterior a D02

**Somente documentação nesta rodada. Nenhuma implementação do Bloco B foi iniciada e nenhuma função do aplicativo foi alterada.** Plano detalhado, pré-requisitos, componentes, testes e condições de avanço em [PLANO_BLOCO_B.md](PLANO_BLOCO_B.md). O registro de implementação/testes do Bloco A está preservado na seção seguinte; seus resultados não foram reexecutados agora.

### Conferências relatadas pelo responsável

- Administrativo agenda e a visita aparece para o auditor designado.
- Preenchimento e retomada do rascunho na mesma sessão, com respostas e observações independentes por item.
- Engenharia / Equipe da obra sem ações de criação/edição do rascunho do auditor na interface mostrada.
- Auditor de Qualidade com F.175/F.176 e sem Comitê de Segurança no menu mostrado.
- Coordenação em Jardim Norte sem Agenda, conforme a concessão específica do cenário de teste.

Esses resultados são **relatos de conferência visual/manual do usuário**, não testes novos executados pelo agente. Não comprovam autenticação, persistência ou bloqueio de acesso direto. Não representam aprovação integral dos testes de segurança ou do piloto. Os aceites operacionais de acesso direto, recuperação, arquivos, imutabilidade, concorrência e backup continuam pendentes.

### Diagnóstico verificado no código

`prototype-access.ts` contém seis identidades fictícias em `demoUsers`, quatro perfis e duas atuações de Engenharia. `DemoUser` usa um perfil e listas de módulos/obras/concessões. O simulador escolhe a identidade pelo estado do cliente; as políticas verificam disciplina, obra, autoria e situação somente no protótipo. Não há sessão autenticada ou validação de acesso em servidor/banco/arquivo.

As listas independentes de obras e módulos deverão ser refinadas em concessões por combinação de obra/disciplina/atuação, para evitar ampliar acesso ao persistir o modelo. Múltiplas funções e refinamentos de consulta continuam P11/P09; os vínculos fictícios não são concessões reais aprovadas.

Agenda, histórico de reagendamento, auditorias e respostas continuam em `useState` de `prototype-app.tsx`. Respostas usam auditoria/modelo/item; visitas separam `createdBy` administrativo de `auditorId` técnico. Catálogos e exemplos iniciais são constantes em arquivos. As funções atuais de início aceitam apenas obras de demonstração; não basta mudar `isDemo` para torná-las operacionais. Os callbacks da agenda são síncronos e confirmam somente registro nesta sessão.

Não há upload ou armazenamento de anexos, nem estrutura persistente de medições. A prévia de impressão mostra identificação, sem respostas/anexos e sem salvamento. Recarregar/fechar perde alterações; não há recuperação/exportação implementada.

**Configuração:** autenticação, banco, armazenamento privado e gravação/autorização de servidor não foram identificados. Arquivos `.env*` na raiz não foram encontrados e `src` não contém integração dessas configurações. Situação: **pendente**. Nenhum valor de variável, senha, token ou chave foi impresso. Serviços eventualmente existentes fora do projeto não foram verificados. Supabase continua proposta anterior, não fornecedor escolhido ou autorizado.

Podem ser reaproveitados layout/CSS, catálogos, navegação e formulário por item, regras puras e testes de domínio, distinção visita/inspeção, modelos de registro e telas de agenda/cadastros. A camada persistente precisará fornecer confirmação real de salvamento, proteção de requisições e concorrência; filtrar menus não basta.

### Plano e decisões pendentes

O B foi dividido em **B.0 decisões; B.1 contas/sessão; B.2 obras/usuários/concessões; B.3 agenda persistente; B.4 rascunhos/respostas; B.5 anexos privados; B.6 conferência integrada**. Todas as entregas de implementação estão propostas e aguardam autorização. Controles de falha/concorrência devem acompanhar cada gravação, sem serem adiados para o encerramento.

Próxima ação recomendada: concluir B.0 e autorizar somente B.1. O responsável precisa indicar provedor/ambiente existente ou desejado, método de entrada/recuperação, responsável técnico, Administrativo inicial e outra conta individual de teste, forma segura de configuração e limites de custo. Não enviar credenciais no chat. Campos de obras/concessões detalhadas serão necessários em B.2; limites e política de arquivos em B.5. A lista exata está na seção 7 do novo plano.

**D01 preservada:** AD agenda/reagenda; auditor realiza a própria auditoria. Não atribuir agenda/ata do comitê por analogia: P08 permanece pendente. P01–P12 não foram resolvidas. Não há cálculo oficial, publicação, aprovação nova, importação dos dados fictícios ou implantação autorizados.

### Ajuste visual pendente do A — A-V01

Quando a consulta à Agenda não está autorizada, o painel usa o tamanho da lista filtrada vazia e mostra `00`, embora a quantidade seja desconhecida para aquele usuário. Origem verificada: `PrototypeDashboard`/`Metric` em `src/app/components/prototype-workspace.tsx`, com lista filtrada em `prototype-app.tsx`.

**Proposta: mostrar “—” e “Consulta não autorizada”**, mantendo o acesso indisponível. Zero deve ficar reservado ao contexto autorizado cuja consulta retornou zero visitas. Registrar teste futuro para Coordenação/Jardim Norte e para contextos autorizados vazios/com visitas. **Não corrigido nesta rodada**, pois apenas a documentação foi autorizada.

### Arquivos e verificações desta preparação

- Criado `docs/PLANO_BLOCO_B.md`.
- Atualizado `docs/RETOMADA.md` com diagnóstico, relato e pendências.
- Atualizado `docs/PLANO.md` apenas para registrar a conferência relatada e apontar o plano detalhado; B segue sem implementação.

Foram feitas leituras, inspeção de código/configuração e revisão documental. Lint, TypeScript, build, testes de domínio e navegador **não foram repetidos** nesta rodada. Testes de autenticação, acesso direto, salvamento, anexos e restauração **não foram executados**; permanecem pendentes. Uma primeira tentativa de inspeção somente leitura falhou por aspas do PowerShell e foi repetida corretamente; não foi falha da aplicação.

Conferência documental final passou: links locais, presença dos cinco campos em B.0–B.6 e ausência de conflitos/BOM. A comparação de arquivos identificou somente os três documentos listados acima, sem remoções. Não equivale a teste de segurança ou persistência.

O servidor e os dados foram preservados. Não houve instalação, criação de contas/serviços, migração, limpeza, publicação ou alteração em `nexobra-main`. Os comandos da seção 6 histórica continuam válidos; servidor ativo: apenas acessar `http://localhost:3000`, sem iniciar outro. **Preparação encerrada; aguardar autorização.**

---

## Registro anterior — 12/09/2026 — Implementação do Bloco A

Esta seção substitui as descrições de estado anteriores, mantidas abaixo como histórico. O arquivo [PROMPT_DIALOGO_AUDITORIAS_ESCOPO_REVISADO.md](../PROMPT_DIALOGO_AUDITORIAS_ESCOPO_REVISADO.md) foi lido integralmente por intervalos, incluindo a Parte II até **FIM DO ESCOPO REVISADO**. AGENTS.md, CLAUDE.md, package.json, documentação e código existentes foram examinados antes das alterações. Os guias pertinentes do Next.js instalado também foram consultados.

**Bloco A implementado e verificado no protótipo. Blocos B–F não iniciados.** Não há aprovação de uso operacional ou produção. O diagnóstico e o plano curto foram apresentados antes da implementação e registrados em [DIAGNOSTICO_ESCOPO_REVISADO.md](DIAGNOSTICO_ESCOPO_REVISADO.md). O [PLANO.md](PLANO.md) agora segue a sequência A–F do escopo revisado.

### Alterações realizadas

- Quatro perfis principais: Auditor de Qualidade, Auditor de Segurança, Engenharia e Administrativo. Engenharia tem duas atuações internas: Equipe da obra e Coordenação. O seletor mostra **Simulação de perfil — não é autenticação**. Pessoas e vínculos são cenários fixos de teste.
- Separação de Qualidade e Segurança, contexto por obra e ambiente administrativo. Uma política central controla menus, consultas e funções de alteração conforme perfil, disciplina, vínculo, responsável e situação da auditoria. Isso é controle demonstrativo no cliente; não é segurança de produção.
- **D01:** Administrativo agenda e reagenda visitas; auditores consultam suas visitas e realizam suas auditorias autorizadas. A agenda registra obra, disciplina, modelo pretendido, auditor designado, data e observação. Autor administrativo do agendamento e auditor responsável são campos distintos. Reagendamentos mantêm o histórico de datas e autoria.
- A consulta da Equipe da obra respeita seu vínculo. Coordenação exige concessão explícita para agenda (C†): no cenário atual, Residencial Horizonte está concedido e Jardim Norte não. A consulta administrativa aos documentos também é condicional; nenhum acesso documental foi concedido ao Administrativo de teste.
- **A agenda/ata do comitê permanece P08**, sem responsável presumido a partir de D01. Comitê existe apenas no módulo Segurança, com ações futuras indisponíveis.
- Início e retomada de auditorias independentes por ID, obra, responsável, modelo/versão e item. Nova auditoria começa vazia. Retomar a mesma visita já iniciada abre o mesmo registro. Trocar perfil, módulo, obra ou tela preserva os registros da sessão. Reagendar uma visita não altera a data da inspeção já iniciada nem suas respostas.
- Mantidos identidade visual, navegação horizontal, filtros, catálogos, orientações, busca, seleção direta de quesitos, anterior/próximo, resposta zero e observações. Segurança mantém 205 itens, 27 grupos e 37 subgrupos; Qualidade mantém F.175 com 10 e F.176 com 23 itens. Não foram inventados pesos, notas, fórmulas ou regras de aprovação.
- Modelo/obra/responsável ficam vinculados à auditoria iniciada. Rascunhos de outro auditor ou disciplina não aparecem para edição. A política rejeita alteração de registro `Publicada`; não existe ação operacional de publicação neste bloco.
- Entradas de fechamento, publicação, planos, comitê e manutenção futura exibem indisponibilidade e pendências. A interface de apontamentos não oferece reinspeção, baixa ou encerramento geral de correções. Os dados antigos de exemplo foram preservados.
- Ranking mantém a seleção da última auditoria de Segurança e exige situação explícita `Publicada`, coleta concluída e cálculo disponível para classificar a nota. As auditorias demonstrativas existentes continuam sem nota e não foram convertidas em publicadas. Digitar respostas não produz pontuação oficial.
- A prévia imprimível agora mostra identificação da auditoria no contexto: obra, modelo, data e auditor. Continua sem respostas, observações ou anexos e não equivale a relatório publicado.

### Arquivos criados ou modificados neste bloco

| Arquivos | Alteração |
| --- | --- |
| `src/domain/prototype-access.ts` — novo | Política demonstrativa, perfis, vínculos, visitas e reagendamento |
| `src/domain/prototype-audits.ts` — novo | Criação/retomada, isolamento de respostas e proteção das alterações |
| `src/domain/operational-records.ts` | Identidade do auditor e situação explícita nos registros; visita opcional |
| `src/domain/work-ranking.ts` | Exigência de publicação explícita para classificação |
| `src/app/page.tsx` | Entrada delegada ao componente da aplicação |
| `src/app/components/prototype-app.tsx` e `prototype-app.module.css` — novos | Composição, estado de sessão, menus e contexto autorizado |
| `src/app/components/prototype-workspace.tsx` e `prototype-workspace.module.css` — novos | Simulador, painéis, listas, início, prévia e entradas futuras |
| `src/app/components/visit-agenda.tsx` e `visit-agenda.module.css` — novos | Agenda de visitas e histórico, com acessos conforme D01 |
| `src/app/components/audit-workspace.tsx` | Contexto vinculado ao registro, modo de consulta e catálogos por disciplina |
| `src/app/components/operational-views.tsx` | Consulta por obra e retirada do fluxo de baixa de correções da interface |
| `src/app/components/work-ranking.tsx` | Textos coerentes com notas publicadas |
| `scripts/test-prototype-access.mjs` e `scripts/test-prototype-audits.mjs` — novos | Testes da política, agenda e isolamento dos rascunhos |
| `scripts/test-work-ranking.mjs` | Cobertura do requisito de publicação |
| `package.json` e `tsconfig.json` | Comandos dos testes e imports TypeScript explícitos, mantendo `noEmit` |
| `docs/DIAGNOSTICO_ESCOPO_REVISADO.md`, `docs/MATRIZ_ACESSOS.md`, `docs/MAPA_TELAS.md`, `docs/PENDENCIAS_ESCOPO_REVISADO.md` — novos | Diagnóstico, duas matrizes, 23 telas, 16 aceites e 12 pendências |
| `docs/PERMISSOES.md`, `docs/ESCOPO.md`, `docs/PLANO.md`, `docs/RETOMADA.md` e `README.md` | Documentação vigente e histórico anterior identificado como superado |

As fontes de catálogos, `audit-draft.ts`, versões das dependências e lockfile foram preservados. `nexobra-main` não foi alterado. Evidências temporárias foram criadas em `.tmp/visual-qa/`, já ignorada por Git/ESLint; não são dados de auditoria nem backup.

### Armazenamento verificado nesta versão

**Continua somente em memória React.** `PrototypeApp` mantém `session` (auditorias e respostas), `visits` (incluindo histórico), contexto e posições dos quesitos em `useState`. As respostas são endereçadas por auditoria/modelo/item. Não foi encontrada implementação de autenticação real, banco, API de gravação, `localStorage`, `sessionStorage`, IndexedDB, upload, importação ou exportação recuperável.

| Informação | Comportamento atual |
| --- | --- |
| Auditorias iniciadas, data editada, respostas e observações | Permanecem ao navegar e trocar perfis na mesma página; perdem-se ao recarregar ou fechar |
| Visitas criadas, reagendamentos e histórico administrativo | Mesma limitação: somente a sessão aberta |
| Pessoas, vínculos, obras, duas auditorias iniciais, visitas iniciais e catálogos | Constantes nos arquivos, recarregadas ao abrir; não contêm o preenchimento digitado |
| Impressão da prévia | `window.print()`; apenas identificação/apresentação, sem respostas ou anexos. Não salva a auditoria |

Não existe salvamento permanente, backup/restauração, exportação JSON/CSV ou geração/armazenamento de PDF. Uma opção de salvar PDF oferecida pelo navegador não é persistência implementada pela aplicação. Manter o servidor ligado ou o projeto no OneDrive não salva os dados da sessão. A aba pessoal do usuário não foi fechada, recarregada ou inspecionada para testar perda de dados; a conclusão resulta do código. Nenhum dado foi limpo.

### Testes realmente executados

| Comando/verificação | Resultado final e alcance |
| --- | --- |
| `npm.cmd run test:access` | **16/16 passaram**: perfis, módulos, vínculos, responsabilidade, situações, C† e operações de agenda D01 |
| `npm.cmd run test:audit-context` | **15/15 passaram**: rascunhos independentes, retomada, datas, respostas por modelo/item, autoria e bloqueio de alteração publicada |
| `npm.cmd run test:ranking` | **14/14 passaram**: seleção/ordenação e exclusão de notas em situações anteriores à publicação |
| `npm.cmd run test:navigation` | Passou: navegação, limites, zero, respostas/observações e catálogos |
| `npm.cmd run verify:security` | Passou: 205 itens, 27 grupos, 37 subgrupos, textos, ordem e orientações comparados à fonte, incluindo continuações das páginas 18–19 |
| `npm.cmd run lint` | Passou, sem erros |
| `npx.cmd tsc --noEmit` | Passou; o build final também verificou TypeScript |
| `npm.cmd run build` | Passou: compilação e geração estática; sem publicação |
| `node .tmp/visual-qa/check-block-a.cjs` | Passou em Edge sem janela, usando Playwright Core já disponível e o servidor local existente; zero erros de página |
| Conferência documental | Duas matrizes comparadas à fonte, 23 telas, 16 critérios de aceite e 12 pendências preservados |

O teste de interface cobriu os quatro perfis e duas atuações de Engenharia; criação e reagendamento administrativo; consulta pelo auditor sem edição da agenda; início/retomada pela visita; preservação da inspeção após novo reagendamento; obra vinculada para Equipe da obra; C† concedido/negado para Coordenação; isolamento por auditor, obra, auditoria e F.175/F.176; respostas 0/5/10/N/A; observações; ausência de avanço automático; busca, primeiro/último item e orientações longas. Conferiu também catálogo de Qualidade, ausência de comitê em Qualidade e mídia de impressão da prévia.

Foram verificadas larguras de 1440 e 390 px, agenda/catálogo nos quatro perfis e orientação longa no celular, sem transbordamento horizontal da página. Capturas efetivamente inspecionadas: `.tmp/visual-qa/block-a-inspect.png`, `block-a-admin-agenda.png`, `block-a-mobile-agenda.png` e `block-a-mobile-audit.png`. Não houve teste em aparelho físico, impressão física ou salvamento de PDF.

Falhas intermediárias resolvidas: um teste de data inválida na edição da inspeção reprovou e a validação foi corrigida; seletores do teste de interface foram ajustados e o campo de auditor da agenda recebeu nome acessível explícito. A revisão também corrigiu o card de agenda para ficar desabilitado quando C† não está concedido. As execuções finais passaram. Permanece o aviso não fatal Node `MODULE_TYPELESS_PACKAGE_JSON` nos testes de domínio.

Publicação e imutabilidade operacional, autenticação, isolamento em servidor/banco/arquivos, anexos, recuperação, backup e cálculo oficial **não foram testados como recursos operacionais**, pois não existem neste bloco. Fixtures publicadas nos testes não foram adicionadas à aplicação. O [MAPA_TELAS.md](MAPA_TELAS.md) distingue verificação demonstrativa de aceite para piloto.

### Como conferir os perfis e a agenda na tela

1. Acessar **http://localhost:3000** usando o servidor existente. Localizar **Simulação de perfil — não é autenticação** e **Perfil de demonstração**.
2. Selecionar **Administrativo → Agenda**. Conferir obra, disciplina, modelo, auditor, data e observação; criar uma visita com dados de teste. Usar **Reagendar visita**, alterar data/observação e consultar o histórico. Se criar em contexto diferente, selecionar a obra/disciplina correspondente para vê-la na lista.
3. Selecionar o **Auditor de Segurança** ou **Auditor de Qualidade** designado, com a mesma obra e módulo. A agenda permite consultar e **Iniciar auditoria**, sem agendar/reagendar. Segurança oferece duas pessoas de teste para conferir a separação de responsabilidade.
4. Responder alguns quesitos e navegar. Voltar por **Auditorias → Histórico e rascunhos → Retomar rascunho**. Uma **Nova auditoria** tem respostas vazias; retomar a anterior mantém suas respostas. Reagendar a visita pelo Administrativo depois do início preserva data e respostas da inspeção existente.
5. Selecionar **Engenharia → Equipe da obra**: somente Residencial Horizonte no contexto e consulta de agenda, sem iniciar/preencher auditoria. **Engenharia → Coordenação**: agenda disponível em Horizonte; em Jardim Norte, consulta não concedida (C†). Não há rascunhos alheios expostos nesses cenários.
6. Conferir entradas futuras com botões indisponíveis: publicação exige resolver P01/P02/P05/P06; agenda/ata do comitê permanece P08. Qualidade não oferece comitê. Administração não preenche auditorias.

### Pendências e próximo passo

P01–P12 continuam registradas, com regras confirmadas, propostas e divergências separadas. D01 prevalece sobre os trechos residuais das seções 02/03 que ainda atribuem o agendamento ao auditor; a fonte original não foi reescrita. Pesos individuais de Segurança, metodologia de Qualidade, notas oficiais, publicação definitiva, planos, pareceres e comitê não foram inventados. A ocultação do painel técnico de pesos para Engenharia é proposta sujeita a P09; cenários de vínculos não encerram P11.

Persistência, contas, cadastro real de obras, evidências, validação operacional de finalização e documentos originais preservados continuam ausentes. A prévia não preserva o preenchimento; o ranking segue sem notas publicadas. A exibição de campos obrigatórios no rascunho não equivale à validação de publicação. O simulador pode alternar identidades e não protege dados reais. Nenhum serviço externo foi configurado.

**Próximo passo recomendado:** conferir este Bloco A na tela e, em uma nova solicitação, autorizar o Bloco B com definição de autenticação, persistência e vínculos. Não iniciar B nem resolver pendências por suposição. Os comandos de abertura da seção 6 abaixo continuam válidos: com o servidor ativo, basta abrir o endereço; se ele tiver sido encerrado, usar `npm.cmd run dev` na pasta do projeto. Nenhum servidor foi iniciado/reiniciado nesta execução. Trabalho encerrado no Bloco A, sem publicação.

---

## Histórico de 12/09/2026 — Ranking pelas últimas auditorias, anterior ao Bloco A

O usuário esclareceu que o quadro deve mostrar **as obras cadastradas e as notas de suas últimas auditorias**, usando a imagem somente como referência visual. Esta atualização substitui a implementação histórica descrita na seção seguinte.

- Removidos os nomes, notas, mês fixo e textos da imagem. `src/domain/work-ranking-reference.ts` foi removido.
- `src/domain/operational-records.ts` centraliza os registros de obras e auditorias que já apareciam no protótipo, com IDs, vínculo por obra, roteiro/versão, data, situação da coleta/cálculo, nota final nullable e indicação de demonstração. Obras, Histórico, auditorias recentes, contagens de obras/auditorias e ranking recebem essa fonte compartilhada. Não há fonte externa ou banco conectado.
- `src/domain/work-ranking.ts` seleciona a última auditoria de cada obra e roteiro pela data de calendário. Para auditorias na mesma data, usa o maior ID lexical como desempate determinístico; isso não representa horário real de conclusão. Apenas coleta concluída, cálculo disponível e nota final numérica finita de 0 a 10 permitem classificação.
- Ordenação pela nota final decrescente; zero é nota válida; notas iguais compartilham posição (`1, 1, 3`). Obras sem auditoria ou sem nota final ficam ao fim, por nome, sem posição. A última auditoria pendente não é substituída silenciosamente por outra mais antiga com nota. O vínculo não cruza registros demonstrativos com reais.
- O quadro permanece específico de **Segurança — IT.07 rev. 02**. Não mistura Segurança, F.175 e F.176. Exibe posição, obra, data da última auditoria e nota final. Penalidades e resultados anuais foram retirados porque não há fonte operacional ou cálculo validado para eles.
- Mantidos expansão acima de cinco obras, navegação para Obras e rolagem horizontal dentro da caixa em telas estreitas. O componente deriva o ranking das propriedades recebidas, sem cópia interna desatualizada dos registros.

**Resultado atual verificado:** duas obras demonstrativas, zero classificadas. Residencial Horizonte tem a auditoria de Segurança de 10/09/2026 com nota pendente; Jardim Norte está sem auditoria. Os dois registros de auditoria continuam com `finalScore: null`. Não foram criadas pontuações de exemplo para preencher o quadro.

**Limitação operacional:** a fonte compartilhada ainda contém constantes de demonstração. O cadastro de novas obras continua desabilitado, e o formulário mantém rascunhos por modelo/quesito em memória; não cria um registro de auditoria por obra, não conclui auditorias nem calcula nota final. Portanto, foi implementada a seleção/ordenação dos registros disponíveis, mas ainda não existe um fluxo completo de ranking com dados reais de produção. Digitar respostas no formulário não gera pontuação nesse quadro.

**Testes desta correção:** `npm.cmd run lint`, `npm.cmd run build` (incluindo TypeScript), `npm.cmd run test:navigation` e `npm.cmd run test:ranking` passaram. Os 13 testes de ranking cobrem seleção pela data em vez da maior nota, desempate de data, última pendente, roteiros separados, obras sem nota, auditorias órfãs, zero, empates, coleta inconclusa, notas inválidas, vínculo demo/real, preservação dos dados de entrada e atualização dos registros recebidos. São dados isolados de teste, sem notas fictícias adicionadas à aplicação. Permanece o aviso Node `MODULE_TYPELESS_PACKAGE_JSON`, sem reprovação.

`node .tmp/visual-qa/check-current-ranking.cjs` passou em Edge sem janela no servidor local existente: mesma lista em Obras/ranking, dados da imagem ausentes, pendências sem classificação, data do Histórico, auditorias recentes e rolagem em larguras de 390 e 820 px. `node .tmp/visual-qa/check.cjs` também passou, incluindo rascunhos, filtros, impressão por emulação de mídia e seis telas móveis. Capturas inspecionadas: `.tmp/visual-qa/ranking-current-desktop.png` e `ranking-current-390-scores.png`. Não houve teste em aparelho físico ou com auditorias reais salvas. O teste anterior `check-ranking.cjs` corresponde ao quadro histórico substituído e não é validação da versão atual.

**Próximo passo recomendado:** implementar o cadastro e a persistência recuperável de obras/auditorias com identificação por obra, roteiro e data, e definir o fluxo de disponibilização das notas finais conforme a metodologia aprovada. Pesos individuais de Segurança e demais regras continuam pendentes em `docs/PENDENCIAS_METODOLOGIA.md`. Não inferir nota dos rascunhos para preencher o ranking.

O risco de perda dos preenchimentos e os comandos de abertura da seção 6 continuam válidos. Não houve reinício de servidor, limpeza de dados, publicação ou instalação de dependências nesta correção.

## Histórico de 12/09/2026 — Primeira versão do ranking, substituída

Por solicitação do usuário, a caixa “Obras em acompanhamento” foi substituída por **Ranking das obras**, usando a imagem de agosto de 2026 como referência. Exibe inicialmente as cinco primeiras colocadas; “Ver ranking completo” mostra as 20 obras, incluindo cinco não avaliadas, e permite recolher a lista.

- Colunas: posição mensal, obra, nota, penalidade, nota final, média anual e classificação anual. Cores seguem a referência: primeira obra em azul, segunda em vermelho, notas finais em vermelho e dados anuais em azul.
- Os valores foram transcritos da imagem e identificados como **referência histórica**. Não são calculados a partir das auditorias da aplicação. Ausência de informação permanece `null` e aparece como “—”; obras não avaliadas não recebem nota zero.
- Dados em `src/domain/work-ranking-reference.ts`; componente em `src/app/components/work-ranking.tsx`; estilos em `src/app/components/work-ranking.module.css`. `src/app/page.tsx` incorpora a nova caixa, e `src/app/globals.css` mantém os painéis vizinhos alinhados ao topo ao expandir o ranking.
- No celular, a tabela permite rolagem horizontal dentro da caixa. A página não transborda horizontalmente no tamanho verificado de 390 × 844.
- A revisão independente conferiu as 20 obras e os valores da referência. Não foram implementados cálculo oficial, atualização automática, edição de ranking, premiações ou regras de penalidade.

Validações executadas nesta alteração: `npm.cmd run lint` e `npm.cmd run build` passaram, incluindo TypeScript e geração estática. `node .tmp/visual-qa/check-ranking.cjs` passou em Edge sem janela: cinco/20 linhas, cinco não avaliadas, valores históricos selecionados, expansão/recolhimento, painel vizinho estável, rolagem no celular e ausência de erros de página. `node .tmp/visual-qa/check.cjs` também passou, cobrindo navegação, rascunhos por item/modelo, data/auditor, catálogo, filtros, mídia de impressão e seis telas móveis.

Foram inspecionadas capturas do ranking em desktop, expandido e no celular. Evidências temporárias em `.tmp/visual-qa/ranking-*.png` e no script `check-ranking.cjs`. Uma asserção intermediária foi ajustada para ler o texto sem a transformação visual para maiúsculas do CSS; a execução seguinte passou. Não houve teste em aparelho físico.

**Próximo passo:** validar o visual do ranking com o usuário. Para torná-lo operacional futuramente, será necessário definir a fonte das notas, o período e as regras aprovadas, além da persistência das auditorias. O armazenamento descrito abaixo permanece somente em memória; esta alteração não acrescentou salvamento dos preenchimentos. O ranking histórico, por sua vez, está nos arquivos do projeto e reaparece ao abrir a aplicação.

Foi utilizado o servidor local já existente, sem reiniciá-lo, limpar dados ou publicar. Os comandos da seção 6 continuam válidos. O registro de encerramento de 11/09 abaixo descreve a etapa anterior; seus testes e limitações permanecem como histórico.

---

Registro de encerramento: **11/09/2026**.

Neste encerramento, foi verificada a implementação e criado somente este documento. Não foram implementadas funções, alterado o funcionamento da aplicação, executados novos testes, reiniciado o servidor, limpos dados ou feita publicação. Os resultados de testes abaixo pertencem ao trabalho de implementação realizado anteriormente nesta conversa.

## 1. Estado do projeto e alterações realizadas

Aplicação local em Next.js 16.3.4, React 19.2.8 e TypeScript. Continua sendo um protótipo de auditorias de Segurança e Qualidade com dados demonstrativos.

- Layout redesenhado com base nas duas capturas do Nexobra enviadas pelo usuário: cabeçalho branco amplo, azul-escuro, detalhes vermelhos, fundo claro, cartões e campos com bordas suaves. A navegação direta no site de referência não foi concluída; as capturas foram a referência efetivamente utilizada.
- Menu lateral substituído por navegação horizontal: Visão geral, Auditorias, Ocorrências, Obras, Relatório e Configurações. Em Auditorias: Nova auditoria, Histórico e Roteiro de auditoria.
- Painel reorganizado com atalhos funcionais e números coerentes com os exemplos: duas obras, duas auditorias, duas ocorrências e três roteiros. Esses números não são calculados a partir dos rascunhos preenchidos pelo usuário.
- Obras e ocorrências receberam filtros locais, contagem de resultados e estados vazios. Ocorrências possuem detalhes expansíveis. O cadastro de nova obra continua desabilitado, com explicação.
- Catálogo recebeu busca rotulada, contagem e botão para mostrar mais quesitos, superando a antiga exibição limitada aos primeiros 20 itens.
- Preenchimento recebeu navegação anterior/próximo, busca para saltar a um item, orientações expansíveis e indicador de respostas selecionadas. O percentual tem uma casa decimal e não arredonda uma coleta incompleta para 100%; não representa nota ou conformidade.
- Respostas e observações continuam independentes por modelo e quesito. Data e nome do auditor passaram a permanecer ao trocar de seção dentro da mesma página aberta.
- O antigo botão sem ação “Salvar nesta sessão” foi substituído por texto explicando a manutenção das respostas na sessão. Isso não acrescentou persistência.
- Corrigida a exibição dos pesos documentados de Qualidade, antes ocultados por uma regra de CSS. Segurança continua com pesos individuais `null` / “A definir”. Não foi habilitado cálculo de nota oficial.
- Histórico, relatório de exemplo e configurações receberam o novo estilo. Foram ajustados foco visível, rótulos, tabelas semânticas, contraste e adaptação ao celular.
- Fontes externas via `next/font/google` foram removidas; a interface usa Arial/Helvetica do sistema. As versões e dependências principais do projeto foram preservadas.

Arquivos principais para retomar:

| Arquivo | Responsabilidade |
| --- | --- |
| `src/app/page.tsx` | Cabeçalho, navegação, estado dos rascunhos, painel, histórico, relatório e configurações |
| `src/app/globals.css` | Cores, estilos comuns, layout, responsividade e impressão |
| `src/app/layout.tsx` | Metadados e importação das três folhas de estilo ativas |
| `src/app/components/audit-workspace.tsx` e `src/app/audit-workspace.css` | Catálogo, preenchimento, orientações e navegação entre quesitos |
| `src/app/components/operational-views.tsx` e `src/app/operational-views.css` | Obras e ocorrências demonstrativas, filtros e cartões |
| `src/app/components/ui-icon.tsx` | Ícones da interface |
| `src/domain/audit-draft.ts` | Estrutura e atualização dos rascunhos em memória |
| `src/domain/catalogs.ts` e `CATALOGO_SEGURANCA_IT07_R02.json` | Fontes dos roteiros, preservadas durante o redesign |

`README.md` foi atualizado. `.gitignore` e `eslint.config.mjs` passaram a ignorar `.tmp`, usada nas verificações temporárias. Os arquivos antigos `src/app/audit-navigation.css` e `src/app/screen-layout.css` ainda existem, mas não são importados pelo layout atual.

## 2. Armazenamento verificado e risco de perda

**As auditorias preenchidas ficam somente em memória React, na página aberta do navegador. Não há armazenamento persistente no navegador nem banco de dados.**

A verificação foi feita em `page.tsx`, `audit-draft.ts`, nos componentes, na estrutura de `src` e nas dependências. Não foi encontrada implementação de `localStorage`, `sessionStorage`, IndexedDB, API de gravação, banco, escrita de respostas em arquivos, importação ou exportação de rascunhos.

| Informação | Onde está agora | O que acontece ao recarregar ou reabrir |
| --- | --- | --- |
| Resposta e observação de cada quesito | `useState<AuditDrafts>({})` em `Home`; mapa por nome do modelo e ID do quesito | O mapa volta a vazio; não há recuperação implementada |
| Data e nome do auditor digitados | `auditDetails`, outro `useState` de `Home` | Retornam aos valores iniciais de demonstração |
| Tela, modelo, item e busca do catálogo | Estados de `Home` | Retornam aos valores iniciais |
| Filtros de obras/ocorrências e busca do seletor de itens | Estado dos respectivos componentes | Reiniciam; também podem reiniciar ao sair da seção ou fechar o seletor |
| Catálogos, obras, ocorrências e histórico de exemplo | JSON e constantes/textos nos arquivos do projeto | São carregados novamente dos arquivos; não contêm as respostas digitadas |

Trocar de item, modelo ou seção pelo menu preserva as respostas enquanto `Home` permanece montado. Trocar de modelo leva ao primeiro item daquele roteiro, mantendo as respostas já selecionadas de cada modelo. A data e o auditor são compartilhados entre os modelos, não metadados independentes de várias auditorias.

Fechar a aba ou janela encerra a única cópia das alterações mantida pela aplicação; recarregar ou abrir uma nova página inicia o estado padrão. Não há rotina de recuperação nem aviso de saída com dados não salvos. Manter o servidor ligado não salva os rascunhos. A localização do projeto em uma pasta OneDrive não comprova sincronização ou backup e não faz as respostas serem gravadas nos arquivos.

Não foi feita leitura da sessão pessoal aberta do usuário. Este diagnóstico vem do código, não de uma confirmação de que os dados atualmente visíveis em alguma aba estejam salvos.

### Salvamento e exportação existentes

- Selecionar uma resposta ou digitar uma observação chama `updateDraft` / `updateItemResponse`, que atualizam o estado em memória. O texto “Respostas mantidas nesta sessão” se refere apenas a isso.
- Não existe botão funcional de salvamento permanente, criação de arquivo de auditoria, exportação JSON/CSV/planilha, importação ou backup/restauração.
- O botão **Imprimir página**, na seção Relatório, chama `window.print()`. O relatório contém dados fixos de demonstração e **não inclui as respostas, observações, data ou auditor alterados no rascunho**. Portanto, imprimir esse relatório não preserva o preenchimento atual.
- Uma opção “Salvar como PDF” eventualmente oferecida pela janela de impressão pertence ao navegador. A aplicação não gera nem armazena PDF. Nenhum arquivo PDF de auditoria foi produzido ou verificado neste trabalho.
- Não há anexação, pré-visualização, upload ou armazenamento de fotografias implementados, embora o aviso geral ainda mencione fotos.

## 3. Testes realmente executados e resultados

Os comandos foram executados durante a implementação, antes deste registro. A execução final dos testes listados passou; não foram repetidos neste encerramento.

| Verificação | Resultado observado e alcance |
| --- | --- |
| `npm.cmd run lint` | Passou na execução final, sem erros de ESLint |
| `npx.cmd tsc --noEmit` | Passou; a compilação final também executou a verificação TypeScript |
| `npm.cmd run test:navigation` | Passou: limites de navegação, avanço sem resposta, respostas/observações independentes, nota zero válida, separação de rascunhos por modelo e contagens 205/10/23 |
| `npm.cmd run verify:security` | Passou: 205 códigos únicos em ordem, fonte com 27 grupos/37 subgrupos, textos, grupos, subgrupos, páginas e orientações comparados ao JSON; pesos individuais continuam `null` |
| `npm.cmd run build` | Passou na execução final: compilação de produção, TypeScript e geração estática concluídos. Não houve deploy |
| `node .tmp/visual-qa/check.cjs` | Passou em Microsoft Edge sem janela, via Playwright Core, contra o servidor local existente; nenhum evento de erro de página registrado |

O teste de navegador cobriu: ida e volta entre quesitos, manutenção de respostas/observações ao trocar de seção, data e auditor mantidos, separação entre Segurança e Qualidade, peso de Qualidade exibido, salto para o último quesito e bloqueio do botão Próximo, catálogo de 20 para 40 itens, busca e estado vazio, filtros de obras/ocorrências e abertura dos detalhes.

Também verificou ausência de transbordamento horizontal da página nas seis seções principais com viewport de 390 × 844 e em telas selecionadas a 1440 × 1080. A rolagem horizontal do menu no celular é intencional. Foram inspecionadas capturas de desktop e celular, incluindo painel, ocorrências e preenchimento. Isso não equivale a teste em aparelhos físicos ou em todos os navegadores.

Para impressão, foi emulado o CSS de mídia `print`, verificando que a navegação fica oculta e o relatório permanece visível. Não foi testada impressão física nem confirmado salvamento pela janela de impressão.

Evidências locais verificadas em `.tmp/visual-qa/`: `check.cjs`, `desktop-overview.png`, `desktop-audit.png`, `desktop-occurrences.png`, `desktop-works.png`, `mobile-overview.png`, `mobile-occurrences.png`, `mobile-audit.png` e `print-report.png`. Playwright Core foi instalado apenas nessa pasta temporária; não foi adicionado às dependências principais. Essa pasta é ignorada por Git/ESLint e não deve ser tratada como evidência versionada ou backup de auditorias.

Ocorreram falhas intermediárias já corrigidas: nome `icon.tsx` interpretado como convenção de rota do Next.js (renomeado para `ui-icon.tsx`); BOM no CSS impedindo aplicação das variáveis de cor (removido); seletores inadequados no teste visual (ajustados); lint incluindo o script temporário (pasta `.tmp` ignorada). Os scripts de domínio ainda emitem o aviso Node `MODULE_TYPELESS_PACKAGE_JSON`, sem reprovar os testes.

Não foram testados persistência, recuperação após fechamento, banco, autenticação, upload, exportação de rascunhos ou cálculo oficial: essas funções não estão implementadas. A perda após fechamento foi identificada pela implementação, sem fechar ou recarregar a aba pessoal do usuário para testá-la.

## 4. Problemas conhecidos e pendências

- Ausência de persistência e recuperação dos preenchimentos; usar somente dados de teste.
- Não há instâncias de auditoria identificadas por obra/data/ID. “Nova auditoria” abre o mesmo formulário e seus rascunhos por modelo, sem criar um registro independente. O formulário oferece apenas Residencial Horizonte.
- Histórico, indicadores, obras, ocorrências e relatório são exemplos estáticos; não refletem automaticamente o preenchimento atual. Cadastro, edição e tratamento real de ocorrências ainda não existem.
- Não há conclusão/revisão formal da coleta, aprovação, autenticação ou controle de acesso aplicado. A matriz de acesso é documental.
- N/A sinaliza justificativa e usa `required` no campo, mas não há envio/finalização com validação que impeça avançar sem justificativa. Falta ação para limpar uma resposta. “Não verificado” aparece na interface de Qualidade; não é uma opção selecionável da coleta de Segurança atual.
- Medições estão desabilitadas; evidências e plano de ação não estão implementados.
- Os 205 pesos individuais de Segurança aguardam definição. Qualidade mantém pesos documentados, mas conversões de respostas, N/A, rateios, arredondamentos e faixas do farol aguardam validação. Consultar `docs/PENDENCIAS_METODOLOGIA.md`; não inferir pesos nem habilitar nota oficial.
- Revisar futuramente os arquivos CSS antigos sem uso e a documentação de planejamento. O título “Etapa 1 — concluída” em `docs/PLANO.md` não significa que todas as funções operacionais ou de salvamento estejam implementadas.
- O novo layout ainda depende da avaliação do usuário; a conferência técnica foi feita apenas nos cenários descritos acima.

## 5. Próximo passo recomendado

Na retomada, priorizar a definição e implementação de **persistência recuperável dos rascunhos**, antes de usar dados reais ou ampliar a operação. Definir o destino do armazenamento e a identificação de cada auditoria por obra, modelo/versão e ID; separar seus metadados; prever recuperação e backup/exportação verificáveis. O critério de aceite deve incluir preencher, recarregar/reabrir e conferir a recuperação dos mesmos dados.

Depois, vincular histórico e relatório aos registros reais. Manter o cálculo oficial pendente até a validação metodológica. Essas são recomendações para trabalho futuro; nada disso foi implementado neste encerramento.

Antes de qualquer alteração de código, reler `AGENTS.md` e o guia pertinente em `node_modules/next/dist/docs/`, conforme a instrução desta versão do Next.js.

## 6. Como abrir novamente

Se o servidor de desenvolvimento ainda estiver rodando, basta acessar **http://localhost:3000**. Não iniciar outro servidor por cima dele. Abrir outra aba não recupera respostas da aba anterior.

Se o servidor já tiver sido encerrado, abrir o PowerShell e executar:

```powershell
Set-Location -LiteralPath "C:\Users\SAMSUNG\OneDrive\Desktop\Dialogo Auditorias\auditoria-obra"
npm.cmd run dev
```

Manter esse terminal aberto e acessar o endereço indicado no terminal, normalmente **http://localhost:3000**. Com as dependências atuais instaladas, não é necessário reinstalá-las nem executar build para retomar o desenvolvimento. Usar `npm.cmd` e `npx.cmd` no PowerShell; não alterar a política de execução do Windows.

Este registro não afirma que o servidor permanecerá ligado após o encerramento do computador. Nenhum comando de inicialização, reinicialização, limpeza ou publicação foi executado para produzir este documento.








