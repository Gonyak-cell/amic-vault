# Launch Control Sheet

Status: STAGING TECHNICAL PASS - NOT LAUNCHED
Date: 2026-06-14

This is the one-page control sheet for the release-completion lane. It shows the
current technical state, the commands Codex can run, and the approvals that
remain blocked outside the repository.

Previous baseline label `PREPARED - NOT LAUNCHED` remains true for production:
AWS staging is technically passed, but pilot and production are not launched.

## Current Technical State

| Item | State | Evidence |
|---|---|---|
| R14 technical completion | technical-pass | `docs/ledger/gates/R14_gate.md` |
| Launch readiness artifacts | prepared | `pnpm launch:readiness` |
| Launch execution artifacts | prepared | `pnpm launch:execution` |
| Staging smoke automation | prepared | `pnpm release:smoke -- --dry-run` and `pnpm release:smoke -- --local` |
| Local staging preflight | passed locally | `pnpm release:local-preflight` / EV-SMOKE-002 |
| AWS staging main alignment | passed | STAGE-MAIN-MERGE-AWS-001 / EV-STAGE-009 / EV-SMOKE-005 |
| Synthetic UAT technical evidence | technical-pass; acceptance pending | SYNTH-UAT-TECH-2026-06-14-001 / `pnpm release:uat` |
| docs/package freeze | enforced | `pnpm docs:frozen` |
| Local UI routes | prepared | `/login`, `/dashboard`, `/launch` |

## Control Commands

```bash
pnpm launch:readiness
pnpm launch:execution
pnpm release:uat
pnpm release:smoke -- --dry-run
pnpm release:smoke -- --local
pnpm release:local-preflight
pnpm docs:frozen
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Blocked Decisions

Resolved staging evidence: LRB-001, LRB-002, LRB-003, LRB-004, and LRB-008 are
approved for the AWS temporary-target staging path.

| Gate | Required Evidence |
|---|---|
| Pilot entry | LRB-005, LRB-006, LRB-007, LRB-014 |
| Production entry | LRB-009, LRB-010, LRB-011, LRB-012, LRB-013 |

## Operator-Provided Values

The operator must provide only evidence refs in repo-tracked files. Actual cloud
targets, private endpoints, passwords, tokens, cookies, registry credentials,
secret values, legal terms, pricing, customer approvals, and production
approvals stay outside the repository.

## Codex Can Still Do

- Keep validators and CI aligned with release artifacts.
- Run local synthetic smoke and UI QA.
- Append execution ledger entries for technical preparation work.
- Prepare PRs and merge green CI changes when operator scope allows it.

## Codex Must Stop

- Any request requires committing a secret, private endpoint, real customer data,
  or raw provider evidence.
- Any permission, tenant isolation, audit, DLP, records, external portal, or AI
  invariant fails.
- The release SHA or deployment target changes without an evidence ref.
