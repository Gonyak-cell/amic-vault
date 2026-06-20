# Matter App To Vault Integration Contract

Date: 2026-06-18

Related TUW: DMS-UX-003 Matter App Source-Of-Truth Contract

## Purpose

Vault document operations must be Matter-centric, but Vault must not create a separate Matter Code namespace. The currently developed Matter app is the canonical source of truth for Matter Code and matter profile identity. Vault may keep a local projection for permission checks, document joins, search facets, audit refs, and offline-safe display, but that projection is not a competing matter registry.

## Source-Of-Truth Rule

- Canonical Matter Code comes from the Matter app.
- Canonical matter display name, client, status, practice group, responsible lawyer, and lifecycle state come from the Matter app or a Matter app-approved projection.
- Vault upload, filing, browse, search-scope shortcuts, and document metadata flows must resolve a Matter Code through this contract before allowing a matter-scoped document mutation.
- If a later ADR changes ownership, the ADR must update this file, `docs/ui/enterprise-dms-ux-tuw-plan.md`, `docs/ui/production-ui-inventory.md`, and the UI PR checklist together.

## Current Local Evidence

Local workspace search found the Matter app material under:

- `/Users/jws/Documents/Codex/Law Firm OS/packages/matter`
- `/Users/jws/Documents/Codex/Law Firm OS/contracts/matter-core-contract.json`
- `/Users/jws/Documents/Codex/Law Firm OS/workbook/matter_dev_docs`

The current `packages/matter` package appears descriptor/contract-oriented rather than a production runtime API. Therefore PR-A must not assume a live Matter app endpoint exists until that API is explicitly supplied.

## Integration Modes

| Mode | Use | Production rule |
| --- | --- | --- |
| `matter_app_api` | Vault calls a Matter app API for lookup and optional profile refresh. | Preferred production mode once the Matter app endpoint is available. |
| `matter_app_event_projection` | Matter app emits events that update Vault's local matter projection. | Allowed if sync freshness and conflict handling are implemented. |
| `vault_projection_only` | Vault reads its existing local `matters` projection. | Dev/test fallback only unless an ADR states this projection is the approved Matter app mirror. |
| `unconfigured` | Matter app lookup/projection cannot be trusted. | Fail closed for upload and other matter-scoped mutations. |

Runtime guard:

- `matter_app_api` and `matter_app_event_projection` are not considered active unless
  server-side `MATTER_APP_SOURCE_CONFIGURED=true` and
  `MATTER_APP_RUNTIME_READY=true` are set. Browser-visible display may also use
  `NEXT_PUBLIC_MATTER_APP_SOURCE_MODE`,
  `NEXT_PUBLIC_MATTER_APP_SOURCE_CONFIGURED=true` and
  `NEXT_PUBLIC_MATTER_APP_RUNTIME_READY=true`.
- `MATTER_APP_RUNTIME_READY` / `NEXT_PUBLIC_MATTER_APP_RUNTIME_READY` means the approved Matter app lookup
  API or event projection is actually reachable, fresh enough for upload, and
  guarded by its owner. A descriptor-only Matter package or planning contract
  does not satisfy this flag.
- `vault_projection_only` is only a non-production fallback and additionally requires `NEXT_PUBLIC_ALLOW_VAULT_PROJECTION_MATTER_SOURCE=true`.
- Server-side `vault_projection_only` additionally requires
  `ALLOW_VAULT_PROJECTION_MATTER_SOURCE=true`.
- Production builds must treat `vault_projection_only` as unconfigured unless a later ADR explicitly changes this contract.
- `MATTER_APP_STALENESS_MAX_SECONDS` defaults to 900 seconds. If
  `MATTER_APP_SOURCE_UPDATED_AT` or `NEXT_PUBLIC_MATTER_APP_SOURCE_UPDATED_AT`
  is older than that threshold, mutation-capable source modes are unconfigured.

## Implemented Runtime Surface

Current repo-side runtime endpoints:

- `GET /v1/integrations/matter-app/status`
- `GET /v1/integrations/matter-app/matter-lookup?q=<text>&pageSize=<n>`

The status endpoint is the backend source for mode, configured/runtime-ready,
freshness, production projection fallback, and upload-authoritative state. The
lookup endpoint returns safe empty results when the source is unavailable or
normal UI input is UUID-shaped. When available, lookup reads the local Matter
projection only after SQL-stage Matter membership and ethical-wall filters are
applied.

## Canonical Matter Fields

Vault needs these fields for DMS operations:

| Field | Required | Notes |
| --- | --- | --- |
| `matterAppMatterId` | yes | Stable canonical Matter app identifier. May differ from Vault local `matter_id`. |
| `matterCode` | yes | Human-facing operational code. Unique in the Matter app tenant/customer scope. |
| `matterName` | yes | Display name. |
| `clientId` / `clientDisplayName` | yes | Use Matter app/client source-of-truth mapping. |
| `status` | yes | Must identify upload-blocking states such as closed, archived, disposal, or locked states. |
| `practiceGroup` | recommended | Supports filtering and ownership. |
| `responsibleLawyerId` / display name | recommended | Supports upload metadata and browse columns. |
| `openedAt` / `closedAt` | recommended | Supports search and lifecycle filters. |
| `legalHold` | conditional | Required if Matter app owns hold state; otherwise Vault Records remains owner. |
| `sourceUpdatedAt` | yes | Used for stale-data handling. |
| `sourceRevision` | recommended | Used for conflict detection and audit refs. |

## Lookup Contract

The picker-facing lookup must support:

- search by `matterCode`
- search by matter display name
- optional search by client display name
- status filtering for upload-eligible matters
- permission-scoped result construction before returning labels/counts
- bounded pagination
- safe empty, denied, unavailable, and stale states

Normal users must not type or select a Vault internal UUID. Internal identifiers may appear only in approved admin/security inspector contexts.

## Upload Resolution Contract

Before `POST /matters/:matterId/documents` or any successor upload endpoint can run:

1. The user selects a canonical Matter app matter by code/name.
2. Vault resolves that canonical matter to its local projection or creates/refreshes the projection through an approved sync path.
3. Vault checks upload permission with the resolved matter context.
4. Vault blocks upload if the Matter app runtime is not ready, lookup is unavailable, the projection is stale beyond policy, the matter is not upload-eligible, or permission is not `ALLOW`.
5. Vault records reference-only audit metadata.

## Staleness And Conflict Policy

- Read-only display may show a stale marker when the projection is stale but not security-sensitive.
- Upload, filing, metadata mutation, version upload, and document action flows must fail closed when the Matter app projection is stale beyond the approved threshold.
- Duplicate Matter Code conflicts must block selection and escalate to admin/operator remediation.
- Deleted/closed/archived/disposal matters must not accept upload unless a later policy explicitly permits a narrow exception.

## Permission Boundary

Matter app owns canonical matter identity and profile. Vault still owns Vault document permissions, ethical-wall filtering, file access, document audit, records actions, and AI-prep eligibility. Matter app data must be consumed before query/result construction, not post-filtered on the client.

## Audit And Logging

Allowed audit metadata:

- source mode
- Matter app matter reference id or hash/ref
- Vault projection matter id
- matter code hash or bounded code ref when approved
- source revision
- stale/fresh flag
- permission decision ref

Forbidden audit/log metadata:

- document body
- raw source text
- raw prompts or model responses
- secrets, tokens, cookies, credentials
- unbounded Matter app payloads

## UI Requirements

- The matter picker must label itself as selecting a Matter app matter when relevant copy is visible.
- If the Matter app contract is not configured, upload surfaces show setup/unavailable state, not a free-form Matter ID field.
- If a local Vault projection is used in dev/test, UI must not claim a production Matter app connection.
- `/matters` display data must be consistent with the canonical Matter app source or marked as an unconfigured/projection state.

## Verification

Minimum checks for the first implementation bundle:

- Matter app unconfigured -> upload disabled with safe state.
- Allowed canonical matter -> upload flow may proceed to Vault permission check.
- Inaccessible matter -> no label/count leakage.
- Stale projection -> upload blocked.
- Local UUID typed into normal picker -> rejected or impossible.
- Audit output remains reference-only.

## Open Questions

1. What is the Matter app production API base URL and authentication method?
2. Does Matter app provide direct lookup, event stream, database projection, or all three?
3. Which system owns matter membership and upload eligibility: Matter app, Vault, or a synced policy projection?
4. Which system owns legal hold at matter level?
5. What staleness threshold is acceptable for upload-blocking decisions?
