# Revisões dos roteiros — implementação local, 16/09/2026

O Administrativo tem um botão de lápis separado em cada cartão de Segurança, Qualidade Simplificada e Qualidade Completa. Clicar no cartão continua abrindo o documento de referência; o lápis abre o editor. A revisão tem identificação e motivo obrigatórios.

## Decisões confirmadas pelo responsável

- Editar itens ou enviar revisão em PDF, com original Word DOCX opcional.
- Cada gravação cria uma revisão completa, aplicada somente às auditorias abertas depois dela.
- Auditorias já iniciadas e publicadas preservam sua revisão.
- Continuar em LAN; publicar no Render/Supabase somente após confirmação do responsável.

## O que está implementado

Editor com busca/seleção dos 205, 10 ou 23 itens; texto, peso configurado, critério de verificação, observação e orientações existentes. Códigos, vínculos e pesos transcritos da fonte ficam preservados; peso configurado é independente do peso documental. Não há inclusão/exclusão de itens nem importação automática do conteúdo do PDF/Word.

PDF até 5 MiB e DOCX até 2 MiB. PDF obrigatório no modo Enviar nova revisão; opcional na edição de itens. Enviar Word requer enviar o PDF correspondente. Sem novo arquivo, os documentos anteriores são herdados. Com novo PDF sem Word, Baixar original entrega esse PDF. A prévia e o download identificam a revisão consultada; os documentos iniciais continuam privados e empacotados no servidor.

Migration B.8: supabase/migrations/20260916000100_catalog_revisions.sql. Catálogos completos append-only, arquivos privados em bytea e registro idempotente são gravados na mesma transação. O RPC exige conta aprovada/ativa e Administrador vigente; servidor também exige perfil Administrativo selecionado e identidade igual à aba do editor. Conflitos de versão não sobrescrevem a edição concorrente. Repetir o mesmo requestId/payload retorna a mesma revisão; mudar payload com requestId reutilizado falha. Arquivos não ficam disponíveis em bucket público.

Leitura dos itens segue o perfil e os módulos concedidos. Engenharia recebe projeção sem pesos. Documentos completos continuam exclusivos do Administrativo. Mudanças nas concessões continuam sendo verificadas no banco.

Ao iniciar uma nova prévia de auditoria, a aplicação consulta a revisão atual e copia os critérios e as orientações para um snapshot do rascunho. Retomar uma visita mantém o snapshot existente. A lista de auditorias e a prévia mostram a revisão capturada. As auditorias do aplicativo ainda são rascunhos temporários na sessão: esta entrega não implementa persistência/publicação oficial de auditorias.

## Ativação

B.8 ainda NÃO foi aplicada ao Supabase compartilhado. O editor está disponível para conferência na LAN, mas Salvar permanece indisponível enquanto faltar essa migration. Nenhuma revisão, arquivo, conta ou concessão foi enviada ao ambiente remoto nesta etapa. Não simular sucesso local nem afirmar salvamento real antes da ativação.

No próximo deploy autorizado, validar B.8 localmente, aplicar B.8 no projeto Supabase e publicar o código no Render; então conferir o editor com sessão administrativa real. Não criar revisões de teste no ambiente compartilhado sem necessidade. A rotina de deployment e os identificadores vigentes estão nos registros anteriores do projeto.

## Verificação

- npm run test:catalog-revisions: validações, autorização, anexos, conflitos, respostas indisponíveis e snapshots de auditoria.
- npm run test:reference-documents: sessão/perfil/conta, documentos iniciais, revisão específica, downloads e erros privados.
- npm run test:access-database: migrations B.1–B.8 e suítes em PostgreSQL/PGlite isolado, incluindo os três catálogos reais.
- npm run lint e npm run build.

Resultado em 16/09/2026: 71 testes da aplicação passaram; suítes B.1–B.8 e validação dos catálogos reais 205/10/23 passaram em PostgreSQL 18.3/PGlite isolado; ESLint e build Next.js/TypeScript passaram. LAN /entrar respondeu HTTP 200.

Sem teste visual autenticado por automação nesta etapa; nenhuma credencial do responsável foi usada.
