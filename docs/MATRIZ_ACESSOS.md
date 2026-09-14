# Matriz canônica de acessos — escopo revisado

Data: 12/09/2026. Fonte: [escopo revisado](../PROMPT_DIALOGO_AUDITORIAS_ESCOPO_REVISADO.md), Parte I, seções 2–4 e 10, e Parte II, seções 03–05, páginas 5–7. Esta matriz substitui, para a evolução do produto, a [matriz antiga](PERMISSOES.md), mantida como histórico.

As tabelas abaixo transcrevem integralmente as células das seções 04 e 05. Descrevem responsabilidades e restrições; não atestam que autenticação, banco, anexos privados ou permissões operacionais estejam implementados. O Bloco A usa somente simulação local, identificada como **“Simulação de perfil — não é autenticação”**.

**Adendo posterior D02 — 12/09/2026:** [cadastro e autenticação consolidados](ADENDO_CADASTRO_AUTENTICACAO.md). A decisão atual detalha T01/T19; a transcrição das matrizes originais é preservada. Nesta execução somente a documentação foi alterada; os controles operacionais do adendo não foram implementados nem testados.

**Adendo posterior D03 — 13/09/2026:** [infraestrutura inicial e retenção](ADENDO_INFRAESTRUTURA_RETENCAO.md). A exceção futura de retenção se limita à cópia fotográfica avulsa e não concede ação de exclusão a perfis. As células originais permanecem intactas, inclusive “Apagar evidência de relatório publicado”; a diferença posterior é explicitada na seção D03 abaixo. Escolhas de infraestrutura não comprovam configuração ou contratação. Nenhuma rotina de limpeza ou serviço foi implementado nesta atualização documental.

## Perfis acumuláveis — decisão confirmada em 13/09/2026

O responsável definiu que **uma conta pode acumular qualquer combinação dos quatro perfis principais**. Por exemplo: Administrativo e Auditor de Segurança, Administrativo e Engenharia/Coordenação, ou os quatro simultaneamente. A atuação de Engenharia continua sendo Equipe da obra ou Coordenação; não constitui um quinto perfil.

Cada responsabilidade e restrição das matrizes abaixo continua vinculada ao perfil em que a pessoa atua. As concessões técnicas são explícitas por **perfil, obra e módulo**: acumular Engenharia e Auditor não transfere as obras de um perfil para o outro, nem amplia automaticamente a atuação administrativa. Identidade/autoria permanecem únicas por pessoa, com decisão e histórico da concessão.

Para a conta inicial de Emanuel, o responsável autorizou os quatro perfis, Engenharia como Coordenação e as 21 obras cadastradas nesta data. Isso não estabelece acesso automático a novas obras para ele ou para outros Administrativos. A implementação de contas/perfis e seus limites estão em [BOOTSTRAP_ADMINISTRATIVO.md](BOOTSTRAP_ADMINISTRATIVO.md); validação/aplicação em [RETOMADA.md](RETOMADA.md). Esta decisão resolve a possibilidade de múltiplas funções, citada como pendente nos registros históricos, sem alterar as células originais ou declarar prontos os módulos operacionais.

## Classificação e quatro perfis

| Classificação da fonte | Significado |
| --- | --- |
| Confirmado | Decisão explicitamente definida pelo responsável pelo projeto. |
| Documental | Informação sustentada pelas fontes internas F1–F5. |
| Proposta | Detalhamento funcional/técnico sujeito à análise; pode orientar a demonstração. |
| Pendente | Parâmetro, documento ou decisão não fornecido; não presumir autorização. |

Existem exatamente quatro perfis principais: **Auditor de Qualidade (AQ), Auditor de Segurança (AS), Engenharia e Administrativo (AD)**. **Equipe da obra (EO)** e **Coordenação (EC)** são atuações internas de Engenharia, não perfis adicionais. Comitê não é perfil. Administração é ambiente de manutenção, não disciplina de auditoria.

Os quatro perfis, a separação das responsabilidades e a regra de relatórios publicados somente para consulta são decisões confirmadas. Na fonte original, detalhes de vínculos, menus, inativação e configuração eram propostas. O adendo D02 confirma o fluxo de acesso e a revogação de contas com preservação de autoria/histórico; não resolve automaticamente os demais detalhes. Os refinamentos de consulta e visibilidade continuam em P09. P11 está **parcialmente resolvida** quanto ao método, domínio e fluxo detalhado de autenticação; campos de cadastro, detalhes de múltiplas funções e responsáveis técnicos continuam pendentes. **P12 está parcialmente resolvida por D03** quanto à infraestrutura inicial escolhida e à retenção das fotos avulsas; ambientes, envio de e-mails, responsáveis, destino/rotina de backup e detalhes das exceções de preservação permanecem pendentes.

## D02 — condições de acesso e aprovação de conta

**Confirmado para implementação futura:** conta individual com e-mail corporativo válido de domínio exatamente `dialogo.com.br` e senha própria do Diálogo Auditorias. A pessoa cria a senha no cadastro e continua usando-a depois da aprovação. Não exige “Entrar com Microsoft”; a senha é independente da Microsoft. Nenhuma integração existente foi removida nesta atualização de documentação.

A expressão original “sem cadastro público livre” fica detalhada por **“solicitação de acesso restrita ao domínio, com confirmação de e-mail e aprovação administrativa obrigatória”**. Não há liberação automática pelo domínio nem escolha de permissões efetivas pelo solicitante. A obra de referência declarada não concede acesso e a lista corporativa de obras não é exposta antes da aprovação. Cargo/área e obra de referência são campos propostos, com obrigatoriedade ainda a validar.

Para qualquer acesso operacional, validar separadamente os controles abaixo no servidor e no acesso aos dados, inclusive URLs, APIs e arquivos. Nenhuma informação de perfil/aprovação enviada pelo navegador é prova suficiente.

| Controle futuro | Condição e efeito |
| --- | --- |
| Identidade autenticada | Serviço de autenticação autorizado comprova a identidade individual. Não substitui confirmação, aprovação ou concessões. |
| E-mail confirmado | Serviço responsável comprova confirmação de endereço válido com domínio exato permitido; comparação do domínio sem caixa. Só então a solicitação entra na fila do AD. Não aceitar subdomínios, coincidência de trecho ou confirmação manipulável no navegador. |
| Aprovação administrativa | AD autorizado confere o pedido e decide a liberação, sem autoaprovação. Registrar responsável e data/hora; nunca revelar/trocar a senha para aprovar. |
| Conta ativa | A conta revogada não acessa dados operacionais, inclusive com sessão previamente aberta. Revogar preserva autoria e histórico. Bloqueio na Microsoft não revoga automaticamente sessões desta aplicação. |
| Permissões vigentes | Exigir a concessão da combinação de obra, módulo e atuação/responsabilidade e a ação compatível com o registro. Aprovação geral não concede todas as obras, módulos, telas ou ações. |

Concessões futuras devem representar cada combinação autorizada. Por exemplo, conceder Qualidade na obra A e Segurança na obra B **não concede** Segurança na obra A nem Qualidade na obra B. Não ampliar o acesso ao combinar listas independentes de obras, módulos e funções. A estrutura demonstrativa de `DemoUser` usa listas e ainda deverá ser refinada no Bloco B; ela não comprova esse controle no servidor.

| Situação de acesso / ator | Área e ações futuras permitidas | Restrições |
| --- | --- | --- |
| Pessoa sem autenticação adequada | Entrar, solicitar acesso e iniciar confirmação/recuperação conforme o mecanismo autorizado. | Página pública não revela se determinado funcionário possui conta, nem andamento particular ou lista corporativa de obras. |
| Pessoa com e-mail ainda não confirmado | Somente ações restritas de conta previstas para concluir a confirmação. | Fora da fila administrativa de liberação e sem dados operacionais. Estado do navegador não confirma e-mail. |
| Pessoa autenticada, e-mail confirmado e aprovação pendente | Consultar a própria solicitação e ações restritas de conta; mostrar “E-mail confirmado. Aguardando liberação do Administrativo.” | Não consulta pedidos de terceiros ou dados operacionais. “Aguardando aprovação” é situação de acesso, não um quinto perfil. |
| Pessoa aprovada e ativa | Acesso conforme todos os controles e concessões vigentes, usando a mesma senha do cadastro. | Não escolhe o próprio perfil nem amplia permissões; obra declarada no pedido não se torna concessão automática. |
| AD autorizado | T19: consultar fila de e-mails confirmados, aprovar e definir acessos, recusar, consultar decisões, revisar concessões e revogar acesso. | Não vê senhas, não pede envio delas e não assume autoria de auditoria por liberar conta. Autoridade para T19 também deve ser verificada no servidor. |
| Conta revogada | Nenhum acesso operacional, inclusive em sessão anteriormente aberta. | Recuperar senha não reativa a conta, aprova pedido ou eleva permissões. Detalhes de ações restritas de conta após revogação permanecem a validar. |

O primeiro Administrativo será designado por **procedimento controlado**, nunca por ser o primeiro cadastro. Responsáveis e execução desse procedimento ainda não estão definidos. Solicitações repetidas não podem sobrescrever identidades, senhas, aprovações ou permissões existentes. A política de comparação consistente dos e-mails não removerá pontos/sufixos antes do `@` para inventar equivalências; detalhes da mudança posterior de e-mail permanecem a validar sem contornar domínio, verificação ou aprovação.

Senhas ficam sob o mecanismo seguro do serviço autorizado, sem armazenamento nos cadastros da aplicação, JSON, `localStorage`, logs, mensagens ou documentos. Confirmação e recuperação exigem links temporários, de uso único e proteção contra abuso, sem registrar tokens/links completos nos logs. A recuperação não altera aprovação, estado ativo/revogado nem concessões. Ver subtelas e testes **futuros, não executados** em [MAPA_TELAS.md](MAPA_TELAS.md).

**Aprovação de conta é distinta de aprovação de auditoria.** D02 não concede ao AD poder de aprovar a publicação técnica, editar rascunho alheio, alterar relatório publicado ou ultrapassar C†. Na decisão D02, provedor e infraestrutura ainda eram possibilidades; posteriormente, D03 escolheu GitHub para código, primeira instância paga do Render para a aplicação publicada do piloto e Supabase Free para autenticação, banco e arquivos, com desenvolvimento separado do piloto. Isso não declara serviços contratados/configurados. Configuração dos ambientes, envio de e-mails/remetente autorizado, responsáveis e detalhes restantes de P12 continuam pendentes. Domínio permitido para usuários não é autorização para enviar mensagens em seu nome.

## D01 — quem agenda visitas

**Entendimento explícito aplicado no Bloco A:** Administrativo cria e reagenda as visitas de Qualidade e Segurança. Auditores consultam a agenda da própria disciplina; equipe da obra consulta suas obras; coordenação consulta somente quando autorizada.

Fonte da decisão: Parte I, D01; Parte II, **seção 04, página 6**, linha “Agenda da própria disciplina”, e **T05, seção 07, página 9**. A matriz revisada contém AQ = C, AS = C, EO = C, EC = C† e AD = E. As frases residuais das seções 02 e 03, páginas 4–5, ainda atribuem agenda ao auditor; a divergência permanece na fonte e é resolvida neste protótipo pela orientação expressa de D01.

O autor administrativo do agendamento e o auditor responsável pela inspeção são pessoas/funções distintas. Agendar não autoriza AD a iniciar, preencher, discutir tecnicamente ou publicar auditoria. **D01 não atribui agenda nem ata do comitê:** a edição de T17 continua pendente em P08.

## D03 — exceção restrita à cópia fotográfica avulsa

O escopo original proíbe apagar evidência após a publicação e preserva o conteúdo emitido com seus arquivos. A transcrição abaixo mantém essa regra histórica. **A decisão posterior D03 permite planejar a remoção somente da cópia fotográfica avulsa, sob condições cumulativas, sem conceder ao Administrativo ou a qualquer outro perfil poder de apagar evidências manualmente.** O responsável técnico e a autorização para operação da futura rotina ainda devem ser definidos; D01 e o poder de administrar contas em D02 não os determinam.

A elegibilidade começa em **data/hora de publicação concluída registrada pelo servidor + 30 dias corridos**. Não começa no upload, na visita ou no mês seguinte. Sem publicação concluída, o prazo não inicia; fotos de rascunhos ficam fora da rotina. Planos, apresentações e documentos de outras categorias não entram automaticamente na limpeza.

Mesmo após o prazo, remover exige PDF definitivo salvo, íntegro e legível; comprovação de que a fotografia está incorporada ao PDF no item correto; cópia de segurança do PDF confirmada; ausência de bloqueio de preservação; ausência de outros vínculos que exijam conservar o arquivo. Se qualquer condição falhar ou não puder ser comprovada, preservar a foto e registrar a pendência. Não apagar para liberar espaço a qualquer custo.

O PDF permanece no histórico com todas as imagens incorporadas, sem dependência das fotos avulsas. Respostas, notas, observações, medições, versões e vínculos permanecem preservados. Execução e resultado da limpeza serão registrados separadamente, sem modificar a auditoria ou o PDF imutáveis. A consulta autorizada, após eventual remoção avulsa, deve informar que a imagem permanece no relatório e oferecer o PDF, sem link quebrado e sem ampliar concessões de obra/módulo/responsabilidade.

**Limite de avanço:** B.5 planeja metadados de arquivos; D prepara publicação/PDF; F detalha backup, recuperação e a proposta de simulação sem excluir arquivos antes de habilitar operação real. A execução real exigirá autorização expressa posterior e todas as proteções. D03 não implementa limpeza, não ativa agendamentos, não antecipa publicação e não permite editar, reabrir, retificar, recalcular, substituir ou excluir relatórios publicados. As verificações complementares de A09/A15/A16 são futuras e estão no [mapa de telas](MAPA_TELAS.md), sem aprovação operacional nesta rodada.

## Legenda das matrizes

**C:** consulta. **E:** cria/edita. **P:** publica. **R:** registra parecer. **—:** não permitido. **C†:** consulta somente se autorizada. **Q/S:** Qualidade/Segurança. “Participa” autoriza participação na discussão, sem edição das respostas.

Todas as consultas respeitam os módulos e obras autorizados. Edição exige responsabilidade pelo registro e situação compatível. Acesso a uma obra não autoriza editar o rascunho de outro auditor. Acúmulo de funções exige concessão explícita; não elimina qualquer vedação do publicado.

## Seção 04 — auditorias e entregas

| TELA / AÇÃO | AQ | AS | EO | EC | AD |
| --- | --- | --- | --- | --- | --- |
| Agenda da própria disciplina | C | C | C | C† | E |
| Iniciar auditoria de Qualidade | E | — | — | — | — |
| Iniciar auditoria de Segurança | — | E | — | — | — |
| Editar respostas antes da publicação | E / Q | E / S | — | — | — |
| Anexar evidências da inspeção | E / Q | E / S | — | — | — |
| Conduzir e registrar discussão | E / Q | E / S | Participa | — | — |
| Consultar conteúdo na discussão | C / Q | C / S | C | — | — |
| Publicar após discussão com a obra | P / Q | P / S | — | — | — |
| Consultar relatório publicado | C / Q | C / S | C | C | C† |
| Imprimir / obter relatório publicado | C / Q | C / S | C | C | C† |
| Criar e editar plano da obra | C / Q | C / S | E | C | C† |
| Enviar plano da obra | — | — | E | — | — |
| Registrar avaliação do plano | C / Q | C / S | C | R | — |
| Preparar apresentação de Segurança | — | C | E | C | C† |
| Consultar materiais do comitê | — | C | C | C | C† |
| Editar relatório já publicado | — | — | — | — | — |

Condições da fonte:

- “E / Q” e “E / S” limitam edição à disciplina e ao rascunho atribuído ao auditor.
- A participação da obra na reunião não autoriza Engenharia a reescrever respostas.
- O parecer da coordenação pertence a um registro próprio. Não edita a ação da obra, não aprova publicação e não comprova execução das correções.
- Agenda/ata do comitê e permissões de apoio dependem de P08. Consulta de rascunhos fora da reunião depende de P09.
- P/Q e P/S descrevem a responsabilidade futura: não habilitam publicação operacional enquanto cálculo, acordo e condições finais estiverem pendentes em P01/P02, P05 e P06.

## Seção 05 — manutenção e histórico

E na configuração significa editar cadastro permitido ou criar nova versão, nunca modificar retrospectivamente relatórios publicados.

| TELA / AÇÃO | AQ | AS | EO | EC | AD |
| --- | --- | --- | --- | --- | --- |
| Consultar obras vinculadas | C | C | C | C | C |
| Cadastrar / atualizar / inativar obras | — | — | — | — | E |
| Gerenciar usuários e revogar acesso | — | — | — | — | E |
| Definir perfis, módulos e vínculos | — | — | — | — | E |
| Consultar critérios de Qualidade | C | — | C | C | C |
| Consultar critérios de Segurança | — | C | C | C | C |
| Criar revisão de roteiro / quesitos | — | — | — | — | E |
| Editar pesos e regras futuras | — | — | — | — | E |
| Consultar pesos na área técnica | C / Q | C / S | —* | —* | C |
| Revisar modelo de relatório | — | — | — | — | E |
| Ativar nova versão de configuração | — | — | — | — | E |
| Consultar histórico das configurações | C† | C† | — | — | C |
| Trocar critérios de relatório publicado | — | — | — | — | — |
| Apagar evidência de relatório publicado | — | — | — | — | — |
| Editar nota ou reabrir publicação | — | — | — | — | — |
| Modificar ou apagar trilha de alterações | — | — | — | — | — |

\* A ausência de acesso da Engenharia ao painel técnico de pesos é **proposta**. A regra **documental** é que o formulário publicado F.175 não indique pesos (F1, observação do grupo 1). Visibilidade interna dos demais modelos e painéis continua em P09; não estender automaticamente a restrição documental a todos os relatórios.

Condições da fonte:

- Na fonte original, inativar obras, contas e modelos, preservando vínculos históricos, é proposta. D02 posteriormente confirma a revogação de **contas** preservando autoria/histórico e contemplando sessões abertas; demais detalhes de obras/modelos não são resolvidos por esse adendo. A edição cadastral afeta uso futuro; o emitido conserva a identificação original.
- Alterar metodologia exige origem, revisão e motivo. Não oferecer nota final livre nem código arbitrário para modificar resultados.
- Eventual revisão técnica interna de parâmetros não é aprovação de cada auditoria.
- AD não recebe acesso irrestrito a documentos/anexos pela atribuição administrativa. C† exige autorização explícita identificável; ausência de decisão não vale como concessão.

## Condições por situação do registro

| Situação/contexto | Consulta/edição permitida no escopo | Limite no Bloco A |
| --- | --- | --- |
| Agendada | AD mantém visita; AQ/AS/EO consultam conforme contexto; EC somente com autorização. | Visitas de teste em memória; nenhuma gravação externa. |
| Em preenchimento | Auditor responsável da disciplina edita o próprio rascunho. | Rascunhos demonstrativos independentes; não afirmar permissão real no servidor. |
| Em discussão com a obra | Auditor conduz e ajusta; equipe da obra acompanha o conteúdo da reunião. | Registro final do acordo depende de P05; consulta externa à reunião depende de P09. |
| Publicada | Consultas da seção 04; nenhum perfil edita, reabre, retifica, exclui, substitui ou recalcula. | Publicação operacional indisponível. Exemplo imprimível não é publicação. |
| Plano pendente/em elaboração | EO elabora; consultas conforme matriz. | Formulário oficial e política de envio em P03/P07; Bloco E. |
| Plano enviado | Versão enviada preservada; EC registra parecer separado. | Complementação/reenvio pendentes em P07, sem ciclo presumido de aprovação das correções. |
| Comitê de Segurança | EO prepara; AS/EO/EC consultam, AD somente C†. | P08 não concede editor de agenda/ata. Qualidade não recebe comitê nesta versão. |
| Revisão de configuração | AD cria versão futura com histórico. | Administração completa no Bloco C; rascunho não migra silenciosamente (P10). |

## Implementação e validação

A política demonstrativa é centralizada em `src/domain/prototype-access.ts` e consumida por agendas, contexto de módulo/obra e autoria de rascunhos. `src/app/page.tsx` renderiza `PrototypeApp`; `src/app/components/prototype-app.tsx` concentra o estado e integra a simulação e as telas. A simulação local não cria contas e não altera concessões reais. O [mapa de telas e testes](MAPA_TELAS.md) registra o alcance de cada entrega.

No Bloco A, `test:access` passou 16/16 e `test:audit-context` passou 15/15. A verificação no navegador confirmou os quatro perfis/duas atuações, D01, autoria independente, AD sem formulário técnico, EO sem iniciar/editar e EC com agenda concedida em Horizonte e negada em Jardim Norte. O bloqueio de Publicada foi exercitado apenas por registro fictício isolado de teste; os dados iniciais não contêm publicação. Essas evidências não resolvem P08/P09 nem constituem aprovação de acessos operacionais. Resultados finais e limites em [RETOMADA.md](RETOMADA.md).

Na versão operacional, a mesma intenção deve ser validada no servidor, banco, arquivos e exportações, com testes de acesso direto. Ocultar botões ou passar lint/build não comprova essa proteção. Todas as decisões P01–P12 continuam registradas em [Pendências do escopo](PENDENCIAS_ESCOPO_REVISADO.md).
