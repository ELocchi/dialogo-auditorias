# Piloto — e-mails, preservação e backups

Atualização: 05/10/2026. Etapa 1 validada para publicação; Microsoft 365 e backups ficam para uma etapa posterior.

## Regras aprovadas

- Auditorias e relatórios orientativos: após publicação, abrir seleção de destinatários, permitir e-mails adicionais e anexar o PDF. Remetente: conta Microsoft 365 do auditor.
- Agenda mensal: Administrativo aciona o envio usando sua conta Microsoft 365. Cada auditor recebe a própria agenda; Engenharia / Equipe de obra recebe a agenda de sua obra.
- Confirmação do endereço: manter Supabase Auth por enquanto, conforme solicitado. Aviso de aprovação de acesso necessita integração própria de envio.
- Fotos de acompanhamento: elegíveis para remoção quando o apontamento for concluído ou três meses após sua publicação. A publicação do relatório orientativo não reinicia esse prazo.
- Fotos de auditoria: elegíveis depois da publicação de outra auditoria da mesma obra e disciplina. Não basta agendar, iniciar ou salvar um rascunho.
- Manter os registros e PDFs publicados, incluindo fotos incorporadas.
- Backup diário de banco e arquivos; cada cópia mantida por sete dias.

## Etapa 1 — preservação de PDFs e regras de retenção

- Arquivo privado `orientative-report-pdfs` para documentos com e sem agendamento.
- Na criação do relatório, tentar preservar imediatamente o PDF completo. Se essa etapa falhar, o registro salvo é mantido e a interface informa a pendência. A abertura do PDF tenta novamente.
- Downloads consultam primeiro a autorização atual do usuário; somente depois acessam o arquivo privado.
- Um PDF existente não é regenerado nem sobrescrito. Pedidos simultâneos convergem para o mesmo documento.
- Falhas de armazenamento não são interpretadas como ausência de arquivo.
- Relatórios antigos são preservados ao abrir. Ainda é necessário um processamento de todo o histórico antes de liberar a limpeza.
- Regras de elegibilidade de fotos e prazo de backups em `src/domain/photo-retention.ts`, sem exclusões automáticas.
- Migração `20261005000200_orientative_pdf_archive.sql` aplicada no Supabase em 05/10/2026. Usa a chave exclusiva de servidor já necessária para auditorias.

## Etapas seguintes

1. Microsoft 365: conexão individual, seleção de destinatários, PDF anexo, registro de tentativas e tratamento de falhas sem reenvio automático em resultado ambíguo.
2. Agenda: preparar PDFs mensais por auditor e por obra e envio pelo Administrativo, respeitando os acessos de cada destinatário.
3. Cadastro: aviso automático de aprovação. Confirmação continua pelo Supabase Auth.
4. Backup: rotina diária, destino independente, verificação de integridade, expiração de sete dias e teste de restauração.
5. Histórico: preservar e verificar todos os PDFs orientativos antigos.
6. Retenção: inventário/simulação, proteção de referências em rascunhos e planos de ação, registro de exclusões e ativação após validação.

Nenhuma rotina de backup, envio Microsoft 365 ou exclusão de fotos está ativa nesta etapa.

## Informações pendentes da TI

### Microsoft 365

- Confirmar possibilidade de registrar um aplicativo corporativo no Microsoft Entra.
- Autorizar conexão individual para envio pela própria caixa do auditor/Administrativo.
- Definir ambiente de teste e caixas participantes.
- Validar tratamento de PDFs grandes e limite de anexos da empresa antes de fechar as permissões.
- Posteriormente definir remetente institucional para avisos de aprovação.
- Credenciais devem ser configuradas no servidor; não enviar senhas ou segredos pela conversa.

A API `sendMail` usa `Mail.Send` delegado e retorna aceitação do pedido, não confirmação de entrega:
https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0

### Backup

- Informar serviço/conta de destino separado do Supabase principal e região permitida.
- Confirmar espaço disponível e acesso técnico para criar cópias e remover cópias expiradas.
- Definir responsável pelo acesso de recuperação e armazenamento separado da chave de criptografia.
- Validar horário diário e teste de restauração em ambiente isolado.

Backups nativos do banco Supabase não incluem os arquivos binários do Storage:
https://supabase.com/docs/guides/platform/backups

## Limite do envio provisório do Supabase

O remetente padrão do Supabase destina-se a testes, restringe destinatários e tem limites baixos. Manter esse mecanismo não equivale a habilitar envio geral aos colaboradores. SMTP próprio ou Send Email Hook será necessário para operação normal se essas restrições se aplicarem ao projeto.
https://supabase.com/docs/guides/auth/auth-smtp

## Verificação da etapa 1

Build e ESLint aprovados. 37 testes aprovados. Teste real de Storage com PDF fictício confirmou preservação byte a byte e bloqueio de acesso anônimo/público; o objeto de teste foi removido. [Evidências da versão](evidence/pdf-retention-release-20261005/verification.json).

As regras de retenção são funções de elegibilidade sem worker ou agendamento de exclusão. A limpeza permanece desativada enquanto o histórico não estiver preservado e os backups verificados não estiverem disponíveis.

- Testes do arquivo privado: persistência, disputa entre requisições, falhas e validação de identidade/PDF.
- Testes das rotas: fotos incorporadas, falhas sem PDF parcial, autorização antes do arquivo e download após indisponibilidade das fotos originais.
- Testes de retenção: fim de mês/ano, três meses de calendário, conclusão, obra/disciplina, publicação futura e sete dias de backup.
