# Relatórios orientativos sem agendamento

## Funcionamento

- O botão **+** de Relatórios orientativos abre `/app/acompanhamento/relatorio/novo`.
- O formulário já abre com uma obra selecionada. O botão **+** preserva o filtro de obra dos apontamentos; quando não há filtro, prioriza uma obra com apontamentos pendentes. O parâmetro de obra é conferido contra as permissões atuais.
- Se outro perfil estiver ativo, a página oferece somente os perfis de auditor já autorizados para a conta e retorna ao formulário após a escolha. Falhas na consulta das obras apresentam uma nova tentativa de carregamento, sem retornar 404.
- Auditores de Qualidade e Segurança escolhem uma obra autorizada e a data do relatório (até o dia atual em São Paulo), preenchem título e assuntos/orientações. Participantes e decisões são opcionais.
- Apontamentos também são opcionais. É possível selecionar até 30 apontamentos pendentes, da mesma obra, disciplina e autor. Mudar de obra limpa a seleção.
- A consulta dos apontamentos utiliza a tabela existente `follow_up_work_findings`, com filtros de obra, autor e disciplina, paginação e sessão autenticada. Essa consulta não depende da nova migração de relatórios.
- O servidor usa a sessão autenticada e confirma o perfil ativo. O banco verifica novamente as concessões e resolve os apontamentos por ID; textos, gravidade e fotos são obtidos de registros reais.
- O documento guarda cópias do nome da obra, autor e textos. É imutável. Não depende de `audit_visits` nem cria agendamentos artificiais.
- Reenviar o mesmo formulário após perda de conexão utiliza o mesmo identificador e retorna o documento salvo, sem duplicá-lo. Alterar o conteúdo inicia uma nova operação.
- Ao salvar, abre a visualização e o download de PDF. Se o PDF falhar, o documento continua salvo e a geração pode ser repetida.
- Auditores e Engenharia consultam os documentos conforme suas permissões por obra e disciplina. O PDF exige a sessão e baixa somente as fotos referenciadas. Uma foto ausente impede a geração de um PDF incompleto.
- Documentos anteriores associados a visitas continuam acessíveis.

## Ativação

1. **Concluído em 02/10/2026:** aplicada [`20261002000100_standalone_follow_up_reports.sql`](../supabase/migrations/20261002000100_standalone_follow_up_reports.sql) no Supabase autorizado, após a migração de publicação de auditorias e planos. Não repetir migrações já aplicadas.
2. Publicar o código ou atualizar o servidor de desenvolvimento LAN.
3. Entrar como auditor com obra concedida, abrir **Acompanhamento → Relatórios orientativos → +**, preencher e salvar. Confirmar a presença na lista e o download do PDF.

Esse recurso usa RPCs autenticadas; **não exige `SUPABASE_SECRET_KEY`**. A chave privilegiada descrita no guia de auditorias e planos pertence ao fluxo de publicação desses documentos.

Situação em 02/10/2026: código testado localmente e disponível no servidor LAN; migração aplicada no projeto Supabase vinculado `beeluxzqxroaleplhqnc` pelo CLI oficial, usando sua sessão autenticada. O histórico ficou sem migrações pendentes. Foram verificados RLS, privilégios, gatilhos de imutabilidade e políticas de preservação das fotos. A API reconhece a função de consulta e rejeita chamadas sem login com `401/42501`. As contagens de auditorias, visitas, apontamentos e arquivos existentes permaneceram iguais após o deploy. Nenhum relatório de teste foi criado no banco compartilhado. O deploy do código no Render e a validação de criação/PDF com uma sessão de auditor ainda estão pendentes.

## Verificação

```sh
npm run test:standalone-reports
PGLITE_MODULE_PATH=/caminho/para/@electric-sql/pglite/dist/index.js npm run test:standalone-reports-database
npm run build
```

A suíte SQL usa banco descartável e dados sintéticos. Verifica criação sem visitas, ausência de apontamentos, repetição sem duplicação, fotos, documento imutável, acesso de Engenharia e revogação de obra. As suítes JavaScript cobrem validação, serviços e geração real de PDF. A suíte SQL foi executada novamente com sucesso antes do deploy; os testes locais e as verificações remotas de estrutura/permissões não substituem a validação do fluxo completo com uma sessão de auditor.
