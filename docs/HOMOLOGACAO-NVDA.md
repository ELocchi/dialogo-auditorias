# Homologação pública para NVDA

## Configuração

- Serviço dedicado: `dialogo-auditorias-nvda`, plano gratuito no Render.
- Branch: `homologacao/nvda-20261005`.
- Definição: [render.nvda.yaml](../render.nvda.yaml).
- Build: `npm ci --include=dev && npm run build`, com `ACCESSIBILITY_REVIEW_ONLY=1`.
- Inicialização obrigatória: `node scripts/start-accessibility-review.mjs`.
- Dados: exemplos fictícios dos componentes reais; respostas em memória da guia.
- Credenciais: nenhuma configuração do Supabase/banco neste serviço. O inicializador rejeita ambientes que contenham essas configurações.

O servidor permite somente GET/HEAD das três telas de revisão, da tela de entrada e dos arquivos estáticos necessários. Bloqueia POST, PUT, DELETE e demais métodos antes do Next.js, incluindo Server Actions. Rotas de API, administração e autenticação não são encaminhadas. A política de conteúdo permite conexões somente ao próprio endereço. Não copiar grupos de variáveis do serviço principal.

As mudanças anteriores de retenção e preservação de PDFs não integram esta branch. O serviço atual da plataforma continua apontando para `main`.

## Verificação

```sh
A11Y_BASE_URL=http://127.0.0.1:3004 node scripts/test-accessibility-review-http.mjs
```

Esse teste verifica disponibilidade das telas e bloqueio de rotas/mutações. Repetir no endereço publicado. Executar também `scripts/test-actions-browser.mjs` com `A11Y_BASE_URL` e `A11Y_OUTPUT` para registrar teclado, árvore de acessibilidade e telas. Os resultados de navegador não substituem o teste no NVDA. O roteiro e as evidências ficam no workspace local, fora desta branch pública.

## Limites do teste

Esta homologação cobre a interação com a interface: nomes, dicas, foco, estados, diálogos e navegação por teclado. Cadastros, envio, publicação, download de documentos reais e confirmação por e-mail não são executados. Ao terminar a validação, o serviço pode ser removido sem perda de dados operacionais.

Verificação local: build/TypeScript e lint aprovados; 33 regressões, 16 interações de navegador, 14 cenários axe sem violações e 17 casos HTTP aprovados. A leitura pelo NVDA continua pendente. Status de publicação e evidências serão registrados após a verificação do endereço externo.
