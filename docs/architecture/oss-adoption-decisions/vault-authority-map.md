# Vault authority and gap map

This map is derived from current executable source and integration tests, not
from a product replacement assumption. `KEEP` means AMIC Vault remains the
authority; `AUGMENT` means a bounded component can help only behind that
authority; `GAP` requires a future scoped design and is not a candidate to
silently solve by copying an upstream DMS.

| Portfolio | Authority | Current Vault anchors | Required proof / bounded gap |
| --- | --- | --- | --- |
| OSS-01 database/runtime role | KEEP | `TenantAwareDataSource`, pg-boss runtime options, RLS migrations | one runtime role and RLS contract; direct-pool migration remains bounded work |
| OSS-02 preview | AUGMENT | preview service plus AuditService | every preview remains permission-checked and audited; session lifecycle is a gap |
| OSS-03 disposal | AUGMENT | records service and retention scheduler | sealed disposal inventory, saga, reconciliation and certificate proof remain gaps |
| OSS-04 quarantine | GAP | upload and OCR queue paths | quarantine and promotion must be scan-authoritative, tenant-safe and audited |
| OSS-05 ingestion/storage | AUGMENT | API worker entry, ingestion worker, immutable FileObject and S3 adapter | parser/sandbox may improve; original/version/audit authority cannot move upstream |
| OSS-06 resumable upload | GAP | upload and bulk-upload paths | tusd intent/finalize/reconcile may be evaluated only with permission/audit parity |
| OSS-07 identity | AUGMENT | auth service, login identity registry, auth RLS functions | external IdP is additive; local session/deprovision default-deny remains Vault-owned |
| OSS-08 DLP | AUGMENT | DLP service/detector | unscannable derivative and R11 external delivery remain blocked pending their gates |
| OSS-09 telemetry | AUGMENT | metrics registry and queue metrics | tracing, SLO and SIEM delivery require redaction and external-operation gates |
| OSS-10 infrastructure | GAP | dev compose and backup-drill evidence schema | IaC, region/residency, restore and rollback have no authorized runtime implementation |
| OSS-11 conditional search/editor/pool | KEEP | permission-first PG search and document editing | OpenSearch, WOPI/co-editor and PgBouncer remain conditional; source availability is not approval |

## Non-negotiable retained authority

- `PermissionService`/`DocumentPermissionService`, RLS and Matter/ethical-wall
  decisions are `KEEP`; no source map may mark them `REPLACE_CANDIDATE`.
- `AuditService` plus append-only audit migrations are `KEEP`; a component that
  cannot record the Vault audit event inside the bounded action is rejected.
- `file_objects` immutable-original schema and storage reference creation are
  `KEEP`; an upstream versioning model can only be mapped as behavioral input.
- Search must keep its query-time permission scope. Any external index is a
  conditional projection, never an authorization system.

The machine-readable target list is `security/oss-source-map.yml` under
`productAuthorityTargets`. All listed product and test paths were checked
against this worktree. The next source-map TUW must reject a component input
that cannot name one of these targets and its prohibited Vault authority.

The companion `security/oss-test-reuse.yml` may bind a verified external input
to an existing parity scenario, but it cannot turn the listed `KEEP` authority
into a source-copy or replacement authorization.
