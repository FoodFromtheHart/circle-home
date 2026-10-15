'use strict';
const crypto=require('node:crypto');
class SourceError extends Error {
  constructor(code, message) { super(message); this.code=code; }
}
async function jsonRequest(fetcher, url, options={}) {
  let r;
  try { r=await fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)}); }
  catch { throw new SourceError('network_error','Source request failed or timed out'); }
  if(!r.ok) {
    const code=r.status===401 ? 'authentication_failed' : r.status===403 ? 'permission_denied' : r.status===429 ? 'rate_limited' : 'source_error';
    throw new SourceError(code,`Source returned HTTP ${r.status}`);
  }
  if(Number(r.headers.get('content-length'))>10_000_000) throw new SourceError('response_too_large','Source exceeded the response limit');
  // Stream with a byte cap; do not trust Content-Length alone.
  let bytes=0; const chunks=[];
  for await (const chunk of r.body) {
    bytes+=chunk.length;
    if(bytes>10_000_000) throw new SourceError('response_too_large','Source exceeded the response limit');
    chunks.push(Buffer.from(chunk));
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new SourceError('invalid_response','Source did not return valid JSON'); }
}
class GoogleClient {
  constructor(config,fetcher=fetch,credentials=()=>config.oauth) { this.config=config; this.fetcher=fetcher; this.credentials=credentials; this.tokens={}; this.pending={}; }
  configured(kind) {
    const oauth=this.credentials(kind);
    return kind==='sheets' ? Boolean(this.config.googleServiceAccount) : Boolean(oauth?.clientId && oauth?.clientSecret && oauth?.refreshToken);
  }
  async token(kind) {
    if(this.tokens[kind]?.expires>Date.now()+60000) return this.tokens[kind].value;
    if(this.pending[kind]) return this.pending[kind];
    this.pending[kind]=this.newToken(kind).finally(()=>delete this.pending[kind]);
    return this.pending[kind];
  }
  async newToken(kind) {
    if(!this.configured(kind)) throw new SourceError('credentials_missing','Server credentials are not configured');
    let body;
    if(kind==='sheets') {
      try {
        const sa=JSON.parse(this.config.googleServiceAccount);
        if(sa.type!=='service_account' || !sa.client_email || !sa.private_key) throw Error();
        const now=Math.floor(Date.now()/1000);
        const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
        const unsigned=enc({alg:'RS256',typ:'JWT'})+'.'+enc({iss:sa.client_email,
          scope:'https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.metadata.readonly',
          aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
        const signature=crypto.sign('RSA-SHA256',Buffer.from(unsigned),sa.private_key).toString('base64url');
        body=new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:unsigned+'.'+signature});
      } catch { throw new SourceError('credentials_invalid','Invalid server service-account configuration'); }
    } else {
      const oauth=this.credentials(kind);
      body=new URLSearchParams({grant_type:'refresh_token',client_id:oauth.clientId,client_secret:oauth.clientSecret,refresh_token:oauth.refreshToken});
    }
    const r=await jsonRequest(this.fetcher,'https://oauth2.googleapis.com/token',{method:'POST',body,headers:{'Content-Type':'application/x-www-form-urlencoded'}});
    if(!r.access_token || !Number.isFinite(r.expires_in) || r.expires_in<=0) throw new SourceError('authentication_failed','Invalid token response');
    this.tokens[kind]={value:r.access_token,expires:Date.now()+r.expires_in*1000};
    return r.access_token;
  }
  async account(kind) {
    if(!this.config.googleExpectedEmail) throw new SourceError('configuration_missing','Set the expected Google account before reading personal sources');
    const identity=await jsonRequest(this.fetcher,'https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:`Bearer ${await this.token(kind)}`}});
    if(identity.email_verified!==true || !identity.sub || identity.email?.toLowerCase()!==this.config.googleExpectedEmail)
      throw new SourceError('account_mismatch','Google account does not match the configured executive account');
    return {email:identity.email.toLowerCase(),subject:identity.sub};
  }
  async get(url,kind='sheets') {
    // URLs are constructed exclusively by server adapters, never supplied by browser input or sheet cells.
    const u=new URL(url);
    if(u.protocol!=='https:' || !['sheets.googleapis.com','www.googleapis.com','gmail.googleapis.com'].includes(u.hostname)) throw new SourceError('endpoint_denied','Source endpoint denied');
    try { return await jsonRequest(this.fetcher,u,{headers:{Authorization:`Bearer ${await this.token(kind)}`}}); }
    catch(e) { if(e.code==='authentication_failed') delete this.tokens[kind]; throw e; }
  }
  async sheet(id, contracts) {
    if(!/^[\w-]+$/.test(id)) throw new SourceError('configuration_missing','Spreadsheet ID is missing or invalid');
    const root=`https://sheets.googleapis.com/v4/spreadsheets/${id}`;
    const fileUrl=`https://www.googleapis.com/drive/v3/files/${id}?fields=id,modifiedTime,version&supportsAllDrives=true`;
    const before=await this.get(fileUrl);
    const meta=await this.get(`${root}?fields=spreadsheetId,properties(title,timeZone),sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))`);
    const definitions=contracts.map(c=>{
      const p=meta.sheets?.find(s=>s.properties.title===c.tab)?.properties;
      if(!p) throw new SourceError('contract_mismatch',`Required tab missing: ${c.tab}`);
      // Fail rather than silently truncate a growing table.
      if(p.gridProperties.rowCount>10000) throw new SourceError('range_limit',`Tab ${c.tab} needs an explicit larger range contract`);
      return {...c,gid:p.sheetId,range:`'${c.tab.replaceAll("'","''")}'!A1:${c.endColumn||'Z'}${p.gridProperties.rowCount}`};
    });
    const params=new URLSearchParams({valueRenderOption:'UNFORMATTED_VALUE',dateTimeRenderOption:'SERIAL_NUMBER'});
    definitions.forEach(c=>params.append('ranges',c.range));
    const values=await this.get(`${root}/values:batchGet?${params}`);
    if(values.spreadsheetId!==id || values.valueRanges?.length!==definitions.length) throw new SourceError('contract_mismatch','Incomplete spreadsheet response');
    const file=await this.get(fileUrl);
    if(before.version && file.version && before.version!==file.version) throw new SourceError('source_changed','Spreadsheet changed during refresh; retry on the next refresh');
    return {id,title:meta.properties?.title,timeZone:meta.properties?.timeZone,modifiedAt:file.modifiedTime || null,version:file.version || null,
      tables:Object.fromEntries(definitions.map((c,i)=>[c.tab,{...c,values:values.valueRanges[i].values || []}]))};
  }
}
module.exports={GoogleClient,SourceError,jsonRequest};
