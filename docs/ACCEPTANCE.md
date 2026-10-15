# Acceptance evidence — connected executive platform candidate

Updated: October 15, 2026 (America/New_York). Repository and verified Render production baseline: `5006b08d5c4d275359a3ed1785f5c9cabaf7119b`.

**First acceptance milestone: NOT YET ACCEPTED.** The candidate is implemented and locally tested. It has not been deployed, and authenticated automatic refresh on Render has not been demonstrated.

## Completed evidence

| Check | Result | Evidence and limit |
| --- | --- | --- |
| Repository isolation | Passed | Changes made on `dev/connected-executive-platform`; main left unchanged |
| Syntax | Passed | `npm run check`: 17 JS files |
| Automated acceptance suite | Passed | `npm test`: 22/22 tests on Node 24.19.0 |
| Hosted unauthenticated access | Passed | Live `https://circle-home.onrender.com` returned 401 on `/`, `/app.js`, `/api/status`, `/api/sources`, `/api/executive`, `/api/workboard`; `/healthz` returned only `ok` |
| Hosted probe time | Recorded | Rechecked 2026-10-15T13:04:36.574Z; no production data was retrieved or modified |
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
| Gmail / Calendar | Connector reads verified; application disabled | ChatGPT authenticated access verified for the approved account; this does not supply the application with Google credentials |
| Account linking | Mock transport tested | Read-only per-source consent, browser/state binding, PKCE, account verification, refresh-token test, encryption/restart, failure preservation, auth/CSRF and invitation response distinction |
| Production Miles | Unchanged | No Miles database/API connection or mutation performed |

The real source-replay input was kept outside Git under ignored `private-evidence/`. Public test fixtures are synthetic. No Google credentials, owner secret or workboard export is committed.

## Still required before promotion

- Verify protected Render environment values, the actual `CIRCLE_DATA_DIR` beneath the confirmed disk mount, and hosted owner access.
- Export the existing production workboard off-volume and record its checksum.
- Configure the application's dedicated Google service account with Viewer access to the two sources.
- Test Registry and Financial separately from the candidate's authenticated server endpoints.
- Verify a scheduled refresh, independent failure/recovery, candidate hosted restart persistence and unchanged original workboard.
- Perform interactive browser/UI acceptance on the candidate. Browser automation was unavailable in this environment; no visual QA or screenshot is claimed.
- Promote the exact accepted commit and verify production, retaining the prior Render deploy.

## Render inspection — October 15

After Hart confirmed the existing workspace, the Render connector returned:

| Item | Observed value |
| --- | --- |
| Workspace | `FoodFromTheHart/Circle.Home` / `tea-db809aon74is73d9kklg` |
| Service | `circle-home` / `srv-db820b2vcj2c73ft6uf0` |
| Production URL | `https://circle-home.onrender.com` |
| Live deployment | `dep-db821l689jmc73bt2810` |
| Live commit | `5006b08d5c4d275359a3ed1785f5c9cabaf7119b` |
| Repository / branch | `FoodFromtheHart/circle-home` / `main` |
| Auto-deploy | Off |
| Build / start | `npm run check` / `npm start` |
| Runtime / region / instances | Node / Virginia / 1 |
| Plan | `0.5c-512mb` |
| Persistent disk | `dsk-db821l689jmc73bt27hg`, 1 GB, mounted at `/var/data` |
| Health check configuration | Empty; existing `/healthz` endpoint is available |

The connector exposes service metadata and environment updates, but no protected environment read or service-shell operation. No existing secret or data path was replaced. This inspection confirms an attached disk, not the application's configured path or persistence across a new restart. The live deployment ID is the recorded code rollback point. No deployment, restart, environment mutation, new paid service, or Miles operation has been performed.

Google OAuth client configuration and owner access for the production workboard backup are still required. The account-linking UI is on the development branch; it has not been deployed or exercised against Google's real consent server. Gmail and Calendar source snippets observed through ChatGPT were not imported into a fake application feed or committed to the repository.

## Acceptance suite coverage

The reproducible suite is `test/acceptance.test.js` and `test/google-connect.test.js`. It covers fail-closed hosted configuration, private routes, original-record preservation, conflict protection, normal/damaged restore, real process restart, canonical IDs, financial quality, cache isolation/freshness, disabled-connector test behavior, signed OAuth authentication, error redaction, communication read boundaries, full Sheets flow and upstream error cases. Account linking adds one-time browser-bound callback tests, expected-account/verified-email/scope checks, failed-read preservation, encrypted credential restart and cross-organization rejection, independent consent scopes, invitation response semantics and authenticated route boundaries.

Local and mocked tests are evidence of implementation behavior only. They are not evidence that Google synchronization is live on Render.
