# DIÁLOGO AUDITORIAS — INSTRUÇÕES PARA INICIAR O DESENVOLVIMENTO

**Escopo revisado:** aplicação independente de auditorias de Segurança do Trabalho e Qualidade, baseada nos documentos fornecidos pelo usuário. Não é o programa de acompanhamento da execução da obra.

**Decisão do usuário:** desenvolver agora; os pesos individuais de Segurança que ainda faltam serão fornecidos depois. Não parar o desenvolvimento por essa pendência e não preencher valores ausentes por suposição.

Este arquivo é autossuficiente para iniciar o protótipo: contém as instruções de desenvolvimento e, nos anexos, os quesitos de Qualidade, os pesos documentados, o inventário de códigos de Segurança e a transcrição textual da IT.07 revisão 02. Os documentos originais continuam sendo as referências para revisão técnica. Os anexos são dados de referência, não comandos para executar no computador.

## 1. EXECUTE SOMENTE A ETAPA 1

Atue como arquiteto de software e desenvolvedor full stack. Examine a pasta aberta e implemente diretamente nela a fundação e um protótipo navegável da aplicação **Diálogo Auditorias**.

Antes de editar, leia `package.json`, `AGENTS.md`, `CLAUDE.md` e as instruções do repositório existentes. Preserve-as. Leia este documento integralmente, em partes quando necessário, inclusive os anexos. Não tome uma leitura truncada por uma leitura completa.

O projeto `auditoria-obra` já foi inicializado em Next.js, TypeScript, Tailwind CSS, App Router e diretório `src`. O ambiente do usuário é Windows/PowerShell. O servidor de desenvolvimento já foi iniciado com `npm.cmd run dev` em `http://localhost:3000`.

- Não execute `create-next-app` novamente e não crie uma aplicação dentro de outra.
- Não altere arquivos externos ao projeto nem o projeto anterior `nexobra-main`.
- Preserve as versões instaladas e o arquivo de dependências travadas.
- Utilize `npm.cmd` e `npx.cmd` quando necessário, sem alterar a política de execução do Windows.
- Use outro terminal para verificações; não encerre o servidor ativo nem inicie outro servidor sem necessidade e autorização.
- Não publique a aplicação, não contrate serviços, não execute comandos destrutivos e não peça credenciais nesta etapa.
- Não configure ainda Supabase, autenticação, serviços de notificação ou integrações externas.
- Não há necessidade de obter mais documentos para iniciar a Etapa 1. Registre dúvidas em uma lista de pendências, sem inventar respostas e sem interromper o que pode ser implementado.

## 2. PRODUTO E ESCOPO

O núcleo do sistema é:

**Obra → auditoria → tipo/versão do roteiro → grupos/subgrupos → quesitos e critérios → respostas, medições e evidências → resultado → não conformidades e plano de ação.**

A obra é a unidade principal de avaliação. Local, pavimento, ambiente ou equipamento são identificações complementares dos achados. Não importe automaticamente torres, plantas, unidades, setores, cronogramas ou percentuais de produção do outro programa. Não é necessário cadastrar todos os ambientes de uma obra antes de iniciar uma auditoria.

Prepare três tipos de roteiro separados:

1. Segurança — IT.07 revisão 02.
2. Farol da Qualidade Simplificado — F.175/00.
3. Farol da Qualidade Completo — F.176/00.

Não fundir versões nem transformar o F.175 em apenas um filtro do F.176. Os enunciados, pesos e rateios não são idênticos.

Não incluir planejamento físico-financeiro, medição de execução, BIM/3D, gestão de vendas, personalização de apartamentos, Autodoc automatizado, análise de imagens por IA ou aplicativo nativo nesta etapa.

## 3. FONTES, LIMITES E PRESERVAÇÃO

Use os anexos deste arquivo como base de transcrição. Preserve códigos oficiais, texto integral dos quesitos, ordem dos grupos, observações de interpretação, unidades e medidas citadas. Não substitua o conteúdo por checklists genéricos.

Cada quesito deve ter identificação do documento de origem, revisão e localizador da fonte (página, tabela ou ordem). Os códigos técnicos criados pelo software não são códigos oficiais: isso deve ficar explícito, especialmente para os quesitos de Qualidade que no original são perguntas dentro de grupos numerados.

As referências a NRs, normas, contratos e convenções são transcrições dos documentos internos, não uma verificação de legislação vigente. Não atualize, complete, corrija ou reconcilie esse conteúdo com conhecimento geral. Dúvidas devem ficar registradas para validação do responsável designado.

Os anexos identificam divergências existentes nas fontes. Preserve o enunciado original e guarde qualquer interpretação/mapeamento técnico separadamente, sem alteração silenciosa. Não use uma medida ambígua para decidir automaticamente conformidade.

O relatório **Boulevard Agosto.pdf** é uma referência histórica de apresentação, não o cadastro mestre da IT.07 revisão 02. Não inferir pesos pelas notas agregadas desse relatório, não usar seus achados como ocorrências atuais e não transferir automaticamente suas respostas para o roteiro novo.

Não incluir o relatório original, fotografias de pessoas, dados de funcionários, documentos pessoais ou fontes internas completas na pasta `public` ou em uma publicação externa. Nesta etapa, as auditorias preenchidas devem ser fictícias e claramente identificadas; os textos dos roteiros são transcritos das fontes reais.

## 4. PESOS AUSENTES NÃO BLOQUEIAM O DESENVOLVIMENTO

### 4.1 Separar informação coletada e cálculo

Devem existir estados independentes para:

- Situação da coleta: rascunho, em preenchimento, coleta concluída.
- Situação do cálculo: aguardando configuração, aguardando respostas, sem base de cálculo, disponível para validação.
- Situação da aprovação e das ações corretivas, a implementar com acesso real nas próximas etapas.

Pode-se preencher, revisar e concluir a coleta e registrar pendências mesmo quando o cálculo estiver indisponível. Não confundir isso com emissão de nota oficial, aprovação técnica ou encerramento de uma não conformidade.

Enquanto faltarem pesos ou regras necessários, mostrar **“Nota final pendente — configuração de pontuação incompleta”**, com os motivos identificados. Não mostrar `0,00`, `100%`, média simples, nota estimada, classificação por cor ou aprovação no lugar da nota ausente.

### 4.2 Representação dos dados

Peso ausente deve ser `null` e identificado como **“A definir”**. Não usar peso 0, 1, 10 ou rateio igualitário como substituição. Uma nota 0 é uma resposta válida de Segurança e não é ausência de dado.

Manter distintos: peso do item, peso do grupo, nota atribuída, aplicabilidade, quantidade amostrada, resultado calculado e multiplicador da fase. Pesos devem ser dados configuráveis, separados dos componentes de tela.

A configuração deve admitir origem do valor (documentado, exemplo documental, informado posteriormente), versão, autor e situação de validação. Na etapa local, o autor pode ser um perfil de demonstração, claramente marcado, sem fingir autenticação real.

### 4.3 Segurança

- Disponibilizar os códigos, grupos, subgrupos, critérios e observações da IT.07 revisão 02.
- A escala documentada é **0, 5, 10 e N/A**. Disponibilizar esses valores sem inventar limites quantitativos para decidir entre 0, 5 e 10.
- “Não respondido” e “Não verificado” são estados de coleta, não notas adicionais da escala. Diferenciá-los de N/A.
- Importar os pesos dos 27 grupos das páginas 26–27 da IT.07, preservando a origem.
- O exemplo de Treinamentos da página 28 informa seis pesos individuais. Preservá-los em campo separado como **exemplo documental**, sem extrapolar para outros itens e sem ativá-los como configuração oficial aprovada.
- Inicialmente, os pesos individuais operacionais de Segurança ficam pendentes. A área administrativa permitirá cadastrá-los posteriormente, sem reescrever as telas.
- O documento registra multiplicador de fase 1,0. Preservar esse valor como documentado; não inventar outros multiplicadores ou categorias de fase.
- Não obter uma nota geral ignorando silenciosamente itens/grupos com pesos pendentes.
- Planejar motor de cálculo isolado e testável. Validar métodos, arredondamento, tratamento de N/A e eventuais divergências antes de habilitar nota oficial.

### 4.4 Qualidade

- Importar os pesos documentados de cada roteiro exatamente como nos anexos.
- A soma dos pesos transcritos de cada roteiro é 10,00. Essa soma não significa que a obra recebeu nota 10.
- Preservar o rateio pela quantidade de materiais estocados e pela quantidade de serviços verificados/auditados conforme o texto específico de cada roteiro.
- Preparar listas de materiais e de serviços avaliados, sem atribuir automaticamente pontuação obtida a cada registro.
- Quantidade zero ou não informada não deve provocar divisão por zero nem redistribuição automática do peso para outros quesitos.
- Os roteiros fornecidos não estabelecem completamente a conversão de respostas em pontos, o atendimento parcial, o tratamento de não aplicáveis ou as faixas do farol. Manter essas regras pendentes, configuráveis e separadas da escala de Segurança.
- Não aplicar automaticamente 0/5/10 à Qualidade. Na primeira etapa, permitir observações e medições e, se útil, uma constatação qualitativa proposta para o protótipo, identificada como não validada e sem conversão em pontuação.
- No F.175, preservar a instrução de que os formulários publicados não terão a indicação dos pesos. Os pesos continuam disponíveis na configuração; não expô-los no modo formulário publicado do F.175.

### 4.5 Quando os pesos chegarem

Projetar uma tela **Configurações → Pontuação**, com seleção de roteiro/versão, grupo, código e peso do item, indicação de pendências e validação de entrada. Os valores futuros serão cadastrados pela interface, e não exigirão alteração em componentes de tela.

Guardar uma cópia da versão do roteiro/configuração associada a cada auditoria. Alterações não devem modificar auditorias anteriores silenciosamente. Para uma coleta realizada antes da configuração completa, prever uma ação explícita de aplicar uma versão validada e gerar uma nova revisão de cálculo, preservando a coleta original, a configuração anterior, o responsável e a data da operação. Não fingir que a configuração posterior já existia na data da auditoria.

Só liberar resultado oficial após regras, configuração, respostas e permissões estarem implementadas e validadas. Na Etapa 1, mesmo valores completos digitados pelo usuário são configuração de teste, não aprovação operacional.

## 5. TELAS E INTERAÇÕES DA ETAPA 1

### 5.1 Painel

Resumo de auditorias de teste, coletas em andamento/concluídas, ocorrências abertas e pendências de configuração. Filtros por obra, disciplina e período. Números devem corresponder às listas demonstrativas. Não exibir ranking de obras ou notas inventadas. Não misturar Qualidade Simplificada, Qualidade Completa e Segurança em uma média única.

### 5.2 Obras

Cadastro mínimo de identificação da obra, engenheiro(a) e coordenador; adicionar os dados necessários ao agendamento de auditoria. Usar uma obra fictícia inicial. Localização complementar opcional nos achados; não exigir uma árvore completa de pavimentos/unidades.

### 5.3 Roteiros e critérios

Listagem dos três modelos, versão, fonte, grupos, subgrupos e perguntas. Busca por código e texto. Exibir critérios completos e observações interpretativas junto ao item, inclusive as observações destacadas em vermelho no original. Mostrar na configuração pesos documentados e os pendentes, sem apresentá-los como notas obtidas.

Os dados devem ser separados dos componentes. Criar os catálogos a partir dos anexos. Na Segurança, a extração contém 205 códigos únicos nas seções de quesitos das páginas 1–26. Conferir a quantidade e a unicidade; não chamar de catálogo completo uma implementação que carregue só alguns grupos. Não criar perguntas a partir de cabeçalhos, de observações, da tabela-resumo ou dos exemplos das páginas 27–30.

### 5.4 Nova auditoria / preenchimento

Escolha da obra, modelo/versão, data da auditoria e auditor demonstrativo. Exibir apenas as perguntas da versão selecionada. Navegação entre grupos, progresso de preenchimento e retorno ao item. A versão selecionada fica vinculada à auditoria, sem substituição automática.

Em Segurança, registrar a seleção manual 0/5/10/N/A, observação, estado de coleta e localização complementar. Disponibilizar campo opcional para medições (valor, unidade e observação), sem comparar automaticamente com um limite ambíguo.

Em Qualidade, disponibilizar observações, constatação qualitativa de teste sem pontuação automática, materiais/serviços e medições pertinentes. A regra oficial de resposta permanece pendente de validação.

Exigir justificativas para N/A e Não verificado como regra proposta de rastreabilidade da aplicação, claramente distinta das notas documentadas. Não marcar nada automaticamente como conforme ou N/A. Permitir limpar uma resposta sem convertê-la em nota zero.

Preparar campo de evidências para achados conformes e não conformes. Uma pré-visualização de fotos locais é permitida, desde que a interface informe que não houve upload nem armazenamento permanente; libere os recursos de pré-visualização ao removê-los. Não usar fotos do relatório real como novas evidências.

Registrar achados e plano de ação não pode depender da existência de peso ou da conclusão do checklist. O fim da coleta pode ter pendências identificadas, mas nunca fingir cobertura completa se houver itens não respondidos/não verificados.

### 5.5 Auditorias

Lista com obra, disciplina, modelo/versão, data, auditor, situação da coleta e situação do cálculo. Detalhe com respostas e justificativas. Distinguir “Coleta concluída — nota pendente” de “Auditoria aprovada”.

### 5.6 Não conformidades e plano de ação

Permitir abrir uma ocorrência vinculada ao item/versão, incluindo descrição do achado, local, evidências de teste, ação proposta, responsável demonstrativo, prazo e situação. Permitir mais de um achado em locais diferentes no mesmo quesito sem duplicar o peso da pergunta.

Fluxo proposto para a aplicação: Aberta → Em tratamento → Aguardando reinspeção → Aguardando aprovação → Encerrada. Reprovação retorna para tratamento e preserva o ciclo anterior. “Atrasada” é um indicador derivado do prazo, não substitui a situação. Na Etapa 1, apresentar o fluxo e suas interações de teste sem afirmar que existe autorização real.

No fluxo operacional futuro, quem informa a correção não poderá aprová-la; encerramento exige validação técnica e aprovação designada. Não modificar a resposta original da auditoria quando uma ação for encerrada. Registre a reinspeção separadamente.

Prioridade operacional não deve ser derivada automaticamente do peso de pontuação. Achados urgentes precisam poder ser registrados mesmo sem foto/peso. Não apresentar o aplicativo como decisão autônoma de interdição, segurança ou retomada de serviço.

### 5.7 Relatórios

Criar uma visualização imprimível A4 de **relatório de coleta de teste**, com obra, versão do roteiro, critérios, respostas, observações, referências das evidências, ocorrências e plano de ação. Mostrar “Nota final pendente” quando necessário e destacar os itens não verificados e a cobertura incompleta.

Pode-se disponibilizar impressão pelo navegador se funcionar efetivamente. Não mostrar confirmação de geração/armazenamento de PDF inexistente. Não emitir farol com cores de classificação antes de validar suas faixas. Cores de navegação ou alertas de pendências não são faixas de nota.

Não reproduzir a identidade do fornecedor do relatório histórico. Usar o nome Diálogo Auditorias em texto, sem inventar logotipo oficial.

### 5.8 Configurações

Área de roteiros/versões, matriz de pesos e pendências de regras. Filtro “A definir”, edição de pesos de teste, origem e situação de validação. O cadastro de um peso não pode mudar o catálogo original transcrito; guardar a configuração editada separadamente. Botão para restaurar dados de demonstração com confirmação, sem apagar fontes.

Planejar os perfis Administrador, Auditor por disciplina, Engenharia/Coordenação, Assistente, Responsável pela correção e Leitor. Registrar a matriz para implementação futura, sem simular que esconder botões já constitui controle de acesso.

## 6. ARQUITETURA, DADOS LOCAIS E EXPERIÊNCIA

Usar Next.js/TypeScript/Tailwind já instalados, com layout corporativo claro, legível e responsivo. Menu lateral no computador e adaptação no celular. Todo o texto em português do Brasil. Usar datas brasileiras; distinguir datas de calendário de instantes com fuso.

Organizar tipos de domínio, catálogos e funções de pontuação/validação fora dos componentes. Definir interfaces de repositório para substituir a persistência local por banco posteriormente, sem alegar que essa integração já existe.

Na Etapa 1, as edições podem permanecer em memória durante a navegação. A aplicação deve informar claramente: **“PROTÓTIPO LOCAL — sem login e sem banco de dados. Use somente dados de teste. Alterações e fotos de teste serão perdidas ao atualizar ou fechar a página.”** Não prometer uso sem internet, sincronização ou retenção de dados.

Não implementar ações falsas: uma função não desenvolvida deve estar desabilitada com explicação visível. Não simular sucesso, envio de e-mail, aprovação autenticada ou salvamento permanente. Não exigir uma instalação de banco para abrir o protótipo.

Evitar dependências desnecessárias, segredos no código, leitura de diretórios externos, scripts de importação de origens desconhecidas e alterações nas versões principais das bibliotecas.

## 7. DOCUMENTAÇÃO E TESTES

Criar ou atualizar:

- `README.md`: como abrir o projeto e limitações do protótipo.
- `docs/ESCOPO.md`: aplicação independente e regras do produto.
- `docs/FONTES.md`: documentos, revisões e localizadores utilizados.
- `docs/PENDENCIAS_METODOLOGIA.md`: pesos faltantes, regras de Qualidade, faixas do farol, arredondamentos e divergências documentais.
- `docs/PERMISSOES.md`: proposta de matriz de acesso.
- `docs/PLANO.md`: etapas e critérios de aceite.

Verificar lint e TypeScript em outro terminal usando os comandos compatíveis com `package.json`. Não executar build concorrente com o servidor quando isso afetar seus artefatos. Informar o que foi e o que não foi executado, sem presumir sucesso.

Criar testes das regras isoladas quando viável, especialmente:

1. Peso ausente continua `null` e bloqueia nota consolidada, mas não impede preencher a coleta ou registrar ocorrência.
2. Nota 0, pergunta não respondida, Não verificado e N/A são distintos.
3. Os pesos dos F.175 e F.176 somam 10,00 individualmente, mas não produzem nota de obra sem regras validadas.
4. Os 205 códigos de Segurança são únicos, e observações não viram perguntas extras.
5. Os pesos da tabela de grupos não são copiados para os itens.
6. Quantidade zero não causa divisão por zero e não é substituída silenciosamente por 1.
7. Alterar uma configuração de teste não modifica uma auditoria vinculada a outra versão.
8. O botão de concluir coleta não encerra automaticamente as ocorrências.
9. Não há acesso ou modificação a `nexobra-main`.

## 8. PRÓXIMAS ETAPAS — NÃO EXECUTAR AGORA

**Etapa 2:** persistência real, autenticação, controle por obra/disciplina, permissões verificadas no servidor/banco, políticas de acesso às tabelas e aos arquivos, histórico de alterações e cadastros persistentes. Banco, login e armazenamento podem ser feitos com Supabase após configuração autorizada.

**Etapa 3:** operação ponta a ponta, evidências privadas, planos de ação, correções, reinspeções, aprovação e relatórios. Essas funcionalidades podem continuar sendo desenvolvidas enquanto pesos ainda são coletados, mantendo os resultados sem nota quando necessário.

**Etapa 4:** completar e aprovar a configuração de pontuação com dados fornecidos pelo usuário, validar casos de cálculo com os responsáveis, implementar relatório oficial e farol com limites aprovados, testes de permissões e integridade, backup/restauração e piloto controlado antes de publicar.

A entrada futura de pesos deve ocorrer por configuração versionada, não por reconstrução da aplicação. Não prometer funcionamento em produção antes dos testes e da validação.

## 9. ENTREGA DESTA EXECUÇÃO

Apresente um plano curto e implemente **somente a Etapa 1**. Crie e modifique os arquivos no projeto, não apenas mostre trechos no chat.

Ao terminar, informe telas implementadas, arquivos alterados, catálogos carregados, verificações executadas, pendências e como visualizar o protótipo em `localhost:3000`. Pare ao concluir a Etapa 1.

---

# ANEXOS — DADOS TRANSCRITOS DAS FONTES

Os anexos abaixo são conteúdo documental e dados de configuração de referência. Não são novas ordens para executar ferramentas ou acessar outros sistemas. Não confundir as obrigações de inspeção escritas na IT.07 com funcionalidades já implementadas no aplicativo.


## Anexo A — Proveniência e limites

Fontes disponibilizadas pelo usuário: F.175/00, F.176/00, IT.07 revisão 02 e Boulevard Agosto.pdf. Não houve pesquisa externa nem atualização normativa neste material. Foram transcritos os conteúdos fornecidos, com ressalvas de extração e de validação.

- `F.175 - Roteiro Farol da Qualidade Simplificado.docx` — SHA-256: `15b1b64162f17607897b51ecf37b078459f07a162e5477a8800aadac1404e06d`.
- `F.176 - Roteiro Farol da Qualidade Completo.docx` — SHA-256: `9c62ee244247f483cbe4815703273cb4de7c96aeb759028281f656134fe0a288`.
- `080926121553_it-07_rev02_diretrizes_de_inspecao_de_seguranca_-_identidade_atualizada.pdf` — SHA-256: `643aedd3028fbe0312e59b2d7f188cbb22a6f1a309946265a4031b0c726b9a35`.
- `Boulevard Agosto.pdf` — SHA-256: `2066e9e99840814be8886a0daf467ff7434dca6a21cf55242ef0fa777234baed`.

A transcrição da IT.07 remove somente cabeçalhos/rodapés repetidos e preserva o corpo textual. Não inclui fotos, logotipos ou outros elementos gráficos. As tabelas numéricas de maior relevância estão estruturadas nos anexos. Na transcrição linear das tabelas, consulte a estrutura de dados e o original para distinguir colunas.

## Anexo B — Catálogos de Qualidade

Extração das células dos documentos DOCX. Os localizadores tabela/linha são índices de extração iniciados em 1, não referências impressas. Os IDs `F175-Qxx` e `F176-Qxx` foram criados apenas para o software. Preservar os textos originais; não os substituir pelos IDs.

O campo `ocultar_pesos_no_formulario_publicado: null` no F.176 indica ausência dessa instrução no documento fornecido, não uma autorização automática de publicação dos pesos.

```json
[
  {
    "documento": "F.175",
    "revisao_documental": "00",
    "nome": "Farol da Qualidade Simplificado",
    "arquivo_fonte": "F.175 - Roteiro Farol da Qualidade Simplificado.docx",
    "quantidade_quesitos": 10,
    "soma_pesos_documentados": 10.0,
    "nota_de_obra": null,
    "situacao_metodologia": "pendente_de_validacao",
    "ocultar_pesos_no_formulario_publicado": true,
    "grupos": [
      {
        "ordem_documental": 1,
        "titulo_original": "1. Armazenamento de Materiais",
        "quesitos": [
          {
            "id_tecnico_nao_oficial": "F175-Q01",
            "ordem_no_grupo": 1,
            "texto_original": "Existe o controle de recebimento e aceitação de materiais (FVM)?",
            "peso_documentado": 0.5,
            "peso_texto_original": "0,50",
            "base_rateio_documentada": null,
            "localizador_docx": {
              "tabela": 2,
              "linha": 3
            }
          },
          {
            "id_tecnico_nao_oficial": "F175-Q02",
            "ordem_no_grupo": 2,
            "texto_original": "Existe o controle de validade dos materiais (F.99)?",
            "peso_documentado": 0.5,
            "peso_texto_original": "0,50",
            "base_rateio_documentada": null,
            "localizador_docx": {
              "tabela": 2,
              "linha": 4
            }
          },
          {
            "id_tecnico_nao_oficial": "F175-Q03",
            "ordem_no_grupo": 3,
            "texto_original": "Existe o acompanhamento semanal da TAM (F.87)?",
            "peso_documentado": 0.5,
            "peso_texto_original": "0,50",
            "base_rateio_documentada": null,
            "localizador_docx": {
              "tabela": 2,
              "linha": 5
            }
          },
          {
            "id_tecnico_nao_oficial": "F175-Q04",
            "ordem_no_grupo": 4,
            "texto_original": "Existe o controle de armazenamento dos materiais? \n(Pontuação dividida pela quantidade de materiais estocados)",
            "peso_documentado": 1.5,
            "peso_texto_original": "1,50",
            "base_rateio_documentada": "quantidade de materiais estocados",
            "localizador_docx": {
              "tabela": 2,
              "linha": 6
            }
          }
        ]
      },
      {
        "ordem_documental": 2,
        "titulo_original": "2. Execução dos Processos",
        "quesitos": [
          {
            "id_tecnico_nao_oficial": "F175-Q05",
            "ordem_no_grupo": 1,
            "texto_original": "As atividades estão sendo realizadas conforme as especificações do projeto?",
            "peso_documentado": 1.0,
            "peso_texto_original": "1,00",
            "base_rateio_documentada": null,
            "localizador_docx": {
              "tabela": 2,
              "linha": 8
            }
          },
          {
            "id_tecnico_nao_oficial": "F175-Q06",
            "ordem_no_grupo": 2,
            "texto_original": "Os documentos de revisão de projeto e alterações estão corretamente controlados (F.110)?",
            "peso_documentado": 0.5,
            "peso_texto_original": "0,50",
            "base_rateio_documentada": null,
            "localizador_docx": {
              "tabela": 2,
              "linha": 9
            }
          }
        ]
      },
      {
        "ordem_documental": 3,
        "titulo_original": "3. Ambiente de Trabalho",
        "quesitos": [
          {
            "id_tecnico_nao_oficial": "F175-Q07",
            "ordem_no_grupo": 1,
            "texto_original": "Controle de Transporte de Resíduos (CTR)?",
            "peso_documentado": 0.5,
            "peso_texto_original": "0,50",
            "base_rateio_documentada": null,
            "localizador_docx": {
              "tabela": 2,
              "linha": 11
            }
          },
          {
            "id_tecnico_nao_oficial": "F175-Q08",
            "ordem_no_grupo": 2,
            "texto_original": "Identificação das caçambas de entulho?",
            "peso_documentado": 0.5,
            "peso_texto_original": "0,50",
            "base_rateio_documentada": null,
            "localizador_docx": {
              "tabela": 2,
              "linha": 12
            }
          },
          {
            "id_tecnico_nao_oficial": "F175-Q09",
            "ordem_no_grupo": 3,
            "texto_original": "Identificação da baia de bags?",
            "peso_documentado": 0.5,
            "peso_texto_original": "0,50",
            "base_rateio_documentada": null,
            "localizador_docx": {
              "tabela": 2,
              "linha": 13
            }
          }
        ]
      },
      {
        "ordem_documental": 4,
        "titulo_original": "4. Inspeções e Ensaios",
        "quesitos": [
          {
            "id_tecnico_nao_oficial": "F175-Q10",
            "ordem_no_grupo": 1,
            "texto_original": "Estão sendo realizadas inspeções periódicas para verificação da qualidade dos serviços executados (FVS)?\n(distribuir o peso pela quantidade de serviços verificados)",
            "peso_documentado": 4.0,
            "peso_texto_original": "4,00",
            "base_rateio_documentada": "quantidade de serviços verificados",
            "localizador_docx": {
              "tabela": 2,
              "linha": 15
            }
          }
        ]
      }
    ]
  },
  {
    "documento": "F.176",
    "revisao_documental": "00",
    "nome": "Farol da Qualidade Completo",
    "arquivo_fonte": "F.176 - Roteiro Farol da Qualidade Completo.docx",
    "quantidade_quesitos": 23,
    "soma_pesos_documentados": 10.0,
    "nota_de_obra": null,
    "situacao_metodologia": "pendente_de_validacao",
    "ocultar_pesos_no_formulario_publicado": null,
    "grupos": [
      {
        "ordem_documental": 1,
        "titulo_original": "1. Controle de Qualidade",
        "quesitos": [
          {
            "id_tecnico_nao_oficial": "F176-Q01",
            "ordem_no_grupo": 1,
            "texto_original": "Existe um plano de qualidade (PQO) documentado, aprovado e atualizado no Autodoc Qualidade?",
            "peso_documentado": 0.3,
            "peso_texto_original": "0,30",
            "base_rateio_documentada": null,
            "localizador_docx": {
              "tabela": 2,
              "linha": 3
            }
          },
          {
            "id_tecnico_nao_oficial": "F176-Q02",
            "ordem_no_grupo": 2,
            "texto_original": "A obra possui projeto de canteiro e ele está atualizado incluindo, minimamente, questões de logística e produção (acessos e circulações de produtos, equipamentos e pessoas; áreas de produção e processamento, de escritórios, de armazenamento de produtos e de armazenamento de resíduos; localização de equipamentos de produção e transporte) e as áreas de vivência (instalações sanitárias, vestiário e local de refeições - obrigatórias; alojamento, cozinha, lavanderia, área de lazer e ambulatório - quando aplicáveis)?",
            "peso_documentado": 0.7,
            "peso_texto_original": "0,70",
            "base_rateio_documentada": null,
            "localizador_docx": {
              "tabela": 2,
              "linha": 4
            }
          },
          {
            "id_tecnico_nao_oficial": "F176-Q03",
            "ordem_no_grupo": 3,
            "texto_original": "A obra controla o consumo mensal de resíduos, energia e água (F.107)? Checar contas do último mês e comparar com valores da planilha.",
            "peso_documentado": 0.4,
            "peso_texto_original": "0,40",
            "base_rateio_documentada": null,
            "localizador_docx": {
              "tabela": 2,
              "linha": 5
            }
          },
          {
            "id_tecnico_nao_oficial": "F176-Q04",
            "ordem_no_grupo": 4,
            "texto_original": "A obra controla os equipamentos de medição (F.39)?",
            "peso_documentado": 0.2,
            "peso_texto_original": "0,20",
            "base_rateio_documentada": null,
            "localizador_docx": {
              "tabela": 2,
              "linha": 6
            }
          },
          {
            "id_tecnico_nao_oficial": "F176-Q05",
            "ordem_no_grupo": 5,
            "texto_original": "Os objetivos estabelecidos pelo plano mensal de atividades estão sendo realizados (F.49)?",
            "peso_documentado": 0.2,
            "peso_texto_original": "0,20",
            "base_rateio_documentada": null,
            "localizador_docx": {
              "tabela": 2,
              "linha": 7
            }
          }
        ]
      },
      {
        "ordem_documental": 2,
        "titulo_original": "2. Armazenamento de Materiais",
        "quesitos": [
          {
            "id_tecnico_nao_oficial": "F176-Q06",
            "ordem_no_grupo": 1,
            "texto_original": "Existe o controle de recebimento e aceitação de materiais (FVM)?",
            "peso_documentado": 0.3,
            "peso_texto_original": "0,30",
            "base_rateio_documentada": null,
            "localizador_docx": {
              "tabela": 2,
              "linha": 9
            }
          },
          {
            "id_tecnico_nao_oficial": "F176-Q07",
            "ordem_no_grupo": 2,
            "texto_original": "Existe o controle de validade dos materiais (F.99)?",
            "peso_documentado": 0.3,
            "peso_texto_original": "0,30",
            "base_rateio_documentada": null,
            "localizador_docx": {
              "tabela": 2,
              "linha": 10
            }
          },
          {
            "id_tecnico_nao_oficial": "F176-Q08",
            "ordem_no_grupo": 3,
            "texto_original": "Existe o acompanhamento semanal  da TAM (F.87)?",
            "peso_documentado": 0.3,
            "peso_texto_original": "0,30",
            "base_rateio_documentada": null,
            "localizador_docx": {
              "tabela": 2,
              "linha": 11
            }
          },
          {
            "id_tecnico_nao_oficial": "F176-Q09",
            "ordem_no_grupo": 4,
            "texto_original": "Existe o controle de armazenamento dos materiais (Identificação e estocagem conforme TAM)?\n(Pontuação dividida pela quantidade de materiais estocados.)",
            "peso_documentado": 1.0,
            "peso_texto_original": "1,00",
            "base_rateio_documentada": "quantidade de materiais estocados",
            "localizador_docx": {
              "tabela": 2,
              "linha": 12
            }
          }
        ]
      },
      {
        "ordem_documental": 3,
        "titulo_original": "3. Execução dos Processos",
        "quesitos": [
          {
            "id_tecnico_nao_oficial": "F176-Q10",
            "ordem_no_grupo": 1,
            "texto_original": "As atividades estão sendo realizadas conforme as especificações do projeto?",
            "peso_documentado": 0.7,
            "peso_texto_original": "0,70",
            "base_rateio_documentada": null,
            "localizador_docx": {
              "tabela": 2,
              "linha": 14
            }
          },
          {
            "id_tecnico_nao_oficial": "F176-Q11",
            "ordem_no_grupo": 2,
            "texto_original": "Os projetos em campo e/ou utilizados na engenharia estão com suas revisões corretamente controladas (Checar F.110 e revisão disponível no Autodoc/ferramenta de controle de projetos)?",
            "peso_documentado": 0.3,
            "peso_texto_original": "0,30",
            "base_rateio_documentada": null,
            "localizador_docx": {
              "tabela": 2,
              "linha": 15
            }
          }
        ]
      },
      {
        "ordem_documental": 4,
        "titulo_original": "4. Treinamento",
        "quesitos": [
          {
            "id_tecnico_nao_oficial": "F176-Q12",
            "ordem_no_grupo": 1,
            "texto_original": "A qualificação e treinamento da equipe de trabalho estão conforme (conversar com colaboradores em campo e verificar aderência aos procedimentos existentes)?",
            "peso_documentado": 0.2,
            "peso_texto_original": "0,20",
            "base_rateio_documentada": null,
            "localizador_docx": {
              "tabela": 2,
              "linha": 17
            }
          },
          {
            "id_tecnico_nao_oficial": "F176-Q13",
            "ordem_no_grupo": 2,
            "texto_original": "Todos os colaboradores envolvidos na obra estão cientes das políticas e procedimentos de qualidade?",
            "peso_documentado": 0.2,
            "peso_texto_original": "0,20",
            "base_rateio_documentada": null,
            "localizador_docx": {
              "tabela": 2,
              "linha": 18
            }
          },
          {
            "id_tecnico_nao_oficial": "F176-Q14",
            "ordem_no_grupo": 3,
            "texto_original": "Há registros de treinamentos realizados?",
            "peso_documentado": 0.2,
            "peso_texto_original": "0,20",
            "base_rateio_documentada": null,
            "localizador_docx": {
              "tabela": 2,
              "linha": 19
            }
          }
        ]
      },
      {
        "ordem_documental": 5,
        "titulo_original": "5. Ambiente de Trabalho",
        "quesitos": [
          {
            "id_tecnico_nao_oficial": "F176-Q15",
            "ordem_no_grupo": 1,
            "texto_original": "Existem procedimentos de controle ambiental sendo seguidos na obra (PGRCC)?",
            "peso_documentado": 0.3,
            "peso_texto_original": "0,30",
            "base_rateio_documentada": null,
            "localizador_docx": {
              "tabela": 2,
              "linha": 21
            }
          },
          {
            "id_tecnico_nao_oficial": "F176-Q16",
            "ordem_no_grupo": 2,
            "texto_original": "Controle de Transporte de Resíduos (CTR)?",
            "peso_documentado": 0.2,
            "peso_texto_original": "0,20",
            "base_rateio_documentada": null,
            "localizador_docx": {
              "tabela": 2,
              "linha": 22
            }
          },
          {
            "id_tecnico_nao_oficial": "F176-Q17",
            "ordem_no_grupo": 3,
            "texto_original": "Identificação das caçambas de entulho?",
            "peso_documentado": 0.2,
            "peso_texto_original": "0,20",
            "base_rateio_documentada": null,
            "localizador_docx": {
              "tabela": 2,
              "linha": 23
            }
          },
          {
            "id_tecnico_nao_oficial": "F176-Q18",
            "ordem_no_grupo": 4,
            "texto_original": "Identificação da baia de bags?",
            "peso_documentado": 0.2,
            "peso_texto_original": "0,20",
            "base_rateio_documentada": null,
            "localizador_docx": {
              "tabela": 2,
              "linha": 24
            }
          },
          {
            "id_tecnico_nao_oficial": "F176-Q19",
            "ordem_no_grupo": 5,
            "texto_original": "As licenças das empresas responsáveis pelo descarte dos resíduos gerados estão sendo devidamente registradas na planilha de caracterização e quantificação de resíduos (F.124)? Verificar também validade das licenças.",
            "peso_documentado": 0.2,
            "peso_texto_original": "0,20",
            "base_rateio_documentada": null,
            "localizador_docx": {
              "tabela": 2,
              "linha": 25
            }
          }
        ]
      },
      {
        "ordem_documental": 6,
        "titulo_original": "6. Inspeções e Ensaios",
        "quesitos": [
          {
            "id_tecnico_nao_oficial": "F176-Q20",
            "ordem_no_grupo": 1,
            "texto_original": "Estão sendo realizadas inspeções periódicas para verificação da qualidade dos serviços executados (FVS)?\n(pontuação dividida pela quantidade de serviços auditados)",
            "peso_documentado": 3.0,
            "peso_texto_original": "3,00",
            "base_rateio_documentada": "quantidade de serviços auditados",
            "localizador_docx": {
              "tabela": 3,
              "linha": 2
            }
          },
          {
            "id_tecnico_nao_oficial": "F176-Q21",
            "ordem_no_grupo": 2,
            "texto_original": "Há registros documentais das inspeções realizadas e dos testes executados (PCT) (checar inclsuive se os documentos estão datados e assinados)?",
            "peso_documentado": 0.2,
            "peso_texto_original": "0,20",
            "base_rateio_documentada": null,
            "localizador_docx": {
              "tabela": 3,
              "linha": 3
            }
          }
        ]
      },
      {
        "ordem_documental": 7,
        "titulo_original": "7. Melhoria Contínua",
        "quesitos": [
          {
            "id_tecnico_nao_oficial": "F176-Q22",
            "ordem_no_grupo": 1,
            "texto_original": "As oportunidades de melhoria e riscos são registradas (F.122)?",
            "peso_documentado": 0.2,
            "peso_texto_original": "0,20",
            "base_rateio_documentada": null,
            "localizador_docx": {
              "tabela": 3,
              "linha": 5
            }
          },
          {
            "id_tecnico_nao_oficial": "F176-Q23",
            "ordem_no_grupo": 2,
            "texto_original": "O canteiro está limpo e organizado?",
            "peso_documentado": 0.2,
            "peso_texto_original": "0,20",
            "base_rateio_documentada": null,
            "localizador_docx": {
              "tabela": 3,
              "linha": 6
            }
          }
        ]
      }
    ]
  }
]
```

## Anexo C — Pesos dos grupos de Segurança (documentados)

Fonte: IT.07 revisão 02, seção 3.2, páginas 26–27. Estes valores são pesos dos GRUPOS; não são pesos individuais nem notas obtidas.

```json
[
  {
    "codigo_grupo": "01",
    "nome_na_tabela_de_pesos": "ÁREAS DE VIVÊNCIA",
    "peso_grupo_documentado": 2,
    "pagina_fonte": 26
  },
  {
    "codigo_grupo": "02",
    "nome_na_tabela_de_pesos": "BEBEDOURO",
    "peso_grupo_documentado": 2,
    "pagina_fonte": 26
  },
  {
    "codigo_grupo": "03",
    "nome_na_tabela_de_pesos": "AUXILIARES DE LIMPEZA, HIGIENIZAÇÃO E PORTARIA",
    "peso_grupo_documentado": 2,
    "pagina_fonte": 26
  },
  {
    "codigo_grupo": "04",
    "nome_na_tabela_de_pesos": "E.P.I.S E UNIFORMES",
    "peso_grupo_documentado": 4,
    "pagina_fonte": 27
  },
  {
    "codigo_grupo": "05",
    "nome_na_tabela_de_pesos": "TREINAMENTOS",
    "peso_grupo_documentado": 2,
    "pagina_fonte": 27
  },
  {
    "codigo_grupo": "06",
    "nome_na_tabela_de_pesos": "DOCUMENTAÇÃO LEGAL OBRIGATÓRIA",
    "peso_grupo_documentado": 3,
    "pagina_fonte": 27
  },
  {
    "codigo_grupo": "07",
    "nome_na_tabela_de_pesos": "GESTÃO DE SEGURANÇA",
    "peso_grupo_documentado": 1,
    "pagina_fonte": 27
  },
  {
    "codigo_grupo": "08",
    "nome_na_tabela_de_pesos": "SINALIZAÇÃO DE SEGURANÇA",
    "peso_grupo_documentado": 2,
    "pagina_fonte": 27
  },
  {
    "codigo_grupo": "09",
    "nome_na_tabela_de_pesos": "PRONTIDÃO E RESPOSTAS A EMERGÊNCIAS",
    "peso_grupo_documentado": 1,
    "pagina_fonte": 27
  },
  {
    "codigo_grupo": "10",
    "nome_na_tabela_de_pesos": "ESCAVAÇÕES E FUNDAÇÕES",
    "peso_grupo_documentado": 10,
    "pagina_fonte": 27
  },
  {
    "codigo_grupo": "11",
    "nome_na_tabela_de_pesos": "CENTRAL DE FORMA",
    "peso_grupo_documentado": 2,
    "pagina_fonte": 27
  },
  {
    "codigo_grupo": "12",
    "nome_na_tabela_de_pesos": "CENTRAL DE ARMAÇÃO",
    "peso_grupo_documentado": 2,
    "pagina_fonte": 27
  },
  {
    "codigo_grupo": "13",
    "nome_na_tabela_de_pesos": "ESCADAS, RAMPAS, PASSARELAS E TAPUMES",
    "peso_grupo_documentado": 5,
    "pagina_fonte": 27
  },
  {
    "codigo_grupo": "14",
    "nome_na_tabela_de_pesos": "PROTEÇÃO CONTRA QUEDAS",
    "peso_grupo_documentado": 10,
    "pagina_fonte": 27
  },
  {
    "codigo_grupo": "15",
    "nome_na_tabela_de_pesos": "PLATAFORMA",
    "peso_grupo_documentado": 10,
    "pagina_fonte": 27
  },
  {
    "codigo_grupo": "16",
    "nome_na_tabela_de_pesos": "ENTELAMENTO",
    "peso_grupo_documentado": 3,
    "pagina_fonte": 27
  },
  {
    "codigo_grupo": "17",
    "nome_na_tabela_de_pesos": "ANDAIMES SUSPENSOS PESADOS",
    "peso_grupo_documentado": 5,
    "pagina_fonte": 27
  },
  {
    "codigo_grupo": "18",
    "nome_na_tabela_de_pesos": "CADEIRA SUSPENSA",
    "peso_grupo_documentado": 5,
    "pagina_fonte": 27
  },
  {
    "codigo_grupo": "19",
    "nome_na_tabela_de_pesos": "ELEVADOR DA OBRA",
    "peso_grupo_documentado": 4,
    "pagina_fonte": 27
  },
  {
    "codigo_grupo": "20",
    "nome_na_tabela_de_pesos": "GRUA",
    "peso_grupo_documentado": 5,
    "pagina_fonte": 27
  },
  {
    "codigo_grupo": "21",
    "nome_na_tabela_de_pesos": "ANDAIMES SIMPLESMENTE APOIADOS, FACHADEIROS E MÓVEIS",
    "peso_grupo_documentado": 6,
    "pagina_fonte": 27
  },
  {
    "codigo_grupo": "22",
    "nome_na_tabela_de_pesos": "INSTALAÇÕES ELÉTRICAS PROVISÓRIAS E EQUIPAMENTOS",
    "peso_grupo_documentado": 5,
    "pagina_fonte": 27
  },
  {
    "codigo_grupo": "23",
    "nome_na_tabela_de_pesos": "MÁQUINAS, EQUIPAMENTOS E FERRAMENTAS DIVERSAS",
    "peso_grupo_documentado": 4,
    "pagina_fonte": 27
  },
  {
    "codigo_grupo": "24",
    "nome_na_tabela_de_pesos": "ESPECÍFICO A PÓLVORA",
    "peso_grupo_documentado": 1,
    "pagina_fonte": 27
  },
  {
    "codigo_grupo": "25",
    "nome_na_tabela_de_pesos": "ILUMINAÇÃO",
    "peso_grupo_documentado": 2,
    "pagina_fonte": 27
  },
  {
    "codigo_grupo": "26",
    "nome_na_tabela_de_pesos": "ORDEM E LIMPEZA",
    "peso_grupo_documentado": 4,
    "pagina_fonte": 27
  },
  {
    "codigo_grupo": "27",
    "nome_na_tabela_de_pesos": "ATENDIMENTO A CONVENÇÃO COLETIVA",
    "peso_grupo_documentado": 1,
    "pagina_fonte": 27
  }
]
```

## Anexo D — Exemplo documental de Treinamentos

Fonte: IT.07 revisão 02, página 28. Preservar como exemplo de cálculo e referência a confirmar, sem transformá-lo em tabela completa de pesos operacionais. Os seis pesos não se aplicam aos outros itens.

| Código | Peso no exemplo | Nota no exemplo | Pontos no exemplo |
|---|---:|---:|---:|
| 05.01.01 | 10 | 10 | 100 |
| 05.01.02 | 10 | 10 | 100 |
| 05.01.03 | 10 | 10 | 100 |
| 05.01.04 | 20 | 0 | 0 |
| 05.01.05 | 10 | 10 | 100 |
| 05.01.06 | 15 | 10 | 150 |

O documento apresenta 550 pontos obtidos, 750 possíveis, aproveitamento 7,33 e resultado ponderado 14,66 com peso de grupo 2. Preserve os valores exibidos e registre que a política de arredondamento intermediário deverá ser confirmada. Não ajuste resultados históricos para fazê-los coincidir com outra política.

## Anexo E — Inventário de códigos de Segurança

Verificação de extração: **27 grupos e 205 códigos únicos** no corpo de quesitos das páginas 1–26. Inventário não substitui os enunciados do Anexo G. A página indica o início do quesito, que pode continuar na página seguinte.

| Grupo | Quantidade de códigos |
|---|---:|
| 01 | 52 |
| 02 | 3 |
| 03 | 3 |
| 04 | 3 |
| 05 | 6 |
| 06 | 10 |
| 07 | 3 |
| 08 | 3 |
| 09 | 6 |
| 10 | 9 |
| 11 | 7 |
| 12 | 5 |
| 13 | 9 |
| 14 | 17 |
| 15 | 7 |
| 16 | 2 |
| 17 | 5 |
| 18 | 4 |
| 19 | 9 |
| 20 | 8 |
| 21 | 9 |
| 22 | 6 |
| 23 | 11 |
| 24 | 1 |
| 25 | 2 |
| 26 | 4 |
| 27 | 1 |

| Código | Página de início na IT.07 |
|---|---:|
| 01.01.01 | 1 |
| 01.01.02 | 2 |
| 01.01.03 | 2 |
| 01.02.01 | 2 |
| 01.02.02 | 2 |
| 01.02.03 | 2 |
| 01.02.04 | 2 |
| 01.02.05 | 2 |
| 01.02.06 | 2 |
| 01.02.07 | 2 |
| 01.03.01 | 2 |
| 01.03.02 | 2 |
| 01.03.03 | 3 |
| 01.03.04 | 3 |
| 01.04.01 | 3 |
| 01.04.02 | 3 |
| 01.04.03 | 3 |
| 01.04.04 | 3 |
| 01.04.05 | 3 |
| 01.04.06 | 3 |
| 01.05.01 | 3 |
| 01.05.02 | 3 |
| 01.05.03 | 3 |
| 01.05.04 | 3 |
| 01.06.01 | 4 |
| 01.06.02 | 4 |
| 01.06.03 | 4 |
| 01.06.04 | 4 |
| 01.06.05 | 4 |
| 01.06.06 | 4 |
| 01.06.07 | 4 |
| 01.06.08 | 4 |
| 01.07.01 | 4 |
| 01.07.02 | 4 |
| 01.07.03 | 4 |
| 01.07.04 | 4 |
| 01.07.05 | 5 |
| 01.07.06 | 5 |
| 01.07.07 | 5 |
| 01.08.01 | 5 |
| 01.08.02 | 5 |
| 01.08.03 | 5 |
| 01.08.04 | 5 |
| 01.08.05 | 5 |
| 01.08.06 | 5 |
| 01.08.07 | 5 |
| 01.08.08 | 6 |
| 01.08.09 | 6 |
| 01.08.10 | 6 |
| 01.08.11 | 6 |
| 01.08.12 | 6 |
| 01.08.13 | 6 |
| 02.01.01 | 7 |
| 02.01.02 | 7 |
| 02.01.03 | 7 |
| 03.01.01 | 7 |
| 03.01.02 | 7 |
| 03.01.03 | 7 |
| 04.01.01 | 7 |
| 04.01.02 | 7 |
| 04.01.03 | 8 |
| 05.01.01 | 8 |
| 05.01.02 | 8 |
| 05.01.03 | 8 |
| 05.01.04 | 8 |
| 05.01.05 | 8 |
| 05.01.06 | 8 |
| 06.01.01 | 8 |
| 06.01.02 | 8 |
| 06.01.03 | 9 |
| 06.01.04 | 9 |
| 06.01.05 | 9 |
| 06.01.06 | 9 |
| 06.01.07 | 9 |
| 06.01.08 | 9 |
| 06.01.09 | 9 |
| 06.01.10 | 9 |
| 07.01.01 | 9 |
| 07.01.02 | 9 |
| 07.01.03 | 9 |
| 08.01.01 | 10 |
| 08.01.02 | 10 |
| 08.01.03 | 10 |
| 09.01.01 | 10 |
| 09.01.02 | 10 |
| 09.02.01 | 10 |
| 09.02.02 | 11 |
| 09.02.03 | 11 |
| 09.03.01 | 11 |
| 10.01.01 | 11 |
| 10.01.02 | 11 |
| 10.01.03 | 11 |
| 10.01.04 | 11 |
| 10.01.05 | 11 |
| 10.01.06 | 12 |
| 10.01.07 | 12 |
| 10.01.08 | 12 |
| 10.01.09 | 12 |
| 11.01.01 | 12 |
| 11.01.02 | 12 |
| 11.01.03 | 12 |
| 11.01.04 | 12 |
| 11.01.05 | 13 |
| 11.01.06 | 13 |
| 11.01.07 | 13 |
| 12.01.01 | 13 |
| 12.01.02 | 13 |
| 12.01.03 | 13 |
| 12.01.04 | 13 |
| 12.01.05 | 13 |
| 13.01.01 | 13 |
| 13.01.02 | 13 |
| 13.01.03 | 14 |
| 13.01.04 | 14 |
| 13.01.05 | 14 |
| 13.01.06 | 14 |
| 13.01.07 | 14 |
| 13.01.08 | 14 |
| 13.01.09 | 14 |
| 14.01.01 | 14 |
| 14.01.02 | 14 |
| 14.01.03 | 14 |
| 14.01.04 | 14 |
| 14.01.05 | 15 |
| 14.01.06 | 15 |
| 14.02.01 | 15 |
| 14.02.02 | 15 |
| 14.02.03 | 15 |
| 14.02.04 | 15 |
| 14.02.05 | 15 |
| 14.02.06 | 16 |
| 14.02.07 | 16 |
| 14.02.08 | 16 |
| 14.02.09 | 16 |
| 14.02.10 | 16 |
| 14.02.11 | 16 |
| 15.01.01 | 16 |
| 15.01.02 | 16 |
| 15.01.03 | 17 |
| 15.01.04 | 17 |
| 15.01.05 | 17 |
| 15.01.06 | 17 |
| 15.01.07 | 17 |
| 16.01.01 | 18 |
| 16.01.02 | 18 |
| 17.01.01 | 18 |
| 17.01.02 | 18 |
| 17.01.03 | 18 |
| 17.01.04 | 18 |
| 17.01.05 | 19 |
| 18.01.01 | 19 |
| 18.01.02 | 19 |
| 18.01.03 | 19 |
| 18.01.04 | 19 |
| 19.01.01 | 19 |
| 19.01.02 | 20 |
| 19.01.03 | 20 |
| 19.01.04 | 20 |
| 19.01.05 | 20 |
| 19.01.06 | 20 |
| 19.01.07 | 20 |
| 19.01.08 | 20 |
| 19.01.09 | 20 |
| 20.01.01 | 21 |
| 20.01.02 | 21 |
| 20.01.03 | 21 |
| 20.01.04 | 21 |
| 20.01.05 | 21 |
| 20.01.06 | 21 |
| 20.01.07 | 21 |
| 20.01.08 | 21 |
| 21.01.01 | 22 |
| 21.01.02 | 22 |
| 21.01.03 | 22 |
| 21.01.04 | 22 |
| 21.01.05 | 22 |
| 21.01.06 | 22 |
| 21.01.07 | 22 |
| 21.01.08 | 22 |
| 21.01.09 | 22 |
| 22.01.01 | 22 |
| 22.01.02 | 23 |
| 22.01.03 | 23 |
| 22.01.04 | 23 |
| 22.01.05 | 23 |
| 22.01.06 | 23 |
| 23.01.01 | 23 |
| 23.01.02 | 23 |
| 23.01.03 | 24 |
| 23.01.04 | 24 |
| 23.01.05 | 24 |
| 23.01.06 | 24 |
| 23.01.07 | 24 |
| 23.01.08 | 24 |
| 23.01.09 | 25 |
| 23.01.10 | 25 |
| 23.01.11 | 25 |
| 24.01.01 | 25 |
| 25.01.01 | 25 |
| 25.01.02 | 25 |
| 26.01.01 | 26 |
| 26.01.02 | 26 |
| 26.01.03 | 26 |
| 26.01.04 | 26 |
| 27.01.01 | 26 |

## Anexo F — Divergências e pendências já identificadas

Estes registros são observações para revisão; não são correções do documento:

- IT.07 página 4, item 01.06.01: o valor “0,80m²” e o extenso “oitenta centímetros quadrados” aparecem juntos e não são equivalentes. Preservar o texto; não usar conversão automática desse limite sem validação.
- IT.07 página 15: o título “Periferia” remete a “item 14.01”, embora os quesitos abaixo sejam 14.02.xx. Preservar título/referência originais e registrar separadamente um eventual mapeamento pelos códigos dos quesitos para revisão.
- IT.07 página 18: o título do grupo 17 é “Andaimes suspensos leves”; na tabela de pesos da página 27 aparece “ANDAIMES SUSPENSOS PESADOS”. Manter as duas designações de origem; não trocar silenciosamente uma pela outra. A relação pelo código 17 deve ficar documentada como mapeamento técnico.
- Outros títulos variam entre o corpo e a tabela de pesos (por exemplo, grupo 19 “Elevador cremalheira” no corpo e “ELEVADOR DA OBRA” na tabela). Preservar título do critério e título na tabela em campos separados.
- IT.07 página 1 apresenta 0/5/10/N/A; o texto que introduz o exemplo da página 27 menciona notas 0 ou 10. Não retirar a opção 5 de todo o roteiro com base apenas nesse exemplo; guardar a escala da introdução e registrar a diferença para validação.
- A observação sobre 07.01.03 nas páginas 9–10 exige plano de ação diante de não conformidades independentemente da nota. Não interpretar a expressão “indiferente a nota” como instrução de peso zero ou exclusão desse item da avaliação.
- A IT.07 contém regras específicas sobre local, amostragem e penalização em mais de um quesito. Exibir as observações completas; não criar automatismos adicionais sem definir entradas, exceções e validação.
- No F.176, a paginação visível fornecida vai até “3/2”. O roteiro não deve ser interrompido na segunda página: preservar também os grupos 6 e 7.
- Pesos individuais completos de Segurança ainda não foram disponibilizados. Os do exemplo de Treinamentos são referências documentais separadas.
- Qualidade: permanecem pendentes as regras completas de pontuação obtida, atendimento parcial, não aplicáveis, rateios quando não houver materiais/serviços e faixas do farol.
- Permanecem pendentes a política de arredondamento da pontuação, a validação final dos títulos divergentes e a aprovação do catálogo transcrito.

### Referência histórica Boulevard Agosto

O documento fornecido registra inspeção criada em **19/08/2026** e **nota final 7,08** na página 2 do arquivo (página impressa 1 de 67). A seção **Relatório Fotográfico e Ocorrências** começa na página 17 do arquivo (página impressa 16 de 67). Fonte: Boulevard Agosto.pdf.

A IT.07 revisão 02 enviada registra aprovação em **08/09/2026** (página 30). Não afirmar que essa revisão foi utilizada na auditoria de agosto, nem recalcular ou substituir seu resultado automaticamente. A nota 7,08 é um valor histórico informado no documento, não uma nota reproduzida ou validada por este protótipo.

Use esse relatório apenas como referência da organização — síntese, itens/grupos, ocorrências, fotos e observações — e não como fonte automática de cadastro atual. O presente arquivo não incorpora fotografias nem dados de funcionários do relatório.

## Anexo G — IT.07 revisão 02: transcrição do corpo documental

**Arquivo fonte:** `080926121553_it-07_rev02_diretrizes_de_inspecao_de_seguranca_-_identidade_atualizada.pdf`. Páginas correspondem às folhas do PDF original. Leia as continuações de uma página para outra antes de separar os quesitos.

### IT.07 — página 01 de 30

```text
1. OBJETIVO
Este padrão tem por objetivo descrever os critérios de como avaliar as obras nas inspeções de
segurança, ou seja, resume como cada questão será gabaritada pelo técnico de segurança em
consenso com a obra inspecionada.

2. CAMPO DE APLICAÇÃO
Obras Diálogo, em geral.

3. PROCEDIMENTOS E DIRETRIZES
A Auditoria de Segurança das obras é realizada mensalmente, pelos profissionais de segurança
DIÁLOGO, mediante aplicação de checklist eletrônico em sistema contratado, com notas 0 (zero), 5
(cinco), 10 (dez) e N/A, para itens não aplicáveis.

Neste procedimento, quando necessário, o grupo ou o item de inspeção será acompanhado de grifo,
em vermelho, determinando a forma como o quesito deve ser interpretado pelo técnico e engenharia,
a fim de diminuir a variação da interpretação entre os auditores.

Em relação aos grupos 5 (Treinamentos) e 6 (Documentação Legal Obrigatória), o auditor deve,
aleatoriamente, obter uma amostragem de 10% (dez por cento) em relação ao efetivo da obra no dia
da auditoria e realizar a análise sobre esta população, validando ou penalizando nos itens aplicáveis.
A amostragem deve incluir operadores de equipamentos leves e pesados, como gruas, cremalheiras,
guindastes, escavadeiras, carregadeiras, entre outros.

3.1 ITENS AVALIÁVEIS E CRITÉRIO DE INSPEÇÃO
Grupo de Inspeção 01 – Áreas de vivência
Instalações móveis – Contêineres (item 01.01 do checklist eletrônico)
01.01.01
As áreas de vivência instaladas em contêineres devem possuir projeto específico
inserido no PGR e serem mantidas em perfeito estado de conservação (parede, piso e teto)
Obs.: neste item, a conservação refere-se ao estado estrutural dos ambientes (ferrugem, fissuras e
outras aberturas, depressões no piso etc.) e não deve ser avaliada a higiene e limpeza, mas sim no
item 01.02 – Instalações Sanitárias – geral.
```

### IT.07 — página 02 de 30

```text
01.01.02
Devem possuir área de ventilação natural efetiva de, no mínimo, 15% (quinze por cento)
da área do piso, composta por, no mínimo, duas aberturas adequadamente dispostas para permitir
ventilação interna eficaz e ter pé direito mínimo de 2,40m (dois metros e quarenta centímetros);
01.01.03
Os contêineres devem ter proteções contra choques elétricos indiretos (aterramento) e
fiações devidamente isoladas por conduítes e/ou cabo PP (duplo isolamento);

Instalações Sanitárias – Geral (item 01.02 do checklist eletrônico)
De acordo com a NR-18 (18.5), entende-se por instalação sanitária, o conjunto constituído por lavatório,
bacia sanitária sifonada, mictório e chuveiro. A conservação, higiene e limpeza dos ambientes serão
medidos neste item, somente.
01.02.01
Devem ser mantidas em perfeito estado de conservação, higiene e limpeza, além de
garantir condições de conforto, mantendo o espaço limpo e livre;
01.02.02
Devem possuir fechamento adequado que impeça a visão de fora para dentro, de modo
a garantir a privacidade dos funcionários.
01.02.03
Devem estar situadas em locais de fácil e seguro acesso, não sendo permitido
deslocamento superior a 150m (cento e cinquenta metros) do posto de trabalho;
01.02.04
Devem ter paredes de material resistente e lavável, podendo ser de madeira, drywall,
metal ou revestido em cerâmica. O piso deve ser impermeável, lavável e de acabamento
antiderrapante.
01.02.05
Não podem estar ligados diretamente aos locais destinados às refeições;
01.02.06
Devem ser independentes para homens e mulheres, independente da fase da obra;
01.02.07
Devem possuir ventilação e iluminação adequadas.

Instalações Sanitárias – Lavatórios (item 01.03 do checklist eletrônico)
01.03.01
Os lavatórios devem ser individuais ou coletivos (tipo calha), ter revestimento interno de
material liso, impermeável e lavável, e possuir torneiras de metal ou plástico, espaçadas em 0,60m
(sessenta centímetros), na proporção de 1 (uma) torneira para 20 (vinte) colaboradores ou fração;
01.03.02
Devem ser ligados diretamente à rede de esgoto ou similar;
```

### IT.07 — página 03 de 30

```text
01.03.03
Devem dispor de cestos, para coleta de papéis, com plástico e tampa;
01.03.04
No local acima dos lavabos, deverá haver saboneteira com sabonete e toalheiros
abastecidos, para uso dos colaboradores.

Instalações Sanitárias – Vasos sanitários (item 01.04 do checklist eletrônico)
01.04.01
O local destinado ao vaso sanitário deve ter área mínima de 1,0m² (um metro quadrado),
divisórias com altura mínima de 1,80m (um metro e oitenta centímetros) e borda inferior de, no máximo,
0,15m (quinze centímetros) de altura.
01.04.02
Os gabinetes sanitários devem ter recipiente para coleta de papéis usados, com sacos
plástico, sendo obrigatório o fornecimento de papel higiênico. As tampas dos recipientes são
obrigatórias para sanitários femininos;
01.04.03
Os vasos sanitários devem do tipo bacia sifonada, com assento adequado, na proporção
de 1 (um) vaso para 20 (vinte) colaboradores ou fração e possuir caixa de descarga ou válvula
automática;
01.04.04
Piso, portas, paredes, assentos e tampas devem ser mantidos íntegros e conservados;
01.04.05
Devem ser ligados à rede geral de esgotos ou fossa séptica, com interposição de sifões
hidráulicos com constatação de não haver vazamentos;
01.04.06
As portas dos banheiros devem dispor de trincos;

Instalações Sanitárias – Mictórios (item 01.05 do checklist eletrônico)
01.05.01
Os mictórios devem ser individuais ou coletivos, tipo calha, ter revestimento interno de
material liso, impermeável, lavável, inoxidável ou semelhante. Devem ser providos de descarga
provocada ou automática;
01.05.02
Devem ser ligados diretamente à rede de esgoto ou à fossa séptica, com interposição
de sifões hidráulicos;
01.05.03
Os mictórios devem estar localizados em local que promova a privacidade do usuário ou
pedestre externo;
01.05.04
No mictório coletivo, tipo calha, cada segmento de 0,60m (sessenta centímetros)
corresponderá a uma unidade para fins de dimensionamento da calha. Quando inexistir anteparos,
```

### IT.07 — página 04 de 30

```text
cada segmento de, no mínimo, 0,80m (oitenta centímetros) corresponderá a uma unidade para fins de
dimensionamento da calha.

Instalações Sanitárias – Chuveiros (item 01.06 do checklist eletrônico)
01.06.01
A área mínima necessária para utilização de cada chuveiro é de 0,80m² (oitenta
centímetros quadrados), com chuveiro posicionado a altura de 2,10m (dois metros e dez centímetros)
do piso;
01.06.02
O sistema de aquecimento (cilindros, mangueiras e aquecedores) deve estar em
condições adequadas e deve sofrer manutenção preventiva trimestral, formalizada em formulário
específico do fornecedor.
01.06.03
As paredes e pisos devem ser revestidos por material lavável. Os pisos devem ser
providos de estrados de borracha ou material similar;
01.06.04
Os chuveiros devem ser de metal ou plástico, individuais ou coletivos, dispondo de água
quente e fria, na proporção de 1 (uma) unidade para cada grupo de 10 (dez) trabalhadores ou fração;
01.06.05
Deve haver um suporte para sabonete barra ou líquido, para cada chuveiro;
01.06.06
Deve haver um cabide em cada cabine;
01.06.07
Os boxes devem dispor de portas com trinco;
01.06.08
Os chuveiros elétricos devem ser aterrados adequadamente;

Vestiários (item 01.07 do checklist eletrônico)
01.07.01
Devem ser mantidos em perfeito estado de conservação, higiene e limpeza, garantindo
condições de conforto. Deve ocorrer varredura e retirada de todo tipo de detritos e objetos que não
estejam guardados nos armários, mantendo o espaço limpo e livre;
01.07.02
Devem ter vestiários independentes para homens e mulheres, quando necessário;
01.07.03
Devem ter paredes de alvenaria, madeira ou material equivalente, devendo, ter pisos de
concreto, cimentado, madeira ou material equivalente, ter cobertura que proteja contra as intempéries,
ter área de ventilação correspondente a 1/10 (um décimo) de área do piso;
01.07.04
Devem ter armários individuais, sendo 1 para cada trabalhador, possuir fechadura ou
dispositivo com cadeado, limpos, conservados, com pintura completa, pés, portas que fechem
```

### IT.07 — página 05 de 30

```text
normalmente, sem ferrugem, dimensões 1,20 x 0,30m. Deve conter o controle destes dispositivos por
empresa indicando numeração de controle de uso;
01.07.05
Devem ter bancos em número suficiente para atender aos usuários, posicionados em
frente aos armários, com largura mínima de 0,30m (trinta centímetros). Bancos, de fácil limpeza, em
que não ofereçam risco de acidente com pés adequados nas extremidades e no centro dele;
01.07.06
É proibido a permanência de pertences fora dos armários;
01.07.07
É obrigatória a instalação de varais nos vestiários, com suportes protegidos e espaços
adequado entre toalhas. O varal deverá ficar em local isolado, afastado do box sanitário e mictório.

Refeitório (item 01.08 do checklist eletrônico)
01.08.01
O refeitório não poderá ser instalado em subsolos. Devem ser mantidos em perfeito
estado de conservação, higiene, limpeza e garantir condições de conforto.
01.08.02
Devem ter paredes que permitam o isolamento durante as refeições, ter pé-direito
mínimo de 2,80m (dois metros e oitenta centímetros), ter piso de concreto, cimentado ou de outro
material lavável, ter cobertura que proteja das intempéries, ter ventilação e iluminação natural e/ou
artificial.
01.08.03
Ter capacidade e assentos (mínimo 50% do efetivo, por turno de almoço), para garantir
o atendimento de todos os trabalhadores no horário das refeições.
01.08.04
Ter mesas com tampos lisos e laváveis, forração plástica
01.08.05
Ter lavatório instalado em seu interior. Dentro do refeitório deverá haver local afastado
das mesas de refeição, um lavatório de mãos com sabonete líquido para os colaboradores poderem
lavar as mãos antes e após as suas refeições.
01.08.06
Entre ou sobre os lavatórios de mãos e a pia de lavagem das marmitas, deverá haver
uma bancada em que o colaborador possa apoiar os seus utensílios (garfo, faca e outros) para facilitar
o manuseio, devendo haver sobre a pia de lavagem de marmitas, uma saboneteira com detergente
líquido para a limpeza das marmitas e outros. Bancada lavável e impermeável.
01.08.07
Sobre as bancadas entre as pias e lavatório de mão deverá haver um toalheiro de papel
para secagem das mãos e dos utensílios de refeição dos colaboradores.
```

### IT.07 — página 06 de 30

```text
01.08.08
Cestos: deve haver junto ao lavatório de mãos um cesto com saco plástico e tampa, uso
exclusivo para toalhas de papel de mão (secar), junto a pia para lavar as marmitas, deverá haver um
cesto para restos de alimentos de sobra das marmitas, exclusivo para esta finalidade, devendo haver
um outro cesto para a coleta de copos plásticos ou garrafas plásticas.
01.08.09
Os lavatórios e pias deverão ser dimensionados na proporção de uma torneira para cada
20 colaboradores, podendo ser coletivo ou individual, saboneteira de sabonete líquido para lavagem
das mãos antes e após as refeições e toalheiro de papel para secagem das mãos e dos utensilio de
refeição dos colaboradores.
01.08.10
Não ter comunicação direta com as instalações sanitárias.
01.08.11
Deve ter televisão instalada em seu interior, a partir da liberação do refeitório mesmo
que em container.
01.08.12
Deve haver local exclusivo para o aquecimento de refeições de forma a atender ao
efetivo, não podendo haver marmitas sobrepostas, ou adotar sistema de estufa, dotado de equipamento
adequado, seguro para o aquecimento, aterrados;
01.08.13
Deve haver o fornecimento de água potável, filtrada e fresca, para os trabalhadores
dentro do refeitório, por meio de bebedouro de jato inclinado ou outro dispositivo equivalente, sendo
proibido o uso de copos coletivos. Pode-se optar para água de reservatório (tipo bebedouro industrial),
sobre o bebedouro (galão) ou por água via canalizada com filtro de entrada do bebedouro.
No item 01.08.13 deve ser avaliada somente a existência de bebedouro nas modalidades descritas
(jato inclinado, industrial ou galão) e especificamente no refeitório. As condições dos equipamentos,
dimensionamento, potabilidade e regime de manutenção serão aferidos no Grupo 02 – Bebedouros,
somente.

Grupo de Inspeção 02 – Bebedouros
Bebedouros (item 02.01 do checklist eletrônico)
Este grupo de inspeção deve ser medido a partir da existência de bebedouros fora do refeitório, como
em portarias ou outros pontos do canteiro, exceto em 02.01.03.
```

### IT.07 — página 07 de 30

```text
02.01.01
É obrigatório o fornecimento de água potável, filtrada e fresca para os trabalhadores por
meio de bebedouros de jato inclinado ou equipamento similar que garanta as mesmas condições, na
proporção de 1 (um) para cada grupo de 25 (vinte e cinco) trabalhadores ou fração;
02.01.02
O deslocamento não deve ser superior a 100 (cem) metros, no plano horizontal e 15
(quinze) metros no plano vertical. Devem ter proteção contra intempéries e aterramento em caso de
bebedouros elétricos;
02.01.03
Devem ter manutenção semestral (limpeza dos filtros). Deve haver laudo de potabilidade
da água com validade e em quantidade de pontos conforme;

Grupo de Inspeção 03 – Auxiliares de limpeza, higienização e portaria
Auxiliares de limpeza, higienização e portaria (item 03.01 do checklist eletrônico)
03.01.01
Atenção todos os colaboradores de limpeza e higienização, devem estar equipados de
EPIs próprios para limpeza da área de vivência (botas de PVS, luvas de PVC, máscaras, óculos de
segurança) e uniforme completo (calça e camiseta ou similar);
03.01.02
Auxiliar de limpeza, deverá permanecer na área de vivência, em todo horário de trabalho
da obra, realizando a manutenção de limpeza, conservação e higienização, constantemente. (atenção
para esta atividade deve-se dar preferência para homens, pois ele terá acesso em qualquer área em
qualquer tempo).
03.01.03
A portaria das obras, devem conter: catraca virtual ou padrão instituído, livro de acesso
de funcionários e visitantes, organização e limpeza, placa de política da qualidade na área externa kit
visitante, calço de caminhão, isolamento interno e externo.

Grupo de Inspeção 04 – Equipamentos de proteção individual – EPIS e uniformes
Equipamentos de proteção individual – EPIS e uniformes (item 04.01 do checklist eletrônico)
04.01.01
Verificar uso correto e conservação dos EPIS utilizados pelos funcionários da obra;
04.01.02
A empresa é obrigada a fornecer aos trabalhadores, gratuitamente, uniforme e em
perfeito estado de conservação, inclusive a reposição do danificado. Verificar se todos os
colaboradores receberam 2 uniformes (gratuitamente) conforme a convenção coletiva da indústria da
construção civil;
```

### IT.07 — página 08 de 30

```text
04.01.03
É obrigatório o uso de colete ou tiras refletivas na região do tórax e costas quando o
trabalhador estiver a serviço em vias públicas, sinalizando acessos ao canteiro de obras (portaria) e
frentes de serviços ou em movimentação e transporte vertical de materiais (sinaleiros).
Para o uso de coletes em áreas de fundação e escavação, por parte de todos os funcionários do
canteiro, consultar Grupo de Inspeção 10 – Escavações e Fundações.

Grupo de Inspeção 05 – Treinamentos
Treinamentos (item 05.01 do checklist eletrônico)

05.01.01
Todos os empregados devem receber treinamento admissional e periódico (quando
assim fizer necessário), visando a garantir a execução de suas atividades com segurança;
05.01.02
Deverão receber treinamentos específicos operadores de equipamentos como: grua,
cremalheira, serra circular, policorte, minigrua, guincho de carga, guincho velox, andaimes suspensos,
cadeirinhas, máquinas pesadas, bobcat, soldadores, bate-estacas, perfuratriz, e outros que se
tornarem necessários;
05.01.03
Treinamento específico bienal para trabalho em altura conforme nr-35 com carga horária
mínima de 08 horas, constando conteúdo programático;
05.01.04
Devem ter treinamento de integração Diálogo dentro da validade de 1 ano;
05.01.05
Realização de DSS uma vez por semana seguindo o manual;
05.01.06
Curso NR-10, mínimo de 40 (quarenta) horas, sempre atualizados a cada 02 (dois) anos,
para trabalhadores que executam instalações elétricas, em caso de cabine primária e subestação o
profissional deve possuir curso SEP (sistema elétrico de potência);

Grupo de Inspeção 06 – Documentação Legal Obrigatória
Documentação Legal Obrigatória (item 06.01 do checklist eletrônico)
06.01.01
Comunicação Prévia protocolada no MTE deve estar atualizada dentro do canteiro de
obras;
06.01.02
Livro de Inspeção do Trabalho DIÁLOGO e fornecedores de serviços, com
acompanhamento das ações;
```

### IT.07 — página 09 de 30

```text
06.01.03
PGR da obra atualizado de acordo com a fase da obra;
06.01.04
Inventario de Riscos específico à obra e atualizado, para cada fornecedor de serviços à
obra;
06.01.05
PCMSO DIÁLOGO e de fornecedores de serviços, acima de 20 colaboradores deve ser
direcionado a obra;
06.01.06
ASO equipe DIÁLOGO e terceiros. Os ASOS devem atestar que o funcionário está apto
para trabalhar em altura conforme NR-35, se aplicável, e de acordo com o PCMSO da empresa.
06.01.07
A empresa que estiver com 50 funcionários ou mais em cada canteiro deverá manter um
técnico em segurança do trabalho fixo até a diminuição de seu efetivo, conforme contrato assinado
entre as partes (fornecedor de serviços);
06.01.08
ARTS (equipamentos, PGR, laudos, proteções coletivas e projetos diversos). Alvará de
grua (caso necessário).
06.01.09
Projeto de instalações elétricas temporárias e laudo aterramento elétrico, constando
todos os equipamentos e quadro elétricos do canteiro, além dos valores ôhmicos dentro da validade de
06 (seis) meses, assinado por um profissional legalmente habilitado em elétrica.
06.01.10
Cópias: carteira de trabalho e ficha de registro. Obs.: no caso de operadores de
máquinas e equipamentos, os funcionários devem ter registro na função de operador ou específico ao
tipo de equipamento atualizada com página de mudança de função se houver.

Grupo de Inspeção 07 – Gestão de Segurança
Gestão de segurança (item 07.01 do checklist eletrônico)
07.01.01
Reuniões mensais do comitê de segurança, documentadas em ata reunião padrão com
acompanhamento das ações.
07.01.02
CIPA - as empresas deverão indicar um colaborador designado treinado e certificado,
que deverá participar das reuniões mensais do comitê de segurança da obra. Caso a obra tenha
passado por inspeção da CIPA, esta deverá elaborar um contrarrelatório evidenciando as melhorias
em até 05 dias.
07.01.03
Plano de ação, enviado pela obra ao SESMT e coordenações (de obra e de segurança)
em até 72h após a auditoria de segurança com prazos e medidas corretivas cabíveis;
```

### IT.07 — página 10 de 30

```text
O item “07.01.03” é indiferente a nota das obras. Sendo constatadas não conformidades, deve ser
evidenciado um plano de ação, obrigatoriamente. Para as obras que tiverem avaliações abaixo de 7
(sete), deve ser elaborado contrarrelatório, a apresentar em reunião mensal do comitê de segurança
Diálogo (coordenadores e diretoria).

Grupo de Inspeção 08 – Sinalização de Segurança
Sinalização de segurança (item 08.01 do checklist eletrônico)
08.01.01
Em vias públicas deve ser dirigida para alertar os motoristas e pedestres, sinalização de
acessos e circulação de veículos. Verificar se há sinalização fixada no portão de entrada e saída de
veículos;
08.01.02
Devem identificar os locais de apoio que compõem o canteiro de obras e indicar as
saídas por meio de dizeres ou setas. As áreas de trabalho devem estar delimitadas e sinalizadas;
08.01.03
A obra mantém comunicação através de avisos, cartazes ou similares relacionados à
prevenção de acidentes e doenças do trabalho de acordo com atividades e riscos, conforme PGR e
orientação do SESMT. Existe sinalização nos locais necessários alertando contra perigo de contato ou
acionamento acidental de partes móveis de máquinas e equipamentos.

Grupo de inspeção 09 – Prontidão e Respostas a Emergências
Primeiros Socorros (item 09.01 do checklist eletrônico)
09.01.01
A obra tem o kit primeiros socorros completo, em local adequado e de fácil acesso. (kit,
consiste em banner de primeiros socorros, maca tipo prancha com cinto acoplada;
09.01.02
Todo canteiro de obra deve ter no mínimo 10% do efetivo treinados com o curso de
primeiros socorros;

Extintores (item 09.02 do checklist eletrônico)
09.02.01
Dimensionar no canteiro da obra, num raio de 20m (vinte metros) em área livre,
escritórios, depósitos, escadas, subsolos e áreas de vivência os extintores apropriados à classe de
fogo a extinguir;
```

### IT.07 — página 11 de 30

```text
09.02.02
É obrigatória a instalação de extintores exclusivos para quadros elétricos, depósitos de
inflamáveis, compressores, soldas em oxiacetileno, serras circulares e policorte, elevadores
cremalheira, caldeiras de aquecimento de asfalto etc.
09.02.03
Layout do dimensionamento dos extintores está anexado ao PGR e atualizado de acordo
com a fase da obra e manter em pasta específica controle mensal dos extintores;

Brigada de Incêndio (item 09.03 do checklist eletrônico)
09.03.01
O canteiro de obra deve ter brigada de incêndio organizada e especialmente treinada no
correto manejo do material disponível para o primeiro combate ao fogo, devidamente identificada
(adesivo capacete), devendo o dimensionamento da brigada estar conforme Plano de Emergência da
obra.

Grupo de Inspeção 10 – Escavações e Fundações
Escavações e fundações (item 10.01 do checklist eletrônico)
10.01.01 Os taludes, caixas e valas instáveis das escavações com profundidade superior a 1,25m
(um metro e vinte e cinco centímetros) devem ter sua estabilidade garantida por meio de estruturas
dimensionadas para este fim e devem dispor de escadas ou rampas, colocadas próximas aos postos
de trabalho, a fim de permitir, em caso de emergência, a saída rápida dos trabalhadores.
10.01.02
Muros, edificações vizinhas e todas as estruturas que possam ser afetadas pela
escavação devem ser escorados e ter laudo técnico assinado por engenheiro responsável.
10.01.03
Devem ter próximo aos taludes proteções coletivas rígidas nas vias de passagem de
colaboradores, sendo as instalações de proteções rígidas, contra quedas de pessoas e projeção de
materiais de acordo com procedimento vigente;
10.01.04
Os materiais retirados da escavação devem ser depositados a uma distância superior à
metade da profundidade, medida a partir da borda do talude. Quando existir cabo subterrâneo de
energia elétrica nas proximidades das escavações, as mesmas poderão ser iniciadas quando o cabo
estiver desligado;
10.01.05
O equipamento de descida e içamento de trabalhadores e materiais utilizado na
execução de tubulões a céu aberto deve ser dotado de sistema de segurança com travamento e os
```

### IT.07 — página 12 de 30

```text
funcionários devem receber treinamento de segurança para trabalhos em espaços confinados
conforme NR-33;
10.01.06
Quando houver possibilidade de infiltração ou vazamento de gás, o local deve ser
devidamente ventilado e monitorado e este monitoramento deve ser efetivado enquanto o trabalho
estiver sendo realizado para, em caso de vazamento, ser acionado o sistema de alarme sonoro e visual;
10.01.07
Em caso específico de tubulões a céu aberto e abertura de base, o estudo geotécnico
será obrigatório para profundidade superior a 3 (três) metros.
10.01.08
As escavações realizadas em vias públicas ou canteiros de obras devem ter sinalização
de advertência, inclusive noturna, e barreira de isolamento (tapume) em todo o seu perímetro. Os
acessos de trabalhadores, veículos e equipamentos nas áreas de escavação devem ter sinalização de
advertência permanente. É proibido o acesso de pessoas não autorizadas nas áreas de escavação e
fundação.
10.01.09
O uso de coletes refletivos ou fitas refletivas, no torso e no tórax, é obrigatório em áreas
com trânsito de máquinas e movimentação de cargas por gruas em espaços abertos.

Grupo de Inspeção 11 – Central de fôrmas
Central de fôrmas (item 11.01 do checklist eletrônico)
11.01.01
Ser dotada de mesa estável, com fechamento de suas faces inferiores, anterior e
posterior, construída em madeira resistente e de primeira qualidade, material metálico ou similar de
resistência equivalente, sem irregularidades, com dimensionamento suficiente para a execução das
tarefas e ter a carcaça do motor aterrada eletricamente;
11.01.02
Disco deve ser mantido afiado e travado, devendo ser substituído quando apresentar
trincas, dentes quebrados ou empenamentos;
11.01.03
Dispor de caixa coletora de serragem, proteção nas transmissões de força, provida de
coifa protetora do disco e cutelo divisor e chave de ignição tipo botoeira protegida com sistema de
porta-cadeado;
11.01.04
Nas operações de corte de madeira, devem ser utilizados dispositivo empurrador e guia
de alinhamento, ter uma sinalização de 0,15m do disco, que a partir deste ponto deverá usar o
empurrador;
```

### IT.07 — página 13 de 30

```text
11.01.05
As lâmpadas de iluminação da carpintaria devem estar protegidas contra impactos
provenientes da projeção de partículas;
11.01.06
A carpintaria deve ter piso resistente, nivelado e antiderrapante, com cobertura capaz
de proteger os trabalhadores contra quedas de materiais e intempéries, placas de sinalização de
segurança e placa com identificação e treinamento dos operadores;
11.01.07
Dispor de extintor de pó químico e de água pressurizada devidamente localizado.
Verificar se há liberação do equipamento pelo SESMT;

Grupo de Inspeção 12 – Central de armação
Central de armação (item 12.01 do checklist eletrônico)
12.01.01
A máquina de corte de vergalhões de aço em obra deve possuir proteções de suas
partes de transmissões protegidas coifa protetora do disco, ter a carcaça do motor aterrada
eletricamente, estar sobre bancadas ou plataformas apropriadas e estáveis, apoiadas sobre superfícies
resistentes, niveladas e não escorregadias;
12.01.02
As lâmpadas de iluminação da área de trabalho da armação de aço devem estar
protegidas contra impactos provenientes da projeção de partículas ou de vergalhões;
12.01.03
Os armadores que estiverem armando ferragens devem ter proteção de intempéries;
12.01.04
É proibida a existência de pontas verticais de vergalhões de aço desprotegidas, devendo
ser fornecido protetores de acordo com a espessura da ferragem;
12.01.05
Durante a descarga de vergalhões de aço, a área deve ser isolada;

Grupo de Inspeção 13 – Escadas, rampas, passarelas e tapumes
Escadas, rampas, passarelas e tapume s (item 13.01 do checklist eletrônico)
13.01.01
A madeira a ser usada para construção de escadas, cavaletes, bancadas de trabalho,
rampas e passarelas deve ser de boa qualidade, sem apresentar nós e rachaduras que comprometam
sua resistência, estar seca, sendo proibido o uso de pintura que encubra imperfeições;
13.01.02
A obra deve instalar escada coletiva de madeira ou metálica para acesso a forma das
últimas lajes no início da estrutura;
```

### IT.07 — página 14 de 30

```text
13.01.03
A transposição de pisos com diferença de nível superior a 0,40m (quarenta centímetros)
deve ser feita por meio de escadas ou rampas;
13.01.04
A escada de mão deve ter seu uso restrito para acessos provisórios e serviços de
pequeno porte. Poderão ter até 7,00m (sete metros) de extensão e o espaçamento entre os degraus
deve ser uniforme, variando entre 0,25m (vinte e cinco centímetros) a 0,30m (trinta centímetros);
13.01.05
Escadas duplas (abrir e fechar) devem ser providas de dobradiças com afastadores e
limitadores de abertura com sistema anti-beliscão, que evite lesões na mão do trabalhador. São
proibidas improvisações como uso de arames, correntes, fios, cordas e outros materiais para substituir
os limitadores de abertura;
13.01.06
Escadas manuais deverão atender as especificações da RTP-04 e croqui deve ser
anexado ao PGR. As travessas deverão ser fixadas aos montantes por meio de cavilhas ou outros
meios que garantam sua rigidez. Emendas são proibidas;
13.01.07
As rampas e passarelas provisórias devem ser construídas e mantidas em perfeitas
condições de uso e segurança. As rampas provisórias devem ser fixadas no piso inferior e superior,
não ultrapassando 30° (trinta graus) de inclinação em relação ao piso;
13.01.08
Tapume conservado ou fechado de muro definitivo e no padrão Diálogo;
13.01.09
Plaqueiro conservado e com as descrições corretas;

Grupo de Inspeção 14 – Proteções contra quedas
Interno (item 14.01 do checklist eletrônico)
14.01.01
As aberturas no piso (shaft, passantes e outros) e paredes devem ter fechamento
provisório resistente e fixo para impedir queda de pessoas e objetos;
14.01.02
Os vãos de acesso às caixas dos elevadores devem ter fechamento provisório de, no
mínimo, 1,20m (um metro e vinte centímetros) de altura, constituído de material resistente e
seguramente fixado até a instalação da alvenaria;
14.01.03
Os poços dos elevadores devem ser assoalhados e limpos a cada 3 pavimentos;
14.01.04
Os vãos dos poços dos elevadores após a conclusão de alvenaria, devem ser fechados
por completo até a entrada da porta do elevador definitivo;
```

### IT.07 — página 15 de 30

```text
14.01.05
Obrigatória instalação de armação de ferragem horizontalmente em todos os andares,
em aberturas de lajes e poços de elevadores, em forma de tela junto a armação da laje nos andares.
Os poços de elevadores que estiverem sendo utilizados para instalação de gruas, devem possuir
fechamento provisório com tela de proteção, devendo ter resistência compatível ao slqa, sendo sua
fixação a cada 03 lajes;
14.01.06
Na realização de serviços que atinja altura acima do peitoril da janela, deverá ter
proteção móvel e resistente que proteja o trabalhador contra queda, não sendo permitida a utilização
de proteções improvisadas com madeira na obra, estas proteções devem atender as recomendações
do PGR.

Periferia (item 14.01 do checklist eletrônico)
14.02.01
É obrigatória, na periferia da edificação, a instalação de proteção rígida, contra queda
de trabalhadores e projeção de materiais antes do início dos serviços necessários à concretagem;
Neste item, o auditor deve se ater às condições do piso de trabalho, ou seja, o último pavimento da
estrutura. Quaisquer evidências de outros locais não devem ser aceitas pela engenharia.
14.02.02
Obrigatório o uso do varal de segurança em obras de estrutura convencionais, devendo
ser instalado a partir da segunda laje. O sistema deverá ser instalado no início do gastalho e na
desforma do andar abaixo, a fim de garantir meios de ancoragem do cinturão de segurança durante a
confecção das formas, antes e durante os serviços de concretagem;
14.02.03
É obrigatória, nas escadarias da edificação, a instalação de proteção rígida, contra
queda de trabalhadores e projeção de materiais. Devendo atender aos requisitos do PGR e, caso haja
alterações nestas proteções deve ser consultado o eng. Segurança do SESMT para aprovação do novo
sistema;
14.02.04
É obrigatória, na sacada da edificação, a instalação de proteção rígida, contra queda de
trabalhadores e projeção de materiais;
14.02.05
Nas sacadas da edificação, deve-se instalar fitas de ancoragem ou ganchos na laje
superior para fixação de cabo de aço para ancoragem do cinturão nos pontos das luminárias;
```

### IT.07 — página 16 de 30

```text
14.02.06
Nas aberturas, que serão utilizadas para o transporte vertical de materiais e
equipamentos, devem ser protegidas por guarda-corpo fixo, no ponto de entrada e saída de material,
e por sistema de fechamento do tipo cancela ou similar.
14.02.07
É obrigatória, na periferia da edificação (limites de laje) a instalação de proteção rígida,
contra queda de trabalhadores e projeção de materiais.
14.02.08
O projeto de redes de segurança deve conter o procedimento das fases de montagem,
ascensão e desmontagem dos sistemas piso a piso, slqa e apara lixo;
14.02.09
O sistema de redes deve ser submetido a uma inspeção semanal para verificação das
condições de todos os seus elementos e pontos de fixação.
14.02.10
As redes piso a piso, quando utilizadas para proteção de periferia, devem estar
associadas a um sistema, com altura mínima de 1,2 m (um metro e vinte centímetros), que impeça a
queda de materiais e objetos. Tela milimétrica ou tela tapforte;
14.02.11
Em obras que executem serviços de fachada onde haja possibilidade de projeção interna
e externa ao canteiro de obras, devem instalar galerias de proteção para circulação segura de pessoas
em toda a extensão da calçada e áreas internas do canteiro. A galeria deve ser mantida conservadas,
sem acúmulo de materiais.
O item “14.02.11” refere-se exclusivamente à presença de galerias de proteção ao longo da calçada e
áreas internas do canteiro, quando necessário, independente da presença de bandejas. Não devem
ser considerados proteções de vizinho neste item.

Grupo de Inspeção 15 – Plataformas
Plataformas (item 15.01 do checklist eletrônico)
15.01.01
Em todo perímetro da construção de edifícios é obrigatória a instalação de uma
plataforma principal de proteção com projeção mínima de 2,50m (dois metros e cinquenta centímetros),
e complementos de 0,80m (oitenta centímetros), com inclinação de 45° (quarenta e cinco graus) perfil
de 3 polegadas na altura da primeira laje que esteja, no mínimo, um pé-direito acima do nível do terreno;
15.01.02
Deve-se garantir a manutenção preventiva na plataforma principal, sempre que houver
madeiramento danificado, aberturas entre tábuas ou vãos abertos e suportes caindo ou sem o calço.
Sempre que for utilizado suportes de plataformas Diálogo, deve ser realizada uma manutenção
```

### IT.07 — página 17 de 30

```text
preventiva antes do início das montagens, mantendo estes registros destas manutenções a disposição
no canteiro.
15.01.03
Deverá dispor de cabo de aço de "3/8" instalado a 1,20 metros do piso em todo o
perímetro da plataforma primária para ancoragem do cinto de segurança em serviços de manutenção
e limpeza do local. Ter anexado ao PGR o projeto de instalação, ART de montagem e desmontagem
da bandeja e laudo técnico de sustentação dos suportes ou estrutura de andaimes.
15.01.04
Na ocorrência de plataformas tipo "secundária" ou "terciárias", os sistemas devem ser
instalados por todo o perímetro da torre, com projeção definida em projeto aplicável, e com
complementos de 0,80m (oitenta centímetros) em 45° (quarenta e cinco graus).
15.01.05
Deve-se garantir a manutenção preventiva nas plataformas secundárias e terciárias,
quando houver, substituindo o madeiramento danificado, vedando aberturas entre tábuas ou vãos
abertos e suportes caindo ou sem o calço. Sempre que for utilizado suportes de plataformas Diálogo,
deve ser realizada uma manutenção preventiva antes do início das montagens, mantendo estes
registros destas manutenções a disposição no canteiro.
15.01.06
As plataformas secundárias e terciárias, quando houver, deverão dispor de cabo de aço
de "3/8" instalado a 1,20 metros do piso em todo o perímetro, de modo a permitir a ancoragem do cinto
de segurança em serviços de manutenção e limpeza do local.
15.01.07
As “plataformas de trabalho" ou de pilar devem ser instaladas em pilares com seção
superior a 1,00m (um metro), com no mínimo 1,0m (um metro) cesso seguro à plataforma e manter
fechamento rígido nas laterais, devem ser convenientemente fixados à construção na posição de
trabalho, dispor do sistema de guarda-corpo e rodapé tela entre vãos, sendo proibido acrescentar
trecho em balanço do estrado.

Grupo de Inspeção 16 – Entelamento
Entelamento (item 16.01 do checklist eletrônico)
Os itens constantes deste grupo de inspeção referem-se a presença de proteção de vizinhos (16.01.01)
e tela fachadeira (16.01.02). Na ausência de tela fachadeira, e sendo evidenciado o uso de balancins
sem o sistema, o auditor deve penalizar a obra nos itens 16.01.02 e 17.01.04 (ausência de medidas de
segurança em andaimes suspensos).
```

### IT.07 — página 18 de 30

```text
16.01.01
Em situação de exposição de vizinhos devemos prever proteção coletiva em todos os
pontos da obra que houver necessidade, antes do início da estrutura;
16.01.02
Perímetro da construção de edifícios deve ser fechado com tela, formando barreira
protetora contra projeção de materiais e ferramentas, a partir da plataforma principal e entre as
extremidades de 2 (duas) plataformas de proteção consecutivas (quando houver), só podendo ser
retirada quando a vedação da periferia, até a plataforma imediatamente superior, estiver concluída.
Esta tela deve ser instalada de forma que acompanhe o contorno da plataforma de proteção. Para
instalação da tela fachadeira deverá haver projeto de instalação que contemple os pontos de ﬁxação;

Grupo de Inspeção 17 – Andaimes suspensos leves
Andaimes suspensos leves (item 17.01 do checklist eletrônico)
17.01.01
Andaimes suspensos mecânicos: sustentação deve ser feita por meio de vigas
metálicas, sendo proibido sistema de sustentação por meio de saco com areia, latas de concreto ou
sobre muretas instáveis sendo que os cabos de sustentação devem ter o cumprimento tal que a posição
mais baixa do estrado, restem pelo menos 06 voltas sobre cada tambor com clipes prendendo o cabo
a catraca.
17.01.02
Os andaimes deverão ser dotados de placas de identificação colocada em local visível
onde conste a carga máxima de trabalho permitida número do andaime e placa de orientação de
segurança.
17.01.03
Possuir corda de fixação protegida contracantos vivos para dispositivo trava-quedas fixa
em ponto seguro e independente do restante do conjunto.
17.01.04
Instalação e a manutenção dos andaimes devem ser feitas de acordo com projeto que
contemple o detalhe técnico da montagem e do equipamento, medidas de segurança elaborado por
profissional qualificado, sob supervisão e anotação de responsabilidade técnica (ART) de profissional
legalmente habilitado obedecendo, quando de fábrica, as especificações técnicas do fabricante.
No item “17.01.04”, entende-se por “medidas de segurança” a presença de tela fachadeira, isolamentos
na área de descida dos balancins, revestimento do balancim com telas (no guarda-corpo e aberturas
laterais abaixo das catracas).
Durante eventual inspeção, caso o auditor evidencie a falta de tela fachadeira na descida dos balancins,
```

### IT.07 — página 19 de 30

```text
sua avaliação deverá penalizar o item 16.01.02 e o item 17.01.04
17.01.05
Os guinchos de elevação devem dispor de dispositivo que impeça o retrocesso do
tambor, possuir a 2ª trava de segurança, cada tambor deve ser acionado por alavancas, manivelas ou
automaticamente, na subida e descida do andaime.

Grupo de Inspeção 18 – Cadeira suspensa
Cadeira suspensa (item 18.01 do checklist eletrônico)
18.01.01
A cadeira suspensa deve dispor de sistema com dispositivo de subida e descida com
dupla trava de segurança, sistema de fixação do trabalhador por meio de cinto de segurança, com
sistema de sustentação feito por meio de cabo de aço, sendo proibida a improvisação de cadeira
suspensa.
18.01.02
O trabalhador deve utilizar cinto de segurança tipo paraquedista, ligado ao trava-quedas
em cabo-guia independente com corda protegida contracantos vivos.
18.01.03
A instalação e a manutenção da cadeira suspensa devem ser precedidas de ART do
equipamento e elaboração de projeto/croqui de instalação que contemple os detalhes de fixação e
detalhes técnicos do equipamento e ser elaborado por profissional qualificado, sob supervisão de
profissional legalmente habilitado obedecendo, quando de fábrica, as especificações técnicas do
fabricante.
18.01.04
Cadeira suspensa deve apresentar na sua estrutura, em caracteres indeléveis e bem
visíveis, a razão social do fabricante e o número do registro respectivo no cadastro geral de
contribuintes.

Grupo de Inspeção 19 – Elevador cremalheira
Elevador cremalheira (item 19.01 do checklist eletrônico)
19.01.01
O elevador cremalheira deverá ser instalado a partir da concretagem da quinta laje ou
altura equivalente (15 metros). É terminantemente proibido o transporte de material e passageiro no
interior do elevador;
```

### IT.07 — página 20 de 30

```text
19.01.02
Equipamentos de transporte vertical devem ser montados conforme projeto,
desmontados e ter manutenção feita por trabalhador qualificado. Verificar se há liberação do
equipamento pelo SESMT.
19.01.03
Deve ser fixada uma placa no interior do elevador de material, placa padrão Diálogo com
foto e treinamento do operador e placa contendo a indicação de carga máxima e a proibição de
transporte de pessoas;
19.01.04
A torre e o guincho do elevador devem ser aterrados eletricamente
19.01.05
Em todos os acessos de entrada à torre do elevador deve ser instalada uma barreira
que tenha, no mínimo 1,80m (um metro e oitenta centímetros) de altura, impedindo que pessoas
exponham alguma parte de seu corpo no interior da mesma. Garantir o fechamento da porta dos fundos
cabine do equipamento com cadeado ou similar
19.01.06
Devem dispor de chave de partida e bloqueio (botoeira com chave) que impeça o
acionamento por pessoa não autorizada;
19.01.07
As torres do elevador de material e do elevador de passageiros devem ser equipadas
com dispositivo de segurança (limitador eletrônico) que impeça a abertura da barreira (cancela), quando
o elevador não estiver no nível do pavimento;
19.01.08
Obrigatória à manutenção preventiva mensal, realizada mensalmente. Deve ser
realizado teste dos freios de emergência dos elevadores na entrega para início de operação e, no
máximo, a cada 90 (noventa) dias;
No item 19.01.08, não cabem julgamentos acerca do período mínimo, em dias, para avaliação mensal
do equipamento. O auditor deve validar o item caso a manutenção ocorreu no mês da auditoria ou está
programada para o período, apenas. A exigência de período específico para manutenção é aplicável,
APENAS, aos testes de freio dos elevadores (teste de queda);
19.01.09
Rampas de acesso à torre do elevador devem ter guarda-corpo, rodapé e tela, ter piso
resistente sem aberturas, ser fixados à estrutura do prédio e da torre e não ter inclinação descendente
no sentido da torre. Deve haver altura livre de no mínimo 2,00m (dois metros) sobre a rampa.

Grupo de Inspeção 20 – Grua
Grua (item 20.01 do checklist eletrônico)
```

### IT.07 — página 21 de 30

```text
20.01.01
Plano de carga deve estar em arquivo devidamente identificado, contendo os
documentos da grua e acessórios, manuais técnicos do fabricante, ART do fabricante (quando for
produção nacional) e de montagem, operação e manutenção da grua e croqui ou planta baixa,
mostrando a área coberta pela operacionalização do equipamento, possíveis interferências, locais de
carga e descarga e sentido de movimentação das cargas;
20.01.02
A ponta da lança e o cabo de aço de sustentação devem ficar no mínimo a 3,00m (três
metros) de qualquer obstáculo e ter afastamento da rede elétrica que atenda orientação do SESMT/
concessionária local;
20.01.03
Para montagem e desmontagem de grua com utilização de guindastes deverá ser
seguidos os seguintes requisitos: ART do equipamento responsabizando-se pelas condições do
equipamento, cópia da última manutenção preventiva, plano rigging específico ao local de instalação,
autorização da CET em caso de utilização de espaço público;
20.01.04
Quando o equipamento de guindar não estiver em operação, a lança deve ser colocada
em posição de descanso. Proibido qualquer trabalho sob intempéries ou outras condições
desfavoráveis que exponham a risco os trabalhadores da área;
20.01.05
A grua deve estar devidamente aterrada e, quando necessário, dispor de para raios
situados a 2,00m (dois metros) acima da ponta mais elevada da torre;
20.01.06
Obrigatória a manutenção preventiva mensal, realizada por profissionais qualificados e
ter sua supervisão por profissional legalmente habilitado;
Tal qual o item 19.01.08, não deve ser avaliado o período decorrido entre uma manutenção e outra,
mas sim se ela foi realizada no mês da auditoria ou está prevista para o mês.
20.01.07
Proibido o içamento de caçamba estacionaria pela grua;
20.01.08
É obrigatória a instalação de dispositivos de segurança ou fins de curso automáticos
como limitadores de momento, cargas ou movimentos, ao longo da lança. A grua deve possuir
anemômetro, alarme sonoro que será acionado pelo operador sempre que houver movimentação de
carga, placas de indicação de capacidade de carga ao longo da lança;
```

### IT.07 — página 22 de 30

```text
Grupo de Inspeção 21 – Andaimes simplesmente apoiados, móveis e fachadeiros
Andaimes simplesmente apoiados, móveis e fachadeiros (item 21.01 do checklist eletrônico)
21.01.01
Os andaimes devem dispor de sistema guarda-corpo com rodapés revestido com tela,
inclusive nas cabeceiras, em todo o perímetro;
21.01.02
Os andaimes devem dispor de barra de ligação e diagonais. Conforme padrão;
21.01.03
Os andaimes devem dispor de piso de trabalho completo. Conforme padrão;
21.01.04
Os andaimes devem dispor de escada de acesso incorporada ao andaime e sapatas.
Conforme padrão;
21.01.05
É proibida, sobre o piso de trabalho de andaimes, a utilização de escadas e outros meios
para se atingirem lugares mais altos;
21.01.06
Os andaimes simplesmente apoiados de madeira não podem ser utilizados em obras
acima de 3 (três) pavimentos ou altura equivalente, podendo ter o lado interno apoiado na própria
edificação.
21.01.07
É proibido trabalho em andaimes apoiados sobre cavaletes que possuam altura superior
a 2,00m (dois metros) e largura inferior a 0,90m (noventa centímetros);
21.01.08
A estrutura dos andaimes deve ser fixada à construção por meio de amarração e
entroncamento, de modo a resistir aos esforços a que estará sujeita. O andaime fachadeiro deve
possuir entelamento em sua estrutura, de forma a limitar a queda de materiais;
21.01.09
Os andaimes fachadeiros não devem receber cargas superiores às especificadas pelo
fabricante. Sua carga deve ser distribuída de modo uniforme, sem obstruir a circulação de pessoas e
ser limitada pela resistência da forração da plataforma de trabalho. Obs.: todos os andaimes
fachadeiros, devem dispor de projeto e ART.

Grupo de Inspeção 22 – Instalações Elétricas Provisórias
Instalações elétricas provisórias (item 22.01 do checklist eletrônico)
22.01.01
A execução e manutenção das instalações elétricas devem ser realizadas por
trabalhador qualificado com o curso de NR-10 dentro da sua validade de 2 anos, e a supervisão por
profissional legalmente habilitado.
```

### IT.07 — página 23 de 30

```text
22.01.02
As instalações elétricas de obras devem ser constituídas de: a) chave geral do tipo
blindada de acordo com a aprovação da concessionária local, localizada no quadro principal de
distribuição; b) chave individual para cada circuito de derivação; c) chave faca blindada em quadro de
tomadas; chaves magnéticas e disjuntores, para os equipamentos;
22.01.03
Os quadros gerais de distribuição devem ser mantidos trancados, sendo seus circuitos
identificados, devem estar devidamente aterrados. Não será permitida a utilização de quadros elétricos
confeccionados com madeiras, devendo ser realizados com materiais adequados e dimensionados
para tal fim.
22.01.04
Máquinas ou equipamentos elétricos móveis só podem ser ligados por intermédio de
conjunto de plug e tomada. Todas as máquinas e equipamentos devem ser ligadas em cabos com
duplo isolamento, não podendo haver partes expostas, devendo ter isolamento adequado. O uso de
fios paralelos é proibido;
22.01.05
As extensões e fiações devem ser mantidas fora das vias de passagem, sobretudo em
locais com possível acúmulo de água;
22.01.06
Os vibradores devem ter isolamento duplo, estar aterrados e possuir dispositivos de
alimentação (plugs)

Grupo de Inspeção 23 – Máquinas, Equipamentos e Ferramentas Diversas
Verificação de máquinas, equipamentos e ferramentas diversas (item 23.01 do checklist
eletrônico)
23.01.01
As inspeções em gruas, minigruas e acessórios para içamento de cargas devem ser
registradas em checklist de inspeção diária, padrão Diálogo, constando as datas e falhas observadas,
e medidas corretivas adotadas. Devem ser assinadas pelo profissional que vistoriou o equipamento e
pelo engenheiro responsável pela obra;
23.01.02
As inspeções em elevadores cremalheiras e de cargas devem ser registradas em
documento checklist de inspeção diária, padrão Diálogo, constando as datas e falhas observadas, e
medidas corretivas adotadas. Devem ser assinadas pelo profissional que vistoriou o equipamento e
pelo engenheiro responsável pela obra;
```

### IT.07 — página 24 de 30

```text
23.01.03
As inspeções em serras de bancada, policorte e serra “clipper” (cortadora de piso)
devem ser registradas em checklist de inspeção diária, padrão Diálogo, constando as datas e falhas
observadas, e medidas corretivas adotadas. Devem ser assinadas pelo profissional que vistoriou o
equipamento e pelo engenheiro responsável pela obra;
23.01.04
As inspeções em misturadores de massa devem observar as condições do equipamento
e medidas de segurança. As grades não podem permitir o acesso da mão às espátulas das masseiras
e os dispositivos de segurança e sensores devem funcionar corretamente. As verificações devem ser
registradas em documento específico (checklist), constando as datas e falhas observadas, além das
medidas corretivas adotadas.
23.01.05
A caldeira elétrica para aquecimento de asfalto deve ter termostato analógico de
regulagem de temperatura (máx. 200°c), instalações elétricas adequadas, tampa com respiradouro,
recipiente metálico com tampa e alça. As inspeções em caldeiras devem ser registradas em checklist
de inspeção diária, padrão Diálogo, constando as datas e falhas observadas, e medidas corretivas
adotadas. Devem ser assinadas pelo profissional que vistoriou o equipamento e pelo engenheiro
responsável pela obra;
23.01.06
As inspeções em máquinas leves (mini pcs e mini escavadeiras) e pesadas
(escavadeiras, pá carregadeiras, hélices, bate estacas, guindastes etc.) devem ser registradas em
checklist de inspeção diária, padrão Diálogo, constando as datas e falhas observadas, e medidas
corretivas adotadas. Devem ser assinadas pelo profissional que vistoriou o equipamento e pelo
engenheiro responsável pela obra;
23.01.07
As inspeções em andaimes suspensos (balancins e cadeiras suspensas) devem ser
registradas em checklist de inspeção diária, padrão Diálogo, constando as datas e falhas observadas,
as medidas corretivas adotadas e a indicação de pessoa habilitada que as realizou, devidamente
assinadas pelo responsável da obra;
23.01.08
As inspeções nos vasos de pressão devem possuir prontuário específico ao
equipamento (conforme NR-13), constando as características e capacidade do equipamento, datas de
aferição e das próximas manutenções, indicação de pessoa, técnico ou empresa habilitada que as
realizou, devidamente assinadas pelo responsável da obra;
```

### IT.07 — página 25 de 30

```text
23.01.09
As obras que possuírem dutos de entulho ou de massa deve ser instalado, conforme
orientações de acordo com o projeto e ser procedida de manutenções preventivas, montagem por
pessoas treinadas. Ser preenchido checklist fornecido pelo fornecedor;
23.01.10
É necessário que a obra apresente o projeto de fixação dos sistemas de espera de
ancoragem pós-obra conforme NR-18.12, a partir de 6 meses do início da obra;
23.01.11
As ancoragens, provisórias e definitivas, devem ter resistência a arrancamento
apresentadas em laudo específico, conforme NR-18 e/ou normas técnicas nacionais vigentes.

Grupo de Inspeção 24 – Específico a Pólvora
Atividades específicas à pólvora (item 24.01 do checklist eletrônico)
Neste item, deve ser apenas evidenciado se os profissionais possuem a carteira de habilitação para
uso de ferramentas de fixação a pólvora. Os treinamentos, ou a ausência destes, devem ser medidos
no item 05, subitem 05.01.02 (treinamentos específicos).
Caso evidenciado que: 1) o funcionário que opere a ferramenta não possua a autorização para uso e;
2) não possua o treinamento anexado na plataforma de gestão de documentos, devem ser penalizados
os itens 05.01.02 e 24.01.01
24.01.01
Os trabalhadores devem possuir carteira de habilitação para uso de ferramentas de
fixação a pólvora.

Grupo de Inspeção 25 – Iluminação
Iluminação (item 25.01 do checklist eletrônico)
Não deve ser medido, neste item, a iluminação das áreas sanitárias. Caso o refeitório apresente
iluminação deficiente, ele deve ser registrado no item 25.01.01.
25.01.01
Todas as dependências da obra, sobretudo áreas de circulação (escadarias, halls e
subsolos) devem ser iluminadas através de iluminação natural ou artificial, e em atividades noturnas,
caso ocorra, a fim de atender as necessidades do processo;
25.01.02
Todo sistema de iluminação deve ser provido de sistema contra queda das lâmpadas.
```

### IT.07 — página 26 de 30

```text
Grupo de Inspeção 26 – Ordem e Limpeza
Ordem e limpeza (item 26.01 do checklist eletrônico)
26.01.01
O canteiro de obras deve apresentar-se organizado, limpo e desimpedido, notadamente
nas vias de circulação, passagens, escadarias e em frente a quadros elétricos; o entulho e quaisquer
sobras de materiais devem ser regulamente coletados e removidos;
26.01.02
A obra deve contratar empresa especializada para realização semestral de controle de
pragas (desratização) e vetores em todas as dependências do canteiro
26.01.03
A obra deve garantir a retirada de água acumulada/parada em vãos de elevadores
definitivos/cremalheira, valas e caixas de fundação, lajes de cobertura, terraços e caixas d’água,
mediante uso de bombas para esta atividade;
26.01.04
O passeio público deve manter-se em condições adequadas para o trânsito de
pedestres, sem buracos ou obstáculos que impeçam e/ou dificultem a passagem. Durante
concretagens, deve ser posicionada passarela sobre a tubulação de maneira a permitir o fluxo de
pedestres pelo calçamento ou caminho seguro e sinalizado.

Grupo de Inspeção 27 – Atendimento a Convenção Coletiva
Atendimento a convenção coletiva (item 27.01 do checklist eletrônico)
27.01.01
Verificar o atendimento integral da convenção coletiva da categoria pelos empreiteiros
contratados (entrevistar colaboradores no campo)

3.2 CÁLCULO E PONDERAÇÕES
O checklist de avaliação possui diversas ponderações, tanto para os itens quanto para os grupos de
inspeção, além de um multiplicador (1,0) para a fase representativa da obra. Abaixo, são exibidas as
ponderações dos Grupos de Inspeção.

GRUPO DE INSPEÇÃO
PESO
01. ÁREAS DE VIVÊNCIA
2
02. BEBEDOURO
2
03. AUXILIARES DE LIMPEZA, HIGIENIZAÇÃO E PORTARIA
2
```

### IT.07 — página 27 de 30

```text
04. E.P.I.S E UNIFORMES
4
05. TREINAMENTOS
2
06. DOCUMENTAÇÃO LEGAL OBRIGATÓRIA
3
07. GESTÃO DE SEGURANÇA
1
08. SINALIZAÇÃO DE SEGURANÇA
2
09. PRONTIDÃO E RESPOSTAS A EMERGÊNCIAS
1
10. ESCAVAÇÕES E FUNDAÇÕES
10
11. CENTRAL DE FORMA
2
12. CENTRAL DE ARMAÇÃO
2
13. ESCADAS, RAMPAS, PASSARELAS E TAPUMES
5
14. PROTEÇÃO CONTRA QUEDAS
10
15. PLATAFORMA
10
16. ENTELAMENTO
3
17. ANDAIMES SUSPENSOS PESADOS
5
18. CADEIRA SUSPENSA
5
19. ELEVADOR DA OBRA
4
20. GRUA
5
21. ANDAIMES SIMPLESMENTE APOIADOS, FACHADEIROS E MÓVEIS
6
22. INSTALAÇÕES ELÉTRICAS PROVISÓRIAS E EQUIPAMENTOS
5
23. MÁQUINAS, EQUIPAMENTOS E FERRAMENTAS DIVERSAS
4
24. ESPECÍFICO A PÓLVORA
1
25. ILUMINAÇÃO
2
26. ORDEM E LIMPEZA
4
27. ATENDIMENTO A CONVENÇÃO COLETIVA
1

Para compreensão da obtenção das notas, por item de inspeção e por grupo, toma-se um exemplo do
Grupo 5 – Treinamentos, cujo multiplicador é igual a 2. São computadas as notas (0 ou 10) cujo item é
aplicável, durante a realização da auditoria.
```

### IT.07 — página 28 de 30

```text
ITEM
DESCRIÇÃO
PESO
APLICÁVEL
NOTA
PONTOS
05.01.01
Todos os empregados devem receber treinamento
admissional e periódico (quando assim fizer
necessário), visando a garantir a execução de suas
atividades com segurança.
10
A
10
100
05.01.02
Deverão
receber
treinamentos
específicos
operadores
de
equipamentos
como:
grua,
cremalheira, serra circular, policorte, mini-grua,
guincho de carga, guincho velox, andaimes
suspensos, cadeirinhas, máquinas pesadas, bob
cat, soldadores, bate-estacas, perfuratriz e outros
que se tornarem necessários.
10
A
10
100
05.01.03
Treinamento específico bienal para trabalho em
altura conforme NR-35 com carga horária mínima
de 08 horas, constando conteúdo programático.
10
A
10
100
05.01.04
Devem ter treinamento de integração DIALOGO
dentro da validade de 1 ano.
20
A
0
0
05.01.05
Realização de DSS uma vez por semana seguindo
o manual
10
A
10
100
05.01.06
Curso NR 10, mínimo de 40 (quarenta) horas,
sempre atualizados a cada 02 anos, para
trabalhadores que executam instalações elétricas,
em caso de cabine primária e subestação o
profissional deve possuir curso sep sistema elétrico
de potência.
15
A
10
150

PONTOS OBTIDOS X
POSSÍVEIS
(SOMA
PONTOS
OBTIDOS)

550
(SOMA
PONTOS
POSSÍVEIS)

750

APROVEITAMENTO
7,33

PESO DO GRUPO = 2
14,66
```

### IT.07 — página 29 de 30

```text
Todos os demais grupos seguem o mesmo conceito, conforme Tabela 2, abaixo:
ITENS DA INSPEÇÃO
NOTA
GRUPO
PESO DO
GRUPO
NOTA
FINAL
01.ÁREAS DE VIVÊNCIA
9,26
2,00
18,52
02.BEBEDOURO
10,00
2,00
20,00
03.AUXILIARES DE LIMPEZA, HIGIENIZAÇÃO E PORTARIA
10,00
2,00
20,00
04.EQUIPAMENTOS DE PROTEÇÃO INDIVIDUAL - E.P.I.S E UNIFORMES
10,00
4,00
40,00
05.TREINAMENTOS
7,33
2,00
14,66
06.DOCUMENTAÇÃO LEGAL OBRIGATÓRIA
8,06
3,00
24,18
07.GESTÃO DE SEGURANÇA
10,00
1,00
10,00
08.SINALIZAÇÃO DE SEGURANÇA
6,67
2,00
13,34
09.PRONTIDÃO E RESPOSTAS A EMERGÊNCIAS
10,00
1,00
10,00
10.ESCAVAÇÕES E FUNDAÇÕES
3,23
10,00
32,30
11.CENTRAL DE FORMA
N/A
0,00
0,00
12.CENTRAL DE ARMAÇÃO
6,67
2,00
13,34
13.ESCADAS, RAMPAS, PASSARELAS E TAPUMES
10,00
5,00
50,00
14.PROTEÇÃO CONTRA QUEDAS
5,00
10,00
50,00
15.PLATAFORMA
N/A
0,00
0,00
16.ENTELAMENTO
N/A
0,00
0,00
17.ANDAIMES SUSPENSOS PESADOS
0,00
5,00
0,00
18.CADEIRA SUSPENSA
N/A
0,00
0,00
19.ELEVADOR DA OBRA
N/A
0,00
0,00
20.GRUA
N/A
0,00
0,00
21.ANDAIMES SIMPLESMENTE APOIADOS, FACHADEIROS E MÓVEIS
N/A
0,00
0,00
22.INSTALAÇÕES ELÉTRICAS PROVISÓRIAS E EQUIPAMENTOS
8,24
5,00
41,20
23.MÁQUINAS, EQUIPAMENTOS E FERRAMENTAS DIVERSAS
10,00
4,00
40,00
24.ESPECÍFICO A PÓLVORA
N/A
0,00
0,00
25.ILUMINAÇÃO
10,00
2,00
20,00
26.ORDEM E LIMPEZA
1,67
4,00
6,68
27.ATENDIMENTO A CONVENÇÃO COLETIVA
10,00
1,00
10,00

A nota da avaliação é dada pela seguinte relação:
```

### IT.07 — página 30 de 30

```text
𝐴𝑣𝑎𝑙𝑖𝑎çã𝑜= ∑𝑁𝑜𝑡𝑎 𝑓𝑖𝑛𝑎𝑙 𝑑𝑜 𝑔𝑟𝑢𝑝𝑜
∑𝑃𝑒𝑠𝑜 𝑑𝑜 𝑔𝑟𝑢𝑝𝑜
= 434,22
67
= 𝟔, 𝟒𝟖

4. FORMULÁRIOS E MODELOS CORRELATOS
O Plano de Ação, exigido em 07.01.03, deve ser redigido em formulário específico, e disponibilizado
no portal AUTODOC.

Aprovado para uso:
LUIZA DUTRA                                                                 08/09/2026
Elaborado/revisado por:
IBRAHIM CRUZ / CARLOS EDUARDO RICARDO              08/09/2026
```

## Anexo H — Observações identificadas em vermelho no corpo da IT.07

Este anexo repete os trechos de orientação destacados em vermelho no original para facilitar sua localização. Não são quesitos extras e não devem gerar pontuação adicional. A associação a itens/grupos deve respeitar o contexto do Anexo G.

### Destaques da página 1

```text
Obs.: neste item, a conservação refere-se ao estado estrutural dos ambientes (ferrugem, fissuras e
outras aberturas, depressões no piso etc.) e não deve ser avaliada a higiene e limpeza, mas sim no
item 01.02 – Instalações Sanitárias – geral.
```

### Destaques da página 2

```text
De acordo com a NR-18 (18.5), entende-se por instalação sanitária, o conjunto constituído por lavatório,
bacia sanitária sifonada, mictório e chuveiro. A conservação, higiene e limpeza dos ambientes serão
medidos neste item, somente.
```

### Destaques da página 6

```text
No item 01.08.13 deve ser avaliada somente a existência de bebedouro nas modalidades descritas
(jato inclinado, industrial ou galão) e especificamente no refeitório. As condições dos equipamentos,
dimensionamento, potabilidade e regime de manutenção serão aferidos no Grupo 02 – Bebedouros,
somente.
Este grupo de inspeção deve ser medido a partir da existência de bebedouros fora do refeitório, como
em portarias ou outros pontos do canteiro, exceto em 02.01.03.
```

### Destaques da página 8

```text
Para o uso de coletes em áreas de fundação e escavação, por parte de todos os funcionários do
canteiro, consultar Grupo de Inspeção 10 – Escavações e Fundações.
```

### Destaques da página 10

```text
O item “07.01.03” é indiferente a nota das obras. Sendo constatadas não conformidades, deve ser
evidenciado um plano de ação, obrigatoriamente. Para as obras que tiverem avaliações abaixo de 7
(sete), deve ser elaborado contrarrelatório, a apresentar em reunião mensal do comitê de segurança
Diálogo (coordenadores e diretoria).
```

### Destaques da página 15

```text
Neste item, o auditor deve se ater às condições do piso de trabalho, ou seja, o último pavimento da
estrutura. Quaisquer evidências de outros locais não devem ser aceitas pela engenharia.
```

### Destaques da página 16

```text
O item “14.02.11” refere-se exclusivamente à presença de galerias de proteção ao longo da calçada e
áreas internas do canteiro, quando necessário, independente da presença de bandejas. Não devem
ser considerados proteções de vizinho neste item.
```

### Destaques da página 17

```text
Os itens constantes deste grupo de inspeção referem-se a presença de proteção de vizinhos (16.01.01)
e tela fachadeira (16.01.02). Na ausência de tela fachadeira, e sendo evidenciado o uso de balancins
sem o sistema, o auditor deve penalizar a obra nos itens 16.01.02 e 17.01.04 (ausência de medidas de
segurança em andaimes suspensos).
```

### Destaques da página 18

```text
No item “17.01.04”, entende-se por “medidas de segurança” a presença de tela fachadeira, isolamentos
na área de descida dos balancins, revestimento do balancim com telas (no guarda-corpo e aberturas
laterais abaixo das catracas).
Durante eventual inspeção, caso o auditor evidencie a falta de tela fachadeira na descida dos balancins,
```

### Destaques da página 19

```text
sua avaliação deverá penalizar o item 16.01.02 e o item 17.01.04
```

### Destaques da página 20

```text
No item 19.01.08, não cabem julgamentos acerca do período mínimo, em dias, para avaliação mensal
do equipamento. O auditor deve validar o item caso a manutenção ocorreu no mês da auditoria ou está
programada para o período, apenas. A exigência de período específico para manutenção é aplicável,
APENAS, aos testes de freio dos elevadores (teste de queda);
```

### Destaques da página 21

```text
Tal qual o item 19.01.08, não deve ser avaliado o período decorrido entre uma manutenção e outra,
mas sim se ela foi realizada no mês da auditoria ou está prevista para o mês.
```

### Destaques da página 25

```text
Neste item, deve ser apenas evidenciado se os profissionais possuem a carteira de habilitação para
uso de ferramentas de fixação a pólvora. Os treinamentos, ou a ausência destes, devem ser medidos
no item 05, subitem 05.01.02 (treinamentos específicos).
Caso evidenciado que: 1) o funcionário que opere a ferramenta não possua a autorização para uso e;
2) não possua o treinamento anexado na plataforma de gestão de documentos, devem ser penalizados
os itens 05.01.02 e 24.01.01
Não deve ser medido, neste item, a iluminação das áreas sanitárias. Caso o refeitório apresente
iluminação deficiente, ele deve ser registrado no item 25.01.01.
```

---
**FIM DO DOCUMENTO.** Após ler e utilizar os anexos, implemente somente a Etapa 1 definida acima.
