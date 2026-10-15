'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {config}=require('../lib/config');const {createApp,roleFor}=require('../server');
const {snapshot,sources}=require('../lib/archive');
const basic=(user,secret)=>'Basic '+Buffer.from(user+':'+secret).toString('base64');

test('existing guest surface is preserved without access to live Google data or owner operations',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'circle-guest-'));
  const c=config({HOST:'0.0.0.0',CIRCLE_DATA_DIR:dir,CIRCLE_ADMIN_TOKEN:'synthetic-owner-token-over-32-characters',CIRCLE_VIEWER_TOKEN:'synthetic-viewer-token-over-32-characters'});
  let privateReads=0;
  const integrations={executive(){privateReads++;throw Error('private source read');},views(){privateReads++;throw Error('private source status');},stop(){}};
  const connections={status(){privateReads++;throw Error('private connection status');}};
  const app=createApp(c,{integrations,connections});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{await new Promise(resolve=>app.server.close(resolve));fs.rmSync(dir,{recursive:true,force:true});});
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const headers={Authorization:basic('brian',c.viewerToken),'Content-Type':'application/json'};
  const before=app.board.checksum();
  const status=await (await fetch(base+'/api/status',{headers})).json();assert.equal(status.role,'viewer');assert.equal(status.automaticSync,false);
  const archive=await (await fetch(base+'/api/sources',{headers})).json();assert.deepEqual(archive,{sources,snapshot});assert(!archive.googleConnection);
  assert.equal((await fetch(base+'/api/workboard',{headers})).status,200);
  assert.match(await (await fetch(base+'/',{headers})).text(),/viewer-note/);
  assert.match(await (await fetch(base+'/app.js',{headers})).text(),/Read-only guest access/);
  for(const [method,url] of [
    ['GET','/api/executive'],['GET','/oauth/google/callback?code=synthetic-code'],
    ['GET','/api/google/connect'],['POST','/api/google/connect'],['POST','/api/refresh'],
    ...['registry','financial','gmail','calendar'].map(id=>['POST',`/api/integrations/${id}/test`]),
    ['POST','/api/workboard/backup'],['POST','/api/workboard'],['PATCH','/api/workboard/example'],['DELETE','/api/workboard/example'],
    ['GET','/google-connections.enc.json'],['GET','/source-cache-circle.json'],['GET','/guest-index.html'],['GET','/guest-app.js']
  ])assert.equal((await fetch(base+url,{method,headers,body:method==='GET'?undefined:'{}',redirect:'manual'})).status,403,method+' '+url);
  assert.equal(privateReads,0);assert.equal(app.board.checksum(),before);
  assert.equal((await fetch(base+'/api/sources')).status,401);
  assert.equal((await fetch(base+'/api/status',{headers:{Authorization:basic('circle',c.viewerToken)}})).status,401);
  const owner=await (await fetch(base+'/',{headers:{Authorization:basic('circle',c.token)}})).text();assert.match(owner,/googleconnect/);
});

test('guest credentials fail closed when absent, short, wrong or used outside CIRCLE',()=>{
  const c=config({CIRCLE_ADMIN_TOKEN:'synthetic-owner-token-over-32-characters'});
  const request=secret=>({headers:{authorization:basic('brian',secret)}});
  assert.equal(roleFor(request(''),c),null);
  assert.equal(roleFor(request('short'),{...c,viewerToken:'short'}),null);
  const token='synthetic-viewer-token-over-32-characters';
  assert.equal(roleFor(request('wrong'),{...c,viewerToken:token}),null);
  assert.equal(roleFor(request(token),{...c,viewerToken:token}), 'viewer');
  assert.equal(roleFor(request(token),{...c,viewerToken:token,isCircle:false}),null);
});
