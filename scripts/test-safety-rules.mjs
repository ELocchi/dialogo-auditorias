import assert from 'node:assert/strict';
import test from 'node:test';
import { securityCriteria } from '../src/domain/catalogs.ts';
import { safetyScore, validateSafetyClosure, toggleGroupNA, reactivateGroupAfterAnswer } from '../src/domain/safety-audit.ts';
import { normalizeResponses, publicationScore } from '../src/lib/publications/validation.ts';
const model='security-it07-r02';
const c=[{...securityCriteria[0],id:'a',group:'A',configuredWeight:1,groupWeight:2},{...securityCriteria[0],id:'b',group:'A',configuredWeight:3,groupWeight:2},{...securityCriteria[0],id:'c',group:'B',configuredWeight:100,groupWeight:1}];
const drafts=(answers)=>({[model]:Object.fromEntries(c.map((item,i)=>[item.id,{note:'',answer:answers[i],photos:['photo']}]))});
const accident={date:'2026-10-01',type:'common',event:'Descrição',justification:'Justificativa'};
const none={hadAccidents:false,accidents:[]};
test('nested weighting excludes NA at both levels; serious items have no extra penalty',()=>{
 const d=drafts(['10','0','10']);
 assert.equal(safetyScore(c,d,model).raw,5);
 d[model].a.serious=true;assert.equal(safetyScore(c,d,model).raw,5);
 assert.equal(safetyScore(c,drafts(['10','N/A','0']),model).final,6.67);
 assert.equal(safetyScore(c,drafts(['10','0','N/A']),model).final,2.5);
 assert.equal(safetyScore(c,drafts(['N/A','N/A','N/A']),model,none).final,null);
});
test('penalties accumulate, clamp to zero and round only after deduction',()=>{
 const closure={hadAccidents:true,accidents:[accident,{...accident,type:'leave'}]};
 assert.deepEqual(safetyScore(c,drafts(['10','0','10']),model,closure),{raw:5,penalty:3,final:2});
 assert.equal(safetyScore(c,drafts(['0','0','0']),model,closure).final,0);
});
test('group fill preserves answers and evidence; button undo restores blanks; item edit only reactivates',()=>{
 const initial={[model]:{a:{note:'Preservar',answer:'5',photos:['foto']},b:{note:'Observação',serious:true},c:{note:'',answer:'10'}}};
 const filled=toggleGroupNA(initial,model,c,'A');
 assert.deepEqual(filled[model].a,initial[model].a); assert.equal(filled[model].b.answer,'N/A');
 assert.equal(initial[model].b.answer,undefined);
 assert.deepEqual(toggleGroupNA(filled,model,c,'A'),initial);
 const reactivated=reactivateGroupAfterAnswer(filled,model,c,'A');
 assert.equal(reactivated[model].b.answer,'N/A');assert.equal(reactivated[model].b.autoGroupNA,undefined);
 assert.equal(reactivated[model].b.note,'Observação');
});
test('declaration mandatory, no/yes consistency, required fields, valid date and audit month',()=>{
 assert.deepEqual(validateSafetyClosure(none,'2026-10-05'),none);
 for(const value of [undefined,{}, {hadAccidents:true,accidents:[]},{hadAccidents:false,accidents:[accident]}]) assert.throws(()=>validateSafetyClosure(value,'2026-10-05'));
 for(const patch of [{date:'2026-09-30'},{date:'2026-10-32'},{type:'x'},{event:' '},{justification:''}]) assert.throws(()=>validateSafetyClosure({hadAccidents:true,accidents:[{...accident,...patch}]},'2026-10-05'));
 assert.deepEqual(validateSafetyClosure({hadAccidents:true,accidents:[accident]},'2026-10-05').accidents[0],accident);
});
test('server enforces closure and completeness; group marker survives persistence',()=>{
 const base={model_id:model,criteria:c,fvs_services:[],audit_date:'2026-10-05',responses:drafts(['10','0','10'])};
 assert.throws(()=>publicationScore(base),/acidente/);
 assert.equal(publicationScore({...base,safety_closure:{hadAccidents:true,accidents:[accident]}}),4);
 const filled=toggleGroupNA({},model,c,'A');
 assert.equal(normalizeResponses(filled,base)[model].b.autoGroupNA,true);
 assert.throws(()=>publicationScore({...base,safety_closure:none,responses:filled}));
});
test('approved catalog exceptions and all 205 positive weights',()=>{
 assert.equal(securityCriteria.length,205);
 for(const code of ['01.08.08','04.01.03','10.01.09']) assert.equal(securityCriteria.find(c=>c.code===code).configuredWeight,10);
 assert.ok(securityCriteria.every(c=>c.configuredWeight>0 && c.groupWeight>0));
});

test('rounds the final decimal midpoint consistently with PostgreSQL',()=>{
 const items=[{...c[0],configuredWeight:107},{...c[1],configuredWeight:293}];
 assert.equal(safetyScore(items,drafts(['10','0','N/A']),model,none).final,2.68);
});
