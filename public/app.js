'use strict';
const $=s=>document.querySelector(s);
const node=(tag,text,klass)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(klass)e.className=klass;return e;};
let items=[],revision='',busy=false,organization=null;
const googleCallback=new URLSearchParams(window.location.search).get('google');
const money=v=>typeof v==='number'?v.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}):'Unavailable';
const num=v=>typeof v==='number'?v.toLocaleString('en-US',{maximumFractionDigits:2}):'Unavailable';
const dateTime=v=>v?new Date(v).toLocaleString('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'})+' ET':'Never';
const calendarResponse=e=>({needsAction:'Invitation needs your response',accepted:'You accepted',tentative:'You responded tentative',declined:'You declined'}[e.responseStatus] || 'Your response is not recorded');
async function api(url,opts={}) {
  const r=await fetch(url,{...opts,headers:{'Content-Type':'application/json',...opts.headers}});
  if(r.status===401)throw Error('Owner authentication required. Reload and sign in.');
  const d=await r.json();if(!r.ok)throw Error(d.error||`HTTP ${r.status}`);
  if(url==='/api/workboard' && !opts.method)revision=r.headers.get('etag');return d;
}
function link(text,href) {const a=node('a',text);try{const u=new URL(href);if(u.protocol!=='https:')return node('span',text);a.href=u.href;}catch{return node('span',text);}a.target='_blank';a.rel='noopener noreferrer';return a;}
function show(k) {document.querySelectorAll('main section').forEach(s=>s.hidden=s.id!==k);document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('selected',x.dataset.view===k));}
document.addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b)show(b.dataset.view);});
function row(title,subtitle,status,source) {const e=node('div',undefined,'row'),left=node('div');left.append(node('strong',title),node('p',subtitle));if(source?.url)left.append(link('Source ↗',source.url));e.append(left,node('span',status||'','tag'));return e;}
function empty(el,text) {$(el).replaceChildren(node('p',text,'muted small'));}
function paintWork() {
  const area=$('#worklist');area.replaceChildren();
  for(const it of items){const el=node('div',undefined,'entry'+(it.status==='DONE'?' done':'')),left=node('div');left.append(node('strong',it.title),node('small',`${it.entity} · ${it.type} · ${it.status}`));const controls=node('div',undefined,'controls');
    const change=node('button',it.status==='DONE'?'Reopen':it.status==='OPEN'?'Start':'Complete');
    change.onclick=async()=>{change.disabled=true;try{const status=it.status==='DONE'?'OPEN':it.status==='OPEN'?'IN_PROGRESS':'DONE';await api('/api/workboard/'+it.id,{method:'PATCH',headers:{'If-Match':revision},body:JSON.stringify({status})});await loadWork();}catch(e){alert(e.message);await loadWork().catch(()=>{});}finally{change.disabled=false;}};
    const del=node('button','Remove','remove');del.onclick=async()=>{if(!confirm('Remove this provisional work item? A recovery backup will be retained.'))return;try{await api('/api/workboard/'+it.id,{method:'DELETE',headers:{'If-Match':revision}});await loadWork();}catch(e){alert(e.message);await loadWork().catch(()=>{});}};
    controls.append(change,del);el.append(left,controls);area.append(el);
  }
  if(!items.length)area.append(node('p','No provisional work items yet.','muted'));
  $('#active').textContent=items.filter(i=>i.status!=='DONE').length;
  const preview=$('#preview');preview.replaceChildren(...items.filter(i=>i.status!=='DONE').slice(0,3).map(i=>row(i.title,i.entity,i.status)));
  if(!preview.childElementCount)preview.append(node('p','Nothing requiring attention in the provisional workboard.','muted small'));
}
async function loadWork(){items=(await api('/api/workboard')).items;paintWork();}
$('#create').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target),button=e.target.querySelector('button');button.disabled=true;try{await api('/api/workboard',{method:'POST',headers:{'If-Match':revision},body:JSON.stringify(Object.fromEntries(f.entries()))});e.target.reset();await loadWork();}catch(error){alert(error.message);await loadWork().catch(()=>{});}finally{button.disabled=false;}});
$('#backup').onclick=async()=>{try{const backup=await api('/api/workboard/backup',{method:'POST',body:'{}'});const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:'application/json'}));const a=node('a');a.href=url;a.download=`${organization.id}-workboard-${backup.createdAt.slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('#backupstatus').textContent=`Backup exported ${dateTime(backup.createdAt)} · checksum ${backup.checksum.slice(0,12)}`;}catch(e){$('#backupstatus').textContent=e.message;}};
function label(s) {return `${s.status}${s.data && s.status!=='connected'?' · LAST KNOWN':''}${s.periodStale?' · PERIOD STALE':''}`;}
function metricRow(m,state) {return row(m.label,`${num(m.value)} · ${m.sourceStatus}`,`${m.quality} · ${state}`,m.source);}
function paintExecutive({sources,briefing,cacheWarning}) {
  const f=sources.financial,r=sources.registry;
  $('#health').textContent=`${organization.mode==='hosted'?'Hosted':'Development'} service · ${Object.values(sources).filter(s=>s.status==='connected').length} connected sources`;
  $('#basis').textContent=`Registry: ${label(r)} · last successful read ${dateTime(r.lastSuccessAt)}. Financials: ${label(f)} · last successful read ${dateTime(f.lastSuccessAt)}.${cacheWarning?' '+cacheWarning:''}`;
  const weekly=f.data?.weekly;
  $('#sales').textContent=weekly?money(weekly.netSales.value):'—';$('#covers').textContent=weekly?num(weekly.covers.value):'—';
  $('#salesbasis').textContent=weekly?`Week ending ${weekly.weekEnding} · ${weekly.netSales.sourceStatus} · ${label(f)}`:'Financial connection unavailable';
  $('#coverdetail').textContent=weekly?`${money(weekly.salesPerCover.value)} net per cover · ${label(f)}`:'No current source values';
  const atlas=r.data?.portfolio.find(p=>p.entity_id==='ENT-0102');
  $('#gap').textContent=atlas?money(atlas.capital_need):'—';$('#capitalbasis').textContent=atlas?`${atlas.major_blocker || 'Registry working estimate'} · ${label(r)}`:'Registry unavailable';
  $('#briefing').replaceChildren(...[...briefing.summary,...briefing.warnings].map(t=>node('p',t,'small')));
  $('#ranking').textContent=briefing.rankingNote || 'Registry unavailable';
  const attentionRow=a=>row(a.title,`${a.entityName} · ${a.owner} · ${a.reasons.map(x=>x.text).join(' · ')}`,`${a.status} · ${a.sourceState}`,a.source);
  $('#attention').replaceChildren(...briefing.attention.slice(0,12).map(attentionRow));
  if(briefing.attention.length>12){const more=node('details');more.append(node('summary',`${briefing.attention.length-12} more source items`),...briefing.attention.slice(12).map(attentionRow));$('#attention').append(more);}
  if(!briefing.attention.length)empty('#attention','No current Registry attention is available.');
  $('#decisions').replaceChildren(...briefing.decisions.map(d=>row(d.decision,`${d.entityName} · ${d.owner} · ${d.decision_date || 'Date not recorded'}`,`${d.status} · ${label(r)}`,d.source)));
  if(!briefing.decisions.length)empty('#decisions','No recorded decision context available.');
  $('#portfolio').replaceChildren(...briefing.portfolio.map(p=>{const v=row(p.entityName,`${p.current_priority} · Next: ${p.next_milestone || p.next_gate || 'Not recorded'}${p.major_blocker?' · Blocked: '+p.major_blocker:''}`,`${p.project?.stage || p.portfolio_status} · ${label(r)}`,p.source);if(p.document?.drive_url)v.firstChild.append(node('p'),link('Development / authoritative record ↗',p.document.drive_url));return v;}));
  if(!briefing.portfolio.length)empty('#portfolio','Portfolio connection unavailable.');
  const changes=Object.values(sources).flatMap(s=>(s.changes?.items || []).map(c=>row(c.title,`Observed ${dateTime(s.changes.observedAt)} · ${s.id}`,`${c.kind} · ${label(s)}`,c.source)));
  $('#changes').replaceChildren(...changes);
  if(!changes.length)empty('#changes',Object.values(sources).some(s=>s.data)?'No changes observed since the retained baseline. The first read establishes a baseline.':'Awaiting a successful authenticated baseline.');
  const cal=sources.calendar;$('#calendar').replaceChildren(...(cal.data?.events || []).slice(0,8).map(e=>row(e.title,`${e.allDay?e.start+' · all day':dateTime(e.start)}${e.location?' · '+e.location:''} · ${calendarResponse(e)}`,`${e.status || 'Commitment'} · ${label(cal)}`,e.source)));
  if(!$('#calendar').childElementCount)empty('#calendar',cal.status==='connected'?'No commitments in the next 30 days.':`Calendar ${cal.status}. Historical events are in the preserved snapshot.`);
  if(cal.data?.moreAvailable)$('#calendar').append(node('p','More events are available in the source calendar.','muted small'));
  const mail=sources.gmail;$('#correspondence').replaceChildren(...(mail.data?.threads || []).slice(0,8).map(t=>row(t.title,`${t.from} · ${dateTime(t.receivedAt)} · Candidate for owner review`,label(mail),t.source)));
  if(!$('#correspondence').childElementCount)empty('#correspondence',mail.status==='connected'?'No threads match the configured executive query.':`Gmail ${mail.status}. No follow-ups inferred from unavailable mail.`);
  if(mail.data?.moreAvailable)$('#correspondence').append(node('p','Additional matching correspondence is available in Gmail.','muted small'));
  const performance=$('#performance');performance.replaceChildren();
  if(weekly){performance.append(...[weekly.wages,weekly.wagesRatio,weekly.loadedLabor,weekly.foodPurchases,weekly.foodPurchaseRatio].filter(Boolean).map(m=>metricRow(m,label(f))));
    for(const t of f.data.trends)performance.append(row(`${t.label} trend`,`${t.changeRatio===null?'Unavailable':(t.changeRatio*100).toFixed(1)+'%'} versus prior four weeks · ${t.reading || 'Incomplete'}`,`${t.quality} · ${label(f)}`,t.source));
    performance.append(node('h3','Monthly results'),node('p',`Available through ${f.monthlyDataThrough?.slice(0,7) || 'unknown'}${f.monthlyPeriodStale?' · STALE ACCOUNTING PERIOD':''}. Missing months remain unavailable.`,'muted small'));
    for(const m of f.data.monthly.filter(m=>m.metrics['Net sales'].value!==null))performance.append(row(m.month.slice(0,7),`${money(m.metrics['Net sales'].value)} net sales · budget variance ${money(m.metrics['Net sales vs budget'].value)} · labor ${num(m.metrics['Total labor / net sales'].value===null?null:m.metrics['Total labor / net sales'].value*100)}% · food COGS ${num(m.metrics['Food COGS / food sales'].value===null?null:m.metrics['Food COGS / food sales'].value*100)}%`,`${m.closeStatus} · ${label(f)}`,m.metrics['Net sales'].source));
    for(const c of f.data.checks)performance.append(row(c.label,c.detail,'Source check',c.source));
    if(f.data.reconciliation)performance.append(row('Toast reconciliation',`${f.data.reconciliation.weekEnding} · ${f.data.reconciliation.message}`,f.data.reconciliation.result,f.data.reconciliation.source));
    performance.append(...f.data.limitations.map(x=>node('p',x,'muted small')));
  }else performance.append(node('p','Financial source unavailable. No missing costs are treated as zero.','muted small'));
}
async function loadSources(){
  const result=await api('/api/sources');
  const connection=result.googleConnection,panel=$('#googleconnect');panel.replaceChildren(node('strong','Connect your executive Google account'));
  if(googleCallback && googleCallback!=='linked')panel.append(node('p','Google connection did not complete. Check the message below or connect again.'));
  panel.append(node('p',connection.expectedEmail || 'Set the executive Google email in hosting configuration.'));
  panel.append(node('p','Gmail reads matching correspondence; Calendar reads upcoming events. Each connection asks for read-only access and verifies the selected account.','small'));
  if(connection.setupRequired.length)panel.append(node('p','Hosting setup required: '+connection.setupRequired.join(', '),'small'));
  if(connection.storageError)panel.append(node('p',connection.storageError));
  for(const [id,s] of Object.entries(connection.sources)) {
    const title=id==='gmail'?'Gmail':'Calendar',line=node('div',undefined,'source'),left=node('div');
    left.append(node('strong',title),node('p',s.linked?`${s.email} · read verified ${dateTime(s.testedAt)} · automatic refresh ${result.integrations[id].enabled?'enabled':'disabled'}`:s.scopeConfigured?'Not linked in this application.':'Choose the correspondence query or calendar in hosting configuration.'));
    if(s.error)left.append(node('p',s.error));
    const button=node('button',s.linked?'Reconnect '+title:'Connect '+title,'subtle');button.disabled=!s.canConnect;
    button.onclick=async()=>{button.disabled=true;try{const f=await api('/api/google/connect',{method:'POST',body:JSON.stringify({source:id})});window.location.assign(f.url);}catch(e){left.append(node('p',e.message));button.disabled=false;}};
    line.append(left,button);panel.append(line);
  }
  $('#sourcelist').replaceChildren(...result.sources.map(s=>{const v=node('div',undefined,'source'),left=node('div');left.append(node('strong',s.title),node('p',s.status));v.append(left);if(s.url)v.append(link('Open ↗',s.url));return v;}));
  for(const [id,s] of Object.entries(result.integrations)){
    const v=node('div',undefined,'source'),left=node('div');left.append(node('strong',`${id} · ${label(s)}`),node('p',`Server credentials: ${s.configured?'configured':'missing'} · last success ${dateTime(s.lastSuccessAt)} · source modified ${dateTime(s.sourceModifiedAt)}`));if(s.error)left.append(node('p',`${s.error.code}: ${s.error.message}`));
    const button=node('button','Test read','subtle');button.disabled=!s.configured;button.onclick=async()=>{button.disabled=true;try{const t=await api(`/api/integrations/${id}/test`,{method:'POST',body:'{}'});left.append(node('p',`Authenticated read passed ${dateTime(t.testedAt)} · ${t.contractVersion}. Synchronization ${t.enabled?'enabled':'still disabled'}.`));}catch(e){left.append(node('p',e.message));}finally{button.disabled=false;}};v.append(left,button);$('#sourcelist').append(v);
  }
  $('#archive').hidden=!result.snapshot;
  if(result.snapshot)$('#archivedata').replaceChildren(row('Bayberry historical week',`${money(result.snapshot.bayberry.sales)} · ${result.snapshot.bayberry.covers} covers · week ending ${result.snapshot.bayberry.weekEnding}`,'ARCHIVED / provisional'),row('ATLAS historical gap',money(result.snapshot.atlas.gap),'ARCHIVED / estimate'),...(result.snapshot.calendar || []).map(e=>row(e.title,dateTime(e.start),'ARCHIVED event',e)),...(result.snapshot.attention || []).map(a=>row(a.title,a.entity,'ARCHIVED / '+a.status)));
}
async function update(){if(busy)return;busy=true;try{paintExecutive(await api('/api/executive'));await loadSources();}catch(e){$('#health').textContent='Connection to application unavailable';$('#basis').textContent=`Displayed values are not current: ${e.message}`;for(const id of ['salesbasis','coverdetail','capitalbasis'])$('#'+id).textContent='STALE — application connection failed';document.querySelectorAll('#home .tag').forEach(e=>{if(!e.textContent.includes('APPLICATION UNAVAILABLE'))e.textContent+=' · STALE / APPLICATION UNAVAILABLE';});}finally{busy=false;}}
$('#refresh').onclick=async()=>{const b=$('#refresh');b.disabled=true;try{paintExecutive(await api('/api/refresh',{method:'POST',body:'{}'}));await loadSources();}catch(e){$('#basis').textContent=e.message;}finally{b.disabled=false;}};
(async()=>{try{
  if(window.location.hash==='#sources')show('sources');
  if(googleCallback)history.replaceState(null,'','/#sources');
  const st=await api('/api/status');organization={...st.organization,mode:st.mode};
  $('#orgname').replaceChildren(node('span',st.organization.name,'org-title'));$('#environment').textContent=`Executive Home · ${st.provider}`;
  if(st.organization.id!=='circle'){const select=$('#entityoptions');select.replaceChildren(...[st.organization.id,...st.entityIds].map(id=>{const o=node('option',id);o.value=id;return o;}));}
  $('#runtime').textContent=`${st.provider} · ${st.mode} · owner authentication ${st.authenticated?'enabled':'disabled for local development'} · workboard ${st.storage.itemCount} items · ${st.storage.backupCount} backups · mounted volume ${st.storage.mountPoint || 'not verified'} · release ${st.revision || 'not supplied'}. A mounted path does not prove restart persistence. Registry writes: disabled. Miles access: link only.`;
  await Promise.all([loadWork(),update()]);
  setInterval(()=>{if(!document.hidden)void update();},60000);
}catch(e){$('#health').textContent='Service unavailable';$('#basis').textContent=e.message;}})();
