# R13 Gate - Enterprise Hardening

Date: 2026-06-12

Status: TECHNICAL PASS

Gate approver: WAIVED by operator instruction

Scope:

- PACK-R13-01 Enterprise Hardening: SSO/SAML provider references, SSO metadata
  readiness, BYOK key reference registry, SIEM export manifests, backup/DR
  snapshot manifests, compliance evidence references, enterprise admin UI, and
  final R13 gate evidence.

## Validation Evidence

Machine status: PASS.

- `pnpm install --frozen-lockfile`: pass.
- `pnpm lint`: pass.
- `pnpm typecheck`: pass.
- `pnpm test`: pass, 153 files / 367 tests across apps and packages.
- `pnpm build`: pass.
- `docker compose -f infra/docker-compose.dev.yml up -d --wait`: pass.
- `pnpm db:migrate`: pass.
- Isolated clean compose DB roundtrip on project `amic-vault-r13-roundtrip`,
  port 55445: `db:migrate -> db:rollback -> db:migrate -> db:seed` pass.
- `pnpm db:seed`: pass, tenants=2 users=11.
- `pnpm test:integration -- tests/integration/enterprise-hardening.spec.ts tests/integration/auth-guard.spec.ts`: pass, 2 files / 5 tests.
- `pnpm test:integration`: pass, 80 files / 201 tests.
- `/Users/jws/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 -m pytest workers/ingestion/tests`: pass, 17 tests. Existing Starlette/httpx deprecation warning only.
- `pnpm backlog:validate`: pass, 174 TUWs.
- `pnpm docs:frozen`: pass, 51 files.
- `node tools/db/check-migration-conventions.mjs`: pass.
- `pnpm evalset:load -- --tenant-id 11111111-1111-4111-8111-111111111111`: pass, loaded=2 with existing R3 target warning.
- `pnpm search:eval:korean`: pass, precision 100.0%, recall 55.0%, false-positive rate 0.0%.
- `pnpm eval:ai-gate -- --tenant-id 11111111-1111-4111-8111-111111111111`: pass, technicalPass=true.
- `pnpm eval:ai-gate -- --tenant-id 11111111-1111-4111-8111-111111111111 --matter-id 4c2a5696-4e57-44c1-8b8f-1b50e580b6af`: pass, technicalPass=true with no-citation/no-feedback scope warnings.
- `pnpm graph:check -- --tenant-id 11111111-1111-4111-8111-111111111111 --matter-id 53f8ad3f-a97b-4096-9333-207ea0ec2c7f`: pass, driftCount=0.
- `pnpm eval:contract-gate`: pass, technicalPass=true.
- API/web/ingestion docker build smoke: pass.
- Enterprise release-boundary scans: pass.
- Dependency delta scan: pass, no package or lockfile change.
- `git diff -- docs/package`: no changes.
- `git diff --check`: pass.

Dirty DB note: full all-history rollback on the seeded/integration dev database
is not used as R13 evidence because durable append-only audit rows from later
releases can block older audit action constraint downs. The isolated clean
compose project passed the full all-history roundtrip.

## R13-G1. SSO/SAML Reference Readiness

Machine status: PASS.

- `enterprise_sso_providers` is tenant scoped with RLS and FORCE RLS.
- Provider configuration stores provider key, entity ref, URL hash, metadata
  hash, and certificate fingerprint only.
- Protected metadata readiness returns SP entity/ACS references only.
- No live SAML assertion consumption, session issuance, raw metadata XML, raw
  certificate, or external IdP network call was introduced.
- SSO changes and metadata views are audited with reference-only metadata.

## R13-G2. BYOK Key Reference Readiness

Machine status: PASS.

- `enterprise_key_references` is tenant scoped with RLS and FORCE RLS.
- BYOK records store provider, key ref hash, fingerprint, status, verification,
  and rotation metadata only.
- No raw key material, private key, plaintext KMS URI, secret handle, or KMS API
  call was introduced.
- BYOK changes are audited with reference-only metadata.

## R13-G3. SIEM Export Manifest Readiness

Machine status: PASS.

- `enterprise_siem_exports` is tenant scoped with RLS and FORCE RLS.
- SIEM export records store sink type, endpoint hash, sequence start/end, event
  count, and manifest hash only.
- No endpoint URL, token, socket sender, webhook call, syslog delivery, or
  outbound delivery dependency was introduced.
- SIEM export records are audited with hash/range/count metadata only.

## R13-G4. Backup/DR Snapshot Readiness

Machine status: PASS.

- `enterprise_backup_snapshots` is tenant scoped with RLS and FORCE RLS.
- Snapshot records store scope, status, manifest hash, row-count hash/json, and
  table count only.
- No backup data export body, document content copy, external backup API, or
  restore overwrite path was introduced.
- Backup snapshot records are audited with reference-only metadata.

## R13-G5. Compliance Evidence Readiness

Machine status: PASS.

- `enterprise_compliance_evidence` is tenant scoped with RLS and FORCE RLS.
- Compliance evidence stores framework, control id, evidence ref, evidence
  hash, owner ref, and status only.
- Readiness is derived from active SSO, active BYOK, SIEM export evidence,
  backup evidence, and zero compliance gaps.
- No evidence body, raw control narrative, or external compliance API call was
  introduced.

## R13-G6. Tenant Isolation, Grants, and Sensitive Columns

Machine status: PASS.

```text
enterprise_backup_snapshots:true:true
enterprise_compliance_evidence:true:true
enterprise_key_references:true:true
enterprise_siem_exports:true:true
enterprise_sso_providers:true:true
destructive_grants:none
unsafe_columns:none
```

- All R13 enterprise tables have tenant RLS and FORCE RLS.
- Runtime role has no DELETE/TRUNCATE grant on enterprise tables.
- Enterprise tables have no unsafe raw secret, token, password, private key, key
  material, endpoint URL, metadata XML, or assertion XML columns.

## R13-G7. Release Boundary and Regression

Machine status: PASS.

- No new package or lockfile dependency was introduced.
- No external AI model opening or DEC-11 override was introduced.
- No OpenSearch/Elasticsearch, Neo4j, SMTP, webhook delivery, KMS, IdP, backup,
  or compliance API dependency was introduced.
- No `docs/package/` changes were made.
- R6 AI gate, R7 graph consistency, R8 contract gate, R11 external, and R12
  records regressions remain technical-pass.

## Approval

Gate approver: WAIVED by operator instruction
Decision: TECHNICAL PASS
Approval date: 2026-06-12
Remaining blockers: 0

## Result

R13 Enterprise Hardening technical evidence is passed. R14 Scale & Learning work
may begin after PACK-R13-01 passes PR CI and is merged under the active R14
technical completion goal.
