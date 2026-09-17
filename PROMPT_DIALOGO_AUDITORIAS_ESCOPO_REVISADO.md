# Diálogo Auditorias — prompt de evolução a partir do escopo revisado

> Decisão posterior de 17/09/2026: o reagendamento foi retirado do fluxo operacional. O Administrativo pode excluir agendamentos; as referências a reagendamento abaixo permanecem apenas como registro do escopo original.

## Como utilizar este arquivo

Coloque este arquivo na raiz de `auditoria-obra`, ao lado de `package.json`, e peça ao agente do VS Code que o leia integralmente. Ele reúne as instruções de execução e, na Parte II, o conteúdo textual completo do escopo revisado, com suas tabelas. Não é necessário depender da leitura do Word pelo agente para acessar esse conteúdo.

**Execute agora somente o Bloco A da Parte I.** Os demais blocos descrevem a continuidade, sem autorização para execução automática. O projeto já existe: não criar outra aplicação nem substituir os arquivos por um projeto novo.

Fonte recebida: `DIALOGO_AUDITORIAS_ESCOPO_COMPLETO_V1.docx`, versão revisada pelo usuário. O título do Word permanece V1.0; a nova entrega não significa que as pendências foram resolvidas nem que as propostas se tornaram regras operacionais aprovadas.

SHA-256 do DOCX recebido: `ab42328cd701d6bd18fcd881ee77e14252df467f26de150920945baed19bb3cc`.

---

# PARTE I — INSTRUÇÕES PARA O AGENTE DO VS CODE

## 1. Missão e limites da execução

Evolua a aplicação existente **Diálogo Auditorias**, na pasta `auditoria-obra`, conforme o escopo revisado transcrito na Parte II.

A aplicação é independente de `nexobra-main`. Qualidade e Segurança são dois módulos dentro da mesma plataforma. Administração é um ambiente de manutenção, não um terceiro tipo de auditoria.

Antes de editar código, examine o projeto real. O histórico de desenvolvimento não substitui a inspeção dos arquivos. Preserve o layout, a identidade visual, os catálogos, a navegação por itens e as funcionalidades que já estejam funcionando. Não recoloque o layout inicial nem invente outro logotipo.

Não execute `create-next-app`, não recrie o projeto e não modifique outras pastas. Não apague dados, não faça reset de banco nem comandos destrutivos de Git. Não contrate serviços, publique externamente, envie mensagens ou configure integrações sem autorização específica.

## 2. Leitura obrigatória e tratamento das fontes

Leia integralmente este arquivo, inclusive a Parte II. Se a ferramenta truncar a leitura, leia por intervalos até chegar ao marcador `FIM DO ESCOPO REVISADO`. Não considere apenas o início ou o resumo como leitura integral.

Leia, quando presentes, `AGENTS.md`, `CLAUDE.md`, `package.json`, o lockfile, `README.md`, `docs/RETOMADA.md`, `docs/PLANO.md`, a documentação de permissões e de pendências, `INICIO_DIALOGO_AUDITORIAS.md`, os catálogos utilizados e o verificador do catálogo de Segurança.

Examine a estrutura atual de páginas, componentes, estado, autenticação, acesso aos dados, armazenamento, testes e geração de documentos. Não imprima conteúdo de arquivos de segredos, senhas ou chaves.

Para regras de negócio, o escopo revisado substitui as sugestões antigas que contrariem suas definições. Instruções técnicas e de segurança existentes continuam válidas. Não apague documentos antigos: registre quais decisões de negócio foram superadas.

Mantenha a classificação da fonte: **Confirmado, Documental, Proposta e Pendente**. Propostas podem orientar a interface de demonstração, mas não devem aparecer como uma aprovação de regras operacionais ainda abertas. Os pontos P01–P12 continuam pendentes até existir uma decisão documentada.

O escopo não transcreve os 205 quesitos de Segurança. Use os catálogos e fontes locais já integrados. Não tente reconstruir os itens a partir do resumo do escopo e não busque checklists genéricos na internet. Se faltar um arquivo necessário, preserve a implementação existente, identifique o arquivo faltante e não invente seu conteúdo.

### D01 — alteração identificada na revisão: responsável pelo agendamento

A revisão recebida mudou especificamente dois pontos:

- Na matriz da seção 04, página 6, a linha **Agenda da própria disciplina** passou a ter AQ = C, AS = C, EO = C, EC = C† e AD = E.
- Em **T05 — Agenda de visitas**, seção 07, página 9, o texto agora diz que o administrador agenda e que agendar/reagendar é responsabilidade do administrador.

Ainda existem frases de resumo nas seções 02 e 03 atribuindo o agendamento ao auditor. **Essa divergência está presente no original e não foi removida da transcrição.**

Critério explícito adotado neste prompt: para a adequação do protótipo, utilizar a matriz revisada e T05, os trechos efetivamente modificados pelo usuário. Portanto:

1. O perfil **Administrativo** agenda e reagenda as visitas de Qualidade e Segurança.
2. O auditor consulta sua agenda e inicia/preenche a auditoria que está autorizado a executar; não recebe edição da agenda pelo perfil de auditor.
3. Engenharia / equipe da obra consulta a agenda das suas obras.
4. Engenharia / coordenação consulta a agenda somente quando autorizada.
5. O autor administrativo do agendamento e o auditor responsável pela inspeção são informações diferentes.
6. Agendar não autoriza o Administrativo a preencher ou publicar auditoria.

Registre D01 no diagnóstico e na matriz consolidada, com referência à seção 04 e a T05. Mostre esse entendimento no resumo inicial para a conferência do usuário. Atualize a documentação derivada do projeto, sem reescrever o DOCX original ou omitir a divergência.

**Não estenda essa mudança à agenda ou à ata do comitê.** A responsabilidade por T17 continua pendente em P08. Outras divergências sem orientação expressa devem ser registradas, e a função afetada não deve ganhar uma regra presumida.

## 3. Perfis e abrangência

Mantenha exatamente quatro perfis principais:

- Auditor de Qualidade.
- Auditor de Segurança.
- Engenharia.
- Administrativo.

Engenharia terá duas atuações internas: **Equipe da obra** e **Coordenação**. Não criar um quinto perfil por causa dessa distinção nem um perfil adicional chamado Comitê.

As permissões consideram perfil, atuação, módulo, obras vinculadas, responsabilidade pelo registro e situação da auditoria. Acesso a uma obra não autoriza editar o rascunho de outro auditor. Acúmulo de funções depende de concessão explícita; não é autopromoção.

**Auditor de Qualidade:** consulta a agenda; inicia e edita os próprios rascunhos de Qualidade; conduz a discussão; publica quando as condições estiverem atendidas; consulta relatórios e planos autorizados de Qualidade.

**Auditor de Segurança:** mesma atuação em Segurança, acrescida da consulta aos materiais de apresentações ao comitê. Não presumir permissão para editar a apresentação da obra ou registrar a ata do comitê.

**Engenharia / equipe da obra:** consulta suas obras, agenda e relatórios; acompanha o conteúdo na discussão sem editar as respostas do auditor; elabora e envia planos; prepara a apresentação de Segurança quando aplicável.

**Engenharia / coordenação:** consulta resultados publicados das obras sob sua coordenação; avalia os planos em registro próprio; consulta apresentações e participa do comitê. Não participa do fechamento original e não aprova a publicação da auditoria.

**Administrativo:** mantém obras, usuários, acessos, vínculos, modelos, parâmetros e histórico de configuração, além do agendamento revisado em T05. A consulta a documentos operacionais e anexos requer autorização explícita. Não conceder acesso irrestrito a toda informação apenas por ser Administrativo.

Nenhum perfil, nem combinação de perfis, pode editar, reabrir, retificar, substituir, excluir ou recalcular uma auditoria publicada.

Transcreva as matrizes das seções 04 e 05 para a documentação de permissões. Preserve a diferença entre C, E, P, R, C† e ausência de permissão. Não transforme C† em consulta irrestrita.

## 4. Fluxo funcional que deve orientar a aplicação

Fluxo consolidado com o ajuste D01:

**Administrativo agenda → Auditor inspeciona e preenche → Auditor discute os pontos com a equipe da obra → Auditor publica relatório e nota → Obra elabora/envia plano de ação → Coordenação consulta e avalia o plano.**

Em Segurança, nota publicada válida inferior a 7 acrescenta a apresentação das correções/contramedidas ao comitê.

Use as situações propostas no escopo sem lhes dar significados adicionais:

- Auditoria: Agendada; Em preenchimento; Em discussão com a obra; Publicada.
- Plano de ação: Pendente de envio; Em elaboração; Enviado.
- Comitê: Pendente de apresentação; Agendado; Apresentado.

As regras de complementação de plano, nomes dos pareceres, registro digital do acordo, cancelamento e substituição de auditor permanecem pendentes. Não criar alçadas de aprovação por inferência.

**Não implementar o fluxo genérico de correção enviada, reinspeção, aprovação técnica e encerramento de cada apontamento.** Essa rotina foi explicitamente excluída do escopo inicial. Também não criar aprovação obrigatória do coordenador ou Administrativo para publicar a auditoria.

## 5. Mapa de telas e rastreabilidade

Mantenha os IDs T01–T23 na documentação para relacionar tela, regra, código e teste. As telas podem compartilhar componentes e rotas quando adequado, sem perder suas responsabilidades. Este mapa não autoriza executar todos os blocos de uma vez.

| ID | Tela | Responsabilidade e limite principal |
| --- | --- | --- |
| T01 | Entrar e Minha conta | Conta individual; sem cadastro público livre nem alteração do próprio perfil. Autenticação real depende do bloco próprio. |
| T02 | Escolher módulo e obra | Somente contextos autorizados; troca não mistura respostas nem concede acesso. |
| T03 | Painel de trabalho | Conteúdo por perfil, período e obra; coordenação vê resultados publicados; Administração vê manutenção e agenda. |
| T04 | Obra e visão do histórico | Consulta da identificação e registros da obra. Edição cadastral em T18; sem reproduzir a produção do nexobra-main. |
| T05 | Agenda de visitas | Administrativo agenda/reagenda; auditores e obra consultam; coordenação consulta quando autorizada. Aplicar D01. |
| T06 | Lista de auditorias | Auditor retoma rascunhos próprios; demais consultas segundo módulo, obra e situação. |
| T07 | Roteiros e critérios | Conteúdo integral, busca e orientações vinculadas. Manutenção administrativa em T20. |
| T08 | Iniciar auditoria | Auditor da disciplina autorizado; registro independente, versão identificada e respostas inicialmente vazias. |
| T09 | Preenchimento e evidências | Auditor responsável edita antes de publicar; navegação por todos os itens e dados independentes por item. |
| T10 | Fechamento com a obra | Auditor e equipe da obra discutem; auditor registra ajustes. Sem coordenação aprovadora. Mecanismo de acordo ainda P05. |
| T11 | Conferência final e publicar | Auditor responsável; prévia e pendências; publicação somente com as condições validadas. Não há nota final livre. |
| T12 | Relatório publicado | Somente consulta e obtenção do original; documentos posteriores em área externa de relacionados. Inclui consulta dos apontamentos. |
| T13 | Histórico para novas auditorias | Consulta de avaliações anteriores por modelo/versão; não copiar respostas antigas para uma nova inspeção. |
| T14 | Elaborar e enviar plano | Equipe da obra; referência aos apontamentos sem modificá-los; formulário e complementações dependem de P03/P07. |
| T15 | Avaliação do plano | Coordenação registra parecer próprio; não reescreve a ação da obra nem atesta automaticamente a execução. |
| T16 | Apresentação / contrarrelatório | Equipe da obra prepara materiais de Segurança; consulta pelos participantes autorizados. Não altera o relatório original. |
| T17 | Reunião e encaminhamentos | Data, participantes, ata e encaminhamentos propostos; editor e composição dependem de P08. Não atribuir por D01. |
| T18 | Cadastro de obras | Administrativo cadastra, atualiza e inativa; preserva histórico e vínculos. Campos definitivos ainda P11. |
| T19 | Usuários, perfis e vínculos | Administrativo administra acessos; função e obras explicitamente concedidas; não visualiza senhas. |
| T20 | Roteiros e versões | Administrativo cria novas revisões; não sobrescreve versões já utilizadas. |
| T21 | Pesos, medidas e regras | Parâmetros documentados por disciplina/modelo; ausentes continuam nulos; sem fórmulas arbitrárias ou nota final manual. |
| T22 | Modelos de relatórios | Revisões para usos futuros; prévias de teste; não redesenhar o histórico publicado. |
| T23 | Histórico de manutenção | Registro de autoria, horário e motivo; Administrativo consulta, sem ação para apagar histórico. |

A área de apontamentos não terá botão de dar baixa nem indicadores de correção comprovada. A Administração é ambiente funcional, não uma auditoria extra.

## 6. Catálogos, preenchimento e cálculo

Preserve o catálogo `CATALOGO_SEGURANCA_IT07_R02.json` e a integração atual. Para a revisão IT.07 R02 fornecida, conferir os 205 itens, 27 grupos e 37 subgrupos, seus textos, ordem, números, unidades, orientações e páginas de origem. Esses totais são referências dessa versão, não constantes universais para todo roteiro futuro.

Preserve F.175 e F.176 como modelos distintos de Qualidade, seus quesitos, pesos documentados e rateios. Os totais dos pesos não definem, sozinhos, as respostas e a fórmula de pontuação. Não reconstruir os modelos com perguntas genéricas.

Orientações gerais, de grupo/subgrupo e de item permanecem orientações, não perguntas novas. Divergências documentais devem continuar registradas. Não alterar números, unidades, nomes ou códigos para “corrigir” a fonte sem decisão técnica.

No preenchimento:

- Oferecer Anterior, Próximo, Item X de Y e seleção direta pesquisável por código/texto/grupo.
- Não avançar automaticamente ao clicar em uma resposta.
- Manter resposta, observação, justificativa, medição e anexo por auditoria, versão e identificador estável do item; não usar apenas o índice visual.
- Iniciar a auditoria sem respostas predefinidas. Preservar 0 como resposta explícita, diferente de ausência de resposta.
- Em Segurança, manter 0, 5, 10 e N/A. Não eliminar 5 por causa do exemplo divergente do documento.
- “Não verificado”, se já existir, é situação operacional separada e não nota. Não criar sua política de publicação sem P06.
- Em Qualidade, não copiar a escala de Segurança. Se opções e conversão ainda estiverem ausentes, mostrar a pendência e preservar a consulta/estrutura demonstrativa, sem criar pontuação oficial.
- Comparações automáticas de medidas só com critérios validados; não converter orientações textuais em limites inferidos.
- Mudar obra/modelo não pode transferir ou apagar silenciosamente o rascunho.

Pesos individuais ausentes ficam `null` / “A definir”, nunca 0 ou 1 por conveniência. Valores documentados ou já cadastrados com origem não podem ser apagados apenas porque o catálogo textual contém um campo nulo.

Não usar média simples, percentuais genéricos ou a nota histórica do Boulevard para fabricar pesos. Preservar a diferença entre configuração textual, parâmetros de pontuação e respostas coletadas.

Notas, rateios, N/A, arredondamento, fator de fase, amostragem e faixas do Farol obedecem às pendências P01/P02. No estado incompleto, exibir “Nota pendente — configuração incompleta”, sem nota oficial nem classificação inventada. Testes com valores estipulados devem ser identificados como cenários fictícios, nunca usados para completar a metodologia operacional.

No F.175 publicado, não indicar os pesos. Não estender essa regra automaticamente a todos os documentos; observar P09 para a visibilidade dos demais modelos e dos painéis técnicos.

## 7. Fechamento e relatório publicado

T10 deve permitir revisar os apontamentos e as evidências com a equipe da obra antes da emissão. Coordenadores não participam desse fechamento nem são aprovadores obrigatórios.

Participantes, data, esclarecimentos e ajustes são elementos propostos para registrar a reunião. A confirmação digital do acordo e a conduta sem consenso continuam P05. Não inventar assinatura, aceite em nome de outro usuário ou aprovação por terceiro.

O auditor é quem ajusta as respostas no rascunho. A nota decorre das respostas e dos parâmetros, não de um valor livre negociável.

Para a implementação operacional de T11, resolver os bloqueios de cálculo e as condições P05/P06 antes de permitir publicação definitiva. Neste Bloco A, deixar a publicação operacional indisponível quando depender dessas decisões; mostrar claramente as pendências. Uma prévia não é um relatório publicado.

**A publicação é terminal para o conteúdo do relatório.** Nenhum perfil pode modificar, reabrir, retificar, excluir, recalcular ou substituir respostas, fotos, notas ou identificação após a emissão.

Na etapa operacional, preservar o documento emitido, sua base de cálculo e o conteúdo completo da versão usada, inclusive identificação da obra, auditor, participantes, orientações e evidências. Não regenerar um relatório antigo com o nome atual da obra, novos pesos, outro cabeçalho ou novas fotos.

Planos, pareceres e apresentações são registros separados com referências ao relatório e aos apontamentos. Seus vínculos posteriores ficam fora do conteúdo original preservado.

## 8. Planos de ação e comitê

A equipe da obra elabora e envia os planos. A coordenação avalia por meio de um registro próprio, com autoria e data; não modifica a ação como se fosse da obra.

Usar a estrutura proposta em T14 somente como protótipo até receber o formulário oficial: identificação da auditoria, referência do apontamento, medida planejada, responsável, prazo, observação e registro do envio. Não tornar causa raiz, custo, fotos do depois ou outras informações obrigatórias sem validação.

Preservar a versão enviada do plano. Complementação, reenvio e nomes de pareceres ficam pendentes em P07; não implementar substituição silenciosa nem um ciclo de aprovação das correções.

Em Segurança, havendo não conformidades, o plano é exigido independentemente da nota. As 72 horas são prazo documental de apresentação do plano, não de execução de todas as correções. Marco inicial e contagem estão em P04: não ativar alertas de atraso antes de resolvê-los. Não aplicar 72 horas à Qualidade.

Não declarar envio ao AUTODOC sem integração ou comprovante real. A relação com o formulário/sistema atual está em P03.

Para o comitê, testar a condição sobre uma nota final publicada e válida:

- Segurança com nota menor que 7: apresentação exigida, além do plano.
- Segurança com nota igual ou maior que 7: não encaminhar pelo critério de nota.
- Nota pendente: não comparar, não converter em 0.
- Qualidade: comitê desativado nesta versão.

Testes 6,99 e 7,00 usam notas finais já consolidadas. A regra de arredondamento antes da comparação permanece pendente; não decidir por inferência.

A equipe da obra prepara a apresentação das correções/contramedidas. Não exigir quantidade fixa de fotos nem correção individual aprovada de todos os itens. Edição da agenda/ata e composição do comitê continuam P08, sem criação de outro perfil.

“Plano enviado” e “Apresentado” são entregas documentais. Não significam apontamento encerrado, correção comprovada, alteração de nota ou liberação da obra.

## 9. Administração e preservação dos registros

Modelar obras, usuários, perfis/vínculos, versões de roteiros, parâmetros, modelos de relatórios e histórico como registros distintos dos relatórios emitidos.

A revisão administrativa cria uma nova versão com origem, autor, motivo e vigência. Não editar retroativamente versões em uso. Não trocar critérios de um rascunho silenciosamente; política de migração/substituição permanece P10.

Inativação de obras/usuários preserva a autoria e a consulta autorizada do histórico. Cadastros inativos não entram em nova operação quando essa regra proposta for validada. Não permitir exclusões em cascata que afetem relatórios publicados.

Manutenção de contas não autoriza modificar conteúdo técnico. Não conceder um atalho “superadministrador” para violar o bloqueio da publicação. Consulta administrativa a anexos permanece sujeita a autorização.

Não ativar o comitê de Qualidade ao editar a regra de Segurança. Uma futura adoção em Qualidade exige configuração própria de vigência, condição, participantes e documentos, sem criar pendências antigas automaticamente.

## 10. Salvamento e permissões: protótipo não é produção

Verifique o estado real do projeto. Se ainda for apenas memória, mantenha o aviso e não anuncie salvamento persistente. Se já houver persistência/autenticação real, preserve-a; não volte para mocks nem instale um seletor que contorne os acessos existentes.

Somente no ambiente local de demonstração sem autenticação real pode existir uma ferramenta isolada para visualizar os quatro perfis e as duas atuações de Engenharia. Identifique-a como **“Simulação de perfil — não é autenticação”**. Não peça senhas reais nem apresente contas fictícias como usuários provisionados.

Use uma política central e testável para o comportamento demonstrativo. Na etapa operacional, a mesma intenção de permissão precisa alcançar servidor, banco, arquivos e exportações. Ocultar botões não será considerado implementação concluída de controle de acesso.

A versão operacional deve preservar os dados confirmados como salvos entre sessões e aparelhos, distinguir salvando/salvo/falha, proteger arquivos, evitar sobrescritas concorrentes e duplicidade de envios e testar recuperação de backup. Essas entregas pertencem aos blocos posteriores, salvo implementação existente que não pode ser removida.

Não mudar fornecedor, versões principais ou arquitetura instalada sem necessidade demonstrada. Supabase e hospedagem são propostas prévias, não serviços automaticamente autorizados por este prompt. Não pedir segredos no chat nem expô-los no código do navegador ou no repositório.

Não incluir neste trabalho modo offline, aplicativo nativo, integração AUTODOC, WhatsApp, calendários externos, assinatura certificada ou avaliação técnica por IA. Idioma português do Brasil, datas legíveis e contexto de obra/módulo sempre visível.

## 11. Pendências e documentação de execução

Mantenha os IDs P01–P12 da seção 21. Para cada ponto, registre fonte, situação, função afetada e condição necessária para habilitar uso operacional. Não marque “resolvido” apenas por ter criado um campo ou uma tela.

Registre também D01 e qualquer conflito entre documentos, testes e implementação. Se existir decisão mais recente documentada localmente, apresente-a para compatibilização; não apague parâmetros fornecidos depois nem declare que recebeu o conteúdo que não leu.

Crie ou atualize, preservando conteúdo útil já existente:

- `docs/DIAGNOSTICO_ESCOPO_REVISADO.md`: estado real do código, diferenças frente ao escopo, D01 e plano incremental.
- `docs/MATRIZ_ACESSOS.md`: matrizes consolidadas, condições e limites por situação do registro.
- `docs/MAPA_TELAS.md`: T01–T23, rota/componente, perfil, fonte, situação, bloco e teste associado.
- `docs/PENDENCIAS_ESCOPO_REVISADO.md`: P01–P12, divergências e funções que continuam bloqueadas.
- `docs/PLANO.md` e `docs/RETOMADA.md`: bloco executado, arquivos alterados, testes reais e próximo passo.

Se houver arquivos equivalentes, prefira atualizar e referenciar a fonte canônica em vez de manter matrizes incompatíveis espalhadas. Não sobrescreva o documento fonte desta revisão.

## 12. Sequência incremental

A sequência detalha a seção 20 do escopo. O Bloco A corresponde ao diagnóstico e à adequação do protótipo; não reinicia a antiga “Etapa 1”.

| Bloco | Entrega | Condição de avanço |
| --- | --- | --- |
| A — executar agora | Diagnóstico, perfis/atuações, módulos, menus, agenda administrativa e preservação do formulário existente; documentação rastreável. | Conferência do usuário sobre acessos, telas e D01. Sem ativação operacional de funções pendentes. |
| B — aguardar autorização | Contas reais, usuários/vínculos, obras, rascunhos e arquivos persistentes; isolamento dos dados. | Provedor/configuração definidos e testes reais de acesso/salvamento. |
| C — aguardar autorização | Administração completa de modelos, parâmetros e documentos versionados. | Decisões de configuração registradas; histórico protegido. |
| D — aguardar autorização | Cálculos validados, registro final da discussão, publicação e obtenção imutável do documento. | P01/P02, P05/P06 e demais parâmetros da função resolvidos. |
| E — aguardar autorização | Planos oficiais, pareceres, apresentações de Segurança e registros do comitê. | P03/P04/P07/P08 resolvidos conforme cada funcionalidade. |
| F — aguardar autorização | Testes completos, revisão das saídas, restauração de backup, piloto e preparação de lançamento. | Aprovação do piloto, custos/infraestrutura e autorização explícita de publicação. |

Partes do projeto já prontas devem ser verificadas e aproveitadas, não refeitas para cumprir a ordem. Os blocos são organização de trabalho, não ampliação do escopo.

## 13. EXECUTE AGORA — somente o Bloco A

### A.1 Diagnóstico e plano curto

Examine os arquivos e descreva o que existe de verdade: módulos, menus, agenda, preenchimento, perfis, persistência, autenticação, relatórios e testes. Informe a regra D01 antes de aplicá-la. Registre as pendências e apresente um plano curto das alterações deste bloco.

### A.2 Adequação do protótipo

Implemente diretamente no projeto:

1. Separação clara de Qualidade e Segurança e ambiente administrativo; quatro perfis, Engenharia com duas atuações internas.
2. Menus e painéis por contexto usando as permissões revisadas. Se não houver login real, adote somente a simulação local explicitamente identificada, sem prometer segurança operacional.
3. **T05 funcional no protótipo:** Administrativo cria e reagenda uma visita de teste com obra, disciplina, auditor, data, modelo pretendido e observação; auditor e obra consultam conforme vínculos. Essa edição não modifica respostas ou inspeções já publicadas.
4. Manter o acesso do auditor à lista/retomada/início de auditorias autorizado em T06/T08/T09. Agendamento administrativo não transfere a autoria do preenchimento nem dá permissão de iniciar auditoria a AD ou Engenharia.
5. Preservar integralmente T07/T09: catálogos, orientações, resposta 0 e navegação de todos os itens com observações independentes. Ajustar somente o necessário para o novo contexto.
6. Organizar acesso e entrada das demais telas T01–T23 no mapa de implementação. Aproveitar telas existentes; as funções ainda não implementadas ou dependentes de definição ficam claramente identificadas, com ações indisponíveis e explicação. Não criar botões que mostram sucesso sem produzir o resultado correspondente.
7. Se cadastros de obras/usuários demonstrativos já existirem, restringir sua manutenção ao Administrativo e preservar as informações. Não criar contas externas reais neste bloco.
8. Remover do fluxo oferecido ao usuário as ações incompatíveis: editar/reabrir publicado, aprovação obrigatória da coordenação/AD, reinspeção ou encerramento geral das correções e comitê ativo de Qualidade. Preservar dados existentes: não apagar registros ou histórico para remover botões.
9. Não habilitar publicação oficial com metodologia/acordo pendentes. Dados previamente marcados como demonstração continuam demonstração; não convertê-los em publicações reais.
10. Atualizar a documentação e parar para conferência.

Não implementar agora os formulários definitivos de plano sem a fonte oficial, a publicação operacional, os serviços externos ou o mecanismo final de autenticação. Não alterar silenciosamente a forma de salvamento. Uma função existente mais avançada deve ser mantida e informada, não desativada somente por causa do recorte deste bloco.

### A.3 Verificações deste bloco

Use a infraestrutura de testes existente quando houver. Verifique e registre:

- Administrativo agenda/reagenda; AQ e AS não editam a agenda pelo perfil de auditor.
- Auditor só inicia/preenche a própria disciplina e responsabilidade; agendar como AD não autoriza preenchimento técnico.
- Equipe da obra consulta apenas suas obras e não modifica respostas; coordenação não ganha edição nem aprovação de publicação.
- Troca de módulo, obra ou simulação de perfil não mistura rascunhos e não altera as concessões armazenadas de usuário real.
- Acessos condicionais continuam condicionais. Uma permissão pendente não vira liberação geral.
- Catálogo de Segurança mantém os 205 itens da versão fornecida e suas orientações; F.175/F.176 continuam íntegros.
- Item 01.01.01 com resposta 5 e observação própria; item 01.01.02 com resposta 10 e outra observação; voltar/avançar mantém os dados separados. Testar também 0, N/A e não respondido.
- Primeiro/último item, busca direta e mudança de grupo continuam funcionando.
- Pesos ausentes permanecem nulos, sem nota artificial. Qualidade não recebe a escala ou o comitê de Segurança.
- Registros publicados de teste, se existirem, não oferecem comandos de alteração a nenhum perfil. Não declarar imutabilidade de banco ou arquivos se esse ambiente ainda não existir.
- Computador e largura de celular: controles legíveis, sem sobreposição e sem perder navegação nas orientações longas.

Além dos testes funcionais, execute os comandos disponíveis no projeto, em Windows/PowerShell, usando `npm.cmd` e `npx.cmd`:

```powershell
npm.cmd run verify:security
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run build
```

Primeiro confira os scripts. Se algum não existir, use o equivalente real disponível ou relate a ausência; não informe sucesso fictício. Preserve o servidor existente e use outro terminal para verificações. Não inicie um segundo servidor. Se uma verificação exigir interromper o servidor ou se houver conflito de artefatos de build, explique e peça autorização antes.

Verifique a interface em navegador se a ferramenta estiver disponível; caso contrário, forneça o roteiro de conferência visual. Lint/TypeScript/build não comprovam que as permissões reais ou todos os botões funcionam.

Mantenha os testes de piloto A01–A16 da seção 22 mapeados para seus blocos. Testes de banco, arquivos privados, publicação imutável e restauração ainda não executáveis devem ficar **pendentes**, não aprovados.

### A.4 Resposta final obrigatória do agente

Ao terminar, informe:

- Causa e alcance das mudanças frente ao estado encontrado.
- Entendimento aplicado a D01 e demais conflitos identificados.
- Telas/arquivos alterados e funções preservadas.
- Resultado real de cada teste: passou, falhou ou não executado.
- O que ainda é demonstrativo, não persistente ou dependente de P01–P12.
- Como testar cada perfil e a agenda administrativa no navegador.
- Próximo bloco sugerido, **sem executá-lo**.

Não declare a plataforma pronta para uso em obra ou produção. Pare após o Bloco A.

---

# PARTE II — ESCOPO REVISADO: TRANSCRIÇÃO TEXTUAL DA FONTE

O conteúdo abaixo conserva os textos, títulos, quadros e tabelas do DOCX recebido, na ordem do corpo do documento. Formatação visual, quebras de linha e rodapés repetidos foram adaptados ao Markdown; o sentido e as células das matrizes não foram reescritos. A grafia “Adminitrador” de T05 e as frases residuais sobre o auditor agendar foram mantidas como aparecem na fonte. A orientação explícita para a divergência de agenda está em D01, na Parte I.

Os marcadores de página referem-se às 25 páginas do escopo; o Markdown não tem paginação de impressão fixa. F1–F5 e D0 conservam o significado atribuído na seção 23. Esta transcrição é fonte de leitura, não uma autorização para resolver as pendências nem uma confirmação de implementação.


## Página 1 do escopo revisado

**PROJETO DIÁLOGO**

QUALIDADE + SEGURANÇA

### Diálogo — Auditorias

### Escopo funcional — consolidado

Acessos • Telas • Permissões • Funcionalidades

Documento para analisar a aplicação como um todo antes de preparar o próximo prompt de implementação no VS Code.

| ESTRUTURA | FLUXO PRINCIPAL |
| --- | --- |
| 4 perfis de acesso<br>2 módulos de auditoria | Agendar • Inspecionar • Discutir com a obra<br>Publicar • Elaborar plano de ação |
| Qualidade: F.175 e F.176<br>Segurança: IT.07 | Comitê apenas em Segurança, quando a nota publicada for inferior a 7. |

> Regra central do projeto
> Depois da publicação, o relatório é somente para consulta. Nenhum perfil poderá alterá-lo, reabri-lo, retificá-lo ou recalcular sua nota.

Versão 1.0 | 12 de setembro de 2026

Consolidação das decisões desta conversa e dos documentos fornecidos. Os detalhes ainda não aprovados estão identificados como proposta ou pendência.

Este escopo descreve o produto pretendido; não certifica que todas as funções já existam no protótipo.


## Página 2 do escopo revisado

**COMO ANALISAR ESTE DOCUMENTO**

### Guia de leitura e sumário

As decisões mais recentes sobre o processo substituem as sugestões iniciais incompatíveis, especialmente a aprovação do coordenador antes da publicação e a rotina geral de reinspeção e encerramento das correções.

| CLASSIFICAÇÃO | COMO INTERPRETAR |
| --- | --- |
| Confirmado | Regra explicitamente definida pelo responsável pelo projeto nesta conversa. |
| Documental | Informação sustentada pelos arquivos da empresa, identificados como F1 a F5. |
| Proposta | Detalhamento funcional ou técnico para implementar o processo, sujeito à análise deste escopo. |
| Pendente | Parâmetro, documento ou decisão ainda não fornecido. Não deve ser inventado pelo agente. |

Ponto de partida: aplicação independente em auditoria-obra. A última situação relatada era um protótipo local sem login e com preenchimentos somente em memória. O código atual não foi recebido para uma auditoria técnica completa.

| SEÇÕES | CONTEÚDO | PÁGINAS |
| --- | --- | --- |
| 01–03 | Visão do produto, fluxo e perfis | 3–5 |
| 04–05 | Matrizes de acesso e permissões | 6–7 |
| 06–08 | Telas comuns, agenda e preenchimento | 8–10 |
| 09–10 | Discussão, publicação e histórico | 11–12 |
| 11–12 | Planos de ação e comitê | 13–14 |
| 13–14 | Manutenção administrativa | 15–16 |
| 15–16 | Metodologias de Qualidade e Segurança | 17–18 |
| 17–19 | Dados, operação e indicadores | 19–21 |
| 20 | Etapas e limites da primeira versão | 22 |
| 21 | Pendências para validação | 23 |
| 22 | Critérios de aceite | 24 |
| 23 | Fontes e ficha de revisão | 25 |

Os documentos originais permanecem como fonte dos quesitos. Este arquivo organiza o escopo do sistema; não substitui a IT.07 nem republica integralmente os 205 itens de Segurança.


## Página 3 do escopo revisado

**ESCOPO FUNCIONAL**

### 01. Visão do produto e dos módulos

Confirmado: uma plataforma independente de auditorias, organizada em Qualidade e Segurança, sem reproduzir o sistema de acompanhamento de execução da obra.

#### Objetivo

Planejar visitas, registrar avaliações pelos roteiros da empresa, discutir os apontamentos com a equipe da obra, publicar relatórios e notas e acompanhar a entrega dos planos de ação. Em Segurança, organizar também as apresentações ao comitê quando a nota for inferior a 7.

| AMBIENTE | CONTEÚDO E FINALIDADE |
| --- | --- |
| Qualidade | Modelos Farol da Qualidade Simplificado (F.175) e Completo (F.176). Auditorias, histórico, apontamentos e planos de ação próprios. Comitê desativado nesta versão. |
| Segurança | Roteiro IT.07, respostas e ponderações próprias. Auditorias, histórico, planos de ação e apresentação ao comitê conforme a regra de nota. |
| Administração | Cadastro de obras, usuários, vínculos de acesso, roteiros, parâmetros, modelos de relatórios e histórico das configurações. Não é um terceiro tipo de auditoria. |

#### Princípios obrigatórios

Metodologia da empresa: preservar códigos, enunciados, orientações, pesos e medidas fornecidos. Não trocar o catálogo por perguntas genéricas nem importar automaticamente regras de um módulo para o outro.

Responsabilidades separadas: o auditor avalia e publica; a equipe da obra participa da discussão e elabora o plano; a coordenação consulta e avalia os planos; o Administrativo mantém a plataforma.

Histórico preservado: o relatório publicado não muda. Plano de ação, parecer da coordenação e materiais de comitê são registros vinculados, mas separados.

Sem nota inventada: pesos ausentes ficam como “A definir”. Não usar zero ou médias simples como substituição da metodologia. Não somar Qualidade e Segurança em uma nota única.

> O local é uma referência da ocorrência
> A auditoria é centrada na obra e no roteiro. Pavimento, ambiente, serviço ou equipamento podem localizar o apontamento, sem exigir a reprodução da árvore de produção, das unidades ou das tipologias do nexobra-main.

Base: D0 (decisões do projeto); F1, grupos 1–4; F2, grupos 1–7; F3, pp. 1 e 26–30.


## Página 4 do escopo revisado

**ESCOPO FUNCIONAL**

### 02. Fluxo confirmado e registros separados

| ETAPA | RESPONSABILIDADE | RESULTADO |
| --- | --- | --- |
| 1. Agendar a visita | Auditor da disciplina | Obra, data e modelo previstos. Ainda sem respostas ou nota. |
| 2. Realizar a inspeção | Auditor responsável | Rascunho com respostas, observações, medições e evidências. |
| 3. Discutir com a obra | Auditor e equipe da obra | Conferência dos pontos e ajustes antes do fechamento. Coordenadores não participam desse momento. |
| 4. Publicar a auditoria | Auditor responsável | Relatório e nota definitivos, preservados para consulta. Sem aprovação obrigatória do coordenador ou Administrativo. |
| 5. Elaborar o plano | Equipe da obra | Medidas planejadas para os apontamentos. Coordenação consulta e avalia o plano. |
| 6. Apresentar ao comitê | Obra, coordenação e equipe de Segurança | Etapa adicional de Segurança para nota inferior a 7, com apresentação das correções e contramedidas. |

#### Estados propostos para a interface

Auditoria: Agendada → Em preenchimento → Em discussão com a obra → Publicada. A publicação é terminal para o conteúdo do relatório; não há reabertura.

Plano de ação: Pendente de envio → Em elaboração → Enviado. A manifestação da coordenação é um registro separado. Regras de complementação após o envio ainda precisam de validação.

Comitê: Pendente de apresentação → Agendado → Apresentado. Os nomes dos estados são proposta de interface; não criam aprovação individual das correções.

#### O que não acontece automaticamente

Enviar o plano não resolve nem apaga um apontamento. Apresentar materiais ao comitê não comprova que todos os itens foram corrigidos. Uma auditoria publicada não é uma liberação técnica da obra ou autorização de retomada de atividade.

> Sem rotina geral de pós-correção
> Não faz parte do escopo inicial exigir, para todos os apontamentos, foto do “depois”, envio de correção executada, reinspeção, aprovação de encerramento ou baixa individual da não conformidade.

Base: D0; F3, item 07.01.03 e orientação complementar, pp. 9–10.


## Página 5 do escopo revisado

**ESCOPO FUNCIONAL**

### 03. Perfis de acesso e menus de trabalho

Confirmado: quatro perfis principais. Engenharia possui duas atuações internas, Equipe da obra e Coordenação, sem criar um quinto perfil.

| PERFIL / ATUAÇÃO | RESPONSABILIDADE E MENU PROPOSTO |
| --- | --- |
| Auditor de Qualidade | Agenda e executa Qualidade; discute e publica. Menu: Painel de Qualidade, Agenda, Auditorias, Nova auditoria, Roteiros, Relatórios e Planos de ação. |
| Auditor de Segurança | Agenda e executa Segurança; discute e publica. Menu: Painel de Segurança, Agenda, Auditorias, Nova auditoria, Roteiros, Relatórios, Planos de ação e Comitê. |
| Engenharia — equipe da obra | Participa do fechamento, consulta e elabora entregas. Menu: Minhas obras, Agenda da obra, Qualidade, Segurança, Relatórios, Planos de ação e Comitê quando aplicável. |
| Engenharia — coordenação | Consulta notas, avalia planos e participa do comitê. Menu: Obras sob coordenação, Indicadores, Relatórios, Planos de ação e Comitê de Segurança. |
| Administrativo | Mantém a plataforma. Menu: Painel administrativo, Obras, Usuários e acessos, Roteiros e versões, Parâmetros, Modelos de relatórios e Histórico de configurações. |

#### Abrangência proposta por usuário

O Administrativo associa a conta ao perfil, à atuação de Engenharia quando houver, aos módulos permitidos e às obras autorizadas. O auditor só edita auditorias sob sua responsabilidade. Ter acesso a uma obra não significa poder alterar avaliações de outro auditor.

A Engenharia acessa Qualidade e Segurança dentro de suas obras. A coordenação pode ter várias obras vinculadas. A consulta do Administrativo a relatórios e anexos deve respeitar autorização explícita; manutenção não significa visibilidade irrestrita de todo documento operacional.

#### Acúmulo de funções

Proposta: uma pessoa poderá receber mais de uma função somente se o Administrativo conceder isso expressamente. Não existirá seletor que permita ao usuário se promover sozinho ou escolher um perfil sem autorização.

> Regra que vale para todos
> Nenhuma atribuição, inclusive uma combinação de perfis, poderá conceder edição, reabertura, exclusão ou recálculo do relatório publicado.

Base: D0. Menus e granularidade dos vínculos são propostas de implementação para análise.


## Página 6 do escopo revisado

**ESCOPO FUNCIONAL**

### 04. Permissões: auditorias e entregas

Matriz consolidada para revisão. As permissões de consulta são sempre limitadas aos módulos e obras autorizados; a edição é limitada à responsabilidade atribuída.

AQ: Auditor de Qualidade. AS: Auditor de Segurança. EO: Engenharia / obra. EC: Engenharia / coordenação. AD: Administrativo. C: consulta. E: cria/edita. P: publica. R: registra parecer. —: não permitido. C†: consulta somente se autorizada.

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

#### Condições da matriz

“E / Q” e “E / S” significam edição somente na disciplina e no rascunho atribuído ao auditor. A participação da obra na reunião não autoriza reescrever as respostas do auditor pela conta de Engenharia.

A avaliação do plano pela coordenação não equivale a editar a ação da obra nem aprovar tecnicamente a resolução de cada item. O responsável por registrar agenda e ata do comitê ainda está pendente de definição.

Base: D0. A consulta de rascunhos fora da reunião e permissões de apoio ao comitê estão detalhadas nas pendências, seção 21.


## Página 7 do escopo revisado

**ESCOPO FUNCIONAL**

### 05. Permissões: manutenção e histórico

Legenda da seção anterior. E na configuração significa editar uma nova versão ou cadastro permitido, nunca modificar retrospectivamente o conteúdo de relatórios publicados.

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

* A ausência de acesso da Engenharia ao painel técnico de pesos é proposta. A regra documental confirmada é que o formulário publicado F.175 não indique pesos; a visibilidade interna dos demais modelos deve ser validada. [F1, observação no grupo 1.]

#### Cadastros com histórico

Proposta: inativar obras, contas e modelos fora de uso em vez de remover seus vínculos históricos. Alterações cadastrais afetam o uso futuro; nomes e dados exibidos no documento emitido devem permanecer como foram publicados.

#### Limites da manutenção

Editar a metodologia requer registrar origem, revisão e motivo. A tela administrativa não deve oferecer nota final livre nem scripts arbitrários para mudar resultados. Eventual revisão técnica interna dos parâmetros não será confundida com aprovação de cada auditoria.

Base: D0; F1, nota sobre publicação dos pesos. Restrições de acesso à configuração são propostas sujeitas à conferência.


## Página 8 do escopo revisado

**CATÁLOGO DE TELAS • T01 A T04**

### 06. Telas comuns: entrada, módulos e obras

Proposta funcional para a versão operacional. Simulação de perfil no protótipo não será considerada autenticação real.

#### T01 | Entrar e Minha conta

Acessos: Todos os perfis, com conta individual.

Conteúdo: Identificação da conta, entrada, saída, recuperação de acesso e dados pessoais permitidos.

Ações: Entrar, sair e manter os próprios dados autorizados. Provisionamento e permissões pertencem ao Administrativo.

Limite: Sem cadastro público livre, conta compartilhada ou alteração do próprio perfil. O método final de autenticação será definido na implantação.

#### T02 | Escolher módulo e obra

Acessos: Conforme os módulos e vínculos atribuídos.

Conteúdo: Qualidade e/ou Segurança disponíveis à conta; identificação clara da obra selecionada.

Ações: Alternar apenas entre ambientes e obras autorizados, mantendo visível o contexto de trabalho.

Limite: A troca de contexto não pode levar respostas de uma obra para outra nem conceder novo acesso.

#### T03 | Painel de trabalho

Acessos: Cada perfil recebe um painel compatível com sua atuação.

Conteúdo: Agenda, auditorias em andamento, relatórios publicados e entregas pendentes. Coordenação vê notas publicadas e planos; Administrativo vê cadastros e configuração.

Ações: Filtrar período, obra, disciplina, modelo e situação; abrir o registro de origem.

Limite: Notas provisórias não serão mostradas como resultados oficiais. Não misturar os dois módulos em uma média geral.

#### T04 | Obra e visão do histórico

Acessos: Usuários vinculados à obra; cadastro editável em T18.

Conteúdo: Identificação da obra, equipe vinculada, auditores, coordenação e acesso às auditorias e entregas.

Ações: Consultar a obra e abrir seus registros. Solicitar atualização cadastral pelo canal definido pela empresa.

Limite: Não importar automaticamente serviços, unidades, plantas ou medições de produção do nexobra-main.


## Página 9 do escopo revisado

**CATÁLOGO DE TELAS • T05 A T08**

### 07. Agenda, roteiros e nova auditoria

#### T05 | Agenda de visitas

Acessos: Adminitrador agenda; equipe da obra consulta. Demais consultas conforme matriz.

Conteúdo: Obra, disciplina, auditor, data prevista, modelo pretendido e observações da visita.

Ações: Agendar e reagendar visitas sob responsabilidade do administrador. Proposta: registrar o histórico do reagendamento.

Limite: Agendar não preenche itens nem lança nota. Antecedência, notificações externas e cancelamento de rascunhos ainda dependem de definição.

#### T06 | Lista de auditorias

Acessos: Auditor: seus rascunhos e histórico autorizado. Engenharia: publicadas e participação permitida.

Conteúdo: Identificação, obra, disciplina, modelo, versão, data e situação. Nota somente quando existente e identificada como preliminar ou publicada.

Ações: Retomar rascunho próprio; consultar relatório publicado; navegar para plano ou apresentação vinculados.

Limite: Coordenadores não recebem tarefa de aprovar a publicação. Auditor não edita rascunho de outro profissional sem regra de substituição formalmente definida.

#### T07 | Roteiros e critérios

Acessos: Auditores e Engenharia consultam a disciplina permitida; Administrativo mantém em T20.

Conteúdo: Grupos, subgrupos, códigos, enunciados completos, orientações e fonte por item, com busca.

Ações: Buscar por código ou texto e abrir orientações gerais, do grupo e do quesito.

Limite: Orientações não são perguntas adicionais. IDs técnicos não devem ser apresentados como códigos oficiais.

#### T08 | Iniciar auditoria

Acessos: Somente auditor autorizado da disciplina.

Conteúdo: Visita/obra, data da inspeção, auditor autenticado, modelo, versão e identificação do novo registro.

Ações: Iniciar um rascunho separado e entrar no preenchimento.

Limite: Não copiar respostas antigas. Fixação da versão no início é proposta de preservação; parâmetros faltantes devem continuar identificados.

Base: D0; F3, p. 1, para frequência mensal de Segurança. Periodicidade de Qualidade ainda não informada.


## Página 10 do escopo revisado

**CATÁLOGO DE TELAS • T09**

### 08. Preenchimento e evidências da inspeção

Acesso de edição: auditor responsável, somente antes da publicação. Consulta na reunião: equipe da obra acompanha o conteúdo discutido, sem substituir o auditor no preenchimento.

#### Conteúdo do item

Mostrar código, grupo e subgrupo, texto integral, orientações correspondentes, fonte e versão. Disponibilizar resposta, observações, justificativas, localização e medições quando aplicáveis. Fotos e documentos da inspeção ficam vinculados ao item correto.

#### Navegação obrigatória

Botões Anterior e Próximo, posição “Item X de Y” e acesso direto por lista pesquisável de grupos, subgrupos e quesitos. Todos os itens devem estar acessíveis. A escolha de uma resposta não deve trocar a pergunta automaticamente.

A navegação pode ocorrer sem resposta em um rascunho. Retornar a um item deve mostrar exatamente sua resposta e observação. Nota zero deve ser preservada como valor escolhido, não tratada como ausência de preenchimento.

#### Respostas por modelo

Segurança: 0, 5, 10 e N/A, conforme a regra geral da IT.07. “Não respondido” é estado de preenchimento, não uma nota. “Não verificado”, se adotado, deve ser um estado operacional separado, cuja regra de publicação precisa de validação. [F3, p. 1.]

Qualidade: utilizar as opções e o mapeamento de pontuação que a empresa confirmar. Os pesos disponíveis não bastam para deduzir se a resposta será binária, parcial ou outra escala. Não copiar automaticamente a escala de Segurança.

#### Medições e anexos

Proposta: registrar valor, unidade, local e observação; comparar automaticamente limites somente quando o critério tiver sido formalmente configurado e validado. O anexo deve mostrar envio concluído ou falha, sem confirmação falsa de salvamento.

Cada resposta precisa ser independente por auditoria, versão e item. Anexos, medições e justificativas de um item não podem aparecer no seguinte por reutilização indevida do formulário.

> Rascunho não é relatório publicado
> Durante o desenvolvimento, permitir coleta demonstrativa mesmo sem pesos completos. A emissão definitiva com nota exige resolver as pendências de cálculo. A política de validação final está indicada na seção 21.

Base: D0; F3, pp. 1–26. Preservar enunciados e orientações também na impressão, sem textos genéricos.


## Página 11 do escopo revisado

**CATÁLOGO DE TELAS • T10 E T11**

### 09. Discussão com a obra e publicação

#### T10 | Fechamento com a equipe da obra

Confirmado: depois da inspeção e antes da nota oficial, o auditor reúne-se com a equipe da obra para discutir os pontos e fechar o relatório em comum acordo. Coordenadores não participam desse momento.

Proposta de tela: revisão de respostas, apontamentos e evidências; acesso ao resultado preliminar quando calculável; filtros sem ocultar itens conformes ou N/A. Registrar participantes, data, esclarecimentos e ajustes realizados pelo auditor.

A nota é consequência das respostas consolidadas e dos parâmetros, não um valor livre negociado. O registro do acordo documenta a discussão; a forma de confirmação digital pela obra ainda precisa ser definida. Não pressupor assinatura eletrônica certificada.

#### T11 | Conferência final e publicar

Acesso: auditor responsável. Mostrar prévia completa do relatório, participantes registrados, pendências de preenchimento, situação dos anexos e cálculo da nota.

| CONFERÊNCIA PROPOSTA | COMPORTAMENTO ESPERADO |
| --- | --- |
| Conteúdo e contexto | Confirmar obra, modelo, versão, data, respostas e evidências. Não publicar dados de demonstração como oficiais. |
| Discussão com a obra | Registrar a realização e o acordo segundo o mecanismo que será aprovado. Sem aprovação do coordenador ou Administrativo. |
| Parâmetros e nota | Impedir nota inventada. Proposta: bloquear publicação definitiva enquanto faltar base de cálculo validada. |
| Confirmação final | Avisar expressamente que a publicação torna o relatório somente para consulta. Evitar duplo envio e duplicidade. |

#### Efeito da publicação

Preservar uma cópia completa do conteúdo emitido, incluindo valores e arquivos. O relatório deve permanecer idêntico em consultas e obtenções futuras. Preparar o vínculo para planos de ação e, em Segurança, avaliar o encaminhamento ao comitê pela nota publicada válida.

> Sem reabertura
> O usuário confirmou que relatórios publicados não são mais alterados. Não implementar atalhos de edição, retificação, recálculo, substituição de fotos ou exclusão para qualquer perfil.

Base: D0; F3, p. 1, objetivo de avaliação em consenso. Forma digital do acordo e pré-condições detalhadas são propostas.


## Página 12 do escopo revisado

**CATÁLOGO DE TELAS • T12 E T13**

### 10. Relatórios publicados e histórico

#### T12 | Consultar relatório publicado

Acessos: auditores na disciplina autorizada, Engenharia nas obras vinculadas e Administrativo quando autorizado. A tela é somente de leitura para todos.

Conteúdo previsto: identificação da obra e da inspeção; auditor; modelo/versão; data e registro de publicação; respostas; grupos; apontamentos; observações; medições; evidências; fechamento com a obra e resultado calculado conforme a metodologia disponível.

Ações permitidas: consultar, pesquisar no conteúdo, imprimir/obter o documento emitido e abrir plano de ação ou material de comitê relacionado. Os vínculos posteriores aparecem fora do conteúdo imutável do relatório, em uma área de documentos relacionados.

Subtela Apontamentos / Não conformidades: consultar os achados publicados por obra, disciplina, grupo ou item e abrir o plano relacionado. A tela existente no protótipo deve ser adaptada a essa consulta, sem status de correção comprovada ou botão de encerrar apontamento. O texto original só é editável no rascunho pelo auditor.

No F.175 publicado, os pesos não serão exibidos, conforme instrução do modelo. A disponibilização de memória técnica de cálculo interna não deve contrariar essa apresentação. [F1, observação do grupo 1.]

#### T13 | Histórico e consulta para nova auditoria

Conteúdo: auditorias anteriores da obra, por disciplina, modelo, versão, período e auditor. Permitir consultar apontamentos e entregas vinculadas para preparar a próxima visita.

Nova auditoria: cria outro registro e começa sem respostas predefinidas. Consulta à inspeção anterior não transfere nota, declaração de conformidade, justificativa ou evidência como se fosse produzida na nova data.

Comparações devem mostrar o modelo e a versão de cada avaliação. Não apresentar como diretamente equivalentes duas notas que utilizem critérios ou distribuições de pesos diferentes sem informar essa diferença.

#### Documento original e entregas posteriores

| PERMANECE NO RELATÓRIO | FICA EM REGISTRO VINCULADO |
| --- | --- |
| Achado e evidência da inspeção | Ação planejada pela obra e sua versão enviada. |
| Nota e parâmetros usados na emissão | Parecer posterior da coordenação sobre o plano. |
| Conteúdo acordado no fechamento | Apresentação das correções e ata/encaminhamentos do comitê. |

Base: D0; F1; F4 como referência de relatório preenchido, não como fonte única de critérios da revisão atual.


## Página 13 do escopo revisado

**CATÁLOGO DE TELAS • T14 E T15**

### 11. Planos de ação e avaliação dos planos

#### T14 | Elaborar e enviar plano de ação

Confirmado: depois da auditoria, a equipe da obra prepara os planos para corrigir os apontamentos. O plano se vincula ao relatório publicado e não o altera.

Edição: Engenharia / equipe da obra, dentro das obras autorizadas. Consulta: auditores da disciplina e coordenação, conforme seus vínculos. Administrativo consulta somente quando autorizado.

Estrutura proposta, a adequar ao formulário oficial: identificação da auditoria; referência do apontamento; medida planejada; responsável; prazo; observação; autor e data do envio. Não tornar campos novos, como causa raiz ou custo, obrigatórios sem validação.

Permitir salvar rascunho e enviar a versão final do plano. Regra de complementação depois do envio: pendente. Proposta de proteção é preservar a versão enviada e registrar eventuais complementações sem substituição silenciosa.

#### Regra específica de Segurança

Havendo não conformidades, o plano é obrigatório independentemente da nota. A IT.07 prevê envio pela obra ao SESMT e às coordenações em até 72 horas após a auditoria. Esse prazo é de apresentação do plano, não de conclusão de todas as correções. [F3, pp. 9–10.]

O documento também exige formulário específico e disponibilização no AUTODOC. Ainda não foi fornecido o formulário nem decidida a substituição ou coexistência com o sistema atual. O aplicativo não deverá declarar envio ao AUTODOC sem integração ou comprovante real. [F3, p. 30.]

#### T15 | Avaliação pela coordenação

Confirmado: coordenadores consultam e avaliam os relatórios dos planos de ação. Proposta de tela: visualizar o plano enviado e registrar parecer, comentários e pedidos de esclarecimento em área própria, com autor e data.

A coordenação não deve reescrever a ação da obra. A manifestação não será uma aprovação prévia para publicar a auditoria nem uma validação de execução de cada correção. Nomes de situações como “avaliado” ou “complementação solicitada” precisam ser aprovados.

> O que não exigir do plano
> Não impor rotina geral de fotos do depois, solicitação de reinspeção ou encerramento individual de não conformidade. O programa acompanha a entrega do plano, não presume correção comprovada.

Base: D0; F3, item 07.01.03, pp. 9–10 e formulário correlato, p. 30. Prazo e modelo de Qualidade permanecem pendentes.


## Página 14 do escopo revisado

**CATÁLOGO DE TELAS • T16 E T17**

### 12. Comitê de Segurança e apresentações

#### Condição de entrada confirmada

A funcionalidade é exclusiva de Segurança nesta versão. Após a publicação de uma nota válida inferior a 7, a obra deve preparar a apresentação das correções e contramedidas ao comitê. Nota igual a 7 não gera essa obrigação pelo critério informado.

| CONDIÇÃO | RESULTADO NO SISTEMA |
| --- | --- |
| Segurança: nota < 7 | Gerar pendência de apresentação vinculada à auditoria. Manter também o plano de ação. |
| Segurança: nota ≥ 7 | Não gerar comitê por nota. Manter plano de ação quando houver apontamentos. |
| Segurança: nota pendente | Não comparar com o limite e não tratar como zero. Indicar configuração/cálculo pendente. |
| Qualidade, qualquer nota | Não gerar apresentação ao comitê nesta versão. Não copiar limite, prazo ou composição de Segurança. |

#### T16 | Preparar apresentação / contrarrelatório

Edição: equipe da obra. Consulta: Auditor de Segurança e coordenação autorizados. Reunir referência da auditoria, apontamentos, apresentação, descrições das correções/contramedidas e anexos utilizados pela obra.

Proposta: aceitar arquivo da apresentação e materiais de apoio, preservando versões entregues. Não fixar quantidade de fotos por item nem exigir que todos os itens possuam correção aprovada para permitir apresentação.

#### T17 | Reunião e encaminhamentos

Proposta: registrar data, participantes, materiais apresentados, ata e encaminhamentos. O responsável por agendar e registrar a reunião ainda não foi designado; essa permissão deve ser atribuída depois da validação, sem criar um quinto perfil.

A rotina relatada envolve coordenadores, equipe de Segurança e obra apresentadora. A IT.07 também menciona diretoria no comitê. A lista de participantes e seus acessos devem ser confirmados, sem presumir novas contas ou alçadas. [F3, p. 10.]

> Efeito restrito
> “Apresentado ao comitê” registra a apresentação realizada. Não altera a nota original, não reabre a auditoria e não encerra automaticamente todos os apontamentos.

Evolução futura: Qualidade poderá adotar comitê mediante definição própria de regra, vigência, participantes e documentos. A ativação futura não criará pendências retrospectivas automaticamente.

Base: D0; F3, p. 10.


## Página 15 do escopo revisado

**CATÁLOGO DE TELAS • T18 E T19**

### 13. Administração de obras e usuários

#### T18 | Cadastro de obras

Responsável: Administrativo. Cadastrar, atualizar e inativar obras; manter identificação, localização e vínculos com equipe, coordenação e auditores.

Campos propostos: código interno da obra, nome, endereço/localidade, situação cadastral e responsáveis vinculados. Campos finais, obrigatoriedade e eventual fase representativa da obra dependem da validação do cadastro e da metodologia.

Locais da inspeção: prever referências simples de pavimento, área, ambiente ou equipamento quando úteis. Não exigir um cadastro de todas as unidades, tipologias e serviços de produção. Alterar uma referência cadastral não poderá modificar o texto histórico de um relatório emitido.

Proposta: obra inativa permanece disponível no histórico, mas não é selecionável para nova auditoria operacional. Reativação e histórico de alterações ficam restritos ao Administrativo.

#### T19 | Usuários, perfis e vínculos

Responsável: Administrativo. Criar e desativar contas; atribuir os perfis Auditor de Qualidade, Auditor de Segurança, Engenharia e Administrativo; configurar atuação de Engenharia e obras/módulos autorizados.

| FUNÇÃO | COMPORTAMENTO PROPOSTO |
| --- | --- |
| Vincular obras | Definir explicitamente as obras de atuação. Auditoria de outra obra não pode aparecer por troca de URL ou pesquisa. |
| Equipe e coordenação | Distinguir quem elabora o plano e quem o avalia. A coordenação pode ter múltiplas obras. |
| Revogar acesso | Impedir novos acessos operacionais sem apagar autoria ou histórico. |
| Acumular funções | Conceder expressamente cada função necessária. Não permitir autoelevação de perfil. |
| Recuperar conta | Usar mecanismo de recuperação de acesso; o Administrativo não deve precisar visualizar a senha do usuário. |

#### Limites

Não permitir que a manutenção de contas dê poder de alterar relatórios publicados. Substituição de auditor em rascunho e composição de acessos para a diretoria no comitê são pendências, não permissões automáticas.

Base: D0. Campos e comportamento detalhado de inativação são propostas de implementação.


## Página 16 do escopo revisado

**CATÁLOGO DE TELAS • T20 A T23**

### 14. Administração dos modelos e parâmetros

#### T20 | Roteiros e versões

Administrativo edita; demais perfis consultam conforme autorização. Manter disciplina, modelo, identificação documental, revisão, grupos, subgrupos, itens, enunciados e orientações. Criar uma revisão nova em vez de sobrescrever uma versão já utilizada.

A importação deve conservar a ordem, números, unidades e páginas de origem. Divergências do original ficam registradas para decisão técnica, sem renumeração ou “correção” silenciosa pelo agente.

#### T21 | Pesos, medidas e regras de avaliação

Manter parâmetros por disciplina e modelo: opções de resposta, pesos de itens/grupos quando aplicáveis, unidades, regras de rateio, arredondamento, aplicabilidade e condições de encaminhamento. Usar apenas regras fornecidas e validadas pela empresa.

Pesos não informados ficam nulos / “A definir”. Distinguir esse estado de peso zero expressamente configurado. Antes de disponibilizar cálculo operacional, conferir totais, testes de referência e regras de itens/grupos N/A e sem base de cálculo.

Não oferecer campo livre de nota final nem executar código arbitrário escrito no formulário. Alteração da configuração deve registrar autor, motivo, versão e vigência. Aprovação técnica interna de novas regras, se exigida pela empresa, permanece a definir.

#### T22 | Modelos de relatórios

Revisar cabeçalho, identificação, campos, sequência de seções, apresentação de fotos, resultados e regras de exibição por modelo. A prévia usa dados de teste claramente identificados. Revisões valem para usos futuros, sem redesenhar relatórios já publicados.

Preservar a regra de não indicar pesos no formulário F.175 publicado. Demais regras de layout e visibilidade precisam seguir cada modelo. [F1, grupo 1.]

#### T23 | Histórico de manutenção

Exibir mudanças de cadastros, acesso, roteiro e parâmetros com autoria, horário e motivo. Proposta: comparação entre versões e registro de ativação/inativação. O perfil Administrativo consulta o histórico, mas não dispõe de ação para apagá-lo.

> Manter modelos não é revisar auditoria emitida
> Nenhuma dessas telas terá comando para modificar respostas, nota, anexos ou identificação de um relatório publicado. A revisão administrativa pertence ao modelo, não ao documento já emitido.

Base: D0; F1; F3, pp. 26–30. Regras de configuração de detalhe são propostas a validar.


## Página 17 do escopo revisado

**REGRAS DOCUMENTAIS • F.175 E F.176**

### 15. Qualidade: metodologia e configuração

Os modelos são diferentes dentro do módulo Qualidade. Os totais abaixo são a soma dos pesos explicitamente apresentados nos documentos; não substituem a definição de como cada resposta gera pontuação.

| GRUPO | F.175 SIMPLIFICADO | F.176 COMPLETO |
| --- | --- | --- |
| Controle de Qualidade | Não consta | 1,80 |
| Armazenamento de Materiais | 3,00 | 1,90 |
| Execução dos Processos | 1,50 | 1,00 |
| Treinamento | Não consta | 0,60 |
| Ambiente de Trabalho | 1,50 | 1,10 |
| Inspeções e Ensaios | 4,00 | 3,20 |
| Melhoria Contínua | Não consta | 0,40 |
| Total dos pesos dos quesitos | 10,00 | 10,00 |
| Estrutura do modelo | 10 quesitos em 4 grupos | 23 quesitos em 7 grupos |

#### Rateios que o sistema deve preservar

Armazenamento: F.175 destina 1,50 ao quesito; F.176, 1,00. Ambos orientam dividir a pontuação pela quantidade de materiais estocados. FVS: F.175 destina 4,00 e orienta distribuir pelos serviços verificados; F.176 destina 3,00 e orienta dividir pelos serviços auditados. [F1, grupos 1 e 4; F2, grupos 2 e 6.]

Proposta de formulário: registrar os materiais e os serviços usados no rateio, além da quantidade, para explicar a distribuição. O método de avaliação de cada parcela e o tratamento de quantidade zero ainda precisam ser confirmados.

#### O que ainda não está definido

Opções de resposta; pontuação parcial; tratamento de não aplicáveis; base e arredondamento dos rateios; faixas e cores do Farol; eventual meta mínima própria; periodicidade e prazo/modelo do plano de ação de Qualidade. Não aplicar a nota 7 ou as 72 horas da Segurança por analogia.

> Comitê de Qualidade desativado
> O usuário confirmou que a rotina do comitê é particular de Segurança atualmente. A aplicação poderá receber uma regra futura para Qualidade, sem que ela seja exigida nesta versão.

Base: F1, grupos 1–4; F2, grupos 1–7; D0. Somatórios e contagens conferidos a partir das tabelas fornecidas.


## Página 18 do escopo revisado

**REGRAS DOCUMENTAIS • IT.07 REVISÃO 02**

### 16. Segurança: metodologia e limites do cálculo

A IT.07 é a fonte principal dos critérios atuais de Segurança no projeto. O catálogo estruturado fornecido reúne 205 itens, 27 grupos e 37 subgrupos para integração e conferência, sem substituir a aprovação técnica da fonte. [F3; F5.]

#### Regras documentadas

A auditoria é mensal e utiliza, na regra geral, respostas 0, 5, 10 e N/A. Nos grupos Treinamentos e Documentação Legal Obrigatória, o documento orienta amostragem aleatória de 10% do efetivo da obra, incluindo operadores. A plataforma deve disponibilizar essa orientação e registrar os dados de amostragem necessários, sem inventar um critério de arredondamento. [F3, p. 1.]

O cálculo possui pesos de itens e grupos, além do multiplicador 1,0 para a fase representativa mencionado no texto. A avaliação final utiliza a soma dos resultados ponderados dos grupos dividida pela soma dos pesos considerados. Não é um simples percentual de perguntas conformes. [F3, pp. 26–30.]

#### Referência de teste, não tabela completa de configuração

O exemplo de Treinamentos apresenta pesos individuais 10, 10, 10, 20, 10 e 15; 550 pontos obtidos sobre 750 possíveis; aproveitamento 7,33; peso do grupo 2 e resultado 14,66. Esses valores pertencem ao exemplo e não devem ser copiados para os demais grupos. [F3, p. 28.]

#### Pendências antes da nota operacional

Falta a tabela completa de pesos individuais. Devem ser validados arredondamento, aplicação do multiplicador, tratamento de N/A, grupos totalmente não aplicáveis e base nula. Na p. 27, a explicação do exemplo cita notas 0 ou 10, enquanto a regra geral admite 5; a aplicação deve conservar essa diferença documental para validação, não eliminar uma opção por suposição.

Os pesos de grupo documentados devem ser preservados. Pesos de item ausentes continuam “A definir”. A referência Boulevard Agosto, com nota 7,08 e data de 19/08/2026, é histórica e anterior à aprovação da revisão 02 da IT.07 em 08/09/2026. Não ajustar os pesos da revisão atual para forçar a reprodução daquela nota. [F4, p. 2; F3, p. 30.]

> Critérios íntegros
> Preservar orientações vinculadas aos itens, inclusive quando continuam em outra página. O catálogo registra divergências de nomes/códigos e unidades que devem ser verificadas antes de validações automáticas de medidas.

Base: F3, pp. 1, 26–30; F4, p. 2; F5, metadados e ressalvas de transcrição.


## Página 19 do escopo revisado

**REQUISITOS DE INTEGRIDADE • PROPOSTA DE IMPLEMENTAÇÃO**

### 17. Dados, vínculos e preservação do histórico

Os registros abaixo devem ser separados para que a manutenção de um deles não modifique retrospectivamente outro.

| REGISTRO | VÍNCULOS E REGRA PRINCIPAL |
| --- | --- |
| Obra e usuários | Cadastros ativos e permissões vigentes. O relatório preserva os dados de identificação usados na emissão. |
| Modelo e versão | Roteiro, quesitos, orientações, parâmetros e modelo de relatório versionados por disciplina. |
| Agendamento e auditoria | Obra, auditor responsável, datas, modelo/versão e situação do preenchimento. |
| Resposta do item | Identificador estável da auditoria/versão/item, resposta, observação, justificativa e medições. |
| Evidência da inspeção | Arquivo e metadados vinculados ao item; após publicação, não pode ser substituída ou removida pela aplicação. |
| Relatório publicado | Cópia completa e fixa do conteúdo emitido, resultado e arquivos. Somente consulta. |
| Plano de ação | Referência ao relatório e aos apontamentos, conteúdo próprio da obra, autor e versão enviada. |
| Parecer da coordenação | Registro próprio sobre o plano, com autor e data; não reescreve o plano ou o relatório. |
| Comitê e apresentação | Referência à auditoria de Segurança, materiais apresentados, reunião e encaminhamentos. |
| Histórico de eventos | Registra acessos administrativos relevantes, alterações de rascunho/configuração, envios e publicação. |

#### Imutabilidade além do botão

O bloqueio de relatório publicado deve alcançar os dados relacionados, anexos e exportações. Regenerar o PDF usando o nome atual da obra, novos pesos ou um modelo visual atualizado não atende à regra de preservação. Proposta: guardar o documento emitido e a base de dados que o explica.

Atualizações de acesso mudam quem pode consultar, não a autoria ou o conteúdo publicado. A criação de um plano pode adicionar um vínculo externo, mas não alterar a nota, texto ou anexos da avaliação original.

> Sem promessa de inviolabilidade absoluta
> A exigência funcional é impedir alterações por todos os perfis da aplicação. Proteção de infraestrutura, cópias de segurança e controles de administradores técnicos também precisam ser definidos e testados na implantação.


## Página 20 do escopo revisado

**REQUISITOS PARA USO REAL • PROPOSTA TÉCNICA**

### 18. Operação, salvamento e controle de acesso

#### Persistência obrigatória antes do uso operacional

A versão de produção deverá salvar rascunhos, respostas, fotos, planos e apresentações em armazenamento persistente. Fechar o navegador ou trocar de aparelho não poderá apagar o que já foi confirmado como salvo. A limitação “somente nesta sessão” pertence ao protótipo, não ao produto final.

A interface deve distinguir salvando, salvo e falha no salvamento. Não informar sucesso antes de confirmar a gravação. Em falha, preservar o que for possível no formulário e informar claramente a pendência; não prometer recuperação de conteúdo que não foi gravado.

#### Proteções funcionais

| REQUISITO | CRITÉRIO PROPOSTO |
| --- | --- |
| Permissões reais | Validar perfil, obra, disciplina e responsabilidade no servidor, banco, anexos e exportações; não apenas ocultar menus. |
| Arquivos privados | Restringir consulta por autorização. Validar tipo/tamanho e impedir troca silenciosa de evidência publicada. |
| Concorrência | Evitar que duas abas ou dois usuários sobrescrevam dados sem aviso. Repetir o envio não deve duplicar publicação ou entrega. |
| Rascunho e versão | Mudar modelo ou versão não pode apagar respostas silenciosamente. Política de migração de rascunhos deve ser validada. |
| Datas | Exibir padrão brasileiro e fuso definido para a operação. Distinguir data prevista, inspeção, publicação e envio do plano. |
| Backup e recuperação | Definir cópias de banco e arquivos e testar restauração com relatórios e vínculos íntegros. Responsáveis e periodicidade ainda serão aprovados. |

#### Uso no computador, tablet e celular

Layout responsivo, botões legíveis e navegação acessível. Formulários e orientações longas não podem esconder os controles de troca de item. A primeira versão operacional será on-line; funcionamento sem internet exige um projeto próprio de sincronização, não está incluído automaticamente.

#### Situação técnica e limite desta especificação

O histórico mostra um projeto Next.js com TypeScript e Tailwind no VS Code. Supabase para acesso/dados/arquivos e hospedagem foram propostos, mas a configuração atual não foi inspecionada neste documento. Fornecedor, plano, credenciais, custos e publicação exigirão validação própria; não há autorização de contratação ou lançamento neste escopo.


## Página 21 do escopo revisado

**PROPOSTA DE TELAS GERENCIAIS E SAÍDAS**

### 19. Indicadores, consultas e entregas

#### Indicadores que a plataforma poderá mostrar

| VISÃO | INFORMAÇÕES COERENTES COM O PROCESSO |
| --- | --- |
| Auditor | Visitas agendadas; rascunhos próprios; auditorias publicadas; pendências de preenchimento e de parâmetros. |
| Equipe da obra | Resultados publicados; apontamentos registrados; planos pendentes/em elaboração/enviados; apresentações de Segurança quando exigidas. |
| Coordenação | Notas publicadas por obra e período; planos disponíveis para avaliação; notas de Segurança abaixo de 7; apresentações e encaminhamentos do comitê. |
| Administrativo | Obras/usuários ativos; vínculos de acesso; modelos e versões; parâmetros faltantes; histórico de manutenção. |

Filtros propostos: obra, disciplina, período, modelo, versão, auditor e situação. Informar se o período se refere à inspeção, publicação, envio do plano ou reunião. Os totais devem corresponder aos registros filtrados.

#### O que os indicadores não podem afirmar

Não exibir “percentual de correções comprovadas”, “não conformidades encerradas” ou “tempo de solução” sem existir processo para registrar e verificar isso. “Plano enviado” e “apresentação realizada” representam entregas documentais, não eficácia comprovada das medidas.

Não misturar rascunhos com resultados oficiais. Não usar zero para nota pendente. Não comparar Qualidade e Segurança por média única nem apresentar nota de modelos diferentes como equivalente sem identificar a metodologia.

#### Relatórios e obtenção de documentos

Entregas previstas: relatório definitivo da auditoria, plano de ação enviado, material da apresentação ao comitê e consulta gerencial. A exportação deve respeitar os mesmos acessos da tela. O relatório emitido permanece fixo; uma exportação gerencial não pode substituir o original.

Proposta: PDF para consulta/impressão e exportação tabular de indicadores, se aprovada. O modelo final de cada saída deve ser conferido pela empresa. A geração de apresentação automática em PowerPoint não foi solicitada como requisito obrigatório.

#### Avisos

Proposta: avisos dentro da plataforma para agendamento, publicação e entregas pendentes. E-mail, WhatsApp e integração com calendários externos não estão assumidos. Não emitir alerta de atraso enquanto marco inicial, prazo e regra de contagem não estiverem aprovados.


## Página 22 do escopo revisado

**PLANEJAMENTO PROPOSTO • NÃO É CRONOGRAMA CONTRATADO**

### 20. Etapas de implantação e limites

| ETAPA | ENTREGA E CONDIÇÃO DE AVANÇO |
| --- | --- |
| 1. Validar o escopo | Revisar este documento e a matriz, registrar as pendências e preparar o prompt incremental. Pesos faltantes não impedem as telas e os cadastros; impedem o cálculo oficial correspondente. |
| 2. Adequar o protótipo | Organizar módulos, menus e jornadas conforme os quatro perfis. Preservar catálogos e navegação já desenvolvidos. Não considerar simulação de usuário como controle de acesso real. |
| 3. Criar acesso e persistência | Implementar contas, vínculos, obras, rascunhos e arquivos persistentes, com testes de isolamento e salvamento. |
| 4. Consolidar cálculo e publicação | Cadastrar parâmetros faltantes, validar métodos, discussão com a obra e publicação imutável. Impedir emissão incorreta. |
| 5. Planos e comitê | Implementar o modelo aprovado do plano, sua entrega e avaliação; apresentação de Segurança abaixo de 7. |
| 6. Piloto e lançamento | Executar testes, revisar documentos gerados, restaurar backup em teste e realizar piloto autorizado. Só então publicar para uso real. |

#### Fora do escopo inicial

Acompanhamento de execução da obra: cronograma físico-financeiro, avanço de serviços, medições de produção, orçamento, plantas de personalização e reprodução do nexobra-main.

Fluxos não adotados: aprovação obrigatória do coordenador/Administrativo para publicar; envio geral de correções executadas; reinspeção e aprovação de encerramento de cada apontamento; comitê de Qualidade ativo; retificação de relatório publicado.

Integrações e automações não aprovadas: sincronização AUTODOC, WhatsApp, assinatura certificada, aplicativo nativo, modo offline, importação automática de todo o histórico e avaliação técnica por IA.

#### Evoluções possíveis, não compromissos desta versão

Comitê de Qualidade com regra própria; integrações documentais; novos roteiros e melhorias de análise. Qualquer ampliação deve ter decisão de escopo, permissões e vigência, sem alterar o histórico emitido.

> Estado do desenvolvimento
> O protótipo existente é ponto de partida. A ordem acima não autoriza apagar o projeto, recriar o aplicativo ou declarar funções concluídas sem examinar os arquivos e executar os testes.


## Página 23 do escopo revisado

**VALIDAÇÕES NECESSÁRIAS**

### 21. Pendências que não podem ser presumidas

As decisões de processo já estão consolidadas. Os detalhes abaixo permanecem abertos e devem ser resolvidos antes de ativar as respectivas funções em produção.

| ID | PONTO A DEFINIR | IMPACTO |
| --- | --- | --- |
| P01 | Pesos individuais completos de Segurança; arredondamento; fator de fase; regras de N/A/base nula e uso de nota 5 no exemplo. | Bloqueia nota oficial de Segurança. |
| P02 | Respostas e conversão em pontos na Qualidade; rateios, aplicabilidade, quantidade zero, faixas do Farol e eventual meta. | Bloqueia nota/classificação oficial de Qualidade. |
| P03 | Formulários oficiais de plano de ação dos dois módulos; campos obrigatórios e relação com AUTODOC. | Define T14 e as saídas do plano. |
| P04 | Marco inicial e contagem das 72h de Segurança; prazo e periodicidade de Qualidade. | Define avisos de prazo sem confundir com execução. |
| P05 | Como registrar o acordo da obra; se haverá confirmação por uma conta da obra; conduta quando não houver consenso. | Define a conclusão de T10, sem aprovação de coordenador. |
| P06 | Condições para publicar: itens não verificados, justificativas, anexos obrigatórios e configuração incompleta. | Proposta: bloqueio da publicação definitiva sem base válida. |
| P07 | Complementação/reenvio de plano; nomes dos pareceres da coordenação; edição após envio. | Não criar aprovação das correções por inferência. |
| P08 | Responsável por agenda/ata do comitê; composição incluindo eventual diretoria; modelo da apresentação. | Define edição de T17, sem quinto perfil automático. |
| P09 | Consulta de rascunhos fora da discussão; consulta administrativa a anexos; pesos visíveis por perfil/modelo. | Refina as matrizes 04 e 05. |
| P10 | Substituição de auditor em rascunho, cancelamento de agenda e mudança de modelo/versão antes da emissão. | Evita perda de dados e edição indevida. |
| P11 | Campos finais de obras; múltiplas funções; forma de autenticação; responsáveis por configuração técnica. | Refina T01, T18 e T19. |
| P12 | Hospedagem, custos, retenção, capacidade de arquivos, backup e responsável pelo piloto. | Condição de implantação operacional. |

Divergências entre texto, tabela e catálogo devem continuar registradas. Nenhuma pendência autoriza o agente a completar pesos ou adotar requisitos normativos externos sem solicitação e validação.


## Página 24 do escopo revisado

**TESTES PROPOSTOS • EVIDÊNCIA DE FUNCIONAMENTO**

### 22. Critérios de aceite para o piloto

A aprovação visual ou a compilação do código, sozinhas, não comprovam o funcionamento. Os testes devem registrar resultado real, falhas e pendências, sem indicar execução que não ocorreu.

| TESTE | RESULTADO ESPERADO |
| --- | --- |
| A01. Separação de módulos | AQ não edita Segurança; AS não edita Qualidade; Engenharia só acessa suas obras. |
| A02. Acesso direto | URL, pesquisa, arquivo e exportação não contornam as permissões. |
| A03. Catálogo íntegro | Conferir 205 códigos/textos de Segurança e orientações; preservar F.175/F.176, sem perguntas genéricas. |
| A04. Respostas independentes | Responder dois itens, navegar e voltar sem perder/misturar notas, observações, medições ou anexos. |
| A05. Sem resposta automática | Nova auditoria inicia vazia; zero escolhido é mantido; N/A e não respondido não são equivalentes. |
| A06. Persistência | Após confirmação de salvamento, recarregar e entrar novamente recupera rascunho e arquivos. |
| A07. Fechamento correto | Auditor discute com a obra e publica sem aprovação obrigatória do coordenador. |
| A08. Cálculo validado | Casos de referência corretos; parâmetro ausente não gera nota; não usar fórmula genérica substituta. |
| A09. Relatório imutável | Nenhum perfil altera resposta, nota, identidade ou foto após publicar, inclusive por acesso direto. |
| A10. Revisão sem retroatividade | Atualizar obra, usuário, roteiro, pesos e layout não muda documento já publicado. |
| A11. Plano separado | Enviar plano/parecer não altera o relatório; a entrega não marca automaticamente todos os itens como corrigidos. |
| A12. Regra do comitê | Segurança 6,99 encaminha; 7,00 não encaminha por nota; pendente não compara; Qualidade não encaminha. |
| A13. Nova visita | Relatório anterior consultável; respostas da nova auditoria permanecem independentes. |
| A14. Falha e duplicidade | Falha de envio é informada; repetição não duplica auditoria, plano ou apresentação. |
| A15. Documento emitido | PDF e anexos correspondem ao publicado; F.175 não exibe pesos; páginas e fotos legíveis. |
| A16. Recuperação | Backup restaurado em teste conserva relatórios, anexos, vínculos e limites de acesso. |

O teste de limite 6,99/7,00 considera notas finais já consolidadas. O efeito do arredondamento sobre o limite deve ser aprovado em P01 antes da automação.


## Página 25 do escopo revisado

**REFERÊNCIAS E VALIDAÇÃO DO ESCOPO**

### 23. Fontes e ficha para revisão

| REF. | BASE UTILIZADA |
| --- | --- |
| D0 | Decisões do responsável pelo projeto nesta conversa: independência do nexobra-main, módulos, quatro perfis, discussão antes da publicação, papel posterior da coordenação, planos, comitê exclusivo de Segurança e relatório publicado somente para consulta. |
| F1 | F.175 — Roteiro Farol da Qualidade Simplificado.docx. Identificação F.175/00. Grupos 1–4 e instrução para não mostrar pesos nos formulários publicados. |
| F2 | F.176 — Roteiro Farol da Qualidade Completo.docx. Identificação F.176/00. Grupos 1–7, quesitos, pesos e orientações de rateio. |
| F3 | IT.07, revisão 02 — Diretrizes de Inspeção de Segurança. Arquivo 080926121553_it-07_rev02_diretrizes_de_inspecao_de_seguranca_-_identidade_atualizada.pdf. 30 páginas; aprovação registrada em 08/09/2026. |
| F4 | Boulevard Agosto.pdf. Relatório histórico de inspeção, criado em 19/08/2026, nota 7,08; seção de relatório fotográfico e ocorrências. Referência de documento preenchido, não de todos os pesos da revisão atual. |
| F5 | CATALOGO_SEGURANCA_IT07_R02.json. Base derivada do PDF para integração e conferência: 205 itens, 27 grupos, 37 subgrupos, orientações e ressalvas. Não é aprovação operacional da metodologia. |

As referências indicam conteúdo dos materiais fornecidos, não uma verificação independente de vigência normativa. O escopo não altera o significado das fontes nem cria limites técnicos ausentes. Os prompts antigos são antecedentes de desenvolvimento, não autorização para manter fluxos depois descartados pelo usuário.

#### Ficha de revisão do documento

| CAMPO | REGISTRO PARA PREENCHER |
| --- | --- |
| Revisor / área | ______________________________________________________ |
| Data da revisão | ______________________________________________________ |
| Situação do escopo | Aprovado para detalhamento / Aprovado com ajustes / Revisar |
| Seções que precisam de ajuste | ______________________________________________________ |
| Decisões sobre as pendências | Registrar por ID P01–P12, indicando decisão e responsável. |

> Próximo marco
> Após sua análise, consolidar os ajustes e só então transformar este escopo no prompt incremental do VS Code. A aprovação deste documento não publica a aplicação nem altera automaticamente seus arquivos.

---

**FIM DO ESCOPO REVISADO**

Lembrete de execução: somente o Bloco A da Parte I está autorizado neste pedido.
