# Auditorias de Segurança — regras implementadas em 05/10/2026

Situação: regras e layout aprovados; deploy autorizado em 05/10/2026. Migração e configuração do servidor fazem parte desta publicação. A guia de demonstração continua restrita ao desenvolvimento.

## Pesos e catálogo

205 itens e 27 grupos, usando pesos da planilha `Cópia de Checklist Diálogo_2026`, relacionados exclusivamente pelo código. Configuração: `src/domain/security-weights.json`, versão `IT07-R02-PESOS-2026-10-05`.

Exceções aprovadas: linha da planilha 01.07.08 corresponde ao item 01.08.08; 04.01.03 e 10.01.09 continuam no roteiro. Os três têm peso 10. Nomes, descrições, critérios e orientações preservados. Sem divisão por fase ou peso separado de subgrupo.

A migração cria uma nova revisão do catálogo existente, alterando somente pesos e sua identificação. Rascunhos existentes e publicações mantêm seus snapshots anteriores. Na ausência de revisão no banco, novos rascunhos usam o catálogo embarcado atualizado.

## Cálculo

- Conforme: fator 1; parcialmente não conforme: 0,5; totalmente não conforme: 0.
- Não se aplica: fora do numerador e denominador, mas conta como resposta válida.
- Nota do grupo = 10 × soma(peso do item × fator) / soma(pesos dos itens aplicáveis).
- Nota bruta = soma(nota do grupo × peso do grupo) / soma(pesos dos grupos aplicáveis).
- Grupo inteiramente não aplicável não participa do cálculo; auditoria inteira não aplicável fica sem nota.
- Itens graves não têm desconto adicional.
- Nota final = máximo(0, nota bruta − soma das penalidades), arredondada somente ao final, com duas casas decimais. Compensação mínima de precisão binária no arredondamento.

## Botão de grupo

Preenche somente respostas em branco com Não se aplica, mantendo textos, fotos e respostas existentes. O marcador `autoGroupNA` identifica exatamente as respostas preenchidas automaticamente e é salvo no rascunho.

Reativar pelo botão remove essas respostas automáticas, restaurando os campos em branco. Editar a resposta de um item reativa o grupo, elimina os marcadores do grupo e altera apenas aquele item. Os demais continuam Não se aplica. Alterar observação/foto não apaga respostas.

## Fechamento e acidentes

Todos os itens precisam estar respondidos; exigência anterior de fotos para não conformidades permanece. Ao fechar, a declaração de acidentes é obrigatória, sem seleção inicial.

- Não: segue para revisão sem penalidade.
- Sim: um ou mais acidentes, com data no mês da auditoria, tipo, acontecimento e justificativa obrigatórios. Categoria removida conforme revisão do formulário.
- Comum: menos 1 ponto por acidente.
- Com afastamento: menos 2 pontos por acidente.

Revisão e PDF apresentam nota bruta, penalidades, nota final e os acidentes. Servidor valida respostas e acidentes, recalcula a nota usando o snapshot e gera o PDF. Banco faz uma segunda conferência da nota e mantém os dados publicados imutáveis.

## Persistência e revisão local

Migração preparada: `20261005000100_safety_scoring_accidents.sql`. Acrescenta declaração no rascunho e snapshot publicado, nota bruta e total de penalidades; permite nota nula em Segurança sem itens aplicáveis.

A guia `/revisao-seguranca` está disponível somente em desenvolvimento, usa os mesmos componentes de preenchimento/revisão/PDF e dados de demonstração em memória. Não chama os serviços de gravação. O botão Simular todos conformes permite testar rapidamente o fechamento. Recarregar descarta os dados dessa demonstração.

A persistência usa a migração aprovada e o segredo de servidor `SUPABASE_SECRET_KEY`, configurado somente no Render com autorização explícita. Consulte `PUBLICACAO_AUDITORIAS_PLANOS.md`.

## Verificação

- Regras de cálculo, penalidades, validação, grupos e limites de arredondamento.
- Catálogo conferido contra a fonte documental, sem alterações nos textos.
- Regressões de publicação, snapshots e auditorias.
- Migração executada apenas em PostgreSQL isolado (PGlite), com fixtures descartadas.
- Fluxo visual em Chrome: modal, nota 8,00 após acidente com afastamento, PDF, restauração do grupo e largura de celular.
