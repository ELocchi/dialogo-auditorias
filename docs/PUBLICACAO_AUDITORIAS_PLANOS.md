# Publicação persistente de auditorias e planos de ação

Implementação local de 01/10/2026. **Migração aplicada no Supabase em 02/10/2026; ainda requer chave do servidor e deploy do código no Render.** A migração preserva os documentos já publicados, contas, concessões e agendamentos existentes.

## Ativação

1. **Concluído em 02/10/2026:** aplicada `supabase/migrations/20261001000100_audit_action_plan_publication.sql` no projeto autorizado. A migração é transacional; não execute os arquivos de `supabase/tests` no projeto hospedado.
2. Configurar `SUPABASE_SECRET_KEY` no servidor Render e, para testar localmente, no `.env.local`. Usar uma chave `sb_secret_...` do mesmo projeto das variáveis públicas. Nunca prefixar com `NEXT_PUBLIC_`, incluir no Git, enviar no chat ou colocar em código do navegador. O valor não é necessário para compilar.
3. Conferir `APP_URL`: a origem usada nos POST deve ser a origem configurada. Desenvolvimento LAN aceita a origem da própria requisição em `NODE_ENV=development`.
4. Publicar o código e validar com uma visita de teste autorizada: iniciar, preencher, aguardar “Rascunho salvo”, recarregar, revisar, publicar e baixar o PDF definitivo. Repetir com o plano no perfil Engenharia · Equipe de obra; conferir a consulta pela Coordenação.

A configuração pública continua separada em `src/lib/supabase/config.ts`. O cliente privilegiado existe somente em `src/lib/publications/admin.ts`, protegido por `server-only`, sem cookies ou sessão compartilhada. Todas as rotas verificam a sessão e o perfil selecionado antes de criá-lo. A RPC repete a autorização do ator em cada operação. A chave secreta é necessária porque o navegador não pode fornecer uma nota, um roteiro ou um PDF arbitrário à operação final de gravação. Referência: [chaves do Supabase](https://supabase.com/docs/guides/api/api-keys).

Sem a chave ou migração, as novas operações retornam erro e não mostram publicação concluída. O código não usa dados de demonstração como alternativa à falha de persistência.

## Auditoria

- O início usa a visita confirmada e atribuída ao auditor, na data de São Paulo. Visita, responsável, obra e disciplina são conferidos no banco.
- Um rascunho já iniciado pode ser retomado posteriormente, desde que o agendamento e a autorização permaneçam válidos. Alterar a data, a obra ou o responsável impede a continuação do rascunho antigo.
- `audit_drafts` tem uma linha por visita, respostas, revisão, mapa de fotos e cópias do roteiro e dos serviços/pesos FVS. Os pesos enviados pelo cliente são substituídos pelos valores da cópia do servidor.
- O preenchimento salva automaticamente após uma pausa de 1 segundo. Há botão de salvamento e aviso ao fechar a página com mudanças pendentes. Falhas permanecem visíveis; uma revisão antiga não sobrescreve dados mais recentes.
- Fotos JPG/PNG/WebP de até 8 MB são decodificadas, orientadas e convertidas em JPEG até 1600 px. Arquivos são privados, nomeados pelo SHA-256, com até 200 referências por auditoria. Um envio aceita até 32 MB; o conjunto de evidências para publicação também deve caber em 32 MB. PDF: até 40 MB.
- A revisão pode gerar uma prévia no navegador. Ao publicar, o servidor relê o rascunho, valida todas as respostas e evidências, calcula a nota pelas regras existentes e gera outro PDF a partir desse conteúdo validado. Notas finais são arredondadas a duas casas; ausência de base para cálculo impede a publicação.
- Fotos e PDF são gravados antes da transação final. A RPC verifica a revisão, a autorização, o agendamento e a presença dos objetos. Então insere `published_audits`, conclui a visita exata e registra o evento de publicação na mesma transação.
- ID da auditoria é o ID do rascunho. Repetir a publicação retorna o documento já concluído, sem nova auditoria ou evento. A revisão passa a abrir o PDF definitivo.
- O autor pode abrir seu PDF definitivo pela rota de publicação com a autorização específica do documento. A consulta geral continua usando os perfis e concessões existentes.

## Plano de ação

- Origina-se de uma auditoria persistida. O servidor extrai os apontamentos, a gravidade e as fotos do documento imutável.
- Somente Engenharia · Equipe de obra, com acesso atual à obra e à disciplina, pode preencher e publicar. Coordenação consulta o plano publicado.
- O rascunho é compartilhado pela equipe da obra e identificado pela auditoria; `action_plan_drafts` mantém revisão e último editor. Duas abas com versões diferentes não sobrescrevem alterações silenciosamente.
- O editor recupera o rascunho, salva automaticamente e oferece salvamento manual. Ações, responsáveis e datas são editáveis; a origem dos apontamentos é sempre reconstruída no servidor.
- Publicar exige todos os apontamentos, ação corretiva, responsável e datas válidas, com término igual ou posterior ao início. Não foram criados prazos automáticos nem aprovações adicionais.
- O servidor gera o PDF e grava `published_action_plans`, com autor, data, revisão e conteúdo definitivo. Existe um plano publicado por auditoria, imutável. As caixas exibem o download após nova consulta, inclusive em outra sessão autorizada.

## Segurança e consistência

- Novas tabelas têm RLS e nenhuma permissão direta para `anon`, `authenticated` ou `service_role`. Somente a RPC específica é concedida a `service_role`; o navegador não pode chamá-la.
- Identidade e perfil vêm da sessão autenticada, não do corpo recebido. Rotas rejeitam origem diferente, IDs inválidos e corpos acima do limite. Respostas usam `private, no-store`.
- Storage de rascunhos e planos não tem políticas de leitura/escrita para o navegador. Downloads passam pelo servidor e pela autorização atual.
- A política de `published-audits` aceita somente arquivos mencionados na publicação definitiva. Arquivos de tentativas anteriores sob o mesmo diretório ficam ocultos.
- Storage e PostgreSQL não compartilham uma transação. Se upload ocorrer e a gravação final falhar, podem sobrar objetos privados. Não se apagam arquivos automaticamente após uma resposta incerta: o commit pode ter ocorrido. Uma rotina de limpeza desses órfãos, com conferência das referências e período de segurança, permanece pendente.
- Troca/revogação de perfil, obra desativada ou visita alterada são verificadas novamente nas operações. Publicações antigas não são recalculadas.

## Verificação

```sh
npm run test:publication
PGLITE_MODULE_PATH=/caminho/local/pglite/dist/index.js npm run test:publication-database
npm run build
```

Os testes usam fotos e PDFs reais gerados localmente, adaptadores de API/Storage e PostgreSQL isolado (PGlite). Cobrem rascunhos, evidências, pesos adulterados, origem do plano, datas, revisão concorrente, duplicação, rollback sem arquivo, autorização e imutabilidade. Não substituem a validação integrada com Supabase HTTP/Storage nem um teste com múltiplas conexões simultâneas. Nenhuma publicação de teste foi inserida no banco hospedado durante esta implementação.

## Deploy do banco — 02/10/2026

- Projeto vinculado `beeluxzqxroaleplhqnc`, conferido contra a configuração local da aplicação. CLI oficial 2.118.0 com sessão autenticada.
- A simulação identificou somente as migrações `20261001000100` e `20261002000100`. Ambas passaram nas respectivas suítes SQL isoladas antes de `supabase db push --linked --skip-vault --yes`.
- As duas migrações foram aplicadas e registradas no histórico. Uma nova simulação confirmou o banco atualizado, sem migrações pendentes.
- Verificação remota: quatro tabelas com RLS, acesso direto bloqueado, `publication_command` exclusiva de `service_role`, funções de relatórios exclusivas de usuários autenticados, quatro gatilhos de imutabilidade, políticas de fotos e buckets `audit-drafts`/`action-plans` privados.
- A API reconhece `publication_command` e rejeita a chamada anônima com `401/42501`. Auditorias, visitas, apontamentos e arquivos existentes mantiveram suas contagens; as novas tabelas ficaram vazias.
- O deploy não configurou `SUPABASE_SECRET_KEY` no Render nem publicou o código da aplicação. A validação completa de publicação permanece pendente dessas etapas e de uma sessão autorizada.
