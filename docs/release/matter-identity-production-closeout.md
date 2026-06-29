# Matter App Identity Production Closeout

Status: production identity sync and authenticated read smoke passed.

Scope:

- Production Matter app identity seed/upsert and Vault projection sync for AMIC identity rows.
- Production Vault API read-surface deployment for the current Matter lookup implementation.
- Authenticated production smoke for Matter code, Matter name, client name, and canonical client-name fallback.

Out of scope:

- Customer document import.
- Vault storage write.
- Production source-of-truth cutover.
- OneDrive connected-state claim.
- Office open/save/sync claim.
- Gemma indexing execution.
- Customer-wide go-live claim.

## Executed Work

| Work item | Result | Evidence |
| --- | --- | --- |
| Production Vault identity seed | PASS | `production-vault-identity-seed.sanitized.json` |
| Production canonical client/matter upsert and Vault projection sync | PASS | `production-canonical-upsert-sync.execute.sanitized.json` |
| Replay dry-run/idempotency | PASS | `production-canonical-upsert-sync.replay.sanitized.json` |
| Production DB reconciliation | PASS | `production-identity-post-execute-db-reconciliation.sanitized.json` |
| Matter bridge HTTP readiness | PASS | `production-matter-bridge-http-readiness.sanitized.json` |
| Vault API current-head image deployment | PASS | `production-vault-api-current-head-image-deploy.sanitized.json` |
| Matter source freshness config | PASS | `production-vault-api-identity-source-freshness-config.sanitized.json` |
| Authenticated production identity read smoke | PASS | `production-authenticated-identity-read-smoke.sanitized.json` |

## Current Counts

The production identity seed/reconciliation receipts record:

- Clients: 80.
- Matters: 123.
- jwsuh matter memberships: 123.
- Unlinked matters: 0.
- Duplicate Matter codes: 0.

The authenticated read smoke records:

- Health live: PASS.
- Unauthenticated Matter app status: `AUTH_REQUIRED`.
- Authenticated Matter app status: PASS.
- Source mode: `matter_app_event_projection`.
- Matter code lookup: PASS.
- Matter name lookup: PASS.
- Client name lookup: PASS.
- Canonical `clients.name` fallback: PASS.
- Vault internal UUID-like input returns empty result: PASS.
- Cross-tenant negative lookup hidden: PASS.
- Temporary sessions revoked: PASS.

## Deployment Notes

The first attempt to reuse the staging API image in production failed before serving traffic because the image architecture did not match the production Fargate runtime. Production service traffic remained on the previous healthy task definition. The service was stabilized, then the same repo head was rebuilt as a production `linux/amd64` API image and deployed.

The production Vault API now runs the current Matter lookup implementation, including the SQL-stage `clients` join and canonical client-name fallback.

Matter bridge HTTP readiness also required a live path-normalization fix on the Matter app Lambda surface. The source for that Lambda is not in this repository, so the durable follow-up is to apply the same leading-slash/raw-path normalization in the Matter app source repository or deployment package. Until that upstream source is patched, this repository records the production evidence but does not claim to own that Lambda source change.

## Required Next Gates

1. Production source-of-truth cutover preflight/execute requires a separate explicit approval.
2. Customer document import or Vault storage write requires a separate explicit approval.
3. Gemma indexing execution requires cutover PASS and a separate explicit approval.
4. OneDrive connected-state and Office open/save/sync require separate product/runtime evidence before any claim.

## Non-Claims

This closeout does not claim OneDrive connected state, Office sync, customer-wide go-live, production source-of-truth cutover, customer document import, Vault storage write, or Gemma indexing.
