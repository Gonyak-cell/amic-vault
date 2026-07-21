# PACK-OSS01-02 — authority-critical direct Pool migration

Status: canonical post-R14 extension under `USER-UMBRELLA-AUTONOMY-20260721`.
This is the just-in-time canonical form of `PROPOSED-PACK-OSS01-02`; frozen
`docs/package/**` remains unchanged.

## Scope and invariants

- Reuse the existing Vault-owned `DatabaseService`, `TenantAwareDataSource`,
  `AuditService` transaction client, and process-role assertion. This is L0:
  no upstream source, test fixture, dependency, fork, or vendored code is
  introduced.
- Every tenant-scoped query keeps a transaction-local tenant GUC and explicit
  `tenant_id` predicate where present. Query-stage permission/search scope,
  deny-overrides, ethical walls, and safe-denied behavior do not change.
- Successful/action audit remains in the business transaction. A safe-denied
  `ACCESS_DENIED` audit is the sole named isolated-transaction exception, so
  its denial evidence survives rollback of the rejected read; it does not
  weaken successful/action audit failure rollback.
- Runtime application code uses `DATABASE_RUNTIME_URL` only through the
  central provider. Owner migration/maintenance tooling is not changed.

## TUW inventory

| Order | ID | Risk | Depends on | Objective |
|---:|---|---|---|---|
| 1 | `DEVOPS-OSS01-DBM-TUW-001` | C | DBA-004 | migrate Audit/Tenant/Permission core direct pools |
| 2 | `DEVOPS-OSS01-DBM-TUW-002` | C | DBM-001 | migrate Auth/User session direct pools via bounded adapter |
| 3 | `DEVOPS-OSS01-DBM-TUW-003` | C | DBM-002 | migrate Matter/Client/Party/Wall/Break-glass direct pools |
| 4 | `DEVOPS-OSS01-DBM-TUW-004` | C | DBM-003 | migrate Document/Storage/Search direct pools and close PACK gate |

## `DEVOPS-OSS01-DBM-TUW-001`

- **Files create:** `0193_add_client_existence_classifier.sql` only under the
  client-reference-classifier scope amendment below.
- **Files modify:** `apps/api/src/modules/audit/audit.service.ts`,
  `audit-anchor-job.service.ts`, `apps/api/src/modules/tenant/tenant.store.ts`,
  `apps/api/src/modules/permission/permission.service.ts`,
  `document-permission.service.ts`, `wall-membership.reader.ts`,
  `apps/api/src/common/guards/require-roles.guard.ts`,
  `apps/api/src/common/db/database.service.ts`,
  `database.service.spec.ts`, `tenant-query.ts`, and Database/Audit/Tenant/
  Permission module wiring plus only their colocated specs; the named
  integration specs which directly construct `AuditService` and the
  test-only tenant-transaction adapter in `tests/integration/helpers/db.ts`;
  `security/oss-source-map.yml` OSS-01 constructor rows only.
- **Files NOT-modify:** permission evaluation rules, audit metadata/action
  schema, RLS/migrations, dependencies/locks, `docs/package/**`.
- **Implementation:** replace module-level pool/getPool access with injected
  existing database interfaces. Tenant queries use the central tenant
  transaction/client. Same-tenant work invoked inside an active central
  transaction reuses that exact client (so permission checks stay inside the
  audit transaction); cross-tenant nesting remains fail-closed. A denied
  `ACCESS_DENIED` record alone uses the named isolated audit transaction so it
  survives rollback of the safe-denied business read; successful/action audit
  records remain in their business transaction. `tenants` is an existing RLS-exempt global registry, so
  the central service may expose only named, typed registry reads needed by
  this batch (tenant by id, tenant by slug, status list, active tenant IDs for
  the daily anchor); it must not expose a generic tenant-less query method.
  Any other tenant-less lookup is limited to the already allowlisted
  stored-function path.
- **Verification:** affected unit specs; `permission-matrix`, `cross-tenant`,
  `fail-closed`, `audit-immutability`, relevant `audit-coverage`; audit insert
  failure rollback; authority checker shows the listed sites removed.
- **Stop:** PermissionService bypass, a successful/action audit transaction
  split, or a required generic tenant-less table query.

## `DEVOPS-OSS01-DBM-TUW-002`

- **Files create:** only if necessary,
  `apps/api/src/common/db/auth-runtime-query.service.ts` and its spec, with
  explicit token-hash lookup/revoke/consume methods and no generic query API;
  or one reversible runtime-role column-grant migration if an existing audited
  user workflow is otherwise rejected by `vault_app` after its direct pool is
  removed.
- **Files modify:** `apps/api/src/modules/auth/session.repository.ts`,
  `mfa.service.ts`, `password-reset.service.ts`,
  `apps/api/src/modules/user/user.service.ts`, auth/user modules and their
  colocated specs; named `DatabaseService` auth helper methods and specs;
  source-map constructor rows only.
- **Files NOT-modify:** password/MFA algorithms, cookie/token format, role
  issuance policy, SECURITY DEFINER SQL body, dependencies, `docs/package/**`.
- **Scope amendment (2026-07-21):** a runtime-role integration failure proved
  that the existing audited role-assignment path needs only `UPDATE (role)` on
  `users` once its transaction moves from a legacy owner URL to the central
  runtime provider. `0180_grant_runtime_user_role_update.sql` is permitted
  with reversible GRANT/REVOKE only; it may not change RLS, policy logic, or
  SECURITY DEFINER function bodies.
- **Verification:** affected unit specs, `auth-session`, `auth-mfa`,
  `fail-closed`, cross-tenant, disabled-user and token-replay negatives.
- **Stop:** owner credential or tenant-less generic table scan required.

## `DEVOPS-OSS01-DBM-TUW-003`

- **Files create:** none.
- **Files modify:** listed Matter member/conflict/dashboard/issue services,
  Client, Party, Ethical-wall, Break-glass reader, their modules/specs, and
  source-map constructor rows only.
- **Files NOT-modify:** Matter state machine, role matrix, wall
  deny-overrides, break-glass approval semantics, RLS, dependencies,
  `docs/package/**`; only the explicitly named 0193 SECURITY DEFINER function
  is an exception to the migration/SQL-body boundary.
- **Scope amendment (2026-07-21):** central runtime transactions proved that
  existing audited MatterService updates need the exact columns they already
  write, after legacy owner-pool removal. `0181_grant_runtime_matter_update_columns.sql`
  is permitted as reversible GRANT/REVOKE only; it must not alter RLS, state
  transitions, policy, or SECURITY DEFINER SQL.
- **Verification:** affected specs, matter core/access/lifecycle,
  permission-matrix wall, ethical-wall, break-glass, cross-tenant and matter
  audit coverage. Confirm wall A→B, B→A and nearest unauthorized negative.
- **Stop:** query-stage filter becomes a post-filter or audit loses atomicity.

## `DEVOPS-OSS01-DBM-TUW-004`

- **Files create:** only `0182_grant_runtime_saved_searches.sql`,
  `0183_grant_runtime_embedding_cleanup.sql`, and
  `0184_grant_runtime_work_item_assignment_scope.sql`, and
  `0185_grant_runtime_contract_review_refresh.sql`, and
  `0186_grant_runtime_subversion_reviewer_reassign.sql`, and
  `0187_grant_runtime_bulk_retry_size.sql`, and
  `0188_grant_runtime_email_metadata_lifecycle.sql`, and
  `0189_grant_runtime_email_reparse_and_undo.sql`, and
  `0190_grant_runtime_email_body_link.sql`, and
  `0191_grant_runtime_external_nda_refresh.sql`, and
  `0192_grant_runtime_external_qa_review.sql`,
  `0193_add_client_existence_classifier.sql`, and
  `0194_grant_runtime_matter_wiki_regeneration.sql`, and
  `0195_grant_runtime_approved_disposal.sql`.
- **Files modify:** bulk-upload batch, edit-session sweeper, duplicate
  detector, zip-child service, FileObject service, search permission scope
  provider, their modules/specs, source-map constructor rows, and the existing
  integration bootstrap; the existing `ai-claims-ledger` integration fixture
  only when required to remove a synthetic marker collision with DLP detection.
- **Files NOT-modify:** storage object semantics, immutable triggers, search
  scope SQL meaning, result post-filtering, RLS, dependencies,
  `docs/package/**`.
- **Verification:** affected specs; document-access, storage-isolation,
  search-permission, metadata-leakage, cross-tenant and audit-coverage; final
  `pnpm lint`, typecheck, test, build, owner DB up/down/up, seed, full
  integration, frozen-doc/backlog/source-map/reuse-first/diff checks.
- **Stop:** storage rollback or queue atomicity breaks, or search needs result
  post-filtering.
- **Scope amendment (2026-07-22):** the exact-head runtime integration
  reproduces a pre-existing `saved_searches` privilege gap in the existing
  audited SearchService path. `0182_grant_runtime_saved_searches.sql` may add
  only reversible `SELECT`, `INSERT`, and the exact existing update columns
  for save/revoke/open flows. It must not change RLS, search scope SQL,
  post-filtering, policies, SECURITY DEFINER SQL, or queue behavior.
- **Scope amendment (2026-07-22, embedding cleanup):** after queue bootstrap
  restores the runtime document-upload path, the existing SearchIndexRepository
  proves that its tenant-scoped legacy embedding cleanup needs `DELETE` on
  `document_chunk_embeddings`. `0183_grant_runtime_embedding_cleanup.sql` may
  add and reversibly revoke only that table privilege. RLS, chunk/index SQL,
  model routing, AI policy, audit behavior, and queue behavior remain
  unchanged.
- **Scope amendment (2026-07-22, queue bootstrap):** the existing
  migration-role-only `prepare-ai-prep-queue` tool already prepares the
  `pgboss` schema and its existing runtime grants before production queue
  runtime. The integration bootstrap may invoke that unchanged tool after the
  API build and before seed, using only `DATABASE_MIGRATION_URL`; it must not
  expose an owner URL to API/worker runtime, add grants, alter queue names or
  payloads, or let runtime perform schema migration/creation. The transactional
  `PoolClient` enqueue path remains unchanged.
- **Scope amendment (2026-07-22, same-tenant transaction reuse):** direct
  permission-pool removal exposed that audit-backed document mutations perform
  a permission read inside their already active tenant transaction. The
  central service may reuse the exact active `PoolClient` only when the nested
  request has the same tenant ID; it must continue to reject a missing or
  different tenant, may not open a second transaction, and may not expose the
  client outside `tenantTransaction` callbacks. This restores the previous
  atomic permission/audit behavior without a direct pool or owner fallback.
- **Scope amendment (2026-07-22, candidate-review reopen):** the existing
  AI-prep candidate-review upsert restores `assignment_scope` on conflict, but
  the prior runtime grant omitted that exact already-written `work_items`
  column. `0184_grant_runtime_work_item_assignment_scope.sql` may add and
  reversibly revoke only `UPDATE (assignment_scope)`; it must not alter RLS,
  work-item semantics, AI behavior, audit behavior, queue behavior, or any
  other privilege.
- **Scope amendment (2026-07-22, contract-review refresh):** the existing
  contract AI-review materializer inserts a finding and, on the same
  tenant-scoped key, refreshes only `severity`, `finding_code`,
  `finding_hash`, and `updated_at` while accepted findings remain immutable.
  `0185_grant_runtime_contract_review_refresh.sql` may add and reversibly
  revoke only those exact update columns; it must not alter RLS, conflict
  logic, accepted-finding behavior, AI, audit, queue, or any other privilege.
- **Scope amendment (2026-07-22, DLP-safe test marker):** the existing
  `ai-claims-ledger` fixture used a hyphenated random UUID marker that can
  accidentally match the deliberate bank-account detector. It may replace
  those separators with a letter so the assertion verifies the same claim
  ledger path without producing synthetic sensitive data. Detector rules,
  production redaction, fixture meaning, and all authorization behavior remain
  unchanged.
- **Scope amendment (2026-07-22, reviewer reassign):** the existing internal
  subversion-reviewer upsert reactivates a reviewer and replaces only
  `assigned_by`; the current runtime grant omitted that exact conflict-update
  column. `0186_grant_runtime_subversion_reviewer_reassign.sql` may add and
  reversibly revoke only `UPDATE (status, assigned_by, revoked_at)`; RLS,
  reviewer state semantics, document lifecycle, audit, and all other
  privileges remain unchanged.
- **Scope amendment (2026-07-22, bulk retry size):** the existing bulk-upload
  retry refreshes the verified `size_bytes` together with already-granted retry
  state. `0187_grant_runtime_bulk_retry_size.sql` may add and reversibly revoke
  only `UPDATE (size_bytes)`; RLS, file semantics, batch status, queue payload,
  audit, and all other privileges remain unchanged.
- **Scope amendment (2026-07-22, email metadata lifecycle):** existing email
  ingest/thread/file/reparse SQL updates only bounded envelope metadata and
  reclassifies or replaces participant metadata. `0188_grant_runtime_email_metadata_lifecycle.sql`
  may add reversible exact update columns for those queries plus `DELETE` only
  on `email_participants` for reparse replacement. It must not grant access to
  raw bytes/body/header storage, alter RLS, parser semantics, DLP policy,
  filing semantics, audit, or queue behavior.
- **Scope amendment (2026-07-22, email reparse and undo):** the existing
  reparse participant upsert refreshes only `domain_ref`, `display_name`,
  `is_outside`, and `participant_class`; the existing autofile undo deletes
  only a tenant-scoped filing reference. `0189_grant_runtime_email_reparse_and_undo.sql`
  may grant and reversibly revoke exactly those actions; raw email storage,
  RLS, parser/DLP/filing semantics, audit, and queue behavior remain unchanged.
- **Scope amendment (2026-07-22, email body link):** existing email-body
  indexing creates a governed immutable document and sets only the filing's
  `body_document_id` reference. `0190_grant_runtime_email_body_link.sql` may
  add and reversibly revoke only `UPDATE (body_document_id)`; RLS, email body
  indexing content, document immutability, DLP, audit, and all other filing
  semantics remain unchanged.
- **Scope amendment (2026-07-22, external NDA refresh):** the existing public
  NDA acceptance insert is idempotent and its conflict clause updates only
  `external_nda_acceptances.accepted_at`; the R11 table's original runtime
  grant omitted that conflict-update column. `0191_grant_runtime_external_nda_refresh.sql`
  may add and reversibly revoke only `UPDATE (accepted_at)`. RLS, secure-link
  access checks, NDA version/actor hash/audit behavior, external sharing
  semantics, dependencies, deployment, and external system state remain
  unchanged.
- **Scope amendment (2026-07-22, external Q&A review):** the existing internal
  reviewer path locks the R11 Q&A row and updates only `status`,
  `reviewed_by_internal_user_id`, and `reviewed_at`; its original runtime
  SELECT/INSERT grant omitted those exact columns. `0192_grant_runtime_external_qa_review.sql`
  may add and reversibly revoke only that bounded UPDATE grant. RLS,
  approval authorization/state rules, message content/hash handling, audit,
  secure-link sharing semantics, dependencies, deployment, and external system
  state remain unchanged.
- **Scope amendment (2026-07-22, client reference classifier):** direct-pool
  removal must preserve the pre-existing input contract: an absent opaque
  client UUID is `VALIDATION_FAILED`, while an existing client in another
  tenant remains safe-not-found. `0193_add_client_existence_classifier.sql`
  may create one `SECURITY DEFINER` boolean function with `PUBLIC` revoked and
  `vault_app` execute only; the central service may expose only its named
  boolean result. It may not return tenant/client data, add a generic
  tenant-less query, alter RLS/permission/audit behavior, or weaken the
  cross-tenant safe denial.
- **Scope amendment (2026-07-22, Matter Wiki regeneration):** the existing
  wiki draft upsert already has bounded draft/review-column rights but also
  refreshes its own `generated_by` and `generated_at` columns on conflict.
  `0194_grant_runtime_matter_wiki_regeneration.sql` may add and reversibly
  revoke only those two RLS-protected UPDATE rights. Wiki content/provenance,
  source references, review workflow, AI route, audit, dependencies,
  deployment, and external behavior remain unchanged.
- **Scope amendment (2026-07-22, approved Records disposal):** the existing
  Records executor sets its guarded disposal GUC only after the legal-hold and
  approval flow, then removes the target document's exact tenant-scoped
  derived/original rows. `0195_grant_runtime_approved_disposal.sql` may grant
  and reversibly revoke DELETE on only those seven listed tables plus
  `UPDATE (supersedes_version_id)` on `document_versions`. It must not alter
  approval/hold policy, disposal GUC checks, deletion order, audit/certificate
  behavior, RLS, dependencies, deployment, or external behavior.

## Evidence and completion boundary

Each TUW records source SHA/tree, exact changed constructor inventory,
focused/negative/audit commands, synthetic-only evidence, and truth state in
`artifacts/enterprise-dms-oss/<source-sha>/PACK-OSS01-02/<tuw>/`. The final
TUW additionally records the before/after direct-pool delta and full
regression receipt. CI, PR/push/merge, deployment, external mutation, release,
and go-live remain distinct and unclaimed.
