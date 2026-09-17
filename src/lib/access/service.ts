import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccessActionState } from "./contracts.ts";
import { uuidPattern, validateApproval, validateWork } from "./validation.ts";

// Server Actions inject their verified caller and cookie-scoped client.
// No service key, actor override, table write or browser Supabase client here.
type Dependencies = { actorId: string; createClient: () => Promise<Pick<SupabaseClient, "rpc">> };
const failed = (message: string): AccessActionState => ({ status: "error", message });

export async function approveRequest(form: FormData, deps: Dependencies): Promise<AccessActionState> {
  const validated = validateApproval(form);
  if (!validated.ok) return failed(validated.message);
  if (validated.data.authUserId === deps.actorId.toLowerCase()) return failed("Você não pode aprovar sua própria solicitação.");
  try {
    const client = await deps.createClient();
    const { authUserId, perfis, atuacaoEngenharia, atuacaoAdministrativa, grants, reason } = validated.data;
    const { data, error } = await client.rpc("approve_access_request_v3", {
      p_auth_user_id: authUserId,
      p_perfis: perfis,
      p_atuacao_engenharia: atuacaoEngenharia,
      p_atuacao_administrativa: atuacaoAdministrativa,
      p_grants: grants,
      p_reason: reason,
    });
    if (error || typeof data !== "string" || !uuidPattern.test(data)) {
      return failed("A aprovação não foi confirmada. Atualize a página, confira se a solicitação continua pendente e se as obras estão ativas. Se persistir, confira sua liberação administrativa.");
    }
    return { status: "success", message: "Solicitação aprovada. Os perfis, os acessos e o responsável foram registrados no histórico.", recordId: data };
  } catch {
    return failed("Não foi possível confirmar a aprovação. Atualize a página e consulte o histórico antes de tentar novamente.");
  }
}

export async function registerWork(form: FormData, deps: Dependencies): Promise<AccessActionState> {
  const validated = validateWork(form);
  if (!validated.ok) return failed(validated.message);
  try {
    const client = await deps.createClient();
    const { data, error } = await client.rpc("create_access_work", { p_nome: validated.data.nome });
    if (error || typeof data !== "string" || !uuidPattern.test(data)) return failed("O cadastro da obra não foi confirmado. Confira se esse nome já existe e atualize a página antes de tentar novamente.");
    return { status: "success", message: "Obra cadastrada. Ela já pode ser selecionada nas novas aprovações.", recordId: data };
  } catch {
    return failed("Não foi possível confirmar o cadastro da obra. Atualize a página e confira a lista antes de tentar novamente.");
  }
}
