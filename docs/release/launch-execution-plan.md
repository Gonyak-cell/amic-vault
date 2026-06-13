# Launch Execution Plan

Status: READY FOR OPERATOR DECISIONS
Date: 2026-06-13

This plan converts the prepared launch package into an executable release
sequence. It does not approve any company, legal, security, pricing, customer
data, cloud, DNS, registry, secret, or production release decision.

## Current Baseline

- Technical completion: R14 Gate technical pass.
- Launch preparation: `pnpm launch:readiness` green.
- Deployment state: staging and production intentionally disabled.
- Human/company decisions: tracked by `docs/release/launch-blocker-ledger.md`.
- Release candidate SHA under consideration: `a0c1e60`.
- Included release-candidate PRs: PR #66 and PR #67.

## Phase 0 - Release Candidate Closure

| Task | Owner | Evidence | Blocks |
|---|---|---|---|
| Decide whether the activity-console UI branch is part of the first release SHA. | Operator | PR URL or release note | Release SHA freeze |
| Confirm whether `a0c1e60` is the frozen RC SHA. | Operator | `docs/release/rc-freeze-decision-pack.md` evidence ref | Staging image build |
| Keep RC release notes aligned with PR #66/#67 scope. | Codex | `docs/release/release-notes-rc-a0c1e60.md` | Staging handoff |
| Keep `docs/package/` frozen. | Codex | `pnpm docs:frozen` | All phases |
| Keep launch readiness artifacts internally consistent. | Codex | `pnpm launch:readiness` and `pnpm launch:execution` | All phases |
| Confirm no uncommitted secret, real data, or private endpoint is in the repo. | Codex | `git diff --check`, release validators | All phases |

## Phase 1 - Staging Decisions

Staging can open only after these blocker rows have approved evidence refs.
Do not commit the actual private endpoints, secrets, keys, tokens, customer
documents, or provider console screenshots to this repository.

| Blocker | Decision Needed | Minimum Output |
|---|---|---|
| LRB-001 | Cloud provider and domestic/private region. | Provider, region, isolation model, evidence ref |
| LRB-002 | DNS/TLS ownership. | Staging domain ref, production domain ref, CA policy ref |
| LRB-003 | Container registry. | Registry ref, image namespace ref, signing/retention policy ref |
| LRB-004 | Secret manager. | Secret manager ref and required secret names only |
| LRB-008 | Monitoring and incident response. | Alert sink ref, on-call owner ref, severity policy ref |

Exit criteria: `docs/release/operator-decision-sheet.md` has evidence refs for
LRB-001, LRB-002, LRB-003, LRB-004, and LRB-008.

## Phase 2 - Staging Deployment

| Step | Action | Evidence |
|---|---|---|
| 1 | Freeze staging candidate SHA. | Git SHA |
| 2 | Build api, web, and ingestion images from the same SHA. | Image digest refs |
| 3 | Push images to approved registry. | Registry digest refs |
| 4 | Take pre-migration staging database snapshot. | Snapshot ref |
| 5 | Acquire migration lock. | Lock evidence ref |
| 6 | Run database migrations. | Migration log ref |
| 7 | Deploy api, web, and ingestion worker. | Deployment ref |
| 8 | Run staging smoke checks. | Smoke evidence ref |
| 9 | Run UAT with approved synthetic or pilot data. | UAT evidence refs |

Staging exit criteria:

- Smoke checks pass.
- `pnpm release:smoke` evidence is captured with a non-secret target ref.
- UAT-001 through UAT-020 have evidence refs.
- No high or critical finding remains unresolved.
- Any failure is either fixed or listed as a launch blocker.

## Phase 3 - UAT Evidence

Use `docs/release/uat-evidence-template.md` to record evidence refs. The
evidence itself may live outside this repository when it contains private
deployment metadata, customer approval context, private endpoints, or screenshots
that should not be public.

Critical UAT groups:

- Tenant/auth/matter permission: UAT-001 through UAT-004.
- Search/DLP/AI/graph controls: UAT-005 through UAT-010.
- Workstream modules: UAT-011 through UAT-018.
- Operational resilience: UAT-019 through UAT-020.

## Phase 4 - Pilot Readiness Decisions

| Blocker | Decision Needed |
|---|---|
| LRB-005 | Legal terms, privacy notice, DPA, external portal terms, retention/disposal language |
| LRB-006 | Pricing, support hours, SLA, escalation model, billing owner |
| LRB-007 | Customer data approval and pilot data controls |
| LRB-014 | Named post-launch support, incident, and rollback owner |

Pilot entry criteria:

- Staging exit criteria complete.
- LRB-005, LRB-006, LRB-007, and LRB-014 resolved.
- Pilot users and tenant scope are approved outside the repository.

## Phase 5 - Production Gate Decisions

| Blocker | Decision Needed |
|---|---|
| LRB-009 | Operational security review disposition |
| LRB-010 | Historical Risk=C waiver treatment before production |
| LRB-011 | Staging UAT acceptance |
| LRB-012 | Backup and restore rehearsal acceptance |
| LRB-013 | Production release approval for the release SHA |

Production entry criteria:

- All LRB-001 through LRB-014 rows resolved with evidence refs.
- `docs/release/security-evidence-index.md` reviewed.
- Rollback rehearsal completed.
- Release SHA frozen.

## Phase 6 - Production Release Window

Follow `docs/release/production-release-runbook.md`.

Stop immediately if any hold condition in that runbook occurs, especially:

- migration failure,
- permission, tenant isolation, audit, DLP, or external portal smoke failure,
- secret or sensitive data exposure,
- unexpected external model route opening,
- missing operator/security/legal/product/data approval.

## Phase 7 - Post-Launch Monitoring

The first monitoring window must cover:

- API health and error rate,
- login/session failures,
- permission denied and tenant isolation violation rates,
- audit write failures,
- search permission leakage checks,
- ingestion worker queue lag,
- external portal token failures,
- records disposal approval/denial paths,
- AI policy blocked/allowed evidence counts.

## Codex-Executable Work Remaining

Codex can continue to prepare and validate:

- PR, CI, and merge flow for release-candidate code.
- Launch package consistency validators.
- Staging smoke runner and evidence templates.
- UAT checklist bookkeeping.
- Release notes and ledger entries after approved evidence exists.
- Local synthetic walkthroughs using seeded development data.

Codex must not invent or approve:

- cloud target,
- DNS/TLS ownership,
- registry or signing policy,
- secret manager values,
- legal terms,
- pricing/SLA/support,
- real customer data permissions,
- security approval,
- production release sign-off.
