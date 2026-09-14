# Diagnóstico do escopo revisado — Bloco A

Data: 12/09/2026. Fonte canônica: [PROMPT_DIALOGO_AUDITORIAS_ESCOPO_REVISADO.md](../PROMPT_DIALOGO_AUDITORIAS_ESCOPO_REVISADO.md), lido integralmente em intervalos até **FIM DO ESCOPO REVISADO**, incluindo as 25 páginas transcritas. Esta execução abrange somente a Parte I, Bloco A.

## Estado encontrado antes das alterações

Next.js 16.3.4, React 19.2.8 e TypeScript, com rota `/` e navegação por estado. Layout corporativo branco/azul/vermelho, filtros de obras/ocorrências, catálogos e preenchimento por itens já funcionavam. Obras e auditorias eram constantes compartilhadas; havia duas obras demonstrativas e duas auditorias sem nota final. O ranking consultava essas constantes, sem dados da imagem histórica.

Não havia autenticação, sessão autenticada, banco, API de gravação, armazenamento persistente no navegador, envio de arquivos ou agenda. O relatório era uma prévia imprimível, sem documento publicado. O código/dependências e a estrutura de `src` foram examinados; nenhuma implementação real de autenticação ou persistência foi substituída.

Os rascunhos usavam apenas modelo/item como chave, sem identidade de auditoria/obra/responsável. Todos os menus e a troca de modelo estavam livres. A matriz antiga era apenas texto e ainda apresentava seis perfis, permissões administrativas amplas e uma rotina de aprovação/encerramento superada.

## D01 e classificação das regras

**Confirmado por orientação explícita da Parte I:** Administrativo agenda e reagenda visitas de Qualidade e Segurança. Auditores consultam a agenda e realizam somente suas auditorias autorizadas. Equipe da obra consulta seus vínculos; coordenação consulta a agenda somente com autorização explícita (C†). Autor do agendamento e auditor responsável são campos diferentes. Agendar não autoriza preenchimento ou publicação pelo Administrativo.

Fonte: matriz da seção 04/página 6 e T05 da seção 07/página 9. As seções 02/03/páginas 4–5 ainda dizem que o auditor agenda; essa divergência do original foi registrada e não apagada. Aplicou-se o critério de precedência D01 fornecido pelo responsável, sem reescrever o arquivo fonte.

**Pendente:** agenda, ata e composição do comitê (T17/P08) não recebem responsável por extensão de D01. A consulta administrativa a documentos permanece C†. Os quatro perfis são Auditor de Qualidade, Auditor de Segurança, Engenharia e Administrativo; Equipe da obra/Coordenação são atuações internas de Engenharia.

**Documental:** quesitos, pesos documentados e orientações continuam nos catálogos locais. **Propostas:** granularidade dos vínculos, nomes de estados e ausência de painel técnico de pesos para Engenharia orientam apenas a demonstração; não resolvem P09/P11. Todos os P01–P12 permanecem registrados em [PENDENCIAS_ESCOPO_REVISADO.md](PENDENCIAS_ESCOPO_REVISADO.md).

## Plano aplicado e alcance entregue

1. Centralizar a política demonstrativa por perfil, atuação, obra, módulo, responsabilidade e situação. Aplicá-la aos menus, listas, contexto e funções que alteram dados.
2. Acrescentar simulação local explicitamente identificada, separação Qualidade/Segurança e ambiente administrativo; manter o layout e os vínculos de teste fixos.
3. Implementar visita de teste e reagendamento em coleção independente. Manter autoria administrativa, auditor designado e histórico de datas; impedir cancelamento e substituição de modelo/auditor sem P10.
4. Criar e retomar rascunhos independentes por auditoria, versão e item. Preservar todo o catálogo, navegação, resposta zero e observações. Troca de contexto apenas muda a seleção visível, sem apagar os registros da sessão.
5. Organizar entradas T01–T23, com funções futuras indisponíveis e motivo. Retirar da interface o fluxo geral de reinspeção/baixa de correções, preservando os registros antigos de exemplo.
6. Executar testes, documentar limites e parar no Bloco A.

## Implementação e preservação

- `prototype-access.ts`: quatro perfis, duas atuações de Engenharia, cenários de vínculo e política testável; visitas e reagendamento puros, sem banco.
- `prototype-audits.ts`: identificação de cada auditoria, responsável, obra e versão; criação vazia e respostas independentes. A data da inspeção não é alterada ao reagendar a visita. Retomar uma visita já iniciada não duplica o rascunho.
- `prototype-app.tsx`: composição do shell existente, contexto, menus filtrados e estado em memória. `page.tsx` agora delega a esse componente; não foi criado outro projeto.
- `prototype-workspace.tsx` e `visit-agenda.tsx`: painéis, histórico/início, agenda administrativa e entradas futuras. Prévia de relatório permanece identificada e imprimível, sem fingir emissão ou salvamento das respostas.
- `audit-workspace.tsx`: preservados orientação, busca, grupos, primeiro/último item, anterior/próximo e carregamento dos quesitos. Modelo/obra/responsável ficam vinculados ao registro iniciado; a troca de modelo exige novo registro, preservando o anterior (P10).
- Catálogos, JSON de Segurança, pesos e lockfile não foram alterados. `audit-draft.ts` e as versões das dependências foram preservados. `tsconfig.json` apenas permite imports TypeScript explícitos nos módulos de domínio testados diretamente com Node, mantendo `noEmit`.
- Ranking preservado, com nota numérica elegível apenas quando há estado explícito `Publicada`, coleta concluída e cálculo disponível. Nenhuma auditoria do seed foi convertida em publicada; todas continuam com nota nula.

## Verificações e limites

Lint, TypeScript, build, verificador de Segurança, navegação e testes de acesso/contexto/ranking passaram. O navegador de teste confirmou D01, isolamento de rascunhos, C†, preservação da inspeção ao reagendar, catálogos, impressão por emulação de mídia e larguras de celular. Resultados detalhados e arquivos alterados: [RETOMADA.md](RETOMADA.md).

Correções intermediárias: validação de data na edição da inspeção; nome acessível do seletor de auditor na agenda; card de agenda desabilitado quando C† não foi concedido. Um seletor inicial do teste de navegador foi ajustado para usar o nome acessível do `combobox`. As execuções finais passaram.

Não há controle de acesso em servidor/banco/arquivos, armazenamento entre sessões, publicação definitiva, documento imutável, plano oficial, parecer ou automação de comitê. As referências `Publicada` usadas nos testes são fixtures isoladas, sem publicação no aplicativo. A02/A06/A09/A10/A14/A15/A16 operacionais permanecem pendentes; os demais aceites têm o alcance parcial discriminado no [MAPA_TELAS.md](MAPA_TELAS.md).

## Próximo marco

Conferência do usuário sobre perfis, módulos, vínculos e D01. O Bloco B é o próximo sugerido, sujeito a autorização e definição de autenticação/persistência; não foi iniciado. Blocos C–F também não foram executados. Nenhum serviço externo, publicação, reinício de servidor ou alteração no `nexobra-main` foi realizado.
