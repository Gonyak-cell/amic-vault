# Access Request And Break-Glass Workflow

Related TUW: DMS-GA-405

Status: repo-side DMS GA boundary and evidence contract.

This document records the approved access request and break-glass stance for the
Enterprise DMS GA release. It is intentionally reference-only and must not
include customer matter names, document contents, private endpoints, cookies,
tokens, raw IDs as labels, or provider-console evidence.

## Current Release Boundary

Denied DMS users do not get a fake self-service access request flow in the
current production UI. Denied, wall-blocked, or unavailable states must remain
safe and non-discoverable. User-facing screens may point users to the approved
security/admin policy path, but they must not imply that an access request was
created unless the server-side break-glass API has actually recorded it.

Approved break-glass capability is API-backed only:

- `POST /v1/break-glass/requests`
- `POST /v1/break-glass/requests/:requestId/approvals`
- `POST /v1/break-glass/requests/:requestId/revoke`

The workflow requires two distinct approvers, expiry, revocation, and
reference-only audit. Requesters cannot approve their own request. Expired or
revoked approvals fail closed. Search and document permission paths may use an
approved unexpired break-glass override only through the permission service and
break-glass override reader.

## UI Rules

- Normal DMS routes must not render raw user, group, wall, matter, tenant, or
  document identifiers as the primary access request label.
- Normal denied states must not show a local-only request, pending approval, or
  access granted state unless that state came from an approved API response.
- Wall administration may expose advanced security-operations reference entry
  only for approved admin roles. Common wall creation and lookup remain
  Matter-Code based.
- Work queue and notification surfaces may link to approved policy/admin
  surfaces, but they must not invent access request tasks.
- Any future user-facing access request UI must include tests proving
  fail-closed denial, two-approver approval, expiry, revocation, reference-only
  audit metadata, and stale-content clearing.

## Evidence Refs

Repo-side evidence for this TUW is:

- `apps/api/src/modules/break-glass/break-glass.controller.ts`
- `apps/api/src/modules/break-glass/break-glass.service.ts`
- `apps/api/src/modules/break-glass/break-glass-override.reader.ts`
- `packages/shared/src/break-glass/break-glass.dto.ts`
- `tests/integration/permission/break-glass.spec.ts`
- `tests/integration/search-permission/search-break-glass.spec.ts`
- `apps/api/src/modules/ethical-wall/ethical-wall.service.spec.ts`
- `docs/ui/enterprise-dms-pr-d-closeout.md`
- `docs/ui/enterprise-dms-ux-route-capability-inventory.md`

External production release remains `HOLD` for any broader access workflow claim
until the evidence workspace includes approved owner refs for scope, expiry,
revocation, incident use, and audit review.
