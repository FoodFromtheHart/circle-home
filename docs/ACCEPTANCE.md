# Acceptance evidence — connected executive platform candidate

Date: October 14, 2026 (America/New_York). Repository baseline: `5006b08d5c4d275359a3ed1785f5c9cabaf7119b`.

**First acceptance milestone: NOT YET ACCEPTED.** The candidate is implemented and locally tested. It has not been deployed, and authenticated automatic refresh on Render has not been demonstrated.

## Completed evidence

| Check | Result | Evidence and limit |
| --- | --- | --- |
| Repository isolation | Passed | Changes made on `dev/connected-executive-platform`; main left unchanged |
| Syntax | Passed | `npm run check`: 15 JS files |
| Automated acceptance suite | Passed | `npm test`: 17/17 tests on Node 24.19.0 |
| Hosted unauthenticated access | Passed | Live `https://circle-home.onrender.com` returned 401 on `/`, `/app.js`, `/api/status`, `/api/sources`, `/api/executive`, `/api/workboard`; `/healthz` returned only `ok` |
| Hosted probe time | Recorded | 2026-10-15T01:11:52.991Z; no production data was retrieved or modified |
| Owner authentication | Locally tested | Hosted owner token not available in this execution environment |
| Workboard persistence | Locally tested | A child Node process was stopped/restarted; original item ID and checksum retained and boot identity changed |
| Existing workboard preservation | Locally tested | Startup retains exact file bytes; later mutations preserve extra root/item fields |
| Backup and restore | Locally tested | Checksummed pre-change/export backups; dry-run restore; explicit lease rejection; successful restore; damaged-file recovery retains evidence |
| Corruption / missing file | Locally tested | Known storage fails closed without empty reseed |
| Concurrent changes / CSRF | Locally tested | ETag conflict, required lease, cross-origin rejection and JSON-only writes |
| Registry source contract | Source reads + local replay passed | Authenticated Google Drive connector reads established current tabs/headers; parser scoped 11 actual entities and excluded 2 examples, preserving canonical ATLAS/Bayberry IDs |
| Financial source contract | Source reads + local replay passed | Current weekly/monthly reporting layouts parsed; provisional sales stay provisional; missing wages stay null; monthly close status retained |
| Server Google authentication | Mock transport tested | RS256 signature verified, read-only JWT scopes, fixed endpoints, token coalescing and credentials redaction; not a real Render credential test |
| Full Sheets integration path | Mock transport tested | Token exchange → metadata → batch values → version check → Registry parser/cache; source changes mid-read rejected |
| Independent failure states | Locally tested | Permission failure on one connector does not invalidate another; failed cache is last-known, restart cache awaiting-refresh, aged reads stale |
| Organization isolation | Locally tested | No default CIRCLE source IDs/archive for an external org; cache rejects changed organization/entity scope |
| Gmail / Calendar | Mock transport tested; disabled | Independent bounded read adapters; no sends, event writes or automatic action creation |
| Production Miles | Unchanged | No Miles database/API connection or mutation performed |

The real source-replay input was kept outside Git under ignored `private-evidence/`. Public test fixtures are synthetic. No Google credentials, owner secret or workboard export is committed.

## Still required before promotion

- Inspect actual Render service environment, active deploy/revision, disk mount and auto-deploy setting.
- Export the existing production workboard off-volume and record its checksum.
- Configure the application's dedicated Google service account with Viewer access to the two sources.
- Test Registry and Financial separately from the candidate's authenticated server endpoints.
- Verify a scheduled refresh, independent failure/recovery, candidate hosted restart persistence and unchanged original workboard.
- Perform interactive browser/UI acceptance on the candidate. Browser automation was unavailable in this environment; no visual QA or screenshot is claimed.
- Promote the exact accepted commit and verify production, retaining the prior Render deploy.

Render installation was confirmed through the plugin registry after Hart connected it. Render service/deploy/environment operations were not exposed in the active tool catalog, so no Render account inspection, environment mutation or deployment was performed. This is an execution-access limit, not a claim that the plugin is uninstalled.

## Acceptance suite coverage

The reproducible suite is `test/acceptance.test.js`. It covers fail-closed hosted configuration, private routes, original-record preservation, conflict protection, normal/damaged restore, real process restart, canonical IDs, financial quality, cache isolation/freshness, disabled-connector test behavior, signed OAuth authentication, error redaction, communication read boundaries, full Sheets flow and upstream error cases.

Local and mocked tests are evidence of implementation behavior only. They are not evidence that Google synchronization is live on Render.
