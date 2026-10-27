import {validItems, normalizeState, snapshotState, applyLocalOperation} from './register-model.mjs?v=6';

export class GitHubError extends Error {
  constructor(message, status=0, code='github_error') { super(message); this.status=status; this.code=code; this.auth=status===401; }
}
export function projectSession(repo, branch, path, role='edit') {
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(repo)||repo.endsWith('/.')||repo.endsWith('/..')||!branch||branch.length>200||!/^projects\/[a-f0-9]{32}\.json$/.test(path)) throw new GitHubError('項目連結格式不正確。',0,'invalid_link');
  return {provider:'github',repo,branch,path,role:role==='view'?'view':'edit',id:repo+'@'+branch+'/'+path};
}
export function parseProjectLink(value) {
  let url; try { url=new URL(value.trim()); } catch { throw new GitHubError('請貼上完整的 GitHub 項目分享連結。',0,'invalid_link'); }
  const p=new URLSearchParams(url.hash.slice(1));
  if (p.get('storage')!=='github') throw new GitHubError('這是舊版同步連結。請先在舊網站匯出 JSON，再在這裡建立 GitHub 項目。',0,'legacy_link');
  return projectSession(p.get('repo')||'',p.get('branch')||'main',p.get('path')||'',p.get('access'));
}
export function makeProjectLink(session, role, pageUrl) {
  const url=new URL('./',pageUrl);
  url.hash=new URLSearchParams({storage:'github',repo:session.repo,branch:session.branch,path:session.path,access:role==='view'?'view':'edit'}).toString();
  return url.href;
}
const encode = value => {const bytes=new TextEncoder().encode(JSON.stringify(value));return btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''));};
const decode = value => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g,'')),c=>c.charCodeAt(0))));
function validate(doc) {
  if(doc?.schemaVersion!==3||typeof doc.name!=='string'||!validItems(doc.data?.stairs)||!validItems(doc.data?.lifts)||!Array.isArray(doc.appliedOperations)||!doc.appliedOperations.every(id=>typeof id==='string')) throw new GitHubError('GitHub 項目檔案格式不正確，未有覆蓋檔案。');
  return doc;
}
export function mergeOperations(doc, operations) {
  validate(doc);
  const data=normalizeState(doc.data), done=new Set(doc.appliedOperations); let changed=false;
  for(const op of operations) {
    if(done.has(op.opId)) continue;
    if(!['stairs','lifts'].includes(op.kind)||!['ensure','patch','delete','restore'].includes(op.type)||typeof op.opId!=='string') throw new GitHubError('待同步修改格式不正確。');
    if(op.type==='restore'&&data.deleted[op.kind].some(i=>i.id===op.itemId&&i.generation===(op.generation??1))&&data[op.kind].some(i=>i.id===op.itemId)) {const error=new GitHubError('此編號已被使用，未有覆蓋現有記錄。',409,'restore_conflict');error.opId=op.opId;throw error;}
    applyLocalOperation(data,op);done.add(op.opId);changed=true;
  }
  return changed?{...doc,data:snapshotState(data),revision:(doc.revision||0)+1,appliedOperations:[...done]}:doc;
}
export class GitHubStore {
  constructor({token=()=>'',request=fetch}={}) {this.token=token;this.request=request;this.notBefore=0;}
  async call(path,options={}) {
    if(Date.now()<this.notBefore) throw new GitHubError('GitHub 暫時限制請求，稍後會自動重試。',429,'rate_limit');
    const token=this.token();if(!token)throw new GitHubError('請先在「GitHub 設定」輸入授權 Token。',401,'token_required');
    const response=await this.request('https://api.github.com'+path,{...options,credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(20000),headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28',...(options.body?{'Content-Type':'application/json'}:{})}});
    if(response.ok)return response.status===204?null:response.json();
    if(response.status===429||response.status===403&&(response.headers.get('x-ratelimit-remaining')==='0'||response.headers.get('retry-after'))) {
      this.notBefore=Math.max(Date.now()+60000,Number(response.headers.get('x-ratelimit-reset')||0)*1000,Date.now()+Number(response.headers.get('retry-after')||0)*1000);
      throw new GitHubError('GitHub 暫時限制請求，修改已暫存，稍後會自動重試。',429,'rate_limit');
    }
    throw new GitHubError(response.status===401?'GitHub 授權已失效，請重新輸入 Token。':response.status===403?'GitHub 拒絕寫入，請檢查 Token 的 Contents 權限及儲存庫規則。':response.status===404?'找不到項目或未獲授權，請檢查儲存庫及 Token 的存取範圍。':'GitHub 暫時未能完成同步，修改已暫存。',response.status);
  }
  endpoint(s) {return '/repos/'+s.repo.split('/').map(encodeURIComponent).join('/')+'/contents/'+s.path.split('/').map(encodeURIComponent).join('/');}
  async readFile(s) {const file=await this.call(this.endpoint(s)+'?ref='+encodeURIComponent(s.branch));if(file.encoding!=='base64'||!file.content)throw new GitHubError('項目檔案太大或格式不正確。');return {sha:file.sha,doc:validate(decode(file.content))};}
  remote(s,doc) {return {initialized:true,accountId:'github:'+s.id,role:s.role,project:{id:s.id,name:doc.name},data:doc.data,revision:doc.revision};}
  async read(s) {if(!s)throw new GitHubError('請先建立或加入 GitHub 項目。',401);const {doc}=await this.readFile(s);return this.remote(s,doc);}
  async writeFile(s,doc,sha) {
    const content=encode(doc);if(content.length>950000)throw new GitHubError('項目歷史已接近 GitHub 單檔同步容量，請匯出備份並建立新項目。');
    return this.call(this.endpoint(s),{method:'PUT',body:JSON.stringify({message:'更新樓梯與 Lift 登記',branch:s.branch,content,...(sha?{sha}:{})})});
  }
  async list(repo) {
    projectSession(repo,'main','projects/'+'0'.repeat(32)+'.json');
    const meta=await this.call('/repos/'+repo.split('/').map(encodeURIComponent).join('/'));
    if(!meta.private)throw new GitHubError('請使用私人資料儲存庫。');
    let files;try{files=await this.call('/repos/'+repo.split('/').map(encodeURIComponent).join('/')+'/contents/projects?ref='+encodeURIComponent(meta.default_branch||'main'));}catch(error){if(error.status===404)return [];throw error;}
    if(!Array.isArray(files))throw new GitHubError('項目資料夾格式不正確。');
    const sessions=files.filter(file=>file.type==='file'&&/^projects\/[a-f0-9]{32}\.json$/.test(file.path)).slice(0,50).map(file=>projectSession(repo,meta.default_branch||'main',file.path));
    const result=[];
    for(let i=0;i<sessions.length;i+=5)result.push(...await Promise.all(sessions.slice(i,i+5).map(async session=>({session,name:(await this.read(session)).project.name}))));
    return result;
  }
  async create(repo,name,data) {
    projectSession(repo,'main','projects/'+'0'.repeat(32)+'.json');
    const meta=await this.call('/repos/'+repo.split('/').map(encodeURIComponent).join('/'));
    if(!meta.private)throw new GitHubError('請使用私人資料儲存庫，避免登記資料公開。網頁程式儲存庫請保持獨立。');
    const id=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');
    const s=projectSession(repo,meta.default_branch||'main','projects/'+id+'.json');
    const doc={schemaVersion:3,name:name.trim().slice(0,60),data:snapshotState(normalizeState(data)),revision:1,appliedOperations:[]};
    if(!doc.name)throw new GitHubError('請輸入項目名稱。');validate(doc);await this.writeFile(s,doc);return {session:s,remote:this.remote(s,doc)};
  }
  async apply(s,operations) {
    if(s.role!=='edit')throw new GitHubError('這個連結以唯讀模式開啟，不能修改。',403);
    for(let attempt=0;attempt<4;attempt++) {
      const {doc,sha}=await this.readFile(s);const next=mergeOperations(doc,operations);
      if(next===doc)return this.remote(s,doc);
      try {await this.writeFile(s,next,sha);return this.remote(s,next);} catch(error) {if(error.status!==409&&error.status!==422||attempt===3)throw error;}
    }
  }
}
