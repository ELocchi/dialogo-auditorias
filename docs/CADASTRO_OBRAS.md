# Cadastro e edição de obras

No perfil Administrativo, abra **Obras** e selecione **Editar obra** no cartão desejado. Apenas o nome da obra é obrigatório; ao adicionar um integrante da equipe, informe também seu nome. Os demais campos podem ser preenchidos gradualmente.

- Identificação: nome da obra; situação atual apenas para consulta.
- Endereço: logradouro, número, complemento, bairro, cidade, UF e CEP.
- Responsáveis: responsável técnico, registro profissional e coordenação.
- Equipe: nome e função de até 30 integrantes.
- Observações: informações adicionais da obra.

**Salvar alterações** grava no Supabase e atualiza o histórico da obra. O histórico mostra os campos alterados, valores anteriores/novos, quem fez a alteração e o horário de Brasília. Os cartões passam a mostrar endereço, cidade e responsáveis cadastrados. Cadastrar a equipe não cria contas nem libera acesso; isso continua em **Usuários e acessos**.

Se outro Administrativo salvar a obra enquanto a tela estiver aberta, o sistema avisa sobre o conflito e conserva o preenchimento. Consulte os dados atuais antes de reaplicar sua edição. O link para recarregar substitui os campos da tela pelos valores salvos; não há sobrescrita automática.

## Implementação e verificação

Migration B.5 `20260913000500_work_details.sql` aplicada no DEV em 13/09/2026. A RPC `update_access_work` aceita somente os campos editáveis e a revisão esperada. A Server Action exige o perfil Administrativo selecionado; a RPC revalida a conta e a identidade administrativa, independentemente do cliente. Escrita direta de API permanece revogada, RLS controla leitura, e o histórico tem proteção contra alteração, exclusão e truncamento. Uma gravação sem mudança não gera histórico artificial.

A migration manteve os valores anteriores das 21 obras, uma conta Auth, solicitações, decisões e 84 concessões. Campos novos inicialmente vazios, sem dados fictícios. Testes offline e SQL isolados cobrem o salvamento, conflitos, controle de acesso e atomicidade. O formulário foi conferido no navegador em ambiente sintético separado; o preenchimento autenticado das obras reais cabe ao responsável.

A persistência descrita aqui é do cadastro de obras. Rascunhos de auditoria e agenda operacional continuam conforme os limites registrados em SELECAO_PERFIL.md. Sem publicação no Render.
