'use strict';
const {SourceError}=require('./google');
const {safeUrl}=require('./contracts');
async function readGmail(client,config) {
  if(!config.gmailQuery) throw new SourceError('configuration_missing','Set an explicit executive correspondence query before testing Gmail');
  const account=await client.account('gmail');
  const root='https://gmail.googleapis.com/gmail/v1/users/me';
  const result=await client.get(`${root}/threads?${new URLSearchParams({q:config.gmailQuery,maxResults:'25'})}`,'gmail');
  const threads=[];
  // Sequential, bounded reads; no message body, attachment retrieval, labels, or send capability.
  for(const ref of result.threads || []) {
    const t=await client.get(`${root}/threads/${encodeURIComponent(ref.id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,'gmail');
    const messages=t.messages || []; const last=messages.at(-1);
    const header=name=>last?.payload?.headers?.find(h=>h.name.toLowerCase()===name.toLowerCase())?.value || '';
    const timestamp=Number(last?.internalDate);
    threads.push({id:t.id,title:header('Subject') || '(No subject)',from:header('From'),receivedAt:Number.isFinite(timestamp)?new Date(timestamp).toISOString():null,
      snippet:last?.snippet || '',unread:messages.some(m=>m.labelIds?.includes('UNREAD')),status:'Follow-up candidate; owner review required',
      source:{url:`https://mail.google.com/mail/u/?authuser=${encodeURIComponent(account.email)}#all/${encodeURIComponent(t.id)}`}});
  }
  return {contractVersion:'executive-gmail/v1',orgId:config.orgId,accountEmail:account.email,threads,moreAvailable:Boolean(result.nextPageToken),query:config.gmailQuery};
}
async function readCalendar(client,config,now=new Date()) {
  if(!config.calendarId) throw new SourceError('configuration_missing','Set an explicit calendar ID before testing Calendar');
  const account=await client.account('calendar');
  const to=new Date(now.getTime()+30*86400000);
  const params=new URLSearchParams({singleEvents:'true',orderBy:'startTime',timeMin:now.toISOString(),timeMax:to.toISOString(),maxResults:'100',showDeleted:'false'});
  const r=await client.get(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events?${params}`,'calendar');
  return {contractVersion:'executive-calendar/v1',orgId:config.orgId,accountEmail:account.email,calendarId:config.calendarId,windowStart:now.toISOString(),windowEnd:to.toISOString(),moreAvailable:Boolean(r.nextPageToken),
    events:(r.items || []).filter(e=>e.status!=='cancelled').map(e=>({id:e.id,title:e.summary || '(Private commitment)',status:e.status,
      start:e.start?.dateTime || e.start?.date,end:e.end?.dateTime || e.end?.date,allDay:Boolean(e.start?.date),timeZone:e.start?.timeZone || r.timeZone || null,
      responseStatus:e.attendees?.find(a=>a.self)?.responseStatus || null,
      location:e.location || null,source:{url:safeUrl(e.htmlLink)}}))};
}
module.exports={readGmail,readCalendar};
