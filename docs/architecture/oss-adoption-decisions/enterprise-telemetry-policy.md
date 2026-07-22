# Enterprise telemetry policy decision — OSS09-TEL001

Status: `POLICY_IMPLEMENTED_COLLECTOR_NOT_ADOPTED` (2026-07-22)

## Source-first result

| Source | Local clone pin | License | Baseline | Reuse decision |
|---|---|---|---|---|
| OpenTelemetry Collector | `v0.157.0` / `4908404e59e544297b989a6961ee918b6f84b606` / tree `7854e11f6e5048b50ddb21d2f3f08a51e4a7c266` | Apache-2.0, `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30` | `go test ./otelcol` cannot run because Go is unavailable (exit 127); no pass is claimed | L0 behavioral reference only; no source, fixture, binary or config copied |
| OTel semantic conventions | `v1.43.0` / `89aae438b3b3b0a8dd33003c9d70592baf7dbd0d` / tree `c26a2bc0c9d9929f1a875492db1c7a6aecbb6779` | Apache-2.0, `c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4` | documentation source inspected locally | L0 field-name/error-class reference only; no dependency added |

The Collector redaction source/test pair is pinned at blobs
`5ac3ba4b17706e2b46e941b78cfbb559b6a247cc` and
`5308cb9de4cce6673df9a5017bc279738eb0e19c`. It informed the requirement to
make redaction a testable contract rather than a configuration convention. The
semantic-conventions error guidance was used to select bounded error classes;
Vault deliberately does not export exception messages.

## Vault result

- `TelemetryPolicy` allows only 14 operational attribute names and enforces
  route templates, fixed queue/error/state enums, length limits and a
  64-distinct-value budget per key.
- Unknown/sensitive fields and raw UUID/numeric/opaque path segments fail
  before later instrumentation can emit them. The checker has a zero baseline
  for synthetic raw tenant/body/bearer-token canaries.
- The current code has 54 pre-existing raw-identifier structured-log fields.
  They are an explicit, per-path/key/count baseline. Any increase fails the
  quality gate; reducing/removing them is allowed in a separately scoped
  remediation.
- Existing Prometheus metrics use bounded route-normalization and queue names;
  they remain unchanged here. A Collector, tracing SDK, exporter, endpoint,
  sink or SIEM delivery is not selected by this decision.

## Consequence

`DEVOPS-OSS09-TEL-TUW-002~004` remain blocked pending an approved internal
sink, retention period, network/exposure boundary and operational owner. The
Collector source pin is not permission to deploy it, and local policy tests do
not prove telemetry delivery, staging, release or go-live.
