import {validItems as valid, normalizeState as normalize, snapshotState as snapshot, applyLocalOperation, nextGeneration, TOWERS as towers} from './register-model.mjs?v=6';
import {GitHubStore, projectSession as githubSession, parseProjectLink, makeProjectLink} from './github-storage.mjs?v=2';
(()=>{
  'use strict';
  const KEY='stair-floor-register:v2';
  let githubToken='';
  const github=new GitHubStore({token:()=>githubToken});
  const LEGACY_KEY='stair-floor-register:v1';
  const $=id=>document.getElementById(id);
  const list=$('stairs');
  const dialog=$('settings-dialog');
  const names={stairs:'樓梯',lifts:'Lift'};
  const categories={'':'未分類',main:'大樓 Lift',platform:'平台 Lift'};
  let editMode=false;
  let towerFilter='all';
  const label=(id,type=mode)=>type==='lifts'?'LT'+id:'ST-'+String(id).padStart(2,'0');
  const fresh=()=>Array.from({length:16},(_,i)=>({id:i+1,f1:false,f2:false}));
  const parse=raw=>{try{return JSON.parse(raw);}catch{return null;}};
  let projectSession=null;
  let activateProjectAfterConnect=false;
  try{projectSession=parse(sessionStorage.getItem('register-github-active-project')||localStorage.getItem('register-github-active-project'));if(projectSession&&!validSession(projectSession))projectSession=null;}catch{}
  if(location.hash.includes('storage=github')){try{projectSession=readProjectLink(location.href);activateProjectAfterConnect=true;history.replaceState(null,'',location.pathname+location.search);}catch{}}
  let state=normalize({stairs:fresh(),lifts:fresh()});
  let storageAvailable=true;
  try{
    const saved=parse(localStorage.getItem(KEY));
    if(saved&&valid(saved.stairs)&&valid(saved.lifts)) state=normalize(saved);
    else{
      const legacy=parse(localStorage.getItem(LEGACY_KEY));
      if(valid(legacy))state=normalize({stairs:legacy,lifts:fresh()});
    }
  }catch{storageAvailable=false;}
  // Preserve the previous provider's cached records and pending edits without contacting it.
  try{if(!projectSession&&!localStorage.getItem('register-github-recovered-v1')){
    const old=parse(sessionStorage.getItem('register-active-project')||localStorage.getItem('register-active-project'));
    const cached=old&&parse(localStorage.getItem('register-cloud-cache:project:'+old.id+':'+old.key));
    if(cached?.data&&valid(cached.data.stairs)&&valid(cached.data.lifts)){
      state=normalize(cached.data);for(const op of cached.pending||[])applyLocalOperation(state,op);
      localStorage.setItem(KEY,JSON.stringify(state));localStorage.setItem('register-github-recovered-v1','yes');
    }
  }}catch{}
  let mode=state.mode;
  const filters={stairs:'all',lifts:'all'};
  let fireOnly=false;
  let editing=null;
  let deleting=null;
  let toastTimer;
  let hold=null;
  let suppressClick=null;
  let ready=false;
  let legacySnapshot=snapshot(state);
  const meaningful=data=>data.stairs.length!==16||data.lifts.length!==16||data.deleted.stairs.length>0||data.deleted.lifts.length>0||[...data.stairs,...data.lifts].some(s=>s.f1||s.f2||s.fire||s.category||s.tower);
  const cloud={accountId:null,authenticated:false,pending:[],busy:false,error:false,loginRequired:false,importAvailable:false,role:projectSession?.role||null,project:null};
  const cacheKey=id=>'register-github-cache:'+id;
  const migratedKey=id=>'register-legacy-imported:'+id;
  try{
    const lastAccount=projectSession?'github:'+projectSession.id:null;
    const cached=lastAccount&&parse(localStorage.getItem(cacheKey(lastAccount)));
    if(cached&&cached.data&&valid(cached.data.stairs)&&valid(cached.data.lifts)&&Array.isArray(cached.pending)){
      cloud.accountId=lastAccount;cloud.pending=cached.pending;state=normalize({...cached.data,mode});
    }
  }catch{}
  let syncTimer;
  const tick='<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m2.5 6 2.3 2.3L9.5 3.7"/></svg>';
  const icons={
    stairs:'<path d="M2 15h4v-4h4V7h4V3h2"/>',
    lifts:'<rect x="3" y="2" width="12" height="14" rx="2"/><path d="M9 2v14M5 7l1-2 1 2m4 4 1 2 1-2"/>'
  };
  const hasWriteAccess=()=>!projectSession||cloud.role==='edit';
  const canEdit=()=>ready&&editMode&&hasWriteAccess();
  function storageNotice(){
    const signed=cloud.authenticated;
    const pending=cloud.pending.length;
    $('save-text').textContent=!ready?'正在連線…':signed&&!cloud.error?(pending?'正在同步…':'已同步到 GitHub'):cloud.accountId?(pending?'已暫存，待同步':'暫時離線'):(storageAvailable?'僅存此裝置':'暫未儲存');
    document.querySelector('.save-dot').style.background=signed&&!cloud.error&&!pending?'#338878':'#b58c42';
    $('sync-panel').dataset.status=cloud.error?'error':'normal';
    $('sync-title').textContent=!ready?'正在連接…':cloud.error?'暫時無法連接 GitHub':cloud.loginRequired&&projectSession?'請設定 GitHub 授權':cloud.project?cloud.project.name+(cloud.role==='view'?' · 唯讀':' · 可編輯'):signed?'舊版帳戶記錄':'GitHub 儲存與同步';
    $('sync-detail').textContent=cloud.project?'記錄存於 GitHub 儲存庫，其他裝置需項目連結及自己的 GitHub 授權。':cloud.error?(cloud.message||'目前記錄已保留，連線後再同步。'):'先設定 GitHub 授權，再建立或加入項目。未連線時可在本機編輯及匯出。';
    $('sign-in').hidden=true;
    $('github-status').textContent=githubToken?'此頁面已設定授權':'尚未設定授權';
    $('project-share').hidden=!projectSession||!cloud.project;
    $('sync-now').hidden=!ready||!cloud.accountId;
    $('sync-now').disabled=cloud.busy;
    $('sync-now').textContent=cloud.busy?'同步中…':'立即同步';
    $('import-note').hidden=!!projectSession||!cloud.importAvailable||!signed;
    $('import-local').disabled=!canEdit();
  }
  function save(){
    state.mode=mode;
    try{
      localStorage.setItem(KEY+':view',mode);
      if(cloud.accountId){localStorage.setItem(cacheKey(cloud.accountId),JSON.stringify({data:snapshot(state),pending:cloud.pending}));if(cloud.authenticated&&!projectSession)localStorage.setItem('register-last-account',cloud.accountId);}
      else{localStorage.setItem(KEY,JSON.stringify(state));legacySnapshot=snapshot(state);}
      storageAvailable=true;
    }catch{storageAvailable=false;}
    storageNotice();
  }
  const newOperation=(type,kind,itemId,fields,generation)=>({opId:Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join(''),type,kind,itemId,generation:generation??state[kind].find(item=>item.id===itemId)?.generation??Math.max(1,...state.deleted[kind].filter(item=>item.id===itemId).map(item=>item.generation)),...(fields?{fields}:{})});
  function enqueue(type,kind,itemId,fields,generation){
    if(cloud.accountId)cloud.pending.push(newOperation(type,kind,itemId,fields,generation));
    save();clearTimeout(syncTimer);syncTimer=setTimeout(synchronize,1200);
  }
  function overlay(data){
    const result=normalize({...data,mode});
    for(const op of cloud.pending)applyLocalOperation(result,op);
    return result;
  }
  async function api(body){
    if(!projectSession){const error=new Error('project_required');error.auth=true;throw error;}
    return body?.action==='operations'?github.apply(projectSession,body.operations):github.read(projectSession);
  }
  function loadAccount(accountId){
    if(cloud.accountId===accountId)return;
    cloud.accountId=accountId;cloud.pending=[];
    try{const cached=parse(localStorage.getItem(cacheKey(accountId)));if(cached&&Array.isArray(cached.pending))cloud.pending=cached.pending;}catch{}
  }
  function markMigrated(){try{localStorage.setItem(migratedKey(cloud.accountId),'yes');}catch{}cloud.importAvailable=false;}
  async function synchronize(){
    if(cloud.busy||document.visibilityState==='hidden')return;
    cloud.busy=true;storageNotice();
    try{
      let remote=await api();
      loadAccount(remote.accountId);cloud.authenticated=true;cloud.loginRequired=false;cloud.role=remote.role||'edit';cloud.project=remote.project||null;
      if(projectSession){projectSession.role=cloud.role;projectSession.name=remote.project?.name||projectSession.name;rememberProject(activateProjectAfterConnect);activateProjectAfterConnect=false;}
      if(cloud.role==='view')editMode=false;
      if(!remote.initialized){remote=await api({action:'bootstrap',data:legacySnapshot});markMigrated();}
      else if(!projectSession){
        let migrated=false;try{migrated=localStorage.getItem(migratedKey(cloud.accountId))==='yes';}catch{}
        cloud.importAvailable=!migrated&&meaningful(legacySnapshot)&&JSON.stringify(legacySnapshot)!==JSON.stringify(remote.data);
        if(!cloud.importAvailable)markMigrated();
      }
      if(cloud.pending.length&&cloud.role==='edit'){
        const batch=cloud.pending.slice(0,24);
        remote=await api({action:'operations',operations:batch});
        const sent=new Set(batch.map(op=>op.opId));cloud.pending=cloud.pending.filter(op=>!sent.has(op.opId));
      }
      if(!remote.data||!valid(remote.data.stairs)||!valid(remote.data.lifts))throw new Error('invalid_sync_data');
      const next=cloud.role==='view'?normalize({...remote.data,mode}):overlay(remote.data);
      const changed=JSON.stringify(snapshot(next))!==JSON.stringify(snapshot(state));
      state=next;cloud.error=false;cloud.message='';ready=true;
      if(changed)render();else update();save();
    }catch(error){
      cloud.error=!error.auth;cloud.message=error.message==='project_required'?'':error.message;
      if(error.message&&error.message!=='project_required')$('github-feedback').textContent=error.message;
      if(error.code==='restore_conflict'&&error.opId){cloud.pending=cloud.pending.filter(op=>op.opId!==error.opId);cloud.error=false;save();toast('此編號已被使用，未有覆蓋現有記錄。');clearTimeout(syncTimer);syncTimer=setTimeout(synchronize,1200);}
      if(error.auth){cloud.authenticated=false;cloud.loginRequired=true;if(projectSession){cloud.role=null;editMode=false;}}
      ready=true;update();storageNotice();
    }finally{
      cloud.busy=false;storageNotice();
      if(cloud.authenticated&&cloud.role==='edit'&&cloud.pending.length&&!cloud.error){clearTimeout(syncTimer);syncTimer=setTimeout(synchronize,250);}
    }
  }
  $('sync-now').addEventListener('click',synchronize);
  $('import-local').addEventListener('click',()=>{
    if(!canEdit())return;
    for(const kind of ['stairs','lifts']){
      for(const old of legacySnapshot[kind]){
        if(state.deleted[kind].some(item=>item.id===old.id))continue;
        if(!state[kind].some(item=>item.id===old.id)){applyLocalOperation(state,{type:'ensure',kind,itemId:old.id});cloud.pending.push(newOperation('ensure',kind,old.id));}
        const current=state[kind].find(item=>item.id===old.id);const fields={};
        for(const key of ['f1','f2',...(kind==='lifts'?['fire']:[])])if(old[key]&&!current[key])fields[key]=true;
        if(kind==='lifts'&&old.category&&!current.category)fields.category=old.category;
        if(old.tower&&!current.tower)fields.tower=old.tower;
        if(Object.keys(fields).length){Object.assign(current,fields);cloud.pending.push(newOperation('patch',kind,old.id,fields));}
      }
    }
    markMigrated();render();save();synchronize();
  });
  function toast(message){
    $('toast').textContent=message;$('toast').classList.add('show');
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),1800);
  }
  function matches(item,filter=filters[mode]){
    if(towerFilter!=='all'&&item.tower!==towerFilter)return false;
    if(mode==='stairs')return true;
    return (filter==='all'||item.category===filter)&&(!fireOnly||item.fire);
  }
  function update(){
    const items=state[mode];
    $('total').textContent=items.length;
    $('total-label').textContent=names[mode]+'總數';
    for(const f of [1,2])$('count-'+f).textContent=items.filter(s=>s['f'+f]).length;
    for(const type of ['stairs','lifts'])$(type+'-total').textContent=state[type].length;
    $('next').textContent=label(state.nextIds[mode]);
    $('add-label').textContent='新增'+(mode==='lifts'?' Lift':'樓梯');
    $('list-title').textContent=names[mode]+'清單';
    list.setAttribute('aria-label',names[mode]+'清單');
    $('settings-hint').hidden=!canEdit();
    $('settings-hint').textContent='點擊或長按編號，可設定座別'+(mode==='lifts'?'、分類及消防梯標記。':'。');
    $('filters').hidden=mode!=='lifts';
    document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
    document.querySelectorAll('.mode').forEach(button=>button.disabled=!ready);
    document.querySelectorAll('.floor,.number[data-settings],#add').forEach(button=>button.disabled=!canEdit());
    $('add').disabled=!canEdit()||state.nextIds[mode]>2000;
    $('edit-toggle').disabled=!ready||!hasWriteAccess();
    $('edit-toggle').textContent=editMode?'完成編輯':hasWriteAccess()?'編輯':'唯讀';
    $('edit-toggle').setAttribute('aria-pressed',String(editMode));
    $('edit-hint').textContent=editMode?'編輯模式 · 修改會自動儲存，完成後按「完成編輯」。':hasWriteAccess()?'瀏覽模式 · 按「編輯」才可修改樓層、座別及分類。':'唯讀連結 · 可查看和篩選，修改需要可編輯連結。';
    document.body.dataset.editing=String(editMode);
    $('import-local').disabled=!canEdit();
  }
  function renderFilters(){
    if(mode==='stairs'){$('filters').replaceChildren();return;}
    const options=[['all','全部'],['main','大樓 Lift'],['platform','平台 Lift'],['','未分類']];
    $('filters').innerHTML=options.map(([value,text])=>'<button type="button" class="filter" data-filter="'+value+'" aria-pressed="'+(filters[mode]===value)+'">'+text+'<span>'+state[mode].filter(item=>matches(item,value)).length+'</span></button>').join('')+'<button type="button" class="filter" data-fire-filter aria-pressed="'+fireOnly+'">僅消防梯<span>'+state.lifts.filter(item=>item.fire).length+'</span></button>';
  }
  function row(item){
    const el=document.createElement('article');el.className='stair';el.id=mode+'-'+item.id;
    const name=label(item.id);
    const icon='<svg class="small-stair" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[mode]+'</svg>';
    const badge='<span class="badge tower">'+(item.tower||'未設定座別')+'</span>'+(mode==='lifts'?'<span class="badge'+(item.category?' categorized':'')+'">'+categories[item.category]+'</span>'+(item.fire?'<span class="badge fire">消防梯</span>':''):'');
    const identity='<button type="button" class="number" data-settings="'+item.id+'" aria-label="'+name+' 設定" aria-haspopup="dialog">'+icon+name+'</button><div class="badges">'+badge+'</div>';

    el.innerHTML='<div class="identity">'+identity+'</div><div class="floors">'+[1,2].map(f=>'<button type="button" class="floor" data-id="'+item.id+'" data-floor="'+f+'" aria-label="'+name+' 通 '+f+'/F" aria-pressed="'+item['f'+f]+'"><span class="check" aria-hidden="true">'+tick+'</span>通 '+f+'/F</button>').join('')+'</div>';
    return el;
  }
  function render(){
    update();renderFilters();
    const items=state[mode].filter(item=>matches(item));
    list.replaceChildren(...items.map(row));
    document.querySelectorAll('.floor,.number[data-settings]').forEach(button=>button.disabled=!canEdit());
    if($('trash-dialog').open)renderTrash();
    if(dialog.open&&editing&&!state[editing.mode].some(item=>item.id===editing.id&&item.generation===editing.generation)){dialog.close();toast('此記錄已在其他裝置刪除。');}
    if(!items.length){const empty=document.createElement('p');empty.className='empty';empty.textContent='沒有符合座別及分類的記錄。';list.append(empty);}
  }
  function openSettings(id){
    if(dialog.open||!canEdit())return;
    const item=state[mode].find(s=>s.id===id);if(!item)return;
    editing={id,mode,generation:item.generation,original:{fire:item.fire,category:item.category,tower:item.tower}};
    $('dialog-title').textContent=label(id)+' 設定';
    $('dialog-note').textContent=mode==='lifts'?'設定座別、Lift 分類及消防梯標記。':'設定這座樓梯所在的座別。';
    $('category-settings').hidden=mode!=='lifts';$('lift-settings').hidden=mode!=='lifts';
    for(const input of document.querySelectorAll('input[name="tower"]'))input.checked=input.value===item.tower;
    for(const input of document.querySelectorAll('input[name="category"]'))input.checked=input.value===item.category;
    $('fire-lift').checked=item.fire;
    dialog.showModal();
  }
  function cancelHold(){if(hold)clearTimeout(hold.timer);hold=null;}
  list.addEventListener('pointerdown',event=>{
    const button=event.target.closest('[data-settings]');
    if(!canEdit()||!button||event.button!==0||event.isPrimary===false)return;
    cancelHold();
    const id=Number(button.dataset.settings);
    hold={id,mode,x:event.clientX,y:event.clientY,timer:setTimeout(()=>{
      suppressClick={id,mode,until:performance.now()+1600};
      hold=null;openSettings(id);
    },550)};
  });
  window.addEventListener('pointermove',event=>{if(hold&&Math.hypot(event.clientX-hold.x,event.clientY-hold.y)>10)cancelHold();},{passive:true});
  for(const event of ['pointerup','pointercancel','blur','scroll'])window.addEventListener(event,cancelHold,{passive:true});
  list.addEventListener('contextmenu',event=>{
    const button=event.target.closest('[data-settings]');if(!button||!canEdit())return;
    event.preventDefault();cancelHold();openSettings(Number(button.dataset.settings));
  });
  list.addEventListener('click',event=>{
    if(!canEdit())return;
    const floor=event.target.closest('[data-floor]');
    if(floor){const item=state[mode].find(s=>s.id===Number(floor.dataset.id));const key='f'+floor.dataset.floor;item[key]=!item[key];floor.setAttribute('aria-pressed',String(item[key]));update();enqueue('patch',mode,item.id,{[key]:item[key]});return;}
    const button=event.target.closest('[data-settings]');if(!button||!canEdit())return;
    const id=Number(button.dataset.settings);
    if(suppressClick&&suppressClick.id===id&&suppressClick.mode===mode&&performance.now()<suppressClick.until){suppressClick=null;return;}
    openSettings(id);
  });
  document.querySelector('.mode-switch').addEventListener('click',event=>{
    const button=event.target.closest('[data-mode]');if(!button||button.dataset.mode===mode)return;
    cancelHold();mode=button.dataset.mode;render();save();
  });
  $('filters').addEventListener('click',event=>{
    const fireButton=event.target.closest('[data-fire-filter]');
    if(fireButton){fireOnly=!fireOnly;render();$('filters').querySelector('[data-fire-filter]').focus({preventScroll:true});return;}
    const button=event.target.closest('[data-filter]');if(!button)return;filters[mode]=button.dataset.filter;render();$('filters').querySelector('[data-filter][aria-pressed="true"]').focus({preventScroll:true});
  });
  $('add').addEventListener('click',()=>{
    if(!canEdit())return;
    const itemId=state.nextIds[mode];if(itemId>2000)return;
    applyLocalOperation(state,{type:'ensure',kind:mode,itemId,generation:nextGeneration(state,mode,itemId)});
    filters[mode]='all';fireOnly=false;towerFilter='all';$('tower-filter').value='all';render();enqueue('ensure',mode,itemId);
    const el=$(mode+'-'+itemId);el.classList.add('new');toast('已新增 '+label(itemId));
    el.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});
  });
  for(const id of ['close-dialog','cancel-dialog'])$(id).addEventListener('click',()=>dialog.close());
  $('settings-form').addEventListener('submit',event=>{
    event.preventDefault();if(!editing||!canEdit())return;
    const item=state[editing.mode].find(s=>s.id===editing.id&&s.generation===editing.generation);if(!item){dialog.close();return;}
    const fields={};const selected={tower:document.querySelector('input[name="tower"]:checked')?.value||'',...(editing.mode==='lifts'?{fire:$('fire-lift').checked,category:document.querySelector('input[name="category"]:checked')?.value||''}:{})};
    for(const key of Object.keys(selected))if(selected[key]!==editing.original[key])fields[key]=selected[key];
    Object.assign(item,fields);
    if(Object.keys(fields).length)enqueue('patch',editing.mode,item.id,fields);
    render();dialog.close();toast('已儲存 '+label(editing.id,editing.mode)+' 設定');
  });
  dialog.addEventListener('close',()=>{
    if(editing&&editing.mode===mode){const button=list.querySelector('[data-settings="'+editing.id+'"]');if(button)button.focus({preventScroll:true});else $('edit-toggle').focus({preventScroll:true});}
    editing=null;
  });
  $('edit-toggle').addEventListener('click',()=>{if(!ready||!hasWriteAccess())return;editMode=!editMode;cancelHold();if(dialog.open)dialog.close();render();storageNotice();});
  $('tower-filter').addEventListener('change',()=>{towerFilter=$('tower-filter').value;render();});
  $('clear-tower').addEventListener('click',()=>{for(const input of document.querySelectorAll('input[name="tower"]'))input.checked=false;});
  $('delete-item').addEventListener('click',()=>{
    if(!editing||!canEdit())return;
    deleting={kind:editing.mode,id:editing.id,generation:editing.generation};
    $('delete-title').textContent='刪除 '+label(deleting.id,deleting.kind)+'？';
    $('delete-description').textContent='記錄會移至「已刪除」，其他裝置也會同步。可隨時從「已刪除」恢復原有記錄。';
    dialog.close();$('delete-dialog').showModal();
  });
  $('confirm-delete').addEventListener('click',()=>{
    if(!deleting||!canEdit())return;
    const {kind,id,generation}=deleting;
    if(!state[kind].some(item=>item.id===id&&item.generation===generation)){$('delete-dialog').close();deleting=null;toast('記錄已更新，請重新選擇。');return;}
    applyLocalOperation(state,{type:'delete',kind,itemId:id,generation});
    enqueue('delete',kind,id,undefined,generation);$('delete-dialog').close();deleting=null;render();toast('已刪除 '+label(id,kind));
  });
  function renderTrash(){
    $('trash-note').textContent=canEdit()?'編號未被使用時，可按「恢復」還原舊記錄；不會覆蓋現有記錄。':'關閉此視窗並開啟編輯模式後，即可恢復記錄。';
    const container=$('trash-list');container.replaceChildren();
    for(const kind of ['stairs','lifts'])for(const item of state.deleted[kind]){
      const row=document.createElement('div');row.className='trash-row';
      const description=document.createElement('div');const strong=document.createElement('strong');strong.textContent=label(item.id,kind)+' · 舊記錄 #'+item.generation;description.append(strong);
      const detail=document.createElement('small');detail.textContent=(item.tower||'未設定座別')+(kind==='lifts'?' · '+categories[item.category]+(item.fire?' · 消防梯':''):'');description.append(detail);
      const button=document.createElement('button');button.type='button';const occupied=state[kind].some(current=>current.id===item.id);button.textContent=occupied?'編號已使用':'恢復';button.dataset.restoreKind=kind;button.dataset.restoreId=item.id;button.dataset.restoreGeneration=item.generation;button.disabled=!canEdit()||occupied;button.setAttribute('aria-label',(occupied?'編號已使用：':'恢復 ')+label(item.id,kind)+' 舊記錄 '+item.generation);
      row.append(description,button);container.append(row);
    }
    if(!container.childElementCount){const empty=document.createElement('p');empty.className='trash-empty';empty.textContent='沒有已刪除的記錄。';container.append(empty);}
  }
  $('open-trash').addEventListener('click',()=>{renderTrash();$('trash-dialog').showModal();});
  $('trash-list').addEventListener('click',event=>{
    const button=event.target.closest('[data-restore-id]');if(!button||!canEdit())return;
    const kind=button.dataset.restoreKind,id=Number(button.dataset.restoreId),generation=Number(button.dataset.restoreGeneration);
    if(state[kind].some(item=>item.id===id))return;
    applyLocalOperation(state,{type:'restore',kind,itemId:id,generation});enqueue('restore',kind,id,undefined,generation);render();toast('已恢復 '+label(id,kind));
  });
  window.addEventListener('storage',event=>{
    if(cloud.accountId){if(event.key===cacheKey(cloud.accountId)){const cached=parse(event.newValue);if(cached&&Array.isArray(cached.pending)){const ids=new Set(cloud.pending.map(op=>op.opId));for(const op of cached.pending)if(!ids.has(op.opId))cloud.pending.push(op);}synchronize();}return;}
    if(event.key!==KEY||!event.newValue)return;
    const incoming=parse(event.newValue);if(!incoming||!valid(incoming.stairs)||!valid(incoming.lifts))return;
    state=normalize(incoming);legacySnapshot=snapshot(state);render();storageAvailable=true;storageNotice();
  });
  function validSession(value){try{return value?.provider==='github'&&githubSession(value.repo,value.branch,value.path,value.role).id===value.id;}catch{return false;}}
  function readProjectLink(value){return parseProjectLink(value);}
  function storedProjects(){try{return parse(localStorage.getItem('register-github-project-sessions'))||{};}catch{return {};}}
  function rememberProject(makeActive=false){
    if(!projectSession||!cloud.project)return;
    try{const saved=storedProjects();saved[projectSession.id+':'+cloud.role]={...projectSession,name:cloud.project.name,role:cloud.role};localStorage.setItem('register-github-project-sessions',JSON.stringify(saved));sessionStorage.setItem('register-github-active-project',JSON.stringify(projectSession));if(makeActive||!localStorage.getItem('register-github-active-project'))localStorage.setItem('register-github-active-project',JSON.stringify(projectSession));}catch{storageAvailable=false;}
  }
  function refreshProjectList(){
    const select=$('saved-projects');select.replaceChildren(new Option('選擇項目…',''));
    for(const [key,session] of Object.entries(storedProjects()))if(validSession(session))select.append(new Option((session.name||'未命名項目')+(session.role==='view'?' · 唯讀':' · 可編輯'),key));
    $('saved-projects-wrap').hidden=select.options.length<2;
  }
  function adoptProject(session,remote){
    save();projectSession={...session,role:remote.role,name:remote.project.name};
    cloud.accountId=null;cloud.pending=[];cloud.project=remote.project;cloud.role=remote.role;cloud.authenticated=true;cloud.error=false;cloud.loginRequired=false;cloud.importAvailable=false;
    loadAccount(remote.accountId);state=cloud.role==='view'?normalize({...remote.data,mode}):overlay(remote.data);
    ready=true;editMode=false;towerFilter='all';filters.stairs='all';filters.lifts='all';fireOnly=false;$('tower-filter').value='all';
    rememberProject(true);render();save();$('project-dialog').close();toast('已開啟 '+remote.project.name);
  }
  async function projectAction(work){
    if(cloud.busy){$('project-error').textContent='正在同步，請稍後再試。';return;}
    if(cloud.pending.length){$('project-error').textContent='還有修改待同步，請先完成同步後再切換項目。';return;}
    cloud.busy=true;$('project-error').textContent='';$('project-dialog').querySelectorAll('button[type="submit"],#open-saved-project').forEach(b=>b.disabled=true);
    try{await work();}catch(error){$('project-error').textContent=error.message==='invalid_backup'?'備份格式不正確，請選擇由本工具匯出的 JSON。':error.message||'未能開啟項目，請檢查 GitHub 授權及網絡後再試。';}
    finally{cloud.busy=false;$('project-dialog').querySelectorAll('button[type="submit"],#open-saved-project').forEach(b=>b.disabled=false);storageNotice();}
  }
  async function openProject(session){
    const remote=await github.read(session);adoptProject(session,remote);
  }
  $('github-settings').addEventListener('click',()=>{$('github-feedback').textContent='';$('github-token').value='';$('github-dialog').showModal();});
  $('github-form').addEventListener('submit',event=>{
    event.preventDefault();const value=$('github-token').value.trim();if(value)githubToken=value;
    $('github-token').value='';$('github-dialog').close();storageNotice();synchronize();
  });
  $('github-disconnect').addEventListener('click',()=>{githubToken='';$('github-token').value='';cloud.authenticated=false;cloud.loginRequired=true;$('github-feedback').textContent='已清除此頁面的授權，未同步修改仍保留在本機。';storageNotice();});
  let githubProjects=[];
  $('load-github-projects').addEventListener('click',()=>projectAction(async()=>{
    githubProjects=await github.list($('github-repo').value.trim());
    $('github-project-list').replaceChildren(...githubProjects.map((item,index)=>new Option(item.name,String(index))));
    $('github-projects-wrap').hidden=!githubProjects.length;
    if(!githubProjects.length)$('project-error').textContent='這個儲存庫尚未有項目，可在上方建立。';
  }));
  $('open-github-project').addEventListener('click',()=>{const item=githubProjects[Number($('github-project-list').value)];if(item)projectAction(()=>openProject(item.session));});
  $('project-manage').addEventListener('click',()=>{$('project-error').textContent='';refreshProjectList();$('project-dialog').showModal();});
  for(const button of document.querySelectorAll('[data-close]'))button.addEventListener('click',()=>$(button.dataset.close).close());
  $('create-project-form').addEventListener('submit',event=>{
    event.preventDefault();projectAction(async()=>{
      let data=$('project-seed').checked?snapshot(state):snapshot(normalize({stairs:fresh(),lifts:fresh()}));
      const file=$('project-backup').files[0];
      if(file){if(file.size>1000000)throw new Error('invalid_backup');const backup=parse(await file.text());const value=backup?.data||backup;if(!value||!valid(value.stairs)||!valid(value.lifts))throw new Error('invalid_backup');data=snapshot(normalize(value));}
      const repo=$('github-repo').value.trim();
      const created=await github.create(repo,$('project-name').value,data);adoptProject(created.session,created.remote);
    });
  });
  $('join-project-form').addEventListener('submit',event=>{event.preventDefault();projectAction(()=>openProject(readProjectLink($('project-link').value)));});
  $('open-saved-project').addEventListener('click',()=>{const session=storedProjects()[$('saved-projects').value];if(session)projectAction(()=>openProject(session));});
  function shareLink(role){return makeProjectLink(projectSession,role,location.href);}
  $('project-share').addEventListener('click',()=>{
    if(!projectSession||!cloud.project)return;
    $('share-title').textContent='分享：'+cloud.project.name;$('copy-edit').hidden=cloud.role!=='edit';$('share-feedback').textContent='';$('manual-share').hidden=true;$('manual-share').value='';$('share-dialog').showModal();
  });
  for(const role of ['view','edit'])$('copy-'+role).addEventListener('click',async()=>{
    if(role==='edit'&&cloud.role!=='edit')return;
    const link=shareLink(role);
    try{await navigator.clipboard.writeText(link);$('share-feedback').textContent='已複製'+(role==='edit'?'編輯':'唯讀')+'連結。';}
    catch{$('manual-share').value=link;$('manual-share').hidden=false;$('manual-share').select();$('share-feedback').textContent='請複製下方連結。';}
  });
  $('export-data').addEventListener('click',()=>{
    const value={schemaVersion:3,name:cloud.project?.name||'樓梯及 Lift 記錄',exportedAt:new Date().toISOString(),data:snapshot(state)};
    const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const anchor=document.createElement('a');anchor.href=url;anchor.download='stair-lift-register.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });

  try{const savedMode=localStorage.getItem(KEY+':view');if(['stairs','lifts'].includes(savedMode))mode=savedMode;}catch{}
  render();storageNotice();synchronize();
  setInterval(()=>{if(navigator.onLine&&githubToken)synchronize();},30000);
  window.addEventListener('online',synchronize);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')synchronize();});
})();
