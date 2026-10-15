'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const digest = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
function atomicWrite(file, value) {
  const data = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  let fd;
  try {
    fd = fs.openSync(temp, 'wx', 0o600);
    fs.writeFileSync(fd, data); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    fs.renameSync(temp, file);
    const dir = fs.openSync(path.dirname(file), 'r');
    try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    try { fs.unlinkSync(temp); } catch(e) { if(e.code !== 'ENOENT') throw e; }
  }
}
function validateBoard(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.items) || data.items.some(x=>!x || typeof x.id!=='string' || typeof x.title!=='string') || new Set(data.items.map(x=>x.id)).size !== data.items.length) throw Error('Invalid workboard; existing file has been preserved');
  return data;
}
function mountedVolume(dir) {
  try {
    const mounts = fs.readFileSync('/proc/self/mountinfo','utf8').split('\n').map(x=>x.split(' ')[4]).filter(Boolean).map(x=>x.replace(/\\040/g,' '));
    const real = fs.realpathSync(dir);
    return mounts.filter(m=>m !== '/' && (real === m || real.startsWith(m + '/'))).sort((a,b)=>b.length-a.length)[0] || null;
  } catch { return null; }
}
class Workboard {
  constructor(dir, orgId) {
    this.dir=dir; this.orgId=orgId; this.file=path.join(dir,'workboard.json'); this.backupDir=path.join(dir,'backups');
    fs.mkdirSync(dir,{recursive:true,mode:0o700});
    const marker=path.join(dir,'organization.json');
    this.marker=marker;
    this.mustExist=false;
    if (fs.existsSync(marker)) {
      const identity=JSON.parse(fs.readFileSync(marker,'utf8'));
      if (identity.orgId !== orgId) throw Error('Storage organization mismatch');
      this.mustExist=Boolean(identity.workboardCreated);
    } else {
      if (orgId!=='circle' && fs.existsSync(this.file)) throw Error('Cannot adopt unscoped workboard into an external organization');
      this.read(); // Fail before writing metadata if the existing board is corrupt.
      atomicWrite(marker,{orgId,createdAt:new Date().toISOString()});
    }
    if(fs.existsSync(this.file)) {
      this.mustExist=true;
      atomicWrite(marker,{...JSON.parse(fs.readFileSync(marker,'utf8')),workboardCreated:true});
    }
    fs.mkdirSync(this.backupDir,{recursive:true,mode:0o700});
    this.read();
    this.startedAt=new Date().toISOString();
    this.bootId=crypto.randomUUID();
    const previousFile=path.join(dir,'last-start.json');
    let previous=null;
    if(fs.existsSync(previousFile)) previous=JSON.parse(fs.readFileSync(previousFile,'utf8'));
    this.previousStart=previous;
    atomicWrite(previousFile,{bootId:this.bootId,startedAt:this.startedAt,workboardChecksum:this.checksum()});
    if(fs.existsSync(this.file)) this.backup('startup');
  }
  raw() { try { return fs.readFileSync(this.file,'utf8'); } catch(e) { if(e.code==='ENOENT' && !this.mustExist) return null; throw e; } }
  read() { const raw=this.raw(); return raw===null ? {version:1,items:[]} : validateBoard(JSON.parse(raw)); }
  checksum() { return digest(this.raw() || JSON.stringify({version:1,items:[]})); }
  envelope(reason) {
    const raw=this.raw();
    return {format:'circle-workboard-backup/v1',orgId:this.orgId,createdAt:new Date().toISOString(),reason,
      checksum:digest(raw || JSON.stringify({version:1,items:[]})),raw:raw || JSON.stringify({version:1,items:[]})};
  }
  backup(reason='manual') {
    this.read();
    const result=this.envelope(reason);
    const filename=`${result.createdAt.replace(/[:.]/g,'-')}-${crypto.randomUUID()}.json`;
    atomicWrite(path.join(this.backupDir,filename),result);
    // Bounded application snapshots; off-volume exports are an independent backup.
    const files=fs.readdirSync(this.backupDir).filter(x=>/^\d{4}-.*\.json$/.test(x)).sort();
    for (const old of files.slice(0,-100)) fs.unlinkSync(path.join(this.backupDir,old));
    return result;
  }
  mutate(expected, fn) {
    if (!expected) throw Object.assign(Error('Reload the workboard before changing it'),{status:428});
    if (expected.replaceAll('"','') !== this.checksum()) throw Object.assign(Error('Workboard changed in another session; reload and retry'),{status:409});
    const data=this.read(); const result=fn(data);
    validateBoard(data); this.backup('before-change');
    atomicWrite(this.marker,{...JSON.parse(fs.readFileSync(this.marker,'utf8')),workboardCreated:true});
    this.mustExist=true;
    atomicWrite(this.file,data);
    return result;
  }
  status() {
    return {kind:'application workboard; provisional',orgId:this.orgId,path:this.dir,writable:true,
      mountPoint:mountedVolume(this.dir),volumeVerification:'Mount detection is not a restart or durability test',
      workboardExists:fs.existsSync(this.file),checksum:this.checksum(),itemCount:this.read().items.length,
      backupCount:fs.readdirSync(this.backupDir).filter(x=>x.endsWith('.json')).length,
      bootId:this.bootId,startedAt:this.startedAt,previousStart:this.previousStart};
  }
}
function verifyBackup(backup, orgId) {
  if (backup.format!=='circle-workboard-backup/v1' || backup.orgId!==orgId || typeof backup.raw!=='string' || digest(backup.raw)!==backup.checksum) throw Error('Backup organization, format, or checksum mismatch');
  validateBoard(JSON.parse(backup.raw)); return backup;
}
module.exports={Workboard,atomicWrite,digest,validateBoard,verifyBackup};
