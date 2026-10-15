'use strict';
const {REGISTRY}=require('../lib/contracts');
function registryFixture(c){
 const doc={id:c.registryId,modifiedAt:'2026-10-14T19:29:00Z',version:'1',tables:{}};
 for(const [i,contract] of REGISTRY.entries())doc.tables[contract.tab]={gid:i+1,values:[contract.headers]};
 const add=(tab,obj)=>doc.tables[tab].values.push(doc.tables[tab].values[0].map(k=>obj[k]??null));
 for(const id of c.entities)add('Entities',{entity_id:id,entity_name:id==='ENT-0101'?'Bayberry Garden':id==='ENT-0102'?'ATLAS':'Synthetic concept',entity_type:'restaurant',operating_status:'ACTIVE',active:true});
 add('Entities',{entity_id:'ENT-0002',entity_name:'Sample House',active:true});
 add('Roles',{role_id:'ROLE-0001',role_name:'Executive Owner'});
 add('Development Projects',{project_id:'DEV-0102',entity_id:'ENT-0102',stage:'SECURE',next_gate:'Review inventory',owner_role_id:'ROLE-0001',blocker:'Synthetic blocker'});
 add('Executive Portfolio',{portfolio_item_id:'PORT-0102',entity_id:'ENT-0102',portfolio_status:'ACTIVE',current_priority:'Synthetic capital review',capital_need:123000,owner_role_id:'ROLE-0001'});
 add('Actions',{action_id:'ACT-TEST-1',entity_id:'ENT-0101',title:'Synthetic action',status:'BLOCKED',owner_role_id:'ROLE-0001',blocker:'Awaiting a test input',due_date:'2026-10-16'});
 add('Actions',{action_id:'ACT-SAMPLE',entity_id:'ENT-0002',title:'Sample must be excluded',status:'OPEN'});
 add('Miles Attention',{source_id:'ACT-TEST-1',entity_id:'ENT-0101',title:'Duplicate action reference',status:'BLOCKED'});
 add('Decisions',{decision_id:'DEC-TEST-1',entity_id:'ENT-0101',decision:'Synthetic approved direction',status:'ACTIVE'});
 add('Attention Model',{signal_id:'ATT-1',signal:'BLOCKED',default_weight:5,status:'ACTIVE'});
 add('Attention Model',{signal_id:'ATT-2',signal:'DEADLINE_NEAR',default_weight:99,status:'DRAFT'});
 return doc;
}
function financialFixture(c){
 const doc={id:c.financialId,modifiedAt:'2026-10-13T18:31:00Z',version:'1',tables:{}};
 for(const [i,tab] of ['Overview','Weekly review','Monthly review','Refresh','Toast sync log'].entries())doc.tables[tab]={gid:i+1,values:[]};
 const row=(tab,index,label,...cells)=>{doc.tables[tab].values[index-1]=[null,null,label,...cells];};
 row('Weekly review',7,'Selected week',46306);
 for(const [i,label] of ['Net sales','Covers','Net sales per cover','Salary + hourly wages','Wages / net sales','Loaded labor','Food purchases','Food purchases / food sales'].entries())row('Weekly review',10+i,label,i<3?1000+i:null,900,100,i<3?'Toast API; provisional':'Pending');
 row('Weekly review',44,'Metric','Selected week','Prior 4-week baseline','Change %','Reading');
 for(const [i,label] of ['Net sales','Covers','Net sales per cover'].entries())row('Weekly review',45+i,label,1000,900,0.111,'Above prior four');
 row('Monthly review',6,'Metric',...Array.from({length:12},(_,i)=>new Date(Date.UTC(2026,i,1)).toISOString().slice(0,10)));
 row('Monthly review',7,'Close status',...Array(12).fill('Legacy; unverified'));
 for(const [i,label] of ['Net sales','2026 net sales budget','Net sales vs budget','Food COGS / food sales','Total labor / net sales','Reported net income','Reported EBITDA','Visible-line residual vs reported NI⁵'].entries())row('Monthly review',10+i,label,1200,...Array(11).fill(null));
 row('Refresh',6,'Source','Destination','Connection');row('Refresh',7,'Toast POS','POS weekly','Connected; provisional',46306,'Synthetic timestamp','Review');
 for(const [i,label] of ['Sales history','Selected sales check','Financial close','Planning completeness'].entries())row('Overview',37+i,label,'Synthetic source check');
 doc.tables['Toast sync log'].values=[['Synthetic log'],[],['Run ID','Started Eastern','Finished Eastern','Week ending','Mode','Result','POS cells filled','Message'],['test-run','2026-10-12 12:00','2026-10-12 12:01','2026-10-11','test','VERIFIED',0,'Synthetic reconciliation']];
 for(const t of Object.values(doc.tables))t.values=Array.from(t.values,r=>r||[]);
 return doc;
}
module.exports={registryFixture,financialFixture};
