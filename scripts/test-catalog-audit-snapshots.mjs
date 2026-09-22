import assert from "node:assert/strict";
import test from "node:test";
import { demoUsers, initialVisits } from "../src/domain/prototype-access.ts";
import { workRecords } from "../src/domain/operational-records.ts";
import { beginPrototypeAudit, criteriaForAudit, criteriaForModel, updatePrototypeResponse } from "../src/domain/prototype-audits.ts";
const user=demoUsers.find(u=>u.id==="auditor-safety"); const work=workRecords.find(w=>w.id==="horizonte");
const modelId="security-it07-r02";
const empty=()=>({audits:[],responses:{}});
const version=(number)=>({id:"revision-"+number,version:number,label:"R"+number,criteria:structuredClone(criteriaForModel(modelId))});
const start=(state,id,revision,visit)=>beginPrototypeAudit(state,user,{id,work,modelId,date:visit?.date ?? "2026-09-16",catalogRevision:revision,visit});

test("New revisions affect only new audits, including deeply nested orientation text and weights",()=>{
 const v1=version(1); const first=start(empty(),"A1",v1); const original=structuredClone(criteriaForAudit(first.state,first.state.audits[0]));
 v1.criteria[0].text="Caller mutated"; v1.criteria[0].orientations[0].text="Caller mutation nested";
 const v2=version(2); v2.criteria[0].text="Revision 2";v2.criteria[0].configuredWeight=5;v2.criteria[0].orientations[0].text="Revised guidance";
 const second=start(first.state,"A2",v2);
 assert.deepEqual(criteriaForAudit(second.state,second.state.audits[0]),original);
 assert.equal(criteriaForAudit(second.state,second.state.audits[1])[0].text,"Revision 2");
 assert.equal(second.state.audits[0].catalogRevisionId,"revision-1"); assert.equal(second.state.audits[1].catalogVersion,2);
 v2.criteria[0].configuredWeight=99; assert.equal(criteriaForAudit(second.state,second.state.audits[1])[0].configuredWeight,5);
});

test("A visit resumes its pinned revision and answers after a newer catalog is available",()=>{
 const visit=initialVisits.find(v=>v.auditorId===user.id&&v.workId===work.id&&v.modelId===modelId);
 assert.ok(visit);const first=start(empty(),"A1",version(1),visit);
 const item=criteriaForAudit(first.state,first.state.audits[0])[0];
 const answered=updatePrototypeResponse(first.state,user,"A1",item,{answer:"5",note:"Original answer"});
 const resumed=start(answered,"A2",version(2),visit);
 assert.equal(resumed.auditId,"A1");assert.equal(resumed.state,answered); assert.equal(resumed.state.audits.length,1);
 assert.equal(resumed.state.audits[0].catalogVersion,1);
});

test("Items introduced later cannot be submitted against an older snapshot",()=>{
 const v1=version(1); const first=start(empty(),"A1",v1);
 const later={...v1.criteria[0],id:"new-in-revision-2",code:"new"};
 assert.throws(()=>updatePrototypeResponse(first.state,user,"A1",later,{answer:"10",note:""}),/versão/);
 const old={...first.state.audits[0],status:"Publicada"};
 assert.throws(()=>updatePrototypeResponse({...first.state,audits:[old]},user,"A1",v1.criteria[0],{answer:"10",note:""}),/permissão/);
});

test("Initial audits also copy the bundled criteria and legacy records remain readable",()=>{
 const first=start(empty(),"initial",undefined);
 const snapshot=criteriaForAudit(first.state,first.state.audits[0]);assert.notEqual(snapshot,criteriaForModel(modelId));
 assert.deepEqual(snapshot,criteriaForModel(modelId));assert.equal(first.state.audits[0].catalogVersion,0);
 assert.equal(criteriaForAudit({audits:first.state.audits,responses:{}},first.state.audits[0]),criteriaForModel(modelId));
});
