# Auditoria dos fluxos assíncronos

Data: 05/10/2026. Base: `b8956eb`. Alterações locais; sem deploy nesta etapa.

## Escopo e método

Foram examinados 245 arquivos TypeScript/TSX da aplicação. O inventário identifica 129 arquivos com chamadas assíncronas, ações ou `await`, incluindo a camada de servidor. A revisão foi organizada por fluxo e componente compartilhado, cobrindo páginas, consultas, filtros, formulários, uploads, downloads, geração de PDF e mutações.

As 17 páginas de uso normal têm uma fronteira de carregamento própria. Isso evita depender apenas de uma fronteira pai já exibida, que pode manter a página anterior durante uma navegação lenta.

[Inventário completo](evidence/async-flows-20261005/inventario.json) · [Arquivos alterados](evidence/async-flows-20261005/ARQUIVOS.md) · [Hashes dos arquivos](evidence/async-flows-20261005/arquivos-alterados.json).

## Problemas e tratamento

| Fluxo | Problema encontrado | Tratamento e verificação |
|---|---|---|
| Navegação entre páginas | Ausência de feedback em páginas aguardando o servidor; fallback pai insuficiente em algumas transições. | `loading.tsx` por página, skeleton com espaço reservado e estado anunciado. Navegação com atraso real de 2 segundos testada no navegador. |
| Erro ao abrir página | Falta de uma interface comum de recuperação. | Fronteira de erro com mensagem e botão de nova tentativa; refaz a consulta ao servidor. Falha e recuperação testadas no navegador. |
| Histórico, detalhes, roteiros e resumo administrativo | Textos isolados onde o formato da lista era previsível; consultas sem prazo limite. | Skeletons nas listas/painéis, prazo de consulta, erro e retry. Carregadores continuam descartando respostas canceladas e rejeitando dados inválidos. |
| Busca e troca de contexto | O hook de acompanhamento podia exibir dados anteriores durante a troca de endpoint/contexto. | Resultado vinculado ao contexto da consulta. Teste com respostas fora de ordem e troca de obra; resultado antigo ignorado. Vazio aparece somente após resposta válida. |
| Plano de ação: abertura | Nova tentativa mantinha o erro anterior enquanto a consulta estava pendente. | Resultado vinculado à auditoria, perfil e tentativa; skeleton imediato durante a nova consulta. Testados atraso, HTTP 503 e recuperação. |
| Plano de ação: autosave | Editar enquanto uma gravação estava em andamento podia deixar o estado de salvamento preso. | Contagem das gravações em andamento, liberação ao terminar e preservação da edição mais recente. Testado com duas alterações durante uma gravação lenta. |
| Auditoria: recuperação e autosave | Consulta inicial sem retry; dependência do estado do salvamento podia repetir um envio que falhou. | Feedback da recuperação; falha bloqueia repetição automática daquele conteúdo; retry explícito. A fila continua serializada e confere revisão/conteúdo antes de enviar. |
| Auditoria: envio de fotos | O usuário não distinguia envio de arquivo e gravação. | Estado “Enviando fotos e salvando…”. Teste compara o tamanho do multipart antes e depois da falha e confirma que o arquivo foi mantido. |
| Auditoria: revisar | A ação não aguardava o callback assíncrono; permitia interação durante a gravação. | Callback aguardado, trava contra repetição, campos desabilitados sem apagar respostas, erro e tentativa posterior. Testado no componente `NewAudit`. |
| Auditoria: publicar | Erro inesperado do callback podia escapar do componente. | Tratamento local da falha, botão ocupado durante a publicação e sucesso somente após confirmação. Fluxo de publicação testado com resposta atrasada. |
| Geração e leitura de PDF | Geração/leitura podiam aguardar indefinidamente; prévia de auditoria não tinha retry direto. | Limites de espera, cancelamento preservado e retry da prévia. Testes de worker, PDF verdadeiro, cancelamento e recuperação do recurso PDF. |
| Fotos publicadas | Falha produzia um retângulo vazio; original sem thumbnail não tinha tratamento equivalente. | Espaço reservado, carregamento, erro visível e recarga individual. O prazo só começa quando a foto se aproxima da área visível; a espera fora da tela foi testada com avanço controlado de 21 segundos. Botão de retry fora do link da foto. Testados teclado, imagem decodificada, mobile e reduced motion. |
| Fotos ao reabrir rascunho | Falhas de leitura eram ignoradas; parecia não haver foto. | Estado de carregamento e retry das fotos do item, preservando suas referências. |
| Acompanhamento: mutações | Conclusão e upload desabilitavam controles sem explicar a operação. | Mensagem específica durante envio/conclusão; itens só são removidos após sucesso. O arquivo de um upload que falhou fica selecionado para retry. |
| Relatório orientativo avulso | Consulta sem limite; cancelamento desaparecia durante envio. | Skeleton, prazo de leitura, erro/vazio/retry, `aria-busy` e cancelamento visível/desabilitado. Formulário mantém os campos; identificador de envio já existente foi preservado. |
| Apontamentos na Engenharia | Leitura sem estado inicial nem recuperação. | Resultado por perfil/disciplina/tentativa; skeleton, erro e retry, sem exibir resultado de outro contexto. |
| Login, cadastro, confirmação, saída, obras e acessos | Rejeições de transporte podiam escapar da ação; formulários podiam ser resetados após falha. | Adaptador de erro preserva a tela e respeita redirects do Next. Envio manual mantém campos. Formulários com submit no cliente aguardam hidratação; login/cadastro usam POST. Falha HTTP 502 testada no formulário real de cadastro. |
| Gravações demoradas por Server Action | A operação continuava pendente sem explicar a demora. | Após 12 segundos, informa que ainda aguarda confirmação. Não desbloqueia nem repete uma gravação sem saber se o servidor a concluiu. |
| Escolha de perfil | Clique no cartão sem estado de envio. | Botão acompanha o estado do formulário, fica desabilitado e informa a abertura. |
| Agenda e notificações | Recuperação dependia de atualização automática ou mudança de tela. | Retry manual e estado de atualização. Mantém agenda anterior em falha temporária; limpa dados em perda de autorização. Testes preservam idempotência e revisões nas mutações. |
| Downloads de roteiros e relatórios | Clique em link de download sem feedback da resposta. | Controle compartilhado com estado ocupado, validação de PDF, erro, nova tentativa e confirmação de início do download. Downloads de Blobs já carregados continuam imediatos. |

## Regras preservadas

- Publicação, permissões, conclusão de apontamentos e uploads só mostram sucesso após resposta do servidor. Não foi adicionada atualização otimista a essas operações.
- Gravações de auditorias e planos mantêm controle de revisão; agenda e relatórios mantêm seus mecanismos existentes de idempotência.
- Consultas têm prazo de 20 segundos. Publicações, transferências de PDFs e geração de prévias têm prazo de 90 segundos. O limite alcança também a leitura do corpo da resposta.
- Expiração de uma gravação significa **confirmação desconhecida**, não garantia de cancelamento. Os dados ficam na tela e não há repetição automática cega.
- Cancelar leitura ao sair da tela não é mostrado como erro. Respostas antigas não podem substituir uma consulta mais recente.
- Skeletons e placeholders respeitam `prefers-reduced-motion`; mensagens usam estados de acessibilidade. Cores, bordas, ícones e controles existentes foram mantidos.
- Alterações locais anteriores relacionadas ao arquivamento de PDFs foram preservadas. Nenhuma migração ou credencial foi alterada nesta auditoria.

## Evidência e reprodução

**Resultado:** 13 cenários de navegador aprovados; 92 testes de regressão aprovados; build, ESLint e TypeScript sem erros. O cenário de erro de página exigiu `router.refresh()` além de `reset()` e foi revalidado isoladamente após a correção. Os logs de ambas as execuções estão preservados.

[Resultados do navegador](evidence/async-flows-20261005/resultado.json) · [Regressão](evidence/async-flows-20261005/regressao.log) · [Build](evidence/async-flows-20261005/build.log).

Exemplos visuais:

- [Plano carregando](evidence/async-flows-20261005/01-plano-carregando.png) e [falha mantendo os campos](evidence/async-flows-20261005/02-plano-falha.png).
- [Auditoria enviando foto](evidence/async-flows-20261005/03-auditoria-upload.png).
- [Foto indisponível com retry no mobile](evidence/async-flows-20261005/04-foto-falha-mobile.png).
- [Formulário após falha de API](evidence/async-flows-20261005/06-formulario-falha.png).
- [Upload com arquivo preservado](evidence/async-flows-20261005/07-upload-falha.png).
- [Skeleton durante navegação](evidence/async-flows-20261005/09-pagina-skeleton.png).
- [Erro de página com nova tentativa](evidence/async-flows-20261005/12-pagina-erro.png).
- [Consulta que excedeu o prazo](evidence/async-flows-20261005/10-consulta-timeout.png).
- [Revisão da auditoria aguardando gravação](evidence/async-flows-20261005/11-revisao-salvando.png).

Cada captura possui um arquivo `.aria.txt` com a árvore de acessibilidade naquele estado.

Para reproduzir, use uma cópia da aplicação sem credenciais, rode `next dev --webpack --port 3010` e execute:

```sh
ASYNC_TEST_URL=http://127.0.0.1:3010 PLAYWRIGHT_MODULE=/caminho/playwright/index.mjs node scripts/test-async-browser.mjs
node --experimental-strip-types --test scripts/test-async-deadlines.mjs
node scripts/audit-async-inventory.mjs
```

O runner usa Chrome/Playwright, intercepta APIs com atraso de 1,5–2,6 segundos, devolve HTTP 503/502 e segura uma consulta por mais de 20 segundos. Server Actions reais são bloqueadas no transporte. O cenário de upload usa a linha real de acompanhamento com um adaptador de teste; os cenários de gravação usam hooks/componentes reais com respostas simuladas. Não são testes de escrita no Supabase de produção.

As rotas de revisão só estão disponíveis em desenvolvimento ou no ambiente de revisão explicitamente habilitado. O build normal não libera essas telas.

Limites: os testes cobrem os componentes compartilhados e os cenários descritos, não todas as combinações de obra/perfil/registro. A árvore de acessibilidade foi capturada; não houve sessão manual de NVDA. Nenhum deploy foi feito nesta etapa.

## Preparação para publicação

A versão isolada para deploy exclui duas alterações anteriores de arquivamento de PDFs. Build e 92 testes foram executados novamente com esse conteúdo exato. [Hashes e resultado da versão preparada](evidence/async-flows-20261005/release-verificacao.json). Nenhuma migração está incluída.
