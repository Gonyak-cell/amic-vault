# Production Source-of-Truth Cutover Next Gate Plan

Status: ready for separate approval.

This plan starts after:

- Matter app identity production closeout: PASS.
- Matter Lambda path-normalization closeout: PASS.

This plan does not itself approve or execute customer document import, Vault storage write, production source-of-truth cutover, OneDrive connected-state, Office open/save/sync, Gemma indexing, or customer-wide go-live.

## Required Approval Text

Use this text when ready to authorize the next gate:

```text
AMIC production source-of-truth cutover preflight를 승인한다.
approval_ref=APPROVAL-ONEDRIVE-PRODUCTION-CUTOVER-PREFLIGHT-2026-06-30

범위는 production Vault DB와 Matter app identity projection이 source-of-truth cutover execute 준비 상태인지 확인하는 preflight에 한정한다.
기준 evidence는 matter-identity-production-closeout.md 및 matter-lambda-path-normalization-closeout.md이다.

승인하지 않는 항목:
- source-of-truth cutover execute
- customer document import
- Vault storage write
- OneDrive connected-state claim
- Office open/save/sync claim
- Gemma indexing execution
- customer-wide go-live claim
```

For execute, use a separate approval only after preflight PASS:

```text
AMIC production source-of-truth cutover execute를 승인한다.
approval_ref=APPROVAL-ONEDRIVE-PRODUCTION-CUTOVER-EXECUTE-2026-06-30

범위는 production Vault DB에 source-of-truth cutover control/receipt/audit 상태를 기록하고,
post-cutover Vault/Matter read surface smoke를 수행하는 작업에 한정한다.
기준 evidence는 production source-of-truth cutover preflight PASS receipt이다.

승인하지 않는 항목:
- customer document import
- Vault storage write beyond cutover control/audit state
- OneDrive connected-state claim
- Office open/save/sync claim
- Gemma indexing execution
- customer-wide go-live claim
```

## TUW

### CUTOVER-PRE-001: Approval Ref Freeze

- Record the opaque approval ref in a sanitized receipt.
- Do not store tenant-private raw values, raw endpoint, token, secret, raw path, object key, customer document body, Matter Code, matter name, or client label.

Acceptance:

- Approval receipt exists.
- Forbidden claims remain false.

### CUTOVER-PRE-002: Production Identity And Import Baseline

- Confirm production identity projection remains: clients 80, matters 123, unlinked matters 0, duplicate Matter codes 0.
- Confirm production import/cutover state before execute.
- Confirm document relation counts if document import is in scope for the target environment.

Acceptance:

- Baseline receipt PASS.
- Any missing import scope is classified as a blocker, not silently skipped.

### CUTOVER-PRE-003: Rollback And Containment Check

- Confirm rollback pointer, prior source-of-truth state, and containment receipt location.
- Confirm no running import wave or indexing job conflicts with cutover.

Acceptance:

- Rollback/containment receipt PASS.
- No concurrent write lane conflict.

### CUTOVER-PRE-004: Preflight Closeout

- Reconcile identity, import, rollback, and runtime read-surface checks.
- Produce `production-source-cutover-preflight.sanitized.json`.

Acceptance:

- `ready_for_execute=true`.
- Execute remains false.

### CUTOVER-EXE-001: Cutover Execute

- Requires separate execute approval.
- Record source-of-truth cutover control state and audit event.
- Do not perform customer document import or Gemma indexing in this TUW.

Acceptance:

- Cutover control state PASS.
- Audit receipt PASS.
- Rollback reference preserved.

### CUTOVER-EXE-002: Post-Cutover Read Surface Smoke

- Confirm Vault canonical read surface.
- Confirm Matter app lookup still returns matching client/matter/Matter code projection.
- Confirm permission negative path remains fail-closed.

Acceptance:

- Post-cutover smoke PASS.
- Forbidden claims remain false unless separately evidenced and approved.

## Next Gate After Cutover

Gemma indexing preflight may begin only after cutover execute PASS and a separate Gemma approval.
