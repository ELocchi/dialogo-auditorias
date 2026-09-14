# Adendo D02 — cadastro, autenticação e liberação de acesso

> **Aviso posterior — 13/09/2026:** o [D03 — Infraestrutura inicial e retenção](ADENDO_INFRAESTRUTURA_RETENCAO.md) escolheu GitHub para código, primeira instância paga do Render para a aplicação publicada do piloto e Supabase Free para autenticação, banco e arquivos, com desenvolvimento separado do piloto. P12 está agora parcialmente resolvida. As menções abaixo a fornecedor ainda possível e P12 pendente preservam a situação histórica da redação de D02; não descrevem a escolha atual. D02 continua vigente para domínio exato `dialogo.com.br`, senha própria, confirmação do e-mail e aprovação administrativa. Escolha não comprova contratação/configuração; envio/remetente, ambientes, responsáveis, backup e demais detalhes indicados em D03 permanecem pendentes. Não solicitar novamente método, domínio ou provedor.

Data do registro: 12/09/2026. Fonte: definição consolidada enviada pelo responsável pelo projeto nesta conversa, posterior à preparação inicial do Bloco B. **Decisão de escopo confirmada, ainda não implementada.** Esta execução altera somente documentação.

## 1. Precedência e estado verificado

Este adendo detalha T01 e T19 do [escopo revisado original](../PROMPT_DIALOGO_AUDITORIAS_ESCOPO_REVISADO.md), especialmente Parte II, seções 06/13 e P11/P12 da seção 21. O original permanece intacto. O histórico anterior deve ser lido à luz deste adendo para cadastro/autenticação; ele não altera as atribuições das auditorias nem substitui D01.

| Antecedente | Decisão posterior vigente |
| --- | --- |
| Método de autenticação a definir; alternativas citadas no plano inicial do B. | E-mail corporativo + senha própria do Diálogo Auditorias. Não depende de “Entrar com Microsoft”. Não solicitar novamente a escolha do método ou do domínio. |
| “Sem cadastro público livre”. | Solicitação de acesso restrita ao domínio, com confirmação de e-mail e aprovação administrativa obrigatória. Não há liberação automática nem escolha livre de perfil. |
| Administrativo cria/mantém contas em T19, sem detalhar a origem da senha. | Solicitante cria sua senha no cadastro; AD analisa e libera acessos sem conhecer, recriar ou pedir essa senha. |
| P11 inteiramente pendente. | P11 parcialmente resolvida: método, domínio e fluxo de solicitação/confirmar/aprovar definidos. Responsáveis técnicos e demais detalhes permanecem pendentes. P12 continua pendente. |

A leitura de `package.json`, da estrutura de `src`, de `prototype-access.ts`, `prototype-app.tsx` e da interface de simulação confirmou: seis identidades fictícias, seleção de perfil no cliente, visitas/rascunhos em memória; sem autenticação real, integração Microsoft, banco, API de gravação ou arquivos privados. Configuração local das integrações não identificada; situação pendente. Nenhuma integração existente foi removida. Serviços externos eventualmente mantidos pela empresa não foram consultados. Nenhum valor de configuração, senha, token ou chave foi exposto.

## 2. Método e domínio confirmados

**Entrada:** e-mail corporativo + senha própria do Diálogo Auditorias, criada pelo usuário durante o cadastro. A senha é independente da senha Microsoft. Depois da aprovação administrativa, a mesma senha continua válida; aprovação não é troca nem recuperação de senha.

**Domínio permitido:** `dialogo.com.br`, exatamente. Requisitos futuros:

- Validar formato apropriado de endereço no servidor e orientar no formulário. Validação de interface sozinha não autoriza a solicitação.
- Extrair o domínio do endereço validado e compará-lo sem diferenciar maiúsculas/minúsculas. Subdomínios e outros domínios não são aceitos por analogia.
- Não usar busca por trecho: conter `dialogo.com.br` na parte anterior ao `@` ou dentro de outro domínio não atende à regra.
- Aplicar uma política consistente de comparação de e-mails no cadastro, entrada, confirmação, recuperação e prevenção de duplicidade. Não remover pontos ou sufixos da parte anterior ao `@` para inventar equivalências entre contas. O tratamento adicional da parte local, inclusive caixa, deve ser compatibilizado com o serviço escolhido e documentado antes da implementação; não inferir equivalências.
- Domínio válido permite solicitar, mas não concede acesso aos dados. Continuam necessários confirmação pelo serviço, aprovação administrativa, conta ativa e concessões vigentes.

O domínio dos usuários **não autoriza enviar mensagens em nome de `dialogo.com.br`**. Provedor de envio, remetente e autorização de uso ainda serão definidos; este documento não inventa um endereço remetente.

## 3. Fluxo confirmado

| Passo | Ação e resultado esperado | Controle obrigatório |
| --- | --- | --- |
| A — Solicitar acesso | Informar nome, e-mail corporativo, senha e confirmação da senha. Cargo/área e obra de referência são propostas de apoio à análise, com obrigatoriedade a validar. | Sem seleção de permissões efetivas. Obra declarada é referência, não vínculo concedido. Não expor lista corporativa de obras ao solicitante antes da aprovação. Solicitação nova não sobrescreve conta existente. |
| B — Confirmar e-mail | Serviço autorizado envia confirmação ao endereço informado e valida sua conclusão. | Confirmação é evidência do serviço vinculada à identidade/e-mail; não é campo alterável pelo navegador. Sem dados operacionais enquanto não cumprir os demais controles. |
| C — Aguardar aprovação | Somente após confirmação, solicitação aparece na fila de liberação de T19. Pessoa autenticada acompanha a própria solicitação. | Mostrar exatamente: **“E-mail confirmado. Aguardando liberação do Administrativo.”** Permitir somente acompanhamento próprio e ações restritas de conta; não liberar obras, agenda, auditorias, arquivos ou diretório de pessoas. |
| D — Aprovação administrativa | AD autorizado confere o solicitante e define acessos. Registrar quem decidiu e quando. | AD não vê, recria ou solicita a senha. Autoria/horário da decisão vêm de fonte protegida. Solicitante não pode aprovar a si mesmo, definir perfil ou forjar liberação. |
| E — Entrada após liberação | Entrar com e-mail e a senha criada no cadastro. | Disponibilizar somente módulos, obras, telas e ações expressamente autorizados. Aprovação não concede automaticamente todas as obras ou disciplinas. |

“Aguardando aprovação” é situação de acesso, não quinto perfil. Permanecem Auditor de Qualidade, Auditor de Segurança, Engenharia e Administrativo; dentro de Engenharia, Equipe da obra e Coordenação. Concessões consideram combinações específicas de obra, módulo e atuação, além da responsabilidade pelo registro. Não gerar permissões pelo cruzamento de listas independentes.

## 4. T01 e T19 — detalhamento funcional futuro

Os nomes abaixo detalham as telas existentes no mapa do escopo; não indicam rotas ou formulários já implementados. Situação de todas as entregas operacionais: **planejada**. Ver também [MAPA_TELAS.md](MAPA_TELAS.md).

| T01 — subtela | Conteúdo/ação prevista | Limite |
| --- | --- | --- |
| Entrar | E-mail corporativo e senha da plataforma; encaminhar conforme situação verificada. | Resposta pública não revela se determinado funcionário tem conta. Não oferecer seleção de perfil efetivo nem exigir login Microsoft. |
| Solicitar acesso | Nome, e-mail, senha e confirmação; orientações de domínio. | Cargo/área e obra de referência só conforme detalhamento aprovado; não consultar lista corporativa de obras. |
| Confirmar e-mail e solicitar reenvio | Confirmação pelo serviço responsável; reenvio controlado. | Link temporário/de uso único; não confiar em flag do cliente; respostas públicas sem enumeração de contas. |
| Acompanhar a própria solicitação | Situação particular e mensagem confirmada do passo C. | Autenticação adequada e acesso apenas à própria solicitação, sem dados operacionais. Não expor dados de outro solicitante por troca de ID. |
| Esqueci minha senha | Solicitar recuperação pelo mecanismo seguro do serviço. | Mensagem pública não confirma existência de conta nem informa aprovação/recusa/revogação. |
| Definir nova senha por recuperação | Estabelecer nova senha após validar link temporário/de uso único. | Não aprova solicitação, reativa acesso revogado nem amplia permissões. |
| Minha conta e Sair | Identificação própria, ações de conta permitidas e encerramento da sessão. | Não editar perfil/aprovação/concessões. Política de mudança de e-mail ainda será validada, sem contornar domínio, verificação ou controles administrativos. |

**T19:** Administração → Usuários e acessos → Solicitações pendentes. A fila de liberação inclui somente solicitações cujo e-mail foi confirmado pelo serviço. Mostrar nome, e-mail confirmado, informações declaradas, data da solicitação e data da confirmação, respeitando o acesso administrativo autorizado.

| Ação T19 | Resultado previsto | Limite |
| --- | --- | --- |
| Aprovar e definir acessos | Liberação registrada com concessões específicas. | Sem alterar senha; operação de decisão/concessão deve ser consistente e confirmada, sem liberação parcial indevida em falha. |
| Recusar solicitação | Registrar decisão, autor e horário; não liberar dados operacionais. | Política de novo pedido/reanálise após recusa permanece detalhe a validar. Não apagar conta/histórico por suposição. |
| Consultar quem decidiu e quando | Consultar trilha da decisão autorizada. | Identidade/horário não são controlados pelo solicitante; sem comando para apagar trilha. |
| Revisar permissões dos liberados | Atualizar concessões explícitas, preservando autoria/histórico. | Não transformar revisão de conta em aprovação de auditoria ou acesso irrestrito ao conteúdo técnico. |
| Revogar acesso | Impedir uso operacional, inclusive em sessão anteriormente aberta, preservando autoria/histórico. | Recuperação de senha não reativa a conta. O efeito em sessões da aplicação deve ser implementado/testado, não inferido de bloqueio na Microsoft. |

## 5. Controles separados de acesso

Validar separadamente **identidade autenticada, e-mail confirmado, aprovação administrativa, conta ativa e permissões vigentes**. Para cada operação protegida, avaliar esses controles no servidor e no acesso aos dados, considerando obra, módulo, atuação, responsabilidade e situação do registro. Aplicar também em URLs diretas, APIs, pesquisas, totais, arquivos, prévias e futuras exportações. Login ou domínio permitido, isoladamente, não atende a esses controles.

O acompanhamento da própria solicitação é uma exceção de alcance limitado às ações de conta previstas: identidade adequadamente autenticada, somente seu próprio registro e sem conteúdo operacional. A página pública não deve revelar situação particular. Solicitações não confirmadas não entram na fila administrativa de liberação; falha ou ausência de comprovação confiável mantém o bloqueio.

Requisitos confirmados para implementação futura:

- Usar o mecanismo seguro do serviço de autenticação autorizado. Não guardar senhas ou confirmações de senha em cadastros da aplicação, JSON, armazenamento local do navegador, logs, mensagens ou documentação. AD nunca poderá visualizá-las.
- Links de confirmação e recuperação temporários, de uso único e protegidos contra tentativas/reenvios abusivos. Prazos, limites e política de senha serão detalhados com o serviço, sem inventar valores agora. Logs não contêm tokens ou links completos de confirmação/recuperação.
- Respostas públicas de entrada/recuperação e comportamentos de cadastro/reenvio devem evitar revelar existência de conta. Detalhes particulares somente após autenticação adequada. Plano de testes deve considerar resposta e comportamento observável, não apenas o texto da tela.
- Repetir uma solicitação ou processar duas ao mesmo tempo não cria duplicidade nem sobrescreve conta, senha, aprovação ou permissões existentes. A decisão administrativa também deve resistir a reenvio e concorrência. O comportamento detalhado de reapresentação após recusa continua a validar.
- Primeiro Administrativo designado por procedimento controlado, com responsável e rastreabilidade. Nunca tornar o primeiro cadastro administrador. O procedimento inicial ainda precisa ser definido; a exceção de implantação não permite contornar domínio/identidade verificada ou conceder acesso por sorte de ordem de cadastro.
- Revogar acesso deve alcançar sessões abertas. Planejar a revalidação das autorizações e o encerramento/invalidação necessários no serviço/aplicação. Não presumir sincronização de revogação com Microsoft, pois a senha e a sessão são independentes.
- Recuperação de senha muda somente a credencial correspondente: não aprova, reativa ou promove. Mudança posterior de e-mail não pode contornar confirmação, domínio ou decisões administrativas; política detalhada ainda pendente.

## 6. Testes futuros — nenhum executado ou aprovado nesta rodada

Os identificadores D02-Txx são cenários deste adendo, não substituem os aceites A01–A16 do escopo. Dados sintéticos de validação de formato/domínio devem usar teste sem entrega de mensagens. Para teste real de envio, usar somente caixas corporativas existentes, controladas e explicitamente autorizadas. **Não enviar e-mail a endereços fictícios.**

| ID | Cenário futuro | Resultado esperado | Planejamento |
| --- | --- | --- | --- |
| D02-T01 | Endereço válido com domínio exato em caixa diferente. | Comparação de domínio ignora caixa; formato válido é necessário; domínio não libera dados sozinho. | B.1; não executado. |
| D02-T02 | Outro domínio, subdomínio, domínio que apenas contém o texto permitido, texto na parte local e formatos inválidos. | Solicitação recusada pelo servidor; não depender de bloqueio no formulário. | B.1; não executado. |
| D02-T03 | Endereços com pontos/sufixos na parte local; variações segundo política de comparação aprovada. | Sem remoções ou equivalências inventadas; comportamento consistente entre cadastro/entrada/duplicidade. | B.1; não executado. |
| D02-T04 | E-mail não confirmado; tentativa de forjar confirmação pelo cliente. | Sem fila de liberação e sem dados operacionais; somente confirmação validada pelo serviço muda a condição. | B.1/B.2; não executado. |
| D02-T05 | Pessoa autenticada e confirmada, ainda pendente. | Mensagem exata do passo C; consulta somente da própria solicitação; acesso direto a dados/obras/arquivos de operação negado. | B.1/B.2; não executado. |
| D02-T06 | AD autorizado aprova e define concessões; falha intermediária na gravação. | Decisão e acessos coerentes, quem/quando preservados; nenhuma liberação indevida antes de confirmação. | B.2; não executado. |
| D02-T07 | Entrada após aprovação. | Usa a senha criada no cadastro; aprovação não cria/troca/revela senha. Senhas nunca registradas nos artefatos de teste. | B.2 integrado com B.1; não executado. |
| D02-T08 | Autoaprovação, alteração de perfil pelo cliente, decisão por não AD e primeiro cadastro. | Bloqueios no servidor/dados; primeiro cadastro sem privilégio automático. | B.1/B.2; não executado. |
| D02-T09 | Conta liberada com combinações diferentes de obra/módulo/atuação e responsabilidades. | Sem cruzamento de listas ou acesso direto a outra obra/disciplina/rascunho; C† continua específico. | B.2–B.6; não executado. |
| D02-T10 | Recuperação por conta pendente, recusada, ativa ou revogada. | Credencial redefinida somente com validação; aprovação, atividade/revogação e permissões não mudam. | B.1/B.2; não executado. |
| D02-T11 | Revogar conta que já possui sessão aberta; simular bloqueio externo Microsoft sem integração. | Revogação desta aplicação impede próxima operação protegida conforme desenho testado; não presumir efeito do bloqueio Microsoft. | B.2/B.6; não executado. |
| D02-T12 | Solicitações repetidas/concorrentes para a mesma identidade. | Sem duplicação ou sobrescrita de senha, conta, decisão ou concessões; sem revelar existência publicamente. | B.1/B.2; não executado. |
| D02-T13 | Link expirado, reutilizado, inválido; tentativas/reenvios abusivos. | Operação recusada/limitada; nenhum token ou link completo aparece nos logs; nenhum envio a endereço fictício. | B.1; não executado. |
| D02-T14 | Consultar entrada/recuperação/cadastro para conta existente e inexistente. | Resposta/comportamento público não revela se o funcionário possui conta; andamento privado exige autenticação adequada. | B.1; não executado. |
| D02-T15 | Recusar, consultar decisão, revisar e revogar; tentar obter solicitação de outra pessoa. | Trilha preservada e consulta limitada; recusa não libera acesso; novo pedido não apaga decisão anterior. | B.2; não executado. |
| D02-T16 | Recuperar registros confirmados em nova sessão; falha de serviço/envio. | Solicitação/decisão persistem; confirmação de e-mail depende do serviço, não de sucesso visual; falha não libera acesso. | B.1/B.2; não executado. |
| D02-T17 | Mudança de e-mail após definição da política. | Não contorna domínio, verificação, aprovação ou atividade; sem conceder privilégios. | Detalhe pendente; não executado. |

Testes de domínio/interface anteriores do Bloco A permanecem históricos. Não aprovam autenticação, banco, entrega de mensagens, segurança de senhas, revogação ou acesso direto. Nenhum teste da aplicação foi executado nesta consolidação documental.

## 7. P11 parcialmente resolvida e decisões restantes

**P11 parcialmente resolvida:** método e domínio definidos, com fluxo confirmado de solicitação, verificação e aprovação administrativa. Persistem responsáveis técnicos, designação/procedimento do primeiro AD, campos finais de obras, obrigatoriedade dos campos auxiliares, múltiplas funções e demais detalhes de cadastro. Não marcar P11 como integralmente resolvida nem implementada.

Detalhes técnicos/funcionais a validar com o responsável e serviço escolhido: política consistente de comparação de e-mails/parte local; política de senha; duração/limites dos links e reenvios; recuperação e revogação de sessões; alteração de e-mail; reapresentação após recusa; dados próprios editáveis. Requisitos de proteção já confirmados acima não dependem de aprovação para serem ignorados: o que falta são parâmetros e mecanismo de implementação.

**P12 permanece pendente:** ambiente, custos, capacidade/retenção de arquivos, cópias/recuperação, hospedagem e responsável pelo piloto. Também não foram definidos provedor de autenticação, banco, serviço de e-mail e remetente autorizado. Supabase continua possibilidade, sem contratação/configuração aprovada. As demais pendências do escopo não foram resolvidas por este adendo.

## 8. Primeira configuração necessária para B.1

Após autorização, a primeira configuração técnica será um **ambiente de teste isolado com serviço de autenticação autorizado para e-mail/senha e confirmação/recuperação**, associado ao armazenamento protegido das solicitações e ao serviço/remetente autorizado para as mensagens. Antes de executar essa configuração, ainda é necessário:

1. Escolher/autorizar os provedores de autenticação, banco e envio de e-mails e o ambiente que receberá o teste, com limites de custo.
2. Definir o responsável técnico e o remetente efetivamente autorizado. Não deduzir remetente a partir do domínio dos usuários nem criar endereço oficial por conta própria.
3. Identificar caixas corporativas reais de teste e respectivos responsáveis, com autorização expressa para os envios futuros; escolher quem será o primeiro Administrativo por procedimento controlado.
4. Confirmar a configuração segura fora do chat/repositório apenas como existente/completa ou pendente; registrar as decisões restantes pertinentes antes da integração.
5. Autorizar explicitamente B.1 e os recursos necessários. A documentação presente não autoriza configurar nada.

Não perguntar novamente o método de entrada ou o domínio: ambos estão confirmados. B.1 pode preparar cadastro, verificação, recuperação e sessão restrita; o ciclo completo de aprovação e permissões depende da entrega T19 planejada em B.2. Até isso existir e ser testado, nenhuma conta pendente recebe acesso operacional.

## 9. Escopo preservado e encerramento

D01 continua: Administrativo agenda/reagenda; auditor realiza somente auditorias sob sua responsabilidade. Aprovar uma conta é diferente de aprovar uma auditoria: **não criar aprovação administrativa de publicação**. Qualidade/Segurança separados; relatórios publicados somente para consulta, sem edição, reabertura, retificação ou recálculo; catálogos, pesos pendentes e navegação preservados. Agenda/ata de comitê continua P08, e A-V01 permanece ajuste visual pendente.

Este adendo e os documentos derivados apenas registram o fluxo. Não houve implementação, mudança de telas, instalação, conta/serviço criado, migração, envio de e-mail, publicação ou alteração em `nexobra-main`. Servidor e dados preservados. Aguardar autorização.
