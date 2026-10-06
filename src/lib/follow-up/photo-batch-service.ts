import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileWorkspaceContext } from "../access/workspace-context.ts";
import { uuidPattern } from "../access/validation.ts";
import { parsePhotoBatch, photoBatchSize } from "./photo-batch.ts";

export async function readFollowUpPhotoBatch(client: Pick<SupabaseClient,"rpc">, context: ProfileWorkspaceContext, input: string[]) {
  const fail = (status: 400 | 403 | 404 | 503) => ({ status, snapshot: { available: false as const, photos: [], message: "Não foi possível consultar as fotos. Tente novamente." } });
  if (!["AUDITOR_SEGURANCA","AUDITOR_QUALIDADE"].includes(context.profile)) return fail(403);
  if (!Array.isArray(input) || input.length > photoBatchSize || input.some(id => typeof id !== "string" || !uuidPattern.test(id))) return fail(400);
  const visitIds = [...new Set(input.map(id => id.toLowerCase()))];
  if (!visitIds.length) return { status: 200 as const, snapshot: { available: true as const, visitIds, photos: [] } };
  try {
    const {data,error} = await client.rpc("read_follow_up_photo_batch", { p_visit_ids: visitIds, p_profile: context.profile,
      p_engineering_scope: context.engineeringScope, p_administrative_scope: context.administrativeScope });
    if (error) return fail(error.code === "42501" ? 403 : 503);
    if (data?.available === false) return fail(404);
    const snapshot = parsePhotoBatch(data, visitIds);
    return snapshot ? { status: 200 as const, snapshot } : fail(503);
  } catch { return fail(503); }
}
