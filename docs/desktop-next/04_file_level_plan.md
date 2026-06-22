# 04. File-Level Plan — AMIC Vault Desktop Next

검토일: 2026-06-21  
범위: 예상 파일 생성·수정 계획. 실제 구현 전 repository tree를 다시 확인하고, 기존 파일과 충돌하지 않도록 PR별 scope를 제한한다.

> Current-state note, 2026-06-22: this file is the original planned change map.
> The live checkout now contains many paths listed below as `create`, including
> `apps/desktop/**` and desktop release-gate docs/tools. Use
> `docs/current-code-state.md` and the live tree before treating any row below
> as remaining work.

## 1. Current structure basis

원 계획 작성 시점에는 `apps/api`와 `apps/web`만 확인되었고 `apps/desktop`은 미구현이었다. 현재 checkout에는 `apps/desktop`과 `docs/desktop-next`가 존재한다. `pnpm-workspace.yaml`은 `apps/*`를 포함하므로 desktop package는 workspace 범위에 들어간다.

## 2. File change table

| Path | Original planned action | PACK | Purpose | Collision / security note |
|---|---|---|---|---|
| `docs/desktop-next/00_current_state_audit.md` | create | DESKTOP-AUDIT | 현재 repo 사실관계, PWA/native 상태, 증거 및 불확실 항목 기록 | planning only. `docs/package/` 변경 금지 |
| `docs/desktop-next/01_desktop_product_decision.md` | create | DESKTOP-AUDIT | PWA/Tauri/Electron/fully native product decision | planning only |
| `docs/desktop-next/02_target_architecture.md` | create | DESKTOP-AUDIT | desktop 책임/비책임, origin/auth/logging/no-local-storage 경계 | planning only |
| `docs/desktop-next/03_execution_packs.md` | create | DESKTOP-AUDIT | PACK/TUW 단위 실행계획 | planning only |
| `docs/desktop-next/04_file_level_plan.md` | create | DESKTOP-AUDIT | 예상 파일 변경표 | planning only |
| `docs/desktop-next/05_security_validation_matrix.md` | create | DESKTOP-AUDIT | 위험별 test matrix | planning only |
| `docs/desktop-next/06_release_and_packaging_plan.md` | create | DESKTOP-AUDIT | signing/notarization/channels/handoff plan | planning only |
| `docs/desktop-next/07_open_questions.md` | create | DESKTOP-AUDIT | human decision list | planning only |
| `apps/desktop/package.json` | create | DESKTOP-TAURI-FOUNDATION | desktop package identity and scripts | no Electron dependency by default; no server runtime dependency |
| `apps/desktop/README.md` | create | DESKTOP-TAURI-FOUNDATION | local development and security boundary notes | must state “not local Vault runtime” |
| `apps/desktop/src-tauri/Cargo.toml` | create | DESKTOP-TAURI-FOUNDATION | Tauri Rust package manifest | no DB/storage/model/search dependencies |
| `apps/desktop/src-tauri/tauri.conf.json` | create | DESKTOP-TAURI-FOUNDATION; DESKTOP-UPDATER-POLICY | Tauri app config, windows, bundle, updater later | no private endpoint; updater disabled until signed policy exists |
| `apps/desktop/src-tauri/src/main.rs` | create | DESKTOP-TAURI-FOUNDATION; DESKTOP-ORIGIN-GUARD | app bootstrap and origin guard wiring | no direct API calls bypassing web/server |
| `apps/desktop/src-tauri/src/origin_guard.rs` | create | DESKTOP-ORIGIN-GUARD | approved origin resolution and navigation blocking | must fail closed; log only allow-listed fields |
| `apps/desktop/src-tauri/src/log_policy.rs` | create if needed | DESKTOP-ORIGIN-GUARD; DESKTOP-NOLOCAL-STORAGE | central allow-listed desktop logging | denied fields test required |
| `apps/desktop/src-tauri/capabilities/default.json` | create | DESKTOP-CAPABILITY-DENY | Tauri capability deny-by-default | filesystem/clipboard/dialog/shell/share/mail closed unless separate ADR |
| `apps/desktop/src-tauri/capabilities/*.json` | create only by later ADR | future deferred native integrations | specific capability opening | not allowed in initial desktop plan |
| `apps/desktop/tests/origin-guard.spec.ts` | create | DESKTOP-ORIGIN-GUARD | unapproved origin negative tests | include HTTPS downgrade and missing config |
| `apps/desktop/tests/capability-deny.spec.ts` | create | DESKTOP-CAPABILITY-DENY | native capability static/runtime deny tests | no allow-only tests |
| `apps/desktop/tests/auth-session-smoke.spec.ts` | create | DESKTOP-AUTH-SMOKE | login/logout/session smoke through webview | no token/cookie logging |
| `apps/desktop/tests/audit-preserve.spec.ts` | create | DESKTOP-AUDIT-PRESERVE | document view/download audit preservation through desktop path | must use server routes |
| `apps/desktop/tests/no-local-storage.spec.ts` | create | DESKTOP-NOLOCAL-STORAGE | cache/appdata/log scans for sensitive markers | document/search/AI/audit markers must be absent |
| `apps/desktop/tests/update-policy.spec.ts` | create | DESKTOP-UPDATER-POLICY | unsigned/wrong-channel update negative tests | only after updater policy exists |
| `pnpm-workspace.yaml` | modify only if necessary | DESKTOP-TAURI-FOUNDATION | workspace inclusion | current `apps/*` likely already sufficient; avoid churn |
| `turbo.json` | modify only if necessary | DESKTOP-TAURI-FOUNDATION | desktop build/test outputs or cache rules | avoid broad changes; do not include sensitive output paths |
| `package.json` | modify only if approved | DESKTOP-CAPABILITY-DENY; DESKTOP-RELEASE-GATE | optional root scripts for desktop checks | do not weaken existing scripts; no dependency sprawl |
| `pnpm-lock.yaml` | modify | DESKTOP-TAURI-FOUNDATION | dependency lock update | dependency review required; Electron prohibited by default |
| `.github/workflows/desktop.yml` | create if GitHub Actions is repo convention | DESKTOP-RELEASE-GATE | desktop build/test/signing matrix | signing secrets referenced only via CI secret names, not values |
| `tools/release/check-desktop-capabilities.mjs` | create if needed | DESKTOP-CAPABILITY-DENY | static capability policy gate | policy checker only; no secrets |
| `tools/release/check-desktop-local-storage.mjs` | create if needed | DESKTOP-NOLOCAL-STORAGE | local storage/log marker scan | fixture markers only, no real data |
| `tools/release/check-desktop-release-gate.mjs` | create if needed | DESKTOP-RELEASE-GATE | release artifact/evidence gate | ref-only evidence; no private endpoints |
| `docs/release/desktop-signing-plan.md` | create | DESKTOP-SIGNING-PLAN | signing custody and procedure | no private key, password, certificate material |
| `docs/release/desktop-update-policy.md` | create | DESKTOP-UPDATER-POLICY | signed update and channel policy | no update secret or raw private URL |
| `docs/release/desktop-release-channels.md` | create | DESKTOP-UPDATER-POLICY | local/staging/pilot/production channel rules | production channel separate from server deploy |
| `docs/release/desktop-macos-distribution.md` | create | DESKTOP-SIGNING-PLAN | macOS notarization and distribution | developer account owner by role/ref only |
| `docs/release/desktop-windows-distribution.md` | create | DESKTOP-SIGNING-PLAN | Windows signing/MSIX/installer plan | cert custody outside repo |
| `docs/release/desktop-it-handoff.md` | create | DESKTOP-RELEASE-GATE | customer IT handoff pack | include hashes/signature refs, not private endpoints |
| `docs/release/desktop-release-checklist.md` | create | DESKTOP-RELEASE-GATE | pre-release checklist | must include human/security review conditions |
| `docs/release/evidence-register.md` | modify | DESKTOP-RELEASE-GATE | desktop native evidence rows | evidence refs only; no raw evidence if sensitive |
| `docs/release/rollback-runbook.md` | modify | DESKTOP-RELEASE-GATE | native desktop rollback to browser/PWA and previous signed channel | preserve existing PWA rollback path |
| `infra/ci/PROD_GATE.md` | modify only if existing and appropriate | DESKTOP-RELEASE-GATE | add desktop artifact gate rows | must not enable production auto-deploy |
| `infra/ci/prod-gate.yml` | modify only with security approval | DESKTOP-RELEASE-GATE | desktop release evidence check | no automatic server production lane coupling |

## 3. Existing PWA files — modification policy

| Existing file | Current role | Modification rule |
|---|---|---|
| `apps/web/public/manifest.webmanifest` | PWA app identity | Do not modify in Tauri foundation. Modify only if PWA product identity changes; rerun manifest smoke and installability checks. |
| `apps/web/public/sw.js` | service worker cache allow/deny policy | Modify only for cache policy hardening. Any new cache key requires threat model update and negative tests. |
| `apps/web/public/offline.html` | safe offline shell | Must remain free of tenant/matter/document/search/audit/AI/client markers. |
| `apps/web/src/app/pwa-registration.tsx` | production-only service worker registration | Do not alter for Tauri foundation unless rollback or PWA policy change is approved. |
| `apps/web/src/components/pwa/offline-status.tsx` | offline status UI | Modify only for copy/UI changes that do not introduce sensitive state. |
| `apps/web/src/lib/pwa/cache-policy.ts` | web-side cache classification | Any change requires `cache-policy.spec.ts`, desktop cache, offline leakage tests. |
| `apps/web/src/lib/pwa/cache-policy.spec.ts` | cache policy unit tests | Extend, do not weaken. |
| `apps/web/src/middleware.ts` | sensitive route no-store | Do not remove no-store. Add routes only if new sensitive surfaces appear. |
| `apps/api/src/common/security/no-store.middleware.ts` | API no-store | Do not weaken. Desktop path must rely on this, not bypass it. |
| `apps/api/src/main.ts` | global middleware and `/v1` prefix | Desktop foundation should not modify. |

## 4. Files that must not be changed in desktop foundation PRs

- `docs/package/**`.
- `db/migrations/**`.
- `apps/api/src/modules/permission/**` unless a separate server permission bugfix PR is opened.
- `apps/api/src/modules/audit/**` unless a separate audit bugfix PR is opened.
- `apps/api/src/modules/search/**`, vector store, AI/model gateway modules.
- `workers/ingestion/**`.
- `packages/ai/**` except separately approved AI release work.
- external sharing, secure link, Outlook/M365, native share/mail compose surfaces.
- production deployment scripts in a way that couples desktop release to server production deploy.

## 5. PR slicing recommendation

| PR | Branch | Files |
|---|---|---|
| PR 1 | `docs/desktop-next-plan` | `docs/desktop-next/*.md` only |
| PR 2 | `feat/desktop-tauri-foundation` | `apps/desktop/**`, minimal workspace/turbo/lockfile changes |
| PR 3 | `feat/desktop-origin-guard` | `apps/desktop/src-tauri/src/origin_guard.*`, origin tests, non-secret policy refinements |
| PR 4 | `feat/desktop-capability-deny` | capability config/tests/policy checker |
| PR 5 | `test/desktop-auth-audit-nolocal` | auth, audit preservation, local storage negative tests |
| PR 6 | `docs/desktop-signing-updater` | signing, updater, channels, distribution docs |
| PR 7 | `release/desktop-gate` | CI/evidence/rollback/handoff gate |

No PR should mix desktop native scaffold with server permission/search/AI/audit behavior changes.
