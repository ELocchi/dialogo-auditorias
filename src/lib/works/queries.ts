import 'server-only';
import { createClient } from '../supabase/server';
import { uuidPattern } from '../access/validation';
import { platformDisplayName } from '../auth/display-name';
import { legacyWorkDetailsColumns, workDetailsColumns, type WorkDetails, type WorkChange, type ActiveTeamProfile, type WorkTeamLink } from './contracts';
// Route and Server Action separately require the active Administrative context.
// These reads always use the caller's session and the table's RLS policies.
export async function readWorkDetails(id: string): Promise<WorkDetails | null> {
  if (!uuidPattern.test(id)) return null;
  try {
    const client = await createClient();
    const current = await client.from('access_works').select(workDetailsColumns).eq('id',id).maybeSingle();
    if (!current.error && current.data?.id === id.toLowerCase()) return current.data as unknown as WorkDetails;
    if (!current.error || !['42703', 'PGRST204'].includes(current.error.code ?? '')) return null;
    const legacy = await client.from('access_works').select(legacyWorkDetailsColumns).eq('id',id).maybeSingle();
    if (legacy.error || !legacy.data || legacy.data.id !== id.toLowerCase()) return null;
    return { ...legacy.data, etapa_obra: '' } as unknown as WorkDetails;
  } catch { return null; }
}
export async function readWorkHistory(id: string, page = 1): Promise<{rows:WorkChange[];error:boolean;total:number}> {
  if (!uuidPattern.test(id) || !Number.isSafeInteger(page) || page < 1 || page > 999999) return {rows:[],error:true,total:0};
  try {
    const {data,error,count} = await (await createClient()).from('access_work_changes')
      .select('id,obra_id,before_snapshot,after_snapshot,actor_auth_user_id,actor_snapshot,changed_at', { count: 'exact' })
      .eq('obra_id',id).order('changed_at',{ascending:false}).order('id',{ascending:false}).range((page-1)*20,page*20-1);
    return error || !data || count === null ? {rows:[],error:true,total:0} : {rows:data as WorkChange[],error:false,total:count};
  } catch { return {rows:[],error:true,total:0}; }
}

export async function readActiveTeamProfiles(ids: string[] = []): Promise<ActiveTeamProfile[] | null> {
  if (ids.length === 0) return [];
  if (ids.length > 30 || ids.some(id => !uuidPattern.test(id))) return null;
  try {
    const client = await createClient();
    const { data, error } = await client.rpc('read_team_profile_page', { p_ids: ids });
    if (error || !data?.available || !Array.isArray(data.profiles) || data.profiles.length > 30) return null;
    return data.profiles.map((profile: ActiveTeamProfile) => ({ ...profile, nome: platformDisplayName(profile.email, profile.nome) }));
  } catch { return null; }
}

export async function readWorkTeamLinks(id: string): Promise<WorkTeamLink[] | null> {
  if (!uuidPattern.test(id)) return null;
  try {
    const client = await createClient();
    const current = await client.from('work_team_links').select('auth_user_id,cargo').eq('obra_id', id).limit(30);
    if (!current.error && current.data) return current.data.map((row) => ({ id: row.auth_user_id, cargo: row.cargo }));
    if (!current.error || !['42703', 'PGRST204'].includes(current.error.code ?? '')) return null;
    const legacy = await client.from('work_team_links').select('auth_user_id').eq('obra_id', id).limit(30);
    if (legacy.error || !legacy.data) return null;
    return legacy.data.map((row) => ({ id: row.auth_user_id, cargo: '' }));
  } catch { return null; }
}
