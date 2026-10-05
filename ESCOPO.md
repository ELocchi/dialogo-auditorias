# Escopo atual — Diálogo Auditorias

> Atualizado em **05/10/2026**. Última versão hospedada verificada: commit **`8db2543`**. As migrações de publicação de auditorias/planos e de relatórios sem agendamento foram aplicadas e verificadas no Supabase. Novas auditorias e planos ainda aguardam chave do servidor e deploy do código no Render. Relatórios sem agendamento estão disponíveis no código local/LAN e aguardam publicação do código no Render; esse fluxo usa a sessão do usuário e não exige chave privilegiada.

## 1. Objetivo da aplicação

O Diálogo Auditorias é uma aplicação independente para gestão de auditorias de **Segurança do Trabalho** e **Qualidade** da Diálogo Engenharia. O sistema reúne autenticação, perfis e concessões, cadastro de obras, agenda de auditorias, roteiros, resultados publicados, apontamentos, relatórios orientativos e painéis de consulta.

A aplicação é separada do `nexobra-main`. O ambiente publicado usa Supabase para autenticação, banco e arquivos privados, GitHub para o código e Render para execução.

## 2. Versão publicada

| Item | Situação atual |
| --- | --- |
| Aplicação | [dialogo-auditorias-testes.onrender.com](https://dialogo-auditorias-testes.onrender.com) |
| Repositório | `ELocchi/dialogo-auditorias` — privado |
| Branch de publicação | `main` |
| Commit publicado | `8db2543` — `fix: exibir todos os agendamentos no calendario administrativo` |
| Render | Web Service Node, plano `starter`, deploy automático por commit |
| Health check | `/entrar` |
| Banco e autenticação | Projeto Supabase autorizado |
| Migrações do banco | 60 aplicadas; última `20261002000100_standalone_follow_up_reports`, verificada em 02/10/2026 |
| Node.js | 24 |
| Next.js | 16.3.4, App Router, build com webpack |
| React | 19.2.8 |

O ambiente online e o desenvolvimento local usam o mesmo Supabase autorizado. Alterações em dados persistentes feitas em um ambiente aparecem no outro.

Deploy do calendário concluído em 05/10/2026 às 08:55 (São Paulo), identificado por `dep-db1ovmp42hec73dml53g`, com estado `live` e página `/entrar` respondendo HTTP 200. O calendário administrativo da Agenda e do Painel agora inclui auditorias e acompanhamentos de todos os profissionais autorizados, sem exigir seleção prévia de um profissional. A Coordenação de Engenharia mantém apenas auditorias. Validação: 32 testes de agenda/calendário, ESLint dos componentes alterados e build de produção. O deploy foi acionado pelo CLI após o envio do commit ao GitHub.

## 3. Perfis e contextos de acesso

Uma mesma conta pode possuir mais de um perfil. Quando existem várias opções, o usuário escolhe o contexto em **Como deseja entrar?** e pode trocar de perfil durante a navegação. A escolha não amplia permissões.

### 3.1 Administrativo

Atuações possíveis:

- **Geral:** acessa Segurança e Qualidade, administra usuários, obras, agenda e manutenção da plataforma.
- **Segurança:** acesso administrativo limitado à disciplina Segurança.
- **Qualidade:** acesso administrativo limitado à disciplina Qualidade.

O Administrativo Geral pode:

- analisar solicitações de acesso com e-mail confirmado;
- conceder ou revogar perfis e pares obra/módulo;
- consultar o histórico das decisões administrativas;
- cadastrar, editar e inativar obras;
- manter os dados de responsáveis, coordenação, equipe e observações das obras;
- agendar, reagendar e excluir visitas conforme as regras da agenda;
- consultar painéis, ranking, calendário e documentos autorizados;
- consultar e editar revisões de roteiros e parâmetros disponíveis na plataforma.

### 3.2 Auditor de Segurança

- Consulta somente obras e registros autorizados para Segurança.
- Acessa agenda, confirma datas e inicia auditorias atribuídas.
- Preenche o roteiro IT.07 revisão 02.
- Consulta auditorias publicadas e respectivos apontamentos.
- Registra apontamentos de acompanhamento com fotos.
- Cria, consulta e baixa relatórios orientativos autorizados.

### 3.3 Auditor de Qualidade

- Consulta somente obras e registros autorizados para Qualidade.
- Acessa agenda, confirma datas e inicia auditorias atribuídas.
- Preenche os roteiros F.175 e F.176.
- Consulta auditorias publicadas e respectivos apontamentos.
- Registra apontamentos de acompanhamento com fotos.
- Cria, consulta e baixa relatórios orientativos autorizados.

### 3.4 Engenharia — Equipe da obra

- Consulta as obras e módulos concedidos à conta.
- Consulta a agenda e os dias de auditoria permitidos.
- Visualiza auditorias e relatórios publicados.
- Consulta apontamentos de Qualidade e Segurança.
- Prepara planos de ação a partir de auditorias publicadas.
- Consulta os roteiros liberados.

### 3.5 Engenharia — Coordenação

A navegação de Qualidade e Segurança foi unificada na aba **Qualidade e Segurança**. Essa aba contém:

- caixa de Qualidade com auditorias e planos de ação;
- caixa de Segurança com auditorias e planos de ação;
- caixa de Roteiros abaixo das duas disciplinas.

Na Visão geral da Coordenação:

- o calendário é filtrado por obra;
- são exibidos somente dias com auditorias;
- visitas de acompanhamento não aparecem;
- os antigos cartões de Apontamentos, Planos de ação e Nota foram removidos.

A Coordenação consulta os resultados e documentos autorizados, sem receber permissão para alterar auditorias publicadas.

## 4. Funcionalidades atuais

| Área | Situação | Persistência |
| --- | --- | --- |
| Solicitação de acesso | Fluxo implementado, restrito a e-mail corporativo; envio para novos destinatários depende de SMTP próprio | Supabase Auth e banco |
| Confirmação de e-mail | Exigida antes da aprovação; entrega limitada pelo serviço padrão do Supabase | Supabase Auth e banco |
| Login e logout | Operacional | Supabase Auth |
| Escolha e troca de perfil | Operacional | Cookie seguro vinculado à identidade e concessões atuais |
| Aprovação administrativa | Operacional, com histórico | Banco |
| Cadastro e edição de obras | Operacional, com revisão concorrente e histórico | Banco |
| Agenda de auditorias | Operacional | Banco |
| Confirmação de data pelo auditor | Operacional | Banco |
| Notificações da agenda | Operacional dentro da aplicação | Agenda persistente; estado visual mantido pelo cliente |
| Envio de e-mail da agenda | Adiado | Não implementado |
| Catálogos e revisões | Leitura operacional; manutenção administrativa conforme autorização | Banco e documentos privados |
| Histórico de auditorias publicadas | Operacional, paginado e filtrado | Banco |
| PDFs e evidências de auditorias publicadas | Operacional e protegido | Storage privado e banco |
| Preenchimento de nova auditoria | Salvamento e retomada implementados; ativação pendente | `audit_drafts` e Storage privado |
| Publicação de nova auditoria | Validação, cálculo e PDF no servidor; ativação pendente | `published_audits`, arquivos privados e conclusão transacional da visita |
| Comparação com auditorias anteriores | Operacional para publicações autorizadas | Leitura do banco |
| Ranking mensal e anual | Operacional com auditorias publicadas | Leitura agregada do banco |
| Apontamentos de acompanhamento | Operacional | Banco e Storage privado |
| Fotos dos apontamentos | Operacional, JPG/PNG e acesso protegido | Storage privado |
| Relatórios orientativos | Criação, múltiplos relatórios, visualização e PDF | Banco e geração protegida no servidor |
| Conclusão de apontamentos | Operacional conforme vínculo do relatório | Banco |
| Plano de ação | Rascunho e publicação implementados; ativação pendente | `action_plan_drafts`, `published_action_plans` e PDF privado |
| Discussão formal com a obra | Tela informativa | Em preparação |
| Ocorrências operacionais | Estrutura visual disponível | Sem registros operacionais integrados |

## 5. Auditorias e roteiros

### Segurança

- Modelo: `security-it07-r02`.
- Catálogo atual: IT.07 revisão 02.
- 205 subitens com peso inicial 1, além dos pesos e orientações documentais de grupo.
- Escala de resposta: 0, 5, 10 e N/A.
- A metodologia final para todos os casos de arredondamento, bases nulas e publicação oficial ainda precisa de validação técnica.

### Qualidade

- Modelo simplificado: `quality-f175`, com 10 quesitos.
- Modelo completo: `quality-f176`, com 23 quesitos.
- O cálculo de Qualidade e o rateio ponderado dos serviços FVS estão implementados na aplicação.
- As revisões dos pesos FVS são armazenadas separadamente.

### Publicações

- Auditorias publicadas são tratadas como registros imutáveis.
- O acesso depende do perfil, disciplina e obra concedidos.
- PDFs, respostas, critérios e evidências são lidos por rotas protegidas.
- A interface não oferece edição, reabertura, substituição ou recálculo de uma publicação existente.
- Existe uma publicação persistida de Qualidade Completa da obra BoulevarDiálogo, de 23/09/2026, usada como referência autorizada do fluxo publicado.

### Novo fluxo de publicação (implementado localmente)

Rascunhos de auditoria são salvos e recuperados por visita, com roteiro e pesos preservados. O servidor valida respostas e fotos, calcula a nota e gera o PDF. A transação final publica a auditoria e conclui a visita exata. Repetições são idempotentes e revisões antigas são rejeitadas.

O plano de ação usa os apontamentos da auditoria imutável. Engenharia · Equipe de obra preenche ações, responsáveis e datas; o servidor valida o conteúdo e grava o PDF e a publicação. A consulta pela Coordenação usa a autorização da obra.

Detalhes, limites, testes e passos de ativação: [docs/PUBLICACAO_AUDITORIAS_PLANOS.md](docs/PUBLICACAO_AUDITORIAS_PLANOS.md).

## 6. Relatórios orientativos e acompanhamento

O fluxo de acompanhamento disponível aos auditores permite:

- registrar apontamentos vinculados a uma obra, com local, descrição, orientação e foto;
- marcar um apontamento como grave por um único controle de alerta;
- listar apontamentos por obra;
- concluir apontamentos preservando os que já pertencem a um relatório fechado;
- criar relatórios diretamente pelo botão **+**, escolhendo obra e data, sem exigir visita agendada ou confirmada;
- consultar os relatórios anteriores vinculados a visitas;
- informar nome do relatório, participantes, assuntos tratados e decisões/deliberações;
- selecionar opcionalmente até 30 apontamentos pendentes da obra ou salvar sem apontamentos;
- visualizar e baixar o PDF protegido;
- preservar relatórios salvos como documentos fechados.

A implementação sem agendamento grava documentos em `standalone_follow_up_reports`, com obra, disciplina, autor, data e conteúdo próprios. Não cria nem altera visitas. A gravação resolve os apontamentos no banco, preserva textos e referências de fotos e impede duplicação em reenvios da mesma operação. As listas de auditores e Engenharia reúnem relatórios anteriores e independentes. Ativação: [docs/RELATORIOS_SEM_AGENDAMENTO.md](docs/RELATORIOS_SEM_AGENDAMENTO.md).

Na listagem de relatórios orientativos:

- o título da área é **Relatório Orientativo**;
- cada cartão mostra a data, o nome do relatório e a obra;
- o botão de download fica no próprio cartão;
- dados auxiliares removidos da interface não são repetidos nos cartões.

## 7. Painéis e experiência atual

- Cabeçalho e navegação horizontal compartilhados entre os perfis.
- Ícone de capacete para Segurança.
- Filtros de obra e mês seguem o mesmo padrão visual da Agenda.
- Filtros ficam alinhados ao título dos painéis quando há espaço.
- Ranking mensal e anual separado por disciplina.
- Calendários usam o fuso de São Paulo e datas literais das visitas.
- Cartões de auditoria, plano de ação, apontamentos, relatórios e roteiros usam o padrão visual atual da plataforma.
- Layout responsivo para telas menores.
- Auditorias e planos novos têm prévia no navegador e PDF definitivo gerado no servidor e armazenado na publicação. Relatórios orientativos continuam com PDF sob demanda.

## 8. Segurança e isolamento de dados

As autorizações não dependem apenas de esconder botões. As rotas protegidas validam:

1. usuário atual no Supabase Auth;
2. conta ativa e aprovada;
3. e-mail corporativo confirmado;
4. perfil e atuação selecionados;
5. concessões atuais de obra e módulo;
6. vínculo do registro solicitado ao contexto autorizado.

Outras proteções vigentes:

- clientes Supabase são criados por requisição;
- consultas usam a sessão do usuário e RLS, sem `service_role` na aplicação;
- respostas privadas usam `Cache-Control: private, no-store`;
- PDFs e fotos privadas não são expostos por caminhos públicos diretos;
- parâmetros de identidade enviados pelo cliente são comparados com a sessão real;
- resultados publicados preservam critérios e revisões usados na emissão;
- loaders descartam respostas atrasadas depois de troca de perfil, cancelamento ou mutação.

## 9. Otimizações vigentes

A versão atual inclui:

- agenda compacta com revisão e resposta HTTP `304` quando não houve alteração;
- polling de 30 segundos somente na tela Agenda e enquanto as notificações estão abertas;
- revalidação passiva por foco apenas quando o estado está desatualizado;
- Coordenação sem carregamento desnecessário da agenda na aba unificada;
- carregamento agrupado dos históricos de Qualidade e Segurança da Coordenação;
- paginação e cache temporário limitado para históricos;
- consultas específicas para painel, comparação, auditoria e acompanhamento;
- miniaturas WebP com processamento e cache limitados no servidor;
- ausência de segunda tentativa automática com a foto original quando uma miniatura protegida falha;
- componentes e bibliotecas pesadas carregados sob demanda;
- memorização de filtros e listas derivadas no cliente;
- ExcelJS e `pdf-lib` carregados somente nos fluxos de exportação correspondentes.

## 10. Arquitetura resumida

```text
Navegador
  ├─ Next.js App Router / React
  ├─ páginas autenticadas em /app
  └─ chamadas às rotas protegidas
          │
          ▼
Next.js no Render
  ├─ valida sessão, conta, perfil e concessões
  ├─ executa regras de acesso e projeções
  ├─ gera PDFs e miniaturas
  ├─ consulta Supabase com a sessão do usuário
  └─ publica com cliente secreto exclusivo do servidor e RPC que revalida o ator
          │
          ▼
Supabase
  ├─ Auth
  ├─ PostgreSQL + RPCs + RLS
  └─ Storage privado
```

Principais diretórios:

- `src/app`: páginas, rotas HTTP e componentes.
- `src/domain`: regras de domínio e modelos operacionais.
- `src/lib`: serviços, validações, acesso, sincronização, PDFs e integrações.
- `supabase/migrations`: evolução versionada do banco, funções e políticas.
- `supabase/tests`: verificações SQL isoladas.
- `scripts`: testes de domínio, segurança, rotas e desempenho.
- `private/reference-documents`: documentos protegidos usados pelos roteiros.
- `public/local-test-evidence`: evidências usadas somente na prévia local de desenvolvimento.

## 11. Rotas funcionais principais

### Páginas

- `/entrar`
- `/solicitar-acesso`
- `/confirmar-email`
- `/aguardando-liberacao`
- `/escolher-perfil`
- `/minha-conta`
- `/app`
- `/administracao`
- `/administracao/usuarios`
- `/administracao/usuarios/pendentes`
- `/administracao/usuarios/historico`
- `/administracao/obras/nova`
- `/administracao/obras/[id]`
- `/app/acompanhamento/relatorio/[visitId]`

### APIs protegidas

- acesso e resumo administrativo;
- agenda e detalhe de visita;
- catálogo e revisões;
- painel agregado de auditorias;
- histórico paginado de auditorias;
- histórico agrupado da Coordenação;
- comparação e detalhe de auditoria;
- PDF e fotos de auditoria publicada;
- acompanhamento, fotos e relatórios orientativos;
- documentos de referência dos roteiros.

## 12. Limitações e pendências atuais

### Funcionais

- A persistência de novas auditorias e planos foi implementada e testada localmente. A migração `20261001000100_audit_action_plan_publication.sql` foi aplicada no Supabase em 02/10/2026; a ativação hospedada ainda depende de `SUPABASE_SECRET_KEY` no Render e do deploy do código.
- A migração `20261002000100_standalone_follow_up_reports.sql` foi aplicada no Supabase em 02/10/2026. Relatórios sem agendamento aguardam apenas a publicação do código para uso no Render. As duas migrações passaram nas suítes SQL isoladas; após o deploy foram conferidos histórico, RLS, privilégios das funções, proteção dos documentos e fotos, buckets privados e bloqueio de chamadas anônimas pela API. Nenhum registro de teste foi criado no banco compartilhado.
- Em 02/10/2026, a API de gerenciamento confirmou ausência de SMTP próprio e de hook de envio de e-mail, confirmação obrigatória e limite de dois envios por hora. O envio padrão do Supabase atende somente endereços da equipe do projeto; falta configurar um provedor e remetente autorizados para confirmar os demais cadastros. O formulário local foi corrigido para mostrar falhas de envio, limites e indisponibilidade, mantendo respostas neutras para contas existentes. Diagnósticos do servidor registram somente categorias fixas, sem e-mail, senha ou links. Referência: [SMTP no Supabase](https://supabase.com/docs/guides/auth/auth-smtp).
- Discussão formal com a obra e etapas posteriores à publicação continuam em preparação.
- A limpeza automática dos objetos privados de tentativas de publicação sem commit ainda não foi implementada; os arquivos não vinculados ficam ocultos pela política de leitura.
- Não existe envio de e-mail para agendamento, confirmação ou lembretes.
- A integração com AUTODOC não foi implementada.
- A rotina automática de retenção e remoção de fotos avulsas após 30 dias não foi ativada.
- Backup, restauração e simulação da política de retenção ainda precisam de definição operacional.
- Regras finais de prazo, reenvio, parecer, comitê e substituição de auditor continuam pendentes.

### Metodológicas

- Segurança ainda requer validação dos casos finais de cálculo, arredondamento, N/A e base nula.
- Regras oficiais completas para plano de ação, prazos e estados posteriores à publicação ainda precisam de aprovação.
- A plataforma não deve inventar faixas, prazos, aprovações ou estados enquanto essas definições não forem formalizadas.

### Operacionais

- O ambiente publicado é de testes e usa o banco autorizado compartilhado.
- Não criar dados fictícios em obras reais para testes.
- Não repetir migrations já aplicadas nem o bootstrap da primeira conta administrativa.
- Alterações de schema devem seguir a ordem das migrations e passar pelas suítes SQL isoladas antes de aplicação remota.
- Arquivos `.env.local`, chaves, tokens, senhas e credenciais não podem ser versionados.

## 13. Verificação da versão atual

Na última bateria foram confirmados:

- TypeScript sem erros;
- build de produção concluído;
- rotas do App Router geradas corretamente;
- testes de agenda, sessão, histórico paginado e Coordenação;
- testes de perfis e contexto de obras;
- testes de auditorias publicadas;
- testes de calendário e ranking;
- testes de navegação das auditorias;
- disponibilidade pública da página `/entrar` com HTTP 200;
- nova rota protegida da Coordenação ativa no Render e recusando acesso anônimo com HTTP 401.

Comandos principais:

```bash
npm run lint
npx tsc --noEmit
npm run build
npm run test:auth
npm run test:agenda
npm run test:performance
npm run test:profile-workspace
npm run test:published-audits
npm run test:access-administration
npm run test:calendar
npm run test:ranking
```

## 14. Fontes complementares

- [README.md](README.md): instalação, execução e visão geral.
- [docs/RETOMADA.md](docs/RETOMADA.md): histórico cronológico das entregas.
- [docs/MATRIZ_ACESSOS.md](docs/MATRIZ_ACESSOS.md): matriz de permissões e decisões de acesso.
- [docs/AGENDA_AUDITORIAS.md](docs/AGENDA_AUDITORIAS.md): comportamento da agenda.
- [docs/REVISOES_ROTEIROS.md](docs/REVISOES_ROTEIROS.md): revisões dos roteiros.
- [docs/PENDENCIAS_ESCOPO_REVISADO.md](docs/PENDENCIAS_ESCOPO_REVISADO.md): decisões ainda pendentes.
- [docs/PENDENCIAS_METODOLOGIA.md](docs/PENDENCIAS_METODOLOGIA.md): pontos metodológicos a validar.
- [docs/PUBLICACAO_GITHUB_RENDER.md](docs/PUBLICACAO_GITHUB_RENDER.md): publicação e configuração do ambiente.

Quando houver divergência entre registros históricos e esta fotografia, conferir primeiro o código da branch `main`, as migrations efetivamente aplicadas e o estado do ambiente autorizado. Este arquivo descreve a aplicação na data e no commit indicados no início.

## Segurança — implementação local de 05/10/2026

Pesos por código, preenchimento de grupos como Não se aplica, fechamento com acidentes e penalidades e composição da nota no PDF implementados para aprovação em LAN. Regras e limitações: [REGRAS_AUDITORIA_SEGURANCA.md](docs/REGRAS_AUDITORIA_SEGURANCA.md). Migração `20261005000100_safety_scoring_accidents.sql` preparada e testada somente em banco isolado; não aplicada ao Supabase. Sem novo deploy no Render nesta etapa.

## Deploy autorizado em 05/10/2026 — Segurança e publicação

Regras de Segurança e ajustes de layout aprovados para deploy, incluindo nota ponderada, penalidades por acidentes, grupos N/A, PDF e persistência de auditorias/planos. Chave privada do servidor configurada exclusivamente no Render com autorização explícita. Migração `20261005000100_safety_scoring_accidents.sql` validada tanto em banco vazio quanto na atualização de catálogo existente, preservando documentos e revisões anteriores.

Agendamento solicitado pelo usuário: Segurança / IT.07, Emanuel Locchi, BoulevarDiálogo, 05/10/2026. ID `72312a59-4866-47dd-9af5-f7ca4590892f`, aguardando confirmação na Agenda. Nenhuma auditoria foi preenchida ou publicada em nome do usuário.

Validação antes da publicação: build de produção e 92 testes de regras, publicação, relatórios avulsos e autenticação; duas suítes PostgreSQL isoladas de Segurança e atualização de catálogo.
