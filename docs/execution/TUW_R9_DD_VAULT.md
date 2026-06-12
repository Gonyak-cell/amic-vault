# R9 DD Vault Detailed TUW Contract

Status: live extension after R8 Contract Intelligence Gate
PACK: PACK-R9-01
Branch: `feat/pack-r9-01-dd-vault`
Source constraints:
- `docs/package/codex/00_Master_Brief.md`
- `docs/package/codex/30_Release_Roadmap.md` R9
- `docs/package/03_Pyramid_PBS_DBS_Structure.md` P11/P13 internal-only scope
- `docs/package/13_TUW_Master_Backlog.md` P11 DD rows

This file extends the frozen package without modifying `docs/package/`.
R9 P13 usage is internal-only data room mapping. External portal, external
users, secure links, VDR sharing, watermark delivery, and external Q&A remain
for R11 and are out of scope.

## PACK-R9-01 TUWs

| TUW ID | Source rows | Scope | Risk | Verification |
|---|---|---|---|---|
| DD-RFI-CORE-TUW-001 | DD-RFIMANA-RFICORE-TUW-001~004 | Create RFI schema, category/status/priority enums, bounded request payloads, and RFI create/list/update API. | High | Function, permission, audit, RLS |
| DD-RFI-UI-TUW-002 | DD-RFIMANA-RFICORE-TUW-005 | Internal RFI list/workbench UI with auth guard and no external participant affordance. | Medium | UI unit/build, auth guard |
| DD-DATAROOM-MAP-TUW-003 | DD-DATAROOMMA-RFIDOCULIN-TUW-001 | Create internal RFI-document mapping schema/API with document permission recheck before write. | Critical | Permission-before-document, audit, RLS |
| DD-DATAROOM-STATUS-TUW-004 | DD-DATAROOMMA-RFIDOCULIN-TUW-002~004 | Missing detector, supplement-requested status, and overdue flag computed from RFI due date. | High | Function, permission-filtered list |
| DD-DATAROOM-AUDIT-TUW-005 | DD-DATAROOMMA-RFIDOCULIN-TUW-005 | Reference-only DD audit actions and metadata allow-list coverage. | Critical | Audit metadata leakage negative |
| DD-ISSUE-RISK-TUW-006 | DD-ISSUMANA-DDISSU-TUW-001~002 | DD issue and risk-register schema/API with severity, likelihood, and status enums. | High | Function, RLS, permission |
| DD-CITATION-TRACE-TUW-007 | DD-ISSUMANA-DDISSU-TUW-003~004 | Source document citation refs, report-inclusion flag, and RFI-document-issue-risk traceability endpoint. | Critical | Permission-scoped traceability, audit |
| DD-GATE-REPORT-TUW-008 | R9 Gate | R9 technical Gate report, release-boundary scans, and execution/decision ledger append. | High | Standard validation, targeted DD suite, full integration |

## Files Create / Modify

Allowed create/modify surface:
- `db/migrations/*_create_dd_vault.sql`
- `packages/shared/src/dd/*`
- `packages/shared/src/audit/*`
- `packages/shared/src/types/audit*`
- `packages/shared/src/index.ts`
- `apps/api/src/modules/dd/*`
- `apps/api/src/app.module.ts`
- `apps/api/src/modules/audit/audit-metadata.normalizer.ts`
- `apps/web/src/app/(app)/dd/*`
- `apps/web/src/app/(app)/layout.tsx`
- `apps/web/src/lib/api/dd.ts`
- `apps/web/src/middleware.ts`
- `tests/integration/dd-vault.spec.ts`
- `docs/execution/PACKS_R4_R14.md`
- `docs/execution/TUW_R9_DD_VAULT.md`
- `docs/reports/R9_dd_vault_traceability.md`
- `docs/ledger/gates/R9_gate.md`
- `docs/ledger/execution.md`
- `docs/ledger/decision.md`

## NOT Modify

Do not modify:
- Anything under `docs/package/`
- `packages/ai/`
- External sharing, secure-link, external-user, VDR, watermark, or external
  Q&A implementation files, if present
- Search endpoint permission enforcement except reusable query-stage scope use
- Existing PermissionService evaluator contracts unless R9 code is only calling
  them

## Required Technical Contract

- All DD tables have `tenant_id NOT NULL`, RLS enabled, FORCE RLS, and no
  DELETE/TRUNCATE grants to `vault_app`.
- All DD API reads and traceability queries require matter read permission.
- All DD writes require matter edit permission.
- Mapping a document requires a `DocumentPermissionService.canReadDocument`
  allow decision before insert/update.
- DD mapping and traceability list endpoints must use query-stage document
  permission filtering for document-linked rows; post-filtering is not
  sufficient.
- Audit metadata stores only IDs, hashes, counts, enum values, and whitelisted
  reference keys. It must not store RFI title/description, issue title,
  mitigation prose, document body, snippets, or raw citation text.
- R9 must not create `external_*` tables, issue secure links, expose external
  user workflows, call external APIs/models, add OpenSearch, add hard delete
  behavior, or bypass PermissionService.

## Validation Additions

PACK-R9-01 must run the standard validation set plus:

```bash
pnpm test:integration -- --runInBand tests/integration/dd-vault.spec.ts
pnpm test:integration
```

Gate evidence must include:
- RFI-document-issue-risk traceability proof
- Internal-only data room confirmation
- Permission and audit regression evidence
- R9 table RLS/FORCE RLS and destructive grant SQL evidence
- `docs/package` unchanged evidence
