# Production Source-of-Truth Cutover Preflight Closeout

Status: BLOCKED.

Approval ref:

- `APPROVAL-ONEDRIVE-PRODUCTION-CUTOVER-PREFLIGHT-2026-06-30`

Scope actually evaluated:

- Production Vault DB and Matter app identity projection readiness for a later source-of-truth cutover execute.
- Existing production identity closeout evidence.
- Existing Matter app Lambda path-normalization closeout evidence.
- Production cutover gate dry-run.

Not executed:

- Source-of-truth cutover execute.
- Customer document import.
- Vault storage write.
- OneDrive connected-state claim.
- Office open/save/sync claim.
- Gemma indexing execution.
- Customer-wide go-live claim.

## Evidence

Sanitized local receipts:

- `.omo/evidence/PRODUCTION-SOURCE-CUTOVER-PREFLIGHT/production-source-cutover-preflight.sanitized.json`
- `.omo/evidence/PRODUCTION-SOURCE-CUTOVER-PREFLIGHT/production-vault-db-baseline.sanitized.json`
- `.omo/evidence/PRODUCTION-SOURCE-CUTOVER-PREFLIGHT/production-vault-db-task-baseline.sanitized.json`
- `.omo/evidence/PRODUCTION-SOURCE-CUTOVER-PREFLIGHT/production-cutover-gate-dry-run.sanitized.json`

Basis docs:

- `docs/release/matter-identity-production-closeout.md`
- `docs/release/matter-lambda-path-normalization-closeout.md`
- `docs/release/production-source-cutover-next-gate-plan.md`

## Result

The preflight did not reach `ready_for_execute`.

Basis identity evidence remains PASS:

- clients: 80
- matters: 123
- jwsuh memberships: 123
- unlinked matters: 0
- duplicate Matter code groups: 0

Blocking conditions:

- Production DB direct secret read was not available to the current operator profiles.
- Production ECS execute-command is disabled, and the bounded read-only one-off task path was not available to the current operator profiles.
- Production customer-wide import closeout PASS receipt is not present.
- Production cutover gate dry-run is blocked by missing/not-passed production import closeout.
- Therefore the production DB document/cutover baseline could not be freshly verified in this preflight.

## Handoff

Before requesting source-of-truth cutover execute approval:

1. Provide a bounded production DB read path for sanitized count verification, or grant the cutover-preflight operator a read-only preflight path.
2. Complete and close out production customer document import, or explicitly redefine the next cutover scope as identity-only.
3. Rerun production source-of-truth cutover preflight until `ready_for_execute=true`.
4. Request separate source-of-truth cutover execute approval only after preflight PASS.

## Sanitization

This closeout stores only counts, booleans, hashes, sanitized evidence filenames, and non-claim states. It does not store raw endpoints, secrets, tokens, ARNs, account IDs, tenant UUIDs, user UUIDs, raw paths, object keys, customer document body/OCR text, Matter Codes, matter names, or client labels.
