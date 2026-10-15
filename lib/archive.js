'use strict';
// Preserved v2.2 snapshots. Never used as live integration results.
const sources=[
{title:'Miles — Parallel (current)',kind:'application',url:'https://miles-parallel.foodfromthehart.chatgpt.site/?date=2026-10-14&service=dinner&station=all&view=cook&chef=prep',status:'Hart-confirmed current build; launch link only, not API-connected'},
{title:'Bayberry Financial Workbook V2',kind:'spreadsheet',url:'https://docs.google.com/spreadsheets/d/1meMGMy8CuJijIwJmzUp092ZNi1Myeq57EyKCV_x60SI/edit',status:'Retrieved snapshot; refresh requires connector'},
{title:'CIRCLE Core Registry',kind:'registry',url:'https://docs.google.com/spreadsheets/d/1pcF6-T6b85jXS6CJ525XzO-ALdqDEDEDE9dFOYZDJ4o/edit',status:'Retrieved snapshot; no writeback'},
{title:'Founder Dashboard',kind:'application',url:null,status:'Exact app URL not verified'},
{title:'Google Calendar',kind:'calendar',url:'https://calendar.google.com/calendar/u/0/r',status:'Snapshot only; no automatic polling'},
{title:'Gmail',kind:'email',url:'https://mail.google.com/mail/u/0/#inbox',status:'Snapshot only; no automatic polling'}];
const snapshot={retrievedAt:'2026-10-14',basis:'Verified Google Drive and Google Calendar reads; not continuously synced',bayberry:{weekEnding:'2026-10-11',sales:70640,covers:1088,salesPerCover:64.93,sourceStatus:'Toast API provisional'},atlas:{knownStartupUses:451000,ceiling:425000,gap:26000,phase:'SECURE',note:'Unresolved replacement exposure excluded; registry value'},calendar:[{title:'Ariana Monegro stage',start:'2026-10-17T09:00:00-04:00',end:'2026-10-17T14:00:00-04:00',url:'https://www.google.com/calendar/event?eid=ZWQwc3ZpcGpuOTBoMTA5c3NoNW9wcmw5bDQgaGFydEBiYXliZXJyeWdhcmRlbi5jb20'}],attention:[{entity:'ENT-0101',title:'Revenue Growth Plan',status:'IN_PROGRESS'},{entity:'ENT-0101',title:'Labor Gear Matrix',status:'IN_PROGRESS'},{entity:'ENT-0101',title:'Resolve staffing structure',status:'OPEN'},{entity:'ENT-0101',title:'2027 budget sign-off',status:'BLOCKED'},{entity:'ENT-0102',title:'Close retain / replace inventory and capital gap',status:'OPEN'}]};

module.exports={sources,snapshot};
