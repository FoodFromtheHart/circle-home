'use strict';
const path = require('node:path');
const CIRCLE_ENTITIES = ['ENT-0101', 'ENT-0102', ...Array.from({length:9}, (_,i)=>`ENT-020${i+1}`)];
function config(env = process.env) {
  const host = env.HOST || (env.RENDER ? '0.0.0.0' : '127.0.0.1');
  const hosted = Boolean(env.RENDER || env.NODE_ENV === 'production' || !['127.0.0.1','localhost','::1'].includes(host));
  const orgId = env.CIRCLE_ORG_ID || 'circle';
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(orgId)) throw Error('Invalid organization ID');
  const isCircle = orgId === 'circle';
  const token = env.CIRCLE_ADMIN_TOKEN || '';
  if (hosted && (token.length < 32 || !env.CIRCLE_DATA_DIR || !path.isAbsolute(env.CIRCLE_DATA_DIR))) {
    throw Error('Hosted mode requires a 32+ character owner token and an absolute persistent CIRCLE_DATA_DIR');
  }
  const registryId = env.CIRCLE_REGISTRY_ID || (isCircle ? '1pcF6-T6b85jXS6CJ525XzO-ALdqDEDEDE9dFOYZDJ4o' : '');
  const financialId = env.CIRCLE_FINANCIAL_ID || (isCircle ? '1meMGMy8CuJijIwJmzUp092ZNi1Myeq57EyKCV_x60SI' : '');
  const entities = env.CIRCLE_ENTITY_IDS ? env.CIRCLE_ENTITY_IDS.split(',').map(x=>x.trim()).filter(Boolean) : isCircle ? CIRCLE_ENTITIES : [];
  if (!entities.length || new Set(entities).size !== entities.length) throw Error('Explicit unique entity scope required');
  if (!isCircle && [registryId, financialId].some(id=>['1pcF6-T6b85jXS6CJ525XzO-ALdqDEDEDE9dFOYZDJ4o','1meMGMy8CuJijIwJmzUp092ZNi1Myeq57EyKCV_x60SI'].includes(id))) throw Error('CIRCLE sources cannot be used by an external organization');
  const interval = Number(env.CIRCLE_REFRESH_SECONDS || 900);
  if (!Number.isFinite(interval) || interval < 60 || interval > 86400) throw Error('Refresh interval must be 60–86400 seconds');
  const origin = env.CIRCLE_PUBLIC_ORIGIN || env.RENDER_EXTERNAL_URL || '';
  if (origin && (new URL(origin).origin !== origin || (hosted && !origin.startsWith('https://')))) throw Error('Public origin must be a canonical HTTPS origin in hosted mode');
  return {
    host, port:Number(env.PORT || 4177), hosted, token, origin,
    orgId, orgName:env.CIRCLE_ORG_NAME || (isCircle ? 'CIRCLE' : orgId), isCircle, entities,
    dataDir:path.resolve(env.CIRCLE_DATA_DIR || path.join(__dirname,'..','data')),
    provider:env.RENDER ? 'Render' : hosted ? 'hosted' : 'local development',
    revision:env.RENDER_GIT_COMMIT || env.CIRCLE_RELEASE_SHA || null,
    registryId, financialId, financialEntity:env.CIRCLE_FINANCIAL_ENTITY_ID || (isCircle ? 'ENT-0101' : ''),
    milesUrl:env.CIRCLE_MILES_URL || (isCircle ? 'https://miles-parallel.foodfromthehart.chatgpt.site/?date=2026-10-14&service=dinner&station=all&view=cook&chef=prep' : ''),
    enabled:Object.fromEntries(['registry','financial','gmail','calendar'].map(k=>[k,env[`CIRCLE_${k.toUpperCase()}_ENABLED`] === 'true'])),
    refreshMs:interval * 1000, freshMs:interval * 2000,
    googleServiceAccount:env.CIRCLE_GOOGLE_SERVICE_ACCOUNT_JSON || '',
    oauth:{clientId:env.CIRCLE_GOOGLE_OAUTH_CLIENT_ID || '', clientSecret:env.CIRCLE_GOOGLE_OAUTH_CLIENT_SECRET || '', refreshToken:env.CIRCLE_GOOGLE_OAUTH_REFRESH_TOKEN || ''},
    googleExpectedEmail:(env.CIRCLE_GOOGLE_EXPECTED_EMAIL || '').trim().toLowerCase(),
    googleTokenKey:env.CIRCLE_GOOGLE_TOKEN_KEY || '',
    gmailQuery:env.CIRCLE_GMAIL_QUERY || '', calendarId:env.CIRCLE_CALENDAR_ID || ''
  };
}
module.exports = {config};
