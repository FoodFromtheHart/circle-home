'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const crypto=require('node:crypto');
const {config}=require('../lib/config');const {GoogleConnections,SCOPES,CALLBACK}=require('../lib/google-connect');
const {GoogleClient}=require('../lib/google');const {Integrations}=require('../lib/integrations');
function setup(t,extra={}) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'circle-oauth-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  return config({CIRCLE_DATA_DIR:dir,CIRCLE_ADMIN_TOKEN:'synthetic-owner-token-over-32-characters',CIRCLE_PUBLIC_ORIGIN:'https://circle.example',
    CIRCLE_GOOGLE_OAUTH_CLIENT_ID:'123456789012-syntheticclient.apps.googleusercontent.com',CIRCLE_GOOGLE_OAUTH_CLIENT_SECRET:'synthetic-client-secret',CIRCLE_GOOGLE_TOKEN_KEY:crypto.randomBytes(32).toString('hex'),
    CIRCLE_GOOGLE_EXPECTED_EMAIL:'executive@example.test',CIRCLE_GMAIL_QUERY:'newer_than:30d subject:synthetic',CIRCLE_CALENDAR_ID:'executive@example.test',...extra});
}
function transport(settings={}) {
  const calls=[];
  return {calls,fetcher:async(url,opts)=>{
    url=new URL(url);calls.push({url,opts});let result;
    if(url.hostname==='oauth2.googleapis.com') {
      assert.equal(opts.method,'POST');assert.equal(opts.redirect,'error');
      if(opts.body.get('grant_type')==='authorization_code')result={refresh_token:'synthetic-refresh-private',scope:settings.scope || SCOPES.gmail};
      else {assert.equal(opts.body.get('refresh_token'),'synthetic-refresh-private');result={access_token:'synthetic-access-private',expires_in:3600};}
    } else {
      assert.equal(opts.method,undefined,'all identity and data requests are GET');assert.equal(opts.headers.Authorization,'Bearer synthetic-access-private');
      if(url.hostname==='openidconnect.googleapis.com')result={sub:'synthetic-id',email:settings.email || 'executive@example.test',email_verified:settings.verified!==false};
      else if(settings.failRead)return new Response('private upstream failure',{status:403});
      else if(url.pathname.endsWith('/events'))result={items:[{id:'meeting',summary:'Synthetic invitation',status:'confirmed',start:{date:'2026-10-17'},end:{date:'2026-10-18'},attendees:[{self:true,responseStatus:'needsAction'}]}]};
      else if(url.pathname.endsWith('/threads'))result={threads:[{id:'thread'}]};
      else result={id:'thread',messages:[{internalDate:'1792022400000',payload:{headers:[{name:'Subject',value:'Synthetic subject'}]}}]};
    }
    return new Response(JSON.stringify(result));
  }};
}
function flow(connections,id='gmail') {const f=connections.begin(id);const url=new URL(f.url);return {...f,url,params:new URLSearchParams({state:url.searchParams.get('state'),code:'synthetic-code'})};}

test('misplaced Google client credentials block consent with actionable nonsecret setup labels',t=>{
  const c=setup(t);c.oauth.clientSecret=c.oauth.clientId;c.oauth.clientId='Web application name';
  const connections=new GoogleConnections(c);
  const status=connections.status();assert.equal(status.sources.gmail.canConnect,false);
  assert(status.setupRequired.some(x=>x.includes('Client ID')));assert(status.setupRequired.some(x=>x.includes('Client secret')));
  assert(!JSON.stringify(status).includes(c.oauth.clientSecret));
  assert.throws(()=>connections.begin('gmail'),e=>e.code==='configuration_missing');
});

test('OAuth independently tests offline access before persisting encrypted credentials; restarts recover them',async t=>{
  const c=setup(t),http=transport(),connections=new GoogleConnections(c,http.fetcher),f=flow(connections);
  assert.equal(f.url.hostname,'accounts.google.com');assert.equal(f.url.searchParams.get('login_hint'),c.googleExpectedEmail);
  assert(!f.url.searchParams.get('scope').includes('calendar'));assert(!f.url.href.includes(c.oauth.clientSecret));
  const linked=await connections.complete(f.params,f.cookie);assert(linked.authenticatedRead);assert.equal(linked.email,c.googleExpectedEmail);
  const tokenRequest=http.calls[0].opts.body;
  assert.equal(crypto.createHash('sha256').update(tokenRequest.get('code_verifier')).digest('base64url'),f.url.searchParams.get('code_challenge'));
  assert.equal(tokenRequest.get('redirect_uri'),c.origin+CALLBACK);assert.equal(http.calls[1].opts.body.get('grant_type'),'refresh_token');
  const saved=fs.readFileSync(connections.file,'utf8');assert(!saved.includes('synthetic-refresh'));assert.equal(fs.statSync(connections.file).mode&0o777,0o600);
  const reopened=new GoogleConnections(c,http.fetcher);assert.equal(reopened.credentials('gmail').refreshToken,'synthetic-refresh-private');assert(!reopened.status().sources.calendar.linked);
  assert(!JSON.stringify(reopened.status()).includes('synthetic-refresh'));assert.equal(c.enabled.gmail,false);
  const manager=new Integrations(c,new GoogleClient(c,http.fetcher,id=>reopened.credentials(id)));assert.equal((await manager.test('gmail')).authenticatedRead,true);assert.equal(manager.view('gmail').status,'disabled');
  c.enabled.gmail=true;await manager.refresh('gmail');assert.equal(manager.view('gmail').status,'connected');assert(manager.view('gmail').data.threads[0].source.url.includes('authuser=executive%40example.test'));
  await assert.rejects(()=>connections.complete(f.params,f.cookie),e=>e.code==='authorization_expired');
});

test('state, browser binding, expiry and owner consent protect the callback',async t=>{
  const c=setup(t),http=transport();let now=Date.now();const connections=new GoogleConnections(c,http.fetcher,()=>now),f=flow(connections);
  await assert.rejects(()=>connections.complete(f.params,'circle-google=wrong'),e=>e.code==='authorization_expired');assert.equal(http.calls.length,0);
  now+=600001;await assert.rejects(()=>connections.complete(f.params,f.cookie),e=>e.code==='authorization_expired');
  const denied=flow(connections);denied.params.set('error','access_denied');await assert.rejects(()=>connections.complete(denied.params,denied.cookie),e=>e.code==='consent_denied');
  assert.equal(http.calls.length,0);assert(!fs.existsSync(connections.file));
});

test('wrong account, unverified email, missing scope and failed reads never replace saved authorization',async t=>{
  const c=setup(t),good=transport(),connections=new GoogleConnections(c,good.fetcher),f=flow(connections);await connections.complete(f.params,f.cookie);
  const before=fs.readFileSync(connections.file,'utf8');
  for(const settings of [{email:'personal@example.test'},{verified:false},{scope:SCOPES.calendar},{failRead:true}]) {
    const http=transport(settings);connections.fetcher=http.fetcher;const retry=flow(connections);
    await assert.rejects(()=>connections.complete(retry.params,retry.cookie));assert.equal(fs.readFileSync(connections.file,'utf8'),before);
    if(settings.email || settings.verified===false)assert(!http.calls.some(x=>x.url.hostname==='gmail.googleapis.com'));
  }
  for(const changed of [{...c,googleTokenKey:'a'.repeat(64)},{...c,orgId:'other'},{...c,googleExpectedEmail:'other@example.test'}]) {
    const rejected=new GoogleConnections(changed,good.fetcher);assert(rejected.status().storageError);assert.equal(rejected.status().sources.gmail.canConnect,false);assert.deepEqual(rejected.credentials('gmail'),{});assert.equal(fs.readFileSync(rejected.file,'utf8'),before);
  }
});

test('Calendar consent uses only its own data scope and retains the invitation response',async t=>{
  const c=setup(t),http=transport({scope:SCOPES.calendar}),connections=new GoogleConnections(c,http.fetcher),f=flow(connections,'calendar');
  assert(!f.url.searchParams.get('scope').includes('gmail'));await connections.complete(f.params,f.cookie);
  const manager=new Integrations(c,new GoogleClient(c,http.fetcher,id=>connections.credentials(id)));const data=await manager.read('calendar');
  assert.equal(data.events[0].status,'confirmed');assert.equal(data.events[0].responseStatus,'needsAction');assert(!connections.status().sources.gmail.linked);
});
