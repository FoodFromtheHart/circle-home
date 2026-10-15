# Acceptance evidence — connected executive platform candidate

Updated: October 15, 2026 (America/New_York). Repository and verified Render production baseline: `5006b08d5c4d275359a3ed1785f5c9cabaf7119b`.

### Subsequent evidence — 15:11 UTC

The historical baseline below has been superseded by production commit `6d2f5d64c7597f29f383eb392d6c444dc758127c`, delivered independently with Brian's optional read-only role and hosted wording. That history is now reconciled into this development candidate. The candidate keeps the original guest snapshot/workboard surface and denies new live source data, Google controls, all mutation endpoints, and backup exports to guests. The expanded local suite passes **24/24 tests** and **19 JavaScript syntax checks**.

Hart created a Google web OAuth client and saved its ID and secret directly in Render. The application account/filter configuration and a securely generated encryption key were subsequently saved, with both communication flags false. Secret values were not displayed or committed. This establishes configuration presence only, not validity or authentication.

The Render environment-update connector unexpectedly also triggered deployment `dep-db8ep7nf3r2c73fica2g`, which went live at `2026-10-15T15:09:58.168907Z` on the **same existing production commit**. The new integration candidate was not deployed. Post-redeploy owner verification at `2026-10-15T15:11:36.776Z` confirmed the original 304-byte workboard retained the exact SHA-256 `04d0030f2e11c45f7dc64ab5a2b2005240498418a96385716b544e4b6c5f8d89` and original item ID; the authenticated HTTPS response matched disk, and an unauthenticated read returned 401. This is real hosted persistence evidence for the existing release, not a hosted candidate acceptance result.

Safe format checks subsequently found that the saved Client ID was not in Google's Client ID format, while the value in the Client secret field ended in `.apps.googleusercontent.com`. No values were revealed. Hart needs to correct those fields directly in Render using **Save only**. The candidate now blocks consent for this misplaced-credential case with explicit setup labels; **25/25 tests** and **19 syntax checks** pass.

Google authorization, independent application-side reads, scheduled refresh and candidate hosted acceptance remain pending. The first milestone is still not accepted. Future save-only environment changes must use the Dashboard option; the connector update is treated as a deployment.

**First acceptance milestone: NOT YET ACCEPTED.** The candidate is implemented and locally tested. It has not been deployed, and authenticated automatic refresh on Render has not been demonstrated.

## Completed evidence

| Check | Result | Evidence and limit |
| --- | --- | --- |
| Repository isolation | Passed | Changes made on `dev/connected-executive-platform`; main left unchanged |
| Syntax | Passed | `npm run check`: 17 JS files |
| Automated acceptance suite | Passed | `npm test`: 22/22 tests on Node 24.19.0 |
| Hosted unauthenticated access | Passed | Live `https://circle-home.onrender.com` returned 401 on `/`, `/app.js`, `/api/status`, `/api/sources`, `/api/executive`, `/api/workboard`; `/healthz` returned only `ok` |
| Hosted probe time | Recorded | Rechecked 2026-10-15T13:04:36.574Z; no production data was retrieved or modified |
| Owner authentication | Hosted read passed | On 2026-10-15, Render shell used the existing secret in-process to read public HTTPS `/api/status` and `/api/workboard`; both returned 200; secret value was not displayed |
| Workboard persistence | Locally tested | A child Node process was stopped/restarted; original item ID and checksum retained and boot identity changed |
| Existing workboard preservation | Hosted baseline captured; candidate locally tested | Existing disk file and authenticated API response matched; exact 304-byte original file remained unchanged; candidate startup retains exact bytes and later mutations preserve extra fields |
| Backup and restore | Production backup saved; isolated restore passed | Checksummed production envelope saved on the persistent disk and privately off-volume; candidate CLI dry-run and explicit recovery restored identical bytes into an isolated temporary directory; production was not restored |
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

- Configure the application's dedicated Google service account with Viewer access to the two sources.
- Test Registry and Financial separately from the candidate's authenticated server endpoints.
- Verify a scheduled refresh, independent failure/recovery, candidate hosted restart persistence and unchanged original workboard.
- Perform interactive browser/UI acceptance on the hosted candidate. Browser access is now available, but the candidate has not been staged; no candidate visual QA or screenshot is claimed.
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

The connector exposes service metadata and environment updates, but no protected environment read or service-shell operation. Hart authorized the browser fallback, and Google sign-in successfully opened the existing Render workspace. The authenticated service shell confirmed:

- The running commit is the recorded baseline above; actual runtime is Node `v26.12.0` (the candidate pins Node 24).
- `CIRCLE_DATA_DIR=/var/data`, matching the attached disk mount; `HOST=0.0.0.0`.
- The existing owner secret is configured and meets the candidate's length requirement. Its value was neither displayed nor exported.
- The only configured `CIRCLE_*` names were `CIRCLE_ADMIN_TOKEN` and `CIRCLE_DATA_DIR`; Google credentials are not configured.
- Owner-authenticated HTTPS status/workboard reads succeeded. The API board matched the disk board.

At `2026-10-15T13:31:20.922Z`, the exact existing 304-byte, version-1 board with one record was backed up to `/var/data/backups/manual-predeployment-1792071080923.json` using a new, private file. Its SHA-256 is `04d0030f2e11c45f7dc64ab5a2b2005240498418a96385716b544e4b6c5f8d89`. A separately retained private recovery copy passed `verifyBackup`. The candidate's restore CLI then recovered it into an isolated temporary directory with the same bytes/checksum, and repeated storage initialization preserved it. The original records and off-volume export are not committed.

This confirms the configured disk path and a recoverable baseline, not production persistence across a new restart. No existing secret or data path was replaced. The live deployment ID is the recorded code rollback point. No deployment, restart, environment mutation, new paid service, or Miles operation has been performed.

Google OAuth client configuration is still required. `https://console.cloud.google.com/` displayed “Site Unavailable / Unable to access this site” in the cloud browser after one reload; no Cloud project or OAuth client was created. This is a current browser access limitation, not evidence of a Google outage or failed account ownership. The account-linking UI is on the development branch; it has not been deployed or exercised against Google's real consent server. Gmail and Calendar source snippets observed through ChatGPT were not imported into a fake application feed or committed to the repository.

GitHub Actions run `38740165753` passed for implementation commit `5183ecce4366ea1813772f0090c6cefab462fe5e`. Subsequent evidence-only changes do not constitute a deployment or live integration test.

## Acceptance suite coverage

The reproducible suite is `test/acceptance.test.js` and `test/google-connect.test.js`. It covers fail-closed hosted configuration, private routes, original-record preservation, conflict protection, normal/damaged restore, real process restart, canonical IDs, financial quality, cache isolation/freshness, disabled-connector test behavior, signed OAuth authentication, error redaction, communication read boundaries, full Sheets flow and upstream error cases. Account linking adds one-time browser-bound callback tests, expected-account/verified-email/scope checks, failed-read preservation, encrypted credential restart and cross-organization rejection, independent consent scopes, invitation response semantics and authenticated route boundaries.

Local and mocked tests are evidence of implementation behavior only. They are not evidence that Google synchronization is live on Render.
