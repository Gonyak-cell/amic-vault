# R5 ABAC Policy Matrix Proof

PACK-R5-03 introduces condition evaluation for explicit `permissions.condition_json`
without changing the frozen role matrix or public PermissionService signatures.

## Evaluator Scope

- Allowed attributes are limited to role/practice-group, matter status/practice-group/client,
  and document status/type/confidentiality/privilege metadata.
- Allowed operators are `eq`, `not_eq`, `in`, `not_in`, and `exists`.
- Unsupported attributes, unsupported operators, extra keys, malformed combinators, and
  injection-shaped values evaluate to invalid and fail closed as `PERMISSION_DENIED`.
- No document body, snippet, file name, token, password, or raw content value is exposed to
  the evaluator context.

## RBAC Invariance

The existing `permission-matrix` harness remains unchanged for the frozen role/action surface:

- `tests/fixtures/permission-matrix.json` is not modified.
- `tests/integration/permission-matrix/matrix-expected.csv` is not modified.
- PACK-R5-03 adds ABAC cases in `tests/integration/permission-matrix/abac-policy.spec.ts`
  instead of replacing any RBAC expected cell.

## Added Attribute Cases

- Tenant RLS on `permission_policy_attributes`.
- Matching matter condition DENY.
- Valid false matter condition ignored without creating a false deny.
- Matching document condition ALLOW for high-confidentiality read.
- Expired conditional ALLOW ignored.
- Unknown attribute fail-closed.
- Lower-priority matching DENY still overrides higher-priority matching ALLOW.

## False Allow Guard

The added ABAC tests assert zero false allows for unknown attributes, malformed values,
expired ALLOW rows, and deny-overrides. Search filters retain their existing query-stage
fail-closed behavior for condition-bearing permission rows and do not introduce post-filtering.
