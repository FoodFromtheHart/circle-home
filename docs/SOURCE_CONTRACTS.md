# Read contracts and institutional boundaries

## Organization and authority

CIRCLE is the institution. CIRCLE OS is its coordination and systems layer. Miles is operating intelligence/interface. This app reads authoritative records and derives a view; it does not acquire authority to change them.

The server defaults to organization `circle`, with a fixed entity allowlist obtained from the current Registry. Bayberry remains `ENT-0101`, ATLAS remains `ENT-0102`, and ATLAS Development remains `DEV-0102`. The `ENT-0001`/`ENT-0002` example entities are excluded from executive results. Additional entities require a deliberate scope configuration change. No organization ID supplied by a browser changes the server's scope.

External organizations require explicit source IDs and entity allowlists, their own deployment, storage and credentials. They receive no CIRCLE historical snapshots, legacy interface or default source links. The configuration rejects the known CIRCLE spreadsheet IDs for external organizations. Full external-client RBAC is outside this single-owner release and must precede shared-client access.

## Registry contract: circle-registry/v1

The authoritative Registry is a native Google Sheet. Required headers are declared in `lib/contracts.js`, rather than inferred from prose. Exact tab names are validated against Sheets metadata before reading.

| Surface | Object identity | Use |
| --- | --- | --- |
| Entities | entity_id | Canonical identity, operating state and scope |
| Roles | role_id | Owner-role labels; never invent a person assignment |
| Executive Portfolio | portfolio_item_id | Priorities, capital need, next milestones, blockers and document references |
| Development Projects | project_id | Stage, next gate and blockers; ATLAS identity enforced |
| Actions | action_id | Execution state, due date, owner and source references |
| Decisions | decision_id | Recorded direction, authority role, status and rationale |
| Miles Attention | source_id | Existing attention references, deduplicated against their owned objects |
| Executive Review | metric_id | Review signals with original provenance |
| Documents | document_id | Source links and authoritative/draft designations |
| Object Contracts | domain / owned_object | Ownership and reference-don't-rebuild boundary |
| Permission Contracts | permission_id | Read-only institutional contracts; not represented as implemented RBAC |
| Attention Model | signal_id | Only ACTIVE numeric ranking weights are used |

Each row retains a source link to its exact sheet tab/row. Missing required columns, duplicate canonical IDs, wrong canonical identities, incomplete responses or a source revision changing mid-read reject that refresh. All queries are GET and bounded by the metadata grid, with a hard 10,000-row-per-tab limit and 10 MB response cap; larger sources require an explicit contract change.

Ranking is a derived suggestion. It cannot modify source priority, ownership, status, approval or decision truth. Draft attention weights (including deadline weights) remain inactive. Explicit approaching deadlines are shown without silently activating draft weights. Existing decision dates are historical decision context, not invented future decision deadlines.

Changes compare consecutive successful projections. The first read establishes a baseline; unchanged polls retain the last actual observed change. A removed item means it left the source view, not that the underlying business object was deleted. This is not a new Event Log or decision database.

## Financial contract: bayberry-financial/v1

The current Bayberry workbook's exact reporting labels define the adapter. `Weekly review` respects the workbook's selected week, including a deliberate manual selection. `Monthly review` follows the current 2026 month/budget layout; a renamed annual budget label deliberately requires a contract review instead of silently interpreting a different plan.

| Source surface | Fields used |
| --- | --- |
| Weekly review | Selected week; net sales; covers; spend per cover; salary/hourly wages; loaded labor; purchase ratios; prior-four-week trends |
| Monthly review | Month and close status; net sales; 2026 budget/variance; labor and food COGS ratios; reported earnings; reconciliation residual |
| Overview | Sales history completeness, selected-sales check, financial-close readiness, planning completeness |
| Refresh | Each upstream source's connection, data-through date, import timestamp and next requirement |
| Toast sync log | Latest run for the selected week, preserved result and reconciliation message |

Blank costs remain null. Zero remains zero. Purchasing activity is not renamed food COGS. Monthly labor and COGS are shown only where values exist, with the original close status. Reported earnings and visible-line residuals are retained separately; no reconciliation is invented. The API returns all monthly periods, including pending months.

Four independent facts accompany the financial view:

1. **Retrieval:** Did this authenticated application read succeed, and when?
2. **Source revision:** When was the workbook last modified, and was it stable during the read?
3. **Business period:** What week/month do the figures describe? Weekly periods older than 10 days and monthly actual periods older than 62 days are explicitly stale.
4. **Quality:** What does the source say—provisional, unverified, closed, pending? Successful retrieval cannot upgrade this state.

The 10-day/62-day age checks are display heuristics, not approvals or source changes. A dated archived snapshot is available separately; it never fills an unavailable current metric.

## Credentials, failures and caches

Secrets remain in server environment/memory and are not exposed through status APIs, logs, HTML or errors. Service-account OAuth tokens are short-lived and refreshed server-side. Credential endpoint URLs are fixed; redirects and arbitrary upstream URLs are rejected. Personal OAuth is reserved for independently enabled Gmail/Calendar increments.

Each connector has its own disabled/configured/awaiting-refresh/connected/stale/error state and last-success timestamp. Refresh errors never advance last success or overwrite good data. Source cache files are bound to organization, source IDs, entity scope, query/calendar scope and contract version. A changed scope discards cache use. A restarted process cannot mark cached data current until it has completed an authenticated read.

The only outbound writes are OAuth token exchanges. No source update, Gmail send/label operation, Calendar event mutation, Registry writeback or Miles database access exists in this implementation.

## Reserved Miles read interface

Miles remains a verified launch destination only in this release. Before enabling a future adapter, Miles must expose an authenticated read endpoint whose response includes an organization ID, canonical entity IDs, a stable contract version, source timestamp and per-object provenance. The Home adapter must reject organization mismatches, unknown entity scope, unavailable/stale data presented as current and unsupported contract versions. The same independent-test and disabled-by-default gates apply. A read endpoint is not permission for database access or production writes. No endpoint URL, credential or implemented Miles API is assumed here.
