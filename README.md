# CIRCLE Home

Dedicated repository for CIRCLE's executive home. Separate from Miles and Bayberry's operational repositories.

## Status — October 14, 2026

Repository initialized. **Application source has not yet been imported.** No deployment, live synchronization, or production authorization is implied by this commit.

The tested source candidate is `CIRCLE_Home_v2.2_Hosting_Candidate.zip`, created from the working local CIRCLE Home app. Import its contents into this repository preserving paths (`server.js`, `public/`, `package.json`, `.env.example`, `.gitignore`) before attempting deployment.

### Deployment gates

- Keep the repo private and do not move or modify Miles Parallel.
- Do not commit `.env`, passwords, tokens, or `data/` workboard files.
- Require HTTPS, owner authentication, isolated persistent storage, and verified backups.
- Confirm unauthenticated requests cannot access executive data.
- Treat financial, Gmail, Calendar, and Registry values as dated snapshots until authenticated synchronization is implemented and verified.
- Preserve `ENT-0101` (Bayberry), `ENT-0102` (ATLAS), and `DEV-0102` (ATLAS development) identifiers.
- Never redeploy over the working Mac copy without a separately tested migration.

Local source in the ZIP remains the working implementation baseline; this README is setup documentation only.
