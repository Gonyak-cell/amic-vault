# Actual Launch Runbook

Status: READY FOR OPERATOR INPUT - NO DEPLOYMENT EXECUTED
Date: 2026-06-13

This runbook explains how to move AMIC Vault from the current technical
completion state to staging, pilot, production, and monitoring. It separates
operator/security/legal/product decisions from Codex-executable verification
steps. Do not commit secrets, private endpoints, credentials, real customer
data, provider-console screenshots, cookies, tokens, or raw document content to
this repository.

## Current Technical Baseline

| Item | Value |
|---|---|
| Default application candidate under consideration | `9e346d9e48c962448bcccbbef9e30d9c3e468e4f` |
| Frozen release SHA | Operator-supplied evidence ref before build or deploy |
| Source branch | `main` |
| Included PRs | `#66`, `#67`, `#68`, `#69` |
| Launch documentation baseline | `main` at or after PR #70 |
| Local routes | `/login`, `/dashboard`, `/launch` |
| Prepared smoke checks | `SMOKE-001` through `SMOKE-011` |
| Staging/prod state | Disabled until LRB evidence refs exist |

## 0. Technical Sanity Check

Owner: Codex or release engineer.

Run launch artifact checks from current `main`, then confirm the chosen frozen
release SHA exists:

```bash
export FROZEN_RELEASE_SHA=9e346d9e48c962448bcccbbef9e30d9c3e468e4f

git fetch origin main
git switch main
git pull --ff-only origin main
git rev-parse HEAD
git cat-file -e "$FROZEN_RELEASE_SHA^{commit}"
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm launch:readiness
pnpm launch:execution
pnpm docs:frozen
pnpm release:smoke -- --dry-run
pnpm release:local-preflight
```

Expected evidence:

- Command log ref for current launch docs and the chosen frozen release SHA.
- No `docs/package/` diff.
- No secret, real data, or private endpoint in the diff or command output.
- Local preflight uses only isolated local services and does not resolve
  staging or production approvals.

Stop if any command fails, the frozen SHA is not reachable, or any permission,
tenant isolation, audit, DLP, records, external portal, or AI invariant is
weakened.

## 1. Freeze The Release Candidate

Owner: Operator.

How to do it:

1. Review `docs/release/rc-freeze-decision-pack.md`.
2. Confirm whether the default application candidate is
   `9e346d9e48c962448bcccbbef9e30d9c3e468e4f`.
3. Store the exact frozen release SHA approval in the external evidence system.
4. Record only the evidence ref in `docs/release/operator-decision-sheet.md`
   and `docs/release/evidence-register.md`.

Repository-safe output:

- `RC-FREEZE-001` status changes to `approved` only after an evidence ref exists.
- `EV-RC-001` points to the external approval ref.

Do not put approval screenshots, private URLs, or signing credentials in the
repository.

## 2. Resolve Staging Opening Inputs

Owner: Operator, Security, and Ops.

Use `docs/release/staging-input-checklist.md`.

| Input | Blocker | How to complete |
|---|---|---|
| Cloud and region | LRB-001 | Choose provider, domestic/private region, and network isolation model. Record evidence ref only. |
| DNS/TLS | LRB-002 | Choose staging and production domain refs, CA policy, and ownership evidence. Do not commit private endpoint values. |
| Registry | LRB-003 | Choose image namespace, retention, signing, and digest evidence policy. Record registry refs only. |
| Secret manager | LRB-004 | Choose secret manager and runtime secret names for API, web, and worker. Do not record secret values. |
| Monitoring | LRB-008 | Choose alert sink, on-call owner ref, incident policy, and evidence retention. |

Exit criteria:

- `operator-decision-sheet.md` has evidence refs for LRB-001, LRB-002,
  LRB-003, LRB-004, and LRB-008.
- Required secret names are recorded as names or refs only.
- No actual secret or private endpoint is committed.

## 3. Build And Push Staging Images

Owner: Ops or CI release workflow.

Prerequisites:

- RC freeze evidence exists.
- LRB-001, LRB-002, LRB-003, LRB-004, and LRB-008 evidence refs exist.
- Registry credentials are available only through the approved secret manager or
  CI secret store.

Command template:

```bash
export FROZEN_RELEASE_SHA=9e346d9e48c962448bcccbbef9e30d9c3e468e4f
export RELEASE_SHA="$FROZEN_RELEASE_SHA"
export IMAGE_NAMESPACE="$APPROVED_REGISTRY_NAMESPACE_REF"

git fetch origin main
git checkout "$RELEASE_SHA"

docker build -f apps/api/Dockerfile -t "$IMAGE_NAMESPACE/api:$RELEASE_SHA" .
docker build -f apps/web/Dockerfile -t "$IMAGE_NAMESPACE/web:$RELEASE_SHA" .
docker build -f workers/ingestion/Dockerfile -t "$IMAGE_NAMESPACE/ingestion:$RELEASE_SHA" .

docker push "$IMAGE_NAMESPACE/api:$RELEASE_SHA"
docker push "$IMAGE_NAMESPACE/web:$RELEASE_SHA"
docker push "$IMAGE_NAMESPACE/ingestion:$RELEASE_SHA"
```

Evidence:

- Image digest refs for API, web, and ingestion.
- Registry evidence ref from LRB-003.
- Signing or retention policy evidence ref if required by the selected registry.

Do not commit registry credentials or private registry URLs.

## 4. Prepare Staging Runtime

Owner: Ops.

How to do it:

1. Provision or select the staging database.
2. Provision or select object storage.
3. Create approved runtime secret refs.
4. Configure API, web, and ingestion worker environment references.
5. Confirm monitoring and alert routing.
6. Take a pre-migration staging database snapshot.
7. Acquire the migration lock.

Required secret categories:

- API database connection.
- API session signing material.
- API object storage access.
- API encryption material reference.
- Web API base URL.
- Ingestion worker database connection.
- Ingestion worker object storage access.

Evidence:

- Snapshot ref.
- Migration lock ref.
- Runtime secret name refs.
- Monitoring sink ref.

## 5. Run Staging Migration And Deploy

Owner: Ops or Codex with approved deployment access.

Run migrations from the candidate image or approved release runner:

```bash
export FROZEN_RELEASE_SHA=9e346d9e48c962448bcccbbef9e30d9c3e468e4f
export RELEASE_SHA="$FROZEN_RELEASE_SHA"
pnpm db:migrate
```

Then deploy:

1. API service image digest for the frozen SHA.
2. Web service image digest for the frozen SHA.
3. Ingestion worker image digest for the frozen SHA.

Immediate checks:

```bash
curl -fsS "$API_BASE_URL/health/live"
curl -fsS "$API_BASE_URL/health/ready"
```

The actual endpoint values must come from the approved runtime environment and
must not be committed to the repository.

## 6. Run Staging Smoke

Owner: Ops or Codex with approved staging access.

Use secret-manager or CI-secret values for the environment. The command below is
a shape, not a place to write secrets into the repo:

```bash
export FROZEN_RELEASE_SHA=9e346d9e48c962448bcccbbef9e30d9c3e468e4f
export RELEASE_SHA="$FROZEN_RELEASE_SHA"
export SMOKE_TARGET_REF="$APPROVED_STAGING_TARGET_REF"
export SMOKE_REQUIRE_AUTH=1
pnpm release:smoke -- --json
```

Required smoke coverage:

- `SMOKE-001`: API live and ready health.
- `SMOKE-002`: Web login page.
- `SMOKE-003`: protected redirect to login.
- `SMOKE-004`: static asset load.
- `SMOKE-005`: approved synthetic login.
- `SMOKE-006`: authenticated dashboard.
- `SMOKE-007`: authenticated search.
- `SMOKE-008`: tenant-scoped protected API.
- `SMOKE-009`: negative role safe denial.
- `SMOKE-010`: audit event reference-only metadata.
- `SMOKE-011`: launch control page.

Exit criteria:

- All smoke checks pass.
- Output is captured as a non-secret evidence ref.
- Any failed smoke becomes a launch blocker or is fixed before UAT.

## 7. Execute UAT

Owner: Product, QA, and Codex where execution access is approved.

Use:

- `docs/release/synthetic-uat-scenarios.md`
- `docs/release/uat-evidence-template.md`

How to do it:

1. Run UAT-001 through UAT-020 with approved synthetic data.
2. Use pilot customer data only if LRB-007 explicitly approves it.
3. Record each result as an external evidence ref.
4. Record unresolved findings with severity and owner.

Exit criteria:

- UAT-001 through UAT-020 have evidence refs.
- High or critical unresolved findings: 0.
- Permission, tenant isolation, audit, DLP, records, external portal, and AI
  policy checks remain green.

## 8. Open Pilot

Owner: Legal, Product, Finance, Ops, Operator.

Required blockers:

- LRB-005: legal terms, privacy notice, DPA, external portal terms, and
  retention/disposal language.
- LRB-006: pricing, support hours, SLA, escalation model, and billing owner.
- LRB-007: pilot customer data approval and controls.
- LRB-014: support triage, incident handling, and rollback authority owner.

Pilot can begin only after staging smoke and UAT are green and those blockers
have evidence refs.

## 9. Open Production Gate

Owner: Security, Ops, Product, Operator.

Required blockers:

- LRB-009: operational security review.
- LRB-010: historical Risk=C waiver treatment.
- LRB-011: staging UAT acceptance.
- LRB-012: backup and restore rehearsal.
- LRB-013: production release approval for the frozen SHA.

Additional checks:

- Security evidence index reviewed.
- Rollback runbook rehearsed.
- Restore drill uses non-production data.
- No high or critical unresolved finding remains.

## 10. Execute Production Release

Owner: Ops or Codex with approved production access.

Follow `docs/release/production-release-runbook.md` in order:

1. Confirm frozen release SHA.
2. Confirm production secret refs.
3. Take pre-release backup snapshot.
4. Build or select signed images for the frozen SHA.
5. Enter release window.
6. Acquire migration lock.
7. Run database migrations.
8. Deploy API, web, and ingestion worker.
9. Run post-deploy smoke and invariant checks.
10. Record release evidence.
11. Move to monitoring.

Hold immediately if migration fails, permission or tenant isolation smoke fails,
audit/DLP checks fail, a secret or real data is exposed, an external model route
opens unexpectedly, or any required approval is missing.

## 11. Monitor Post Launch

Owner: Ops and Security.

Monitor at minimum:

- API health and error rate.
- Login/session failures.
- Permission denied and tenant isolation violation rates.
- Audit write failures.
- Search permission leakage checks.
- Ingestion worker queue lag.
- External portal token failures.
- Records disposal denial and approval paths.
- AI policy blocked and allowed evidence counts.

Record monitoring evidence refs outside the repository and append only
non-secret summary refs to the launch ledgers.
