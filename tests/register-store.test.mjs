import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { registerRequest, projectsRequest } from '../lib/register-api.mjs';
import { bootstrapRegister, readRegister, applyOperations } from '../lib/register-store.mjs';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  return {
    prepare(sql) { return { bind(...args) { const stmt = sqlite.prepare(sql); return { first: async () => stmt.get(...args) || null, all: async () => ({ results: stmt.all(...args) }), run: () => stmt.run(...args) }; } }; },
    async batch(statements) { sqlite.exec('BEGIN'); try { const values=statements.map(stmt => stmt.run()); sqlite.exec('COMMIT'); return values; } catch(error) { sqlite.exec('ROLLBACK'); throw error; } }
  };
}
const defaults=()=>({stairs:Array.from({length:16},(_,i)=>({id:i+1,f1:false,f2:false})),lifts:Array.from({length:16},(_,i)=>({id:i+1,f1:false,f2:false,fire:false,category:''}))});
const patch=(opId,kind,itemId,fields)=>({opId,type:'patch',kind,itemId,fields});

test('legacy import preserves both floors and existing cloud is never replaced by another device',async()=>{
  const db=database();const old=defaults();old.stairs[0].f1=true;old.stairs[0].f2=true;old.lifts[2].category='platform';old.lifts[2].fire=true;
  await bootstrapRegister(db,'account-a',old);
  const later=await bootstrapRegister(db,'account-a',defaults());
  assert.equal(later.data.stairs[0].f1,true);assert.equal(later.data.stairs[0].f2,true);assert.equal(later.data.lifts[2].category,'platform');assert.equal(later.data.lifts[2].fire,true);
});
test('independent device edits merge and retried requests cannot undo newer changes',async()=>{
  const db=database();await bootstrapRegister(db,'account-a',defaults());
  const first=patch('device-a-1','lifts',1,{f1:true,category:'main'});
  await applyOperations(db,'account-a',[first]);
  await applyOperations(db,'account-a',[patch('device-b-1','lifts',1,{f2:true,fire:true})]);
  const both=await readRegister(db,'account-a');assert.deepEqual(both.data.lifts[0],{id:1,generation:1,f1:true,f2:true,tower:'',fire:true,category:'main'});
  await applyOperations(db,'account-a',[patch('device-b-2','lifts',1,{f1:false})]);
  const retry=await applyOperations(db,'account-a',[first]);assert.equal(retry.data.lifts[0].f1,false);assert.equal(retry.data.lifts[0].f2,true);
});
test('accounts are isolated and additions are sequential, durable, and idempotent',async()=>{
  const db=database();await bootstrapRegister(db,'account-a',defaults());await bootstrapRegister(db,'account-b',defaults());
  const add={opId:'ensure-lift-17',type:'ensure',kind:'lifts',itemId:17};
  await applyOperations(db,'account-a',[add,patch('new-lift-17','lifts',17,{f1:true})]);
  await applyOperations(db,'account-a',[add]);
  assert.equal((await readRegister(db,'account-a')).data.lifts.length,17);assert.equal((await readRegister(db,'account-a')).data.lifts[16].f1,true);
  const b=await readRegister(db,'account-b');assert.equal(b.data.lifts.length,16);assert.equal(b.data.lifts[0].f1,false);
  await assert.rejects(applyOperations(db,'account-a',[{...add,opId:'nonsequential',itemId:19}]));
});
test('invalid fields and mixed invalid batches leave records unchanged',async()=>{
  const db=database();await bootstrapRegister(db,'account-a',defaults());
  await assert.rejects(applyOperations(db,'account-a',[patch('valid-first','stairs',1,{f1:true}),patch('invalid-last','stairs',1,{fire:true})]));
  assert.equal((await readRegister(db,'account-a')).data.stairs[0].f1,false);
  await assert.rejects(applyOperations(db,'account-a',[patch('bad-category','lifts',1,{category:'invalid'})]));
  await assert.rejects(applyOperations(db,'account-a',[patch('bad-sql-key','lifts',1,{'f1 = 1 --':true})]));
});


test('tower assignments work for stairs and lifts and reject unknown towers',async()=>{
 const db=database();await bootstrapRegister(db,'tower-account',defaults());
 await applyOperations(db,'tower-account',[patch('tower-stairs','stairs',1,{tower:'T3'}),patch('tower-lifts','lifts',1,{tower:'T4',fire:true})]);
 const saved=await readRegister(db,'tower-account');assert.equal(saved.data.stairs[0].tower,'T3');assert.equal(saved.data.lifts[0].tower,'T5');
 await assert.rejects(applyOperations(db,'tower-account',[patch('tower-invalid','lifts',1,{tower:'T6'})]));
});
test('anonymous projects synchronize by capability and viewer links cannot write',async()=>{
 const db=database();const origin='https://test.example';
 const create=async(name)=>{const response=await projectsRequest(new Request(origin+'/api/projects',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({name,data:defaults()})}),db);assert.equal(response.status,201);return response.json();};
 const project=await create('Shared project');const other=await create('Other project');
 const request=(key,body)=>new Request(origin+'/api/register',{method:body?'POST':'GET',headers:{authorization:'Bearer '+project.project.id+'.'+key,origin,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const change={action:'operations',operations:[patch('project-edit-1','lifts',2,{tower:'T2',f1:true,fire:true})]};
 assert.equal((await registerRequest(request(project.editKey,change),db)).status,200);
 const viewer=await registerRequest(request(project.viewKey),db);assert.equal(viewer.status,200);const data=await viewer.json();assert.equal(data.role,'view');assert.equal(data.viewKey,undefined);assert.equal(data.data.lifts[1].tower,'T2');assert.equal(data.data.lifts[1].f1,true);
 assert.equal((await registerRequest(request(project.viewKey,change),db)).status,403);
 assert.equal((await registerRequest(request(other.editKey),db)).status,401);
 assert.equal((await registerRequest(new Request(origin+'/api/register'),db)).status,401);
 const rejected=await projectsRequest(new Request(origin+'/api/projects',{method:'POST',headers:{'content-type':'application/json',origin:'https://other.example'},body:JSON.stringify({name:'Blocked',data:defaults()})}),db);assert.equal(rejected.status,403);
 const isolated=await readRegister(db,other.accountId);assert.equal(isolated.data.lifts[1].f1,false);
});


test('stored T4 data is converted to T5 when read, including deleted records',async()=>{
 const db=database();await bootstrapRegister(db,'legacy-tower',defaults());
 await db.prepare("UPDATE register_items SET tower = 'T4' WHERE user_id = ? AND item_id = 1").bind('legacy-tower').run();
 const read=await readRegister(db,'legacy-tower');assert.equal(read.data.stairs[0].tower,'T5');assert.equal(read.data.lifts[0].tower,'T5');
 assert.equal((await db.prepare('SELECT tower FROM register_items WHERE user_id = ? AND kind = ? AND item_id = 1').bind('legacy-tower','stairs').first()).tower,'T5');
});
test('next numbers follow the current maximum, and reused numbers start blank without losing old settings',async()=>{
 const db=database();await bootstrapRegister(db,'numbering',defaults());
 await applyOperations(db,'numbering',[patch('set-old-sixteen','stairs',16,{tower:'T5',f1:true})]);
 let result=await applyOperations(db,'numbering',[{opId:'delete-top-sixteen',type:'delete',kind:'stairs',itemId:16,generation:1}]);
 assert.equal(result.data.nextIds.stairs,16);assert.equal(result.data.nextIds.lifts,17);
 const add={opId:'reuse-sixteen',type:'ensure',kind:'stairs',itemId:16,generation:2};
 result=await applyOperations(db,'numbering',[add]);
 const fresh=result.data.stairs.find(item=>item.id===16);assert.equal(fresh.generation,2);assert.equal(fresh.f1,false);assert.equal(fresh.tower,'');
 assert.equal(result.data.deleted.stairs.find(item=>item.id===16).tower,'T5');
 await applyOperations(db,'numbering',[{...patch('edit-new-sixteen','stairs',16,{f1:true,f2:true}),generation:2}]);
 result=await applyOperations(db,'numbering',[add,{...patch('stale-old-patch','stairs',16,{f1:false}),generation:1},{opId:'stale-old-delete',type:'delete',kind:'stairs',itemId:16,generation:1}]);
 assert.equal(result.data.stairs.find(item=>item.id===16).f1,true);assert.equal(result.data.stairs.find(item=>item.id===16).f2,true);
 await assert.rejects(applyOperations(db,'numbering',[{opId:'restore-occupied',type:'restore',kind:'stairs',itemId:16,generation:1}]),error=>error.message==='restore_conflict'&&error.opId==='restore-occupied');
 await applyOperations(db,'numbering',[{opId:'delete-new-sixteen',type:'delete',kind:'stairs',itemId:16,generation:2}]);
 const restore={opId:'restore-original',type:'restore',kind:'stairs',itemId:16,generation:1};
 result=await applyOperations(db,'numbering',[restore]);
 const original=result.data.stairs.find(item=>item.id===16);assert.equal(original.generation,3);assert.equal(original.tower,'T5');assert.equal(original.f1,true);assert.equal(original.f2,false);
 assert.deepEqual(result.data.deleted.stairs.map(item=>item.generation),[2]);
 result=await applyOperations(db,'numbering',[restore,{...restore,opId:'other-device-restored'}]);assert.equal(result.data.stairs.find(item=>item.id===16).generation,3);
 const clone=await bootstrapRegister(db,'cloned-numbering',result.data);assert.deepEqual(clone.data,result.data);
});
test('middle deletions do not change the next number and an empty list restarts at one',async()=>{
 const db=database();await bootstrapRegister(db,'empty-numbering',defaults());
 let result=await applyOperations(db,'empty-numbering',[{opId:'delete-middle-seven',type:'delete',kind:'lifts',itemId:7}]);assert.equal(result.data.nextIds.lifts,17);
 result=await applyOperations(db,'empty-numbering',Array.from({length:16},(_,i)=>({opId:'remove-stair-'+i,type:'delete',kind:'stairs',itemId:i+1})));
 assert.equal(result.data.stairs.length,0);assert.equal(result.data.nextIds.stairs,1);
 result=await applyOperations(db,'empty-numbering',[{opId:'restart-from-one',type:'ensure',kind:'stairs',itemId:1,generation:2}]);
 assert.deepEqual(result.data.stairs.map(item=>item.id),[1]);assert.equal(result.data.nextIds.stairs,2);assert.equal(result.data.nextIds.lifts,17);
});
test('read-only links cannot delete or restore records',async()=>{
 const db=database(),origin='https://test.example';
 const made=await projectsRequest(new Request(origin+'/api/projects',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({name:'Delete permissions',data:defaults()})}),db);const project=await made.json();
 for(const type of ['delete','restore']){
  const request=new Request(origin+'/api/register',{method:'POST',headers:{'content-type':'application/json',origin,authorization:'Bearer '+project.project.id+'.'+project.viewKey},body:JSON.stringify({action:'operations',operations:[{opId:'viewer-'+type,type,kind:'lifts',itemId:1}]})});
  assert.equal((await registerRequest(request,db)).status,403);
 }
 assert.equal((await readRegister(db,project.accountId)).data.lifts.length,16);
});
