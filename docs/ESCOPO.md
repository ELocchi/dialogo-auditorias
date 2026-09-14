# Escopo

## Referência vigente

**Adendo posterior D03 — infraestrutura inicial e retenção, 13/09/2026:** [ADENDO_INFRAESTRUTURA_RETENCAO.md](ADENDO_INFRAESTRUTURA_RETENCAO.md). Confirmados GitHub para código, primeira instância paga do Render para a aplicação publicada do piloto, Supabase Free para autenticação/banco/arquivos, desenvolvimento separado do piloto e preparação para expansão sem contratar capacidade de longo prazo agora. São escolhas documentadas, sem contratação, configuração ou publicação comprovadas por esta decisão. P12 passa a **parcialmente resolvida**.

**Adendo posterior D02 — cadastro/autenticação, 12/09/2026, permanece vigente:** [ADENDO_CADASTRO_AUTENTICACAO.md](ADENDO_CADASTRO_AUTENTICACAO.md) detalha T01/T19, preservando o original. Confirmados e-mail corporativo do domínio exato `dialogo.com.br` + senha própria, solicitação de acesso, confirmação pelo serviço e aprovação administrativa antes de liberar operações. A mesma senha continua após aprovação; não depende da senha Microsoft. “Sem cadastro público livre” significa solicitação restrita, sem liberação automática ou escolha livre de perfil. P11 parcialmente resolvida; na redação de D02, P12 permanecia pendente, situação posteriormente atualizada por D03. São decisões de escopo, não implementação.

O detalhamento funcional de T01/T19 está em [MAPA_TELAS.md](MAPA_TELAS.md) e o planejamento atualizado em [PLANO_BLOCO_B.md](PLANO_BLOCO_B.md). **Aprovação de conta é distinta de aprovação de auditoria**; D02 não cria aprovação administrativa para publicar relatórios. Método/domínio/provedor já estão escolhidos; não perguntá-los novamente. Configuração dos ambientes, envio/remetente autorizado, responsáveis, destino/rotina de backup, detalhes de preservação e limites de capacidade/custos efetivos antes da configuração continuam pendentes. O domínio permitido dos usuários não autoriza envio de mensagens em seu nome.

**Diferença posterior de retenção:** o original exigia preservar as evidências após publicação sem remoção/substituição; D03 introduz exceção apenas para a **cópia fotográfica avulsa**, após data/hora de publicação concluída registrada pelo servidor + 30 dias corridos. O prazo não começa no upload, na visita ou no mês seguinte; fotos de rascunhos ou sem publicação concluída ficam fora da rotina. Atingir o prazo não basta: PDF definitivo salvo, íntegro e legível, foto incorporada no item correto, backup do PDF confirmado, ausência de bloqueio e de outros vínculos que exijam manter o arquivo são condições cumulativas. Se qualquer condição falhar, preservar e registrar pendência.

O PDF permanece no histórico com todas as imagens incorporadas; respostas, notas, observações, medições, versões e vínculos permanecem preservados. Planos, apresentações e outras categorias não entram automaticamente nessa limpeza. Execução/resultado futuros terão registro separado, sem mudar o conteúdo imutável; a consulta indicará que a imagem permanece no PDF e oferecerá acesso autorizado, sem links quebrados. A proposta de simulação sem exclusão antecede eventual execução real, sujeita a autorização própria. D03 não concede exclusão manual a perfis nem permite editar, reabrir, retificar, recalcular ou excluir relatórios publicados.

O [escopo revisado](../PROMPT_DIALOGO_AUDITORIAS_ESCOPO_REVISADO.md) substitui as decisões antigas incompatíveis. O Bloco A adequou o protótipo aos quatro perfis, duas atuações de Engenharia, módulos separados e agenda administrativa D01. Consultar [DIAGNOSTICO_ESCOPO_REVISADO.md](DIAGNOSTICO_ESCOPO_REVISADO.md), [MATRIZ_ACESSOS.md](MATRIZ_ACESSOS.md) e [PLANO.md](PLANO.md). Administração não é um tipo de auditoria. Agenda/ata do comitê permanece P08.

Não se incluem aprovação obrigatória de coordenação/Administrativo para publicar, alteração de relatório publicado, rotina geral de reinspeção/baixa das correções ou comitê ativo de Qualidade. A implementação continua demonstrativa e em memória; Blocos B–F não foram executados.

## Histórico da fundação do protótipo

Diálogo Auditorias é uma aplicação independente para Obra -> auditoria -> roteiro/versionamento -> grupos -> quesitos -> respostas, medições, evidências, resultado pendente, não conformidades e plano de ação.

A Etapa 1 entrega um protótipo navegável em memória com uma obra fictícia, três roteiros separados e uma auditoria demonstrativa. Não inclui acompanhamento físico-financeiro, BIM, vendas, Autodoc automatizado, análise por IA, autenticação ou persistência.

Coleta e cálculo são estados independentes. Concluir uma coleta não aprova auditoria, não encerra ocorrências e não gera nota sem configuração/metodologia validadas.
