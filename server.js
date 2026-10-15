'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {config:loadConfig}=require('./lib/config');
const {Workboard}=require('./lib/storage');
const {Integrations}=require('./lib/integrations');
const archive=require('./lib/archive');
const {SourceError,GoogleClient}=require('./lib/google');
const {GoogleConnections,CALLBACK}=require('./lib/google-connect');
const ROOT=__dirname;
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
const CSP="default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; object-src 'none'; form-action 'self'; frame-ancestors 'none'";
function roleFor(req,c) {
  if(!c.hosted && !c.token) return 'owner';
  const header=req.headers.authorization || '';
  if(!header.startsWith('Basic ')) return null;
  const credentials=Buffer.from(header.slice(6),'base64').toString('utf8');
  const idx=credentials.indexOf(':');
  if(idx<0) return null;
  const user=credentials.slice(0,idx),secret=user==='circle'?c.token:user==='brian'&&c.isCircle?c.viewerToken:'';
  if(!secret || (user==='brian' && secret.length<32)) return null;
  const candidate=Buffer.from(credentials.slice(idx+1)),expected=Buffer.from(secret);
  return candidate.length===expected.length && crypto.timingSafeEqual(candidate,expected) ? user==='circle'?'owner':'viewer' : null;
}
function authorized(req,c) {return Boolean(roleFor(req,c));}
function response(res,code,data,headers={}) {
  res.writeHead(code,{'Content-Type':'application/json; charset=utf-8',...headers});res.end(JSON.stringify(data));
}
function readBody(req,max=16000) {
  return new Promise((resolve,reject)=>{
    let size=0;const chunks=[];let rejected=false;
    req.on('data',c=>{size+=c.length;if(size>max){rejected=true;reject(Object.assign(Error('Request body too large'),{status:413}));}else chunks.push(c)});
    req.on('end',()=>{if(rejected)return;try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))}catch{reject(Object.assign(Error('Invalid JSON'),{status:400}))}});
    req.on('error',reject);
  });
}
function safeText(v,n=220) {return typeof v==='string'?v.trim().slice(0,n):'';}
function createApp(c=loadConfig(),dependencies={}) {
  const board=dependencies.board || new Workboard(c.dataDir,c.orgId);
  const connections=dependencies.connections || new GoogleConnections(c,dependencies.googleFetch || fetch);
  const integrations=dependencies.integrations || new Integrations(c,new GoogleClient(c,dependencies.googleFetch || fetch,id=>connections.credentials(id)));
  const startTime=new Date().toISOString();
  let lastManualRefresh=0; const lastTests={};
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',CSP);
    if(c.hosted)res.setHeader('Strict-Transport-Security','max-age=31536000');
    try {
      const u=new URL(req.url,'http://localhost');
      if(u.pathname==='/healthz' && req.method==='GET'){res.writeHead(200,{'Content-Type':'text/plain'});return res.end('ok');}
      const role=roleFor(req,c);
      if(!role){res.writeHead(401,{'WWW-Authenticate':'Basic realm="CIRCLE Executive Home"'});return res.end('Authentication required');}
      // Keep the previously approved guest surface. Live source data, Google
      // authorization, refresh, tests, backups and all writes remain owner-only.
      if(role==='viewer') {
        const allowed=['/','/index.html','/app.js','/styles.css','/legacy-v1.3.html','/api/status','/api/sources','/api/workboard'];
        if(req.method!=='GET' || !allowed.includes(u.pathname))return response(res,403,{error:'Read-only guest access: this operation requires the owner'});
        if(u.pathname==='/api/status')return response(res,200,{mode:c.hosted?'hosted':'local development',role,automaticSync:false,milesWrites:false,authenticated:true,sourceSnapshotDate:archive.snapshot.retrievedAt});
        if(u.pathname==='/api/sources')return response(res,200,{sources:archive.sources,snapshot:archive.snapshot});
      }
      if(u.pathname===CALLBACK && req.method==='GET') {
        let result='failed';
        try {
          const linked=await connections.complete(u.searchParams,req.headers.cookie);
          delete integrations.client.tokens[linked.id];
          if(c.enabled[linked.id])await integrations.refresh(linked.id);
          result='linked';
        }catch{/* No authorization code, provider response, or token is echoed or logged. */}
        res.writeHead(303,{Location:`/?google=${result}#sources`,'Set-Cookie':connections.cookie('',0)});return res.end();
      }
      const mutating=!['GET','HEAD'].includes(req.method);
      if(req.headers['sec-fetch-site']==='cross-site' && mutating) return response(res,403,{error:'Origin denied'});
      if(req.headers.origin) {
        let origin;try{origin=new URL(req.headers.origin);}catch{return response(res,403,{error:'Origin denied'});}
        if(c.origin ? origin.origin!==c.origin : origin.host!==req.headers.host || !['http:','https:'].includes(origin.protocol)) return response(res,403,{error:'Origin denied'});
      }
      if(mutating && req.headers['content-type']?.split(';')[0]!=='application/json') return response(res,415,{error:'JSON content type required'});
      if(u.pathname.startsWith('/api/')) {
        if(req.method==='POST' && u.pathname==='/api/google/connect') {
          const b=await readBody(req);const flow=connections.begin(b?.source);
          return response(res,200,{url:flow.url},{'Set-Cookie':flow.cookie});
        }
        if(req.method==='GET' && u.pathname==='/api/status') {
          const views=integrations.views();
          return response(res,200,{mode:c.hosted?'hosted':'local development',role,provider:c.provider,organization:{id:c.orgId,name:c.orgName},entityIds:c.entities,revision:c.revision,
            startedAt:startTime,authenticated:Boolean(c.token),authentication:'single-owner Basic over HTTPS in hosted mode',
            automaticSync:{enabled:Object.keys(views).filter(k=>views[k].enabled),healthy:Object.keys(views).filter(k=>views[k].status==='connected'),intervalSeconds:c.refreshMs/1000},
            milesWrites:false,registryWrites:false,storage:board.status(),sourceSnapshotDate:c.isCircle?archive.snapshot.retrievedAt:null});
        }
        if(req.method==='GET' && u.pathname==='/api/executive')return response(res,200,integrations.executive());
        if(req.method==='GET' && u.pathname==='/api/sources') return response(res,200,{
          sources:[{title:'CIRCLE Core Registry',url:c.registryId?`https://docs.google.com/spreadsheets/d/${c.registryId}/edit`:null,status:integrations.view('registry').status},
            {title:'Financial workbook',url:c.financialId?`https://docs.google.com/spreadsheets/d/${c.financialId}/edit`:null,status:integrations.view('financial').status},
            {title:'Miles — Parallel (current)',url:c.milesUrl,status:'Verified destination; link only. No database access.'},
            {title:'Gmail',url:`https://mail.google.com/mail/u/?authuser=${encodeURIComponent(c.googleExpectedEmail)}#inbox`,status:integrations.view('gmail').status},
            {title:'Google Calendar',url:`https://calendar.google.com/calendar/u/0/r?authuser=${encodeURIComponent(c.googleExpectedEmail)}`,status:integrations.view('calendar').status}],
          googleConnection:connections.status(),integrations:integrations.views(),snapshot:c.isCircle?archive.snapshot:null,snapshotStatus:'ARCHIVED — never substituted for live refresh'});
        if(req.method==='POST' && u.pathname==='/api/refresh') {
          if(Date.now()-lastManualRefresh<30000)return response(res,429,{error:'Refresh already requested; wait 30 seconds'},{'Retry-After':'30'});
          lastManualRefresh=Date.now(); await integrations.refreshAll();return response(res,200,integrations.executive());
        }
        const test=u.pathname.match(/^\/api\/integrations\/(registry|financial|gmail|calendar)\/test$/);
        if(req.method==='POST' && test) {
          if(Date.now()-(lastTests[test[1]]||0)<30000)return response(res,429,{error:'Read test already requested; wait 30 seconds'});
          lastTests[test[1]]=Date.now();return response(res,200,await integrations.test(test[1]));
        }
        if(req.method==='GET' && u.pathname==='/api/workboard')return response(res,200,board.read(),{ETag:`"${board.checksum()}"`});
        if(req.method==='POST' && u.pathname==='/api/workboard/backup')return response(res,200,board.backup(),{'Content-Disposition':`attachment; filename="${c.orgId}-workboard-backup.json"`});
        if(req.method==='POST' && u.pathname==='/api/workboard') {
          const b=await readBody(req);
          const entities=c.isCircle?['CIRCLE','Miles',...c.entities]:[c.orgId,...c.entities];
          if(!b || !['Decision','Action','Blocker'].includes(b.type) || !entities.includes(b.entity) || !safeText(b.title) || !['OPEN','IN_PROGRESS'].includes(b.status||'OPEN'))return response(res,400,{error:'Invalid item'});
          const now=new Date().toISOString();
          const item={id:crypto.randomUUID(),type:b.type,entity:b.entity,title:safeText(b.title),status:b.status||'OPEN',createdAt:now,updatedAt:now};
          board.mutate(req.headers['if-match'],d=>d.items.unshift(item));return response(res,201,item);
        }
        const match=u.pathname.match(/^\/api\/workboard\/([\w-]+)$/);
        if(match && ['PATCH','DELETE'].includes(req.method)) {
          const b=req.method==='PATCH'?await readBody(req):null;
          if(req.method==='PATCH' && (!b || !['OPEN','IN_PROGRESS','DONE'].includes(b.status)))return response(res,400,{error:'Invalid status'});
          const result=board.mutate(req.headers['if-match'],d=>{
            const item=d.items.find(x=>x.id===match[1]);
            if(!item)throw Object.assign(Error('Not found'),{status:404});
            if(req.method==='PATCH'){item.status=b.status;item.updatedAt=new Date().toISOString();return item;}
            d.items=d.items.filter(x=>x.id!==match[1]);return {ok:true};
          });
          return response(res,200,result);
        }
        return response(res,404,{error:'Unknown API route'});
      }
      if(req.method!=='GET') return response(res,405,{error:'Method not allowed'});
      const file=u.pathname==='/'?'index.html':u.pathname.slice(1);
      if(!['index.html','app.js','styles.css','legacy-v1.3.html'].includes(file) || (!c.isCircle && file==='legacy-v1.3.html'))return response(res,404,{error:'Not found'});
      // Serve a neutral shell for non-CIRCLE environments; no embedded institutional snapshot.
      const servedFile=role==='viewer'&&['index.html','app.js'].includes(file)?'guest-'+file:file;
      let content=fs.readFileSync(path.join(ROOT,'public',servedFile));
      if(!c.isCircle && file==='index.html')content=Buffer.from(content.toString().replaceAll('CIRCLE', 'Executive').replaceAll('Bayberry','Operating business').replaceAll('ATLAS','Development'));
      res.writeHead(200,{'Content-Type':MIME[path.extname(file)]});res.end(content);
    } catch(e) {
      if(!res.headersSent)response(res,e.status || (e instanceof SourceError?502:503),{error:e.status?e.message:e instanceof SourceError?e.message:'Request failed; existing records have been preserved',code:e instanceof SourceError?e.code:undefined});
      else res.end();
    }
  });
  server.requestTimeout=20000;server.headersTimeout=10000;
  server.on('close',()=>integrations.stop());
  return {server,board,integrations,connections,config:c};
}
if(require.main===module) {
  try {
    const app=createApp();
    app.server.listen(app.config.port,app.config.host,()=>{
      console.log(`Executive Home listening (${app.config.provider}; organization ${app.config.orgId})`);
      app.integrations.start();
    });
    const stop=()=>{app.integrations.stop();app.server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),10000).unref();};
    process.on('SIGTERM',stop);process.on('SIGINT',stop);
  }catch(e){console.error(e.message);process.exit(1);}
}
module.exports={createApp,authorized,roleFor};
