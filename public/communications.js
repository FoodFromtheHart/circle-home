'use strict';
(async()=>{
  const status=await api('/api/status').catch(()=>null);if(status?.role!=='owner')return;
  const date=v=>v?new Date(v).toLocaleString('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'})+' ET':'Never';
  const label=s=>`${s.status}${s.data&&s.status!=='connected'?' · LAST KNOWN':''}`;
  const panel=node('article'),feed=node('div',undefined,'columns');
  panel.append(node('h2','Connect your executive Google account'));
  document.querySelector('#sources').append(panel);document.querySelector('#home').append(feed);
  const callback=new URLSearchParams(location.search).get('google');
  if(location.hash==='#sources')show('sources');if(callback)history.replaceState(null,'','/#sources');
  let busy=false;
  function paint(result){
    const connection=result.googleConnection;panel.replaceChildren(node('h2','Connect your executive Google account'),node('p',connection.expectedEmail||'Account not configured'));
    panel.append(node('p','Read-only access. Each source is authorized and tested independently. Automatic refresh is enabled only after its read passes.','muted small'));
    if(callback==='failed')panel.append(node('p','Google authorization did not complete. See the source message or connect again.'));
    if(connection.setupRequired.length)panel.append(node('p','Setup required: '+connection.setupRequired.join(', ')));
    if(connection.storageError)panel.append(node('p',connection.storageError));
    feed.replaceChildren();
    for(const id of ['gmail','calendar']){
      const s=result.sources[id],linked=connection.sources[id],title=id==='gmail'?'Gmail':'Calendar',line=node('div',undefined,'source'),left=node('div');
      left.append(node('strong',title),node('p',linked.linked?`${linked.email} · authorization read passed ${date(linked.testedAt)}`:'Not linked in this application.'),node('p',`${label(s)} · last successful refresh ${date(s.lastSuccessAt)}`));
      if(linked.error||s.error)left.append(node('p',linked.error||s.error.message));
      const controls=node('div',undefined,'controls'),connect=node('button',(linked.linked?'Reconnect ':'Connect ')+title,'subtle');connect.disabled=!linked.canConnect;
      connect.onclick=async()=>{connect.disabled=true;try{const f=await api('/api/google/connect',{method:'POST',body:JSON.stringify({source:id})});location.assign(f.url);}catch(e){left.append(node('p',e.message));connect.disabled=false;}};
      const test=node('button','Test read','subtle');test.disabled=!s.configured;
      test.onclick=async()=>{test.disabled=true;try{const r=await api(`/api/integrations/${id}/test`,{method:'POST',body:'{}'});left.append(node('p',`Authenticated read passed ${date(r.testedAt)} · ${r.itemCount} items · automatic refresh ${r.enabled?'enabled':'disabled'}`));}catch(e){left.append(node('p',e.message));}finally{test.disabled=false;}};
      controls.append(connect,test);line.append(left,controls);panel.append(line);
      const section=node('article');section.append(node('h2',id==='gmail'?'Executive correspondence':'Upcoming commitments'),node('p',`${label(s)} · last success ${date(s.lastSuccessAt)}`,'muted small'));
      const records=id==='gmail'?s.data?.threads:s.data?.events;
      for(const item of (records||[]).slice(0,8)){
        const response={needsAction:'Invitation needs your response',accepted:'You accepted',tentative:'Tentative response',declined:'You declined'}[item.responseStatus]||'Response not recorded';
        const details=id==='gmail'?`${item.from} · ${date(item.receivedAt)} · Follow-up candidate for owner review`:`${item.allDay?item.start+' · all day':date(item.start)} · ${response}`;
        const r=row(item.title,details,label(s));
        if(item.source?.url){try{if(new URL(item.source.url).protocol==='https:')r.append(link('Open source ↗',item.source.url));}catch{}}
        section.append(r);
      }
      if(!records?.length)section.append(node('p',s.status==='connected'?'No matching items in the current source window.':`${title} ${s.status}. No live data is available.`,'muted small'));
      if(s.data?.moreAvailable)section.append(node('p','Additional items are available in the source.','muted small'));
      feed.append(section);
    }
    const refresh=node('button','Refresh connected sources','subtle');
    refresh.onclick=async()=>{refresh.disabled=true;try{paint(await api('/api/communications/refresh',{method:'POST',body:'{}'}));}catch(e){panel.append(node('p',e.message));}finally{refresh.disabled=false;}};
    panel.append(refresh,node('p',`Enabled sources refresh server-side every ${result.intervalSeconds/60} minutes. Registry and financial snapshots remain unchanged.`,'muted small'));
  }
  async function update(){if(busy)return;busy=true;try{paint(await api('/api/communications'));}catch(e){feed.replaceChildren(node('p','Communication data unavailable: '+e.message));}finally{busy=false;}}
  await update();setInterval(()=>{if(!document.hidden)void update();},60000);
})().catch(()=>{});
