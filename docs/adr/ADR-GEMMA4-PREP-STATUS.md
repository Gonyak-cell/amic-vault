# ADR: Gemma4 Upload Prep Rejection Status

Date: 2026-06-16
Status: Accepted

## Context

Gemma4 upload prep is a local-only file-organization worker. It may organize
uploaded document information into document profile, key fields, date facts,
people and organizations, keyword tags, filing suggestions, source outline, and
retrieval hints.

It must not perform legal issue extraction, risk analysis, clause analysis,
legal conclusions, liability views, strategy recommendations, permission
decisions, external sharing, or production authorization.

The prior implementation discarded invalid Gemma output and could persist a
deterministic completed fallback artifact. That kept raw model output out of
storage, but it made model-output rejection look too much like a successful prep
result. It also made policy-blocked, runtime-failed, and model-output-rejected
states harder to distinguish in ops and eval gates.

## Decision

`rejected` is a first-class terminal `ai_prep_artifacts.status`.

The terminal states are:

- `blocked`: permission, policy, redaction, or source-readiness denial before a
  valid model output can be considered.
- `failed`: worker/runtime exhaustion such as dead-letter retry exhaustion.
- `rejected`: Gemma returned unsupported, invalid, or forbidden upload-prep
  output and the raw output was discarded.

Rejected artifacts must:

- carry a bounded `failure_reason_code`;
- carry `prompt_hash` and `response_hash`;
- keep `model_route = local_gemma`;
- store only a deterministic file-organization payload that passes the same
  allowed claim/source-ref contract used for completed prep payloads;
- record `AI_PREP_REJECTED` audit metadata with reference IDs, reason code, and
  hashes only;
- never expose payload content through document status UI/API, because only
  completed non-stale payloads are user-visible.

## Migration

`db/migrations/0069_add_ai_prep_rejected_status.sql` adds:

- `rejected` to the `ai_prep_artifacts.status` check;
- terminal reason-code enforcement for `blocked`, `failed`, and `rejected`;
- rejected prompt/response hash enforcement;
- rejected payload file-organization enforcement;
- `AI_PREP_REJECTED` in the audit action allow-list.

Down migration converts rejected artifacts to `failed` with
`AI_PREP_REJECTED_ROLLBACK`. Audit action rollback keeps `AI_PREP_REJECTED`
allowed because `audit_events` is append-only and historical rejected audit rows
cannot be deleted safely.

## Consequences

Ops, scan, eval, and matter readiness can now report rejected model output
without counting it as completed prep.

Historical completed fallback telemetry remains readable for older rows, but
new invalid Gemma output should be represented as `rejected` rather than
`completed` with fallback metadata.

This ADR does not authorize production Gemma runtime enablement. Production
runtime flags remain subject to separate PACK-LAI-20 governance approval.
