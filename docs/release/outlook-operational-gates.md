# Outlook Operational Gates

Status: OPS-OA-01 technical-prepared. No live Microsoft 365 tenant deployment,
tenant admin consent, provider screenshot, private endpoint, production rollout,
or customer mailbox evidence is authorized by this artifact.

Pack: PACK-OPS-OA-01

## Purpose

Implement the operational gate layer that sits above the completed OA00-OA11
Outlook Add-in work. The add-in remains technically prepared, but live Outlook
operation stays disabled until external evidence references, operator approval,
rollback rehearsal, deploy-time checks, and runtime feature gates all pass.

## Architecture Layers

| Layer | Implementation | Boundary |
|---|---|---|
| External Evidence Gate | Opaque evidence refs for manifest validation, Graph/admin consent, operator approval, and disable/remove rehearsal | Stores refs only, never evidence bodies |
| Deploy-Time Gate | `pnpm outlook:operational:check` | Blocks production when enabled features lack refs or ring policy |
| Runtime Gate | `OutlookOperationalGateService` | Centralizes all `OUTLOOK_*` feature decisions |
| Ring Rollout Gate | `R0_ADMIN_ONLY` through `R3_PRODUCTION` policy | Lower rings cannot enable higher-ring features |
| Rollback / Kill Switch | Feature flags plus Microsoft 365 Integrated Apps disable/remove runbook | Runtime kill switch is independent from admin-console assignment |

## Evidence Reference Contract

Allowed reference formats:

- `EVREF-OUTLOOK-002-YYYYMMDD-OPAQUEID`
- `EVREF-OUTLOOK-003-YYYYMMDD-OPAQUEID`
- `APPROVAL-OUTLOOK-OPERATOR-YYYYMMDD-OPAQUEID`
- `REHEARSAL-OUTLOOK-REMOVE-YYYYMMDD-OPAQUEID`

The reference value must not encode tenant domains, admin URLs, consent URLs,
provider paths, account identifiers, mailbox identifiers, screenshot names,
folder names, filenames, tokens, cookies, or private endpoints.

## Required Runtime Inputs

| Input | Meaning | Required when |
|---|---|---|
| `OUTLOOK_ROLLOUT_RING` | `R0_ADMIN_ONLY`, `R1_PILOT_PRACTICE`, `R2_BROADER_PILOT`, or `R3_PRODUCTION` | Any Outlook feature is enabled in enforced production mode |
| `OUTLOOK_OPERATOR_APPROVAL_REF` | Opaque operator approval ref | Any Outlook feature is enabled in enforced production mode |
| `OUTLOOK_MANIFEST_VALIDATION_REF` | Opaque `EV-OUTLOOK-002` ref | Any Outlook feature is enabled in enforced production mode |
| `OUTLOOK_GRAPH_CONSENT_REF` | Opaque `EV-OUTLOOK-003` ref | Graph attachment acquisition is enabled |
| `OUTLOOK_DISABLE_REMOVE_REHEARSAL_REF` | Opaque rollback rehearsal ref | Any Outlook feature is enabled in enforced production mode |
| `NODE_ENV=production` | Runtime production signal | Automatically enforces evidence/ring gates |
| `OUTLOOK_OPERATIONAL_ENFORCE` | Runtime evidence/ring enforcement switch | Non-production enforced rehearsal |
| `OUTLOOK_AUDIT_AVAILABLE=true` | Explicit audit availability affirmation | Required for any enabled Outlook feature in enforced mode |

## Runtime Feature Gates

All runtime gates default to disabled unless their exact environment variable is
`true`.

| Feature | Flag | Notes |
|---|---|---|
| `ADDIN_BOOTSTRAP` | `OUTLOOK_ADDIN_ENABLED` | Global add-in API gate |
| `AUTH_EXCHANGE` | `OUTLOOK_AUTH_EXCHANGE_ENABLED` | Session exchange gate |
| `GRAPH_ATTACHMENT_ACQUISITION` | `OUTLOOK_GRAPH_ATTACHMENT_ACQUISITION_ENABLED` | Requires Graph consent ref in enforced mode |
| `SMART_ALERTS` | `OUTLOOK_SMART_ALERTS_ENABLED` | Lower rings are prompt/soft-first |
| `SEND_FILE` | `OUTLOOK_SEND_FILE_ENABLED` | Requires explicit user action and audit |
| `DOCUMENT_INSERTION` | `OUTLOOK_DOCUMENT_INSERTION_ENABLED` | Internal-reference-only path remains enforced |
| `FOLDER_MAPPING` | `OUTLOOK_FOLDER_MAPPING_ENABLED` | R2+ only |
| `AUTOFILE` | `OUTLOOK_AUTOFILE_ENABLED` | R3 only in this no-migration implementation |

## Ring Policy

| Ring | Allowed features |
|---|---|
| `R0_ADMIN_ONLY` | `ADDIN_BOOTSTRAP`, `AUTH_EXCHANGE`, `SMART_ALERTS` |
| `R1_PILOT_PRACTICE` | R0 plus `GRAPH_ATTACHMENT_ACQUISITION`, `SEND_FILE`, `DOCUMENT_INSERTION` |
| `R2_BROADER_PILOT` | R1 plus `FOLDER_MAPPING` |
| `R3_PRODUCTION` | All approved Outlook operational features |

`AUTOFILE` is held until `R3_PRODUCTION` because the existing flag represents a
server-side job path, not a separate suggestion-only mode.

## Deploy-Time Gate

`pnpm outlook:operational:check -- --target production --mode enforce --format compact`
must fail when:

- a subordinate Outlook feature is enabled while `OUTLOOK_ADDIN_ENABLED` is not enabled;
- any required opaque ref is missing or malformed;
- `OUTLOOK_AUDIT_AVAILABLE=true` is not set while any Outlook feature is enabled;
- `GRAPH_ATTACHMENT_ACQUISITION` is enabled without `OUTLOOK_GRAPH_CONSENT_REF`;
- an enabled feature is not allowed in the selected ring;
- `docs/package/**` has a diff;
- operational evidence files contain concrete tenant/admin/provider URLs,
  tenant domains, GUID-shaped tenant/client refs, tokens, cookies, secrets, or
  private endpoints.

The checker never prints raw evidence ref values.

## Runtime Gate

`OutlookOperationalGateService` is the only production code surface allowed to
read Outlook operational environment variables. Outlook services ask the gate
for feature decisions before any Graph/provider/session/mutation side effect.
Missing feature flags deny. `NODE_ENV=production` automatically enables
operational enforcement, even if `OUTLOOK_OPERATIONAL_ENFORCE` is omitted.
Enforced mode additionally validates ring, evidence refs, ring-feature policy,
and explicit `OUTLOOK_AUDIT_AVAILABLE=true`.

## Redaction Gate

`pnpm outlook:redaction:check` scans operational Outlook files and changed files.
It excludes intentional test fixtures but checks docs, release checkers,
workflow wiring, and production source files for concrete tenant/admin/provider
evidence and secrets.

## Rollback Contract

Disable Vault runtime features in this order:

1. `OUTLOOK_AUTOFILE_ENABLED=false`
2. `OUTLOOK_FOLDER_MAPPING_ENABLED=false`
3. `OUTLOOK_DOCUMENT_INSERTION_ENABLED=false`
4. `OUTLOOK_SEND_FILE_ENABLED=false`
5. `OUTLOOK_GRAPH_ATTACHMENT_ACQUISITION_ENABLED=false`
6. `OUTLOOK_SMART_ALERTS_ENABLED=false`
7. `OUTLOOK_AUTH_EXCHANGE_ENABLED=false`
8. `OUTLOOK_ADDIN_ENABLED=false`

Microsoft 365 Integrated Apps assignment reduction, disable, or remove remains
an external admin action recorded by opaque rollback ref only.

## Migration Decision

No migration is required for OPS-OA-01. The current implementation assumes a
deployment-wide rollout ring and Microsoft 365 Integrated Apps group assignment
as the external audience source of truth. A tenant-scoped RLS table should be
added only if one Vault deployment must operate different Outlook rings for
different internal tenants.

## Verification Commands

- `pnpm outlook:redaction:check`
- `pnpm outlook:operational:check -- --target pr --mode advisory`
- `pnpm outlook:operational:check -- --target production --mode enforce`
- `pnpm --filter @amic-vault/api test -- outlook-operational-gate`
- `pnpm exec vitest run tools/release/outlook-operational-policy.spec.ts`
- `pnpm outlook:deployment:check`
- `pnpm outlook:verification:check`
- `pnpm docs:frozen`
- `pnpm backlog:validate`
- `git diff --check`
- `git diff --name-only -- docs/package`

## Stop Conditions

Stop rollout and disable Outlook gates if any runtime path bypasses
`OutlookOperationalGateService`, calls Graph/provider before a gate allow
decision, stores raw Microsoft 365 tenant evidence, logs mailbox/provider data,
opens external sharing before the R11 policy gate, or cannot write bounded audit
for a mutating/provider-touching Outlook action.
