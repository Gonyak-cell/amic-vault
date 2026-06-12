# R9 DD Vault Traceability Report

Date: 2026-06-12
Status: TECHNICAL PASS

## Scope

PACK-R9-01 implements the internal-only DD Vault surface:

- RFI management
- Internal data room mapping
- DD issue register
- Risk register
- RFI-document-issue-risk traceability
- DD workbench UI

R9 uses P13 only as an internal data-room mapping concept. It does not create
external workspaces, external users, secure links, VDR delivery, watermark
delivery, external Q&A, or any external sharing runtime.

## Technical Model

| Area | Implementation |
|---|---|
| RFI | `dd_rfis` tenant RLS table, `POST/GET/PATCH /v1/dd/rfis`, status/priority/category enums |
| Data room mapping | `dd_data_room_mappings`, `POST/GET /v1/dd/data-room-mappings`, internal labels and mapping status only |
| Issues | `dd_issues`, `POST/GET /v1/dd/issues`, severity/status/citation refs/report inclusion |
| Risks | `dd_risks`, `POST/GET /v1/dd/risks`, severity/likelihood/status/category/citation refs |
| Traceability | `GET /v1/dd/traceability`, permission-scoped RFI-document-issue-risk references |
| UI | `/dd` guarded workbench and API wrapper |

## Permission and Audit

- Matter reads require `PermissionService.canReadMatter`.
- Matter writes require `PermissionService.canEditMatter`.
- Document-linked mapping and issue writes require
  `DocumentPermissionService.canReadDocument`.
- Document-linked list and trace queries use the existing query-stage search
  permission scope through `SearchFilterBuilder`; denied document rows are not
  fetched into application code and then post-filtered.
- DD audit actions are reference-only:
  `DD_RFI_CHANGED`, `DD_DATA_ROOM_MAPPED`, `DD_ISSUE_CHANGED`,
  `DD_RISK_CHANGED`, `DD_TRACE_VIEWED`.
- Audit metadata stores IDs, counts, enum values, hashes, and bounded filter refs
  only. RFI titles/descriptions, issue titles, mitigation text, document body,
  snippets, and raw citation text are not audit metadata keys.

## Validation Summary

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | PASS |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS, 146 files / 352 tests |
| `pnpm build` | PASS |
| Clean compose + migrate/rollback/migrate/seed | PASS |
| `pnpm test:integration -- tests/integration/dd-vault.spec.ts` | PASS, 1 file / 3 tests |
| `pnpm test:integration` | PASS, 75 files / 185 tests |
| worker pytest | PASS, 17 tests, existing Starlette/httpx warning |
| `pnpm backlog:validate` | PASS, 174 TUWs |
| `pnpm docs:frozen` | PASS, 51 files |
| migration convention check | PASS |
| evalset load | PASS, loaded=2 with existing R3 target warning |
| Korean search eval | PASS, precision 100.0%, recall 55.0%, false-positive 0.0% |
| AI gate | PASS, technicalPass=true |
| graph consistency | PASS, driftCount=0 |
| contract gate | PASS, technicalPass=true |
| `git diff -- docs/package` | PASS, no changes |
| `git diff --check` | PASS |

Dirty dev DB note: a full `pnpm db:rollback` after DD integration data existed
failed once when older migration `0055` attempted to re-add an audit action
constraint without the newer R9 DD actions. This is the known append-only audit
row class; clean DB migrate -> rollback -> migrate -> seed passed and is the
Gate evidence.

## RLS and Runtime Grant Evidence

```text
dd_data_room_mappings:true:true
dd_issues:true:true
dd_rfis:true:true
dd_risks:true:true
runtime_destructive_grants:none
external_table_count:0
```

## Traceability Evidence

`tests/integration/dd-vault.spec.ts` verifies:

- RFI -> mapping -> issue -> risk creation through HTTP APIs.
- Traceability returns authorized document IDs and reference links.
- Traceability output does not include document body text.
- Explicitly denied documents are blocked before internal data room mapping.
- No `external_%` tables are created in R9.

## Release Boundary

Automated scans passed for:

- No external AI SDK/model dependency imports in production code.
- No external sharing/secure link/VDR controller implementation.
- No DD runtime `DELETE`, `TRUNCATE`, or hard-delete path.

Remaining blockers: 0.
