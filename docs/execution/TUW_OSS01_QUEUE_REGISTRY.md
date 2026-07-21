# PACK-OSS01-04 — PgBoss registry and connection budget

Status: canonical post-R14 extension under
`USER-UMBRELLA-AUTONOMY-20260721`. This is the just-in-time canonical form of
`PROPOSED-PACK-OSS01-04`; frozen `docs/package/**` remains unchanged.

## Scope and invariants

- This PACK centralizes only the already-inventoried PgBoss lifecycle. It does
  not replace pg-boss, vendor upstream source, or add a queue dependency.
- API processes are producer-only; worker processes may register consumers.
  Existing legacy worker-enable overrides remain explicit and test-covered.
- Production runtime creates neither the `pgboss` schema nor migration state.
  Migration/queue preparation remains an explicit owner-only tool path.
- Queue names, payload schemas, singleton keys, retries, dead-letter targets,
  retention, audit rules, permission checks, and feature gates are parity
  contracts. They cannot change incidentally during migration.
- Business SQL and PgBoss enqueue retain the existing transaction-client
  `db` adapter path. A required enqueue failure aborts its enclosing business
  operation; no best-effort fallback is allowed.
- Every direct PgBoss constructor must disappear by TUW-003. The registry is
  the sole lifecycle owner and its stop operation is idempotent.

## TUW order

| Order | ID | Risk | Depends on | Objective |
|---:|---|---|---|---|
| 1 | `DEVOPS-OSS01-QUE-TUW-001` | C | DBR-004 | establish the singleton role-aware PgBoss registry contract |
| 2 | `DEVOPS-OSS01-QUE-TUW-002` | C | QUE-001 | migrate document/search/preview/email queue consumers |
| 3 | `DEVOPS-OSS01-QUE-TUW-003` | C | QUE-002 | migrate audit/DLP/notification/AI/contract/DD consumers |
| 4 | `DEVOPS-OSS01-QUE-TUW-004` | C | QUE-001~003 | lock the queue authority checker and measured connection/outage gate |

## `DEVOPS-OSS01-QUE-TUW-001`

- **Files create:** `apps/api/src/common/queue/queue.tokens.ts`,
  `queue.registry.ts`, `queue.module.ts`, and colocated specs.
- **Files modify:** `apps/api/src/common/db/pg-boss-runtime-options.ts` and
  spec; `apps/api/src/common/process-role.ts` and spec only where the
  registry needs a typed process-role contract; `apps/api/src/app.module.ts`.
- **Files NOT-modify:** every queue service, queue names/payloads/options,
  `tools/db/prepare-ai-prep-queue.ts`, migrations, dependencies/locks,
  `.github/**`, `docs/package/**`.
- **Implementation:** centralize the one runtime connection/config owner;
  register named queue definitions, expose typed producer/consumer handles,
  reject duplicate registration, start once, stop once, and make worker
  consumption impossible in an API role. Runtime defaults must assert
  `migrate=false` and `createSchema=false` when `NODE_ENV=production`.
- **Verification (AND):** role matrix, duplicate registration, partial-start
  failure, start/stop idempotency, producer handle unavailable failure, and
  existing runtime-options regressions. The test harness runs 50 create/close
  loops without a growing client baseline.
- **Stop:** a queue requires runtime schema creation/migration, a typed handle
  cannot retain transaction-client enqueue semantics, or worker registration
  is reachable in API role.

## `DEVOPS-OSS01-QUE-TUW-002`

- **Files modify:** `apps/api/src/modules/document/bulk-upload-queue.service.ts`,
  `document/comparison/document-comparison.service.ts`,
  `document/edit-session-sweeper.service.ts`,
  `document/extraction/extraction-queue.service.ts`,
  `document/extraction/ocr-queue.service.ts`,
  `email/email-reparse.service.ts`, `preview/preview-precreate-queue.service.ts`,
  `search/index/indexing.service.ts`, their owning modules/specs, and
  `security/oss-source-map.yml`.
- **Files create:** none.
- **Files NOT-modify:** queue contracts/options, document immutable/version
  behavior, storage semantics, permission/search scope, migrations,
  dependencies/locks, `docs/package/**`.
- **Implementation:** remove service-local PgBoss lifecycle and inject only
  the registered handle; retain each existing queue definition and the
  `pgBossDbFromPoolClient` transaction adapter. Register consumers only in
  worker role; the API has zero consumers.
- **Verification (AND):** affected unit specs; document upload/extraction,
  preview, email, and search integrations; duplicate-job/idempotency checks;
  API consumer count zero; worker graceful shutdown; source-map delta.
- **Stop:** parity requires changed retry/retention/payload policy or a generic
  transaction workaround.

## `DEVOPS-OSS01-QUE-TUW-003`

- **Files modify:** `apps/api/src/modules/audit/audit-anchor-job.service.ts`,
  `dlp/bulk-download-monitor.service.ts`,
  `integrations/law-data/law-amendment-refresh-scheduler.service.ts`,
  `notifications/dd-rfi-notification-scheduler.service.ts`,
  `notifications/litigation-deadline-notification-scheduler.service.ts`,
  `records/retention-scheduler.service.ts`,
  `ai/features/contract-ai-review-worker.service.ts`,
  `ai/prep/ai-prep-queue.service.ts`,
  `contract-intel/contract-ai-review-queue.service.ts`,
  `dd/dd-export-queue.service.ts`, their modules/specs, and
  `security/oss-source-map.yml`.
- **Files create:** none.
- **Files NOT-modify:** audit append-only semantics, DLP/action policies,
  AI local-only/permission gates, export permissions, schedule cadence,
  `tools/prepare-ai-prep-queue.ts`, dependencies/locks, `docs/package/**`.
- **Implementation:** migrate the remaining constructor sites to named
  registry handles, retain singleton schedule keys and disabled feature gates,
  and preserve producer-only tools as non-consumers.
- **Verification (AND):** affected specs; audit/DLP/AI/contract/DD integrations;
  duplicate schedule/start, worker-only consumption, disabled AI and
  producer-only negatives; final direct-PgBoss count zero.
- **Stop:** consolidation hides audit failure, enables AI, or changes schedule
  retry/retention behavior.

## `DEVOPS-OSS01-QUE-TUW-004`

- **Files create:** `tools/quality/check-queue-authority.mjs`, its spec, and
  `tests/integration/fail-closed/db-queue-outage.spec.ts`.
- **Files modify:** existing metrics/health only to expose registry-safe
  bounded counts; `security/oss-source-map.yml`; existing CI workflow only if
  the local checker has no existing non-deploying command path.
- **Files NOT-modify:** queue policy, PgBouncer, pool-size defaults without
  measurement, test skip config, dependencies/locks, `docs/package/**`.
- **Implementation:** fail closed on direct PgBoss constructor, unregistered
  queue, runtime migration/schema creation, role-incorrect consumer, or
  unsupported connection budget. Measure configured API/worker registry counts
  and local idle/peak/shutdown connections; inject queue/DB outage and
  duplicate/shutdown-mid-poll cases without external systems.
- **Verification (AND):** direct Pool/PgBoss authority checks; 50 lifecycle
  loops; full permission/cross-tenant/search/audit regression; budget within
  the registered ceiling; outage negative; frozen-doc/backlog/source-map/
  reuse-first/diff checks.
- **Stop:** a budget overage would be hidden by shared Permission/Audit
  transactions, session GUC outside a transaction, PgBouncer adoption, or an
  external queue service.

## Evidence boundary

Each TUW records source SHA/tree, direct-constructor inventory, queue parity,
focused/negative/audit commands, and synthetic-only evidence at
`artifacts/enterprise-dms-oss/<source-sha>/PACK-OSS01-04/<tuw>/`. Local pass
does not claim CI, push/PR/merge, deployment, release, or go-live.
