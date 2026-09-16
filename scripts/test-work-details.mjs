import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTeamAccountIds, validateWorkCreate, validateWorkEdit } from '../src/lib/works/validation.ts';
import { createWorkWithDetails, updateWork } from '../src/lib/works/service.ts';
const id='10000000-0000-4000-8000-000000000001';
const historyId='10000000-0000-4000-8000-000000000099';
const memberId='10000000-0000-4000-8000-000000000002';
const date='2026-09-13T18:00:00Z';
const blank={nome:'Obra A',logradouro:'',numero:'',complemento:'',bairro:'',cidade:'',uf:'',cep:'',responsavel_tecnico:'',registro_tecnico:'',coordenacao:'',observacoes:'',equipe_obra:[]};
function form(changes={}) {const f=new FormData();const fields={...blank,...changes}; for(const [k,v] of Object.entries(fields)) f.set(k,k==='equipe_obra'?JSON.stringify(v):v); f.set('work_id',id);f.set('expected_revision','0');return f;}
const success={obra_id:id,revisao:1,updated_at:date,history_id:historyId,changed:true};
function deps(reply={data:success,error:null}) {const calls=[];return {calls,createClient:async()=>({rpc:async(...args)=>{calls.push(args);return reply;}})};}
test('perfis da equipe exigem IDs únicos e são enviados à operação atômica',async()=>{
 const f=form();f.set('team_accounts',JSON.stringify([memberId]));
 assert.deepEqual(parseTeamAccountIds(f),{ok:true,ids:[memberId]});
 const create=deps({data:id,error:null});assert.equal((await createWorkWithDetails(f,create)).status,'success');
 assert.deepEqual(create.calls,[['create_access_work_with_team',{p_data:blank,p_user_ids:[memberId]}]]);
 const edit=deps({data:{...success,team_changed:true},error:null});assert.equal((await updateWork(f,edit)).status,'success');
 assert.deepEqual(edit.calls,[['update_access_work_with_team',{p_work_id:id,p_expected_revision:0,p_data:blank,p_user_ids:[memberId]}]]);
 for(const value of [[memberId,memberId],['invalid'],Array.from({length:31},()=>memberId)]) {
  const invalid=form();invalid.set('team_accounts',JSON.stringify(value));
  assert.equal(parseTeamAccountIds(invalid).ok,false);
  const db=deps();assert.equal((await updateWork(invalid,db)).status,'error');assert.equal(db.calls.length,0);
 }
});
test('falta da migração de vínculos não cria obra parcial nem altera acesso',async()=>{
 const f=form();f.set('team_accounts',JSON.stringify([memberId]));
 const db=deps({data:null,error:{code:'PGRST202'}});
 assert.equal((await createWorkWithDetails(f,db)).status,'error');assert.equal(db.calls.length,1);
 assert.equal((await updateWork(f,db)).status,'error');assert.equal(db.calls.length,2);
});
test('novo cadastro exige apenas nome e aceita os mesmos campos opcionais da edição',()=>{
 const minimal=validateWorkCreate(form());assert.equal(minimal.ok,true);assert.deepEqual(minimal.data,blank);
 const complete=validateWorkCreate(form({logradouro:' Rua Norte ',uf:'sp',cep:'01234-567',equipe_obra:[{nome:' Pessoa da obra ',funcao:''}]}));
 assert.equal(complete.ok,true);assert.equal(complete.data.logradouro,'Rua Norte');assert.equal(complete.data.uf,'SP');assert.equal(complete.data.cep,'01234567');
 assert.deepEqual(complete.data.equipe_obra,[{nome:'Pessoa da obra',funcao:''}]);
 for(const changes of [{nome:''},{nome:'A'},{uf:'XX'},{cep:'123'},{equipe_obra:[{nome:'',funcao:''}]}]) assert.equal(validateWorkCreate(form(changes)).ok,false);
});
test('cadastro completo envia uma operação atômica e valida o identificador retornado',async()=>{
 const d=deps({data:id,error:null});const result=await createWorkWithDetails(form({cidade:'São Paulo'}),d);
 assert.equal(result.status,'success');assert.equal(result.workId,id);assert.deepEqual(d.calls,[['create_access_work_full',{p_data:{...blank,cidade:'São Paulo'}}]]);
 const invalid=await createWorkWithDetails(form(),deps({data:'invalid',error:null}));assert.equal(invalid.status,'error');
});
test('banco antigo aceita nome sozinho, mas não cria obra parcial se houver outros dados',async()=>{
 const calls=[];const d={createClient:async()=>({rpc:async(name,payload)=>{calls.push([name,payload]);return name==='create_access_work_full'?{data:null,error:{code:'PGRST202'}}:{data:id,error:null};}})};
 assert.equal((await createWorkWithDetails(form(),d)).status,'success');assert.equal(calls.length,2);assert.deepEqual(calls[1],['create_access_work',{p_nome:'Obra A'}]);
 calls.length=0;const result=await createWorkWithDetails(form({cidade:'São Paulo'}),d);
 assert.equal(result.status,'error');assert.equal(calls.length,1);assert.match(result.message,/Nenhuma obra foi criada/);
});
test('cadastro completo rejeita nome duplicado e falha sem inventar sucesso',async()=>{
 const duplicate=await createWorkWithDetails(form(),deps({data:null,error:{code:'23505'}}));assert.equal(duplicate.status,'error');assert.ok(duplicate.fieldErrors.nome);
 const denied=await createWorkWithDetails(form(),deps({data:null,error:{code:'42501'}}));assert.equal(denied.status,'error');
 const offline=await createWorkWithDetails(form(),{createClient:async()=>{throw new Error('private provider token');}});assert.equal(offline.status,'error');assert.doesNotMatch(offline.message,/provider|token/);
});
test('cadastro aceita nome obrigatório e campos opcionais vazios sem inventar dados',()=>{
 const result=validateWorkEdit(form()); assert.equal(result.ok,true);assert.deepEqual(result.data.fields,blank);assert.equal(result.data.expectedRevision,0);
});
test('normaliza endereço e equipe sem vincular integrantes a contas ou permissões',()=>{
 const result=validateWorkEdit(form({nome:' Obra Norte ',logradouro:' Rua A ',numero:' 10 ',uf:'sp',cep:'01234-567',responsavel_tecnico:' Eng. Pessoa ',coordenacao:' Coordenação local ',equipe_obra:[{nome:' Pessoa 1 ',funcao:' Engenharia '},{nome:' Pessoa 2 ',funcao:''}]}));
 assert.equal(result.ok,true);assert.equal(result.data.fields.cep,'01234567');assert.equal(result.data.fields.uf,'SP');assert.equal(result.data.fields.nome,'Obra Norte');assert.deepEqual(result.data.fields.equipe_obra,[{nome:'Pessoa 1',funcao:'Engenharia'},{nome:'Pessoa 2',funcao:''}]);
});
test('ID ou versão ausentes, duplicados e inválidos falham antes de acessar banco',async()=>{
 for(const [key,values] of [['work_id',['wrong']],['work_id',[id,id]],['expected_revision',['-1']],['expected_revision',['1.5']],['expected_revision',['2147483647']],['expected_revision',['0','0']]]){
  const f=form();f.delete(key);for(const value of values)f.append(key,value);const d=deps();assert.equal((await updateWork(f,d)).status,'error');assert.equal(d.calls.length,0);
 }
});
test('campos escalares não aceitam duplicidade, arquivo, limite excedido ou caractere nulo',()=>{
 for(const key of Object.keys(blank).filter(k=>k!=='equipe_obra')) {const f=form();f.append(key,'forged');assert.equal(validateWorkEdit(f).ok,false);}
 const f=form();f.set('nome',new Blob(['secret']),'file.txt');assert.equal(validateWorkEdit(f).ok,false);
 for(const changes of [{nome:'A'},{nome:'a'.repeat(161)},{logradouro:'a'.repeat(201)},{responsavel_tecnico:'a'.repeat(161)},{observacoes:'a'.repeat(2001)},{cidade:'bad\u0000value'}]) assert.equal(validateWorkEdit(form(changes)).ok,false);
});
test('UF e CEP precisam de formatos definidos, mantendo zero inicial',()=>{
 for(const changes of [{uf:'ZZ'},{uf:'S'},{cep:'123'},{cep:'abcdefgh'},{cep:'12345 678'}]) assert.equal(validateWorkEdit(form(changes)).ok,false);
 assert.equal(validateWorkEdit(form({cep:'01234567'})).data.fields.cep,'01234567');
});
test('lista da equipe recusa elementos sem nome, campos extras, tipos incorretos e excesso',()=>{
 for(const equipe_obra of [[{}],[{nome:'A',funcao:''}],[{nome:'Pessoa',funcao:'',auth_user_id:id}],[{nome:'Pessoa',funcao:7}],Array.from({length:31},()=>({nome:'Pessoa',funcao:''})),null,{}]) assert.equal(validateWorkEdit(form({equipe_obra})).ok,false);
 const f=form();f.set('equipe_obra','not json');assert.equal(validateWorkEdit(f).ok,false);
 assert.equal(validateWorkEdit(form({equipe_obra:Array.from({length:30},(_,i)=>({nome:`Pessoa ${i}`,funcao:''}))})).ok,true);
});
test('serviço envia somente campos de cadastro e versão esperada para uma RPC',async()=>{
 const f=form();for(const [key,value] of Object.entries({ativo:'false',created_by:id,actor_auth_user_id:id,perfis:'ADMINISTRATIVO',updated_by:id,history_id:id})) f.set(key,value);
 const d=deps();const result=await updateWork(f,d);assert.equal(result.status,'success');assert.equal(result.revision,1);assert.equal(d.calls.length,1);
 assert.deepEqual(d.calls[0],['update_access_work',{p_work_id:id,p_expected_revision:0,p_data:blank}]);
});
test('gravação sem diferenças mantém revisão e não inventa histórico',async()=>{
 const d=deps({data:{obra_id:id,revisao:0,updated_at:null,history_id:null,changed:false},error:null});const result=await updateWork(form(),d);assert.equal(result.status,'success');assert.equal(result.revision,0);assert.match(result.message,/Nenhuma alteração/);
});
test('conflito mantém operação bloqueada e não tenta gravar de novo',async()=>{
 const d=deps({data:null,error:{code:'40001',message:'provider detail secret'}});const result=await updateWork(form(),d);assert.equal(result.status,'error');assert.equal(result.conflict,true);assert.equal(d.calls.length,1);assert.doesNotMatch(JSON.stringify(result),/provider|secret/);
});
test('nome duplicado e falta de permissão têm mensagens úteis sem erro bruto',async()=>{
 for(const code of ['23505','42501','P0002','22023']) {const result=await updateWork(form(),deps({data:null,error:{code,message:'provider detail secret'}}));assert.equal(result.status,'error');assert.doesNotMatch(JSON.stringify(result),/provider|secret/);if(code==='23505')assert.ok(result.fieldErrors.nome);}
});
test('sucesso exige ID, revisão, data e histórico coerentes com a gravação',async()=>{
 for(const data of [null,{},true,{...success,obra_id:historyId},{...success,revisao:0},{...success,revisao:2},{...success,history_id:null},{...success,updated_at:'invalid'},{...success,changed:'true'},{...success,changed:false}]) assert.equal((await updateWork(form(),deps({data,error:null}))).status,'error');
});
test('falha de conexão não declara gravação nem publica detalhes privados',async()=>{
 const result=await updateWork(form(),{createClient:async()=>{throw new Error('private provider URL token');}});assert.equal(result.status,'error');assert.doesNotMatch(JSON.stringify(result),/private|provider|token/);
});
