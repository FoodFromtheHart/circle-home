# Controlled deployment and recovery

## Current gate

The branch is a release candidate. Production promotion is blocked until Render owner/disk/restart verification and authenticated application-side Registry + financial refresh succeed. A successful read through ChatGPT is not the deployed Node service's authentication test.

Current production source baseline: `6d2f5d64c7597f29f383eb392d6c444dc758127c`, including the independently delivered Brian read-only role. The development candidate incorporates that history and retains the existing guest snapshot/workboard surface. Confirm the actual running Render deployment ID and commit before changing it. No data migration, reseed or Miles change is part of this branch's tests.

The Render `update_environment_variables` connector triggered a deployment of the existing production commit on October 15. Do not use that connector for a save-only change: the Dashboard's **Save only** option is the verified non-deploying path. Treat connector environment updates as deployments and prepare a current backup first.

## 1. Capture the existing environment

Using Render, record the service ID, running deployment ID/commit, repository/branch, auto-deploy setting, start/build commands, Node version, disk ID/mount, and names (not exported secret values) of relevant variables. Confirm the configured `CIRCLE_DATA_DIR` is inside the attached persistent disk. Do not infer durable storage merely from a writable path.

Export the current workboard off-volume before deploying. The current v2.2 service supports authenticated `GET /api/workboard`; save the returned complete JSON privately and retain a checksum. Do not commit that export to GitHub. When shell access is available, preserve an exact byte-for-byte copy of the current `workboard.json` as well. The existing schema is `{version:1,items:[...]}`; preserve unknown fields.

Use the hosting service's secret field or a protected environment for the owner token. Do not place it in URLs, command arguments, shell history or chat. The basic-auth username remains `circle` for compatibility.

Disable Render auto-deploy before any future merge/promotion. Keep the live branch at its known good revision while the development branch is tested. `dev/connected-executive-platform` must not be selected as the production auto-deploy branch.

## 2. Independent candidate environment

Use a separate staging service/disk and the development branch. Never share production's data directory or disk with a second running process. Production remains unchanged during staging.

- Runtime: Node 24 (`.node-version`). Build: `npm run check && npm test`. Start: `npm start`.
- Preserve the single-process model. This JSON store does not support multiple writers or horizontally scaled instances.
- Set `HOST=0.0.0.0`, `NODE_ENV=production`, the staging data directory, a separate owner token, and its HTTPS `CIRCLE_PUBLIC_ORIGIN`.
- Leave all four connector flags false initially.
- Use synthetic workboard data for write/restart tests. No production records need to be copied into staging for functional validation.

## 3. Registry and financial authentication

In an existing approved Google Cloud project, enable Google Sheets API and Google Drive API. Create/use a dedicated application service account without domain-wide delegation. Share **only** these sources with that service account as **Viewer**:

- Registry: `1pcF6-T6b85jXS6CJ525XzO-ALdqDEDEDE9dFOYZDJ4o`
- Financial workbook: `1meMGMy8CuJijIwJmzUp092ZNi1Myeq57EyKCV_x60SI`

Set its JSON credential in `CIRCLE_GOOGLE_SERVICE_ACCOUNT_JSON` through Render's protected environment controls. Never paste it into chat or commit it. The code obtains tokens with `spreadsheets.readonly` and `drive.metadata.readonly`. It reads data with GET only; POST is used solely for OAuth token exchange.

In the candidate's **Systems & sources**, run **Test read** separately for Registry and Financial. Both must return `authenticatedRead: true`, the expected organization and contract version. Schema errors, wrong canonical IDs, missing entity scope, missing permissions or a source revision changing during the read must fail the test.

Only after those tests pass, set `CIRCLE_REGISTRY_ENABLED=true` and `CIRCLE_FINANCIAL_ENABLED=true` on staging. Keep Gmail and Calendar false. Restart/redeploy staging and confirm:

1. A successful authenticated startup read changes each source from awaiting refresh to connected.
2. The UI shows each last-success timestamp, source modified time and reporting period. Provisional sales remain provisional; incomplete costs remain unavailable.
3. Use the refresh button; both timestamps advance without rebuilding the dashboard. Then allow one scheduled interval and verify another advance without a browser action.
4. Temporarily remove/revoke a **staging** source credential or viewer grant. The source must show error/unavailable and any retained figures must say last-known. Restore access and verify recovery. Do not change production permissions for this test.
5. Restart staging. Compare workboard contents/checksum and verify a changed boot ID with the same records. Cached sources must not be marked connected until reread.

## 4. Read-only hosted verification

With `CIRCLE_VERIFY_ORIGIN` and `CIRCLE_ADMIN_TOKEN` securely injected into the environment:

```sh
npm run verify:hosted
```

This verifies unauthenticated denial on app/data routes and reads authenticated environment, commit, boot ID, workboard checksum/count and source states. It never changes the board. Without the owner token, it explicitly reports that owner checks were not run.

Capture the checksum before and after the controlled staging restart. A successful local process restart test is not evidence that Render's persistent disk survived a restart.

## 5. Promotion

Once every first-milestone staging gate passes, take an off-volume production workboard backup and record the old deployment ID. Merge the tested commit through the pull request, with auto-deploy disabled. Deploy that exact tested commit manually in Render using the existing service and disk. Keep the current `CIRCLE_DATA_DIR`, owner token and canonical IDs. Add only the reviewed source configuration.

Do not upload a new workboard, source cache or organization marker from staging. The service adopts the original CIRCLE board without modifying its bytes and creates its own organization metadata/backup files. The first write remains schema version 1.

Run the hosted probe with owner authentication. Confirm the exact release, original workboard IDs/content, both fresh source reads, correct provisional labels and no Miles writes. Verify another scheduled refresh. Perform a controlled restart only after the off-volume backup exists, then compare the workboard again. Preserve the prior deploy until all checks pass.

## 6. Application backup and explicit restore

The upgraded app creates an atomic, checksummed exact-JSON backup at startup and before each mutation. It retains the most recent 100 automatic backups under `CIRCLE_DATA_DIR/backups`. Manual CLI backups are not pruned. Downloading a backup from the workboard exports the current state; keep it in protected off-volume storage. Same-disk copies alone do not cover disk loss.

On the service host, with its existing environment:

```sh
npm run backup
npm run restore -- --input /absolute/path/to/backup.json
```

Restore is a dry-run by default. Inspect the organization, current/proposed item counts and checksums. Stop the application writer, then run the explicit replacement with the checksum printed by the dry-run:

```sh
npm run restore -- --input /absolute/path/to/backup.json --expect-sha CURRENT_CHECKSUM --service-stopped --apply
```

This verifies the backup checksum/organization, refuses a mismatched current checksum, writes a pre-restore recovery copy, and atomically restores the exact saved JSON. Restart the service and verify records through authenticated reads. Restore replaces the current board; it is never triggered automatically by startup, integration failure or deployment. If the board is missing or corrupt, add `--recover-damaged` to the dry-run and explicit apply command. The dry-run returns the damaged raw checksum, or the literal `MISSING` when absent; use that exact value for `--expect-sha`. Apply retains the damaged bytes (or a missing-file marker) as separate recovery evidence before restoring the validated backup. No empty board is seeded.

## 7. Rollback

For a code regression, use Render's rollback to the recorded previous deploy. Do **not** restore a disk snapshot as part of a routine code rollback: that can discard newer workboard data. The workboard remains version 1 and the previous service ignores the new cache/backup metadata files.

For a bad source connection, turn only its flag false and restart, leaving the board intact. If current branch code is unstable, roll back first. Use explicit data restore only for a confirmed data recovery need after comparing the current board against the selected backup. Record which newer changes would be lost before applying a restore.

Render disk snapshots and code rollback are separate operations. Verify snapshot availability in the actual account rather than assuming a recovery point exists.

## Gmail and Calendar account linking

### Existing guest access

The optional existing `CIRCLE_VIEWER_TOKEN` and username `brian` retain read-only access to the prior dated snapshots and workboard. The candidate serves that guest interface separately. Guests cannot read the new executive/live-source payload, Google connection status, or credentials, and cannot initiate or complete consent, test or refresh sources, export backup envelopes, or mutate records. The owner remains `circle`. No guest token is created or enabled by this release, and no new communication data is added to the guest scope.

The approved account for both connections is **hart@bayberrygarden.com**. The personal email associated with the existing Render workspace is a hosting account, not the account the application should read. ChatGPT's Google connections do not supply credentials to the hosted Node service.

Use a Google OAuth **Web application** client in an approved Google Cloud project with Gmail API and Google Calendar API enabled. Configure the consent audience for the organization/account and register this exact production redirect URI:

```
https://circle-home.onrender.com/oauth/google/callback
```

Register the staging service's equivalent HTTPS URI separately. Set the following through the hosting service's protected environment controls, preserving every existing variable, owner token and data path:

| Variable | Value / purpose |
| --- | --- |
| `CIRCLE_GOOGLE_OAUTH_CLIENT_ID` | The Google web client's ID |
| `CIRCLE_GOOGLE_OAUTH_CLIENT_SECRET` | Its secret; never put it in chat or Git |
| `CIRCLE_GOOGLE_TOKEN_KEY` | A stable random 32-byte key encoded as 64 hexadecimal characters, stored separately from the disk |
| `CIRCLE_GOOGLE_EXPECTED_EMAIL` | `hart@bayberrygarden.com` |
| `CIRCLE_CALENDAR_ID` | `hart@bayberrygarden.com` |
| `CIRCLE_GMAIL_QUERY` | Explicit executive correspondence query below, or a narrower owner-selected label/query |
| `CIRCLE_GMAIL_ENABLED` | `false` until its authenticated read passes |
| `CIRCLE_CALENDAR_ENABLED` | `false` until its authenticated read passes |

The bounded query used in the connector verification was:

```
newer_than:30d -in:spam -in:trash -category:promotions {atlas investor investment capital landlord cornish "200 Washington" staffing}
```

Generate the encryption key using a secure secret-generation facility and retain it in the approved secret store. Do not rotate or overwrite an existing key without a token recovery plan. The application refuses to overwrite an encrypted connection file that cannot be decrypted under its original organization, account, client ID and key. A disk backup alone cannot recover authorization without the key. Workboard backups do not contain Google credentials.

In the owner-authenticated **Systems & sources** page, choose **Connect Gmail**, approve read-only access as the expected account, and return to the app. Repeat independently for **Connect Calendar**. The server uses one-time browser-bound state, a ten-minute expiry, PKCE, and a fixed redirect URI. The browser receives no access or refresh token. It verifies the email through Google's authenticated UserInfo endpoint, checks the granted source scope, uses the offline refresh token, and performs that source's read before saving any new authorization. Wrong-account selection, refused consent, missing permission or a failed read leaves the previous stored authorization unchanged.

Each connection requests `openid email` plus only its source scope: `gmail.readonly` or `calendar.events.readonly`. Gmail's search query requires gmail.readonly; gmail.metadata does not support `q`. Google provides identity permission so the application can enforce the expected account on every read. The Gmail payload is limited by the adapter to message metadata and snippets. Tokens are encrypted with AES-256-GCM in `CIRCLE_DATA_DIR/google-connections.enc.json`, atomically saved with mode 0600. Do not log OAuth callback queries or export tokens to browser code.

When the callback reports a successful independent read, enable **only that source** through its Render environment flag. Verify an initial refresh and an automatic refresh with advancing timestamps. The existing scheduler reads enabled sources every 15 minutes by default. Authorization alone is never labelled live synchronization. An optional legacy `CIRCLE_GOOGLE_OAUTH_REFRESH_TOKEN` remains supported but must include identity scopes and pass the same expected-account check.

Test each disabled adapter with its own Test read button; enable only the one that passes. Gmail returns at most 25 threads, using message metadata and snippets. Calendar returns at most 100 events in the next 30 days, including all-day events. Both explicitly flag additional available results; neither implies the bounded view is exhaustive. Follow-ups are candidates for owner review, not automatic tasks, decisions or sent messages. Meeting preparation links to the event/context; project relationships are not guessed from titles.

Calendar event confirmation and the owner's invitation response are shown separately. Gmail links select the verified account explicitly to avoid opening the personal inbox when several Google accounts are signed in. To suspend reads, set only the affected enabled flag to false. To revoke Google consent, use the account's Google third-party connection controls; revoked or expired tokens must produce an explicit connection error, never current-looking cached data.

## Primary implementation references

- https://developers.google.com/identity/protocols/oauth2/service-account
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/identity/openid-connect/openid-connect
- https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/batchGet
- https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/list
- https://developers.google.com/workspace/calendar/api/v3/reference/events/list
- https://render.com/docs/deploys
- https://render.com/docs/disks
- https://render.com/docs/rollbacks
