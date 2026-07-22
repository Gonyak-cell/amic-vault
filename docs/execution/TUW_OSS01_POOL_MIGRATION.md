# PACK-OSS01-02 — authority-critical direct Pool migration

**Status:** canonical post-R14 extension under
`USER-UMBRELLA-AUTONOMY-20260721`. This is the scoped, current-source form of
`PROPOSED-PACK-OSS01-02`; `docs/package/**` remains frozen.

## Shared invariants and stop boundary

- Reuse only the Vault-owned `DatabaseService`, `TenantAwareDataSource`,
  `AuditService` transaction client and runtime-role assertion from
  PACK-OSS01-01. This is L0 control-code reuse: no upstream source, fixture,
  fork, vendor copy, dependency, lockfile or database-topology change.
- A tenant query runs inside `DatabaseService.tenantTransaction`; retained
  explicit `tenant_id` predicates are defense in depth. Permission-before-
  search, deny-overrides, ethical walls, safe-denied messages, audit schemas,
  RLS policies, immutable-original and state-machine rules do not change.
- A successful/action audit write remains in its business transaction and an
  audit insertion failure rolls back that action. Do not add a generic
  tenant-less query or a direct `Pool`; a tenant-before-resolution auth lookup
  may use only an existing named stored-function adapter.
- If a listed query requires owner credentials, a generic tenantless table
  scan, an RLS/grant/migration change, a PermissionService bypass, a
  post-filter, or a transaction split, stop that TUW and append a `BLOCKED`
  ledger row. Do not expand its scope by inference.

## TUW order

| Order | Canonical ID | Risk | Depends on | Objective |
|---:|---|---|---|---|
| 1 | `DEVOPS-OSS01-DBM-TUW-001` | C | DBA-004 | Audit/Tenant/Permission core direct-pool migration |
| 2 | `DEVOPS-OSS01-DBM-TUW-002` | C | DBM-001 | Auth/User session migration through bounded adapter |
| 3 | `DEVOPS-OSS01-DBM-TUW-003` | C | DBM-002 | Matter/Client/Party/Wall/Break-glass migration |
| 4 | `DEVOPS-OSS01-DBM-TUW-004` | C | DBM-003 | Document/Storage/Search critical migration and pack proof |

## `DEVOPS-OSS01-DBM-TUW-001`

- **Files create:** `db/migrations/0180_grant_runtime_user_role_update.sql` and
  `db/migrations/0181_grant_runtime_matter_update_columns.sql` only. Both are
  reversible `GRANT`/`REVOKE` migrations for the existing `vault_app` role;
  neither may alter RLS, policies, SECURITY DEFINER bodies, state-machine
  logic, audit schema or ownership.
- **Files modify:** `apps/api/src/modules/audit/audit.service.ts`,
  `audit-anchor-job.service.ts`, `apps/api/src/modules/tenant/tenant.store.ts`,
  `apps/api/src/modules/permission/permission.service.ts`,
  `document-permission.service.ts`, `wall-membership.reader.ts`,
  `apps/api/src/common/guards/require-roles.guard.ts`; their existing
  colocated `*.spec.ts`; existing Audit/Tenant/Permission module wiring only;
  `apps/api/src/common/db/database.service.{ts,spec.ts}`, `database.module.ts`,
  `apps/api/src/modules/tenant/tenant.module.ts`, `tenant-query.{ts,spec.ts}`
  and `apps/api/src/modules/audit/permission-event.recorder.ts` only when
  required to expose a named,
  typed existing authority; `security/oss-source-map.yml` OSS-01 constructor
  rows and `security/oss-adoption-decisions.yml` L0 path rows for the two
  named grant migrations only; existing directly affected integration specs and
  `tests/integration/helpers/db.ts` only for central transaction setup.
- **Files NOT-modify:** permission-evaluation rules, audit metadata/action
  schema, RLS policies, SECURITY DEFINER bodies, dependencies/locks,
  `docs/package/**`.
- **Implementation:** remove each listed direct pool/getPool access through
  constructor injection. Use one same-tenant client for business,
  PermissionService and successful/action audit work. The sole safe-denied
  `ACCESS_DENIED` audit may use a separate named audit transaction so its
  evidence survives rollback of a rejected enclosing transaction; it is not a
  general query escape hatch. A tenant registry read
  is limited to existing typed status/id/slug reads; no generic global query.
- **Privilege remediation:** runtime-role audit coverage proves two existing
  central-client mutation paths otherwise fail before audit completion:
  `UPDATE (role)` on `users`, and the exact existing Matter lifecycle/metadata
  update columns `status`, `opened_at`, `closed_at`, `matter_name`,
  `practice_group`, `metadata_json`, `access_scope`,
  `confidentiality_level`, `lead_partner_id`, `lead_lawyer_id`,
  `lead_associate_id`, `updated_at`. The two named migrations may grant and
  reversibly revoke only those actions to `vault_app`; all row isolation stays
  enforced by existing RLS.
- **Verification (AND):** affected unit specs; `permission-matrix`,
  `cross-tenant`, `fail-closed`, `audit-immutability`, relevant
  `audit-coverage`; synthetic audit-insert failure rolls back action; checker
  delta proves only the listed DBM rows changed.
- **Done:** listed constructors are zero; permission decision parity and audit
  transaction parity are retained.

## `DEVOPS-OSS01-DBM-TUW-002`

- **Files create:** none initially. If a named auth adapter is indispensable,
  first register its exact path as L0 Vault-owned code in
  `security/oss-adoption-decisions.yml`, then create only
  `apps/api/src/common/db/auth-runtime-query.service.ts` and its colocated
  spec; it may expose explicit token-hash lookup/revoke/consume methods and no
  generic query interface.
- **Files modify:** `apps/api/src/modules/auth/session.repository.ts`,
  `mfa.service.ts`, `password-reset.service.ts`,
  `apps/api/src/modules/user/user.service.ts`; their modules and colocated
  specs; the named DatabaseService auth helper and spec if needed;
  `security/oss-source-map.yml` constructor rows only.
- **Files NOT-modify:** password/MFA algorithms, cookie/token format, role
  issuance policy, SECURITY DEFINER SQL bodies, RLS/grants/migrations,
  dependencies/locks, `docs/package/**`.
- **Implementation:** preserve `SessionRepository` optional-client behavior;
  use explicit runtime-role operations for token-hash work and tenant
  transactions for known-tenant mutation. Do not log a token or database URL.
- **Verification (AND):** affected unit specs; `auth-session`, `auth-mfa`,
  `fail-closed`, cross-tenant; disabled-user, expired-token, replay and
  concurrent-revoke negatives; checker delta.
- **Done:** listed constructors are zero and session/MFA/reset/offboarding
  semantics are unchanged.

## `DEVOPS-OSS01-DBM-TUW-003`

- **Files create:** none.
- **Files modify:** `apps/api/src/modules/matter/matter.service.ts`,
  `matter-member.service.ts`, `matter-conflict-check.service.ts`,
  `matter-dashboard.service.ts`, `matter-issue.service.ts`,
  `apps/api/src/modules/client/client.service.ts`,
  `apps/api/src/modules/party/party.service.ts`,
  `apps/api/src/modules/ethical-wall/ethical-wall.service.ts`,
  `apps/api/src/modules/break-glass/break-glass-override.reader.ts`; only
  their colocated specs/modules and OSS-01 source-map rows.
- **Files NOT-modify:** Matter state machine, role matrix, wall
  deny-overrides, break-glass approval semantics, RLS/grants/migrations,
  dependencies/locks, `docs/package/**`.
- **Implementation:** use tenant transactions for list/read/write and retain
  all explicit tenant predicates. Pass the active client to audit/related
  writes. No-result behavior must remain safely denied.
- **Verification (AND):** affected unit specs; matter core/access/lifecycle,
  permission-matrix wall, ethical-wall, break-glass, cross-tenant and matter
  audit-coverage suites; bidirectional wall and nearest unauthorized negatives;
  checker delta.
- **Done:** listed constructors are zero with audit and deny parity intact.

## `DEVOPS-OSS01-DBM-TUW-004`

- **Files create:** none.
- **Files modify:** `apps/api/src/modules/document/bulk-upload-batch.service.ts`,
  `document/edit-session-sweeper.service.ts`,
  `document/integrity/duplicate-detector.service.ts`,
  `document/zip-child-document.service.ts`,
  `apps/api/src/modules/storage/file-object.service.ts`,
  `apps/api/src/modules/search/permission/search-permission-scope.provider.ts`;
  their colocated specs/modules; OSS-01 source-map rows only; existing directly
  affected integration tests only.
- **Files NOT-modify:** storage object semantics, immutable triggers, search
  scope SQL meaning, post-filter behavior, RLS/grants/migrations,
  dependencies/locks, `docs/package/**`.
- **Canonical scope amendment (2026-07-22, runtime queue bootstrap and exact
  column grants):** the existing integration runner may invoke the already
  built `prepare-ai-prep-queue` migration-role tool after API build and before
  seed, passing only the migration URL and configured runtime role. This
  provisions the disposable test queue before runtime-role tests; it must not
  expose an owner URL to API/worker runtime, alter queue names/payloads/retry
  behavior, or change production deployment. The TUW may additionally create
  `0183_grant_runtime_subversion_reviewer_reassign.sql` and
  `0184_grant_runtime_bulk_retry_size.sql`, with matching L0 source-decision
  entries. They may grant and reversibly revoke only `UPDATE (status,
  assigned_by, revoked_at)` on `document_subversion_reviewers` and `UPDATE
  (size_bytes)` on `bulk_upload_batch_items`, respectively. Existing RLS,
  reviewer state, bulk state, storage/audit/permission semantics, ownership,
  dependencies, and external behavior remain unchanged.
- **Canonical scope amendment (2026-07-22, contract-review refresh):** the
  full runtime-role regression reaches the existing `contract-intel` finding
  materialization upsert. The TUW may create
  `0185_grant_runtime_contract_review_refresh.sql` and its matching L0 source
  decision only to grant and reversibly revoke `UPDATE (severity,
  finding_code, finding_hash, updated_at)` on `contract_ai_review_findings`.
  This preserves its existing RLS policy, pending-only conflict predicate,
  accepted-finding immutability, AI policy/permission checks, audit
  transaction, dependencies, and external behavior.
- **Canonical scope amendment (2026-07-22, email metadata lifecycle):** the
  full runtime-role regression next reaches only existing, tenant-scoped,
  permission-checked and audited email metadata lifecycle SQL. The TUW may
  add `apps/api/src/modules/email` to the observed runtime scope and create
  `0186_grant_runtime_email_metadata_lifecycle.sql`,
  `0187_grant_runtime_email_reparse_participants.sql`, and
  `0188_grant_runtime_email_filing_lifecycle.sql`, with matching L0 source
  decisions. Together they may grant and reversibly revoke only: `UPDATE
  (parser, parser_version, parse_status, failure_reason_code, subject,
  sent_at, received_at, metadata_warning_code, references_json,
  has_outside_participants, thread_id, conversation_id_hash)` on
  `email_messages`; `UPDATE (participant_class, is_outside, domain_ref,
  display_name)` and `DELETE` on `email_participants`; and `UPDATE
  (body_document_id)` and `DELETE` on `email_matter_filings`. Existing RLS,
  permission checks, audit transactions, bounded metadata constraints,
  participant/address handling, filing semantics, dependencies, and external
  behavior remain unchanged. No generic table privilege, new email behavior,
  policy change, dependency, external operation, deployment, or release work
  is authorized.
- **Canonical scope amendment (2026-07-22, derived embedding cleanup):** the
  email-body indexing regression reaches the pre-existing
  `SearchIndexRepository.deleteObsoleteEmbeddingRows` cleanup of only derived
  `document_chunk_embeddings` rows scoped by tenant, version and obsolete
  model route. The TUW may create
  `0189_grant_runtime_derived_embedding_cleanup.sql` and its matching L0
  source decision to grant and reversibly revoke `DELETE` on that derived
  index table only. This never deletes a document, version, file object,
  canonical text, audit record, email, filing, or legal/records artifact;
  existing tenant RLS and the query's `tenant_id`, `version_id`, and
  non-current-route predicates remain authoritative. No generic privilege,
  query behavior, retention/policy change, dependency, external operation,
  deployment, or release work is authorized.
- **Canonical scope amendment (2026-07-22, external NDA idempotency):** the
  runtime regression reaches the existing token-resolved, tenant-scoped,
  audited NDA acceptance upsert only. The TUW may add
  `apps/api/src/modules/external` to the observed runtime scope and create
  `0190_grant_runtime_external_nda_acceptance.sql` with its matching L0 source
  decision, granting and reversibly revoking only `UPDATE (accepted_at)` on
  `external_nda_acceptances` for the existing conflict no-op. Existing token
  hashing, link expiry/status validation, tenant RLS, NDA uniqueness,
  acceptance audit, external portal behavior, and data fields remain
  unchanged. This authorizes no direct-pool migration, new sharing capability,
  token persistence, outbound integration, dependency, deployment or release
  work.
- **Canonical scope amendment (2026-07-22, external Q&A review):** the next
  runtime regression reaches the existing tenant-scoped, permission- and
  audit-guarded external-answer review lock and state transition. The TUW may
  create `0191_grant_runtime_external_qa_review.sql` with its matching L0
  source decision, granting and reversibly revoking only `UPDATE (status,
  reviewed_by_internal_user_id, reviewed_at)` on `external_qa_messages`.
  Existing self-approval denial, review state machine, visibility scope, RLS,
  audit and workflow completion remain unchanged. No new external Q&A
  behavior, sharing, token persistence, outbound integration, direct-pool
  migration, dependency, deployment or release work is authorized.
- **Canonical scope amendment (2026-07-22, Matter wiki generation metadata):**
  the next runtime regression reaches the existing tenant-scoped,
  permission-checked, audited Matter-wiki draft regeneration upsert. The TUW
  may create `0192_grant_runtime_matter_wiki_generation_metadata.sql` with
  its matching L0 source decision, granting and reversibly revoking only
  `UPDATE (generated_by, generated_at)` on `matter_wiki_pages`. Existing
  page body/source-reference behavior, review-state consistency constraint,
  Matter permission check, RLS, audit, work-item linkage and local generation
  route remain unchanged. No AI behavior, new source, sharing, direct-pool
  migration, dependency, deployment or release work is authorized.
- **Canonical scope amendment (2026-07-22, Records disposal execution):**
  the next runtime regression reaches the existing R12 Records disposal
  executor after its approval, legal-hold, active-hold, business-reference,
  storage-delete and certificate/audit preconditions. The TUW may create
  `0193_grant_runtime_records_disposal_execution.sql` with its matching L0
  source decision, granting and reversibly revoking only `DELETE` on
  `document_chunks`, `canonical_documents`, `document_search_index`,
  `document_preview_artifacts`, `document_versions`, `file_objects` and
  `documents`, plus `UPDATE (supersedes_version_id)` on `document_versions`.
  This restores no new deletion behavior: the existing approved-disposal
  transaction, tenant predicates/RLS, immutable-file trigger, hold checks and
  certificate/audit behavior remain authoritative. No disposal workflow,
  policy/retention, storage, direct-pool migration, dependency, deployment or
  release work is authorized.
- **Canonical scope amendment (2026-07-22, saved-search lifecycle):** the
  next runtime regression reaches the existing tenant-scoped, permission- and
  audit-guarded saved-search save, revoke and open-count SQL. The TUW may
  create `0194_grant_runtime_saved_search_lifecycle.sql` with its matching L0
  source decision, granting and reversibly revoking only `SELECT`, `INSERT`
  and `UPDATE (scope_type, matter_id, search_query_json, query_hash,
  filter_refs, revoked_at, revoked_by, updated_at, opened_count,
  last_opened_at)` on `saved_searches`. Existing scope authorization,
  tenant RLS, bounded filter-reference policy, audit events and
  permission-before-search query construction remain unchanged. No search
  retrieval, result filtering, source, direct-pool migration, dependency,
  deployment or release work is authorized.
- **Implementation:** move DB state and bulk enqueue coupling to the active
  tenant client. The scope provider returns a SQL predicate before query build;
  it must not fetch results or add a result post-filter.
- **Verification (AND):** affected unit specs; document-access,
  storage-isolation, search-permission, metadata-leakage, cross-tenant and
  audit-coverage suites; unauthorized title/snippet/metadata leakage is zero;
  full DB/integration regression; final authority checker delta.
- **Done:** listed constructors are zero and immutable upload/version/search
  parity is retained.

## Evidence and completion

Each TUW writes a source SHA/tree-bound receipt beneath
`artifacts/enterprise-dms-oss/<source-sha>/PACK-OSS01-02/<tuw>/`. The pack
manifest must record the direct-pool before/after delta, all AND checks, and
separate `PENDING_INDEPENDENT_REVIEW`/`NOT_RUN` CI state. CI, push, PR, merge,
deployment, release and go-live are not authorized or implied.
