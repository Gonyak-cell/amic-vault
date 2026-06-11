# R1 Gate Report — Matter Core

Status: TECHNICAL PASS / human sign-off waived by operator
Date: 2026-06-12
Operator: Codex
Scope: R1 after PACK-R1-07 merge, including Gate remediation for audit coverage gaps
Base main head before Gate remediation: `17ccd89d0a13c9ae70d0133f54983615555db966`
R1 PACK main CI evidence before Gate remediation: https://github.com/Gonyak-cell/amic-vault/actions/runs/27367285057

## Waiver

Human Gate sign-off, Claude review, and human merge approval are waived by the active R14 technical completion goal and the 2026-06-12 operator decision in `docs/ledger/decision.md`.

The waiver does not waive technical evidence, security invariants, release order, Gate checklist coverage, or append-only ledger records.

## Runtime Evidence

- Clean local Gate database was created with `docker compose -f infra/docker-compose.dev.yml down -v`, then `up -d --wait`.
- `pnpm install`: pass, lockfile up to date.
- `pnpm lint`: pass.
- `pnpm typecheck`: pass.
- `pnpm test`: pass.
- `pnpm build`: pass.
- `pnpm db:migrate`: pass on clean DB.
- `pnpm db:rollback`: pass.
- `pnpm db:migrate`: pass after rollback.
- `pnpm db:seed`: pass, tenants=2 users=11.
- `node tools/backlog/validate.mjs docs/package/codex/data/backlog_r0_r3.csv`: pass, 174 TUWs.
- `node infra/ci/scripts/check-docs-package-frozen.mjs`: pass, 51 files.
- `node tools/db/check-migration-conventions.mjs`: pass.
- `git diff --check`: pass.
- `git diff --name-only -- docs/package`: returned no files.

## R0 Gate Regression

Machine status: PASS.

- `verify` class checks are green locally: install, lint, typecheck, test, build, backlog validation, docs-package frozen check, migration convention check.
- DB roundtrip is green: compose up, migrate, rollback, migrate, seed.
- R0 security suites rerun in R1 scope:
  - `pnpm test:integration -- audit-immutability`: pass, 1 file / 5 tests.
  - `pnpm test:integration -- cross-tenant`: pass, 1 file / 2 tests.
  - `pnpm test:integration -- fail-closed`: pass, 2 files / 5 tests.
  - `pnpm test:integration`: pass, 22 files / 62 tests.

## R1-G1. Permission Matrix Harness 100%

Machine status: PASS.

- `pnpm test:integration -- permission-matrix`: pass, 1 file / 3 tests.
- `tests/integration/permission-matrix/matrix-expected.csv`: 3,780 matrix rows plus header.
- Harness assertions:
  - fixture roles equal the 7 DEC-15 roles.
  - fixture actions equal `rolePermissionActions`.
  - generated matrix rows cover every role/action/membership/wall scenario exactly once.
  - each actual decision equals expected.

Result: Permission Accuracy = 100%. Expected-undefined cells = 0. False-allow history in Gate run = 0.

## R1-G2. Cross-Tenant R1 Extension

Machine status: PASS.

- `pnpm test:integration -- cross-tenant`: pass.
- R1 protected route harness blocks tenant-alpha reading tenant-beta workspace details with safe denial and no foreign IDs/names in response.
- Full integration covers client, matter, member, party, role, wall, and audit paths.

R1 RLS SQL evidence:

```text
relname                    relrowsecurity  relforcerowsecurity  policy_count
clients                    t               t                    1
ethical_wall_memberships   t               t                    1
ethical_walls              t               t                    1
group_members              t               t                    1
groups                     t               t                    1
matter_members             t               t                    1
matters                    t               t                    1
parties                    t               t                    1
permissions                t               t                    1
```

R0 carry-forward matters SQL evidence:

```text
SET app.current_tenant_id = '22222222-2222-4222-8222-222222222222';
SELECT count(*) AS alpha_matters_visible_to_beta
FROM matters
WHERE tenant_id = '11111111-1111-4111-8111-111111111111';

alpha_matters_visible_to_beta = 0
```

## R1-G3. Audit Coverage 100%

Machine status: PASS after Gate remediation.

Gate remediation added:

- `PATCH /v1/matters/{matterId}` for bounded matter metadata update (`matterName`, `practiceGroup`, `metadata`) with `MATTER_UPDATED` audit and diff-only metadata.
- `ROLE_ASSIGNED` audit event on successful role assignment API calls, while preserving `ROLE_CHANGED`.
- `tests/integration/audit-coverage/matter-update.spec.ts` for `MATTER_UPDATED`, `MATTER_STATUS_CHANGED`, `LOGIN_SUCCESS`, and `LOGIN_FAILURE`.
- Fixture metadata cleanup so direct SQL audit fixture rows use whitelist keys only.

Verification:

- `pnpm test:integration -- audit-coverage`: pass, 3 files / 5 tests.
- `pnpm test:integration`: pass, 22 files / 62 tests.

Required action coverage SQL after clean full integration:

```text
ACCESS_DENIED                    24
ETHICAL_WALL_CREATED              6
ETHICAL_WALL_MEMBERSHIP_CHANGED   6
LOGIN_FAILURE                     7
LOGIN_SUCCESS                    50
MATTER_CREATED                   32
MATTER_MEMBER_ADDED              45
MATTER_MEMBER_REMOVED             4
MATTER_STATUS_CHANGED            18
MATTER_UPDATED                    3
PERMISSION_CHANGED               65
ROLE_ASSIGNED                     5
ROLE_CHANGED                      5
```

Metadata whitelist SQL:

```text
SELECT DISTINCT metadata key outside whitelist;
Result: 0 rows
```

Sensitive values are not recorded in audit metadata. Matter update audit metadata contains only `matter_id` and `diff_keys`.

## R1-G4. Fail-Closed Permission Injection

Machine status: PASS.

- `pnpm test:integration -- fail-closed`: pass, 2 files / 5 tests.
- Covered cases include evaluator exception, missing auth/session failures, undefined or unparseable permission decision, wall lookup failure, deny-overrides, and membership as an ALLOW prerequisite.
- ACCESS_DENIED audit coverage is present in R1-G3 SQL.

## R1-G5. Permission Model Freeze

Machine status: PASS.

- Freeze document: `docs/adr/ADR-013-permission-model-freeze.md`
- Decision Ledger entry: `docs/ledger/decision.md` PACK-R1-07 line.
- Frozen elements:
  - R1 role/action matrix and permission-matrix fixture/CSV.
  - `canReadMatter`, `canEditMatter`, `canUploadToMatter`, `canReadDocument`, `canDownloadDocument` signatures.
  - ethical wall, membership, and matter_members schema.
  - `PermissionQueryBuilder.buildMatterFilter` query-time injection point.
- `party.manage` wording is resolved into `party.create` and `party.restrict` in ADR-013.
- Human Permission Model Freeze approval is waived by operator instruction for this technical completion run.

## Approval

Gate approver: WAIVED by operator instruction
Decision: TECHNICAL PASS
Approval date: 2026-06-12

## Result

R1 Gate technical evidence is passed. R2/R3 work may begin only after this Gate report branch passes PR CI and is merged under the active R14 technical completion goal.
