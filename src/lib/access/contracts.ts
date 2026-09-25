export const accessProfiles = ["ADMINISTRATIVO", "AUDITOR_SEGURANCA", "AUDITOR_QUALIDADE", "ENGENHARIA"] as const;
export type AccessProfile = typeof accessProfiles[number];
export type EngineeringScope = "EQUIPE_OBRA" | "COORDENACAO";
export type AdministrativeScope = "SEGURANCA" | "QUALIDADE" | "GERAL";
export const administrativeLabels: Record<AdministrativeScope, string> = {
  SEGURANCA: "Administrativo de Segurança", QUALIDADE: "Administrativo de Qualidade", GERAL: "Administrativo Geral",
};
export type AccessModule = "SEGURANCA" | "QUALIDADE";

export const profileLabels: Record<AccessProfile, string> = {
  ADMINISTRATIVO: "Administrativo",
  AUDITOR_SEGURANCA: "Auditor de Segurança",
  AUDITOR_QUALIDADE: "Auditor de Qualidade",
  ENGENHARIA: "Engenharia",
};
export const engineeringLabels: Record<EngineeringScope, string> = {
  EQUIPE_OBRA: "Equipe da obra", COORDENACAO: "Coordenação",
};
export const moduleLabels: Record<AccessModule, string> = {
  SEGURANCA: "Segurança", QUALIDADE: "Qualidade",
};

export type TechnicalProfile = Exclude<AccessProfile, "ADMINISTRATIVO">;
export type AccessGrant = { perfil: TechnicalProfile; obra_id: string; modulo: AccessModule };
// Older immutable decisions retain their original shape; fallback is display-only.
export type HistoricalGrant = Omit<AccessGrant, "perfil"> & { perfil?: TechnicalProfile; obra_nome?: string };
export type AccessWork = { id: string; nome: string; ativo: boolean };
export type EditableAccessAccount = {
  auth_user_id: string;
  perfis: AccessProfile[];
  atuacao_engenharia: EngineeringScope | null;
  atuacoes_engenharia: EngineeringScope[];
  atuacao_administrativa: AdministrativeScope | null;
  ativo: boolean;
};
export type PendingRequest = {
  auth_user_id: string;
  nome: string;
  email: string;
  cargo_area_informado: string | null;
  obra_referencia_informada: string | null;
  email_confirmado_em: string;
  created_at: string;
};
export type AccessDecision = {
  id: string;
  auth_user_id: string;
  decision_type: "BOOTSTRAP" | "APROVACAO" | "AJUSTE_PERFIS_INICIAL" | "AJUSTE_ATUACAO_INICIAL" | "AJUSTE_ACESSOS_GERAIS" | "VINCULO_OBRA" | "DESVINCULO_OBRA" | "EDICAO_USUARIO";
  perfil: AccessProfile;
  perfis: AccessProfile[] | null;
  atuacao_engenharia: EngineeringScope | null;
  atuacoes_engenharia: EngineeringScope[] | null;
  atuacao_administrativa?: AdministrativeScope | null;
  request_snapshot: Partial<PendingRequest> & { status_acesso?: string; access_edit?: { ativo: boolean; perfis: AccessProfile[]; atuacoes_engenharia: EngineeringScope[]; atuacao_administrativa: AdministrativeScope | null } };
  grants_snapshot: HistoricalGrant[];
  before_access_snapshot: {
    account: { perfis: AccessProfile[]; perfil: AccessProfile; atuacao_engenharia: EngineeringScope | null; atuacoes_engenharia?: EngineeringScope[]; atuacao_administrativa?: AdministrativeScope | null; ativo?: boolean };
    grants: HistoricalGrant[];
  } | null;
  actor_snapshot: {
    auth_user_id?: string; nome?: string; email?: string;
    database_session_user?: string; database_role?: string; application_name?: string;
  };
  reason: string;
  actor_auth_user_id: string | null;
  actor_database_role: string | null;
  decided_at: string;
};

export type AccessActionState = {
  status: "idle" | "error" | "success";
  message: string;
  recordId?: string;
};
export const initialAccessState: AccessActionState = { status: "idle", message: "" };

export type ApprovalInput = {
  authUserId: string;
  perfis: AccessProfile[];
  atuacaoEngenharia: EngineeringScope | null;
  atuacaoAdministrativa: AdministrativeScope | null;
  grants: AccessGrant[];
  reason: string;
};

export type AccountEditInput = {
  authUserId: string;
  perfis: AccessProfile[];
  atuacoesEngenharia: EngineeringScope[];
  atuacaoAdministrativa: AdministrativeScope | null;
  grants: AccessGrant[];
  ativo: boolean;
  reason: string;
};
