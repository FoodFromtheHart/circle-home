'use strict';
// Independently deployable communication increment. No workboard, Registry or
// financial writes or migration; the existing application retains those surfaces.
const {config}=require('./config');
const {GoogleConnections,CALLBACK}=require('./google-connect');
const {GoogleClient,SourceError}=require('./google');
const {readGmail,readCalendar}=require('./communications');
const IDS=['gmail','calendar'];
function createCommunications(env=process.env,fetcher=fetch,clock=()=>new Date()) {
  const c=config(env),connections=new GoogleConnections(c,fetcher);
  const client=new GoogleClient(c,fetcher,id=>connections.credentials(id));
  const states=Object.fromEntries(IDS.map(id=>[id,{lastAttemptAt:null,lastSuccessAt:null,data:null,error:null}]));
  const pending={},lastTests={};let timer=null,lastRefresh=0;
  const read=id=>id==='gmail'?readGmail(client,c):readCalendar(client,c,clock());
  const view=id=>{
    const state=states[id],enabled=c.enabled[id];
    const configured=client.configured(id)&&Boolean(c.googleExpectedEmail&&(id==='gmail'?c.gmailQuery:c.calendarId));
    const status=!enabled?'disabled':!configured?'unavailable':state.error?'error':!state.lastSuccessAt?'awaiting_refresh':clock()-new Date(state.lastSuccessAt)>c.freshMs?'stale':'connected';
    return {id,enabled,configured,status,...state,data:enabled?state.data:null};
  };
  const status=()=>({googleConnection:connections.status(),sources:Object.fromEntries(IDS.map(id=>[id,view(id)])),intervalSeconds:c.refreshMs/1000});
  async function refresh(id) {
    if(!c.enabled[id])return view(id);
    if(pending[id])return pending[id];
    pending[id]=(async()=>{
      states[id].lastAttemptAt=clock().toISOString();
      try{states[id].data=await read(id);states[id].lastSuccessAt=clock().toISOString();states[id].error=null;}
      catch(e){states[id].error={code:e instanceof SourceError?e.code:'refresh_failed',message:e instanceof SourceError?e.message:'Source refresh failed'};}
      return view(id);
    })().finally(()=>delete pending[id]);return pending[id];
  }
  const refreshAll=async()=>{await Promise.all(IDS.map(refresh));return status();};
  function start(){if(timer)return;void refreshAll();timer=setInterval(()=>void refreshAll(),c.refreshMs);timer.unref();}
  function stop(){if(timer)clearInterval(timer);timer=null;}
  function send(res,code,data,headers={}){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...headers});res.end(JSON.stringify(data));}
  async function body(req) {
    const chunks=[];let bytes=0;
    for await(const chunk of req){bytes+=chunk.length;if(bytes>4096)throw Object.assign(Error('Request body too large'),{status:413});chunks.push(chunk);}
    try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Object.assign(Error('Invalid JSON'),{status:400});}
  }
  async function handle(req,res,u,role) {
    const test=u.pathname.match(/^\/api\/integrations\/(gmail|calendar)\/test$/);
    const owned=u.pathname===CALLBACK || u.pathname.startsWith('/api/google/') || u.pathname.startsWith('/api/communications') || test;
    if(!owned)return false;
    if(role!=='owner'){send(res,403,{error:'Owner access required for private Google connections'});return true;}
    try{
      if(u.pathname===CALLBACK && req.method==='GET') {
        let result='failed';
        try{const linked=await connections.complete(u.searchParams,req.headers.cookie);delete client.tokens[linked.id];if(c.enabled[linked.id])await refresh(linked.id);result='linked';}catch{/* Never log or echo authorization codes, credentials or provider responses. */}
        res.writeHead(303,{Location:`/?google=${result}#sources`,'Set-Cookie':connections.cookie('',0),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});res.end();return true;
      }
      const mutation=!['GET','HEAD'].includes(req.method);
      if(mutation && (req.headers['sec-fetch-site']==='cross-site' || (req.headers.origin && req.headers.origin!==c.origin))) {send(res,403,{error:'Origin denied'});return true;}
      if(mutation && req.headers['content-type']?.split(';')[0]!=='application/json'){send(res,415,{error:'JSON content type required'});return true;}
      if(req.method==='GET' && u.pathname==='/api/communications'){send(res,200,status());return true;}
      if(req.method==='POST' && u.pathname==='/api/google/connect'){
        const data=await body(req),flow=connections.begin(data?.source);send(res,200,{url:flow.url},{'Set-Cookie':flow.cookie});return true;
      }
      if(req.method==='POST' && test){
        const id=test[1];if(Date.now()-(lastTests[id]||0)<30000){send(res,429,{error:'Read test already requested; wait 30 seconds'});return true;}
        lastTests[id]=Date.now();const data=await read(id);
        send(res,200,{source:id,authenticatedRead:true,email:data.accountEmail,testedAt:clock().toISOString(),contractVersion:data.contractVersion,enabled:c.enabled[id],itemCount:(data.threads||data.events).length});return true;
      }
      if(req.method==='POST' && u.pathname==='/api/communications/refresh'){
        if(Date.now()-lastRefresh<30000){send(res,429,{error:'Refresh already requested; wait 30 seconds'});return true;}
        lastRefresh=Date.now();send(res,200,await refreshAll());return true;
      }
      send(res,404,{error:'Unknown communication route'});
    }catch(e){send(res,e.status || 502,{error:e.status?e.message:e instanceof SourceError?e.message:'Connection operation failed',code:e instanceof SourceError?e.code:undefined});}
    return true;
  }
  return {handle,status,start,stop,refresh,refreshAll,connections,client,config:c};
}
module.exports={createCommunications};
