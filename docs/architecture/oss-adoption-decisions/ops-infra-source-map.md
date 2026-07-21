# Operations, infrastructure, search, and editor source map

The mapped candidates are deliberately `conditional-not-authorized`. Their
official URLs are preserved in the source map, but no candidate currently has
an exact source/test pin plus an approved operational trigger. Consequently,
they supply no code, fixture, dependency, runtime or deployment input.

| Candidate | Portfolio | Vault evidence anchor | Blocking trigger |
| --- | --- | --- | --- |
| OpenTelemetry Collector | OSS-09 | bounded metrics/queue metrics and observability integration test | telemetry redaction and trace continuity approval |
| OpenTofu | OSS-10 | dev compose and RLS integration evidence | cloud/region authority and IaC scope |
| CloudNativePG | OSS-10 | backup-drill evidence schema | production DB topology/operator authority |
| pgBackRest | OSS-10 | backup-drill evidence schema | restore, key-loss and residency proof |
| OpenBao | OSS-10 | S3 adapter and tenant storage test | secret-management/key-custody authority |
| OpenSearch | OSS-11 | permission-first PG search and regression suite | ADR-006 measured trigger plus isolation proof |
| Collabora Online | OSS-11 | editing lifecycle, lock and audit chain | ADR-018 go criteria and R11 WOPI proof |
| PgBouncer | OSS-11 | pg-boss runtime options test | measured connection-budget exceedance |

The current OpenSearch decision is explicitly deferred by [ADR-006](../../adr/ADR-006.md).
The current WOPI/co-editor decision is explicitly not a runtime implementation
by [ADR-018](../../adr/ADR-018-wopi-evaluation.md). The candidate map must not
be read as an exception to either decision.

All eight operational rows are `REJECTED` for the current scope in
`security/oss-adoption-decisions.yml`. A future exact source pin alone cannot
override their listed trigger, security, authority, maintenance, or exit veto.
