# Desktop RC Closeout - `1c7cba2`

Date: 2026-06-21
Status: STAGING RC CLOSEOUT PASS - PRODUCTION DESKTOP DISTRIBUTION HOLD

## Scope

This closeout records the post-merge desktop release-candidate evidence for
merge commit `1c7cba23c18ef09f6e3426289e12fcf081d8a675`.

It does not authorize server production deploy, database migration, storage
change, customer-wide desktop distribution, or updater enablement. Native
desktop remains a thin shell over an approved Vault web origin; server-side
auth, PermissionService, AuditService, document storage, search, records, and AI
policy remain authoritative.

## Source And CI Evidence

| Item | Evidence |
|---|---|
| Source PR | PR #291, `fix(release): pass staging desktop and DMS smoke gates` |
| Merge commit | `1c7cba23c18ef09f6e3426289e12fcf081d8a675` |
| Merge time | 2026-06-21T10:45:19Z |
| Desktop workflow | GitHub Actions run `27901847495`, status success |
| Main CI workflow | GitHub Actions run `27901847504`, status success |
| Standard desktop/auth staging smoke | `STAGE-SMOKE-AWS-DESKTOP-AUTH-1C7CBA2-2026-06-21`, pass=15 fail=0 skip=0 |
| DMS synthetic staging smoke | `STAGE-DMS-SYNTH-AWS-DESKTOP-1C7CBA2-2026-06-21`, pass=13 fail=0 skip=0 |
| Desktop release gate | `pnpm desktop:release-gate`, recorded in `.omo/evidence/LC-DESKTOP-RC-CLOSEOUT/executor.md` |
| Desktop release gate self-test | `pnpm desktop:release-gate -- --self-test`, recorded in `.omo/evidence/LC-DESKTOP-RC-CLOSEOUT/executor.md` |

## Decision

| Gate | Decision | Notes |
|---|---|---|
| Staging desktop RC | PASS | Merge commit `1c7cba2` has current main desktop CI, main CI, standard staging desktop/auth smoke, and DMS synthetic staging smoke evidence. |
| Server production deploy | NOT AUTHORIZED BY THIS CLOSEOUT | Desktop artifact release is separate from API, web, worker, database, storage, and traffic promotion. |
| Native production artifact | HOLD | Requires `DESKTOP-ARTIFACT-DIGEST-REF`, `DESKTOP-ARTIFACT-SIGNATURE-REF`, signing/notarization evidence where applicable, customer IT acceptance, and separate desktop release approval. |
| Updater | DISABLED | Updater remains disabled until a signed update policy, channel-bound manifest, digest validation, rollback path, and security review are approved. |
| Rollback | PREPARED | Browser/PWA fallback and `RB-DESKTOP-NATIVE-001` remain the rollback path for native artifact issues. |

## Production Packaging Readiness

| Requirement | Status | Evidence or blocker |
|---|---|---|
| Approved source SHA | READY | Merge commit `1c7cba2` and successful main workflows. |
| Desktop release gate checker | READY | `EV-DESKTOP-005`; live docs and synthetic pass/fail fixtures verified. |
| Artifact digest | PENDING EXTERNAL ARTIFACT | Customer-distributed artifacts still require `DESKTOP-ARTIFACT-DIGEST-REF`. |
| Artifact signature | PENDING EXTERNAL SIGNING | Customer-distributed artifacts still require `DESKTOP-ARTIFACT-SIGNATURE-REF`; signing material remains outside repo. |
| macOS notarization | PENDING WHEN MACOS ARTIFACT EXISTS | Record notarization ref only; do not commit credentials or provider metadata. |
| Windows signing | PENDING WHEN WINDOWS ARTIFACT EXISTS | Record signing ref only; do not commit certificates, secret names, or account identifiers. |
| Approved production origin | PENDING PRODUCTION DESKTOP RELEASE DECISION | Repository may store approved ref only, not raw private endpoint values. |
| Customer IT handoff | TEMPLATE READY, CONCRETE HANDOFF PENDING | `docs/release/desktop-it-handoff.md` defines required fields. |
| Browser/PWA fallback | READY | `docs/release/rollback-runbook.md` and `EV-DESKTOP-008`. |
| Server production separation | READY | `EV-DESKTOP-009`; desktop workflow and release gate are separate from server production deploy. |

## Evidence Hygiene

Repository-tracked evidence must stay reference-only. Do not commit private
endpoints, cloud account IDs, ARNs, cookies, tokens, signing secrets, provider
metadata, customer names, customer domains, document names, document snippets,
screenshots with private URLs, or local storage dumps.

## Next Actions

1. Review and merge this closeout PR if the reference-only evidence is accepted.
2. Produce any pilot or production desktop artifact in the external signing
   lane, then record digest and signature refs only.
3. Have customer or internal IT validate install, uninstall, digest, signature,
   rollback, and browser/PWA fallback.
4. Open pilot or production desktop distribution only through a separate desktop
   release approval; do not couple it to server production deploy.
