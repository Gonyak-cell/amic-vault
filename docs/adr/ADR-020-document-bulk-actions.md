# ADR-020: Permission-First Document Bulk Actions

Status: Accepted by the operator's 2026-07-28 DMS internal execution authority
Date: 2026-07-28
Related: `PACK-DMS-WB-04`, ADR-004, ADR-005, DMS-WB-BULK-TUW-001~005

## Context

The document workbench needs page-scoped multi-selection for repetitive filing
work without introducing a second permission model, a silent partial-success
path, or an all-results snapshot contract. Existing single-document services
already own Matter permission, Ethical Wall, immutable-state, legal-hold,
status-transition, search-index, graph, and audit behavior.

## Decision

Implement an asynchronous, tenant-scoped batch receipt that delegates every
item to the existing single-document domain service.

| Contract field    | Decision                                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| actions           | move to an existing folder, add one tag, remove one tag, or perform one approved status transition                                        |
| forbidden actions | delete, disposal, external share, Office write, original overwrite, permission change                                                     |
| UI selection      | current 25-row page only; filter, page, context, or refresh changes clear selection                                                       |
| API maximum       | 100 unique document IDs                                                                                                                   |
| permission        | creation injects the existing search permission scope; every attempt rechecks document/Matter edit permission; queued authority is never cached |
| atomicity         | partial per item; each item has its own mutation plus existing audit transaction                                                          |
| partial result    | completed, partial, or failed batch with an explicit per-item safe receipt; successes are never hidden                                    |
| idempotency       | caller UUID plus canonical SHA-256 request hash; same key and hash replays the receipt, while a different hash is rejected                |
| retry             | only failed items can be requeued; the row lock changes failed to queued once, preventing duplicate retry scheduling                      |
| retention         | reference-only receipt rows expire after 30 days; cleanup is a separately scheduled operational concern                                   |
| stored data       | tenant/user/batch/document IDs, bounded action parameter, statuses, standard error code, bounded reason code, retry count, timestamps     |
| excluded data     | document title, body, snippet, raw query, file path/object key, preview token, permission reason, wall membership                         |
| audit             | batch create, terminal completion, and retry are append-only reference events; item mutations retain their existing document audit events |

Folder move remains valid only when the target folder belongs to each
document's Matter. The UI enables it only for a same-Matter selection, while the
existing metadata service remains the authoritative backend check. Tag
add/remove is idempotent. A worker retry that finds a document already at the
requested status treats it as a successful replay only after the same edit
permission, hold, and immutable-state checks.

## API And UI

- `POST /v1/document-bulk-action-batches`
- `GET /v1/document-bulk-action-batches/:batchId`
- `POST /v1/document-bulk-action-batches/:batchId/retry`

The action bar reports the selected page count, requires an explicit
confirmation, polls a reference-only receipt, announces progress, and renders
success and failure counts. A failed receipt can retry failed items. Navigation
does not imply cancellation; reopening by receipt ID is supported by the API.

## Security Consequences

- RLS and FORCE RLS bind batch and item rows to the current tenant.
- Permission-scoped materialization gives invisible and nonexistent document
  IDs the same safe denied response before enqueue.
- The batch table never becomes a permission grant or a list/search authority.
- Permission revocation and Ethical Wall changes after enqueue are observed by
  the existing service on the next attempt.
- Audit failure rolls back batch creation or terminal receipt publication.
- A worker crash can leave queued/running reference rows, but cannot turn a
  mutation into an unaudited success because the delegated service couples its
  audit to the mutation.
- No external connection, SDK, dependency, copied OSS source, or all-results
  document snapshot is introduced.

## Verification

The closeout evidence is
`docs/ui/dms-oss-workbench-bulk-actions-closeout.md`. Required coverage includes
0/1/100/101 input bounds, duplicate IDs, idempotent replay/conflict, one denied
item, mixed-Matter folder rejection, legal hold/status conflict, audit failure,
retry serialization, invisible/nonexistent parity, cross-tenant RLS, migration
round-trip, keyboard
selection, filter/page reset, explicit confirmation, progress, and visible
partial results.
