import type { SupabaseClient } from '@supabase/supabase-js';
import { uuidPattern } from '../access/validation.ts';
import { validateWorkEdit } from './validation.ts';
import type { WorkEditState } from './contracts.ts';
type Dependencies = { createClient: () => Promise<Pick<SupabaseClient,'rpc'>> };
const failure = (message: string, extras: Partial<WorkEditState> = {}): WorkEditState => ({ status:'error', message, ...extras });
export async function updateWork(form: FormData, deps: Dependencies): Promise<WorkEditState> {
  const parsed = validateWorkEdit(form);
  if (!parsed.ok) return failure(parsed.message,{fieldErrors:parsed.fieldErrors});
  try {
    const { workId, expectedRevision, fields } = parsed.data;
    const client = await deps.createClient();
    const { data, error } = await client.rpc('update_access_work',{p_work_id:workId,p_expected_revision:expectedRevision,p_data:fields});
    if (error) {
      if (error.code === '40001') return failure('Esta obra foi alterada após você abrir a página. Seus campos foram mantidos; confira a versão atual antes de salvar novamente.',{conflict:true});
      if (error.code === '23505') return failure('Já existe uma obra com esse nome. Escolha um nome diferente.',{fieldErrors:{nome:'Este nome já está cadastrado.'}});
      if (error.code === '42501') return failure('Seu acesso administrativo não está disponível. Selecione o perfil Administrativo e confira sua liberação.');
      if (error.code === 'P0002') return failure('A obra não está disponível. Volte à lista e reabra o cadastro.');
      return failure('Não foi possível confirmar a gravação. Reabra o cadastro e consulte o histórico antes de tentar novamente.');
    }
    const validDate = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
    if (!data || typeof data !== 'object' || data.obra_id !== workId || typeof data.changed !== 'boolean'
      || !Number.isInteger(data.revisao) || data.revisao !== expectedRevision + (data.changed ? 1 : 0)
      || (data.changed ? !validDate(data.updated_at) || typeof data.history_id !== 'string' || !uuidPattern.test(data.history_id)
        : data.history_id !== null || !(data.updated_at === null || validDate(data.updated_at)))) {
      return failure('A resposta de gravação não pôde ser confirmada. Reabra o cadastro e consulte o histórico antes de tentar novamente.');
    }
    return {status:'success',message:data.changed ? 'Dados da obra salvos. A alteração foi registrada no histórico.' : 'Os dados já estão salvos. Nenhuma alteração adicional foi necessária.',revision:data.revisao,updatedAt:data.updated_at};
  } catch { return failure('Não foi possível confirmar a gravação. Reabra o cadastro e consulte o histórico antes de tentar novamente.'); }
}
