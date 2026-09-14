# GitHub e Render — ambiente de testes

O responsável autorizou vincular GitHub e Render para testes online, substituindo a restrição anterior de não publicar. O projeto é exclusivamente Diálogo Auditorias; nexobra-main e serviços de outros projetos não fazem parte desta operação.

## Configuração preparada

- Repositório privado: `dialogo-auditorias`, branch `main`.
- Render: Web Service Node, plano Free, configuração em `render.yaml`.
- Node.js 24, instalação com `npm ci --include=dev`, build `npm run build`, execução `npm run start -- --hostname 0.0.0.0`.
- A porta é `PORT`, fornecida pelo Render. Checagem de disponibilidade em `/entrar`.
- Novos commits enviados à branch conectada iniciam novo deploy quando a conexão estiver ativa.

Não colocar `.env.local`, tokens, senhas, metadata de `supabase/.temp`, dependências ou builds no GitHub. Os originais de referência permanecem locais. O catálogo JSON usado pelo aplicativo permanece versionado.

## Variáveis no Render

| Nome | Conteúdo |
| --- | --- |
| `APP_URL` | Origem HTTPS exata atribuída ao serviço, sem caminho ou query |
| `NEXT_PUBLIC_SUPABASE_URL` | URL pública do projeto Supabase existente |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Chave pública `sb_publishable_...` do mesmo projeto |

Definir as variáveis antes do build. Nunca usar `service_role`, senha de banco ou token de gestão como variável pública. O arquivo `render.yaml` não contém os valores reais.

## Confirmação de e-mail

No Supabase Auth, após conhecer o endereço público real:

1. Configurar Site URL com a mesma origem de `APP_URL`.
2. Adicionar a URL exata `https://DOMINIO_REAL/auth/callback` às Redirect URLs.
3. Preservar `http://127.0.0.1:3001/auth/callback` para testes locais. Não usar curingas amplos.
4. Manter confirmação de e-mail, aprovação administrativa e status pendente. Não executar novo bootstrap.

A conta existente pode entrar com e-mail e senha em outro dispositivo. Para um cadastro novo com PKCE, abrir a confirmação no navegador/dispositivo que iniciou o cadastro; depois a conta pode entrar nos demais dispositivos. Não é necessário cadastrar novamente uma conta existente.

## Uso e limites dos testes

O endereço online usa o mesmo Supabase já configurado: alterações no cadastro de obras são reais e aparecerão também na aplicação local. Não preencher obras reais com valores inventados. Auditorias e agenda ainda mantêm os limites de prévia descritos no README; rascunhos temporários não são sincronizados entre dispositivos.

O plano Free pode suspender o serviço após inatividade, tornando o primeiro acesso mais lento. Não foi autorizada mudança para plano pago. Para mudanças no visual: editar no VS Code, testar localmente, criar commit e enviar ao GitHub; aguardar o Render concluir o deploy.

## Fontes de configuração

- [Next.js no Render](https://render.com/docs/deploy-nextjs-app)
- [Blueprints do Render](https://render.com/docs/blueprint-spec)
- [Node.js no Render](https://render.com/docs/node-version)
- [Limites do plano Free](https://render.com/docs/free)
- [URLs de redirecionamento do Supabase](https://supabase.com/docs/guides/auth/redirect-urls)
- [Fluxo PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow)
