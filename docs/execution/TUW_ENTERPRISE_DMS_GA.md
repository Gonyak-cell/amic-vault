# Enterprise DMS GA Execution Ledger

Date: 2026-06-20

Source package: `/Users/jws/Documents/Codex/dms-enterprise/AMIC_Vault_DMS_Roadmap_Package/`

Target base: `7c8bd74806e63d818c671f4b8a3a32a14ccee33f`

## Scope Boundary

This document tracks repo-side implementation for DMS-GA-001 through DMS-GA-705. It does not grant production release signoff. Production or customer-scope release remains HOLD until staging/canary receipts and owner signoff rows are complete.

Excluded from this GA execution lane:

- external AI or legal-analysis features
- raw prompt, raw source, or model-response storage/display
- customer document content in committed evidence
- secret, private endpoint, token, cookie, or credential material
- production release approval without owner evidence refs

## Current Reclassification

| PR lane | DMS-GA IDs | Current repo status | Completion boundary |
| --- | --- | --- | --- |
| PR-0A Release reconciliation | DMS-GA-001, DMS-GA-002 | Reconciled in `codex/dms-ga0-reconcile` at target head `7c8bd748`; guards/docs/routes validated locally. | Repo-side done for GA0; external launch signoff remains separate. |
| PR-0B Release receipts | DMS-GA-003, DMS-GA-004 | Not repo-implementable alone. | Requires approved staging/canary `release:dms-smoke -- --json` receipt and negative-auth evidence refs. |
| PR-1A Matter runtime | DMS-GA-101, DMS-GA-102, DMS-GA-105, DMS-GA-404 | Implemented on `codex/dms-ga1-matter-runtime`; pending review/merge. | API status/lookup, permission-scoped Matter Code picker, source freshness, upload eligibility flags, contract/runbook docs. |
| PR-1B Upload preflight | DMS-GA-103, DMS-GA-104 | Pending next PR. | Server-side Matter app resolution, lifecycle/staleness gate, permission/wall mutation gate, short-lived preflight ref. |
| PR-1C Upload metadata UX | DMS-GA-106 | Pending. | Tenant taxonomy-backed upload metadata/security profile; no fake taxonomy claims. |
| PR-1D Duplicate decision | DMS-GA-107 | Pending. | Persisted staged duplicate/version/cancel decision before final upload action. |
| PR-2A to PR-2C Document cabinet/detail | DMS-GA-201, DMS-GA-202, DMS-GA-204, DMS-GA-205 | Pending after P1 blockers. | Matter cabinet parity, document action center, audit/activity timeline. |
| PR-3A to PR-3E Search hardening | DMS-GA-301, DMS-GA-302, DMS-GA-303, DMS-GA-304, DMS-GA-305 | Pending. | Query privacy, refiners, negative leakage proof, governed search folders, reindex evidence. |
| PR-4A to PR-4D Access/team/walls | DMS-GA-401, DMS-GA-402, DMS-GA-403, DMS-GA-405 | Pending. | Permission-scoped org picker, team/wall picker UX, explicit access workflow boundary. |
| PR-5A to PR-5E Records/workflow/notifications | DMS-GA-501, DMS-GA-502, DMS-GA-503, DMS-GA-504, DMS-GA-505, DMS-GA-506 | Pending. | Records context pickers, lifecycle/workflow/certificates, real task inbox, real notifications. |
| PR-6A to PR-6E Admin/integrations | DMS-GA-601, DMS-GA-602, DMS-GA-603, DMS-GA-604, DMS-GA-605 | Pending. | Tenant-governed taxonomy/refiners/templates, Outlook evidence, Office/OneDrive ADR gate only. |
| PR-7A to PR-7E Production evidence | DMS-GA-701, DMS-GA-702, DMS-GA-703, DMS-GA-704, DMS-GA-705 | Pending, except GA0 guard baseline exists. | Monitor map, rollback controls, responsive/a11y receipts, expanded guards, owner signoff package. |

## Verification Contract

Each repo-side PR must run the relevant focused tests plus:

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm lint
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm typecheck
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm test
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm build
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm docs:frozen
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm check:production-ui-literals
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm ui:production-smoke
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm check:ui-pr-checklist
PATH=/opt/homebrew/opt/node@22/bin:$PATH pnpm release:dms-smoke -- --check-env --json
```

`pnpm release:dms-smoke -- --json` without `--check-env` is a release receipt, not a local code gate. It must reference an approved staging/canary environment and remain reference-only.

## Current PR-1A Acceptance

- `/v1/integrations/matter-app/status` reports source mode, configured/runtime-ready state, production projection block, freshness, and upload-authoritative state without secrets.
- `/v1/integrations/matter-app/matter-lookup` returns safe empty results when source is unavailable or UUID-shaped input is supplied.
- Matter lookup uses SQL-stage `matter_members` and ethical-wall filters before labels/counts are returned.
- `MatterCodePicker` uses the Matter app lookup endpoint instead of the generic `/matters` list.
- `/integrations/matter-app` prefers backend runtime status and falls back to local public flags only as a conservative display state.
- Upload preflight and mutation gate remain deferred to PR-1B.
