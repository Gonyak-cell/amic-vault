# Vault authority and gap map

This is an executable-source map, not a generic DMS comparison. It fixes the
authority AMIC Vault already owns before evaluating a component from the
read-only source lab. `KEEP` is non-delegable Vault authority; `AUGMENT` is a
bounded component opportunity behind that authority; `GAP` needs a later
canonical design. No row authorizes a source copy, fork, dependency, or runtime
change.

| Portfolio | Authority | Current Vault entry/persistence anchors | Regression anchors | Bounded conclusion |
|---|---|---|---|---|
| OSS-01 runtime/RLS | KEEP | `tenant-aware-datasource`, `pg-boss-runtime-options`, initial RLS schema | tenant datasource unit, `rls.spec.ts` | runtime role, tenant transaction and RLS are Vault authority |
| OSS-02 preview | AUGMENT | preview service and `AuditService` transaction path | preview access, audit immutability | converter capability may change; permission check and view audit may not |
| OSS-03 disposal | AUGMENT | records service and retention scheduler | records governance, audit immutability | sealed disposal/reconciliation is a gap; records authority stays local |
| OSS-04 quarantine | GAP | document upload and OCR queue | upload, worker processing | scan promotion/quarantine has no replacement-safe design yet |
| OSS-05 ingestion/storage | AUGMENT | worker bootstrap/Python worker, file-object and S3 adapters | worker processing, immutable-original | parser/sandbox may improve; immutable file/version/audit authority may not move |
| OSS-06 resumable upload | GAP | upload and bulk-upload services | upload permission, bulk upload | tusd can only be considered behind Vault-issued intent/finalize/audit flow |
| OSS-07 identity | AUGMENT | auth service, login identity service, auth RLS helpers | auth session, MFA | local session/deprovision fail-closed authority stays Vault-owned |
| OSS-08 DLP | AUGMENT | DLP service and detector | DLP audit, bulk-download | detection may be supplemented; unscannable/external delivery remains separately gated |
| OSS-09 telemetry | AUGMENT | metrics middleware and queue metrics | observability, metrics unit | tracing/SIEM needs redaction and external-operation proof |
| OSS-10 infrastructure | GAP | development compose and backup-drill evidence schema | RLS integration | IaC, residency, restore and rollback have no authorized production implementation |
| OSS-11 search/editor/pool | KEEP | search service, query-time permission scope, document-editing service | search authority, permission regression | PG permission scope and editing authority remain Vault-owned; OpenSearch/WOPI/PgBouncer are conditional |

## Retained, non-negotiable authority

- `PermissionService` and `DocumentPermissionService`, Matter membership,
  ethical-wall decisions, and PostgreSQL RLS remain `KEEP`. No component may
  return an allow decision independently of these controls.
- `AuditService` and append-only audit persistence remain `KEEP`. A candidate
  that cannot make the bounded action fail when its Vault audit fails is
  rejected.
- `FileObjectService`, immutable-original/version creation, tenant-scoped S3
  references, and query-time permission-scoped search remain `KEEP`.
- `REPLACE_CANDIDATE` is intentionally absent. The map has no wholesale DMS
  replacement path and every later source row must name its prohibited Vault
  authority and this product target.

## Gaps held for later portfolios

The map does not infer authority from an upstream repository name. Quarantine,
resumable-upload finalization, disposal certificates, external identity
topology, observability export, infrastructure recovery, OpenSearch, WOPI and
PgBouncer stay either `GAP`, `AUGMENT` behind a Vault boundary, or conditional.
Their product implementation may begin only in their own canonical TUW after
source/license/parity evidence is sufficient.
