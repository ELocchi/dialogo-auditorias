# Bootstrap e aprovação de acessos — Diálogo Auditorias

Implementação B.2 de 13/09/2026, ampliada para múltiplos perfis pela migration `20260913000300_multiple_access_profiles.sql`. O cadastro validado continua criando a identidade no Auth e a solicitação `PENDENTE_APROVACAO` na mesma transação. Confirmação, senha, login, callback e logout continuam usando o SDK oficial com chave publicável e sessão individual. O estado de aplicação e validação de cada etapa está no início de `RETOMADA.md`.

## Primeiro Administrativo

A conta existente de Emanuel Locchi foi designada expressamente pelo responsável: `emanuel.locchi@dialogo.com.br`. O script em `supabase/admin/bootstrap-initial-administrator.sql` fixa o UUID verificado no DEV e o e-mail esperado. Não recria a conta, não confirma o e-mail manualmente, não altera a senha e não reescreve cargo/área, obra de referência ou data original do pedido.

A migration `20260913000200_access_administration.sql` apenas cria a estrutura e as funções. Ela não promove nenhuma conta por si só. O bootstrap é uma operação de implantação separada, registrada como `BOOTSTRAP`, executada por sessão administrativa `postgres` através do CLI já autenticado. A função fica no schema privado `dialogo_private`, sem uso ou execução para `PUBLIC`, `anon`, `authenticated` e `service_role`. Não há botão, endpoint Next.js nem RPC pública para bootstrap.

A função exige UUID e e-mail correspondentes à conta existente, e-mail confirmado, conta não bloqueada/excluída, solicitação ainda pendente e justificativa. Um bloqueio transacional e um índice único impedem bootstrap repetido, inclusive após desativação de Administrativos. Ausência de Administrativos ativos nunca reabre essa exceção.

## Histórico e permissões

- `access_requests`: mantém os dados declarados. Somente a decisão protegida muda o status de pendente para aprovado e atualiza `updated_at`; o registro original completo é capturado no histórico antes da mudança.
- `access_accounts`: conjunto de perfis efetivos (`perfis`), atuação de Engenharia, atividade e aprovação. O campo singular `perfil` permanece como primeiro perfil na ordem canônica para compatibilidade; não representa todos os poderes da pessoa. O bootstrap usa `approved_by = NULL`, pois é implantação, e não uma autoaprovação da identidade pela aplicação.
- `access_grants`: cada linha concede exatamente uma combinação **perfil/obra/módulo** à conta, vinculada à decisão. Não há cruzamento entre os acessos de dois perfis. Auditor de Segurança recebe apenas Segurança; Auditor de Qualidade, apenas Qualidade; Engenharia exige Equipe da obra ou Coordenação. Uma obra autorizada para Engenharia não se torna autorizada para auditoria por a pessoa acumular os dois perfis.
- `access_works`: catálogo mínimo de nomes reais para seleção nas concessões, inicialmente vazio. Não é o cadastro operacional completo de obras. Nomes declarados no cadastro nunca são importados ou concedidos automaticamente.
- `access_decisions`: trilha imutável com pedido original, perfis e atuação concedidos, combinações exatas e nomes das obras na ocasião, justificativa, autor e horário do banco. Aprovações normais guardam a identidade e uma cópia do nome/e-mail do decisor; bootstrap guarda o papel da sessão administrativa e a justificativa de autorização. Registros antigos mantêm todos os valores originais e são apresentados com seu perfil singular. A ampliação inicial tem decisão própria `AJUSTE_PERFIS_INICIAL` com o estado de acesso anterior, sem reescrever o bootstrap.

Administrativo concede acesso à gestão de usuários e pode coexistir com qualquer combinação dos outros três perfis. Não concede automaticamente obras, Segurança, Qualidade ou poderes sobre auditorias. Cada perfil técnico selecionado exige suas concessões explícitas; apenas Administrativo pode ser aprovado sem obra. As tabelas têm RLS e não concedem escrita direta aos clientes. Funções privilegiadas possuem `search_path` vazio e privilégios explícitos. A aprovação recebe somente alvo, perfis, atuação, combinações e justificativa; o banco obtém o autor por `auth.uid()` e o horário pelo relógio do servidor.

## Administração → Usuários e acessos

Rota `/administracao/usuarios`, protegida no servidor e em cada Server Action. A sessão atual deve pertencer a Administrativo confirmado, aprovado e ativo. O banco revalida esses requisitos em cada escrita e sincroniza a decisão com mudanças de autorização. Clientes sem sessão, pendentes, não administrativos, desativados ou bloqueados não obtêm autoridade por metadata.

A fila contém somente pedidos pendentes confirmados. O Administrativo confere os dados declarados, seleciona um ou mais perfis, escolhe a atuação de Engenharia quando aplicável e define cada obra/módulo dentro do respectivo perfil. A interface permite cadastrar nomes reais no catálogo mínimo. A confirmação exige justificativa e só informa sucesso após receber do banco o identificador da decisão. Autoaprovação, concessões inválidas, pedidos não confirmados e decisões repetidas falham sem gravação parcial. Resultado incerto orienta consultar o histórico antes de repetir.

Após login, `/aguardando-liberacao` consulta o estado atual: pendentes continuam acompanhando o próprio pedido; aprovados com múltiplos perfis escolhem em `/escolher-perfil`, enquanto um único perfil abre `/app` diretamente. O painel apresenta a prévia das telas do perfil escolhido, com obras e módulos atuais; preenchimentos de teste são temporários e não persistem. Administração exige o perfil Administrativo selecionado. `/minha-conta` apresenta todas as concessões. Autorizações são revalidadas a cada requisição protegida. Agenda, auditorias e arquivos persistentes pertencem às próximas entregas. Consulte [SELECAO_PERFIL.md](SELECAO_PERFIL.md).

Recusa, reanálise, alteração genérica de concessões de contas já aprovadas e interface de revogação ainda não estão implementadas. Múltiplos perfis são concedidos na aprovação; a ampliação da conta inicial é uma operação privada específica autorizada pelo responsável. A desativação administrativa do estado vigente já é respeitada na próxima operação protegida. Não usar exclusão/recriação nem repetir o bootstrap como recuperação administrativa.

## Ampliação controlada da conta inicial

O responsável confirmou quatro perfis na conta existente, Engenharia como **Coordenação**, nas **21 obras cadastradas em 13/09/2026**. A migration B.3 adiciona suporte a conjuntos de perfis e converte cada concessão anterior preservando exatamente seu contexto; não amplia ninguém automaticamente. A operação separada em `supabase/admin/configure-initial-account-profiles.sql` fixa conta, e-mail, IDs das 21 obras e motivo autorizado. Exige sessão administrativa `postgres`, conta inicial confirmada/ativa e estado anterior compatível. Não é uma rota, botão ou RPC acessível ao cliente.

A decisão adicional registra o estado anterior, quatro perfis e 84 concessões: Segurança como auditor em 21 obras, Qualidade como auditor em 21 e Engenharia nos dois módulos nas mesmas 21. O autor é a sessão do banco, sem atribuir ao usuário uma autoaprovação; a data e o autor da aprovação inicial permanecem. Um marcador permanente impede repetição. Obras cadastradas futuramente não são incluídas nessa lista automaticamente.

`has_current_access_grant(perfil, obra, modulo)` verifica a combinação exata com identidade, conta e obra ativas. A página **Meus acessos** apresenta os perfis acumulados e as concessões correspondentes. Essa infraestrutura de autorização não torna prontos os módulos operacionais ainda em desenvolvimento.

## Procedimento original de bootstrap no DEV — já executado

### Ampliação designada de Luiza — executada em 14/09/2026

A pedido explícito do responsável, a conta já aprovada de Luiza Dutra recebeu os mesmos quatro perfis, duas atuações de Engenharia e 84 concessões nas 21 obras atuais de Emanuel. A migration B.6 adiciona o tipo histórico `AJUSTE_ACESSOS_GERAIS` e uma função privada restrita à identidade designada e a `postgres`. A operação separada `supabase/admin/configure-luiza-general-access.sql` preserva a aprovação e os três vínculos anteriores, acrescenta somente 81 vínculos ausentes e uma decisão do operador; não altera Auth nem contas de terceiros. O marcador permanente bloqueia repetição. Não usar essa função para outra identidade, novas obras ou alterações futuras. Evidências e decisão estão no início de `RETOMADA.md`.

### Procedimento histórico B.2

A execução e suas evidências estão no início de `RETOMADA.md`. Os passos abaixo documentam B.2, já aplicado neste DEV; não executar novamente para conceder múltiplos perfis. Para uma implantação ainda pendente, conferir primeiro o vínculo local contra o projeto DEV configurado, a conta designada e o histórico remoto. Não aplicar no piloto/produção por analogia.

1. Revisar a migration, o script com UUID/e-mail esperados e a justificativa.
2. Executar os testes locais; `npm run test:access-database` usa PGlite em memória, separado do Supabase. A dependência de testes pode ser instalada em diretório de ferramentas separado e indicada por `PGLITE_MODULE_PATH`, caminho absoluto de `@electric-sql/pglite/dist/index.js`; não faz parte do runtime da aplicação.
3. Usar CLI Supabase 2.117.0 autenticado: `supabase db push --linked --skip-vault --dry-run`. O resultado esperado contém somente `20260913000200_access_administration.sql`, sem seeds ou roles.
4. Aplicar com `supabase db push --linked --skip-vault`. Não usar `db reset`, seed ou reparo fictício do histórico.
5. Executar uma única vez `supabase db query --linked --file supabase/admin/bootstrap-initial-administrator.sql`, em sessão `postgres`. Se a resposta for incerta, consultar `access_decisions` antes de qualquer tentativa; a unicidade bloqueia nova concessão.
6. Conferir histórico de migrations, RLS, ACLs, uma decisão BOOTSTRAP, conta Administrativa ativa, concessões técnicas vazias e dados originais preservados. Entrar pela aplicação com a mesma conta e senha já criadas.

Não colocar chave secreta ou `service_role` no navegador. Não solicitar senha/token no chat. O CLI utiliza seu mecanismo de autenticação já configurado. Nenhuma publicação no Render integra este procedimento.

## Alcance da validação

Os testes SQL isolados executam migrations, triggers, permissões e RLS de PostgreSQL com identidades sintéticas locais e rollback. Não enviam e-mails nem criam contas no DEV. O adaptador local de Auth não substitui GoTrue, assinatura de JWT, PostgREST, entrega de e-mail ou teste simultâneo com múltiplas conexões. Testes offline de serviços também não são evidência de aprovação HTTP com sessão real.

A migração original e as regressões B.1 permanecem. A suíte SQL B.1 roda somente sobre B.1, pois sua restrição antiga de status único é ampliada deliberadamente em B.2. A suíte B.2 roda após ambas as migrations. A suíte de múltiplos perfis exercita B.3, incluindo a conversão de dados legados. As verificações remotas devem ser distinguidas dos testes locais no registro da entrega. A aprovação com segunda conta real foi adiada pelo responsável para o dia seguinte; não criar ou simular essa conta no DEV para substituir o teste.

Referências técnicas: [RLS do Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [funções de banco](https://supabase.com/docs/guides/database/functions) e [proteção da API](https://supabase.com/docs/guides/api/securing-your-api). Guias Next.js 16.3.4 de autenticação e Server Actions consultados no pacote instalado.


## Inclusão de Equipe da obra na conta inicial — B.4 executada

Após autorização explícita do responsável, B.4 adicionou `atuacoes_engenharia` e preencheu cada conta com a atuação que já possuía. A função privada `configure_initial_engineering_scopes` concedeu Equipe da obra à conta inicial, preservando Coordenação, as mesmas 21 obras/84 vínculos e todos os campos anteriores do histórico. Nova decisão `172ffae1-abc2-4930-9f54-9da50704b7d7`; registro completo em RETOMADA.md. Não repetir o procedimento. Não existe botão de autoaprovação ou execução de API para essa operação.

O predicado `has_current_engineering_scope` combina atuação aprovada, identidade ativa e vínculo exato de Engenharia/obra/módulo. O seletor de visualização valida esse contexto atual. A aprovação V2 permanece compatível com uma única atuação por nova aprovação; arrays compostos não são presumidos a partir de Coordenação ou do perfil Administrativo.
