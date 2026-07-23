# PACK-SF20-04 — Bounded operations monitoring and alert drills

Status: canonical post-R14 extension under
`USER-UMBRELLA-AUTONOMY-20260721` and the owner's all-immediate-track execution
direction. This is the canonical form of `PROPOSED-PACK-SF20-04`, based on
merged `origin/main`
`74dbd9af3399365418c7994aac43e2c6697174ad`.

## Objective and authority

Give one operator of a maximum-20-user law-firm deployment enough bounded
state to detect, classify, and rehearse the important failures without
operating a distributed tracing, dashboard, or SIEM platform:

```text
Vault aggregate metrics
  -> one internal digest-pinned Prometheus
  -> versioned SF20 recording and alert rules
  -> one internal digest-pinned Alertmanager
  -> bounded operator action and silence ceiling
  -> fire -> delivery -> ack -> recovery -> resolve drill receipt
```

The repository owns metric semantics, finite label vocabularies, SLOs,
alert-rule metadata, runbooks, log-redaction rules, deterministic synthetic
inputs, local runtime drills, and evidence schemas. It does not create an
approved host, notification account, webhook credential, staging environment,
or production delivery route. An approved staging drill remains
`EXTERNAL_BLOCKED_APPROVED_STAGING_ALERT_DRILL_RECEIPT_REQUIRED`; this does not
block implementation, local verification, review, or merge.

Prometheus v3.13.1 and Alertmanager v0.33.1 are reused as exact digest-pinned
official images. Their locally cloned exact source trees are read-only
evidence for configuration and validator behavior. No upstream Go source,
test, fixture, or example is copied into the Vault product tree. Vault-owned
JSON-compatible YAML is checked by the official image-bundled `promtool` and
`amtool`.

## Pack-wide invariants

1. `docs/package/**`, PermissionService, ethical-wall policy, audit authority,
   immutable-original semantics, document/storage keys, and database schema
   remain unchanged.
2. Monitoring is observational only. A missing or failed monitoring service
   cannot allow a document, suppress an audit failure, alter a queue job,
   change a backup, or become a release/go-live authority.
3. Metric labels are closed enums or registered queue names. Tenant, user,
   matter, document, version, file, object, session, request, nonce, token,
   filename, path, URL, host, IP, content, and credential labels are forbidden.
4. HTTP histogram series remain capped. Queue series are derived from the
   singleton QueueRegistry so every registered queue is represented exactly
   once and request/job data cannot create a series.
5. Database/file-security observations aggregate inside tenant-scoped
   transactions and return numbers only. Tenant IDs may be used transiently
   to establish RLS context but never cross the metrics boundary.
6. Audit success/failure and storage/ingestion failures use closed outcome or
   error-class vocabularies. Unknown values collapse to `unknown`; no raw
   exception or payload becomes a label.
7. A missing database, scanner signature, backup status, or monitored
   filesystem is an explicit availability gauge of zero. Missing input never
   becomes a fresh/healthy zero-age value.
8. Backup freshness is read from a small closed operator status document. It
   contains timestamps/durations and no provider, tenant, object, or
   credential detail. Its absence keeps deployment evidence externally
   blocked and fires the corresponding alert.
9. The 99.5% availability objective, API/search latency, audit success, queue
   age, scanner freshness, quarantine age, backup RPO/RTO, database pressure,
   storage failure, and disk pressure rules are versioned source.
10. Every alert has an exact bounded name, severity, owner, runbook anchor,
    first action, maximum silence, and a synthetic positive and recovery
    vector. An alert is not complete merely because it parses.
11. Prometheus and Alertmanager have immutable images, internal networks, no
    published/exposed ports, read-only roots, dropped capabilities,
    no-new-privileges, non-root identities, health checks, restart policy,
    finite CPU/memory/PIDs/tmpfs, bounded storage, and bounded retention.
12. Prometheus scrapes only the aggregate API metrics endpoint across the
    closed application network. It never reaches the ingestion worker and
    does not weaken the gateway-only worker boundary.
13. Grafana, OpenTelemetry, Jaeger, node-exporter, SIEM and external log/alert
    sinks are not needed for this scale and remain absent until a measured
    trigger and separate approval exist.
14. Every service uses finite local JSON-log rotation. Logs use stable
    `ref:<sha256-prefix>` references for correlation and redact raw UUIDs,
    paths, content, filenames, tokens, credentials, trace bodies, and secrets.
15. API queue correlation, API worker-dispatch correlation, and ingestion
    request correlation use the same reference-hash algorithm. The bridge log
    contains both safe references and no raw identifier.
16. Uvicorn access logs are disabled because they contain raw paths and
    client addresses. The worker emits only bounded JSON events, safe
    correlation references, status classes, and durations.
17. Local alert drills use generated data, an isolated Docker network, the
    exact pinned images, a local synthetic metrics target, and a local
    receiver. They leave no container, network, volume, status file, or
    process behind.
18. Alert evidence contains names, bounded states, times, durations, hashes,
    and delivery counts only. Customer data, raw IDs, paths, endpoints,
    credentials, notification payload bodies, and provider details are
    prohibited.
19. No dependency or lockfile change is authorized. Any missing capability
    that cannot be implemented with current code, standard libraries, Docker,
    or the pinned official images is a stop and follow-on decision.

## Ordered TUWs

| Order | ID | Risk / size | Depends on | Result |
| ----: | -- | ----------- | ---------- | ------ |
| 1 | `DEVOPS-SF20-OPS-TUW-001` | H / L | `DEVOPS-SF20-DR-TUW-003` | complete bounded critical-metric registry |
| 2 | `DEVOPS-SF20-OPS-TUW-002` | H / M | OPS-001 | versioned 99.5% SLO, actionable alerts, and runbook |
| 3 | `DEVOPS-SF20-OPS-TUW-003` | H / M | OPS-001, OPS-002 | internal finite Prometheus and Alertmanager runtime |
| 4 | `DEVOPS-SF20-OPS-TUW-004` | H / M | OPS-001, OPS-003 | bounded correlated JSON-log operations |
| 5 | `DEVOPS-SF20-OPS-TUW-005` | C / L | OPS-002, OPS-003, OPS-004 | real local alert drill and approved-staging boundary |

## `DEVOPS-SF20-OPS-TUW-001`

**Title:** Bounded critical metrics registry
**Release/module:** R14 / DEVOPS-SF20-OPS
**Risk/size:** H / L
**Objective:** Extend the existing in-process Prometheus registry with every
critical SF20 state while keeping series cardinality and data sensitivity
provably bounded.

### Files

- **Modify:** `apps/api/src/common/metrics/**`,
  `apps/api/src/common/queue/queue.registry.ts` and its colocated spec,
  `apps/api/src/common/db/database.service.ts` and its colocated spec,
  `apps/api/src/modules/audit/audit.service.ts` and its colocated spec,
  `apps/api/src/modules/storage/storage.service.ts` and its colocated spec,
  focused extraction tests.
- **May create:** one standard-library operational snapshot reader and
  colocated spec under `apps/api/src/common/metrics/`.
- **NOT modify:** database migrations/schema, PermissionService, audit event
  schema/metadata, storage keys, queue payloads/retry policy, worker network,
  dependency/lock files, `docs/package/**`.

### Implementation

- Reuse the existing bounded HTTP histogram and MetricsRegistry. Add only
  gauges/counters needed for queue depth and oldest age, scanner signature
  availability/age, oldest quarantine age, ingestion outcome, audit-write
  outcome, storage failure class, database availability/pool counts, backup
  availability/age/last-restore duration, and monitored-disk availability/
  free ratio.
- Expose immutable copies of QueueRegistry definitions. Derive metrics from
  every registered name and its optional registered dead-letter target rather
  than maintaining an import list that can drift.
- Query pg-boss aggregate counts and the oldest active job timestamp without
  selecting payload data. An empty queue yields depth/age zero; an unavailable
  database yields database availability zero rather than a healthy queue.
- Read file-security aggregates in tenant-scoped transactions, then combine
  only counts and extrema. Include non-promoted quarantine states and the
  freshest verified scanner-signature timestamp.
- Count audit writes only around the central insert and count storage failures
  only around the central StorageService adapter boundary. Preserve the
  original exception and fail-closed behavior.
- Parse a closed bounded backup-status document and compute age against the
  supplied clock. Missing, stale, malformed, future, symlinked, non-regular,
  or oversized status input is unavailable, never fresh.
- Use Node standard-library filesystem statistics for the bounded container
  filesystem signal. A real host/staging disk receipt remains part of OPS-005.

### Verification (AND)

- Registry unit tests cover every metric, HELP/TYPE declaration, closed
  outcome/error vocabularies, unavailable inputs, nonnegative ages/counts,
  ratio bounds, and deterministic rendering.
- One hundred thousand HTTP observations remain inside the existing series
  budget; registered queue coverage reports zero omissions and no job data can
  create a label.
- Rendered output contains zero tenant/user/matter/document/version/file/
  object/session/request/token/filename/path/content/credential labels or
  synthetic canary values.
- Database tests prove payload-free pg-boss SQL, `created_on` oldest-age
  calculation, tenant-context aggregation, pool counts, and fail-closed
  unavailable behavior.
- Audit/storage focused tests prove one success/failure increment and unchanged
  exception/transaction semantics. Existing unit and integration regressions
  remain green.

### Done / stop

Done when every critical state has one bounded metric and the checker proves
zero registered-queue omissions and zero sensitive labels. Stop if a metric
requires raw payload/content, cross-tenant bypass, a new database authority,
or unbounded dynamic labels.

## `DEVOPS-SF20-OPS-TUW-002`

**Title:** Versioned SF20 SLO, alert rules, and operator runbook
**Release/module:** R14 / DEVOPS-SF20-OPS
**Risk/size:** H / M
**Objective:** Turn critical metrics into a versioned 99.5% service objective
and alerts that specify exactly who acts, what they do first, and how long an
alert may be silenced.

### Files

- **Create:** `infra/monitoring/prometheus.yml`,
  `infra/monitoring/alerts.yml`, `infra/monitoring/alerts.test.yml`,
  `infra/monitoring/alertmanager.yml`,
  `tools/monitoring/check-small-firm-monitoring.mjs`,
  `tools/monitoring/check-small-firm-monitoring.spec.mjs`,
  `docs/release/small-firm-operations-runbook.md`.
- **Modify:** root scripts and CI only to add deterministic static monitoring
  checks if existing patterns require it.
- **NOT modify:** external notification credentials/routes, dashboards,
  SIEM/export, document/audit bodies, dependency/lock files,
  `docs/package/**`.

### Implementation

- Keep `.yml` files JSON-compatible so Node standard-library checks can parse
  the same documents accepted by the official YAML loaders.
- Define recording/alert rules for 99.5% availability, API p95 <= 1000 ms,
  permission-bound search p95 <= 2000 ms, audit-write failure, ingestion
  failure, oldest queue age, scanner unavailable/stale, quarantine age,
  database unavailable/pool waiting, storage failure, backup unavailable/
  stale, restore duration > 240 minutes, and disk free ratio.
- Every rule has closed `severity`, `owner`, `runbook`, `first_action`, and
  `silence_max` labels/annotations. Links are local runbook anchors, not
  request-selected URLs.
- Set scrape/evaluation intervals and Prometheus TSDB retention time/size in
  versioned configuration. Alertmanager grouping/repeat behavior is finite and
  its repository baseline receiver contains no external credential.
- The runbook gives detection meaning, first action, diagnostic command,
  bounded acknowledgement/silence, recovery condition, escalation boundary,
  and evidence fields for each alert.
- Reuse `promtool check config`, `promtool check rules`, `promtool test rules`,
  and `amtool check-config` from the exact pinned official images for syntax
  and synthetic fire/recovery vectors.

### Verification (AND)

- The standard-library checker enforces exact config/rule schemas, SLO values,
  rule names, metadata fields, local anchors, finite intervals/retention, and
  sensitive-label absence; malformed/unknown/missing mutations fail.
- Official validators accept Prometheus, rules, rule tests, and Alertmanager
  configuration from read-only mounts.
- Synthetic vectors fire and recover every critical alert; threshold boundary
  values do not fire and over-threshold values do.
- Every alert name maps one-to-one to a runbook section, owner, severity,
  first action, and bounded silence. No dashboard-only critical state remains.

### Done / stop

Done when configuration, official validators, synthetic vectors, and runbook
converge on the same alert set. Stop if a rule requires sensitive labels,
unbounded query cardinality, an external credential, or a dashboard to know
the first action.

## `DEVOPS-SF20-OPS-TUW-003`

**Title:** Internal finite Prometheus and Alertmanager runtime
**Release/module:** R14 / DEVOPS-SF20-OPS
**Risk/size:** H / M
**Objective:** Add the two approved monitoring runtimes without a public
listener and without allowing monitoring failure to exhaust or block Vault.

### Files

- **Modify:** `infra/production/compose.yml`,
  `infra/production/compose.images.yml` only if overlay semantics require it,
  `infra/production/profile.yml`, `tools/security/check-production-host.mjs`
  and spec, `tools/security/check-production-profile.mjs` and spec, focused
  Ansible source lists/checks when the monitoring config files must be copied.
- **Create:** no runtime service other than Prometheus and Alertmanager.
- **NOT modify:** ingestion gateway/worker trust, public port list, Grafana,
  OpenTelemetry/Jaeger, external receiver credentials, dependency/lock files,
  provider state, `docs/package/**`.

### Implementation

- Add Prometheus and Alertmanager from the exact source-map digest references.
  The immutable-image overlay keeps application images operator supplied and
  must not replace either approved monitoring digest.
- Add one internal monitoring network and finite named data volumes.
  Prometheus joins the application network only to scrape API `/metrics` and
  the monitoring network only to reach Alertmanager. Alertmanager joins only
  the monitoring network. Neither service publishes or exposes a port.
- Use non-root users, read-only roots, all capabilities dropped,
  no-new-privileges, bounded tmpfs/PIDs/CPU/memory, finite retention/storage,
  health checks, restart policy, and read-only config mounts.
- Preserve every existing gateway/sandbox network membership exactly.
  Prometheus never joins ingestion-client, ingestion-worker, or
  ingestion-egress.
- Configure finite local log rotation for every production service so logs
  cannot consume the single node without bound.
- Update production host/profile checkers to require the exact eight-service,
  seven-image, five-network, four-volume graph and reject any monitoring
  publication, floating image, missing limit, or network drift.

### Verification (AND)

- Base plus image overlay renders one deterministic effective production
  model with eight services, seven distinct images, five internal networks,
  four named volumes, two loopback application ports, and zero monitoring/
  gateway/worker publications.
- Static mutations reject extra/missing service, wrong digest, public or
  exposed monitoring port, ingestion-network membership, writable root,
  capability, root identity, absent resource/retention/log bound, and missing
  config/health/restart control.
- The exact official images start with read-only config and finite volumes,
  become ready, scrape the synthetic/API target, load rules, send to
  Alertmanager, and stop cleanly.
- Existing private-gateway and hostile-sandbox runtime Gates remain 8/8 and
  the application continues when monitoring services are stopped.

### Done / stop

Done when the exact source, host checker, effective Compose, and runtime
inspection agree and monitoring cannot reach the worker or publish a listener.
Stop if a public dashboard/port, privileged collector, host socket/device, or
unbounded retention/resource is required.

## `DEVOPS-SF20-OPS-TUW-004`

**Title:** Bounded correlated JSON-log operations
**Release/module:** R14 / DEVOPS-SF20-OPS
**Risk/size:** H / M
**Objective:** Reconstruct one synthetic API-to-queue-to-worker operation with
stable safe references while raw identifiers, paths, content, filenames,
tokens, credentials, and trace bodies remain absent.

### Files

- **Modify:** `apps/api/src/common/logging/**`,
  focused queue/extraction dispatch logging and tests,
  `workers/ingestion/app/main.py`, `workers/ingestion/Dockerfile`, worker tests,
  production Compose log settings.
- **May create:** one Python standard-library safe-log helper and test.
- **NOT modify:** HTTP response correlation contract, queue payload schema,
  ingestion identity headers/verification, audit metadata authority,
  dependency/lock files, external log sink, `docs/package/**`.

### Implementation

- Add one language-equivalent SHA-256 reference function that emits
  `ref:<fixed lowercase hex prefix>` and never stores a reversible raw value.
- Extend recursive TypeScript redaction so sensitive key classes are redacted
  and identifier/reference key classes are hashed. Non-bounded free-form
  messages collapse to a safe event name; stack/trace values are redacted.
- Keep the raw request ID only inside the request/response protocol and
  AsyncLocalStorage. JSON logs receive its safe reference.
- Emit one API dispatch bridge event containing the safe queue/version
  reference and safe gateway request reference. The worker emits the matching
  request reference, bounded outcome/status, and duration without path/client
  data.
- Disable Uvicorn access logs. Use Python standard-library JSON output with
  fixed keys and the same hashing algorithm.
- Apply finite Docker local-log size/file/compression settings to all eight
  production services.

### Verification (AND)

- TypeScript and Python golden vectors produce the same safe reference for the
  same synthetic UUID and different references for different UUIDs.
- Recursive/nested arrays and objects remove raw UUID, path, content,
  filename, token, credential, authorization, cookie, secret, stack, and trace
  canaries. Bounded codes/status/method/context remain useful.
- A synthetic queue and worker request reconstructs enqueue → dispatch →
  worker result through safe references, with zero raw canary occurrences.
- Uvicorn command contains `--no-access-log`; production Compose gives every
  service finite log rotation and the checker rejects one missing/unbounded
  service.
- Existing logger, error filter, queue, gateway, worker, and audit regressions
  remain green.

### Done / stop

Done when the safe-reference chain is reconstructable and raw-canary scans are
zero across stdout/stderr/container-log/evidence fixtures. Stop if
correlation requires a raw identifier, path, token, content, or external sink.

## `DEVOPS-SF20-OPS-TUW-005`

**Title:** Real alert fire, delivery, acknowledgement, and recovery drill
**Release/module:** R14 / DEVOPS-SF20-OPS
**Risk/size:** C / L
**Objective:** Prove the exact monitoring runtime and rule set can fire,
deliver, acknowledge, recover, and resolve the six required SF20 incident
classes rather than merely parsing configuration.

### Files

- **Create:** `tools/release/small-firm-alert-drill.mjs`,
  `tools/release/small-firm-alert-drill.spec.mjs`.
- **Modify:** `docs/release/small-firm-operations-runbook.md` for exact drill
  commands/receipt boundary and bounded evidence collection only.
- **May create:** generated temporary configs/metrics in a disposable
  directory during execution; nothing generated is committed.
- **NOT modify:** real staging/host/cloud state, notification credentials,
  production receiver, application business behavior, database schema,
  dependency/lock files, release/go-live authority, `docs/package/**`.

### Implementation

- Launch the exact pinned Prometheus and Alertmanager images on a unique
  internal Docker network with read-only generated config, bounded writable
  storage, and a standard-library synthetic metrics/receiver process.
- Exercise database unavailable, oldest queue age, ClamAV signature stale,
  audit failure, backup stale, and disk pressure one at a time.
- For each scenario require Prometheus fire, Alertmanager delivery to the
  isolated receiver, bounded acknowledgement/silence, healthy metric
  restoration, Prometheus inactive state, and Alertmanager resolved delivery.
- Verify rule/runbook identity and maximum silence in the receipt. Record only
  alert name, bounded states, timestamps, durations, delivery counts, config
  hashes, image digests, and cleanup result.
- Scan configs, API metrics, Alertmanager payload fixture, process output, and
  receipt for synthetic raw UUID/path/content/filename/token/credential
  canaries and require zero.
- Always tear down containers/network/volumes/processes/temp files. A second
  run must start clean.
- Local exact-image proof is `TECHNICAL_PASS`. Deployment readiness remains
  `EXTERNAL_BLOCKED_APPROVED_STAGING_ALERT_DRILL_RECEIPT_REQUIRED` until the
  same six scenarios are witnessed on an approved staging host and delivery
  route.

### Verification (AND)

- Unit tests reject missing scenarios, skipped fire/delivery/ack/recovery/
  resolve states, duplicate or out-of-order transitions, excessive silence,
  wrong image/config hash, raw canary, false external receipt, and incomplete
  cleanup.
- The actual local runtime reports six of six fire/delivery/ack/recovery/
  resolve scenarios, official config/rule validation, zero canaries, and zero
  remaining resources.
- Stopping Prometheus/Alertmanager does not break API/worker correctness; the
  existing gateway/sandbox and integration regressions remain green.
- Evidence remains technical-only and carries the exact external blocked
  staging receipt string.

### Done / stop

Done when the real local runtime passes all six scenarios twice cleanly and
bounded evidence is sealed. Stop if a real external credential/environment
must be invented, cleanup is incomplete, notification content contains
customer/sensitive data, or a local drill is represented as staging proof.

## Verification and evidence contract

- Each TUW leaves one bounded manifest under
  `artifacts/enterprise-dms-oss/<exact-head>/PACK-SF20-04/<TUW-ID>/`.
- Manifests bind base SHA, exact head/tree, source/config/image digests,
  commands, test counts, bounded results, zero-canary result, cleanup result,
  external blocked inputs, and explicit exclusions.
- Node 22/pnpm, Python 3.12/uv, package-freeze, source-map/reuse-first,
  small-firm 19-outcome/seven-PACK/33-TUW, production host/profile/secrets,
  official monitoring validators, logger canaries, gateway/sandbox runtimes,
  database migration round trip, and full integration regression all remain
  green before exact-head CI.
- `needs-human-review` remains attached because OPS-005 is Critical. The owner
  has waived the separate Claude review for this goal; technical verification
  is not waived.
- No PACK-SF20-05 work, dependency, deployment, release, or go-live action is
  authorized inside this PACK.
