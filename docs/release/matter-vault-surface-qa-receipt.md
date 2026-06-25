# Matter/Vault Authenticated Surface QA Receipt

Status: local authenticated surface PASS  
Branch: `codex/matter-vault-surface-qa`  
Base: `origin/main` after PR #317 merge

## Scope

This receipt records the follow-up QA after the Matter/Vault linkage runbook.
It proves that the local authenticated API and web route surfaces can see the
same canonical client and matter projection.

This receipt does not authorize customer document import, OneDrive bulk import,
source-of-truth cutover, production Matter source claims, Office open/save/sync
claims, Gemma indexing, document upload, or raw customer content storage.

## Local Evidence

Sanitized local evidence:

- `.omo/evidence/MV-LINK-SURFACE-QA/authenticated-surface-smoke.sanitized.json`

The evidence stores only statuses, booleans, counts, source modes, and hash
refs. It does not store raw tenant IDs, user IDs, client IDs, matter IDs, client
names, Matter codes, file paths, document text, OCR excerpts, screenshots,
cookies, tokens, DB URLs, or secrets.

## Checks

| Check | Result |
| --- | --- |
| API live health | PASS |
| unauthenticated Matter app status requires auth | PASS |
| authenticated `/auth/me` has tenant context | PASS |
| authenticated Matter app status returns `vault_projection_only` | PASS |
| Matter code lookup returns the authorized target | PASS |
| Matter name lookup returns the authorized target | PASS |
| client name lookup returns the authorized target | PASS |
| missing metadata client label falls back to canonical `clients.name` | PASS |
| non-member lookup hides the target | PASS |
| authenticated `/files?matterCode=<redacted>` route renders without redirect | PASS |

## Runtime Boundary

Current local mode remains:

- `MATTER_APP_SOURCE_MODE=vault_projection_only`
- `uploadAuthoritative=false`
- `productionRuntime=false`

This is lookup-ready only. Upload-preflight authority still requires an approved
Matter source contract such as `matter_app_api` or
`matter_app_event_projection`.

## Browser QA Boundary

Full pixel-level browser automation was not recorded in this receipt because
the local workspace does not expose Playwright, and no browser automation
session was used. The authenticated web route render was verified by HTTP
against the running Next.js server, while the picker contract was verified by
authenticated Matter app lookup plus the existing web picker/helper tests.

## Acceptance

This lane is accepted for local Matter/Vault lookup linkage when all are true:

- sanitized smoke summary is `PASS`;
- local runtime stays restored to `vault_projection_only`;
- non-member lookup stays hidden by SQL-stage membership filtering;
- no document upload or import is performed;
- API and web tests remain green.

Production upload enablement remains a separate approval and runtime contract
step.
