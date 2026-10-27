import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GitHubStore,GitHubError,projectSession,parseProjectLink,makeProjectLink,mergeOperations} from '../public/github-storage.mjs';
import {normalizeState,snapshotState} from '../public/register-model.mjs';
const data=()=>snapshotState(normalizeState({stairs:[{id:1,f1:false,f2:false}],lifts:[{id:1,f1:false,f2:false}]}));
const document=()=>({schemaVersion:3,name:'香港工地 · 登記',data:data(),revision:1,appliedOperations:[]});
const session=()=>projectSession('owner/private-data','main','projects/'+'a'.repeat(32)+'.json');
const op=(opId,fields)=>({opId,type:'patch',kind:'stairs',itemId:1,generation:1,fields});
const b64=x=>Buffer.from(JSON.stringify(x),'utf8').toString('base64');
function server({privateRepo=true}={}){
 let doc=document(),sha='sha-1',writes=0,conflict=null;const calls=[];
 const request=async(url,options)=>{
  assert.equal(new URL(url).origin,'https://api.github.com');assert.equal(options.credentials,'omit');assert.equal(options.headers.Authorization,'Bearer test-only-token');assert.ok(!url.includes('test-only-token'));calls.push({url,options});
  if(!url.includes('/contents/'))return Response.json({private:privateRepo,default_branch:'main'});
  if(options.method==='PUT'){
   const body=JSON.parse(options.body);
   if(conflict){doc=conflict(doc);conflict=null;sha='sha-other';return Response.json({message:'Conflict'},{status:409});}
   if(body.sha&&body.sha!==sha)return Response.json({},{status:409});
   doc=JSON.parse(Buffer.from(body.content,'base64').toString('utf8'));sha='sha-'+(++writes+1);return Response.json({content:{sha}},{status:201});
  }
  return Response.json({sha,encoding:'base64',content:b64(doc)});
 };
 return {request,calls,get doc(){return doc;},get writes(){return writes;},setConflict(fn){conflict=fn;}};
}
test('private GitHub files preserve Chinese data and require no other service',async()=>{
 const fake=server(),store=new GitHubStore({token:()=> 'test-only-token',request:fake.request});
 const created=await store.create('owner/private-data','香港工地 · 登記',data());assert.equal(created.remote.project.name,'香港工地 · 登記');assert.equal(fake.writes,1);
 const changed=await store.apply(created.session,[op('device-a',{f1:true,f2:true,tower:'T5'})]);assert.equal(changed.data.stairs[0].f1,true);assert.equal(changed.data.stairs[0].f2,true);assert.equal(changed.data.stairs[0].tower,'T5');
 assert.equal((await store.read(created.session)).data.stairs[0].f2,true);
});
test('concurrent devices reload after SHA conflict and preserve independent edits',async()=>{
 const fake=server(),store=new GitHubStore({token:()=> 'test-only-token',request:fake.request});fake.setConflict(doc=>mergeOperations(doc,[op('other-device',{f2:true})]));
 const saved=await store.apply(session(),[op('this-device',{f1:true})]);assert.equal(saved.data.stairs[0].f1,true);assert.equal(saved.data.stairs[0].f2,true);assert.equal(fake.doc.appliedOperations.length,2);
});
test('retried operations cannot undo a later modification',async()=>{
 const fake=server(),store=new GitHubStore({token:()=> 'test-only-token',request:fake.request});
 await store.apply(session(),[op('first',{f1:true})]);await store.apply(session(),[op('second',{f1:false})]);const writes=fake.writes;
 assert.equal((await store.apply(session(),[op('first',{f1:true})])).data.stairs[0].f1,false);assert.equal(fake.writes,writes);
});
test('deletion, number reuse, history and restore conflicts survive repository writes',async()=>{
 const fake=server(),store=new GitHubStore({token:()=> 'test-only-token',request:fake.request});
 await store.apply(session(),[op('first',{f1:true}),{opId:'del',type:'delete',kind:'stairs',itemId:1,generation:1}]);assert.equal(fake.doc.data.nextIds.stairs,1);
 await store.apply(session(),[{opId:'new',type:'ensure',kind:'stairs',itemId:1,generation:2}]);assert.equal(fake.doc.data.stairs[0].f1,false);assert.equal(fake.doc.data.deleted.stairs[0].f1,true);
 await assert.rejects(store.apply(session(),[{opId:'restore',type:'restore',kind:'stairs',itemId:1,generation:1}]),e=>e.code==='restore_conflict'&&e.opId==='restore');
 await store.apply(session(),[{opId:'delete-new',type:'delete',kind:'stairs',itemId:1,generation:2},{opId:'restore',type:'restore',kind:'stairs',itemId:1,generation:1}]);assert.equal(fake.doc.data.stairs[0].generation,3);assert.equal(fake.doc.data.stairs[0].f1,true);
});
test('sharing includes repository identity and no token; view links cannot write through the adapter',async()=>{
 const s={...session(),token:'must-not-share'};const link=makeProjectLink(s,'view','https://owner.github.io/register/');assert.equal(new URL(link).pathname,'/register/');assert.ok(!link.includes('must-not-share'));assert.equal(parseProjectLink(link).role,'view');
 const fake=server(),store=new GitHubStore({token:()=> 'test-only-token',request:fake.request});await assert.rejects(store.apply(parseProjectLink(link),[op('nope',{f1:true})]),e=>e.status===403);assert.equal(fake.calls.length,0);
 assert.throws(()=>parseProjectLink('https://old.example/#project=old&key=old'),e=>e.code==='legacy_link');
});
test('missing tokens make no network requests and public repositories cannot receive private records',async()=>{
 const fake=server({privateRepo:false});await assert.rejects(new GitHubStore({request:fake.request}).read(session()),e=>e.auth===true);assert.equal(fake.calls.length,0);
 await assert.rejects(new GitHubStore({token:()=> 'test-only-token',request:fake.request}).create('owner/private-data','test',data()),/私人/);assert.equal(fake.writes,0);
});
test('rate-limit responses pause retries without losing pending operation input',async()=>{
 let count=0;const store=new GitHubStore({token:()=> 'test-only-token',request:async()=>{count++;return new Response('{}',{status:403,headers:{'x-ratelimit-remaining':'0','retry-after':'60'}});}});const pending=[op('pending',{f1:true})];
 await assert.rejects(store.apply(session(),pending),e=>e.code==='rate_limit');await assert.rejects(store.apply(session(),pending),e=>e.code==='rate_limit');assert.equal(count,1);assert.equal(pending[0].fields.f1,true);
});

test('existing private projects can be listed by their Chinese names without an external index',async()=>{
 const s=session(),doc=document();let count=0;
 const store=new GitHubStore({token:()=> 'test-only-token',request:async(url,options)=>{
  assert.equal(options.headers.Authorization,'Bearer test-only-token');count++;
  if(!url.includes('/contents/'))return Response.json({private:true,default_branch:'main'});
  if(url.includes('/contents/projects?'))return Response.json([{type:'file',path:s.path},{type:'file',path:'projects/README.md'},{type:'dir',path:'projects/other'}]);
  return Response.json({sha:'sha',encoding:'base64',content:b64(doc)});
 }});
 const listed=await store.list(s.repo);assert.equal(listed.length,1);assert.equal(listed[0].name,doc.name);assert.equal(listed[0].session.path,s.path);assert.equal(count,3);
});
