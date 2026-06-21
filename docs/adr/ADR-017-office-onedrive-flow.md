# ADR-017: Office And OneDrive Flow Gate

Status: Accepted for planning gate only
Date: 2026-06-20
Related TUW: DMS-GA-605, DMS-UX-607, DMS-UX-610

## Context

AMIC Vault may need a future Microsoft 365 lane for OneDrive-backed document
storage, Office open/save, and controlled collaborative editing. That lane is
not approved for the Enterprise DMS GA repo-side release. The current release
has a Matter-first document model with immutable originals, versioned
FileObject updates, permission-before-search, permission-before-AI, and
audit-by-default invariants. A connected Office or OneDrive claim would be
unsafe before the runtime contract proves the same invariants across Microsoft
auth, storage callbacks, version writes, audit receipts, and rollback.

## Decision

Office and OneDrive remain gated. Production UI must not claim OneDrive is
connected, Office open/save is available, coauthoring is available, live edit is
available, lock state is enforced, or sync is running until an approved runtime
contract covers all of the following:

- auth: tenant-scoped Microsoft identity, consent, token storage, token
  rotation, and fail-closed authorization checks;
- storage: object ownership, tenant prefixing, immutable original preservation,
  malware/DLP scan boundary, and storage failure handling;
- version: explicit FileObject version creation for every save-back path, hash
  validation, duplicate handling, and no overwrite of originals;
- audit: reference-only audit events for open, save, sync, deny, callback,
  rollback, and operator actions in the same transaction or compensating
  failure path;
- callback: signed callback validation, replay protection, idempotency,
  tenant/matter/document binding, and safe denied responses;
- rollback: route hiding, feature disablement, token revocation, queue stop,
  callback rejection, storage/version integrity verification, and no hard
  delete of documents, versions, audit events, or storage objects.

The current production policy for `/integrations/onedrive` remains
`hidden_until_api_ready` with `showInNavigation: false`. The integrations parent
may show only a planned or gated card. It must not link to a connected OneDrive
route or imply live Office editing.

## Migration Boundary

Existing law-firm OneDrive corpus migration is post-launch. Pre-launch work may
prepare inventory, mapping, sample dry-run, and rollback planning only. It must
not perform bulk customer document migration, claim OneDrive connected state, or
claim Office open/save/sync availability. The first approved migration scope is
a pilot Matter only, and source-of-truth cutover can occur only after pilot
validation.

The reference release plan is
`docs/release/onedrive-migration-post-launch-plan.md`.

## Current GA Scope

This ADR only authorizes documentation and runtime gates:

- keep `/integrations/onedrive` hidden until the approved API/runtime contract
  exists;
- keep the integrations parent route copy limited to gated states such as
  "승인 전 숨김" and "계약 필요";
- keep document action surfaces free of Office open/save, coauthoring, live edit,
  check-out/check-in, and lock controls unless a later ADR and implementation
  approve them;
- keep rollback and release evidence templates explicit that Office/OneDrive is
  deferred and not a production-connected integration;
- keep existing customer OneDrive corpus migration post-launch, with only
  inventory, mapping, sample dry-run, and rollback planning allowed before
  launch.

## Non-Goals

- No Microsoft Graph API client is introduced by this ADR.
- No external sharing, secure link, or portal behavior is introduced.
- No vector, AI, or legal-analysis behavior is introduced.
- No service worker or offline sync behavior is approved.
- No document overwrite path is approved.
- No pre-launch bulk customer OneDrive migration is approved.

## Follow-Up Entry Criteria

A later implementation PR may revisit this ADR only after it includes approved
API contracts, schemas, migration/rollback plan, PermissionService integration,
audit event design, signed callback design, tenant isolation tests, negative
permission tests, and a staging smoke plan with reference-only evidence.

Until then, DMS-GA-605 is satisfied only as an ADR/runtime gate, not as a
connected Office or OneDrive feature.
