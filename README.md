# Diálogo Auditorias

Aplicação independente para gestão de auditorias de Segurança do Trabalho e Qualidade da Diálogo Engenharia. Usa Next.js e Supabase e permanece separada de `nexobra-main`.

## Estado atual

O cadastro, a confirmação do e-mail corporativo, o login com senha própria da plataforma e a aprovação administrativa usam Supabase Auth e banco real. Novas solicitações ficam em `PENDENTE_APROVACAO`; confirmar o e-mail ou fazer login não concede acesso aos módulos.

Uma conta pode combinar Administrativo, Auditor de Segurança, Auditor de Qualidade e Engenharia. O Administrativo terá uma das três atuações: **Segurança**, **Qualidade** ou **Geral**. As duas primeiras ficam restritas à própria disciplina; Geral acessa ambos os módulos e administra usuários, obras e manutenção. Engenharia pode ter Equipe da obra e Coordenação conforme a autorização registrada. Ao entrar com mais de uma opção, o usuário escolhe o contexto em **Como deseja entrar?** e pode usar **Trocar perfil** durante a navegação. Essa escolha não altera permissões: identidade, perfil e concessões atuais são conferidos no servidor e no banco.

O **Administrativo Geral** dispõe de **Usuários e acessos** para analisar solicitações confirmadas, definir perfis e autorizar pares de obra/módulo. O histórico preserva a decisão, o responsável e os acessos concedidos. A ativação controlada da primeira conta já foi realizada; não repetir bootstrap nem ajustes iniciais.

O cadastro de obras é persistente. Em **Administração → Cadastro de obras** e **Obras → Editar obra**, o Administrativo salva nome, endereço, responsável técnico, registro profissional, coordenação, equipe e observações. As alterações mantêm histórico e controle de revisão para evitar sobrescrita de uma edição concorrente. Perfis ativos selecionados para a equipe recebem os módulos já autorizados para seus perfis nessa obra; ao remover o vínculo, somente as concessões criadas por ele são revogadas. Nomes informados manualmente continuam descritivos e não concedem acesso.

As migrations B.1–B.14 e as evoluções registradas em `supabase/migrations` foram aplicadas ao Supabase DEV usado no projeto. Em 23/09/2026, as migrations `20260923000100_published_audits.sql` e `20260923000200_fvs_weight_revisions.sql` adicionaram auditorias publicadas imutáveis, evidências privadas, revisões dos roteiros de Qualidade e o histórico da planilha Peso FVS. O histórico das etapas está em [RETOMADA.md](docs/RETOMADA.md).

## Telas operacionais e limites

As telas por perfil estão disponíveis em `/app`, usando a identidade e as obras/módulos realmente autorizados. A auditoria publicada de Qualidade Completa da obra BoulevarDiálogo, de 23/09/2026, está persistida com nota 6,74, respostas, roteiro, PDF final e 37 evidências privadas. Novos preenchimentos ainda permanecem na memória até que o fluxo geral de gravação seja concluído. O plano de ação também permanece apenas na sessão e não é gravado no Supabase. A agenda inclui agendamento persistente pelo Administrativo, notificação no sino e confirmação da data pelo auditor. E-mails foram adiados pelo responsável. Detalhes e validações em [Agenda de auditorias](docs/AGENDA_AUDITORIAS.md).

O cadastro de obras e as autorizações são reais, mesmo durante a prévia das telas. Não preencher obras existentes com dados inventados para testar o formulário.

Por decisão de 14/09/2026, os 205 subitens de Segurança recebem peso inicial **1**, em configuração separada da fonte documental. Permanecem os 27 pesos de grupo, as orientações e a escala 0, 5, 10 e N/A. Qualidade preserva os pesos e critérios já fornecidos: F.175 tem 10 quesitos e F.176 tem 23, cada roteiro somando 10,00.

O cálculo automático de Qualidade está ativo, incluindo o rateio ponderado dos serviços FVS. As regras complementares de Segurança continuam registradas em [Pendências de metodologia](docs/PENDENCIAS_METODOLOGIA.md). O ranking administrativo usa as auditorias publicadas persistidas e permite selecionar mês ou ano; no ano, a posição usa a média das notas mensais, separada por Segurança e Qualidade. Os PDFs de auditoria e plano de ação usam o padrão visual atual, com sumários interativos e links internos.

## Executar localmente

Use **Node.js 24** e npm. Instale as dependências com:

```powershell
npm ci --include=dev
```

Se `.env.local` ainda não existir, copie `.env.example` e preencha os valores do projeto Supabase autorizado:

```powershell
if (!(Test-Path .env.local)) { Copy-Item .env.example .env.local }
```

Variáveis necessárias:

| Nome | Valor local |
| --- | --- |
| `APP_URL` | `http://127.0.0.1:3001` |
| `NEXT_PUBLIC_SUPABASE_URL` | URL pública do projeto Supabase existente |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Chave pública `sb_publishable_...` do mesmo projeto |

Nunca colocar `service_role`, senha do banco ou token de gestão nessas variáveis. `.env.local` não deve ser versionado. As variáveis `NEXT_PUBLIC_*` precisam estar definidas antes do build.

Inicie o desenvolvimento e abra [Entrar](http://127.0.0.1:3001/entrar):

```powershell
npm run dev -- --hostname 127.0.0.1 --port 3001
```

Se a prévia já estiver respondendo nesse endereço, use o processo existente. Para executar um build local de produção, com a porta disponível:

```powershell
npm run build
npm run start -- --hostname 127.0.0.1 --port 3001
```

## GitHub e Render

A aplicação está publicada para testes em [dialogo-auditorias-testes.onrender.com](https://dialogo-auditorias-testes.onrender.com). O código está no repositório privado [stefanirlocchi/dialogo-auditorias](https://github.com/stefanirlocchi/dialogo-auditorias), branch `main`, conectado a um Web Service Node Free no Render. Novos commits enviados a essa branch iniciam uma nova publicação. O estado detalhado está em [RETOMADA.md](docs/RETOMADA.md).

O procedimento em [PUBLICACAO_GITHUB_RENDER.md](docs/PUBLICACAO_GITHUB_RENDER.md) descreve o repositório privado, o Web Service Node no Render, as variáveis e as URLs de confirmação a autorizar no Supabase. No Render, `APP_URL` deve ser a origem HTTPS exata do serviço. Não executar novamente as migrations já aplicadas nem o bootstrap para publicar a aplicação.

O ambiente online usa o mesmo banco autorizado: dados persistentes alterados por ele também aparecerão localmente. Os rascunhos de novas auditorias e do plano de ação continuam temporários. `nexobra-main`, outros serviços e os arquivos de referência sincronizados permanecem fora do escopo desta publicação.

## Verificação e documentação

Comandos disponíveis: `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run test:auth`, `npm run test:supabase`, `npm run test:access-administration`, `npm run test:profile-workspace`, `npm run test:work-details`, `npm run test:navigation`, `npm run test:ranking`, `npm run test:access`, `npm run test:audit-context` e `npm run verify:security`.

As suítes SQL isoladas usam `npm run test:access-database` e precisam do PGlite disponível no ambiente de teste, conforme o executor e a documentação técnica. Não executar fixtures de teste no Supabase DEV compartilhado.

- [Retomada e evidências](docs/RETOMADA.md)
- [Ativação administrativa controlada](docs/BOOTSTRAP_ADMINISTRATIVO.md)
- [Seleção de perfil](docs/SELECAO_PERFIL.md)
- [Cadastro de obras](docs/CADASTRO_OBRAS.md)
- [Matriz de acessos](docs/MATRIZ_ACESSOS.md)
- [Pendências de escopo](docs/PENDENCIAS_ESCOPO_REVISADO.md)
