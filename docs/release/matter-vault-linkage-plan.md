# Matter-Vault Client/Matter Linkage Plan

## Scope

This plan covers the linkage between the Matter app surface and the Vault app
surface for clients and matters. It does not perform document import, storage
copy, source-of-truth cutover, external sharing, AI indexing, or production
runtime claims.

## Current Repo State

- Vault stores canonical local client rows in `clients`.
- Vault stores canonical local matter rows in `matters`.
- Each matter points to its client through `matters.client_id`.
- Matter membership and permission-scoped visibility are enforced through
  `matter_members`, ethical-wall checks, and `PermissionQueryBuilder`.
- The Matter app integration route
  `/v1/integrations/matter-app/matter-lookup` reads the Vault matter projection
  when the Matter source gate is available.
- The local projection fallback remains non-production only and is controlled by
  `MATTER_APP_SOURCE_MODE=vault_projection_only` plus
  `ALLOW_VAULT_PROJECTION_MATTER_SOURCE=true`.

## Gap Found

The Matter app lookup already read from `matters`, but client labels were derived
only from matter metadata keys such as `clientDisplayName`, `clientName`, and
`client_name`. Rows created through approved OneDrive mapping correctly create
`clients` and set `matters.client_id`, but they do not need to duplicate client
names into matter metadata. Without a `clients` join, Matter app lookup could
show the matter while omitting the shared client display label.

## Immediate Fix

- Join `clients` from Matter app lookup through
  `clients.tenant_id = matters.tenant_id` and
  `clients.client_id = matters.client_id`.
- Include `clients.name` in the SQL-stage search predicate.
- Use metadata client labels first, then fallback to canonical `clients.name`.
- Keep existing permission filters in the SQL query before returning any row.

## Testable Units Of Work

| TUW | Objective | Verification |
| --- | --- | --- |
| MV-LINK-001 | Confirm Vault client/matter schema linkage through `matters.client_id`. | DB schema inspection and tenant-local row count check. |
| MV-LINK-002 | Confirm Matter app lookup source gate behavior. | Unit tests for unavailable source, production fallback block, stale projection block. |
| MV-LINK-003 | Connect Matter app lookup to canonical Vault clients. | API service test proves `LEFT JOIN clients` and client-name search are present. |
| MV-LINK-004 | Confirm permission-before-search still holds. | API service test proves matter member and ethical-wall filters stay in SQL. |
| MV-LINK-005 | Confirm approved migration writes create linked rows. | Local DB counts: clients, matters, matter members, and audit events reconcile. |
| MV-LINK-006 | Confirm idempotency. | Replay dry-run resolves all approved matter codes to existing matters. |
| MV-LINK-007 | Confirm picker/read surface can consume shared labels. | Matter code option includes canonical client display label when metadata label is absent. |
| MV-LINK-008 | Define production Matter app source contract. | Separate approval for `matter_app_api` or `matter_app_event_projection`; local fallback remains blocked in production. |
| MV-LINK-009 | Define write authority. | New client/matter writes go through approved service/API path or audited migration runner; direct ad hoc DB writes are not the normal path. |
| MV-LINK-010 | Define operational receipt. | Sanitized receipt records counts, hashes, states, and blockers only. |

## End-State Contract

1. Client identity is represented once per tenant in `clients`.
2. Matter identity is represented once per tenant in `matters`.
3. Every usable matter has a valid `client_id` pointing to a tenant-local client.
4. Matter app lookup returns only permission-visible matters.
5. Matter app lookup can search by matter code, matter name, practice group,
   metadata client aliases, and canonical client name.
6. Vault document upload uses Matter app source status and upload preflight
   before accepting a matter target.
7. Audit rows are created for client, matter, membership, permission, and upload
   actions.
8. Local projection fallback can support development and migration validation,
   but it is not an upload-authoritative production claim.

## Required Gates

- `matter_app_source_available=true` for lookup use.
- `upload_authoritative=true` for production document upload use.
- `permission_sql_filter_present=true`.
- `ethical_wall_sql_filter_present=true`.
- `client_join_present=true`.
- `matter_code_unique_per_tenant=true`.
- `client_id_fk_valid=true`.
- `audit_receipt_present=true`.
- `document_import_not_executed=true` unless a separate import gate is approved.

## Not Allowed In This Plan

- No customer document body, OCR/text excerpt, filename, raw path, screenshot,
  token, secret, tenant-private identifier, or source manifest path in repo.
- No OneDrive connected-state, Office open/save/sync, production Matter source,
  or source-of-truth cutover claim without separate runtime evidence.
- No bypass of `PermissionQueryBuilder`, `PermissionService`, or audit recording.
