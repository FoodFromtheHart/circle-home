'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const crypto=require('node:crypto');const {spawnSync,spawn}=require('node:child_process');
const {config}=require('../lib/config');const {Workboard,verifyBackup,digest}=require('../lib/storage');const {createApp}=require('../server');
const {GoogleClient,SourceError}=require('../lib/google');const {REGISTRY,parseRegistry,parseFinancial}=require('../lib/contracts');const {Integrations}=require('../lib/integrations');const {briefing}=require('../lib/executive');const {readGmail,readCalendar}=require('../lib/communications');
const {registryFixture,financialFixture}=require('./fixtures');
const token='synthetic-owner-test-token-32-characters';
function setup(t,extra={}){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'circle-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return config({CIRCLE_DATA_DIR:dir,CIRCLE_ADMIN_TOKEN:token,...extra});}
async function listen(t,c){const app=createApp(c);await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>app.server.close(resolve)));return {app,base:`http://127.0.0.1:${app.server.address().port}`};}
const auth={Authorization:'Basic '+Buffer.from('circle:'+token).toString('base64'),'Content-Type':'application/json'};
function fakeClient(c){return {configured:()=>true,sheet:async id=>id===c.registryId?registryFixture(c):financialFixture(c)};}

test('hosted startup fails closed; external organizations cannot inherit private CIRCLE sources',t=>{
 assert.throws(()=>config({RENDER:'true'}),/owner token/);
 assert.throws(()=>config({HOST:'127.0.0.1',NODE_ENV:'production'}),/owner token/);
 assert.throws(()=>config({CIRCLE_ORG_ID:'pilot'}),/entity scope/);
 assert.throws(()=>config({CIRCLE_ORG_ID:'pilot',CIRCLE_ENTITY_IDS:'E1',CIRCLE_REGISTRY_ID:config({}).registryId}),/CIRCLE sources/);
 const c=setup(t,{CIRCLE_ORG_ID:'pilot',CIRCLE_ENTITY_IDS:'E1'});assert.equal(c.registryId,'');assert.equal(c.financialId,'');assert.equal(c.milesUrl,'');
});
test('unauthenticated APIs, assets, backup and legacy route deny access; only health is public',async t=>{
 const c=setup(t,{HOST:'0.0.0.0'});const {base}=await listen(t,c);
 for(const route of ['/','/api/status','/api/sources','/api/executive','/api/workboard','/app.js','/styles.css','/legacy-v1.3.html','/data/workboard.json']){const r=await fetch(base+route);assert.equal(r.status,401,route);assert.equal(r.headers.get('cache-control'),'no-store');}
 assert.equal((await fetch(base+'/api/workboard/backup',{method:'POST'})).status,401);
 assert.equal(await (await fetch(base+'/healthz')).text(),'ok');
 const status=await (await fetch(base+'/api/status',{headers:auth})).json();assert.equal(status.mode,'hosted');assert.equal(status.milesWrites,false);assert.equal(status.registryWrites,false);
 const ui=await (await fetch(base,{headers:auth})).text();assert(!ui.includes('local alpha'));assert(ui.includes('Provisional'));
});
test('workboard mutations preserve originals, reject conflicts and CSRF, and export checked backups',async t=>{
 const c=setup(t,{HOST:'0.0.0.0'});const initial={version:1,items:[{id:'existing-1',title:'Manual correction',type:'Action',entity:'ENT-0101',status:'OPEN',customField:'preserve me'}],customRoot:'preserve root'};
 const raw=JSON.stringify(initial,null,3);fs.writeFileSync(path.join(c.dataDir,'workboard.json'),raw);
 const {base,app}=await listen(t,c);let r=await fetch(base+'/api/workboard',{headers:auth});const rev=r.headers.get('etag');assert.deepEqual(await r.json(),initial);
 assert.equal(fs.readFileSync(app.board.file,'utf8'),raw,'startup must not rewrite the board');
 assert.equal((await fetch(base+'/api/workboard',{method:'POST',headers:{...auth,Origin:'https://evil.example','If-Match':rev},body:JSON.stringify({type:'Action',entity:'CIRCLE',title:'bad'})})).status,403);
 assert.equal((await fetch(base+'/api/workboard',{method:'POST',headers:auth,body:'{}'})).status,400);
 assert.equal((await fetch(base+'/api/workboard/existing-1',{method:'PATCH',headers:auth,body:'{"status":"DONE"}'})).status,428);
 assert.equal((await fetch(base+'/api/workboard/existing-1',{method:'PATCH',headers:{...auth,'If-Match':rev},body:'{"status":"DONE"}'})).status,200);
 assert.equal((await fetch(base+'/api/workboard/existing-1',{method:'PATCH',headers:{...auth,'If-Match':rev},body:'{"status":"OPEN"}'})).status,409);
 assert.equal(app.board.read().customRoot,'preserve root');assert.equal(app.board.read().items[0].customField,'preserve me');
 const backups=fs.readdirSync(app.board.backupDir).map(f=>JSON.parse(fs.readFileSync(path.join(app.board.backupDir,f))));assert(backups.some(b=>b.raw===raw));
 const exported=await (await fetch(base+'/api/workboard/backup',{method:'POST',headers:auth,body:'{}'})).json();assert.equal(verifyBackup(exported,'circle').checksum,app.board.checksum());assert.throws(()=>verifyBackup({...exported,orgId:'other'},'circle'));
 assert.equal((await fetch(base+'/api/workboard',{method:'POST',headers:{...auth,'If-Match':'"'+app.board.checksum()+'"'},body:JSON.stringify({title:'New',type:'Action',entity:'CIRCLE'})})).status,201);
});
test('corrupt or unexpectedly missing workboards fail closed without reseeding',t=>{
 const c=setup(t);fs.writeFileSync(path.join(c.dataDir,'workboard.json'),'broken');assert.throws(()=>new Workboard(c.dataDir,c.orgId));assert.equal(fs.readFileSync(path.join(c.dataDir,'workboard.json'),'utf8'),'broken');
 fs.writeFileSync(path.join(c.dataDir,'workboard.json'),'{"version":1,"items":[]}');const b=new Workboard(c.dataDir,c.orgId);fs.unlinkSync(b.file);assert.throws(()=>b.read());assert.throws(()=>new Workboard(c.dataDir,c.orgId));
});
test('restart preserves IDs and contents; restore defaults to dry-run with an explicit checksum lease',t=>{
 const c=setup(t);const b=new Workboard(c.dataDir,c.orgId);b.mutate(b.checksum(),d=>d.items.push({id:'persisted',title:'Original'}));const backup=b.backup();const input=path.join(c.dataDir,'saved.json');fs.writeFileSync(input,JSON.stringify(backup));
 b.mutate(b.checksum(),d=>{d.items[0].title='New version';});const before=b.checksum();
 const restarted=new Workboard(c.dataDir,c.orgId);assert.equal(restarted.checksum(),before);assert.equal(restarted.read().items[0].id,'persisted');
 const env={...process.env,CIRCLE_DATA_DIR:c.dataDir,CIRCLE_ORG_ID:'circle'};const run=args=>spawnSync(process.execPath,['scripts/workboard.js','restore','--input',input,...args],{cwd:path.join(__dirname,'..'),env,encoding:'utf8'});
 assert.equal(run([]).status,0);assert.equal(restarted.checksum(),before);
 assert.equal(run(['--apply','--service-stopped','--expect-sha','wrong']).status,1);assert.equal(restarted.checksum(),before);
 assert.equal(run(['--apply','--service-stopped','--expect-sha',before]).status,0);assert.equal(restarted.read().items[0].title,'Original');assert.equal(restarted.checksum(),backup.checksum);
});
test('a real server process restart retains the workboard and new boot identity',async t=>{
 const c=setup(t);let child;
 const start=()=>new Promise((resolve,reject)=>{
   child=spawn(process.execPath,['-e',"const app=require('./server').createApp();app.server.listen(0,'127.0.0.1',()=>console.log(app.server.address().port))"],{cwd:path.join(__dirname,'..'),env:{...process.env,CIRCLE_DATA_DIR:c.dataDir,CIRCLE_ADMIN_TOKEN:token,HOST:'127.0.0.1',NODE_ENV:'test'}});
   child.once('error',reject);child.stdout.once('data',d=>resolve('http://127.0.0.1:'+String(d).trim()));
 });
 const stop=()=>new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM');});t.after(()=>{if(child && !child.killed)child.kill();});
 let base=await start();let r=await fetch(base+'/api/workboard',{headers:auth});
 assert.equal((await fetch(base+'/api/workboard',{method:'POST',headers:{...auth,'If-Match':r.headers.get('etag')},body:JSON.stringify({title:'Restart test',type:'Action',entity:'CIRCLE'})})).status,201);
 const before=await (await fetch(base+'/api/status',{headers:auth})).json();await stop();base=await start();const after=await (await fetch(base+'/api/status',{headers:auth})).json();assert.equal(before.storage.checksum,after.storage.checksum);assert.notEqual(before.storage.bootId,after.storage.bootId);assert.equal(after.storage.itemCount,1);await stop();
});
test('Registry canonical IDs, organization scope, duplicate references and contract failures',t=>{
 const c=setup(t);const fixture=registryFixture(c);const data=parseRegistry(fixture,c);assert.equal(data.excludedEntityCount,1);assert.equal(data.actions.length,1);assert.equal(data.projects[0].project_id,'DEV-0102');
 const view={registry:{data,status:'connected',lastSuccessAt:new Date().toISOString()},financial:{data:null,status:'disabled'},gmail:{data:null,status:'disabled'},calendar:{data:null,status:'disabled'}};
 const b=briefing(view,new Date('2026-10-15'));assert.equal(b.attention.filter(a=>a.id==='ACT-TEST-1').length,1);assert.equal(b.attention.find(a=>a.id==='ACT-TEST-1').attentionScore,5,'draft deadline weight must not activate');
 const bad=structuredClone(fixture);bad.tables.Actions.values[0][0]='wrong';assert.throws(()=>parseRegistry(bad,c),/missing column/);
 bad.tables.Entities.values[1][1]='Wrong identity';assert.throws(()=>parseRegistry(bad,c));
});
test('financial data keeps zero distinct from missing, preserves provisional and financial-close status',t=>{
 const c=setup(t),doc=financialFixture(c),data=parseFinancial(doc,c);assert.equal(data.weekly.weekEnding,'2026-10-11');assert.equal(data.weekly.wages.value,null);assert.equal(data.weekly.netSales.quality,'provisional');assert.equal(data.monthly[0].quality,'provisional');assert.equal(data.reconciliation.result,'VERIFIED');assert.equal(data.weekly.netSales.quality,'provisional');
 doc.tables['Weekly review'].values[9][3]=0;assert.equal(parseFinancial(doc,c).weekly.netSales.value,0);
 doc.tables['Weekly review'].values[43][4]='Changed definition';assert.throws(()=>parseFinancial(doc,c),/trend contract/);
});
test('independent refresh, coalescing, retained failed cache, restart freshness, expiry and scope isolation',async t=>{
 const c=setup(t,{CIRCLE_REGISTRY_ENABLED:'true',CIRCLE_FINANCIAL_ENABLED:'true'});let now=new Date('2026-10-15T01:00:00Z');const client=fakeClient(c);let reads=0;const original=client.sheet;client.sheet=async id=>{reads++;return original(id);};const m=new Integrations(c,client,()=>now);
 await Promise.all([m.refresh('registry'),m.refresh('registry')]);assert.equal(reads,1);assert.equal(m.view('registry').status,'connected');assert(m.view('registry').changes.baseline);
 await m.refresh('financial');assert.equal(m.view('financial').status,'connected');
 client.sheet=async()=>{throw new SourceError('permission_denied','Source returned HTTP 403');};await m.refresh('registry');assert.equal(m.view('registry').status,'error');assert(m.view('registry').data);assert.equal(m.view('financial').status,'connected');
 const restarted=new Integrations(c,fakeClient(c),()=>now);assert.equal(restarted.view('registry').status,'awaiting_refresh');
 now=new Date(now.getTime()+c.freshMs+1);assert.equal(m.view('financial').status,'stale');assert(m.view('financial').data);
 const other=new Integrations({...c,orgId:'pilot'},fakeClient(c),()=>now);assert.equal(other.view('registry').data,null);
 const changed=new Integrations({...c,entities:['ENT-0101']},fakeClient(c),()=>now);assert.equal(changed.view('registry').data,null);
});
test('testing a disabled integration never enables it or writes cached source data',async t=>{
 const c=setup(t);const m=new Integrations(c,fakeClient(c));const result=await m.test('registry');assert(result.authenticatedRead);assert.equal(m.view('registry').status,'disabled');assert.equal(m.view('registry').data,null);assert(!fs.existsSync(m.file));
});
test('service-account auth signs a read-only JWT and uses only known HTTPS endpoints',async t=>{
 const keys=crypto.generateKeyPairSync('rsa',{modulusLength:2048});const sa={type:'service_account',client_email:'synthetic@example.iam.gserviceaccount.com',private_key:keys.privateKey.export({type:'pkcs8',format:'pem'})};
 const c=setup(t,{CIRCLE_GOOGLE_SERVICE_ACCOUNT_JSON:JSON.stringify(sa)});let authCalls=0;
 const fetcher=async(url,opts)=>{
   if(String(url).includes('/token')){authCalls++;const jwt=opts.body.get('assertion');const [h,p,s]=jwt.split('.');assert(crypto.verify('RSA-SHA256',Buffer.from(h+'.'+p),keys.publicKey,Buffer.from(s,'base64url')));const claims=JSON.parse(Buffer.from(p,'base64url'));assert(claims.scope.includes('spreadsheets.readonly'));assert(!claims.sub);assert.equal(opts.redirect,'error');return new Response(JSON.stringify({access_token:'synthetic-access-token',expires_in:3600}));}
   assert.equal(opts.headers.Authorization,'Bearer synthetic-access-token');assert(!opts.method);return new Response('{}');
 };
 const client=new GoogleClient(c,fetcher);await Promise.all([client.get('https://sheets.googleapis.com/v4/test'),client.get('https://sheets.googleapis.com/v4/test')]);assert.equal(authCalls,1);
 await assert.rejects(()=>client.get('https://example.com/steal'),/denied/);
});
test('source response failures never leak credential or upstream response text',async t=>{
 const c=setup(t,{CIRCLE_GOOGLE_OAUTH_CLIENT_ID:'synthetic',CIRCLE_GOOGLE_OAUTH_CLIENT_SECRET:'secret-value',CIRCLE_GOOGLE_OAUTH_REFRESH_TOKEN:'secret-refresh'});
 const client=new GoogleClient(c,async()=>new Response('secret-upstream-details',{status:403}));
 await assert.rejects(()=>client.token('personal'),e=>e.code==='permission_denied' && !e.message.includes('secret'));
});
test('Gmail and Calendar are independent, bounded, read-only increments',async t=>{
 const c=setup(t,{CIRCLE_GMAIL_QUERY:'newer_than:30d subject:synthetic',CIRCLE_CALENDAR_ID:'synthetic-calendar'});const calls=[];
 const client={account:async()=>({email:'synthetic@example.test'}),get:async(url,kind)=>{calls.push({url,kind});if(url.includes('/events?'))return {timeZone:'America/New_York',items:[{id:'e1',summary:'Synthetic meeting',start:{date:'2026-10-16'},end:{date:'2026-10-17'},status:'confirmed',htmlLink:'https://calendar.google.com/event?eid=synthetic'}]};if(url.includes('/threads?'))return {threads:[{id:'abc'}],nextPageToken:'more'};return {id:'abc',messages:[{internalDate:'1792022400000',snippet:'Synthetic',payload:{headers:[{name:'Subject',value:'Synthetic thread'}]}}]};}};
 const mail=await readGmail(client,c);assert.equal(mail.threads.length,1);assert(mail.moreAvailable);assert(mail.threads[0].status.includes('candidate'));assert(calls[1].url.includes('format=metadata'));
 const cal=await readCalendar(client,c,new Date('2026-10-15'));assert(cal.events[0].allDay);assert.equal(calls[2].kind,'calendar');assert(!calls.some(c=>c.url.includes('/send')));
 await assert.rejects(()=>readGmail(client,{...c,gmailQuery:''}),/explicit/);
});
test('external organization API never exposes CIRCLE archive or legacy UI',async t=>{
 const c=setup(t,{CIRCLE_ORG_ID:'pilot',CIRCLE_ENTITY_IDS:'E1'});const {base}=await listen(t,c);
 const sources=await (await fetch(base+'/api/sources',{headers:auth})).json();assert.equal(sources.snapshot,null);assert.equal(sources.sources[0].url,null);
 assert.equal((await fetch(base+'/legacy-v1.3.html',{headers:auth})).status,404);
 const html=await (await fetch(base,{headers:auth})).text();assert(!html.includes('Bayberry'));assert(!html.includes('CIRCLE'));
});
test('full Sheets adapter exchanges credentials, validates metadata, parses batch values and rejects mid-read revisions',async t=>{
 const keys=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 const c=setup(t,{CIRCLE_REGISTRY_ENABLED:'true',CIRCLE_GOOGLE_SERVICE_ACCOUNT_JSON:JSON.stringify({type:'service_account',client_email:'synthetic@example.test',private_key:keys.privateKey.export({type:'pkcs8',format:'pem'})})});
 const fixture=registryFixture(c);let metadataReads=0,drift=false;
 const fetcher=async(url,opts)=>{
   const u=new URL(url);if(u.pathname==='/token')return new Response(JSON.stringify({access_token:'test',expires_in:3600}));
   assert.equal(opts.headers.Authorization,'Bearer test');assert(!opts.method,'source calls must be GET');
   if(u.hostname==='www.googleapis.com'){metadataReads++;return new Response(JSON.stringify({id:c.registryId,modifiedTime:fixture.modifiedAt,version:drift&&metadataReads%2===0?'2':'1'}));}
   if(u.pathname.endsWith('values:batchGet')){
     assert.equal(u.searchParams.get('valueRenderOption'),'UNFORMATTED_VALUE');
     assert.equal(u.searchParams.getAll('ranges').length,REGISTRY.length);
     return new Response(JSON.stringify({spreadsheetId:c.registryId,valueRanges:REGISTRY.map(x=>({values:fixture.tables[x.tab].values}))}));
   }
   return new Response(JSON.stringify({spreadsheetId:c.registryId,properties:{title:'Synthetic Registry'},sheets:REGISTRY.map(x=>({properties:{title:x.tab,sheetId:fixture.tables[x.tab].gid,gridProperties:{rowCount:1000,columnCount:26}}}))}));
 };
 const manager=new Integrations(c,new GoogleClient(c,fetcher));await manager.refresh('registry');assert.equal(manager.view('registry').status,'connected');assert.equal(manager.view('registry').data.entities.length,11);
 drift=true;await manager.refresh('registry');assert.equal(manager.view('registry').status,'error');assert.equal(manager.view('registry').error.code,'source_changed');assert(manager.view('registry').data);
});
test('bad JSON, timeout and rate-limit responses are explicit errors',async t=>{
 const c=setup(t,{CIRCLE_GOOGLE_OAUTH_CLIENT_ID:'test',CIRCLE_GOOGLE_OAUTH_CLIENT_SECRET:'test',CIRCLE_GOOGLE_OAUTH_REFRESH_TOKEN:'test'});
 for(const [code,fetcher] of [['invalid_response',async()=>new Response('not json')],['network_error',async()=>{throw Error('secret internal detail');}],['rate_limited',async()=>new Response('{}',{status:429})]]){
   const client=new GoogleClient(c,fetcher);await assert.rejects(()=>client.token('personal'),e=>e.code===code);
 }
});

test('explicit damaged-storage recovery preserves evidence and requires a checksum',t=>{
 const c=setup(t);const b=new Workboard(c.dataDir,c.orgId);b.mutate(b.checksum(),d=>d.items.push({id:'recovery-test',title:'Recover me'}));const backup=b.backup();const input=path.join(c.dataDir,'saved.json');fs.writeFileSync(input,JSON.stringify(backup));fs.writeFileSync(b.file,'damaged-json');
 const run=args=>spawnSync(process.execPath,['scripts/workboard.js','restore','--input',input,...args],{cwd:path.join(__dirname,'..'),env:{...process.env,CIRCLE_DATA_DIR:c.dataDir},encoding:'utf8'});
 assert.equal(run(['--apply','--service-stopped','--expect-sha',digest('damaged-json')]).status,1);
 assert.equal(run(['--recover-damaged','--apply','--service-stopped','--expect-sha',digest('damaged-json')]).status,0);
 assert.equal(b.read().items[0].title,'Recover me');
 const saved=fs.readdirSync(b.backupDir).map(f=>JSON.parse(fs.readFileSync(path.join(b.backupDir,f))));assert(saved.some(x=>x.format==='circle-workboard-damaged/v1' && x.raw==='damaged-json'));
});
