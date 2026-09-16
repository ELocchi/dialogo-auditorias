import 'server-only';
import { createClient } from '../supabase/server';
import { uuidPattern } from '../access/validation';
import { workDetailsColumns, type WorkDetails, type WorkChange, type ActiveTeamProfile } from './contracts';
// Route and Server Action separately require the active Administrative context.
// These reads always use the caller's session and the table's RLS policies.
export async function readWorkDetails(id: string): Promise<WorkDetails | null> {
  if (!uuidPattern.test(id)) return null;
  try {
    const {data,error} = await (await createClient()).from('access_works').select(workDetailsColumns).eq('id',id).maybeSingle();
    if (error || !data || data.id !== id.toLowerCase()) return null;
    return data as unknown as WorkDetails;
  } catch { return null; }
}
export async function readWorkHistory(id: string): Promise<{rows:WorkChange[];error:boolean}> {
  if (!uuidPattern.test(id)) return {rows:[],error:true};
  try {
    const {data,error} = await (await createClient()).from('access_work_changes')
      .select('id,obra_id,before_snapshot,after_snapshot,actor_auth_user_id,actor_snapshot,changed_at')
      .eq('obra_id',id).order('changed_at',{ascending:false}).order('id',{ascending:false}).limit(20);
    return error || !data ? {rows:[],error:true} : {rows:data as WorkChange[],error:false};
  } catch { return {rows:[],error:true}; }
}

export async function readActiveTeamProfiles(): Promise<ActiveTeamProfile[] | null> {
  try {
    const client = await createClient();
    const [accounts, requests, grants] = await Promise.all([
      client.from('access_accounts').select('auth_user_id,perfis').eq('ativo', true).limit(1000),
      client.from('access_requests').select('auth_user_id,nome,email,status_acesso').eq('status_acesso', 'APROVADO').limit(1000),
      client.from('access_grants').select('auth_user_id,perfil,modulo').limit(10000),
    ]);
    if (accounts.error || requests.error || grants.error || !accounts.data || !requests.data || !grants.data) return null;
    const people = new Map(requests.data.map((row) => [row.auth_user_id, row]));
    return accounts.data.flatMap((account) => {
      const person = people.get(account.auth_user_id);
      if (!person) return [];
      const modules = [...new Set(grants.data.filter((grant) => grant.auth_user_id === account.auth_user_id).map((grant) => `${grant.perfil}: ${grant.modulo}`))];
      return [{ id: account.auth_user_id, nome: person.nome, email: person.email, perfis: account.perfis, modulos: modules }];
    }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  } catch { return null; }
}

export async function readWorkTeamLinks(id: string): Promise<string[] | null> {
  if (!uuidPattern.test(id)) return null;
  try {
    const { data, error } = await (await createClient()).from('work_team_links').select('auth_user_id').eq('obra_id', id).limit(30);
    if (error || !data) return null;
    return data.map((row) => row.auth_user_id);
  } catch { return null; }
}
