# ADR-013: Permission Model Freeze

Status: Accepted for technical completion under operator waiver

Date: 2026-06-12

Trace: DEC-15, C-1, PACK-R1-07, DEVOPS-FREEZE-PERMMODEL-TUW-001, `docs/package/codex/21_Permission_Model.md`

## Context

R1 closes the matter core permission surface. R2 and R3 may add documents and search only if the permission model has a stable baseline for role actions, matter membership, ethical walls, fail-closed decisions, and query-time filtering.

The active operator goal waives human approval, Claude review, human Gate sign-off, and human merge approval for this technical completion run. Technical evidence, security invariants, release order, Gate checklist evidence, and append-only ledger records remain required.

## Decision

Freeze the R1 permission model at merge of PACK-R1-07. Changes to the frozen elements require a later ADR amendment, updated permission-matrix expected fixture, full regression evidence, and decision-ledger append.

### 1. Role Matrix And Action Surface

Frozen files:

| File | SHA-256 |
|---|---|
| `packages/shared/src/permission/role-permission-matrix.ts` | `b0be1d8425e5693c0da8aac141fc0463900897e72e9ce5edae4a6d45d21c5c28` |
| `packages/shared/src/permission/permission-actions.ts` | `a02930e2ed8ae9b63d8318a8d3d5e223b8705128360fc7d8d8fc46fb0a83ec1b` |
| `tests/fixtures/permission-matrix.json` | `c84eb4f9f8530510d1c3bb90ac2cada395bbf1944ab46510e43fccc7865b1f19` |
| `tests/integration/permission-matrix/matrix-expected.csv` | `6518b2b3aea708a1249df52c8accfbe9e8bbe14d2535e044f8cdf2393b884c91` |

R1 uses split party actions:

- `party.create`: Matter Owner or Matter Member with edit-level matter permission.
- `party.restrict`: Security Admin tenant-level authority or actual Matter Owner membership.

This resolves the package wording split between broad `party.manage` and the more specific PARTREGI-003/PARTREGI-005 authority rules before freeze.

### 2. PermissionService Signatures

Frozen signatures:

| File | Symbol | Line |
|---|---|---|
| `apps/api/src/modules/permission/permission.service.ts` | `canReadMatter(ctx: PermissionContext, matterId: string): Promise<PermissionDecision>` | 91 |
| `apps/api/src/modules/permission/permission.service.ts` | `canEditMatter(ctx: PermissionContext, matterId: string): Promise<PermissionDecision>` | 97 |
| `apps/api/src/modules/permission/permission.service.ts` | `canUploadToMatter(ctx: PermissionContext, matterId: string): Promise<PermissionDecision>` | 103 |
| `packages/shared/src/permission/document-permission.interface.ts` | `canReadDocument(ctx: PermissionContext, documentId: string): Promise<PermissionDecision>` | 14 |
| `packages/shared/src/permission/document-permission.interface.ts` | `canDownloadDocument(ctx: PermissionContext, documentId: string, reason?: string): Promise<PermissionDecision>` | 20 |

File hashes:

| File | SHA-256 |
|---|---|
| `apps/api/src/modules/permission/permission.service.ts` | `a95806e3824ff69a52afd2e147fe72ca1af516a4c39d2320d8467262de9d215b` |
| `packages/shared/src/permission/document-permission.interface.ts` | `8535af28fc5722a188bfeedad9c62de991a67677a47e714cc99782f8bbddd684` |

### 3. Membership And Ethical Wall Schema

Frozen schema files:

| File | SHA-256 |
|---|---|
| `db/migrations/0016_create_ethical_walls.sql` | `e67ebe02ed38e16d57acc6b4dc491c2f998df8be1dd75f77dd0070df1119abf5` |
| `db/migrations/0017_create_ethical_wall_memberships.sql` | `3564c12a8690fd06ac04b6956b3a58d152a35712af30dcced30b1d3b5fe9ef13` |
| `db/migrations/0018_create_matter_members.sql` | `4639124828f498ec5e8ffef714b186696c1ce5fed1e79586235d0026324918a0` |

The frozen semantics are membership-required matter access, deny-overrides ethical walls, and fail-closed wall evaluation.

### 4. Query-Time Filter Injection

Frozen injection point:

| File | Symbol | Line | SHA-256 |
|---|---|---|---|
| `apps/api/src/modules/permission/permission-query.builder.ts` | `PermissionQueryBuilder.buildMatterFilter(...)` | 19 | `9f5194dff49f648b352176a5a430c522d5287c836a14bc2357b2307ff010425d` |

The frozen rule is permission-before-search/list: membership and wall filters are injected into SQL before rows, counts, pagination, snippets, or facets are computed. Post-filtering remains forbidden.

## Validation

- `pnpm test:integration -- permission-matrix` covers 3,780 R1 role/action/membership/wall cells.
- `pnpm test:integration -- party` covers Party create/list/restricted marker permission and audit.
- Full verification for PACK-R1-07 is recorded in `docs/ledger/execution.md`.

## Approval

Human Permission Model Freeze approval is waived by the 2026-06-12 operator goal for this technical completion run. The waiver does not waive future ADR amendment requirements or security invariant checks.

## Consequences

- R2/R3 work may proceed only after R1 Gate technical evidence confirms this ADR, permission-matrix, and query-filter freeze are green.
- Any change to the frozen files or signatures must update this ADR and the decision ledger.
- Search, document, AI, and external sharing modules may not introduce alternate permission paths.
