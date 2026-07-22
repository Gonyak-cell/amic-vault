# PACK-OSS09-01 — Telemetry policy and trace continuity

Status: canonical post-R14 extension under `USER-UMBRELLA-AUTONOMY-20260721`.
This is the canonical form of `PROPOSED-PACK-OSS09-01`, based on merged
`origin/main` `21b5564b3ce7d6b4e6f247a707e93266b23df110`. Its prerequisite is
the merged queue authority `DEVOPS-OSS01-QUE-TUW-004`; it is independent of
the blocked scanner adapter and blocked identity-topology selection.

## Scope and invariants

- Telemetry is an operational signal only. It cannot be an authorization,
  audit, tenant-routing, document-existence, or legal-hold signal.
- Raw tenant/user/document/matter/file/version/email/node identifiers,
  storage keys/URIs, filenames, query/snippet/body/prompt/text, SQL,
  authorization/cookie/password/token and exception detail are forbidden from
  all new trace, metric and telemetry-log attributes.
- Vault's existing metrics remain L0 no-copy authority. The OTel Collector
  source is a local research clone outside the product tree; no Collector,
  exporter, upstream source, fixture, dependency, service, endpoint, sink,
  credential, deployment or external operation is added by this PACK.
- Existing structured-log raw-identifier fields are explicitly measured as
  54 legacy field occurrences. Their baseline may decrease but cannot
  increase; this PACK does not silently alter unrelated operational logs.

## TUW order

| Order | ID | Risk | Depends on | Objective |
|---:|---|---|---|---|
| 1 | `DEVOPS-OSS09-TEL-TUW-001` | H | `DEVOPS-OSS01-QUE-TUW-004` | enforce telemetry semantic, redaction and cardinality contract |
| 2 | `DEVOPS-OSS09-TEL-TUW-002` | H | TEL-001 + approved sink/retention | pin internal-only Collector/metrics/trace stack |
| 3 | `DEVOPS-OSS09-TEL-TUW-003` | H | TEL-002 | add bounded API/DB/storage/audit instrumentation |
| 4 | `DEVOPS-OSS09-TEL-TUW-004` | H | TEL-003 | prove cross-process trace propagation without data leakage |

## `DEVOPS-OSS09-TEL-TUW-001`

- **Files create:** `apps/api/src/common/telemetry/telemetry-policy.ts` and
  spec, `security/telemetry-data-policy.yml`,
  `tools/quality/check-telemetry-policy.mjs` and spec, and the decision
  evidence document.
- **Files modify:** canonical PACK/backlog/ledger/source-provenance records
  and CI quality invocation only.
- **Files NOT-modify:** existing metric labels/counters, raw business logs,
  audit schema/semantics, permission or RLS behavior, packages/lockfiles,
  Collector config, runtime topology, external sinks and `docs/package/**`.
- **Implementation:** allow only bounded service, operation, route template,
  result, error class, queue, parser/security state and numeric operational
  fields. Reject unknown keys, sensitive identifiers, dynamic route segments,
  free-form exception values and values beyond the 64-per-key budget. Scan
  logger/span/metric callsites, fail on source canaries or new raw-identifier
  log fields, and report the exact legacy baseline.
- **Verification (AND):** allow/deny fixtures, raw ID/content/token canary
  detection, raw route/queue/error rejection, cardinality overflow, source
  callsite inventory, existing metrics tests, source-map/reuse-first,
  backlog/frozen-doc and diff checks. CI runs both the policy checker and its
  node-test suite.
- **Done:** future instrumentation has a tested policy API and a CI gate;
  sensitive canary baseline is zero; existing raw logs are visible debt rather
  than silently normalized.
- **Stop:** a useful SLO needs a raw confidential identifier, a sink needs
  content, or an operator proposes telemetry as an authorization/audit
  replacement. Redesign aggregation first.

## `DEVOPS-OSS09-TEL-TUW-002`

- **Files create/modify:** only a separately pinned internal Collector,
  Prometheus and trace configuration after the required sink/retention
  authority is recorded.
- **Files NOT-modify:** public ingress, broad network egress, existing audit
  authority, dependencies/locks without an exact pin, `docs/package/**`.
- **Verification (AND):** exact source/artifact/license provenance,
  redaction/filter/memory/batch/retry/backpressure tests, no public listener,
  and no telemetry payload canary.
- **Stop:** approved internal sink, retention, operational owner or
  export-network boundary is absent.

## `DEVOPS-OSS09-TEL-TUW-003`

- **Files create/modify:** only registered bounded instrumentation adapters
  and tests after TEL-002. Auto-instrumentation that can capture SQL, request
  body, storage key or exception text is prohibited.
- **Verification (AND):** lifecycle tests prove API/DB/storage/audit signals
  preserve the contract and all sensitive canaries remain zero.
- **Stop:** an official dependency is unpinned or any instrumentation needs
  raw SQL/body/identifier capture.

## `DEVOPS-OSS09-TEL-TUW-004`

- **Files create/modify:** only bounded trace-context metadata and
  API→queue→worker/scanner continuity tests after TEL-003.
- **Verification (AND):** synthetic span tree, replay/mixed-tenant negatives,
  no baggage/content/identifier leakage and zero-canary report.
- **Stop:** trace propagation becomes an authorization signal or requires a
  body/content/raw identifier.

## Evidence boundary

Evidence is limited to source commit/tree/license hashes, synthetic canaries,
bounded checker output and local test result codes under
`artifacts/enterprise-dms-oss/<source-sha>/PACK-OSS09-01/<tuw>/`. Local policy
or source evidence does not claim Collector deployment, SIEM delivery,
staging, release or go-live.
