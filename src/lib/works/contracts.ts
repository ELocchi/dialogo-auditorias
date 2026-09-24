export type WorkTeamMember = { nome: string; funcao: string };
export type WorkTeamLink = { id: string; cargo: string };
export type ActiveTeamProfile = { id: string; nome: string; email: string; perfis: string[]; modulos: string[] };
export type WorkFields = {
  nome: string; empreendimento: string; etapa_obra: string; logradouro: string; numero: string; complemento: string;
  bairro: string; cidade: string; uf: string; cep: string;
  responsavel_tecnico: string; registro_tecnico: string; coordenacao: string;
  equipe_obra: WorkTeamMember[]; observacoes: string;
};
export type WorkDetails = WorkFields & {
  id: string; ativo: boolean; revisao: number; updated_at: string | null; updated_by: string | null;
};
export type WorkChange = {
  id: string; obra_id: string; before_snapshot: Record<string, unknown>; after_snapshot: Record<string, unknown>;
  actor_auth_user_id: string; actor_snapshot: { nome?: string; email?: string }; changed_at: string;
};
export type WorkEditState = {
  status: 'idle' | 'error' | 'success'; message: string; revision?: number; updatedAt?: string | null;
  fieldErrors?: Record<string, string>; conflict?: boolean; workId?: string;
};
export const initialWorkEditState: WorkEditState = { status: 'idle', message: '' };
export const workFieldLimits = {
  nome:160, empreendimento:160, etapa_obra:10, logradouro:200, numero:30, complemento:120, bairro:100, cidade:100, uf:2, cep:9,
  responsavel_tecnico:160, registro_tecnico:80, coordenacao:160, observacoes:2000,
} as const;
export const brazilianStates = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'] as const;
export const workStages = [
  { value:'ESCAVACAO', label:'Escavação' }, { value:'FUNDACAO', label:'Fundação' },
  { value:'ESTRUTURA', label:'Estrutura' }, { value:'FACHADA', label:'Fachada' },
  { value:'ACABAMENTO', label:'Acabamento' }, { value:'ENTREGA', label:'Entrega' },
] as const;
export const legacyWorkDetailsColumns = 'id,nome,empreendimento,ativo,logradouro,numero,complemento,bairro,cidade,uf,cep,responsavel_tecnico,registro_tecnico,coordenacao,equipe_obra,observacoes,revisao,updated_at,updated_by';
export const workDetailsColumns = 'id,nome,empreendimento,etapa_obra,ativo,logradouro,numero,complemento,bairro,cidade,uf,cep,responsavel_tecnico,registro_tecnico,coordenacao,equipe_obra,observacoes,revisao,updated_at,updated_by';
