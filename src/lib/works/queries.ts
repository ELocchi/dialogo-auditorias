import 'server-only';
import { createClient } from '../supabase/server';
import { uuidPattern } from '../access/validation';
import { workDetailsColumns, type WorkDetails, type WorkChange } from './contracts';
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
