import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWorkspaceContext } from '../src/lib/access/workspace-context.ts';
import { canAccessWorkModule, canStartAudit, canReadAudit, canConsultAgenda, canReadOperationalDocuments } from '../src/domain/prototype-access.ts';
import { beginPrototypeAudit, beginWorkspacePreviewAudit } from '../src/domain/prototype-audits.ts';
const id = '13044e3f-e8d2-4b4b-9981-22a8de22c610';
const a = '10000000-0000-4000-8000-000000000001';
const b = '10000000-0000-4000-8000-000000000002';
const c = '10000000-0000-4000-8000-000000000003';
const account = { auth_user_id:id, ativo:true, approved_at:'2026-09-13T06:00:00Z', perfil:'ADMINISTRATIVO', perfis:['ADMINISTRATIVO','AUDITOR_SEGURANCA','AUDITOR_QUALIDADE','ENGENHARIA'], atuacao_engenharia:'COORDENACAO', atuacoes_engenharia:['COORDENACAO'], atuacao_administrativa:'GERAL' };
const input = { account, profile:'AUDITOR_SEGURANCA', identity:{id,name:'Pessoa autorizada',email:'pessoa@dialogo.com.br'}, works:[{id:a,nome:'Obra A',ativo:true},{id:b,nome:'Obra B',ativo:true},{id:c,nome:'Obra C',ativo:false}], grants:[{perfil:'AUDITOR_SEGURANCA',obra_id:a,modulo:'SEGURANCA'},{perfil:'AUDITOR_SEGURANCA',obra_id:c,modulo:'SEGURANCA'},{perfil:'AUDITOR_QUALIDADE',obra_id:b,modulo:'QUALIDADE'},{perfil:'ENGENHARIA',obra_id:a,modulo:'SEGURANCA'},{perfil:'ENGENHARIA',obra_id:b,modulo:'QUALIDADE'}] };
const context = (profile=input.profile, changes={}) => buildWorkspaceContext({...input,profile,...changes});
test('perfil escolhido usa somente suas próprias concessões e obras ativas',()=>{
 const safety=context(); const quality=context('AUDITOR_QUALIDADE');
 assert.deepEqual(safety.user.workIds,[a]); assert.deepEqual(safety.user.modules,['safety']);
 assert.deepEqual(quality.user.workIds,[b]); assert.deepEqual(quality.user.modules,['quality']);
 assert.equal(canAccessWorkModule(safety.user,b,'quality'),false);
 assert.equal(canStartAudit(safety.user,a,'quality-f175'),false);
 assert.equal(canStartAudit(safety.user,a,'security-it07-r02'),true);
 assert.equal(safety.user.name,input.identity.name); assert.equal(safety.works[0].isDemo,false);
 assert.equal(safety.works[0].engineer,'Não informado');
});
test('Engenharia não transforma dois pares obra/módulo em acesso cruzado',()=>{
 const eng=context('ENGENHARIA').user;
 assert.equal(eng.activity,'coordination');
 assert.equal(canAccessWorkModule(eng,a,'safety'),true); assert.equal(canAccessWorkModule(eng,b,'quality'),true);
 assert.equal(canAccessWorkModule(eng,a,'quality'),false); assert.equal(canAccessWorkModule(eng,b,'safety'),false);
 assert.equal(canStartAudit(eng,a,'security-it07-r02'),false);
 assert.equal(canReadAudit(eng,{workId:a,modelId:'quality-f175',auditorId:id,status:'Publicada'}),false);
 assert.equal(canReadAudit(eng,{workId:a,modelId:'security-it07-r02',auditorId:id,status:'Publicada'}),true);
 assert.equal(canConsultAgenda(eng,a,'safety'),false);
 const team=context('ENGENHARIA',{account:{...account,atuacao_engenharia:'EQUIPE_OBRA',atuacoes_engenharia:['EQUIPE_OBRA']}}).user;
 assert.equal(canConsultAgenda(team,a,'safety'),true); assert.equal(canConsultAgenda(team,a,'quality'),false);
});
test('Administrativo mantém catálogo sem herdar operações dos perfis técnicos',()=>{
 const admin=context('ADMINISTRATIVO').user;
 assert.deepEqual(admin.workIds,[a,b]);
 assert.equal(canStartAudit(admin,a,'security-it07-r02'),false);
 assert.equal(canReadOperationalDocuments(admin,a,'safety'),false);
 assert.equal(canReadAudit(admin,{workId:a,modelId:'security-it07-r02',auditorId:id,status:'Em preenchimento'}),false);
 const empty=context('ADMINISTRATIVO',{works:[],grants:[]});
 assert.deepEqual(empty.works,[]); assert.deepEqual(empty.user.modules,['safety','quality']);
});
test('Administrativos de Segurança e Qualidade recebem apenas sua disciplina',()=>{
  const safety=context('ADMINISTRATIVO',{account:{...account,atuacao_administrativa:'SEGURANCA'}});
  const quality=context('ADMINISTRATIVO',{account:{...account,atuacao_administrativa:'QUALIDADE'}});
  assert.deepEqual(safety.user.modules,['safety']);
  assert.deepEqual(quality.user.modules,['quality']);
  assert.equal(canAccessWorkModule(safety.user,a,'safety'),true);
  assert.equal(canAccessWorkModule(safety.user,a,'quality'),false);
  assert.equal(canAccessWorkModule(quality.user,a,'safety'),false);
  assert.equal(canAccessWorkModule(quality.user,a,'quality'),true);
  assert.equal(context('ADMINISTRATIVO',{account:{...account,atuacao_administrativa:null}}),null);
});

test('Administrativo Geral pode visualizar cada disciplina sem ampliar o perfil salvo',()=>{
  const safety=context('ADMINISTRATIVO',{administrativeScope:'SEGURANCA'});
  const quality=context('ADMINISTRATIVO',{administrativeScope:'QUALIDADE'});
  assert.deepEqual(safety.user.modules,['safety']);
  assert.deepEqual(quality.user.modules,['quality']);
  assert.equal(safety.administrativeScope,'SEGURANCA');
  assert.equal(quality.administrativeScope,'QUALIDADE');
  assert.equal(context('ADMINISTRATIVO',{account:{...account,atuacao_administrativa:'SEGURANCA'},administrativeScope:'QUALIDADE'}),null);
});
test('perfil técnico sem concessões não recebe obras ou usuários fictícios',()=>{
 const empty=context('AUDITOR_SEGURANCA',{grants:[]});
 assert.deepEqual(empty.works,[]); assert.deepEqual(empty.user.workIds,[]); assert.deepEqual(empty.user.modules,[]);
 assert.equal(empty.user.id,id);
});
test('conta desativada, identidade divergente e perfil não aprovado fecham o contexto',()=>{
 for(const changes of [{account:{...account,ativo:false}},{account:{...account,ativo:1}},{identity:{...input.identity,id:a}},{identity:{...input.identity,email:'pessoa@example.com'}},{profile:'ROOT'},{account:{...account,perfis:['ADMINISTRATIVO']}},{profile:'ENGENHARIA',account:{...account,atuacao_engenharia:null}}]) assert.equal(buildWorkspaceContext({...input,...changes}),null);
});
test('concessões malformadas e obras duplicadas não abrem contexto',()=>{
 for(const grants of [[{perfil:'AUDITOR_SEGURANCA',obra_id:a,modulo:'QUALIDADE'}],[{perfil:'ADMINISTRATIVO',obra_id:a,modulo:'SEGURANCA'}],[{perfil:'ENGENHARIA',obra_id:'horizonte',modulo:'SEGURANCA'}]]) assert.equal(context(undefined,{grants}),null);
 assert.equal(context(undefined,{works:[input.works[0],input.works[0]]}),null);
});
test('prévia na obra cadastrada continua temporária e preserva dados originais',()=>{
 const ctx=context(); const state={audits:[],responses:{}};
 const data={id:'PREVIA-001',work:ctx.works[0],modelId:'security-it07-r02',date:'2026-09-15'};
 const before=JSON.stringify({state,ctx});
 const created=beginWorkspacePreviewAudit(state,ctx.user,data);
 assert.equal(created.state.audits[0].isDemo,true); assert.equal(created.state.audits[0].finalScore,null);
 assert.equal(created.state.audits[0].auditorId,id); assert.equal(created.state.audits[0].workId,a);
 assert.equal(JSON.stringify({state,ctx}),before);
 assert.throws(()=>beginPrototypeAudit(state,ctx.user,data),/não pode iniciar/);
 assert.throws(()=>beginWorkspacePreviewAudit(state,context('ADMINISTRATIVO').user,data),/não pode iniciar/);
 assert.throws(()=>beginWorkspacePreviewAudit(state,context('ENGENHARIA').user,data),/não pode iniciar/);
 assert.throws(()=>beginWorkspacePreviewAudit(state,ctx.user,{...data,modelId:'quality-f175'}),/não pode iniciar/);
 assert.throws(()=>beginWorkspacePreviewAudit(state,ctx.user,{...data,work:{...data.work,id:b}}),/não pode iniciar/);
 assert.throws(()=>beginWorkspacePreviewAudit(state,{...ctx.user,workModuleScopes:undefined},data),/contexto autorizado/);
});

test('duas atuações Engenharia abrem visões diferentes sem ampliar obras ou módulos',()=>{
 const both={...account,atuacoes_engenharia:['EQUIPE_OBRA','COORDENACAO']};
 const team=context('ENGENHARIA',{account:both,engineeringScope:'EQUIPE_OBRA'});
 const coord=context('ENGENHARIA',{account:both,engineeringScope:'COORDENACAO'});
 assert.equal(team.user.activity,'site-team'); assert.equal(coord.user.activity,'coordination');
 assert.deepEqual(team.user.workModuleScopes,coord.user.workModuleScopes);
 assert.deepEqual(team.works,coord.works);
 const discussion={workId:a,modelId:'security-it07-r02',auditorId:'another-user',status:'Em discussão com a obra'};
 assert.equal(canReadAudit(team.user,discussion),true); assert.equal(canReadAudit(coord.user,discussion),false);
 assert.equal(canStartAudit(team.user,a,'security-it07-r02'),false);
 assert.equal(canAccessWorkModule(team.user,a,'quality'),false);
 assert.equal(both.atuacao_engenharia,'COORDENACAO');
});
test('atuação forjada ou revogada não abre a visão da equipe',()=>{
 assert.equal(context('ENGENHARIA',{engineeringScope:'EQUIPE_OBRA'}),null);
 assert.equal(context('ENGENHARIA',{engineeringScope:'ROOT'}),null);
 assert.equal(context('ENGENHARIA',{account:{...account,atuacoes_engenharia:[]}}),null);
 assert.equal(context('AUDITOR_SEGURANCA',{engineeringScope:'EQUIPE_OBRA'}),null);
});
test('dados salvos no cadastro alimentam o cartão da obra autorizada',()=>{
 const work={...input.works[0],cidade:'São Paulo',uf:'SP',logradouro:'Rua A',numero:'10',responsavel_tecnico:'Responsável cadastrado',coordenacao:'Coordenação cadastrada'};
 const ctx=context('AUDITOR_SEGURANCA',{works:[work]});
 assert.equal(ctx.works[0].city,'São Paulo, SP');assert.equal(ctx.works[0].address,'Rua A, 10');assert.equal(ctx.works[0].engineer,'Responsável cadastrado');assert.equal(ctx.works[0].coordinator,'Coordenação cadastrada');
 assert.deepEqual(ctx.user.workIds,[a]);
 assert.equal(context('AUDITOR_SEGURANCA',{works:[{...work,cidade:8}]}),null);
});
