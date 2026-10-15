'use strict';
const {digest}=require('./storage');
function records(data) {
  if(!data) return [];
  if(data.entities) return [ ...data.actions.map(x=>({id:x.action_id,label:x.title,source:x.source,value:x})),
    ...data.decisions.map(x=>({id:x.decision_id,label:x.decision,source:x.source,value:x})),
    ...data.projects.map(x=>({id:x.project_id,label:x.next_gate,source:x.source,value:x})),
    ...data.portfolio.map(x=>({id:x.portfolio_item_id,label:x.current_priority,source:x.source,value:x}))];
  if(data.weekly) return [{id:`financial:${data.weekly.weekEnding}`,label:`Weekly performance · ${data.weekly.weekEnding}`,source:data.weekly.netSales.source,value:data.weekly},
    ...data.monthly.map(x=>({id:`financial:${x.month}`,label:`Monthly financials · ${x.month}`,source:x.metrics['Net sales'].source,value:x}))];
  return (data.threads || data.events || []).map(x=>({id:x.id,label:x.title,source:x.source,value:x}));
}
function changes(before,after,at) {
  if(!before) return {baseline:true,observedAt:at,items:[]};
  const old=new Map(records(before).map(x=>[x.id,x])); const current=records(after); const found=[];
  for(const x of current) {
    const previous=old.get(x.id);
    // Row moves change provenance links, but are not business-state changes.
    const comparable=v=>Object.fromEntries(Object.entries(v).filter(([k])=>k!=='source'));
    if(!previous || digest(comparable(previous.value))!==digest(comparable(x.value))) found.push({id:x.id,title:x.label,kind:previous?'changed':'added',source:x.source});
    old.delete(x.id);
  }
  for(const x of old.values()) found.push({id:x.id,title:x.label,kind:'no longer in source view',source:x.source});
  return {baseline:false,observedAt:at,items:found};
}
function briefing(sources,now=new Date()) {
  const r=sources.registry.data; const f=sources.financial.data;
  const warnings=Object.entries(sources).filter(([,s])=>s.status!=='connected').map(([id,s])=>`${id}: ${s.status}${s.data ? ' — last-known information only' : ''}`);
  if(!r) return {warnings,attention:[],decisions:[],portfolio:[],summary:['Registry information is unavailable. No current executive priorities can be inferred.']};
  const roles=new Map(r.roles.map(x=>[x.role_id,x.role_name]));
  const names=new Map(r.entities.map(x=>[x.entity_id,x.entity_name]));
  const weights=new Map(r.attentionModel.filter(x=>x.status==='ACTIVE').map(x=>[x.signal,Number(x.default_weight)||0]));
  const byId=new Map();
  const add=(id,entity,title,status,owner,blocker,due,next,priority,source)=>{
    if(['DONE','COMPLETE','CLOSED','SUPERSEDED','RETIRED'].includes(status)) return;
    const reasons=[];
    if(blocker || status==='BLOCKED') reasons.push({signal:'BLOCKED',text:blocker || 'Explicitly blocked'});
    // Deadline signals are displayed, but draft Registry weights are never activated here.
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(x=>[x.type,x.value]));
    const today=`${parts.year}-${parts.month}-${parts.day}`;
    const dueDays=due?(Date.parse(due)-Date.parse(today))/86400000:NaN;
    if(Number.isFinite(dueDays) && dueDays<=7) reasons.push({signal:'DEADLINE_NEAR',text:`${dueDays<0?'Overdue':'Due'} ${due}`});
    if(!owner) reasons.push({signal:'UNOWNED',text:'Owner not recorded'});
    if(next && /^(DEV|PORT)-/.test(id)) reasons.push({signal:'NEXT_GATE',text:next});
    if(status==='REVIEW') reasons.push({signal:'VARIANCE_REVIEW',text:'Source requests variance review'});
    if(['OPEN','READY'].includes(status)) reasons.push({signal:'READY_WORK',text:'Source marks work ready/open'});
    const x={id,entity,entityName:names.get(entity)||entity,title,status,owner:roles.get(owner)||owner||'Owner not recorded',ownerRoleId:owner,blocker,dueDate:due,nextAction:next || null,priority,
      attentionScore:reasons.reduce((s,r)=>s+(weights.get(r.signal)||0),0),reasons,source,
      sourceState:sources.registry.status,sourceRetrievedAt:sources.registry.lastSuccessAt};
    if(!byId.has(id)) byId.set(id,x);
  };
  for(const x of r.actions) add(x.action_id,x.entity_id,x.title,x.status,x.owner_role_id,x.blocker,x.normalizedDueDate,x.title,x.priority,x.source);
  for(const x of r.projects) add(x.project_id,x.entity_id,x.next_gate,x.stage,x.owner_role_id,x.blocker,null,x.next_gate,null,x.source);
  for(const x of r.portfolio) add(x.portfolio_item_id,x.entity_id,x.current_priority,x.portfolio_status,x.owner_role_id,x.major_blocker,null,x.next_milestone,null,x.source);
  for(const x of r.reviews.filter(x=>x.review_signal==='REVIEW')) add(x.metric_id,x.entity_id,x.metric_name,'REVIEW',null,null,null,null,null,x.source);
  for(const x of r.attention) add(x.source_id,x.entity_id,x.title,x.status,x.owner_role_id,/^Blocked:/i.test(x.detail || '')?x.detail:null,null,x.detail,x.priority,x.source);
  const priority={HIGH:3,MEDIUM:2,LOW:1};
  const attention=[...byId.values()].sort((a,b)=>b.attentionScore-a.attentionScore || (priority[b.priority]||0)-(priority[a.priority]||0) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.id.localeCompare(b.id));
  const blockers=attention.filter(x=>x.blocker || x.status==='BLOCKED');
  const summary=[`${attention.length} source-referenced items; ${blockers.length} carry explicit blockers.`,`${attention.filter(x=>!x.ownerRoleId).length} items have no recorded owner.`];
  if(f) summary.push(`Financial period: week ending ${f.weekly.weekEnding}; ${f.weekly.netSales.sourceStatus}. Payroll, purchases, and monthly close have independent status.`);
  const decisions=r.decisions.filter(x=>!['SUPERSEDED','CLOSED'].includes(x.status)).map(x=>({...x,entityName:names.get(x.entity_id)||x.entity_id,owner:roles.get(x.owner_role_id)||x.owner_role_id}));
  return {warnings,attention,decisions,portfolio:r.portfolio.map(p=>({...p,entityName:names.get(p.entity_id)||p.entity_id,
    project:r.projects.find(x=>x.entity_id===p.entity_id)||null,document:r.documents.find(x=>x.document_id===p.authoritative_document_id)||null})),summary,
    rankingNote:'Derived from active Registry attention weights; source priority, status, ownership and decisions are unchanged. Draft deadline weights are not activated.'};
}
module.exports={changes,briefing};
