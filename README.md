# CIRCLE Home — isolated hosting candidate v2.2 alpha

This is a **deployment candidate**, NOT deployed, NOT externally synchronized, and NOT an approved production service. It retains the v2.1 interface, the corrected Miles Parallel launch link, and the explicit dated registry/financial/calendar snapshots.

## Local test

Requires Node.js 22+. `node server.js`; open http://127.0.0.1:4177. Local workboard is saved under `data/` by default. **Do not replace the existing working Mac installation with this candidate.**

## Private hosted setup (after selecting a host)

1. Create a **separate private GitHub repository** for this application; do not put it inside Miles. `.gitignore` excludes the workboard and `.env` secrets. Repository creation and deployment are not yet completed.
2. Provision private, persistent disk storage for `CIRCLE_DATA_DIR`. Provide a tested backup/restore process before migrating live local workboard records.
3. Set `HOST=0.0.0.0`, `PORT` as assigned by the host, `CIRCLE_DATA_DIR` to the private persistent volume, and `CIRCLE_ADMIN_TOKEN` to a unique unpredictable secret of at least 32 characters. The candidate intentionally refuses hosted startup if the secret or data directory is absent.
4. Deploy behind **HTTPS**. Basic authentication is a temporary *single-owner* access gate: credentials must never traverse plain HTTP over the public internet. Prefer the hosting platform's identity/access gateway before wider use. Do not grant access to staff or investors using this alpha.
5. Verify authentication rejection, owner login, write persistence through restart, backups, and that no information is available before authentication. `/healthz` intentionally gives only `ok` without data.
6. Do not introduce automatic connector polling or Miles database access until service-account permissions, data contracts, and error handling are reviewed.

## Current limitations

- The source values in `/api/sources` are historical snapshots (Oct 14, 2026), not sync.
- Workboard records are local application records and are **not** authoritative CIRCLE Registry entries. No writeback.
- HTTP Basic Auth is not multi-user RBAC, SSO, audit logging, rate limiting, or an end-to-end security review.
- The browser UI has not received a full end-to-end interactive test in this candidate.
- Actual source repository provisioning, hosting, secrets configuration, cloud volume, and deployment remain pending.

## Verify

`npm run check` (syntax); `npm start` (local launch). Do not commit actual business data or secrets.
