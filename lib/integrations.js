'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {GoogleClient,SourceError}=require('./google');
const {REGISTRY,FINANCIAL,parseRegistry,parseFinancial}=require('./contracts');
const {readGmail,readCalendar}=require('./communications');
const {atomicWrite,digest}=require('./storage');
const {changes,briefing}=require('./executive');
class Integrations {
  constructor(config,client=new GoogleClient(config),clock=()=>new Date()) {
    this.config=config; this.client=client; this.clock=clock; this.states={}; this.pending={};
    this.file=path.join(config.dataDir,`source-cache-${config.orgId}.json`);
    this.scope=digest({org:config.orgId,registry:config.registryId,financial:config.financialId,entity:config.financialEntity,entities:config.entities,query:config.gmailQuery,calendar:config.calendarId,account:config.googleExpectedEmail,contract:2});
    for(const id of ['registry','financial','gmail','calendar']) this.states[id]={lastAttemptAt:null,lastSuccessAt:null,error:null,data:null,changes:null,verifiedThisProcess:false};
    if(fs.existsSync(this.file)) {
      try {
        const cache=JSON.parse(fs.readFileSync(this.file,'utf8'));
        if(cache.orgId!==config.orgId || cache.scope!==this.scope) throw Error('scope');
        for(const id of Object.keys(this.states)) if(cache.states[id]?.data?.orgId===config.orgId && config.enabled[id]) this.states[id]={...this.states[id],...cache.states[id],verifiedThisProcess:false};
      } catch { this.cacheWarning='Prior source cache was rejected; fresh authenticated reads are required'; }
    }
  }
  configured(id) { return this.client.configured(['registry','financial'].includes(id)?'sheets':id) && Boolean(id==='registry'?this.config.registryId:id==='financial'?this.config.financialId:this.config.googleExpectedEmail && (id==='gmail'?this.config.gmailQuery:this.config.calendarId)); }
  async read(id) {
    if(id==='registry') return parseRegistry(await this.client.sheet(this.config.registryId,REGISTRY),this.config);
    if(id==='financial') return parseFinancial(await this.client.sheet(this.config.financialId,FINANCIAL),this.config);
    if(id==='gmail') return readGmail(this.client,this.config);
    if(id==='calendar') return readCalendar(this.client,this.config,this.clock());
    throw new SourceError('unknown_source','Unknown source');
  }
  view(id) {
    const s=this.states[id],enabled=this.config.enabled[id],configured=this.configured(id);
    let status=!enabled?'disabled':!configured?'unavailable':s.error?'error':!s.verifiedThisProcess?'awaiting_refresh':this.clock()-new Date(s.lastSuccessAt)>this.config.freshMs?'stale':'connected';
    const data=enabled?s.data:null;
    let dataThrough=null,periodStale=false;
    if(data?.weekly) { dataThrough=data.weekly.weekEnding; periodStale=this.clock()-new Date(dataThrough)>10*86400000; }
    const monthlyThrough=data?.monthly?.filter(m=>m.metrics['Net sales'].value!==null).map(m=>m.month).sort().at(-1) || null;
    return {id,enabled,configured,status,lastAttemptAt:s.lastAttemptAt,lastSuccessAt:s.lastSuccessAt,error:s.error,
      freshness:status==='connected'?'fresh read':data?'last known; not current':'unavailable',
      sourceModifiedAt:data?.sourceModifiedAt || null,dataThrough,periodStale,monthlyDataThrough:monthlyThrough,
      monthlyPeriodStale:monthlyThrough?this.clock()-new Date(monthlyThrough)>62*86400000:false,data,
      changes:enabled?s.changes:null,refreshIntervalSeconds:this.config.refreshMs/1000};
  }
  views() { return Object.fromEntries(Object.keys(this.states).map(id=>[id,this.view(id)])); }
  async refresh(id) {
    if(!this.config.enabled[id]) return this.view(id);
    if(this.pending[id]) return this.pending[id];
    this.pending[id]=this.perform(id).finally(()=>delete this.pending[id]);
    return this.pending[id];
  }
  async perform(id) {
    const s=this.states[id]; s.lastAttemptAt=this.clock().toISOString();
    try {
      const data=await this.read(id); const at=this.clock().toISOString();
      const delta=changes(s.data,data,at);
      // Preserve the most recent actual change through subsequent identical polls.
      const next={...s,data,lastSuccessAt:at,error:null,verifiedThisProcess:true,changes:delta.items.length || !s.changes ? delta : s.changes};
      const nextStates={...this.states,[id]:next};
      atomicWrite(this.file,{orgId:this.config.orgId,scope:this.scope,states:nextStates});
      this.states[id]=next;
    } catch(e) {
      s.error={code:e instanceof SourceError?e.code:'refresh_failed',message:e instanceof SourceError?e.message:'Refresh could not be completed; previous data has been retained'};
    }
    return this.view(id);
  }
  async test(id) {
    if(!Object.hasOwn(this.states,id)) throw new SourceError('unknown_source','Unknown source');
    const data=await this.read(id);
    return {id,authenticatedRead:true,contractVersion:data.contractVersion,testedAt:this.clock().toISOString(),orgId:data.orgId,
      enabled:this.config.enabled[id],sourceModifiedAt:data.sourceModifiedAt || null,
      recordCount:data.entities?.length ?? data.monthly?.length ?? data.events?.length ?? data.threads?.length,
      note:'Independent read test only. Does not enable synchronization or modify source records.'};
  }
  async refreshAll() { return Object.fromEntries(await Promise.all(Object.keys(this.states).map(async id=>[id,await this.refresh(id)]))); }
  start() {
    void this.refreshAll();
    this.timer=setInterval(()=>void this.refreshAll(),this.config.refreshMs); this.timer.unref();
  }
  stop() { clearInterval(this.timer); }
  executive() { const sources=this.views(); return {orgId:this.config.orgId,generatedAt:this.clock().toISOString(),sources,briefing:briefing(sources,this.clock()),cacheWarning:this.cacheWarning||null}; }
}
module.exports={Integrations};
