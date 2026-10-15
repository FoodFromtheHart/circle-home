'use strict';
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const {atomicWrite,digest}=require('./storage');
const {GoogleClient,SourceError,jsonRequest}=require('./google');
const {readGmail,readCalendar}=require('./communications');
const SCOPES={gmail:'https://www.googleapis.com/auth/gmail.readonly',calendar:'https://www.googleapis.com/auth/calendar.events.readonly'};
const CALLBACK='/oauth/google/callback';
class GoogleConnections {
  constructor(config,fetcher=fetch,clock=()=>Date.now()) {
    this.config=config;this.fetcher=fetcher;this.clock=clock;this.flows=new Map();this.records={};this.errors={};
    this.file=path.join(config.dataDir,'google-connections.enc.json');
    this.context=JSON.stringify({version:1,org:config.orgId,client:config.oauth.clientId,email:config.googleExpectedEmail});
    this.key=/^[a-f0-9]{64}$/i.test(config.googleTokenKey)?Buffer.from(config.googleTokenKey,'hex'):null;
    this.cookieName=config.hosted?'__Host-circle-google':'circle-google';
    if(fs.existsSync(this.file)) {
      try {
        if(!this.key)throw Error();
        const saved=JSON.parse(fs.readFileSync(this.file,'utf8'));
        if(saved.version!==1)throw Error();
        const decipher=crypto.createDecipheriv('aes-256-gcm',this.key,Buffer.from(saved.iv,'base64'));
        decipher.setAAD(Buffer.from(this.context));decipher.setAuthTag(Buffer.from(saved.tag,'base64'));
        const records=JSON.parse(Buffer.concat([decipher.update(Buffer.from(saved.data,'base64')),decipher.final()]).toString('utf8'));
        if(!records || Array.isArray(records) || Object.entries(records).some(([id,r])=>!SCOPES[id] || r.email!==config.googleExpectedEmail || typeof r.refreshToken!=='string' || !r.testedAt))throw Error();
        this.records=records;
      }catch{this.storageError='Stored Google authorization could not be opened. Restore the original key and account configuration; the existing file has been preserved.';}
    }
  }
  credentials(id) {
    if(this.storageError)return {};
    return {...this.config.oauth,refreshToken:this.records[id]?.refreshToken || this.config.oauth.refreshToken};
  }
  status() {
    const c=this.config;
    const validClientId=/^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(c.oauth.clientId || '');
    const validClientSecret=typeof c.oauth.clientSecret==='string' && c.oauth.clientSecret.length>=16 && !/\s/.test(c.oauth.clientSecret) && !c.oauth.clientSecret.endsWith('.apps.googleusercontent.com');
    const missing=[!validClientId&&'valid Google OAuth Client ID (ending in .apps.googleusercontent.com)',!validClientSecret&&'Google Client secret (not the Client ID)',!this.key&&'token encryption key',!c.googleExpectedEmail&&'expected Google email',!c.origin&&'public origin',!c.token&&'owner authentication'].filter(Boolean);
    return {expectedEmail:c.googleExpectedEmail || null,redirectUri:c.origin?c.origin+CALLBACK:null,
      setupRequired:missing,storageError:this.storageError || null,
      sources:Object.fromEntries(Object.keys(SCOPES).map(id=>[id,{canConnect:!missing.length&&!this.storageError&&Boolean(id==='gmail'?c.gmailQuery:c.calendarId),
        scopeConfigured:Boolean(id==='gmail'?c.gmailQuery:c.calendarId),linked:Boolean(this.records[id]),
        email:this.records[id]?.email || null,testedAt:this.records[id]?.testedAt || null,error:this.errors[id] || null,
        note:'Authorization is stored only after a successful authenticated read. Automatic refresh is enabled separately.'}]))};
  }
  cookie(value,maxAge=600) {return `${this.cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${this.config.hosted?'; Secure':''}`;}
  begin(id) {
    if(!SCOPES[id] || !this.status().sources[id].canConnect)throw new SourceError('configuration_missing','Complete Google connection setup and the source scope before connecting');
    for(const [state,f] of this.flows)if(f.expires<=this.clock())this.flows.delete(state);
    if(this.flows.size>=10)throw new SourceError('rate_limited','Too many pending authorizations; wait ten minutes');
    const state=crypto.randomBytes(32).toString('base64url'),browser=crypto.randomBytes(32).toString('base64url'),verifier=crypto.randomBytes(48).toString('base64url');
    this.flows.set(state,{id,browser:digest(browser),verifier,expires:this.clock()+600000});delete this.errors[id];
    const params=new URLSearchParams({client_id:this.config.oauth.clientId,redirect_uri:this.config.origin+CALLBACK,response_type:'code',
      scope:`openid email ${SCOPES[id]}`,access_type:'offline',prompt:'consent',login_hint:this.config.googleExpectedEmail,
      state,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
    return {url:`https://accounts.google.com/o/oauth2/v2/auth?${params}`,cookie:this.cookie(browser)};
  }
  async complete(params,cookieHeader='') {
    const state=params.get('state'),flow=this.flows.get(state);
    const browser=cookieHeader.split(';').map(x=>x.trim()).find(x=>x.startsWith(this.cookieName+'='))?.slice(this.cookieName.length+1);
    if(!flow || flow.expires<=this.clock() || !browser || digest(browser)!==flow.browser)throw new SourceError('authorization_expired','Authorization expired or did not originate in this browser; connect again');
    this.flows.delete(state); // Consume before any network operation; callbacks cannot be replayed.
    try {
      if(params.has('error'))throw new SourceError('consent_denied','Google authorization was not granted; the previous connection is unchanged');
      const code=params.get('code');if(!code || code.length>4096)throw new SourceError('authorization_invalid','Google authorization response was incomplete');
      const body=new URLSearchParams({grant_type:'authorization_code',code,client_id:this.config.oauth.clientId,client_secret:this.config.oauth.clientSecret,
        redirect_uri:this.config.origin+CALLBACK,code_verifier:flow.verifier});
      const grant=await jsonRequest(this.fetcher,'https://oauth2.googleapis.com/token',{method:'POST',body,headers:{'Content-Type':'application/x-www-form-urlencoded'}});
      if(!grant.refresh_token || !grant.scope?.split(' ').includes(SCOPES[flow.id]))throw new SourceError('permission_missing','Google did not grant the requested offline read access; connect again and approve that permission');
      // Test the refresh token itself, then verify account identity and read the selected source.
      const credentials={...this.config.oauth,refreshToken:grant.refresh_token};
      const client=new GoogleClient(this.config,this.fetcher,()=>credentials);
      const data=await (flow.id==='gmail'?readGmail(client,this.config):readCalendar(client,this.config,new Date(this.clock())));
      const record={refreshToken:grant.refresh_token,email:data.accountEmail,testedAt:new Date(this.clock()).toISOString()};
      const records={...this.records,[flow.id]:record};this.save(records);this.records=records;delete this.errors[flow.id];
      return {id:flow.id,authenticatedRead:true,email:record.email,testedAt:record.testedAt};
    }catch(e){this.errors[flow.id]=e instanceof SourceError?e.message:'Could not securely save authorization; the previous connection is unchanged';throw e;}
  }
  save(records) {
    if(!this.key || this.storageError)throw new SourceError('storage_unavailable','Google authorization storage is unavailable');
    const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',this.key,iv);cipher.setAAD(Buffer.from(this.context));
    const encrypted=Buffer.concat([cipher.update(JSON.stringify(records),'utf8'),cipher.final()]);
    atomicWrite(this.file,{version:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:encrypted.toString('base64')});
  }
}
module.exports={GoogleConnections,SCOPES,CALLBACK};
