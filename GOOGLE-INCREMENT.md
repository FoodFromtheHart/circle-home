# Gmail and Calendar — independent release

This increment is based on deployed commit `6d2f5d64c7597f29f383eb392d6c444dc758127c`. It implements Hart's subsequent request to connect email and calendar independently. It preserves the existing workboard implementation, records, financial/portfolio snapshots, source links and Brian's optional read-only role. It does not promote the broader Registry/financial candidate in PR #1 or claim the first platform milestone is accepted.

## Boundaries

- Only the owner can read `/api/communications`, initiate/complete Google consent, test reads or trigger refresh. Guests retain their previous snapshot/workboard scope.
- Gmail uses `openid email gmail.readonly`; Calendar uses `openid email calendar.events.readonly`. There are no email sending or Calendar mutation operations.
- The account is enforced as `hart@bayberrygarden.com`. The OAuth client is managed in the personal account's Cloud project; that does not make the personal inbox the source.
- Google authorization is stored encrypted in `CIRCLE_DATA_DIR/google-connections.enc.json` only after refreshing the granted token, verifying the expected identity and successfully reading that source. It uses the same encrypted format as the broader candidate.
- Source payloads are memory-only in this increment. Each process starts without a live cache; enabled sources refresh at startup and every 15 minutes. Failed reads show an explicit error and retained data is marked LAST KNOWN. No refresh writes workboard records.
- Existing Registry, financial and historical Calendar snapshots remain dated snapshots. Miles remains link-only.

## Configuration

Keep the existing owner token and `/var/data` path. Configure through Render's protected environment fields:

| Variable | Value |
| --- | --- |
| `CIRCLE_GOOGLE_OAUTH_CLIENT_ID` | Google Web application Client ID |
| `CIRCLE_GOOGLE_OAUTH_CLIENT_SECRET` | Matching Client secret |
| `CIRCLE_GOOGLE_TOKEN_KEY` | Existing securely generated 64-character hexadecimal key; preserve it |
| `CIRCLE_GOOGLE_EXPECTED_EMAIL` | `hart@bayberrygarden.com` |
| `CIRCLE_CALENDAR_ID` | `hart@bayberrygarden.com` |
| `CIRCLE_GMAIL_QUERY` | `newer_than:30d -in:spam -in:trash -category:promotions {atlas investor investment capital landlord cornish "200 Washington" staffing}` |
| `CIRCLE_GMAIL_ENABLED` | `false` until Gmail authorization/read passes |
| `CIRCLE_CALENDAR_ENABLED` | `false` until Calendar authorization/read passes |

The exact registered callback is `https://circle-home.onrender.com/oauth/google/callback`. The runtime derives its canonical origin from Render's supplied external URL. Both APIs must be enabled in the client project. If the Google consent audience is External/Testing, add the approved source account as a test user. Google's Testing mode can expire these refresh tokens after seven days; do not describe that setup as permanent unattended authorization.

## Release gate and procedure

1. Run `npm run check` and `npm test` on Node 24. The increment suite tests the existing server with synthetic records, auth/guest restrictions, CSRF, encrypted consent and failure behavior, plus an actual child-process restart retaining the original synthetic records and extra fields.
2. Run the same suite in an isolated temporary checkout on Render. Tests use their own temporary data directories and fake Google transport. They must not read/write production records or call real Google data APIs.
3. Verify the production workboard checksum still matches the private off-volume recovery copy. Record the current deploy. A new backup is required if it has changed. Preserve the existing disk and owner token.
4. With auto-deploy off, merge only this tested increment, deploy the selected commit, and perform owner/unauthenticated read-only probes. Verify exact workboard bytes and the running release; both source flags stay false.
5. The owner connects Gmail and Calendar independently from Systems & sources. The callback confirms a real authenticated read before retaining authorization. Run each Test read independently.
6. Enable only a successfully tested source. Treat Render connector environment updates as deployments: the connector triggered a redeploy during setup. Dashboard **Save only** is the verified option when no deploy is intended.
7. Verify startup and scheduled refresh timestamps advance, then verify encrypted authorization and workboard persistence across a controlled restart. Until those checks pass, report authorization/reads separately from live automatic synchronization.

## Rollback

Before this increment, the current existing-code deployment is `dep-db8ep7nf3r2c73fica2g` on commit `6d2f5d64c7597f29f383eb392d6c444dc758127c`. Record the latest actual deployment before promotion. For code rollback, restore the previous Render deployment without restoring a disk snapshot or replacing the workboard. Existing code ignores the separate Google authorization file. Keep its encryption key to recover authorization later. Do not reseed, migrate or restore records automatically.

## Evidence so far

- Corrected saved OAuth ID and secret passed private format checks in Render; no value was displayed. This is not proof the pair has authenticated.
- Production workboard survived the preceding configuration redeploy with the original 304 bytes and SHA-256 `04d0030f2e11c45f7dc64ab5a2b2005240498418a96385716b544e4b6c5f8d89`. An off-volume backup is already verified privately.
- Local increment tests: 7/7 passed; JavaScript syntax checks: 16 passed. These tests use synthetic transport and records, not authenticated Google data.
- Hosted candidate preflight, deployment and actual Google consent/refresh are pending until recorded otherwise.
