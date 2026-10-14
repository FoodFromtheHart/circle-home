'use strict';
const http=require('node:http');const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const HOST=process.env.HOST||'127.0.0.1',PORT=Number(process.env.PORT||4177),ROOT=__dirname;
const DATA_DIR=process.env.CIRCLE_DATA_DIR||path.join(ROOT,'data');
const DB=path.join(DATA_DIR,'workboard.json');
const ADMIN_TOKEN=process.env.CIRCLE_ADMIN_TOKEN||'';
const HOSTED=HOST!=='127.0.0.1'&&HOST!=='localhost';
if(HOSTED && (ADMIN_TOKEN.length<32 || !process.env.CIRCLE_DATA_DIR)){
  console.error('Hosted mode requires CIRCLE_ADMIN_TOKEN (32+ chars) and CIRCLE_DATA_DIR (persistent volume).');
  process.exit(1);
}
fs.mkdirSync(DATA_DIR,{recursive:true,mode:0o700});
function authorized(req){
  if(!HOSTED && !ADMIN_TOKEN)return true;
  const header=req.headers.authorization||'';
  if(!header.startsWith('Basic '))return false;
  let credentials='';
  try{credentials=Buffer.from(header.slice(6),'base64').toString('utf8')}catch{return false}
  const idx=credentials.indexOf(':');
  if(idx<0||credentials.slice(0,idx)!=='circle')return false;
  const candidate=Buffer.from(credentials.slice(idx+1));
  const expected=Buffer.from(ADMIN_TOKEN);
  return candidate.length===expected.length&&crypto.timingSafeEqual(candidate,expected);
}
function unauthorized(res){res.writeHead(401,{'WWW-Authenticate':'Basic realm="CIRCLE Executive Home"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end('Authentication required')}

function store(){try{return JSON.parse(fs.readFileSync(DB,'utf8'))}catch(e){if(e.code==='ENOENT')return {version:1,items:[]};throw e}}
function write(data){const p=DB+'.tmp';fs.writeFileSync(p,JSON.stringify(data,null,2),{mode:0o600});fs.renameSync(p,DB)}
function response(res,code,data){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data))}
function readBody(req){return new Promise((resolve,reject)=>{let s='';req.on('data',c=>{s+=c;if(s.length>16000){reject(new Error('too large'));req.destroy()}});req.on('end',()=>{try{resolve(JSON.parse(s))}catch{reject(new Error('invalid json'))}});req.on('error',reject)})}
const allowedTypes=['Decision','Action','Blocker'], allowedEntities=['CIRCLE','ENT-0101','ENT-0102','Miles'];
function safeText(v,n=220){return typeof v==='string'?v.trim().slice(0,n):''}
const sources=[
{title:'Miles — Parallel (current)',kind:'application',url:'https://miles-parallel.foodfromthehart.chatgpt.site/?date=2026-10-14&service=dinner&station=all&view=cook&chef=prep',status:'Hart-confirmed current build; launch link only, not API-connected'},
{title:'Bayberry Financial Workbook V2',kind:'spreadsheet',url:'https://docs.google.com/spreadsheets/d/1meMGMy8CuJijIwJmzUp092ZNi1Myeq57EyKCV_x60SI/edit',status:'Retrieved snapshot; refresh requires connector'},
{title:'CIRCLE Core Registry',kind:'registry',url:'https://docs.google.com/spreadsheets/d/1pcF6-T6b85jXS6CJ525XzO-ALdqDEDEDE9dFOYZDJ4o/edit',status:'Retrieved snapshot; no writeback'},
{title:'Founder Dashboard',kind:'application',url:null,status:'Exact app URL not verified'},
{title:'Google Calendar',kind:'calendar',url:'https://calendar.google.com/calendar/u/0/r',status:'Snapshot only; no automatic polling'},
{title:'Gmail',kind:'email',url:'https://mail.google.com/mail/u/0/#inbox',status:'Snapshot only; no automatic polling'}];
const snapshot={retrievedAt:'2026-10-14',basis:'Verified Google Drive and Google Calendar reads; not continuously synced',bayberry:{weekEnding:'2026-10-11',sales:70640,covers:1088,salesPerCover:64.93,sourceStatus:'Toast API provisional'},atlas:{knownStartupUses:451000,ceiling:425000,gap:26000,phase:'SECURE',note:'Unresolved replacement exposure excluded; registry value'},calendar:[{title:'Ariana Monegro stage',start:'2026-10-17T09:00:00-04:00',end:'2026-10-17T14:00:00-04:00',url:'https://www.google.com/calendar/event?eid=ZWQwc3ZpcGpuOTBoMTA5c3NoNW9wcmw5bDQgaGFydEBiYXliZXJyeWdhcmRlbi5jb20'}],attention:[{entity:'ENT-0101',title:'Revenue Growth Plan',status:'IN_PROGRESS'},{entity:'ENT-0101',title:'Labor Gear Matrix',status:'IN_PROGRESS'},{entity:'ENT-0101',title:'Resolve staffing structure',status:'OPEN'},{entity:'ENT-0101',title:'2027 budget sign-off',status:'BLOCKED'},{entity:'ENT-0102',title:'Close retain / replace inventory and capital gap',status:'OPEN'}]};
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');if(u.pathname==='/healthz'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'text/plain','Cache-Control':'no-store'});return res.end('ok')}
if(!authorized(req))return unauthorized(res);
const origin=req.headers.origin;
if(origin){
  const reqHost=req.headers.host;
  let parsed;try{parsed=new URL(origin)}catch{return response(res,403,{error:'Origin denied'})}
  if(parsed.host!==reqHost||(!['http:','https:'].includes(parsed.protocol)))return response(res,403,{error:'Origin denied'});
}if(u.pathname.startsWith('/api/')){if(req.method==='GET'&&u.pathname==='/api/status')return response(res,200,{mode:HOSTED?'hosted':'local',automaticSync:false,milesWrites:false,authenticated:Boolean(ADMIN_TOKEN),sourceSnapshotDate:snapshot.retrievedAt});if(req.method==='GET'&&u.pathname==='/api/sources')return response(res,200,{sources,snapshot});if(req.method==='GET'&&u.pathname==='/api/workboard')return response(res,200,store());if(req.method==='POST'&&u.pathname==='/api/workboard'){const b=await readBody(req);if(!allowedTypes.includes(b.type)||!allowedEntities.includes(b.entity)||!safeText(b.title)||!['OPEN','IN_PROGRESS'].includes(b.status||'OPEN'))return response(res,400,{error:'Invalid item'});const d=store();const item={id:crypto.randomUUID(),type:b.type,entity:b.entity,title:safeText(b.title),status:b.status||'OPEN',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};d.items.unshift(item);write(d);return response(res,201,item)}const match=u.pathname.match(/^\/api\/workboard\/([\w-]+)$/);if(match&&req.method==='PATCH'){const b=await readBody(req),d=store(),it=d.items.find(x=>x.id===match[1]);if(!it)return response(res,404,{error:'Not found'});if(!['OPEN','IN_PROGRESS','DONE'].includes(b.status))return response(res,400,{error:'Invalid status'});it.status=b.status;it.updatedAt=new Date().toISOString();write(d);return response(res,200,it)}if(match&&req.method==='DELETE'){const d=store(),before=d.items.length;d.items=d.items.filter(x=>x.id!==match[1]);if(d.items.length===before)return response(res,404,{error:'Not found'});write(d);return response(res,200,{ok:true})}return response(res,404,{error:'Unknown API route'})}
if(req.method!=='GET')return response(res,405,{error:'Method not allowed'});const file=u.pathname==='/'?'index.html':u.pathname.slice(1);if(!['index.html','app.js','styles.css','legacy-v1.3.html'].includes(file)){res.writeHead(404);return res.end('Not found')}const p=path.join(ROOT,'public',file);res.writeHead(200,{'Content-Type':MIME[path.extname(file)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; object-src 'none'; form-action 'self'; frame-ancestors 'none'"});fs.createReadStream(p).pipe(res)
}catch(e){response(res,500,{error:'Request failed'})}});if(require.main===module)server.listen(PORT,HOST,()=>console.log(`CIRCLE Home listening on ${HOST}:${PORT} (${HOSTED?'hosted':'local'} mode)`));module.exports={server};
