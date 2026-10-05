import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeResponses, publicationScore, normalizePlanRows, extractPublicationFindings, mapPhotos } from '../src/lib/publications/validation.ts';
const criterion = { id:'c1',code:'1',title:'Item',text:'Descrição',group:'Grupo',subgroup:'',source:'F175',locator:'1',documentedWeight:10,orientations:[],verificationRule:'Conforme/Não Conforme' };
const draft = { model_id:'quality-f175', criteria:[criterion],fvs_services:[] };
const data = r => ({ 'quality-f175':{ c1:{note:'', ...r} } });
test('server requires every response and evidence for nonconformities',()=>{
 assert.throws(()=>normalizeResponses({},draft,true),/item 1/);
 assert.throws(()=>normalizeResponses(data({answer:'Não conforme'}),draft,true),/foto/);
 assert.throws(()=>normalizeResponses(data({answer:'10'}),draft),/Resposta inválida/);
 assert.throws(()=>normalizeResponses(data({answer:'N/A'}),draft,true),/Resposta inválida/);
 assert.throws(()=>normalizeResponses({'security-it07-r02':{}},draft),/dados/);
 assert.throws(()=>normalizeResponses({'quality-f175':{unknown:{note:''}}},draft),/dados/);
 assert.equal(publicationScore({...draft,responses:data({answer:'Conforme',weight:999,score:100})}),10);
 assert.equal(publicationScore({...draft,responses:data({answer:'Não conforme',photos:['evidence']})}),0);
});
test('pinned FVS weights override submitted weights and prohibit unknown services',()=>{
 const fvs = {...draft,criteria:[{...criterion,title:'FVS',verificationRule:'Dividido pela quantidade verificada'}],fvs_services:[{label:'Heavy',weight:9},{label:'Light',weight:1}]};
 const input=data({answer:'N/A',checks:[{id:'1',label:'Heavy',compliant:false,weight:0.01,photos:['one']},{id:'2',label:'Light',compliant:true,weight:999}]});
 assert.throws(()=>normalizeResponses(input,fvs,true),/Resposta inválida/);
 delete input["quality-f175"].c1.answer;
 const clean=normalizeResponses(input,fvs,true);
 assert.equal(clean['quality-f175'].c1.answer,undefined);
 assert.deepEqual(clean['quality-f175'].c1.checks.map(c=>c.weight),[9,1]);
 assert.equal(publicationScore({...fvs,responses:input}),1);
 input['quality-f175'].c1.checks[0].label='Fake';
 assert.throws(()=>normalizeResponses(input,fvs,true),/verificações/);
});
test('incomplete quantitative checks and duplicate IDs cannot be published',()=>{
 const quantitative={...draft,criteria:[{...criterion,verificationRule:'Dividido pela quantidade verificada'}]};
 for(const checks of [[],[{id:'1',label:'A',compliant:null}],[{id:'1',label:'A',compliant:false}],[{id:'1',label:'A',compliant:true},{id:'1',label:'A',compliant:true}]])
  assert.throws(()=>normalizeResponses(data({checks}),quantitative,true));
});
test('safety group weights and all-NA audits use authoritative rules',()=>{
 const safety={audit_date:'2026-10-05',safety_closure:{hadAccidents:false,accidents:[]},model_id:'security-it07-r02',criteria:[{...criterion,documentedWeight:1,groupWeight:1}],fvs_services:[]};
 assert.equal(publicationScore({...safety,responses:{'security-it07-r02':{c1:{note:'',answer:'5',photos:['one']}}}}),5);
 assert.equal(publicationScore({...safety,responses:{'security-it07-r02':{c1:{note:'',answer:'N/A'}}}}),null);
});
test('action plan keeps findings and photos from published audit and validates complete dates',()=>{
 const findings=extractPublicationFindings([criterion],{c1:{note:'Correção necessária',answer:'Não conforme',serious:true,photos:['original.jpg']}});
 const row={id:'c1',correctiveAction:'Corrigir',responsible:'Engenheiro',startDate:'2026-10-01',dueDate:'2026-10-02',description:'Forged',serious:false,evidencePhotos:[{name:'evil.jpg'}]};
 const [actual]=normalizePlanRows([row],findings,true);
 assert.equal(actual.description,'Item'); assert.equal(actual.serious,true); assert.equal(actual.evidencePhotos[0].name,'original.jpg');
 assert.throws(()=>normalizePlanRows([],findings,true),/todos/);
 assert.throws(()=>normalizePlanRows([row,row],findings,true),/todos/);
 assert.throws(()=>normalizePlanRows([{...row,dueDate:'2026-09-30'}],findings,true),/data final/);
 assert.throws(()=>normalizePlanRows([{...row,startDate:'2026-02-30'}],findings,true),/data final/);
 assert.throws(()=>normalizePlanRows([{...row,responsible:''}],findings,true),/Preencha/);
 assert.equal(normalizePlanRows([{...row,responsible:'',startDate:'',dueDate:''}],findings).length,1);
});
test('all item and check evidence references are transformed',()=>{
 const refs=[]; const transformed=mapPhotos(data({photos:['a'],checks:[{id:'1',label:'b',compliant:false,photos:['b']}]}),r=>{refs.push(r);return 'stored:'+r;});
 assert.deepEqual(refs,['a','b']); assert.deepEqual(transformed['quality-f175'].c1.checks[0].photos,['stored:b']);
});

test('stored score uses the same rounding as the PDF at decimal boundaries',()=>{
 const custom={...draft,criteria:[{...criterion,documentedWeight:2.675}]};
 assert.equal(publicationScore({...custom,responses:data({answer:'Conforme'})}),Number((2.675).toFixed(2)));
});
