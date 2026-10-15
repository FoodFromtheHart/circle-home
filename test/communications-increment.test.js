'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {createCommunications}=require('../lib/communications-server');
const {SCOPES}=require('../lib/google-connect');
const root=path.join(__dirname,'..');
const owner='synthetic-owner-secret-over-32-characters',viewer='synthetic-viewer-secret-over-32-characters';
const auth=(user,token)=>({Authorization:'Basic '+Buffer.from(user+':'+token).toString('base64'),'Content-Type':'application/json'});
function setup(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'circle-increment-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return {dir,env:{HOST:'0.0.0.0',CIRCLE_DATA_DIR:dir,CIRCLE_ADMIN_TOKEN:owner,CIRCLE_VIEWER_TOKEN:viewer,CIRCLE_PUBLIC_ORIGIN:'https://circle.example',CIRCLE_GOOGLE_OAUTH_CLIENT_ID:'123456789012-syntheticclient.apps.googleusercontent.com',CIRCLE_GOOGLE_OAUTH_CLIENT_SECRET:'synthetic-client-secret',CIRCLE_GOOGLE_TOKEN_KEY:crypto.randomBytes(32).toString('hex'),CIRCLE_GOOGLE_EXPECTED_EMAIL:'owner@example.test',CIRCLE_GMAIL_QUERY:'newer_than:30d subject:synthetic',CIRCLE_CALENDAR_ID:'owner@example.test'}};}
async function boot(env){
 const child=spawn(process.execPath,['-e',"const a=require('./server');a.server.listen(0,'127.0.0.1',()=>console.log('CIRCLE_TEST_READY:'+a.server.address().port));"],{cwd:root,env:{...process.env,...env},stdio:['ignore','pipe','pipe']});
 const port=await new Promise((resolve,reject)=>{let out='';const timeout=setTimeout(()=>{child.kill();reject(Error('Synthetic server startup timed out'));},15000);child.stdout.on('data',d=>{out+=d;const ready=out.match(/CIRCLE_TEST_READY:(\d+)/);if(ready){clearTimeout(timeout);resolve(Number(ready[1]));}});child.once('exit',code=>{clearTimeout(timeout);reject(Error('Server exited '+code));});child.once('error',e=>{clearTimeout(timeout);reject(e);});});
 return {base:`http://127.0.0.1:${port}`,stop:()=>new Promise(resolve=>{child.once('exit',resolve);child.kill();})};
}
test('production increment preserves existing records and guest scope across a real process restart',async t=>{
 const {dir,env}=setup(t),file=path.join(dir,'workboard.json');
 const raw=JSON.stringify({version:1,extra:'preserve',items:[{id:'original-synthetic',title:'Existing record',status:'DONE',extra:'preserve'}]},null,2);fs.writeFileSync(file,raw);
 let app=await boot(env);t.after(async()=>{if(app)await app.stop();});
 for(const route of ['/','/api/status','/api/workboard','/api/communications','/oauth/google/callback?code=synthetic','/communications.js'])assert.equal((await fetch(app.base+route)).status,401,route);
 const headers=auth('circle',owner),guest=auth('brian',viewer);
 const before=await (await fetch(app.base+'/api/workboard',{headers})).json();assert.equal(before.items[0].id,'original-synthetic');assert.equal(fs.readFileSync(file,'utf8'),raw);
 const oldSources=await (await fetch(app.base+'/api/sources',{headers:guest})).json();assert.equal(oldSources.snapshot.retrievedAt,'2026-10-14');assert(!oldSources.googleConnection);
 for(const [method,route] of [['GET','/api/communications'],['GET','/oauth/google/callback?code=synthetic'],['POST','/api/google/connect'],['POST','/api/communications/refresh'],['POST','/api/integrations/gmail/test'],['POST','/api/integrations/calendar/test'],['POST','/api/workboard'],['PATCH','/api/workboard/original-synthetic'],['DELETE','/api/workboard/original-synthetic']])assert.equal((await fetch(app.base+route,{method,headers:guest,body:method==='GET'?undefined:'{}',redirect:'manual'})).status,403,route);
 const status=await (await fetch(app.base+'/api/communications',{headers})).json();assert(status.googleConnection.sources.gmail.canConnect);assert.equal(status.sources.gmail.status,'disabled');assert.equal(status.sources.calendar.status,'disabled');
 assert.equal((await fetch(app.base+'/api/google/connect',{method:'POST',headers:{...headers,Origin:'https://other.example'},body:'{"source":"gmail"}'})).status,403);
 assert.equal((await fetch(app.base+'/api/google/connect',{method:'POST',headers:{...headers,'Sec-Fetch-Site':'cross-site'},body:'{"source":"gmail"}'})).status,403);
 assert.equal((await fetch(app.base+'/api/google/connect',{method:'POST',headers:{...headers,'Content-Type':'text/plain'},body:'{"source":"gmail"}'})).status,415);
 const flow=await fetch(app.base+'/api/google/connect',{method:'POST',headers,body:'{"source":"gmail"}'});assert.equal(flow.status,200);assert(flow.headers.get('set-cookie').includes('HttpOnly'));assert(flow.headers.get('set-cookie').includes('Secure'));
 const consent=new URL((await flow.json()).url);assert.equal(consent.searchParams.get('redirect_uri'),'https://circle.example/oauth/google/callback');assert(!consent.searchParams.get('scope').includes('calendar'));
 assert.equal(fs.readFileSync(file,'utf8'),raw);
 const added=await fetch(app.base+'/api/workboard',{method:'POST',headers,body:JSON.stringify({type:'Action',entity:'CIRCLE',title:'Synthetic mutation'})});assert.equal(added.status,201);
 const saved=fs.readFileSync(file,'utf8');assert.equal(JSON.parse(saved).extra,'preserve');assert.equal(JSON.parse(saved).items.find(x=>x.id==='original-synthetic').extra,'preserve');
 await app.stop();app=null;app=await boot(env);assert.equal(fs.readFileSync(file,'utf8'),saved);assert.equal((await (await fetch(app.base+'/api/workboard',{headers})).json()).items.length,2);
});

test('independent consent tests refresh access before encrypted storage; refresh failures retain explicit last-known data',async t=>{
 const {dir,env}=setup(t);let now=new Date('2026-10-15T15:00:00Z'),fail=false,calls=0;
 const fetcher=async(url,opts={})=>{
  calls++;const u=new URL(url);let data;
  if(u.hostname==='oauth2.googleapis.com'){assert.equal(opts.method,'POST');data=opts.body.get('grant_type')==='authorization_code'?{refresh_token:'synthetic-refresh',scope:Object.values(SCOPES).join(' ')}:{access_token:'synthetic-access',expires_in:3600};}
  else{assert.equal(opts.method,undefined);if(u.hostname==='openidconnect.googleapis.com')data={sub:'synthetic-owner',email:'owner@example.test',email_verified:true};
   else if(fail)return new Response('Do not expose upstream content',{status:403});
   else if(u.pathname.endsWith('/events'))data={items:[{id:'event',summary:'Synthetic meeting',status:'confirmed',start:{date:'2026-10-16'},end:{date:'2026-10-17'},attendees:[{self:true,responseStatus:'needsAction'}]}]};
   else if(u.pathname.endsWith('/threads'))data={threads:[{id:'thread'}]};
   else data={id:'thread',messages:[{internalDate:String(now.getTime()),payload:{headers:[{name:'Subject',value:'Synthetic investor note'}]}}]};}
  return new Response(JSON.stringify(data));
 };
 const runtime=createCommunications(env,fetcher,()=>now),server=http.createServer(async(req,res)=>{if(!await runtime.handle(req,res,new URL(req.url,'https://circle.example'),req.headers['x-role']||'owner')){res.writeHead(404);res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const base=`http://127.0.0.1:${server.address().port}`;
 for(const id of ['gmail','calendar']){
  const f=runtime.connections.begin(id),params=new URLSearchParams({state:new URL(f.url).searchParams.get('state'),code:'synthetic-code'});
  const callback=await fetch(base+'/oauth/google/callback?'+params,{headers:{Cookie:f.cookie},redirect:'manual'});assert.equal(callback.status,303);assert.equal(callback.headers.get('location'),'/?google=linked#sources');assert.equal(await callback.text(),'');
  const status=runtime.status();assert(status.googleConnection.sources[id].linked);assert.equal(status.sources[id].status,'disabled');assert.equal(status.sources[id].data,null);
  const readTest=await (await fetch(base+`/api/integrations/${id}/test`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json();assert(readTest.authenticatedRead);assert.equal(readTest.itemCount,1);assert.equal(runtime.status().sources[id].status,'disabled');
 }
 assert(!fs.readFileSync(path.join(dir,'google-connections.enc.json'),'utf8').includes('synthetic-refresh'));assert(!fs.existsSync(path.join(dir,'workboard.json')));
 runtime.config.enabled.gmail=true;runtime.config.enabled.calendar=true;await runtime.refreshAll();assert.equal(runtime.status().sources.gmail.status,'connected');assert.equal(runtime.status().sources.calendar.data.events[0].responseStatus,'needsAction');
 const success=runtime.status().sources.gmail.lastSuccessAt;now=new Date(now.getTime()+31*60000);assert.equal(runtime.status().sources.gmail.status,'stale');
 fail=true;await runtime.refresh('gmail');const failed=runtime.status().sources.gmail;assert.equal(failed.status,'error');assert.equal(failed.lastSuccessAt,success);assert.equal(failed.data.threads.length,1);assert(!JSON.stringify(failed).includes('Do not expose'));
 fail=false;await runtime.refresh('gmail');assert.equal(runtime.status().sources.gmail.status,'connected');assert.notEqual(runtime.status().sources.gmail.lastSuccessAt,success);
 const restarted=createCommunications({...env,CIRCLE_GMAIL_ENABLED:'true'},fetcher,()=>now);assert(restarted.status().googleConnection.sources.gmail.linked);assert.equal(restarted.status().sources.gmail.status,'awaiting_refresh');assert.equal(restarted.status().sources.gmail.data,null);
 const priorCalls=calls;await fetch(base+'/api/communications',{headers:{'X-Role':'viewer'}});assert.equal(calls,priorCalls);assert.equal((await fetch(base+'/api/communications',{headers:{'X-Role':'viewer'}})).status,403);
});
