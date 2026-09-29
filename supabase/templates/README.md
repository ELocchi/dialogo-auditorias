# Confirmação de cadastro

`confirmation.html` é o modelo de **Confirm signup** do Supabase Auth.
O assunto utilizado é `Confirme seu e-mail · Diálogo Auditorias`.

O link usa `SiteURL` e `TokenHash`: abre `/confirmar-email` sem consumir o
token. Somente o envio do botão **Confirmar meu e-mail** chama `verifyOtp`
no servidor. A confirmação torna a solicitação elegível para a fila de
aprovações; a autorização administrativa continua sendo uma etapa separada.

## Publicação

1. Publique a rota `/confirmar-email` e verifique sua disponibilidade.
2. Confira que `Site URL` no Supabase aponta para a origem publicada e que
   a opção **Confirm email** permanece habilitada.
3. Em **Authentication → Email Templates → Confirm signup**, aplique este
   HTML e o assunto acima. Pela Management API, altere apenas
   `mailer_templates_confirmation_content` e `mailer_subjects_confirmation`
   em `PATCH /v1/projects/{project_ref}/config/auth`.
4. Confira o modelo salvo e execute `npm run verify:auth-setup`.

O HTML no repositório não é aplicado automaticamente pelo deploy no Render.
A rota `/auth/callback` continua atendendo links enviados com o modelo antigo.
Cadastros já confirmados não têm sua confirmação desfeita.

Documentação: [Supabase — modelos e leitura automática de links de e-mail](https://supabase.com/docs/guides/auth/auth-email-templates#email-prefetching).
