# Enterprise DMS UI Release Evidence

Status: TEMPLATE - REFS ONLY - NO PRIVATE EVIDENCE COMMITTED
Related TUW: DMS-UX-808, DMS-UX-809, DMS-UX-810, DMS-UX-811

This template is the canonical release evidence package for the Matter-first
DMS UI release. It records only evidence references. Do not record customer file
contents, document titles from real matters, matter descriptions, secrets,
private endpoints, screenshots with confidential matter data, raw prompts, raw
source/source text, model responses, cookies, tokens, local storage dumps, or
provider-console metadata.

## 1. Release Header

| Field | Evidence ref or value |
| --- | --- |
| Release name / PR stack |  |
| Commit SHA range |  |
| Production or staging target ref |  |
| Operator owner |  |
| Security owner |  |
| Legal-data owner |  |
| Customer-scope owner |  |
| Rollback owner |  |
| Started at |  |
| Completed at |  |
| Decision | `PASS` / `HOLD` / `ROLLBACK` |
| Evidence register ref |  |

## 2. DMS-UX-808 Evidence Package

| Evidence ID | Required evidence | Required refs | Owner | Status |
| --- | --- | --- | --- | --- |
| EV-DMS-UI-001 | PR stack and commit SHAs | PR URLs, base branches, head SHAs | Operator |  |
| EV-DMS-UI-002 | Automated gate command receipts | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm check:production-ui-literals`, `pnpm ui:production-smoke`, `pnpm check:ui-pr-checklist`, `git diff --check`, and CI refs for `verify`, `db-integration`, `docker-build`, `python-worker` | Operator |  |
| EV-DMS-UI-003 | Route inventory refs | `docs/ui/production-ui-inventory.md`, `docs/ui/enterprise-dms-ux-route-capability-inventory.md`, and matching `apps/web/src/lib/features.ts` route policy ref | Security owner |  |
| EV-DMS-UI-004 | Authenticated main loop smoke receipt | Login -> Matter Code selection -> upload -> post-upload processing state -> matter-scoped file list -> document detail -> search -> preview/version -> records/audit links | Operator |  |
| EV-DMS-UI-005 | Negative auth smoke receipt | Non-member, wall-blocked, non-admin, denied upload, denied download, denied preview, denied search, stale-content clearing | Security owner |  |
| EV-DMS-UI-006 | Responsive and accessibility receipt | 1440px, 768px, 375px, keyboard navigation, focus visibility, accessible names, active `aria-current`, empty/error readable text | Operator |  |
| EV-DMS-UI-007 | Audit refs | Upload, download, search, records, and AI prep file-organization events where available; refs only, no document body or raw AI data | Security owner |  |
| EV-DMS-UI-008 | Deferred item ledger | Deferred item, owner, risk, follow-up TUW, release blocker status | Operator |  |

## 3. DMS-UX-809 Rollout Checklist

Release cannot pass unless each row has an evidence ref or an approved deferral
with owner and follow-up TUW.

| Check ID | Required production behavior | Evidence ref | Owner | Result |
| --- | --- | --- | --- | --- |
| DMS-ROLL-001 | Matter Code selection before upload; no free-floating upload path |  | Operator |  |
| DMS-ROLL-002 | Upload and post-upload processing state distinguish uploaded, extraction pending, indexing pending, AI prep file-organization pending, failed, and unavailable |  | Operator |  |
| DMS-ROLL-003 | Matter-scoped file list shows real permitted documents only, with safe empty and unavailable states |  | Operator |  |
| DMS-ROLL-004 | Document detail exposes profile, preview, controlled download, version, governance, and workflow state without raw refs as primary labels |  | Operator |  |
| DMS-ROLL-005 | Title/body/metadata search supports safe no-results state and permission-bound snippets/facets |  | Security owner |  |
| DMS-ROLL-006 | Records, audit, walls, and admin governance routes are visible only to allowed roles |  | Security owner |  |
| DMS-ROLL-007 | Workflow and action queue state is based on real data only; no fake tasks, counts, people, matters, or dates |  | Operator |  |
| DMS-ROLL-008 | Admin settings and integrations render setup, unavailable, connected, and disabled states without sample providers or fake credentials |  | Operator |  |
| DMS-ROLL-009 | Negative auth and wall-blocked cases fail closed and clear stale content |  | Security owner |  |
| DMS-ROLL-010 | AI Prep remains file organization prep only; legal analysis, summary, external model routes, raw prompt/source/model-response storage or display remain excluded |  | Legal-data owner |  |

## 4. DMS-UX-810 Rollback Plan

Rollback owner must be named before widening release traffic. Use these controls
without hard delete and without altering immutable originals or audit history.

| Control ID | Rollback control | Evidence ref | Owner |
| --- | --- | --- | --- |
| DMS-RB-001 | Route visibility policy can hide `/files`, `/documents/[id]`, `/search/folders`, `/records`, `/audit`, `/walls`, `/integrations`, `/integrations/outlook`, `/enterprise`, and admin routes through feature/role policy |  | Operator |
| DMS-RB-002 | Matter app source flags can block production upload/browse when canonical Matter source is unavailable: `NEXT_PUBLIC_MATTER_APP_SOURCE_MODE`, `NEXT_PUBLIC_MATTER_APP_SOURCE_CONFIGURED`, `NEXT_PUBLIC_ALLOW_VAULT_PROJECTION_MATTER_SOURCE` |  | Operator |
| DMS-RB-003 | Worker flags can stop unsafe processing: `AI_PREP_ENABLED`, `AI_PREP_QUEUE_WORKER_ENABLED`, `LOCAL_GEMMA_ENABLED`, and `AI_SUMMARY_GEMMA_ENABLED=false` |  | Operator |
| DMS-RB-004 | Database rollback uses reviewed migration rollback or forward-fix only; no hard delete and no audit mutation |  | Security owner |
| DMS-RB-005 | Storage rollback preserves immutable originals, versions, hashes, and tenant prefixes |  | Security owner |
| DMS-RB-006 | Monitoring refs remain available for rollback decisions and incident review |  | Operator |

## 5. DMS-UX-811 Production Monitor

Monitor rows require a metric/log query ref, owner, threshold, and rollback
trigger. Metrics must be scoped to approved tenants or aggregate-safe views.

| Monitor ID | Signal | Evidence ref | Owner | Rollback trigger |
| --- | --- | --- | --- | --- |
| DMS-MON-001 | Upload failure rate and unsupported file type rate |  | Operator | Sustained spike or denied uploads not matching permission policy |
| DMS-MON-002 | Extraction/OCR pending age and failure rate |  | Operator | Queue age exceeds approved SLA or failures cluster by file type |
| DMS-MON-003 | Search latency, no-result rate, and denied-search spikes |  | Security owner | Permission-bound search fails, leaks metadata, or latency exceeds SLA |
| DMS-MON-004 | Permission denied, ethical wall blocked, and tenant isolation errors |  | Security owner | Unexpected allow, cross-tenant signal, or denied spike without release explanation |
| DMS-MON-005 | AI prep queue pending, failed, rejected, and stale counts limited to file organization prep |  | Legal-data owner | Legal analysis/summary/external route/raw-data signal appears or queue health fails |
| DMS-MON-006 | Audit write failures |  | Security owner | Any audit write failure for document, search, records, permissions, or AI prep action |
| DMS-MON-007 | Storage write/read failures, duplicate hash, and integrity mismatch signals |  | Security owner | Immutable original, version, tenant prefix, or hash integrity invariant fails |
| DMS-MON-008 | Outlook and future Office/OneDrive integration status gate failures |  | Operator | Integration UI claims connected or filed state before approved API success |

## 6. Deferred Items

| Deferred item | Reason | Owner | Follow-up TUW | Release blocker? |
| --- | --- | --- | --- | --- |
|  |  |  |  | `YES` / `NO` |

