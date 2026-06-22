# Desktop Ledger Login Closeout - `18ac513`

Date: 2026-06-22
Status: TECHNICAL READY - EXTERNAL DISTRIBUTION EVIDENCE REQUIRED

## Scope

This closeout records the repo-local desktop ledger-login candidate evidence for
source commit `18ac51394a20a4fa02f5c97ff0fd224724b28138`.

The candidate enables global account ledger ID login through the existing AMIC
Vault web auth surface and keeps the Tauri desktop app as a thin shell over an
approved Vault origin. It does not authorize server production deploy, database
migration promotion, customer-wide native desktop distribution, external
sharing, updater enablement, or any local Vault runtime.

## Source Evidence

| Item | Evidence |
|---|---|
| Global login identity schema | PR #296, `feat(auth): add global account ledger login identities` |
| Account ledger auth login | PR #297, `feat(auth): resolve login by account ledger id` |
| Approved-origin desktop shell | PR #298, `feat(desktop): verify approved origin configs` |
| Account ledger admin API | PR #299, `feat(auth): add account ledger id assignment endpoint` |
| Account ledger admin UI | PR #300, `feat(web): add account ledger admin assignment panel` |
| Desktop/web delegation smoke | PR #301, `test(desktop): assert account ledger login stays web delegated` |
| Source SHA | `18ac51394a20a4fa02f5c97ff0fd224724b28138` |
| Release evidence register row | `EV-DESKTOP-012` |

## Repo-Local Verification

| Check | Result |
|---|---|
| `pnpm desktop:release-gate` | PASS |
| `pnpm desktop:release-gate -- --self-test` | PASS |
| `node tools/release/check-desktop-capabilities.mjs` | PASS |
| `node tools/release/check-desktop-local-storage.mjs` | PASS |
| `pnpm --filter @amic-vault/desktop test` | PASS, 7 files / 16 tests |
| `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` | PASS, 13 Rust tests |
| `pnpm --filter @amic-vault/desktop tauri:build` | PASS, local unsigned macOS `.app` bundle built |
| PR #301 root validation | PASS, including `pnpm build`, `pnpm test`, clean DB migrate/rollback/migrate/seed, and `pnpm test:integration` 91 files / 231 tests |

## Decision

| Gate | Decision | Notes |
|---|---|---|
| Ledger ID login candidate | TECHNICAL READY | Global account ledger ID login is implemented in web/API and desktop delegates auth/session state to the approved web origin. |
| Native artifact distribution | EXTERNAL EVIDENCE REQUIRED | Requires `DESKTOP-ARTIFACT-DIGEST-REF`, `DESKTOP-ARTIFACT-SIGNATURE-REF`, signing/notarization evidence where applicable, approved origin ref, and customer or internal IT acceptance. |
| Server production deploy | NOT AUTHORIZED BY THIS CLOSEOUT | Desktop artifact release remains separate from API, web, worker, database, storage, search, and traffic promotion. |
| Updater | DISABLED | Updater remains unavailable until a signed update manifest, channel binding, digest validation, rollback evidence, and security approval are recorded. |
| Rollback | PREPARED | Browser/PWA fallback and `RB-DESKTOP-NATIVE-001` remain the rollback path for native artifact issues. |

## Distribution Requirements Still Outside Repo

| Requirement | Required evidence |
|---|---|
| Artifact identity | `DESKTOP-ARTIFACT-DIGEST-REF` and release artifact storage or delivery ref |
| Signing | `DESKTOP-ARTIFACT-SIGNATURE-REF` and signing custody ref |
| macOS distribution | Developer ID signature, hardened runtime, notarization, stapling, and Gatekeeper smoke refs |
| Windows distribution | Signing, installer type, install/uninstall, and SmartScreen or customer IT refs |
| Approved origin | Reference-only origin approval, no private endpoint committed |
| Customer or internal IT acceptance | Install, launch, logout/session, no-cache marker scan, uninstall, support owner, and rollback owner refs |

## Evidence Hygiene

Repository-tracked evidence must stay reference-only. Do not commit private
endpoints, customer domains, cloud account IDs, ARNs, cookies, tokens, signing
secrets, provider metadata, customer names, document names, document snippets,
screenshots with private URLs, installer download URLs, or local storage dumps.

## Next Actions

1. Review and merge the stacked PRs #296 through #301, then review this
   closeout PR.
2. Produce any pilot or production desktop artifact in the external signing
   lane.
3. Record artifact digest, signature, signing/notarization, approved origin,
   customer IT acceptance, support owner, and rollback owner refs only.
4. Open pilot or production desktop distribution through a separate desktop
   release approval; do not couple it to server production deploy.
