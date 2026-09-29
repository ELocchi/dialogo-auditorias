# Confirmação de cadastro

O projeto usa o e-mail padrão **Confirm signup** do Supabase Auth, com
`ConfirmationURL`. No plano gratuito com envio padrão, o Supabase bloqueou
a personalização desse modelo. Nenhum upgrade ou SMTP adicional é necessário
para a confirmação explícita implementada na aplicação.

1. O link valida o e-mail no Auth e retorna a `/auth/callback`.
2. O callback estabelece a sessão e abre `/confirmar-email`.
3. Somente o POST do botão **Confirmar meu e-mail** chama
   `confirm_own_access_request_email()`, vinculado a `auth.uid()`.
4. A RPC verifica a confirmação real do Auth e registra o espelho na
   solicitação. Somente então o cadastro aparece para aprovação.

Abrir o link ou consultar a página não encaminha a solicitação ao
Administrativo. Quem entrar com um e-mail validado, mas ainda não tiver
concluído o botão, também passa pela tela de confirmação. A autorização
administrativa permanece uma etapa separada.

## Publicação

1. Aplique a migração de confirmação explícita de cadastro.
2. Publique a aplicação com callback, página e POST de confirmação.
3. Mantenha **Confirm email** habilitado no Supabase e `Site URL`/redirects
   apontando para a aplicação publicada.
4. Execute `npm run verify:auth-setup`.

O modelo de e-mail do Supabase não precisa ser alterado. Confirmações e acessos
existentes são preservados; não há aprovação automática após confirmar.

Documentação: [Supabase — modelos e leitura automática de links de e-mail](https://supabase.com/docs/guides/auth/auth-email-templates#email-prefetching).
