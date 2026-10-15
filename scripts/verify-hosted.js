'use strict';
// Read-only probe. Receives the owner token via the environment, never arguments/output.
const assert=require('node:assert/strict');
(async()=>{
  const origin=process.env.CIRCLE_VERIFY_ORIGIN;
  assert(origin && new URL(origin).protocol==='https:','Set CIRCLE_VERIFY_ORIGIN to the HTTPS service origin');
  for(const route of ['/','/app.js','/api/status','/api/sources','/api/executive','/api/workboard']){
    const r=await fetch(new URL(route,origin),{redirect:'error',signal:AbortSignal.timeout(20000)});assert.equal(r.status,401,`${route} must deny unauthenticated access`);
  }
  assert.equal(await (await fetch(new URL('/healthz',origin))).text(),'ok');
  const evidence={unauthenticatedAccess:'denied',checkedAt:new Date().toISOString(),origin};
  if(process.env.CIRCLE_ADMIN_TOKEN){
    const headers={Authorization:'Basic '+Buffer.from('circle:'+process.env.CIRCLE_ADMIN_TOKEN).toString('base64')};
    const request=async route=>{const r=await fetch(new URL(route,origin),{headers,redirect:'error',signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);return r.json();};
    const status=await request('/api/status');const board=await request('/api/workboard');
    assert.equal(status.mode,'hosted');assert.equal(status.authenticated,true);assert.equal(status.milesWrites,false);
    const executive=await request('/api/executive');
    Object.assign(evidence,{revision:status.revision,bootId:status.storage.bootId,workboardChecksum:status.storage.checksum,itemCount:board.items.length,mountPoint:status.storage.mountPoint,connections:Object.fromEntries(Object.entries(executive.sources).map(([id,s])=>[id,{status:s.status,lastSuccessAt:s.lastSuccessAt,error:s.error}]))});
  }else evidence.ownerChecks='not run: credentials absent';
  console.log(JSON.stringify(evidence,null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
