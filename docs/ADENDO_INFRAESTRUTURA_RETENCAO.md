# D03 — Infraestrutura inicial e retenção

Data: **13/09/2026**. Fonte: decisão consolidada do responsável pelo projeto nesta conversa. D03 estava disponível ao registrar este adendo. **Decisões confirmadas, ainda não implementadas/configuradas.** Esta execução autoriza somente documentação.

## 1. Precedência e diferença em relação ao original

O [escopo revisado original](../PROMPT_DIALOGO_AUDITORIAS_ESCOPO_REVISADO.md) permanece intacto. Sua Parte I, seção 7, e Parte II, seção 17, determinavam a preservação das evidências após publicação, sem remoção ou substituição. **D03 introduz uma exceção posterior exclusivamente para a cópia fotográfica avulsa da inspeção**, sob prazo e proteções abaixo. A fotografia incorporada ao PDF continua preservada. Não é autorização geral para apagar evidências ou documentos.

Relatórios publicados continuam terminais e somente para consulta: não editar, reabrir, retificar, recalcular, substituir ou excluir a auditoria ou seu PDF definitivo. Permanecem preservados respostas, notas, observações, medições, versões e vínculos. A rotina de retenção não altera esse conteúdo imutável.

O [D02 — cadastro e autenticação](ADENDO_CADASTRO_AUTENTICACAO.md) permanece vigente: e-mail válido de domínio exatamente `dialogo.com.br`, senha própria criada no cadastro, confirmação pelo serviço e aprovação administrativa; após aprovação, a mesma senha. D03 substitui apenas a situação anterior de infraestrutura ainda não escolhida. D01 permanece: Administrativo agenda/reagenda; auditor realiza a auditoria sob sua responsabilidade. Não define responsável pela agenda do comitê, não resolve pesos e não cria aprovação administrativa de auditorias.

## 2. Infraestrutura escolhida

| Decisão confirmada | Alcance | Situação verificada nesta execução |
| --- | --- | --- |
| Manter GitHub para o código. | Versionamento do projeto. | Decisão registrada; vínculo com repositório remoto e configuração corporativa não foram verificados externamente. |
| Primeira instância paga do Render para a aplicação publicada do piloto. | Hospedagem inicial do piloto, quando houver autorização de implantação. | Escolhida; contratação, configuração e publicação não comprovadas nem executadas. Não foi definido aqui preço ou nome comercial de plano. |
| Supabase Free para autenticação, banco e arquivos. | Provedor e modalidade inicial definidos. | Escolhido; integração local e ambientes configurados não identificados. Não houve criação de conta/projeto. |
| Desenvolvimento separado do piloto. | Separar configuração, identidades, dados e arquivos; não promover exemplos a registros operacionais. | Regra confirmada; desenho e configuração dos ambientes pendentes. |
| Preparar expansão futura. | Permitir ampliar a arquitetura e a capacidade posteriormente. | Não contratar capacidade de longo prazo agora. |

Escolha não comprova contratação, provisionamento, conexão ou disponibilidade. Não foram consultados painéis nem verificados preços, cotas atuais, capacidade, região disponível ou recursos de backup dos fornecedores. Validar as condições aplicáveis antes de configurar; não presumir que Free inclui backup suficiente, que comporta os ambientes pretendidos ou que atende ao volume futuro de fotografias.

**Proposta técnica para detalhamento:** projetos e configurações distintos de Supabase para desenvolvimento e piloto, sujeitos à disponibilidade e à validação da separação. Usar configuração própria de cada ambiente e uma camada de acesso a identidade/dados/arquivos que preserve IDs, vínculos e versões em uma expansão. Manter arquivos persistentes em armazenamento privado, sem depender do disco da aplicação hospedada. GitHub para código não equivale a backup de PDFs ou banco. Esses detalhes são planejamento, não arquitetura já implementada nem autorização para criar os dois ambientes.

## 3. Estado atual conferido

O protótipo mantém usuários demonstrativos e permissões locais em `src/domain/prototype-access.ts`; visitas, auditorias e respostas da sessão ficam em estado React em `prototype-app.tsx`. Não foi identificada integração real de autenticação, banco ou arquivos privados. Fechar/recarregar perde os dados digitados da sessão.

Não há upload de fotos, publicação definitiva, PDF persistido, backup/restauração ou rotina de limpeza implementados. A prévia com `window.print()` não comprova PDF definitivo salvo. `AuditRecord` possui data de inspeção, mas não um registro de publicação concluída emitido pelo servidor; essa data não pode iniciar a retenção. Um estado de publicação usado em testes demonstrativos também não comprova emissão real. As configurações locais dessas integrações continuam pendentes; nenhuma credencial foi exibida.

## 4. Retenção confirmada e marco temporal

As fotografias avulsas da inspeção serão mantidas por **30 dias corridos após a publicação concluída do respectivo relatório**. A data/hora de publicação deverá ser registrada pelo servidor responsável pela conclusão da publicação.

**Elegibilidade temporal = data/hora de publicação concluída registrada pelo servidor + 30 dias corridos.** O prazo completo deve ter transcorrido; atingir o prazo é necessário, mas não basta para remover o arquivo.

- Não contar do upload, da visita, do início da auditoria ou do mês seguinte.
- Sem publicação concluída não há início do prazo. Fotos de rascunhos não entram nessa rotina, mesmo se antigas.
- Falha/tentativa de publicação, prévia ou arquivo provisório não iniciam o prazo.
- Não inferir nem preencher retroativamente a data de publicação a partir da inspeção. Publicação sem marco confiável deve preservar as fotos e gerar pendência.

**Detalhe técnico proposto:** representar os instantes com fuso explícito e comparação no servidor, preferencialmente em UTC, exibindo o fuso adequado na interface. Validar a implementação da contagem e seus limites sem arredondar para início/fim de mês ou encurtar os 30 dias completos. Nomes de campos e representação ainda serão definidos no contrato de dados.

| Categoria | Tratamento confirmado |
| --- | --- |
| Fotografia avulsa da inspeção com relatório publicado | Pode tornar-se elegível após o prazo, desde que todas as proteções da seção 5 sejam satisfeitas. |
| Foto de rascunho ou sem publicação concluída | Fora desta rotina; nenhuma limpeza por idade de upload é autorizada. |
| PDF publicado | Permanece no histórico, íntegro e legível, com todas as imagens incorporadas ao próprio documento; não depende de links para as fotos avulsas. |
| Dados estruturados da auditoria | Respostas, notas, observações, medições, versões e vínculos permanecem preservados. |
| Planos, apresentações e documentos de outras categorias | Não entram automaticamente nesta limpeza. Sua retenção não foi definida por D03. |

## 5. Proteções obrigatórias antes de qualquer remoção futura

Todas as condições abaixo devem ser comprovadas para cada arquivo:

1. **Prazo completo de 30 dias**, calculado pelo marco de publicação do servidor.
2. **PDF definitivo salvo, íntegro e legível**, correspondente à publicação em questão.
3. **Fotografia incorporada ao próprio PDF e vinculada ao item correto.** Uma URL, miniatura externa ou mera existência do PDF não comprova incorporação correta.
4. **Cópia de segurança desse PDF confirmada.** Destino, rotina, responsável e verificação ainda serão definidos; backup somente do banco não comprova cópia do arquivo PDF.
5. **Ausência de bloqueio de preservação.** Critérios, responsáveis por registrar/retirar bloqueios e tratamento de exceções permanecem pendentes.
6. **Ausência de outros vínculos que exijam manter o arquivo.** Verificar todos os usos do objeto; a elegibilidade de um relatório não libera uma foto compartilhada ainda necessária em outro vínculo.

Se qualquer condição falhar ou não puder ser comprovada, **preservar a foto e registrar a pendência**. Não apagar para liberar espaço a qualquer custo. Limite de capacidade exige análise e decisão responsável, sem redução automática do prazo ou supressão de proteções.

## 6. Registro e consulta após a retenção — detalhamento futuro

**Confirmado:** registrar execução e resultado da limpeza sem modificar a auditoria ou o PDF publicado. Manter os vínculos históricos; a exceção diz respeito ao objeto fotográfico avulso, não à autoria, identificação do item ou conteúdo técnico do registro.

**Proposta de implementação:** manter metadados de ciclo de vida e eventos de retenção separados do conteúdo imutável. Registrar referência do arquivo/relatório/item, marco e limite temporal, verificações, bloqueios/pendências, instante, executor técnico e resultado real por arquivo. O mecanismo, seus privilégios mínimos, periodicidade e responsável ainda serão definidos; não é uma nova permissão de exclusão manual para os quatro perfis.

Manter uma correspondência verificável entre foto, item e PDF definitivo; identificadores de versão, sumários de integridade e localizador no PDF são opções a detalhar. Revalidar as condições imediatamente antes de eventual remoção, inclusive novos bloqueios e vínculos. Planejar falha parcial, repetição segura e reconciliação entre arquivo e registro; não registrar sucesso antes de confirmar o resultado. Não presumir atomicidade entre banco e armazenamento de arquivos.

Após remoção da cópia avulsa, a consulta deverá informar **“A imagem permanece no relatório publicado.”** e oferecer acesso autorizado ao PDF preservado, em vez de apresentar links quebrados ou tentar recriar o PDF. Consulta/download continuam sujeitos a obra, módulo, responsabilidade e concessões vigentes. O texto e a apresentação final da mensagem são proposta de interface; a informação e o acesso sem link quebrado são requisitos confirmados.

## 7. Simulação antes da execução real

**Proposta obrigatória de validação prévia:** preparar uma simulação da limpeza, sem excluir arquivos, antes de habilitar qualquer execução real. Usar ambiente separado e casos controlados autorizados; inventariar candidatos e excluídos do recorte, motivos de preservação, marco temporal e comprovações das seis proteções. Não chamar operações de exclusão no modo de simulação nem alterar registros publicados.

Apresentar o resultado para conferência: quais cópias seriam elegíveis e quais seriam preservadas, com as razões. Um resultado de simulação não autoriza exclusão posterior por si só. Execução real exige publicação/PDF íntegros, backup confirmado e validado, definição das exceções e do responsável, testes, análise da simulação e **autorização específica futura**. Não ativar agendamentos nesta preparação.

## 8. Testes futuros — nenhum executado nesta rodada

| ID | Cenário e resultado esperado |
| --- | --- |
| D03-T01 | Instante anterior ao limite preserva a foto; no limite e após ele apenas fica temporalmente elegível, dependendo das demais proteções. |
| D03-T02 | Upload antigo/recente, visita ou mudança de mês não mudam o marco. Comparar instantes/fusos sem encurtar o prazo. |
| D03-T03 | Rascunho, publicação falha, prévia e ausência de data confiável não iniciam o prazo nem entram na remoção. |
| D03-T04 | PDF ausente, provisório, corrompido ou ilegível preserva fotos e registra pendência. |
| D03-T05 | Imagem ausente do PDF, dependente de link externo ou associada ao item errado bloqueia a remoção. |
| D03-T06 | Backup ausente, falho, não confirmado ou de outra versão bloqueia a remoção; testar recuperação do PDF com imagens antes de habilitar a rotina. |
| D03-T07 | Bloqueio de preservação existente ou criado após a simulação impede a remoção. |
| D03-T08 | Outro vínculo ainda exige o mesmo objeto: preservar, mesmo se um relatório já cumpriu o prazo. |
| D03-T09 | PDF, dados estruturados, planos, apresentações e outras categorias permanecem inalterados e fora da exclusão. |
| D03-T10 | Simulação identifica candidatos/pendências, sem excluir arquivos nem modificar conteúdo publicado. |
| D03-T11 | Falha parcial e repetição registram o resultado real, sem perda dos vínculos ou alteração da auditoria/PDF imutável. |
| D03-T12 | Após remoção autorizada em teste futuro, consulta informa preservação no relatório e abre PDF autorizado com imagens; nenhum link quebrado nem acesso por outra obra/módulo/conta revogada. |
| D03-T13 | Configuração de desenvolvimento não acessa dados/arquivos do piloto; demonstração permanece separada. |

Esses casos não são evidência de segurança, salvamento, backup ou retenção já aprovados. A09/A15/A16 operacionais continuam pendentes. Não foram executados testes da aplicação, exclusões ou simulações de limpeza nesta documentação.

## 9. Plano e pendências

**P12 parcialmente resolvida:** GitHub, primeira instância paga do Render para o piloto, Supabase Free, separação de desenvolvimento/piloto, expansão futura sem contratação antecipada e retenção fotográfica com marco/prazo/proteções estão confirmados. Permanecem configuração dos ambientes, envio de e-mails/remetente, responsáveis técnicos e do piloto, destino/rotina/responsável do backup e restauração, detalhes das exceções/bloqueios de preservação, limites de arquivos/capacidade e validação de custos e condições efetivas antes da contratação/configuração. Escolha do plano não é contratação executada.

**P11 continua parcialmente resolvida por D02.** Provedor agora escolhido por D03, mas responsáveis, campos finais, múltiplas funções e detalhes técnicos de conta continuam pendentes. P01–P10 não são resolvidas por esta decisão.

| Momento proposto no desenvolvimento | Entrega relacionada a D03 | Condição |
| --- | --- | --- |
| B.0 / primeira configuração de B.1 | Ambiente de desenvolvimento separado, identidade e banco protegidos para solicitações; confirmação/recuperação conforme D02. | Pré-requisitos da seção 10 e autorização específica. Sem limpeza, contratação Render ou piloto. |
| B.5 | Arquivos privados, categorias, vínculos e metadados que permitam futura retenção. | Tipos/limites/concessões aprovados, salvamento e acesso testados. Não implementar publicação ou limpeza nesta subetapa. |
| D | Publicação terminal com data/hora do servidor e PDF definitivo contendo todas as imagens. | Resolver condições metodológicas e de publicação pertinentes; comprovar integridade/incorporação. D03 não habilita cálculo/publicação. |
| F e autorização posterior específica da rotina | Backup/restauração de PDFs, bloqueios, simulação e validação antes de qualquer remoção real. | Todas as proteções, responsáveis, mecanismo e testes definidos; resultado conferido. Não avançar automaticamente. |

## 10. Pré-requisitos para a primeira configuração do Supabase de desenvolvimento

O provedor e o plano inicial já estão definidos; não repetir a escolha de método, domínio ou fornecedor.

1. **Responsável e acesso administrativo:** identificar quem administra a organização/conta Supabase e quem fará a configuração. Informar somente se estrutura corporativa já existe e se o acesso administrativo está disponível; não fornecer credenciais no chat.
2. **Ambiente:** definir identificação e região do projeto de desenvolvimento e aprovar o desenho que o separa do futuro piloto. Conferir disponibilidade/limites aplicáveis antes de criar qualquer recurso; não usar um projeto do piloto com dados reais como ambiente de teste.
3. **Autorização delimitada:** autorizar a criação/configuração desse ambiente de desenvolvimento e o recorte B.1 pertinente. Esta decisão documental não autoriza executar essa criação, contratar Render, publicar ou configurar o piloto.
4. **Configuração segura:** definir quem insere credenciais diretamente no ambiente apropriado e quais origens/endereços de retorno serão autorizados para confirmação/recuperação. Não colocar segredos no código, GitHub, documentação, logs ou conversa.

Para concluir a configuração de B.1 e testar o fluxo D02, providenciar também serviço de envio, **remetente legítimo autorizado**, caixas corporativas reais de teste e autorização de envios, parâmetros de conta/links/reenvios e procedimento controlado de designação do primeiro Administrativo. O domínio dos usuários não autoriza enviar em nome de `dialogo.com.br`; nenhum endereço remetente foi inventado. A escolha Supabase não comprova que a entrega de e-mails necessária já esteja configurada.

Definir backup e recuperação antes de armazenar dados que precisem de preservação e antes do piloto; comprovar cópia/restauração do PDF e resolver exceções antes de habilitar retenção. Esses últimos pontos não exigem implementar relatórios ou limpeza para criar um ambiente de desenvolvimento vazio.

## 11. Limites desta execução

Somente registro documental. Nenhum serviço contratado, conta criada, dependência instalada, integração configurada, migração, envio de e-mail, agendamento, exclusão, publicação ou alteração do protótipo. Servidor e `nexobra-main` preservados. A implementação e os testes operacionais permanecem para próximas autorizações.
