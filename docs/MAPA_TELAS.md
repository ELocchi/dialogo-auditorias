# Mapa de telas e verificações — T01–T23

Data: 12/09/2026. Fonte: [escopo revisado](../PROMPT_DIALOGO_AUDITORIAS_ESCOPO_REVISADO.md), Parte I §5, §12–13 e Parte II §06–14 e §22. As telas podem compartilhar componentes sem perder seus IDs e responsabilidades.

Este registro consolida a adequação e as verificações do **Bloco A**, encerrado em 12/09/2026. A aplicação usa a rota `/` com navegação por estado; nomes de telas não representam URLs independentes. Autenticação real, persistência, publicação definitiva e fluxos oficiais dos Blocos B–F não foram executados. O estado “demonstrativo” não equivale a prontidão operacional nem aprovação do piloto.

**Adendo posterior D02 — cadastro e autenticação, 12/09/2026:** o [ADENDO_CADASTRO_AUTENTICACAO.md](ADENDO_CADASTRO_AUTENTICACAO.md) consolida a decisão do responsável após o Bloco A. T01 e T19 recebem abaixo detalhamento funcional **confirmado para implementação futura**, sem mudança nas telas nesta execução. O documento revisado original permanece preservado; seus trechos “sem cadastro público livre” e “método final [...] definido na implantação” passam a ser lidos com D02. P11 está parcialmente resolvida quanto ao método, domínio e fluxo aqui detalhados. Na decisão D02, toda P12 permanecia pendente; a decisão posterior D03 abaixo resolve parte dela. O [PLANO_BLOCO_B.md](PLANO_BLOCO_B.md) define a sequência e as condições de avanço.

**Adendo posterior D03 — infraestrutura inicial e retenção, 13/09/2026:** [ADENDO_INFRAESTRUTURA_RETENCAO.md](ADENDO_INFRAESTRUTURA_RETENCAO.md). GitHub permanece escolhido para código, primeira instância paga do Render para a aplicação publicada do piloto e Supabase Free para autenticação, banco e arquivos, com desenvolvimento separado do piloto. A escolha não comprova contratação ou configuração. P12 passa a **parcialmente resolvida**; ambientes, envio de e-mails, responsáveis, destino/rotina de backup e exceções de preservação continuam pendentes. O alcance futuro de T09/T11/T12/T23 e A09/A15/A16 é detalhado abaixo, sem nova tela principal, alteração do protótipo ou teste operacional executado nesta rodada. D02 permanece válido.

## Referências de implementação

| Caminho | Responsabilidade no Bloco A |
| --- | --- |
| `src/app/page.tsx` | Entrada da rota `/`; renderiza `PrototypeApp`. |
| `src/app/components/prototype-app.tsx` | Estado, composição, navegação horizontal, contexto de módulo/obra, simulação local e integração dos componentes. |
| `src/app/components/prototype-workspace.tsx` | Painéis por perfil/contexto, lista/início de auditoria, ambiente administrativo e entradas de funções ainda indisponíveis. |
| `src/app/components/visit-agenda.tsx` | T05: formulário de visita de teste, consulta e reagendamento administrativo. |
| `src/app/components/audit-workspace.tsx` | T07 catálogo e T09 preenchimento, orientações e navegação por quesitos preservados. |
| `src/app/components/operational-views.tsx` | Consulta de obras e apontamentos; exemplos existentes preservados e adequados ao novo contexto. |
| `src/app/components/work-ranking.tsx` e `src/domain/work-ranking.ts` | Ranking das últimas auditorias por obra/roteiro, sem criação de pontuação e sem mistura de disciplinas. |
| `src/domain/prototype-access.ts` | Política demonstrativa central de acesso, contexto e agenda; não é autorização no servidor/banco. |
| `src/domain/prototype-audits.ts` | Criação/estado de registros demonstrativos e rascunhos independentes por auditoria/versão/item. |
| `src/domain/audit-draft.ts` | Respostas e observações por item, zero explícito e limites de navegação. |
| `src/domain/operational-records.ts` | Fontes compartilhadas de obras/auditorias demonstrativas e identificação dos modelos. |
| `src/domain/catalogs.ts` e `CATALOGO_SEGURANCA_IT07_R02.json` | Conteúdo documental preservado: Segurança IT.07 R02, F.175 e F.176. |

Os componentes e políticas acima existem e foram integrados no Bloco A. As verificações abaixo distinguem o funcionamento local observado das entregas operacionais ainda pendentes.

## Telas, responsabilidades e blocos

Legenda de perfis: AQ = Auditor de Qualidade; AS = Auditor de Segurança; EO/EC = Engenharia nas atuações Equipe da obra/Coordenação; AD = Administrativo. C† mantém consulta condicionada a concessão explícita. Ver [MATRIZ_ACESSOS.md](MATRIZ_ACESSOS.md) para as células e condições completas.

| ID / tela | Rota / componente relacionado | Perfil e limite principal | Fonte | Situação no recorte A | Bloco operacional | Teste associado |
| --- | --- | --- | --- | --- | --- | --- |
| **T01 — Entrar e Minha conta** | `/` · contexto em `prototype-app.tsx`; `ProfileSimulator` e entrada informativa em `prototype-workspace.tsx`. Subtelas futuras detalhadas em D02, sem novas rotas implementadas. | Conta individual: e-mail de domínio exato `dialogo.com.br` e senha própria da plataforma. Solicitação restrita ao domínio, confirmação de e-mail pelo serviço e aprovação administrativa obrigatória. Sem escolha livre de perfil. | §06 p.8; adendo posterior D02; P11 parcial. | Simulação local explícita dos quatro perfis e duas atuações de Engenharia; nenhum cadastro, login, senha, confirmação ou recuperação real implementados. | B. | A01/A02/A06 e casos futuros de D02; não executados nesta preparação. |
| **T02 — Escolher módulo e obra** | `/` · contexto em `prototype-app.tsx`, política em `prototype-access.ts`. | Módulos e obras autorizados; Administração é ambiente, não auditoria. | §06 p.8; Parte I §3/§10. | Contexto demonstrativo funcional. Trocas de perfil/módulo/obra preservaram registros separados nos testes. | A; proteção real B. | A01/A04/A13; `test:access`, `test:audit-context` e navegador. |
| **T03 — Painel de trabalho** | `/` · `prototype-workspace.tsx`; ranking existente. | Auditor: agenda e próprios rascunhos; EO/EC: resultados publicados e entregas; AD: manutenção e agenda. | §06 p.8; §19 p.21; D01. | Painéis demonstrativos por contexto. Contagens devem corresponder aos registros visíveis; ausência de nota permanece pendente. | A; indicadores operacionais B–E. | A01/A08; `test:ranking`. |
| **T04 — Obra e visão do histórico** | `/` · `operational-views.tsx` + entrada contextual em `prototype-workspace.tsx`. | Consulta conforme vínculo; edição cadastral pertence a T18. | §06 p.8. | Consulta das obras demonstrativas preservada; sem produção físico-financeira. | A; cadastro/histórico operacional B. | A01/A02/A13; filtros e obra sem registros. |
| **T05 — Agenda de visitas** | `/` · `visit-agenda.tsx`, política/agenda em `prototype-access.ts`. | **AD cria/reagenda; AQ/AS/EO consultam; EC somente C†.** Autor da agenda não é autor técnico da inspeção. | D01; §04 p.6; §07 p.9. | Criação/reagendamento e consultas funcionais em memória. Teste confirmou preservação da inspeção ao reagendar e EC com concessão em Horizonte, sem consulta em Jardim Norte. | A; persistência B; cancelamento P10. | D01: `test:access`, `test:audit-context` e navegador; A01/A04/A13. |
| **T06 — Lista de auditorias** | `/` · `prototype-workspace.tsx`, `prototype-audits.ts`; reaproveitamento do histórico demonstrativo. | Auditor retoma somente próprios rascunhos da disciplina; outras consultas conforme situação/obra/módulo. | §07 p.9; P09/P10. | Lista/retomada demonstrativas; dados antigos continuam exemplos, sem publicação presumida. | A; persistência/acesso real B. | A01/A02/A04/A13. |
| **T07 — Roteiros e critérios** | `/` · `Catalog` em `audit-workspace.tsx`, `catalogs.ts`. | Consulta por disciplina autorizada; manutenção em T20. Pesos respeitam perfil/modelo e P09. | §07 p.9; F1/F2/F3/F5. | Catálogos completos, busca, carregamento progressivo e orientações preservados. | A; revisão administrativa C. | A03; `verify:security`, `test:navigation`; consulta F.175/F.176. |
| **T08 — Iniciar auditoria** | `/` · `prototype-workspace.tsx`, criação em `prototype-audits.ts`. | Somente auditor autorizado da disciplina, com responsabilidade identificada. | §07 p.9; Parte I A.2.4. | Novo registro demonstrativo independente e vazio; AD/Engenharia não recebem início técnico pelo agendamento. | A; persistência B. | A01/A04/A05/A13. |
| **T09 — Preenchimento e evidências** | `/` · `NewAudit` em `audit-workspace.tsx`; `audit-draft.ts`/`prototype-audits.ts`. | Auditor responsável antes de publicar. EO somente acompanha discussão autorizada, sem edição. | §08 p.10; P01/P02/P06/P09. | Formulário/navegação preservados e adaptados ao registro. Anexos/medições não implementados permanecem indisponíveis; seleção não avança automaticamente. | A formulário; B arquivos; D validações finais. | A03/A04/A05; `test:navigation`; primeiro/último, busca/grupo, 0/5/10/N/A. |
| **T10 — Fechamento com a obra** | `/` · entrada indisponível em `prototype-workspace.tsx`. | Auditor conduz/ajusta; EO participa; EC não aprova nem participa do fechamento original. | §09 p.11; P05/P06/P09. | Entrada explicativa; mecanismo final de acordo indisponível. | D. | A07 pendente operacional. |
| **T11 — Conferência final e publicar** | `/` · entrada indisponível em `prototype-workspace.tsx`. | Auditor responsável; sem aprovação obrigatória de EC/AD. | §09 p.11; P01/P02/P05/P06. | Publicação definitiva indisponível; não criar nota final manual ou sucesso fictício. | D. | A07/A08/A09/A14/A15 pendentes operacionais. |
| **T12 — Relatório publicado / apontamentos** | `/` · `AuditPreview` e entradas indisponíveis em `prototype-workspace.tsx`; apontamentos em `operational-views.tsx`. | AQ/AS na disciplina, EO/EC na obra, AD C†; todos somente consulta do publicado. | §10 p.12; P09. | Prévia de identificação/apresentação demonstrativa verificada em mídia de impressão; não inclui respostas/anexos do rascunho e não gera documento emitido. Não há auditoria Publicada nos dados iniciais; apontamentos não oferecem baixa/reinspeção/encerramento. | D; documentos relacionados E. | A09/A10/A15 operacionais pendentes; prévia/limites verificados no navegador. |
| **T13 — Histórico para novas auditorias** | `/` · lista em `prototype-workspace.tsx` + `prototype-audits.ts`. | Consultas por modelo/versão/contexto; nova visita começa sem respostas copiadas. | §10 p.12. | Histórico demonstrativo preservado. Dois registros do mesmo modelo, outra obra e outro auditor foram verificados sem mistura de respostas. | A isolamento; B/D histórico operacional. | A04/A05/A13; `test:audit-context` e navegador. |
| **T14 — Elaborar e enviar plano** | `/` · entrada indisponível em `prototype-workspace.tsx`. | EO elabora/envia; AQ/AS/EC consultam; AD C†. Plano separado do relatório. | §11 p.13; P03/P04/P07. | Formulário definitivo/envio indisponíveis. Não aplicar 72h à Qualidade nem prometer AUTODOC. | E. | A11/A14/A15 pendentes. |
| **T15 — Avaliação do plano** | `/` · entrada indisponível em `prototype-workspace.tsx`. | EC registra parecer próprio; não reescreve plano nem atesta correção executada. | §11 p.13; P07. | Parecer operacional indisponível; nomes/estados ainda pendentes. | E. | A11/A14 pendentes. |
| **T16 — Apresentação / contrarrelatório** | `/` · entrada de Segurança em `prototype-workspace.tsx`. | EO prepara; AS/EC consultam; AD C†. Qualidade sem comitê. | §12 p.14; P01/P08/P09. | Materiais/envio indisponíveis. Regra futura somente para nota de Segurança publicada válida < 7; pendente não equivale a zero. | E. | A12 pendente operacional; verificar ausência no módulo Qualidade. |
| **T17 — Reunião e encaminhamentos** | `/` · entrada indisponível em `prototype-workspace.tsx`. | Editor de agenda/ata e composição ainda em P08. **D01 não concede edição de T17.** | §12 p.14; P08. | Reunião/ata indisponíveis; sem quinto perfil automático. | E. | A11/A12; teste de ausência de concessão presumida. |
| **T18 — Cadastro de obras** | `/` · ambiente administrativo em `prototype-workspace.tsx`; consulta existente em `operational-views.tsx`. | AD cadastra/atualiza/inativa; demais somente consulta conforme vínculos. | §13 p.15; P11. | Consulta das constantes existentes; manutenção não implementada fica indisponível e identificada. | B. | A01/A02/A10 pendentes operacionais. |
| **T19 — Usuários, perfis e vínculos** | `/` · ambiente administrativo em `prototype-workspace.tsx`; política demonstrativa em `prototype-access.ts`. Futura área: Administração → Usuários e acessos → Solicitações pendentes. | AD autorizado analisa somente solicitações com e-mail confirmado pelo serviço; aprova e define concessões por obra/módulo/atuação, recusa, revisa ou revoga acesso preservando autoria/histórico. Nunca vê ou cria outra senha para aprovar. | §13 p.15; adendo posterior D02; P10/P11 parcial. | Lista de identidades fictícias; fila, decisões, concessões persistentes e revogação real não implementadas. | B. | A01/A02/A06 e casos futuros de D02; reais pendentes, sem aprovação nesta preparação. |
| **T20 — Roteiros e versões** | `/` · ambiente administrativo em `prototype-workspace.tsx`; catálogo consultivo existente. | AD cria revisão futura; não sobrescreve versão usada. | §14 p.16; P10/P11. | Consulta documental preservada; revisão/ativação operacional indisponíveis. | C. | A03/A10; revisão persistente pendente. |
| **T21 — Pesos, medidas e regras** | `/` · ambiente administrativo/consulta técnica em `prototype-workspace.tsx`, dados em `catalogs.ts`. | AD mantém parâmetros; AQ/AS consultam área técnica; P09 refina visibilidade. | §14 p.16; P01/P02/P09. | Pesos existentes preservados, ausentes nulos. Sem fórmula arbitrária, nota livre ou cálculo oficial. | C/D. | A03/A08; parâmetros ausentes e modelos separados. |
| **T22 — Modelos de relatórios** | `/` · entrada administrativa indisponível em `prototype-workspace.tsx`; exemplo de layout existente. | AD revisa modelo para uso futuro; não redesenha emitidos. | §14 p.16; F1; P09. | Exemplo não equivale a editor/versionamento operacional. | C/D. | A10/A15 pendentes. |
| **T23 — Histórico de manutenção** | `/` · entrada administrativa indisponível em `prototype-workspace.tsx`. | AD consulta; AQ/AS C†; EO/EC sem acesso pela matriz. Nenhum perfil apaga trilha. | §05 p.7; §14 p.16; P09. | Histórico operacional protegido não implementado; não confundir memória da agenda com trilha persistente. | C; proteção/restauração B/F. | A02/A10/A16 pendentes operacionais. |

## D02 — detalhamento futuro de T01 e T19

**Situação conferida no código:** `ProfileSimulator` troca identidades fictícias; `DeferredScreen` apresenta Minha conta como indisponível; `AdministrativePanel` consulta constantes de teste. `prototype-app.tsx` mantém contexto e registros em estado React. A política de `prototype-access.ts` usa listas demonstrativas e verificações no cliente. Não há correspondência entre essas pessoas de teste e contas reais aprovadas. Os comportamentos a seguir são decisões/documentação, não funções concluídas nem testes realizados nesta execução.

### T01 — entrada e ações restritas de conta

As referências T01.1–T01.8 detalham T01 sem criar novas telas principais além de T01–T23. Organização de rotas e componentes será definida na implementação autorizada.

No planejamento, **B.1** entrega T01 com solicitação, confirmação, recuperação e sessão restrita à própria conta/solicitação, sem acesso operacional. O fluxo completo de entrada após liberação depende de **B.2**, que implementará T19, aprovação/recusa, revisão/revogação e concessões. B.1 isoladamente não torna o acesso operacional pronto; nenhuma dessas subetapas foi executada nesta preparação.

| Subtela futura | Conteúdo/ação confirmado | Limites e condição de acesso |
| --- | --- | --- |
| **T01.1 — Entrar** | E-mail corporativo e senha própria do Diálogo Auditorias. Após aprovação, usar a mesma senha criada no cadastro. | Não exige “Entrar com Microsoft”; senha independente da Microsoft. Resposta pública não revela a existência de uma conta. Identidade autenticada, confirmação do e-mail, aprovação, conta ativa e permissões vigentes são controles separados. |
| **T01.2 — Solicitar acesso** | Nome, e-mail corporativo, senha e confirmação da senha. | Aceitar somente formato válido e domínio exatamente `dialogo.com.br`, sem distinção de caixa no domínio, com validação no servidor e orientação no formulário. Sem subdomínios, correspondência por trecho ou equivalências inventadas ao retirar pontos/sufixos antes do `@`. Sem perfil efetivo ou lista corporativa de obras. Cargo/área e obra de referência são propostas com obrigatoriedade a validar; obra declarada não concede acesso. |
| **T01.3 — Confirmar e-mail / solicitar reenvio** | Solicitar confirmação no e-mail informado e oferecer reenvio sujeito aos controles do serviço autorizado. | Somente confirmação comprovada pelo serviço responsável permite entrada na fila administrativa; campo do navegador não comprova verificação. Links temporários e de uso único, com proteção contra tentativas/reenvios abusivos; prazos e limites numéricos ainda a definir. Não registrar tokens ou links completos nos logs. |
| **T01.4 — Acompanhar a própria solicitação** | Depois de autenticação adequada e e-mail confirmado, apresentar: **“E-mail confirmado. Aguardando liberação do Administrativo.”** | A pessoa pendente consulta somente a própria solicitação e ações restritas de conta previstas, sem dados operacionais nem solicitações de terceiros. “Aguardando aprovação” é situação de acesso, não um quinto perfil. O andamento particular não é exposto na entrada pública. |
| **T01.5 — Esqueci minha senha** | Solicitar recuperação ao serviço de autenticação autorizado. | Mensagem pública não revela se o funcionário possui conta. Proteção contra tentativas/reenvios abusivos; não enviar credenciais ao Administrativo. |
| **T01.6 — Definir nova senha por recuperação** | Usar o mecanismo seguro do serviço, com link temporário e de uso único. | Recuperação não aprova pedido, não reativa conta revogada e não eleva permissões. Senhas não ficam nos cadastros da aplicação, JSON, `localStorage`, logs, mensagens ou documentação. |
| **T01.7 — Minha conta** | Consultar/manter somente os próprios dados autorizados. | Não permite alterar o próprio perfil ou aprovação. Política detalhada para mudança posterior de e-mail permanece a validar: não poderá contornar nova verificação, domínio permitido ou controles administrativos. Não presumir campos editáveis adicionais. |
| **T01.8 — Sair** | Encerrar a sessão da aplicação pelo mecanismo autorizado. | Política de sessão deverá contemplar também revogação durante uma sessão aberta. Bloquear e-mail na Microsoft não revoga automaticamente esta aplicação independente. |

Não há liberação por domínio isoladamente. Nenhum novo cadastro pode sobrescrever senha, aprovação, permissões ou identidade de uma conta existente. A política consistente de comparação do e-mail inteiro e o tratamento operacional de repetições serão detalhados sem remover pontos/sufixos para unificar contas.

### T19 — solicitações pendentes, decisões e concessões

Entrada funcional futura: **Administração → Usuários e acessos → Solicitações pendentes**. A fila só recebe a solicitação após a confirmação de e-mail atestada pelo serviço. O Administrativo que decidir deve estar autenticado, com e-mail confirmado, aprovado, ativo e autorizado a administrar os acessos em questão; o nome de perfil recebido do navegador não basta.

Esta entrega pertence a **B.2**, após a preparação da identidade/sessão restrita em B.1 e conforme os pré-requisitos próprios do [PLANO_BLOCO_B.md](PLANO_BLOCO_B.md). Aprovação de usuário não antecipa persistência de agenda, rascunhos ou anexos das subetapas seguintes.

| Área/ação futura | Informação e resultado esperado | Controle e limite |
| --- | --- | --- |
| Solicitações pendentes | Nome, e-mail confirmado, informações declaradas, data da solicitação e data da confirmação. | Somente AD autorizado; solicitante não consulta a fila nem lista corporativa de obras antes de aprovação. Dados declarados são subsídio à análise, não concessões. |
| Aprovar e definir acessos | AD confere a pessoa e concede explicitamente perfil, obra, módulo e atuação/responsabilidade. | A aprovação é registrada sem gerar outra senha, revelar a existente ou pedir que a pessoa a envie. Bloquear autoaprovação e elevação de perfil. Não liberar operações fora das concessões vigentes. |
| Recusar solicitação | Registrar a decisão de recusa. | Quem decidiu e quando devem ser consultáveis pelo AD autorizado. Política de justificativa, nova solicitação após recusa e demais detalhes ainda dependem de definição, sem ciclo automático presumido. |
| Consultar decisões | Identificar o responsável e a data/hora da decisão de acesso. | Histórico preservado; acesso ao andamento particular do solicitante exige autenticação adequada e limita-se à própria solicitação. |
| Revisar permissões de liberados | Manter concessões explícitas por **combinação de obra, módulo e atuação/responsabilidade**. | Não formar novos acessos pelo produto de listas independentes. Acúmulo de funções exige concessão expressa; detalhes restantes de P11/P09 continuam pendentes. |
| Revogar acesso | Impedir acesso operacional, incluindo sessões anteriormente abertas, preservando autoria e histórico. | Revogação não apaga auditorias nem altera relatórios publicados. Recuperação de senha não reverte revogação. Mecanismo e parâmetros técnicos de invalidação de sessão ainda dependem do serviço autorizado. |

Continuam quatro perfis: Auditor de Qualidade, Auditor de Segurança, Engenharia e Administrativo. Engenharia distingue Equipe da obra e Coordenação. O primeiro Administrativo será designado por procedimento controlado, jamais pelo primeiro cadastro. Responsáveis pelo procedimento e pela configuração permanecem pendentes. Aprovar uma conta **não é aprovar uma auditoria** e não cria alçada administrativa de publicação.

### Validação futura e condições de avanço

Os casos abaixo são **planejados, não executados nem aprovados nesta atualização documental**. Cada tentativa deverá ser verificada na interface e no servidor/acesso aos dados, incluindo URLs, APIs e arquivos quando esses recursos existirem; ocultar um menu não satisfaz o teste.

| Caso futuro | Resultado esperado |
| --- | --- |
| Domínio e formato | Rejeitar formatos inválidos, domínio diferente, subdomínio e endereço que apenas contenha o texto permitido; comparar domínio sem caixa e preservar pontos/sufixos da parte local. Nenhuma mensagem enviada a destinatário fictício. |
| E-mail não confirmado | Impedir entrada na fila de liberação e acesso operacional; adulteração do estado no navegador não confirma o e-mail. |
| Aguardando aprovação | Exibir somente o andamento próprio após autenticação adequada, sem obras/dados operacionais ou pedidos de terceiros. |
| Aprovação autorizada | Somente AD com autorização vigente decide e concede acessos; registrar quem e quando. |
| Senha inicial | Após liberação, a pessoa entra com a senha criada no cadastro, sem intervenção do AD na senha. |
| Autoaprovação / elevação | Bloquear aprovação própria, permissões manipuladas pelo navegador e ampliação por concessões independentes. |
| Isolamento | Concessão para obra A/Qualidade não autoriza obra B/Qualidade nem obra A/Segurança sem concessão explícita correspondente; responsabilidades de D01 e autoria de rascunho permanecem. |
| Recuperação | Recuperar senha preserva aprovação, situação ativa/revogada e permissões; respostas públicas não revelam existência da conta. |
| Revogação | Conta revogada com sessão anteriormente aberta perde acesso operacional e direto; autoria/histórico permanecem. |
| Repetição / concorrência | Solicitações repetidas não duplicam indevidamente registros nem sobrescrevem conta, senha, aprovação ou concessões existentes. |
| Confirmação / recuperação | Links expirados, reutilizados ou adulterados são rejeitados; reenvios e tentativas abusivos são controlados; tokens/links completos ausentes de logs. |

P11 está **parcialmente resolvida**: método e domínio definidos, com fluxo confirmado em D02; campos finais, detalhes de múltiplas funções e responsáveis técnicos ainda dependem de decisão. **Situação histórica de D02:** P12 permanecia não resolvida e Supabase era uma possibilidade. **Atualização posterior D03:** Supabase Free foi escolhido para autenticação, banco e arquivos; P12 está parcialmente resolvida. A escolha não declara serviços contratados/configurados. Envio de e-mails, remetente autorizado, configuração dos ambientes, responsáveis, destino/rotina de backup e detalhes de preservação permanecem pendentes. Permitir usuários de `dialogo.com.br` não autoriza envio em nome desse domínio; nenhum remetente oficial é inventado aqui.

D01 segue intacta: AD agenda/reagenda e o auditor realiza suas inspeções; T17 continua P08. D02 não habilita cálculo oficial, publicação de relatórios, aprovação de auditoria, edição/reabertura/retificação/recálculo de publicado ou qualquer avanço automático de bloco. As evidências de testes do Bloco A abaixo são históricas e têm somente o alcance já registrado.

## D03 — alcance futuro da retenção nas telas e verificações

**Diferença em relação à fonte original:** as regras de preservação do conteúdo/arquivos emitidos, a vedação “Apagar evidência de relatório publicado” e A09 permanecem transcritas como histórico do escopo original. D03 estabelece uma exceção posterior exclusivamente para a **cópia fotográfica avulsa**. Não concede remoção manual a qualquer perfil nem permite editar, reabrir, retificar, recalcular, substituir ou excluir o relatório/PDF publicado e seus dados estruturados.

O prazo é **data/hora de publicação concluída, registrada pelo servidor, + 30 dias corridos**. Upload, visita e início do mês seguinte não iniciam a contagem. Fotos de rascunhos ou sem publicação concluída não entram nessa rotina. Planos, apresentações e outras categorias de documento não são incluídos automaticamente.

| Tela existente | Detalhamento futuro de D03 | Bloco e limite |
| --- | --- | --- |
| **T09 — Preenchimento e evidências** | Preservar vínculo de fotografia com auditoria, versão e item, distinguindo sua categoria e outros vínculos. Respostas, notas, observações, medições, versões e vínculos continuam preservados. Não calcular prazo de retenção pelo upload nem pelo rascunho. | B.5 prepara arquivos privados e metadados; não ativa remoção nem publicação. Anexos continuam não implementados no protótipo atual. |
| **T11 — Conferência final e publicar** | Registrar no servidor o instante da publicação concluída; salvar PDF definitivo com todas as imagens incorporadas, legíveis e associadas aos itens corretos. O PDF deve ser consultável sem depender de links das fotografias avulsas. | D, condicionado aos bloqueios já existentes de publicação. D03 não resolve P01/P02/P05/P06 nem antecipa emissão em B.1. |
| **T12 — Relatório publicado / apontamentos** | Após remoção autorizada da cópia avulsa, informar que a imagem permanece no relatório e oferecer acesso ao PDF original conforme as concessões vigentes. Não apresentar link quebrado nem reconstruir o PDF a partir do arquivo removido. | D prepara consulta; execução futura de retenção depende também das condições de F. Relatório e dados estruturados não são alterados pela limpeza. |
| **T23 — Histórico de manutenção** | Planejar registro separado de execução, resultado e pendências da rotina, sem modificar o conteúdo imutável da auditoria/PDF ou apagar trilhas. Detalhar acesso de consulta e responsável operacional antes da implementação, sem ampliar a matriz de perfis por inferência. | F detalha backup, simulação e eventual operação autorizada; nenhuma ação de limpeza é disponibilizada em T23 agora. |

A remoção futura depende **cumulativamente** de 30 dias completos; PDF definitivo salvo, íntegro e legível; confirmação de incorporação da foto no item correto; cópia de segurança do PDF confirmada; ausência de bloqueio de preservação; ausência de outros vínculos que exijam manter o arquivo. Se qualquer condição falhar ou não puder ser confirmada, preservar a fotografia e registrar a pendência. Falta de espaço não autoriza descartar as proteções.

**Proposta de validação futura:** simular a seleção e o resultado da limpeza sem excluir arquivos antes de habilitar execução real. A fase F deverá validar a simulação, recuperação e condições de operação; qualquer execução real exigirá autorização expressa posterior. Não existe rotina, agendamento ou simulação de limpeza implementada/executada nesta atualização documental.

| Aceite preservado da fonte | Complemento futuro decorrente de D03, sem aprovação agora |
| --- | --- |
| **A09 — Relatório imutável** | Conferir que a exceção só remove a cópia avulsa elegível e não altera resposta, nota, identidade, imagem incorporada, dados estruturados ou PDF. Tentativas manuais por perfil continuam bloqueadas. |
| **A15 — Documento emitido** | Conferir todas as imagens incorporadas, vínculo ao item correto, integridade e legibilidade do PDF sem acesso às fotos avulsas; consulta posterior oferece o original protegido, sem links quebrados. |
| **A16 — Recuperação** | Confirmar a cópia de segurança do PDF e testar recuperação com imagens incorporadas, dados estruturados, vínculos e limites de acesso; contemplar registros da retenção e preservar avulsas sob bloqueio ou com outros vínculos. Destino/rotina de backup ainda dependem de definição. |

## Aceites A01–A16 e alcance das evidências

Os IDs e resultados esperados vêm integralmente da seção 22, página 24. **Nenhum aceite de piloto é aprovado por mera adequação visual, existência de componente, compilação ou simulação.** A coluna de situação registra a evidência do Bloco A; testes de banco, arquivos privados, publicação e restauração permanecem pendentes.

| ID | Resultado esperado da fonte | Telas | Blocos | Situação/evidência necessária |
| --- | --- | --- | --- | --- |
| **A01 — Separação de módulos** | AQ não edita Segurança; AS não edita Qualidade; Engenharia só acessa suas obras. | T02–T09/T19. | A demonstrativo; B operacional. | **Passou no protótipo:** política, contexto e navegador; EO sem iniciar/editar, AD sem formulário técnico, AQ/AS separados. Isolamento real no servidor/banco permanece pendente. |
| **A02 — Acesso direto** | URL, pesquisa, arquivo e exportação não contornam as permissões. | T01/T04/T06/T09/T12/T19/T23. | B/D/F. | Pendente operacional: sem autenticação/banco/arquivos privados/exportações protegidas. Navegação `/` por estado não comprova esse aceite. |
| **A03 — Catálogo íntegro** | Conferir 205 códigos/textos de Segurança e orientações; preservar F.175/F.176, sem perguntas genéricas. | T07/T09/T20/T21. | A; regressão C/F. | **Passou na conferência local:** `verify:security` (205 itens, 27 grupos, 37 subgrupos, textos/orientações), `test:navigation` e navegador para 205/10/23 e orientação continuada pp.18–19. Não representa aprovação técnica das fontes. |
| **A04 — Respostas independentes** | Responder dois itens, navegar e voltar sem perder/misturar notas, observações, medições ou anexos. | T02/T08/T09/T13. | A respostas; B medições/arquivos. | **Passou para respostas/observações locais:** dois itens, dois registros do mesmo modelo, troca de obra e outro auditor; `test:navigation`, `test:audit-context` e navegador. Medições/anexos não implementados permanecem pendentes. |
| **A05 — Sem resposta automática** | Nova auditoria inicia vazia; zero escolhido é mantido; N/A e não respondido não são equivalentes. | T08/T09/T13. | A; regressão B/D. | **Passou no protótipo:** novo registro vazio; 0/5/10/N/A e não respondido distintos; seleção sem avanço automático. Evidência em domínio e navegador. |
| **A06 — Persistência** | Após confirmação de salvamento, recarregar e entrar novamente recupera rascunho e arquivos. | T01/T08/T09/T14/T16. | B/F. | **Pendente:** memória React não satisfaz recuperação entre sessões/aparelhos. |
| **A07 — Fechamento correto** | Auditor discute com a obra e publica sem aprovação obrigatória do coordenador. | T10/T11. | D. | **Pendente:** P05/P06 e metodologia; ausência de aprovação de EC/AD pode ser conferida no desenho, não prova emissão. |
| **A08 — Cálculo validado** | Casos de referência corretos; parâmetro ausente não gera nota; não usar fórmula genérica substituta. | T03/T09/T11/T21. | A bloqueios; C/D cálculo. | **Passou somente o limite local:** pesos ausentes/nota pendente preservados, Qualidade sem escala de Segurança. Cálculo oficial e casos metodológicos permanecem pendentes em P01/P02. |
| **A09 — Relatório imutável** | Nenhum perfil altera resposta, nota, identidade ou foto após publicar, inclusive por acesso direto. | T11/T12/T19–T23. | B/D/F. | **Pendente operacional:** política de bloqueio passou com registro fictício isolado de teste. Dados iniciais não contêm Publicada; não houve publicação no navegador nem comprovação em banco/arquivos. |
| **A10 — Revisão sem retroatividade** | Atualizar obra, usuário, roteiro, pesos e layout não muda documento já publicado. | T12/T18–T23. | C/D/F. | **Pendente:** versões administrativas e documento emitido preservado não operacionais. |
| **A11 — Plano separado** | Enviar plano/parecer não altera o relatório; a entrega não marca automaticamente todos os itens como corrigidos. | T12/T14–T17. | E/F. | **Pendente operacional:** planos/pareceres/apresentações oficiais indisponíveis. Ausência de baixa/reinspeção/aprovação geral das correções conferida no protótipo. |
| **A12 — Regra do comitê** | Segurança 6,99 encaminha; 7,00 não encaminha por nota; pendente não compara; Qualidade não encaminha. | T03/T16/T17/T21. | D/E; isolamento de módulo A. | **Pendente operacional:** navegador confirmou Qualidade sem comitê. Encaminhamento automático 6,99/7,00 não implementado/testado; P01 deve resolver arredondamento antes da automação. |
| **A13 — Nova visita** | Relatório anterior consultável; respostas da nova auditoria permanecem independentes. | T05/T06/T08/T09/T13. | A independência; B/D histórico real. | **Passou para registros locais:** novo registro vazio, dois rascunhos do mesmo modelo e inspeção preservada após reagendar visita. Consulta de original emitido real permanece pendente. |
| **A14 — Falha e duplicidade** | Falha de envio é informada; repetição não duplica auditoria, plano ou apresentação. | T08/T11/T14/T16. | B/D/E/F. | **Pendente operacional:** não há envio persistente e concorrência implementados. Não simular sucesso externo. |
| **A15 — Documento emitido** | PDF e anexos correspondem ao publicado; F.175 não exibe pesos; páginas e fotos legíveis. | T11/T12/T14/T22. | D/E/F. | **Pendente:** exemplo com `window.print()`/CSS de impressão não é geração e preservação do original emitido nem validação de fotos/PDF. |
| **A16 — Recuperação** | Backup restaurado em teste conserva relatórios, anexos, vínculos e limites de acesso. | T12/T18–T23 e armazenamento. | B/F. | **Pendente:** backup/restauração não implementados; configuração em P12. |

## Verificações executadas no Bloco A

Resultados consolidados a partir da execução de integração; não são testes de produção:

| Verificação | Resultado e alcance |
| --- | --- |
| `npm.cmd run test:access` | **Passou — 16/16.** Política demonstrativa, disciplinas, autoria, D01, consultas condicionais e bloqueios. |
| `npm.cmd run test:audit-context` | **Passou — 15/15, inclusive na rodada final.** Registros independentes, contexto/versão/item, dados vazios e restrições de edição. |
| `npm.cmd run test:ranking` | **Passou — 14/14 na rodada final.** Seleção/ordenação por obra e modelo, valores nulos/zero, empates, preservação dos dados e guarda de situação Publicada. Os resultados dos testes não são notas adicionadas aos dados demonstrativos. |
| `npm.cmd run verify:security` | **Passou.** 205 itens, 27 grupos, 37 subgrupos e textos/orientações conferidos contra a fonte integrada. |
| `npm.cmd run test:navigation` | **Passou.** Limites, respostas independentes, zero, não respondido e separação de modelos. |
| `npm.cmd run lint` | **Passou, inclusive na rodada final.** Sem reprovação de ESLint. |
| `npx.cmd tsc --noEmit` | **Passou.** Tipos verificados. |
| `npm.cmd run build` | **Passou, inclusive na rodada final.** Compilação de produção e TypeScript; não é deploy. |
| `node .tmp/visual-qa/check-block-a.cjs` | **Passou, inclusive na rodada final.** Verificação de navegador no servidor local existente, com desktop e largura de 390 px. Alcance descrito a seguir. |

O teste de navegador verificou quatro perfis e duas atuações de Engenharia; AD cria/reagenda e demais consultam; AD sem formulário técnico e EO sem iniciar/editar; EC com agenda concedida em Horizonte e negada em Jardim Norte; independência entre dois registros do mesmo modelo, outra obra e outro auditor; preservação da inspeção ao reagendar.

No preenchimento, verificou 5/10 com observações próprias, zero, N/A, não respondido, primeiro/último item, busca/grupo e orientação continuada nas páginas 18–19. Qualidade manteve F.175 com 10 itens e F.176 com 23, sem escala nem comitê de Segurança. Conferiu prévia em mídia de impressão e quatro perfis a 390 px sem transbordamento horizontal da página. Foram inspecionadas capturas de agenda no desktop, agenda no celular e preenchimento no celular.

**Não executados/não comprovados:** autenticação, permissões em servidor/banco/arquivos, persistência, anexos, cálculo oficial, publicação real, documento emitido imutável, planos/comitê operacionais, backup, piloto e impressão física. A política Publicada usa apenas um registro fictício isolado nos testes; não existem auditorias Publicada nos dados iniciais. A pasta `.tmp` contém evidência temporária, não backup de auditorias nem evidência versionada garantida.

## Roteiro para repetir a conferência do Bloco A

1. **D01:** AD cria visita de teste e altera data; comparar antes/depois e autoria administrativa. AQ/AS/EO só consultam; EC sem concessão não recebe acesso geral à agenda. Agendar não oferece preenchimento técnico a AD.
2. **Contexto e autoria:** AQ inicia somente Qualidade; AS somente Segurança; rascunho atribuído a outro auditor permanece inacessível para edição. Alternar perfil, módulo, obra e registro não transfere respostas.
3. **T07/T09:** manter 205 itens de Segurança, 10 de F.175 e 23 de F.176; orientações completas e busca. No 01.01.01 registrar 5 e observação A, no 01.01.02 registrar 10 e observação B; retornar e conferir. Testar também 0, N/A e não respondido, primeiro/último item e salto de grupo.
4. **Limites:** nenhum atalho para publicar com pendências, editar/reabrir publicado, aprovar publicação por EC/AD, dar baixa/reinspecionar correções ou ativar comitê de Qualidade. C† e P08/P09 não viram permissões gerais.
5. **Interface:** conferir desktop e largura de celular, contexto sempre visível, controles legíveis, navegação com orientações longas e ausência de sobreposição.
6. **Verificações técnicas:** executar `npm.cmd run verify:security`, `npm.cmd run lint`, `npx.cmd tsc --noEmit`, `npm.cmd run build` e testes existentes/novos pertinentes. Preservar o servidor já ativo; conflito que exija interrupção precisa de autorização.

O encerramento e a rodada final estão consolidados em [DIAGNOSTICO_ESCOPO_REVISADO.md](DIAGNOSTICO_ESCOPO_REVISADO.md) e [RETOMADA.md](RETOMADA.md). O próximo bloco sugerido é B, sujeito à autorização/configuração próprias; **não foi executado**. A execução termina após o Bloco A, para conferência do usuário sobre telas, acessos e D01. O piloto não está aprovado.
