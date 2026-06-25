# Matter/Vault Linkage Operationalization Runbook

Status: local operationalization started  
Reference plan: `docs/release/matter-vault-linkage-plan.md`  
Current branch at handoff: `codex/integration-copy-outlook-manifest`

## Scope

This runbook starts the remaining operational work after MV-LINK-017 through
MV-LINK-024 passed locally. It covers local AMIC DB reproducibility, Matter app
lookup and upload-preflight gates, role boundaries, scoped audit evidence, and
release handoff.

This runbook does not authorize customer document import, OneDrive bulk import,
source-of-truth cutover, production Matter source claims, Office open/save/sync
claims, Gemma indexing, or raw customer content storage.

## Current Local Acceptance State

- Local AMIC DB has 80 clients and 123 matters.
- Linked matters: 123.
- Unlinked matters: 0.
- Matter members: 123.
- Matter app lookup can search by Matter code and canonical client name.
- Matter app lookup returns canonical `clients.name` when matter metadata does
  not carry a client display label.
- Non-member lookup returns zero rows.
- Replay dry-run reuses 123 matters and plans zero duplicate creates.
- Local runtime uses `MATTER_APP_SOURCE_MODE=vault_projection_only` with
  `ALLOW_VAULT_PROJECTION_MATTER_SOURCE=true`.
- Local projection is lookup-ready but not upload-authoritative.

## Evidence Index

Repo-safe release receipt:

- `.omo/evidence/MV-LINK-ACCEPTANCE/mv-link-024-release-receipt.sanitized.json`

Remaining-work receipts:

- `.omo/evidence/MV-LINK-REMAINING/next-mv-001-008-handoff-index.sanitized.json`
- `.omo/evidence/MV-LINK-REMAINING/next-mv-004-current-projection-preflight.sanitized.json`
- `.omo/evidence/MV-LINK-REMAINING/next-mv-004-authoritative-preflight-smoke.sanitized.json`

These receipts are local evidence only. They store counts, states, hashes, and
safe refs, not raw paths, customer names, Matter codes, filenames, document
text, OCR excerpts, screenshots, cookies, tokens, DB URLs, or secrets.

## NEXT-MV-001: Branch And PR Handoff

Objective: keep the Matter/Vault linkage fix visible in the current branch and
attach the local acceptance receipt to the PR narrative.

Required PR notes:

- Linkage fix commit SHA.
- Local DB counts: clients, matters, linked matters, unlinked matters.
- Replay idempotency result.
- Authenticated Matter app lookup result.
- Explicit non-executed list.

Gate:

- Remote branch head matches local head.
- Worktree has no unstaged changes from this lane.
- PR text does not include raw customer data or tenant-private identifiers.

## NEXT-MV-002: Local DB Reproducibility

Objective: make local reset recovery deterministic without importing documents.

Recovery flow:

1. Run the approved mapping writer in dry-run mode.
2. Confirm zero blockers.
3. Execute the approved client/matter mapping writer only if local clients and
   matters are missing.
4. Re-run the writer in dry-run mode.
5. Confirm `matter_reused=123` and duplicate create count `0`.
6. Confirm final counts: clients `80`, matters `123`, linked matters `123`,
   unlinked matters `0`.

The writer must not import files, write Vault storage objects, run OneDrive bulk
import, perform cutover, or trigger indexing.

Gate:

- Restore-run audit counts are evaluated by `migration_run_id`, not global
  action totals.
- Total audit rows are treated as append-only historical evidence and are not
  deleted or rewritten.

## NEXT-MV-003: Authenticated UI And Picker QA

Objective: confirm the UI-facing picker path consumes the same lookup contract.

Current completed checks:

- Matter app integration route returns HTTP 200 locally.
- Web API helper and picker tests passed.
- Matter app lookup endpoint returned canonical client fallback through an
  authenticated session.

Remaining optional UI check:

- Run browser automation or manual QA against `/files`.
- Search by canonical client label.
- Confirm a Matter option renders with a client label.
- Confirm UUID-like internal references are rejected.

If browser automation is unavailable, record that limitation and rely on API
surface checks plus picker/helper tests.

Gate:

- No screenshots or raw matter/client values in repo.
- UI evidence may store booleans, counts, selectors, route names, and hash refs
  only.

## NEXT-MV-004: Upload Preflight Linkage

Objective: prove upload preflight is wired to Matter source and permission gates
without uploading a document.

Current local projection result:

- `vault_projection_only` returns lookup availability but
  `uploadAuthoritative=false`.
- Upload preflight is blocked with `VALIDATION_FAILED` and
  `MATTER_SOURCE_UNAVAILABLE`.
- This is the expected safe boundary.

Temporary local authoritative smoke:

- A local-only `matter_app_api` runtime smoke confirmed source-authoritative
  preflight can issue a preflight ref for an edit-capable matter actor.
- A non-member actor received `PERMISSION_DENIED`.
- The temporary membership used for the smoke was removed and the member count
  returned to 123.

Gate:

- No document upload.
- No file storage write.
- No production source claim.
- Local runtime is restored to `vault_projection_only` after the smoke.

## NEXT-MV-005: Production Source Contract

Production must choose one authoritative source mode before uploads can rely on
Matter app targets:

- `matter_app_api`: Vault calls the approved Matter app API contract at runtime.
- `matter_app_event_projection`: Vault consumes an approved event projection
  with freshness and reconciliation gates.

Production must not use `vault_projection_only` as upload authority.

Required production gates:

- Source contract approved.
- Runtime configured and healthy.
- Source freshness defined and monitored.
- Stale source blocks mutation.
- Upload preflight positive and negative paths pass under the chosen source.
- Cutover approval is recorded separately.

## NEXT-MV-006: Role And Operator Boundary

The current role model uses a single `users.role` value.

Operational distinction:

- `firm_admin` covers tenant/user/admin operations and migration operator
  duties.
- `security_admin` covers security and wall-administration duties.
- Matter upload requires Matter edit permission, which depends on a role that
  permits Matter editing plus edit-capable membership.

Important boundary:

- `firm_admin` is not a universal Matter upload actor.
- Upload checks must keep Matter membership and permission evaluation in the
  path.

Gate:

- Migration writes use an active `firm_admin` operator.
- Security-only checks use `security_admin`.
- Upload-preflight positive checks use an edit-capable Matter actor.

## NEXT-MV-007: Scoped Audit Policy

Audit evidence must be scoped by the relevant run reference.

Rules:

- Do not delete or rewrite audit rows.
- Do not treat global action totals as acceptance counts when prior local runs
  exist.
- Use `metadata_json->>'migration_run_id'` or a similarly bounded run reference
  for acceptance receipts.
- Store only safe metadata such as role transitions, reason codes, hashes,
  counts, and run refs.

Gate:

- Restore-run scoped audit counts match expected counts.
- Global audit totals may be higher and are documented as historical local
  validation state.

## NEXT-MV-008: Release Evidence Bundle

Objective: provide one handoff index for the operationalization lane.

Required fields:

- Commit SHA and branch.
- DB counts.
- Role counts by role and status.
- Acceptance evidence refs.
- Preflight evidence refs.
- Non-executed list.
- Sanitization statement.

Current bundle:

- `.omo/evidence/MV-LINK-REMAINING/next-mv-001-008-handoff-index.sanitized.json`

## Final Gate

This lane is acceptable when all of the following are true:

- Unlinked matter count is 0.
- Matter app lookup by canonical client name passes.
- Replay dry-run plans zero duplicate creates.
- Current local projection blocks upload preflight.
- Temporary authoritative preflight smoke passes and then restores the local
  runtime mode.
- API and web tests pass.
- API and web typecheck pass.
- API and web build pass.
- Sanitized local receipts are present.
- No excluded data or production claim is stored in repo.
