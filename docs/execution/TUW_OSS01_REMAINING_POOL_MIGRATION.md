# PACK-OSS01-03 — remaining direct Pool migration and authority gate

Status: canonical post-R14 extension under `USER-UMBRELLA-AUTONOMY-20260721`.
It is the just-in-time canonical form of `PROPOSED-PACK-OSS01-03`; frozen
`docs/package/**` remains unchanged.

## Scope and invariants

- This is L0 reuse: use the existing Vault-owned `DatabaseService`,
  `TenantAwareDataSource`, `AuditService`, process-role assertion, and
  database-authority checker. No upstream source, fixture, dependency, fork,
  vendor tree, or Docker build input is introduced.
- A tenant-scoped operation uses the existing central tenant transaction, its
  transaction-local tenant GUC, and its explicit `tenant_id` predicate where
  the existing query has one. A missing, ambiguous, or cross-tenant context
  fails closed; the migration must not add a generic unscoped query method.
- Permission-before-search and Permission-before-AI remain query/precheck
  requirements. A denied record, chunk, session, or public token must not
  enter a post-filter, AI session, or content log.
- Existing successful/action audit writes remain in their business
  transaction. Existing safe-denied handling may use only its already named
  isolated audit path; this PACK introduces no new exception.
- Existing R11 feature flags remain disabled where already disabled. Existing
  public-token lookup may use only an approved bounded method; discovery of a
  tenant-isolation bypass is a stop, not an opportunity to change the public
  sharing design.
- Runtime applications use `DATABASE_RUNTIME_URL` only through central
  authority. Owner migration/maintenance tools remain explicit, narrow
  exceptions and are not broadened by this PACK.

## TUW inventory

| Order | ID | Risk | Depends on | Objective |
|---:|---|---|---|---|
| 1 | `DEVOPS-OSS01-DBR-TUW-001` | C | DBM-004 | migrate Records/DLP/External/Enterprise/Scale and queue metrics direct pools |
| 2 | `DEVOPS-OSS01-DBR-TUW-002` | C | DBR-001 | migrate AI policy, summary-gate, feedback, and session direct pools |
| 3 | `DEVOPS-OSS01-DBR-TUW-003` | H | DBR-002 | migrate law-data, Matter App, and notification scheduler direct pools |
| 4 | `DEVOPS-OSS01-DBR-TUW-004` | C | DBR-001~003 | migrate two named application tools and make the source authority gate hard |

## `DEVOPS-OSS01-DBR-TUW-001`

- **Files create:** none.
- **Files modify:**
  `apps/api/src/modules/records/retention-scheduler.service.ts` and its spec;
  `apps/api/src/modules/dlp/bulk-download-monitor.service.ts` and its spec;
  `apps/api/src/modules/external/external.service.ts` and its colocated specs;
  `apps/api/src/modules/enterprise/enterprise.service.ts` and its colocated
  specs; `apps/api/src/modules/scale/scale.service.ts` and its colocated specs;
  `apps/api/src/common/metrics/queue-metrics.service.ts` and its spec; owning
  module wiring only where constructor injection requires it; direct focused
  integration specs in `tests/integration/records-governance.spec.ts`,
  `tests/integration/dlp-bulk-download.spec.ts`,
  `tests/integration/cross-tenant/dlp-findings-rls.spec.ts`,
  `tests/integration/audit-coverage/dlp-audit.spec.ts`,
  `tests/integration/external-core.spec.ts`,
  `tests/integration/external-portal-gate.spec.ts`,
  `tests/integration/enterprise-hardening.spec.ts`, and
  `tests/integration/scale-learning.spec.ts`; and only matching OSS-01
  constructor rows in `security/oss-source-map.yml`.
- **Files NOT-modify:** external feature flags/governance or secure-link
  behavior; legal hold/disposal decisions; DLP thresholds/detectors; telemetry
  label policy; RLS/policy semantics; dependencies/locks; `docs/package/**`.
- **Implementation:** replace only the listed direct pools with the existing
  injected central provider. Tenant-known control-plane work uses a tenant
  transaction; global bounded health/queue observations use a named read-only
  central adapter if one already exists. Preserve scheduler system-actor
  behavior, audit client propagation, and R11-disabled surfaces. A public
  token must not trigger a tenant-wide lookup.
- **Verification (AND):** affected unit specs; records-governance, legal-hold,
  DLP audit/cross-tenant, external portal gate, enterprise-hardening,
  scale-learning, fail-closed, and audit coverage as applicable; database
  authority inventory shows these constructors removed; database outage,
  missing tenant, legal-hold race, and external-token cross-tenant negatives
  stay denied/safe.
- **Stop:** public-token tenant isolation bypass; a records action whose audit
  must split; a global metric that requires a runtime owner credential; or a
  required policy/threshold/feature-flag change.
- **Scope amendment (2026-07-22, bounded capability-token resolver):** the
  existing external public-token flow has no tenant context until the token is
  resolved, so it cannot be moved to a tenant transaction directly. Permit
  `db/migrations/0196_add_external_link_token_lookup.sql` and the single named
  `DatabaseService.findExternalLinkByTokenHash` adapter. The function is
  `SECURITY DEFINER` with fixed public search path, `PUBLIC` revoked, and
  `vault_app` execute only; it accepts the existing token hash and returns only
  existing link state required to establish a tenant context. After resolution,
  every query again uses the central tenant transaction. It may not expose a
  generic lookup, raw token, tenant enumeration, external feature change, RLS
  or policy change, dependency, deployment, or external mutation.
- **Scope amendment (2026-07-22, bounded PgBoss aggregate metrics):** the
  existing queue-metrics service must preserve its global operational count
  while removing its direct pool. Permit one named
  `DatabaseService.readPgBossQueueMetrics` method that accepts only the fixed
  registered queue names and returns aggregate depth/dead-letter counts. It
  validates the configured schema identifier and never returns job payloads or
  exposes an arbitrary global SQL method. PgBoss lifecycle/migration ownership,
  queue names/payloads, telemetry label policy, runtime owner credentials,
  RLS/policy, dependencies, deployment, and external behavior remain unchanged.

## `DEVOPS-OSS01-DBR-TUW-002`

- **Files create:** none.
- **Files modify:** `apps/api/src/modules/ai-policy/ai-policy.service.ts` and
  its colocated spec; `apps/api/src/modules/ai/features/ai-summary-generation-gate.service.ts`
  and its colocated spec; `apps/api/src/modules/ai/feedback/ai-feedback.service.ts`
  and its colocated specs; `apps/api/src/modules/ai/session/ai-session-log.service.ts`
  and `ai-session-log.service.spec.ts`; owning module wiring only as required
  for injection; direct focused integration specs
  `tests/integration/ai-policy.spec.ts`, `tests/integration/ai-feedback.spec.ts`,
  `tests/integration/ai-session.spec.ts`; and matching OSS-01 constructor rows
  in `security/oss-source-map.yml`.
- **Files NOT-modify:** external model enablement/SDKs/calls; retrieval scope;
  `aiAllowed` default; prompt, response, or content logging schema; AI policy
  semantics; dependencies/locks; `docs/package/**`.
- **Implementation:** move reads/writes to the central tenant transaction,
  preserving current permission and AI-policy precheck ordering. Reuse the
  transaction client for session and audit writes where the existing flow is
  atomic. Keep all interfaces reference/hash/metric based: no raw prompt/body
  is added to an adapter, database row, audit metadata, or log.
- **Verification (AND):** affected unit specs; AI-policy, AI-session,
  AI-feedback, AI-retrieval permission, cross-tenant, fail-closed, audit, and
  content-log-canary coverage; missing policy, invalid condition, hidden
  chunk, denied feedback/session, and audit-failure negatives; authority
  inventory shows the listed constructors removed.
- **Stop:** any change would require an external AI SDK/call, policy
  post-filter, raw-content passage, owner runtime credential, or altered
  local-only route.
- **Scope amendment (2026-07-22, AI retrieval-log upsert grant):** clean
  runtime-role verification found the existing idempotent `ai_session_chunks`
  retrieval-log upsert needs its conflict-update columns, which the legacy
  `SELECT, INSERT` grant omitted. Permit only reversible 0197 `UPDATE`
  privilege on `included`, `reason_code`, `rank_index`, `score`, `quote_hash`,
  and `source_text_hash` for `vault_app`; RLS and the existing tenant GUC stay
  mandatory. No AI policy, retrieval order/scope, prompt/response/content
  schema, audit semantics, dependency, deployment, or external behavior
  changes.

## `DEVOPS-OSS01-DBR-TUW-003`

- **Files create:** none.
- **Files modify:**
  `apps/api/src/modules/integrations/law-data/law-amendment-refresh-scheduler.service.ts`
  and spec; `apps/api/src/modules/integrations/matter-app/matter-app-runtime.service.ts`
  and spec; `apps/api/src/modules/integrations/matter-app/matter-source-policy.ts`
  and spec; `apps/api/src/modules/notifications/dd-rfi-notification-scheduler.service.ts`
  and colocated spec; `apps/api/src/modules/notifications/litigation-deadline-notification-scheduler.service.ts`
  and spec; owning module/worker wiring only as required for injection; direct
  focused integration specs `tests/integration/law-data.spec.ts` and
  `tests/integration/matter-app-sync.spec.ts`; matching notification integration
  specs when present; and matching OSS-01 constructor rows in
  `security/oss-source-map.yml`.
- **Files NOT-modify:** external API scope/credentials; canonical matter
  authority; notification delivery policy; scheduler cadence; RLS/policy
  semantics; dependencies/locks; `docs/package/**`.
- **Implementation:** replace each direct pool with central process-role-aware
  access. Preserve API-versus-worker enablement. Tenant iteration may use only
  configured tenant IDs or an already approved bounded system adapter; do not
  create an unbounded owner-wide scan. Preserve existing enqueue/update audit
  client propagation and bounded partial-failure behavior.
- **Verification (AND):** affected unit specs; law-data, Matter App sync, and
  relevant notification integration coverage; worker/API role matrix;
  empty-tenant-list, partial-tenant failure, duplicate tick, external timeout,
  cross-tenant, fail-closed, and audit negatives; authority inventory shows
  these constructors removed.
- **Stop:** a scheduler requires an unbounded owner-wide scan, an API process
  would run a worker-only job, tenant context cannot be determined, or external
  credentials/scope must change.

## `DEVOPS-OSS01-DBR-TUW-004`

- **Files create:** none. Reuse an existing TypeScript-compatible bounded
  runtime/owner client path; do not add a generic runner factory.
- **Files modify:** `apps/api/src/tools/gemma-customer-wide-real-output-runner.ts`
  and spec; `apps/api/src/tools/onedrive-full-closeout-remediation-runner.ts`
  and spec; `tools/quality/check-database-authority.mjs` and spec; and matching
  OSS-01 constructor rows in `security/oss-source-map.yml`. Modify
  `.github/workflows/ci.yml` only if the existing local checker command is not
  already executed; any workflow edit remains source-only and does not authorize
  CI execution.
- **Files NOT-modify:** `tools/db/migrate.mjs` owner semantics; production
  execution/go-live claims; application permission semantics; dependencies/
  locks; `docs/package/**`.
- **Implementation:** make each named tool declare and enforce its runtime or
  owner role before connection creation. Production application behavior uses
  only runtime authority; migration/maintenance ownership stays an explicit
  allowlisted exception with a reason. Extend the checker to reject a direct
  application `new Pool`/`new Client`, `DATABASE_URL` fallback, default raw
  connection string, or unclosed pool outside its explicit allowlist. Fixtures
  must prove both valid and intentional-invalid classifications.
- **Clarification (2026-07-22):** the two named maintenance tools accept only
  `DATABASE_MIGRATION_URL` and the identifier-validated
  `DATABASE_MIGRATION_ROLE` (default `amic_vault`); CLI `--database-url`,
  `DATABASE_URL`, and a raw development fallback are not authority inputs.
  The first database operation verifies `current_user` before planning or
  mutation, and the pool is always closed in `finally`. These are explicit
  owner-maintenance exceptions only, not runtime application authority.
- **Verification (AND):** checker green on current source; intentional
  violation fixtures red; 50 AppModule/tool create-close loops restore the
  connection baseline; full lint/typecheck/test/build; isolated owner DB
  migrate up/down/up, seed, focused integrations, full integration, frozen-doc,
  backlog, source-map, reuse-first, and diff checks. Record before/after
  inventory and connection-lifecycle evidence without connection strings.
- **Stop:** allowing an application service into the owner allowlist; an owner
  credential needed by runtime application flow; dynamic direct constructor
  that cannot be classified safely; or any production/external command needed
  for proof.

## Evidence and completion boundary

Each TUW records source SHA/tree, exact constructor inventory delta,
focused/negative/audit commands, synthetic-only evidence, and truth state in
`artifacts/enterprise-dms-oss/<source-sha>/PACK-OSS01-03/<tuw>/`. The final
TUW additionally records the final inventory, negative checker fixtures, and
connection lifecycle receipt. Local technical pass does not claim external CI,
push/PR/merge, deployment, release, or go-live; those remain distinct and,
where not authorized, `EXTERNAL_BLOCKED`.
