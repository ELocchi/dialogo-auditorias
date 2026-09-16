import type { SupabaseClient } from '@supabase/supabase-js';
import { uuidPattern } from '../access/validation.ts';
import { parseTeamAccountIds, validateWorkCreate, validateWorkEdit } from './validation.ts';
import type { WorkEditState } from './contracts.ts';
type Dependencies = { createClient: () => Promise<Pick<SupabaseClient,'rpc'>> };
const failure = (message: string, extras: Partial<WorkEditState> = {}): WorkEditState => ({ status:'error', message, ...extras });
export async function createWorkWithDetails(form: FormData, deps: Dependencies): Promise<WorkEditState> {
  const parsed = validateWorkCreate(form);
  if (!parsed.ok) return failure(parsed.message, { fieldErrors: parsed.fieldErrors });
  const team = parseTeamAccountIds(form);
  if (!team.ok) return failure(team.message);
  try {
    const client = await deps.createClient();
    const fields = parsed.data;
    let result = team.ids === null
      ? await client.rpc('create_access_work_full', { p_data: fields })
      : await client.rpc('create_access_work_with_team', { p_data: fields, p_user_ids: team.ids });
    if (result.error && ['42883', 'PGRST202'].includes(result.error.code ?? '') && team.ids !== null) {
      if (team.ids.length > 0) return failure('O vínculo de perfis ainda depende da atualização do banco. Nenhuma obra foi criada; seus campos foram mantidos.');
      result = await client.rpc('create_access_work_full', { p_data: fields });
    }
    // Older databases can still create a name-only record, without discarding
    // any optional information supplied by the user.
    if (result.error && ['42883', 'PGRST202'].includes(result.error.code ?? '')) {
      const onlyName = Object.entries(fields).every(([key, value]) => key === 'nome' || (Array.isArray(value) ? value.length === 0 : value === ''));
      if (!onlyName) return failure('O cadastro completo ainda depende da atualização do banco. Nenhuma obra foi criada; seus campos foram mantidos.');
      result = await client.rpc('create_access_work', { p_nome: fields.nome });
    }
    if (result.error) {
      if (result.error.code === '23505') return failure('Já existe uma obra com esse nome.', { fieldErrors: { nome: 'Este nome já está cadastrado.' } });
      if (result.error.code === '42501') return failure('Seu acesso administrativo não está disponível. Confira seu perfil e tente novamente.');
      return failure('O cadastro da obra não foi confirmado. Confira os dados e tente novamente.');
    }
    if (typeof result.data !== 'string' || !uuidPattern.test(result.data)) return failure('A resposta do cadastro não pôde ser confirmada. Confira a lista de obras antes de tentar novamente.');
    return { status: 'success', message: 'Obra cadastrada com as informações fornecidas. Ela já pode ser selecionada nas aprovações.', workId: result.data };
  } catch {
    return failure('Não foi possível confirmar o cadastro. Confira a lista de obras antes de tentar novamente.');
  }
}

export async function updateWork(form: FormData, deps: Dependencies): Promise<WorkEditState> {
  const parsed = validateWorkEdit(form);
  if (!parsed.ok) return failure(parsed.message,{fieldErrors:parsed.fieldErrors});
  const team = parseTeamAccountIds(form);
  if (!team.ok) return failure(team.message);
  try {
    const { workId, expectedRevision, fields } = parsed.data;
    const client = await deps.createClient();
    let usedTeamRpc = team.ids !== null;
    let result = team.ids === null
      ? await client.rpc('update_access_work',{p_work_id:workId,p_expected_revision:expectedRevision,p_data:fields})
      : await client.rpc('update_access_work_with_team',{p_work_id:workId,p_expected_revision:expectedRevision,p_data:fields,p_user_ids:team.ids});
    if (result.error && ['42883', 'PGRST202'].includes(result.error.code ?? '') && team.ids?.length === 0) {
      usedTeamRpc = false;
      result = await client.rpc('update_access_work',{p_work_id:workId,p_expected_revision:expectedRevision,p_data:fields});
    }
    const { data, error } = result;
    if (error) {
      if (['42883', 'PGRST202'].includes(error.code ?? '') && team.ids) return failure('O vínculo de perfis ainda depende da atualização do banco. Nenhuma alteração foi salva.');
      if (error.code === '40001') return failure('Esta obra foi alterada após você abrir a página. Seus campos foram mantidos; confira a versão atual antes de salvar novamente.',{conflict:true});
      if (error.code === '23505') return failure('Já existe uma obra com esse nome. Escolha um nome diferente.',{fieldErrors:{nome:'Este nome já está cadastrado.'}});
      if (error.code === '42501') return failure('Seu acesso administrativo não está disponível. Selecione o perfil Administrativo e confira sua liberação.');
      if (error.code === 'P0002') return failure('A obra não está disponível. Volte à lista e reabra o cadastro.');
      return failure('Não foi possível confirmar a gravação. Reabra o cadastro e consulte o histórico antes de tentar novamente.');
    }
    const validDate = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
    if (!data || typeof data !== 'object' || data.obra_id !== workId || typeof data.changed !== 'boolean'
      || (usedTeamRpc && typeof data.team_changed !== 'boolean')
      || !Number.isInteger(data.revisao) || data.revisao !== expectedRevision + (data.changed ? 1 : 0)
      || (data.changed ? !validDate(data.updated_at) || typeof data.history_id !== 'string' || !uuidPattern.test(data.history_id)
        : data.history_id !== null || !(data.updated_at === null || validDate(data.updated_at)))) {
      return failure('A resposta de gravação não pôde ser confirmada. Reabra o cadastro e consulte o histórico antes de tentar novamente.');
    }
    return {status:'success',message:data.changed && data.team_changed ? 'Dados da obra e vínculos de equipe salvos. As alterações foram registradas nos históricos.' : data.changed ? 'Dados da obra salvos. A alteração foi registrada no histórico.' : data.team_changed ? 'Vínculos de equipe atualizados e registrados no histórico de acessos.' : 'Os dados já estão salvos. Nenhuma alteração adicional foi necessária.',revision:data.revisao,updatedAt:data.updated_at};
  } catch { return failure('Não foi possível confirmar a gravação. Reabra o cadastro e consulte o histórico antes de tentar novamente.'); }
}
