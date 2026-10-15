'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {config}=require('../lib/config');const {validateBoard,verifyBackup,digest,atomicWrite}=require('../lib/storage');
try {
  const c=config();const [command,...args]=process.argv.slice(2);const option=k=>args[args.indexOf(k)+1];
  const file=path.join(c.dataDir,'workboard.json'),marker=path.join(c.dataDir,'organization.json');
  if(fs.existsSync(marker) && JSON.parse(fs.readFileSync(marker,'utf8')).orgId!==c.orgId)throw Error('Storage organization mismatch');
  const readRaw=()=>{try{return fs.readFileSync(file,'utf8');}catch(e){if(e.code==='ENOENT')return null;throw e;}};
  const raw=readRaw();let current=null;
  try{current=validateBoard(JSON.parse(raw));}catch{}
  if(!current && !(command==='restore' && args.includes('--recover-damaged')))throw Error('Current board is missing/corrupt; preserve it and use explicit --recover-damaged for recovery');
  const checksum=raw===null?'MISSING':digest(raw);
  const exportBackup=reason=>{
    const dir=path.join(c.dataDir,'backups');fs.mkdirSync(dir,{recursive:true,mode:0o700});
    const dest=path.join(dir,`manual-${Date.now()}-${crypto.randomUUID()}.json`);
    atomicWrite(dest,{format:current?'circle-workboard-backup/v1':'circle-workboard-damaged/v1',orgId:c.orgId,createdAt:new Date().toISOString(),reason,checksum,raw});return dest;
  };
  if(command==='backup')console.log(JSON.stringify({path:exportBackup('manual-cli'),checksum,items:current.items.length}));
  else if(command==='restore') {
    if(!args.includes('--input'))throw Error('Use restore --input /absolute/backup.json (dry run by default)');
    const backup=verifyBackup(JSON.parse(fs.readFileSync(option('--input'),'utf8')),c.orgId);
    const proposed=JSON.parse(backup.raw);
    console.log(JSON.stringify({mode:args.includes('--apply')?'apply':'dry-run',currentChecksum:checksum,backupChecksum:backup.checksum,currentItems:current?.items.length ?? null,proposedItems:proposed.items.length}));
    if(args.includes('--apply')) {
      if(!args.includes('--service-stopped') || !args.includes('--expect-sha') || option('--expect-sha')!==checksum)throw Error('Restore requires a stopped service and matching --expect-sha');
      const rollback=exportBackup('before-explicit-restore');
      // Compare again immediately before replacement; never overwrite a concurrent change.
      if((readRaw()===null?'MISSING':digest(readRaw()))!==checksum)throw Error('Workboard changed during restore');
      atomicWrite(file,backup.raw);
      atomicWrite(marker,{orgId:c.orgId,workboardCreated:true});
      console.log(JSON.stringify({restored:true,checksum:digest(fs.readFileSync(file,'utf8')),rollback}));
    }
  } else throw Error('Expected backup or restore');
} catch(e){console.error(e.message);process.exitCode=1;}
