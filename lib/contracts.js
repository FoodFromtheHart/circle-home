'use strict';
const {SourceError}=require('./google');
const REGISTRY=[
  ['Entities','entity_id','entity_name','entity_type','operating_status','active'],
  ['Roles','role_id','role_name'],
  ['Executive Portfolio','portfolio_item_id','entity_id','portfolio_status','current_priority','next_gate','capital_need','owner_role_id','next_milestone','active_decision_id','major_blocker','authoritative_document_id'],
  ['Development Projects','project_id','entity_id','stage','next_gate','owner_role_id','blocker','authoritative_document_id'],
  ['Actions','action_id','entity_id','title','status','priority','owner_role_id','due_date','blocker'],
  ['Decisions','decision_id','entity_id','decision_date','decision','owner_role_id','status'],
  ['Miles Attention','source_id','entity_id','signal_type','title','status','priority','owner_role_id','source_surface','detail'],
  ['Executive Review','metric_id','entity_id','metric_name','period_end','actual_value','target_value','variance','review_signal','source_record','provenance_note'],
  ['Documents','document_id','entity_id','title','status','drive_url','authoritative'],
  ['Object Contracts','domain','owned_object','canonical_id','source_surface','boundary'],
  ['Permission Contracts','permission_id','object','miles_behavior','enforcement_now','status'],
  ['Attention Model','signal_id','signal','default_weight','status']
].map(([tab,...headers])=>({tab,headers,endColumn:'Z'}));
const FINANCIAL=['Overview','Weekly review','Monthly review','Refresh','Toast sync log'].map(tab=>({tab,endColumn:'Z'}));
function fail(message) { throw new SourceError('contract_mismatch',message); }
function source(doc,tab,row=1,columns='Z') {
  const t=doc.tables[tab];
  return {spreadsheetId:doc.id,tab,range:`A${row}:${columns}${row}`,url:`https://docs.google.com/spreadsheets/d/${doc.id}/edit#gid=${t.gid}&range=A${row}:${columns}${row}`};
}
function table(doc,contract) {
  const rows=doc.tables[contract.tab]?.values;
  if(!rows?.length) fail(`Empty required tab: ${contract.tab}`);
  const header=rows[0].map(String);
  for(const h of contract.headers) if(!header.includes(h)) fail(`${contract.tab}: missing column ${h}`);
  const keys=header.filter(Boolean);
  if(new Set(keys).size!==keys.length) fail(`${contract.tab}: duplicate columns`);
  return rows.slice(1).map((r,i)=>({ ...Object.fromEntries(header.map((h,j)=>[h,r[j]??null]).filter(([h])=>h)),source:source(doc,contract.tab,i+2)})).filter(r=>r[header[0]]!==null);
}
function safeUrl(value) { try { const u=new URL(value); return u.protocol==='https:' && !u.username && !u.password ? u.href : null; } catch { return null; } }
function date(value) {
  if(typeof value==='number' && Number.isFinite(value) && value>1) return new Date(Date.UTC(1899,11,30)+value*86400000).toISOString().slice(0,10);
  if(typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value) return value;
  return null;
}
function number(value) { return typeof value==='number' && Number.isFinite(value) ? value : null; }
function quality(status) {
  const s=String(status || '').toLowerCase();
  if(!s || /pending|not connected|unavailable/.test(s)) return 'unavailable';
  if(/provisional|unverified|legacy|estimate|unreconciled|planning|classification|unclassified/.test(s)) return 'provisional';
  if(/verified|reconciled|closed/.test(s)) return 'verified';
  return 'provisional';
}
function parseRegistry(doc,config) {
  const tables=Object.fromEntries(REGISTRY.map(c=>[c.tab,table(doc,c)]));
  const scope=new Set(config.entities);
  const entities=tables.Entities.filter(r=>scope.has(r.entity_id));
  if(entities.length!==scope.size) fail('One or more scoped entities are absent from the Registry');
  if(new Set(entities.map(e=>e.entity_id)).size!==entities.length) fail('Duplicate entity IDs');
  if(config.isCircle) {
    for(const [id,name] of [['ENT-0101','Bayberry Garden'],['ENT-0102','ATLAS']]) if(entities.find(e=>e.entity_id===id)?.entity_name!==name) fail(`Canonical identity mismatch: ${id}`);
  }
  for(const [name,rows] of Object.entries(tables)) if(name!=='Entities' && REGISTRY.find(c=>c.tab===name).headers.includes('entity_id')) tables[name]=rows.filter(r=>scope.has(r.entity_id) || (name==='Documents' && !r.entity_id));
  const project=tables['Development Projects'].find(r=>r.project_id==='DEV-0102');
  if(config.isCircle && project?.entity_id!=='ENT-0102') fail('ATLAS development identity mismatch');
  const ids={Entities:'entity_id','Roles':'role_id','Actions':'action_id','Decisions':'decision_id','Development Projects':'project_id','Executive Portfolio':'portfolio_item_id','Executive Review':'metric_id','Documents':'document_id'};
  tables.Entities=entities;
  for(const [name,key] of Object.entries(ids)) if(new Set(tables[name].map(r=>r[key])).size!==tables[name].length) fail(`Duplicate IDs in ${name}`);
  tables.Documents=tables.Documents.map(r=>({...r,drive_url:safeUrl(r.drive_url)}));
  tables.Actions=tables.Actions.map(r=>({...r,normalizedDueDate:date(r.due_date)}));
  return {contractVersion:'circle-registry/v1',orgId:config.orgId,sourceModifiedAt:doc.modifiedAt,sourceVersion:doc.version,
    entities,portfolio:tables['Executive Portfolio'],projects:tables['Development Projects'],actions:tables.Actions,decisions:tables.Decisions,
    attention:tables['Miles Attention'],reviews:tables['Executive Review'],documents:tables.Documents,roles:tables.Roles,
    objectContracts:tables['Object Contracts'],permissionContracts:tables['Permission Contracts'],attentionModel:tables['Attention Model'],
    excludedEntityCount:table(doc,REGISTRY[0]).length-entities.length};
}
function labelRow(doc,tab,label,start=0,end=Infinity,required=true) {
  const rows=doc.tables[tab].values;
  const found=rows.map((r,i)=>({row:r,index:i+1})).filter(x=>x.index>start && x.index<=end && x.row[2]===label);
  if(found.length!==1) { if(required) fail(`${tab}: expected one ${label} row`); return null; }
  return found[0];
}
function parseFinancial(doc,config) {
  if(!config.entities.includes(config.financialEntity)) fail('Financial entity is outside the organization scope');
  const selected=labelRow(doc,'Weekly review','Selected week');
  const weekEnding=date(selected.row[3]);
  if(!weekEnding) fail('Selected financial week is not a valid date');
  const metric=(label,required=true)=>{
    const r=labelRow(doc,'Weekly review',label,8,36,required);
    if(!r) return null;
    return {label,value:number(r.row[3]),prior:number(r.row[4]),change:number(r.row[5]),sourceStatus:r.row[6] || 'Unspecified',quality:number(r.row[3])===null?'unavailable':quality(r.row[6]),source:source(doc,'Weekly review',r.index)};
  };
  const weekly={weekEnding,netSales:metric('Net sales'),covers:metric('Covers'),salesPerCover:metric('Net sales per cover'),wages:metric('Salary + hourly wages'),wagesRatio:metric('Wages / net sales'),loadedLabor:metric('Loaded labor'),foodPurchases:metric('Food purchases'),foodPurchaseRatio:metric('Food purchases / food sales')};
  const trendHeader=labelRow(doc,'Weekly review','Metric',36,60);
  if(trendHeader.row[4]!=='Prior 4-week baseline') fail('Weekly trend contract changed');
  const trends=['Net sales','Covers','Net sales per cover'].map(label=>{
    const r=labelRow(doc,'Weekly review',label,trendHeader.index,trendHeader.index+7);
    return {label,current:number(r.row[3]),priorFour:number(r.row[4]),changeRatio:number(r.row[5]),reading:r.row[6] || null,quality:weekly.netSales.quality,source:source(doc,'Weekly review',r.index)};
  });
  const monthHeader=labelRow(doc,'Monthly review','Metric',0,6);
  const close=labelRow(doc,'Monthly review','Close status');
  const monthlyLabels=['Net sales','2026 net sales budget','Net sales vs budget','Food COGS / food sales','Total labor / net sales','Reported net income','Reported EBITDA','Visible-line residual vs reported NI⁵'];
  const rows=Object.fromEntries(monthlyLabels.map(label=>[label,labelRow(doc,'Monthly review',label)]));
  const monthly=Array.from({length:12},(_,i)=>{
    const col=i+3; const month=date(monthHeader.row[col]);
    if(!month) fail('Monthly date columns changed');
    return {month,closeStatus:close.row[col] || 'Pending',quality:quality(close.row[col]),metrics:Object.fromEntries(monthlyLabels.map(label=>[label,{value:number(rows[label].row[col]),source:source(doc,'Monthly review',rows[label].index)}]))};
  });
  const refresh=doc.tables.Refresh.values;
  if(refresh[5]?.[2]!=='Source' || refresh[5]?.[4]!=='Connection') fail('Refresh source contract changed');
  const readiness=refresh.slice(6,11).filter(r=>r[2]).map((r,i)=>({name:r[2],destination:r[3],connection:r[4],dataThrough:date(r[5]),savedImportEastern:r[6] || null,requiredNext:r[7] || null,source:source(doc,'Refresh',i+7)}));
  const checks=['Sales history','Selected sales check','Financial close','Planning completeness'].map(label=>{
    const r=labelRow(doc,'Overview',label); return {label,detail:r.row[3],source:source(doc,'Overview',r.index)};
  });
  const log=doc.tables['Toast sync log'].values;
  if(log[2]?.[0]!=='Run ID' || log[2]?.[5]!=='Result') fail('Toast reconciliation log contract changed');
  const reconciliation=log.slice(3).map((r,i)=>({runId:r[0],startedEastern:r[1],finishedEastern:r[2] || null,weekEnding:date(r[3]),result:r[5],message:r[7],source:source(doc,'Toast sync log',i+4)})).filter(r=>r.weekEnding===weekEnding).sort((a,b)=>String(b.startedEastern).localeCompare(String(a.startedEastern)))[0] || null;
  return {contractVersion:'bayberry-financial/v1',orgId:config.orgId,entityId:config.financialEntity,sourceModifiedAt:doc.modifiedAt,sourceVersion:doc.version,
    weekly,trends,monthly,readiness,checks,reconciliation,
    limitations:['Authenticated retrieval does not certify a financial close.','Purchases are spend, not inventory-adjusted food cost.','A Toast log VERIFIED result does not upgrade provisional workbook figures.']};
}
module.exports={REGISTRY,FINANCIAL,parseRegistry,parseFinancial,quality,date,number,safeUrl};
