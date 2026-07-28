# ADR-019: Personal Saved Items

Status: Accepted by the operator's 2026-07-28 DMS internal execution authority
Date: 2026-07-28
Related: `PACK-DMS-WB-03`, ADR-004, ADR-005, DMS-WB-PINS-TUW-001~005

## Context

The files and search workbenches need a short, permission-safe route back to
frequently used documents, Matters, and personal saved searches. A saved item
must never become an access-control grant, disclose a revoked target, or create
a team curation system without a separate contract.

## Decision

Use one UI term, `즐겨찾기`, and implement a personal-only saved-item list.
Team-shared, Matter-team, and administrator-curated favorites remain out of
scope.

| Contract field | Decision |
|---|---|
| owner | one active internal user in one tenant |
| visibility | owner only |
| target kinds | document, Matter, personal saved search |
| stored data | tenant ID, user ID, target kind, opaque target UUID, position, timestamps |
| authorization | a row grants nothing; document targets reuse the materialized search permission scope, Matter targets reuse `PermissionQueryBuilder`, and saved searches require the same active personal owner |
| order | contiguous zero-based personal order; exact-set reorder serialized by row locks and a deferred unique position constraint |
| limit | 100 stored items per user |
| duplicates | unique per tenant/user/target kind/target; concurrent duplicate create is idempotent |
| stale/revoked target | removed while building the permission-bound list under the same per-user lock as mutations, compacted, and audited as a removal; target existence and deny reason are not returned |
| retention | retained until explicit removal, permission-bound stale cleanup, or a future approved account-retention process; inactive users cannot list or mutate it |
| audit | successful add, remove, and changed reorder write reference-only append-only audit rows in the same transaction |

The persistence row uses a polymorphic internal target reference rather than
three nullable foreign keys. This keeps the preference non-authoritative while
the list query revalidates access. A target that is no longer visible is removed
inside that list transaction so it cannot disclose data or consume the personal
limit indefinitely. Provider-level permission denial or evaluation failure
fails the whole request closed and does not perform cleanup. Create never
accepts an unresolvable or unauthorized target.

Removing a `saved_items` row is deletion of a personal navigation preference,
not deletion of a document, Matter, saved search, FileObject, or record. It does
not relax the immutable-original or records-disposal rules.

## API And UI

- `GET /v1/saved-items`
- `POST /v1/saved-items`
- `DELETE /v1/saved-items/:savedItemId`
- `PUT /v1/saved-items/order`

The files and search rails show only server-returned display labels and routes.
Selected document and Matter inspectors expose an explicit add/remove action.
Only personal saved-search rows expose the same action. Create/remove uses
optimistic UI state and restores the previous target state on failure.

## Security Consequences

- RLS and FORCE RLS bind every preference row to the current tenant.
- Cross-tenant lookup and target creation fail closed.
- Permission removal, ethical-wall exclusion, target revocation, and user
  deactivation cannot be bypassed by a stored preference.
- Raw query text, snippet, body, token, object path, deny reason, and wall
  membership are absent from the table, request DTO, and audit metadata.
- No external connection, dependency, SDK, shared curation, or background
  synchronization is introduced.

## Verification

The closeout evidence is
`docs/ui/dms-oss-workbench-personal-favorites-closeout.md`. Canonical negative
coverage includes concurrent duplicate add, exact-set concurrent reorder,
100-item validation, RLS cross-tenant isolation, permission revocation,
permission-bound stale cleanup, unauthorized create, audited explicit and stale
removal, optimistic UI rollback, and authenticated desktop/browser rendering.
