# Seleção de perfil e prévia das telas — 13/09/2026

Uma conta aprovada com mais de um perfil entra em `/escolher-perfil` após o login. Cada opção corresponde a um perfil atualmente aprovado no banco; Engenharia exibe a atuação aprovada (Equipe da obra ou Coordenação). Uma conta com um único perfil abre `/app` diretamente. O link **Trocar perfil** permite mudar de ambiente sem sair da conta.

A preferência usa cookie HttpOnly de sessão, associado à identidade, SameSite=Lax e Secure em HTTPS. No ambiente local HTTP autorizado, o cookie continua compatível com 127.0.0.1. A preferência não concede permissões: cada entrada protegida verifica Auth, aprovação/atividade, perfis atuais e RLS. Uma preferência de outra identidade, inválida ou revogada não seleciona perfil. Login e logout bem-sucedidos apagam a escolha anterior. Administração exige perfil Administrativo selecionado e a verificação administrativa independente no banco.

`/app` recupera as telas anteriores usando nome, identidade, obras e concessões atuais. O carregador consulta concessões do próprio usuário e do perfil selecionado; o adaptador preserva cada par obra/módulo e não combina módulos de perfis ou obras diferentes. Administrativo visualiza o catálogo ativo para gestão, sem receber por isso a capacidade de preencher auditoria ou ler documentos técnicos. Coordenação mantém a regra anterior de agenda condicional: não se presume concessão especial de agenda.

As telas incluem visão geral, obras, roteiros, auditorias, agenda quando permitida e ambientes de consulta conforme o perfil. Administrativo tem acesso à gestão real de usuários/obras/histórico. Não são inseridos usuários, obras, visitas ou resultados fictícios no painel autenticado. Campos ainda sem cadastro aparecem como não informados.

**Limite desta entrega:** as telas operacionais são prévias. Rascunhos de teste ficam somente na memória da página e são descartados ao atualizar ou trocar perfil. Agenda persistente, atribuição real de auditores, publicação, relatórios, arquivos, fechamento e planos de ação dependem das próximas integrações. Os controles que dependem delas exibem essa condição; não apresentam sucesso de gravação no banco.

Nenhuma migration ou operação remota foi necessária. Os quatro perfis/84 concessões nas 21 obras já aprovados, o bootstrap, seus dois registros históricos e o fluxo PENDENTE_APROVACAO foram preservados. Nenhuma conta adicional, mensagem, redefinição de senha, publicação no Render ou alteração de nexobra-main.

Validação: 128 testes offline passaram, incluindo seleção/guards/actions/cookie, autorização efetiva, escopo exato, prévias temporárias, autenticação, administração e Supabase; ESLint completo e build Next.js com TypeScript passaram na cópia de trabalho. A validação visual usa um harness separado com dados sintéticos e sem acesso ao banco; não equivale a um login real. O teste de aprovação de uma segunda pessoa continua adiado pelo responsável para 14/09/2026.

## Atualização B.4 — duas atuações de Engenharia

A conta inicial teve Equipe da obra acrescentada por operação privada autorizada, mantendo Coordenação. Ambas usam as mesmas obras/módulos de Engenharia. O seletor mostra uma opção por atuação aprovada e a preferência inclui perfil/atuação; mesmo um perfil único exige seleção quando tem duas atuações. Seleção revalidada no servidor, cookie antigo de Engenharia limitado à primária anteriormente autorizada. A Equipe da obra usa a visualização da equipe, enquanto Coordenação mantém suas regras de consulta.

Migration `20260913000400_multiple_engineering_scopes.sql` versionada e aplicada no DEV, com registro adicional sem alterar as decisões antigas ou os 84 vínculos. Contas novas aprovadas pela V2 continuam recebendo somente a atuação escolhida pelo Administrativo. O suporte à composição não concede ambas automaticamente. As limitações de persistência operacional acima continuam válidas.

## Atualização B.5 — edição persistente do cadastro de obras

Administrativo agora pode abrir Obras → Editar obra para preencher endereço, responsáveis, equipe e observações, com gravação real e histórico. Os cartões exibem os dados salvos. O aviso de preenchimentos temporários refere-se às auditorias, não ao cadastro das obras. Os demais limites operacionais acima continuam válidos. Migration B.5 aplicada no DEV preservando todas as contas, decisões, solicitações e concessões existentes. Veja CADASTRO_OBRAS.md.
