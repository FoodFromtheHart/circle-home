# CIRCLE Executive Home

The existing Render application is at https://circle-home.onrender.com. This branch is the **2.3 release candidate** for that application, based on repository commit `5006b08d5c4d275359a3ed1785f5c9cabaf7119b`. It is not a replacement Miles application.

The candidate keeps the public/ interface, provisional workboard format, source records, historical snapshots, and Hart-confirmed Miles Parallel destination. It adds protected recovery backups, authenticated server-side read adapters, explicit source freshness/error states, and a Registry-derived executive briefing. It has **not** been promoted to production. Successful local tests or ChatGPT connector reads do not establish live synchronization on Render.

## Run and verify

Node 24 is selected in `.node-version`; there are no third-party runtime dependencies.

```sh
npm run check
npm test
npm start
```

Local development binds to `127.0.0.1:4177`. Hosted environments require owner authentication and an explicit absolute data path. All data and assets require owner authentication; `/healthz` intentionally returns only `ok` without data. Browser workboard mutations use an ETag to prevent lost updates.

Read [deployment and rollback](docs/DEPLOYMENT.md), [source contracts](docs/SOURCE_CONTRACTS.md), and [acceptance evidence](docs/ACCEPTANCE.md) before promotion. `.env.example` documents configuration; the server reads process environment variables, not `.env` automatically.

## Source integration behavior

- Registry and financial reads use a dedicated service account, read-only Google scopes, exact spreadsheet IDs and validated tab/header contracts.
- Automatic server polling runs at startup and every 15 minutes for explicitly enabled sources. Refresh also works from the browser without a rebuild. Each source refreshes independently.
- Connections are disabled by default. `POST /api/integrations/{registry|financial|gmail|calendar}/test` tests one authenticated read without enabling it or modifying source records. Enable a connector only after its separate read test passes.
- A failed refresh retains the previous successful data with an **error / last-known** state. Restarted caches require a fresh authenticated read before showing connected. No historical snapshot is substituted for an unavailable connector.
- Verified retrieval, provisional financial figures, stale reporting periods and unavailable costs are separate facts. A Toast log saying VERIFIED does not turn provisional sales into a verified financial close.
- Gmail and Calendar are separate disabled increments. They require user OAuth credentials and explicit correspondence/calendar scope. They read bounded metadata/events and never send messages or create events.
- Miles remains link-only. There is no Miles database driver, connection, refresh job or write route.

## Storage and boundaries

`CIRCLE_DATA_DIR/workboard.json` remains version 1. Startup never seeds or rewrites an existing board. Mutations preserve extra fields and create a checksummed pre-change backup. Missing previously initialized or corrupt storage fails closed. Explicit restore is offline, dry-run by default, and requires a matching current checksum and stopped service.

The workboard is a provisional application action surface, not a second authoritative Registry. Source caches and change summaries are derived, disposable read models. They cannot mutate actions, decisions, approvals, ownership or source values.

Organization identity is server-selected, never a browser parameter. Each organization requires its own deployment, owner secret, data directory, source credentials and explicit entity scope. CIRCLE defaults do not apply to external organizations; known CIRCLE sheet IDs and archived institutional views are blocked there. This is **not** multi-user RBAC or an external-client pilot authorization system.

The served application is under `public/`. Root-level original assets, the original ZIP and `public/legacy-v1.3.html` remain preserved historical materials. Do not use them as the new deployment root.
