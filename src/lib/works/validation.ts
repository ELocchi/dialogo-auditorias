import { uuidPattern } from '../access/validation.ts';
import { workFieldLimits, brazilianStates, type WorkFields, type WorkTeamMember } from './contracts.ts';
type Validated = { ok: true; data: { workId: string; expectedRevision: number; fields: WorkFields } } | { ok: false; message: string; fieldErrors: Record<string,string> };
type CreateValidated = { ok: true; data: WorkFields } | { ok: false; message: string; fieldErrors: Record<string,string> };
const one = (form: FormData, key: string) => {
  const values = form.getAll(key);
  return values.length === 1 && typeof values[0] === 'string' ? values[0].trim() : null;
};
function parseWorkFields(form: FormData) {
  const errors: Record<string,string> = {};
  const fields = {} as WorkFields;
  for (const [key, maximum] of Object.entries(workFieldLimits) as [keyof typeof workFieldLimits, number][]) {
    const value = one(form,key);
    if (value === null || value.length > maximum || value.includes('\u0000')) errors[key] = `Informe até ${maximum} caracteres neste campo.`;
    fields[key] = value ?? '';
  }
  if (fields.nome.length < 2) errors.nome = 'Informe o nome da obra com pelo menos 2 caracteres.';
  fields.uf = fields.uf.toUpperCase();
  if (fields.uf && !brazilianStates.includes(fields.uf as typeof brazilianStates[number])) errors.uf = 'Selecione uma UF válida.';
  if (fields.cep && !/^\d{5}-?\d{3}$/.test(fields.cep)) errors.cep = 'Informe um CEP com 8 números.';
  fields.cep = fields.cep.replace('-','');
  const rawTeam = one(form,'equipe_obra'); let team: unknown;
  if (rawTeam === null || rawTeam.length > 20000) errors.equipe_obra = 'Revise a lista da equipe da obra.';
  else { try { team = JSON.parse(rawTeam); } catch { errors.equipe_obra = 'Revise a lista da equipe da obra.'; } }
  const members: WorkTeamMember[] = [];
  if (!Array.isArray(team) || team.length > 30) errors.equipe_obra = 'Informe até 30 integrantes na equipe da obra.';
  else for (const member of team) {
    if (!member || typeof member !== 'object' || Array.isArray(member) || Object.keys(member).length !== 2
      || typeof member.nome !== 'string' || typeof member.funcao !== 'string' || member.nome.trim().length < 2
      || member.nome.trim().length > 160 || member.funcao.trim().length > 100 || `${member.nome}${member.funcao}`.includes('\u0000')) {
      errors.equipe_obra = 'Cada integrante precisa de nome (2 a 160 caracteres) e função de até 100 caracteres.'; break;
    }
    members.push({nome:member.nome.trim(),funcao:member.funcao.trim()});
  }
  fields.equipe_obra = members;
  return { fields, errors };
}

export function validateWorkCreate(form: FormData): CreateValidated {
  const { fields, errors } = parseWorkFields(form);
  if (Object.keys(errors).length) return { ok:false, message:'Revise os campos indicados antes de cadastrar.', fieldErrors:errors };
  return { ok:true, data:fields };
}

export function validateWorkEdit(form: FormData): Validated {
  const { fields, errors } = parseWorkFields(form);
  const workId = one(form,'work_id'); const rawRevision = one(form,'expected_revision');
  if (!workId || !uuidPattern.test(workId)) errors.work_id = 'A obra não é válida. Reabra seu cadastro.';
  if (!rawRevision || !/^\d{1,10}$/.test(rawRevision) || Number(rawRevision) > 2147483646) errors.expected_revision = 'Reabra o cadastro para conferir a versão atual.';
  if (Object.keys(errors).length) return { ok:false, message:'Revise os campos indicados antes de salvar.', fieldErrors:errors };
  return { ok:true, data:{workId:workId!.toLowerCase(),expectedRevision:Number(rawRevision),fields} };
}

export function parseTeamAccountIds(form: FormData): { ok: true; ids: string[] | null } | { ok: false; message: string } {
  const values = form.getAll('team_accounts');
  if (values.length === 0) return { ok: true, ids: null };
  if (values.length !== 1 || typeof values[0] !== 'string' || values[0].length > 2000) return { ok: false, message: 'Revise os perfis selecionados para a equipe.' };
  try {
    const ids: unknown = JSON.parse(values[0]);
    if (!Array.isArray(ids) || ids.length > 30 || ids.some((id) => typeof id !== 'string' || !uuidPattern.test(id)) || new Set(ids).size !== ids.length) {
      return { ok: false, message: 'Revise os perfis selecionados para a equipe.' };
    }
    return { ok: true, ids: ids.map((id: string) => id.toLowerCase()) };
  } catch { return { ok: false, message: 'Revise os perfis selecionados para a equipe.' }; }
}
