# Operations, infrastructure, search, and editor source map

The candidates in this map are `CONDITIONAL_NOT_AUTHORIZED`. Their official
URLs or names do not supply code, fixtures, dependencies, runtime inputs, or
deployment authority: no row has both an exact source/test pin and its required
operational trigger.

| Candidate | Portfolio | Vault evidence anchor | Required trigger |
|---|---|---|---|
| OpenTelemetry Collector | OSS-09 | metrics/queue metrics and observability integration | telemetry redaction and trace continuity approval |
| OpenTofu | OSS-10 | development compose and RLS evidence | cloud/region authority and IaC scope |
| CloudNativePG | OSS-10 | backup-drill evidence schema | production DB topology/operator authority |
| pgBackRest | OSS-10 | backup-drill evidence schema | restore, key-loss and residency proof |
| OpenBao | OSS-10 | tenant S3 storage adapter and immutable-original test | secret/key-custody authority |
| OpenSearch | OSS-11 | permission-first PG search regression | ADR-006 measured trigger and isolation proof |
| Collabora Online | OSS-11 | edit lifecycle, lock and audit service | ADR-018 plus R11 WOPI callback/lock/audit proof |
| PgBouncer | OSS-11 | pg-boss runtime-options test | measured connection-budget exceedance and tenant-GUC parity |

OpenSearch remains deferred by `docs/adr/ADR-006.md`; Collabora/WOPI remains a
non-runtime evaluation under `docs/adr/ADR-018-wopi-evaluation.md`. A future
source pin alone cannot override authority, security, maintenance, exit, or
operational-trigger requirements. Every row is intentionally ineligible for
adoption in the current scope.

The corresponding `security/oss-adoption-decisions.yml` rows are all
`REJECTED` for this scope. A future decision may not advance to L2/L3 merely
by improving its TCO scores: the hard veto and complete adoption obligations
must be resolved first.
