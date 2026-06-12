# R13 Enterprise Readiness Gate Report

Date: 2026-06-12
Status: TECHNICAL PASS

## Scope

PACK-R13-01 implements the R13 enterprise hardening technical gate after the R12
records governance gate.

Implemented scope:

- Tenant-scoped SSO/SAML provider reference registry using hashes and
  fingerprints only.
- Internal SSO metadata readiness endpoint for enterprise administrators.
- Tenant-scoped BYOK key reference registry with ref hashes, fingerprints,
  verification timestamp, and rotation due date.
- SIEM export batch manifest records with sink type, endpoint hash, audit
  sequence range, event count, and manifest hash.
- Backup/DR snapshot manifest records with table counts and row-count hashes.
- SOC 2 / ISO 27001 compliance evidence reference registry and readiness
  summary.
- Protected `/enterprise` admin console.
- Reference-only enterprise audit events and R13 gate evidence.

R13-01 does not add live SAML session issuance, external IdP calls, outbound
SIEM delivery, webhook/syslog sockets, KMS/cloud backup/compliance API calls,
raw SAML metadata/assertion XML storage, raw endpoint URLs, key material,
secrets, backup data export bodies, or compliance evidence bodies.

## Technical Model

| Area | Implementation |
|---|---|
| SSO/SAML | `enterprise_sso_providers` with provider keys, URL hash, metadata hash, and certificate fingerprint |
| SSO metadata | Protected readiness endpoint returns SP entity/ACS refs only |
| BYOK | `enterprise_key_references` stores provider, key ref hash, fingerprint, status, verification, and rotation metadata |
| SIEM | `enterprise_siem_exports` stores sink enum, endpoint hash, audit seq range/count, and manifest hash |
| Backup/DR | `enterprise_backup_snapshots` stores scope, status, manifest hash, row-count hash/json, and table count |
| Compliance | `enterprise_compliance_evidence` stores framework/control evidence refs and hashes only |
| Readiness | Derived from active SSO, active BYOK, recorded SIEM, recorded backup, and no compliance gaps |
| Audit | Enterprise audit actions for SSO, BYOK, SIEM, backup, compliance, and readiness views |
| Tests | `tests/integration/enterprise-hardening.spec.ts` plus auth guard regression |

## Permission, Sensitive Data, and Audit

- Enterprise configuration APIs require an authenticated internal user and
  tenant context.
- Enterprise administrator operations are limited to `firm_admin` and
  `security_admin` roles.
- Non-admin enterprise configuration attempts return safe
  `PERMISSION_DENIED`.
- SSO stores and returns bounded refs, hashes, and fingerprints only.
- BYOK stores and returns key reference hashes and fingerprints only.
- SIEM export records do not store endpoint URLs, delivery tokens, or outbound
  delivery state.
- Backup snapshot records contain counts and hashes only, not exported data or
  document content.
- Compliance evidence stores references and hashes only, not evidence body.
- Enterprise audit metadata uses allow-listed reference IDs, hashes,
  fingerprints, counts, ranges, enum states, and no sensitive source text.

## Validation Summary

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | PASS |
| `pnpm lint` | PASS |
| `pnpm typecheck` | PASS |
| `pnpm test` | PASS, 153 files / 367 tests |
| `pnpm build` | PASS |
| `docker compose -f infra/docker-compose.dev.yml up -d --wait` | PASS |
| `pnpm db:migrate` | PASS |
| isolated clean DB `db:migrate -> db:rollback -> db:migrate -> db:seed` | PASS on compose project `amic-vault-r13-roundtrip`, port 55445 |
| `pnpm db:seed` | PASS, tenants=2 users=11 |
| `pnpm test:integration -- tests/integration/enterprise-hardening.spec.ts tests/integration/auth-guard.spec.ts` | PASS, 2 files / 5 tests |
| `pnpm test:integration` | PASS, 80 files / 201 tests |
| worker pytest | PASS, 17 tests, existing Starlette/httpx warning |
| `pnpm backlog:validate` | PASS, 174 TUWs |
| `pnpm docs:frozen` | PASS, 51 files |
| `node tools/db/check-migration-conventions.mjs` | PASS |
| evalset load | PASS, loaded=2 with existing R3 target warning |
| Korean search eval | PASS, precision 100.0%, recall 55.0%, false-positive 0.0% |
| AI gate | PASS, technicalPass=true |
| matter-scoped AI gate | PASS, technicalPass=true with no-citation/no-feedback scope warnings |
| graph consistency | PASS, driftCount=0 |
| contract gate | PASS, technicalPass=true |
| API/web/ingestion docker build smoke | PASS |
| enterprise release-boundary scan | PASS |
| dependency delta scan | PASS, no package or lockfile change |
| `git diff -- docs/package` | PASS, no changes |
| `git diff --check` | PASS |

Dirty DB note: a full all-history rollback on the seeded/integration dev
database is not used as R13 evidence because durable append-only audit rows from
later releases can block older audit action constraint downs. The isolated clean
compose project passed the full all-history roundtrip
`migrate -> rollback -> migrate -> seed`.

## SQL Evidence

```text
enterprise_backup_snapshots:true:true
enterprise_compliance_evidence:true:true
enterprise_key_references:true:true
enterprise_siem_exports:true:true
enterprise_sso_providers:true:true
destructive_grants:none
unsafe_columns:none
```

The R13 enterprise tables all have RLS and FORCE RLS enabled. The runtime role
has no DELETE/TRUNCATE grant on enterprise tables. Enterprise tables do not
include unsafe raw secret, token, password, private key, key material, endpoint
URL, metadata XML, or assertion XML columns.

## Enterprise Readiness Gate Evidence

`tests/integration/enterprise-hardening.spec.ts` verifies:

- Firm administrators can create and activate SSO provider references.
- SSO provider storage uses hashes and fingerprints only.
- Protected SSO metadata readiness is audited.
- BYOK key references can be created and verified without key material.
- SIEM export manifests record sink type, endpoint hash, seq range, event count,
  and manifest hash only.
- Backup snapshot manifests record table counts and row-count hashes only.
- Compliance evidence references can be recorded without evidence body.
- Enterprise readiness becomes ready only when the technical prerequisites have
  evidence and compliance gaps are zero.
- Non-admin enterprise configuration is denied safely.
- R13 tables have tenant RLS/FORCE RLS, no destructive runtime grants, and no
  unsafe raw secret columns.

Additional regressions verify:

- `/enterprise` is protected by the internal auth guard.
- Web enterprise hardening UI builds under the internal app shell.
- R6 AI, R7 graph, R8 contract, R11 external, and R12 records gate regressions
  remain technical-pass.

## Release Boundary

Automated implementation scans passed for:

- No external IdP network call or live SAML assertion session issuance.
- No raw SAML metadata/assertion XML, raw certificate, or raw endpoint URL
  storage.
- No raw SIEM endpoint URL, webhook token, syslog secret, socket sender, or
  outbound delivery implementation.
- No raw key material, KMS secret handle, private key, or BYOK plaintext URI.
- No backup data export body, restore overwrite path, document content copy, or
  compliance evidence body storage.
- No external AI model opening or DEC-11 override.
- No package or lockfile dependency change.
- No `docs/package/` change.

Remaining blockers: 0.
