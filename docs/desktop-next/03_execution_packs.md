# 03. Execution Packs — AMIC Vault Desktop Next

검토일: 2026-06-21  
범위: native desktop 구현을 위한 plan-level PACK/TUW. 본 문서는 실행계획이며 코드를 포함하지 않는다. LazyCodex 실행 시에는 각 PACK을 더 작은 `LC-DESKTOP-*` goal로 나누고, 각 goal은 한 브랜치·한 PR·한 evidence directory 단위로 수행한다. `docs/package/`는 수정하지 않는다.

> Current-state note, 2026-06-22: this is the desktop lane plan, not the current
> implementation inventory. The live checkout now includes the Tauri shell,
> origin guard, capability-deny policy, desktop tests, and release-gate tooling.
> Treat the PACK descriptions below as historical/traceability material unless
> a newer gate explicitly reopens them.

## 0. 공통 실행 원칙

- 데스크톱화는 release/production lane과 분리된 branch/worktree에서 진행한다.
- `docs/package/` 이하 파일은 읽기 전용이다.
- 서버 권한·감사·검색·AI·문서 저장소를 우회하는 구현은 즉시 stop condition이다.
- 모든 PACK은 AMIC Vault constitution을 따른다: Permission-before-search, Permission-before-AI, Audit-by-default, Fail-closed, Immutable original, No silent external sharing, Sensitive data is not logged.
- 모든 PACK은 최소한 `pnpm docs:frozen`, `pnpm lint`, `pnpm typecheck`, `pnpm test`를 통과해야 한다. desktop native scaffold 이후에는 desktop-specific lint/typecheck/build/test를 추가한다.
- `pnpm test:integration` 전체 실행은 merge 전 최종 회귀로 수행한다. 환경상 전체 실행이 불가능한 경우 사유와 대체 evidence를 PR에 명시하고 human/security review를 받아야 한다.
- private endpoint, signing secret, token, cookie, AWS account id, customer data는 문서·예시·로그·test fixture에 넣지 않는다.
- LazyCodex evidence는 `.omo/evidence/<goal-id>/` 아래에 기록하고, executor completion은 `EVIDENCE_RECORDED: <path>`로 끝난다.

## 1. PACK sequence

| 순서 | PACK ID | 목적 | Human/security review |
|---:|---|---|---|
| 1 | DESKTOP-AUDIT | 현재 PWA/보안/캐시/감사 구현 재검증 | 필요 |
| 2 | DESKTOP-TAURI-FOUNDATION | `apps/desktop` Tauri v2 thin shell scaffold | 필요 |
| 3 | DESKTOP-ORIGIN-GUARD | approved origin config + navigation block | 필수 |
| 4 | DESKTOP-CAPABILITY-DENY | native capability deny-by-default | 필수 |
| 5 | DESKTOP-AUTH-SMOKE | webview auth/session smoke | 필요 |
| 6 | DESKTOP-AUDIT-PRESERVE | view/download audit preservation | 필수 |
| 7 | DESKTOP-NOLOCAL-STORAGE | local cache/storage negative tests | 필수 |
| 8 | DESKTOP-SIGNING-PLAN | macOS/Windows signing/notarization docs | 필수 |
| 9 | DESKTOP-UPDATER-POLICY | signed update + channel policy | 필수 |
| 10 | DESKTOP-RELEASE-GATE | CI/release evidence and rollback | 필수 |

## 2. DESKTOP-AUDIT — current PWA/security/cache/audit revalidation

### 목적

현재 repository의 PWA 구현, no-store 정책, service worker cache policy, desktop audit coverage, release evidence를 재검증하고 native desktop 착수 전 baseline을 고정한다.

### 포함 TUW

| TUW ID | Objective |
|---|---|
| DESKTOP-AUDIT-TUW-001 | 당시 repository tree와 desktop/native 구현 부재를 재확인했다. 현재 checkout에서는 `apps/desktop`이 존재한다. |
| DESKTOP-AUDIT-TUW-002 | PWA manifest, service worker, offline shell, cache policy, middleware를 baseline으로 문서화한다. |
| DESKTOP-AUDIT-TUW-003 | desktop-related unit/integration/smoke/UAT/evidence/rollback 문서를 재확인한다. |
| DESKTOP-AUDIT-TUW-004 | native desktop 착수 전 불확실 항목과 stop condition을 ledger 또는 planning doc에 남긴다. |

### create/modify files

- Create: `docs/desktop-next/00_current_state_audit.md`.
- Create: `docs/desktop-next/05_security_validation_matrix.md` 초안 또는 baseline section.
- Optionally modify: `docs/ledger/execution.md` append-only 기록. 실제 PACK 절차에서 요구될 때만.

### NOT-modify files

- `docs/package/**`.
- `apps/api/**`, `apps/web/**`, `workers/**`, `db/**`, `packages/**`.
- release production gate 파일.

### verification commands

- `pnpm docs:frozen`.
- `pnpm test -- apps/web/src/lib/pwa/cache-policy.spec.ts` 또는 repository runner가 지원하는 동등 명령.
- `pnpm test:integration -- desktop-document-cache`.
- `pnpm test:integration -- desktop-offline-leakage`.
- `pnpm test:integration -- desktop-view-download-audit`.
- `pnpm release:smoke -- --dry-run`.
- `pnpm launch:readiness`.

### stop conditions

- `docs/package/` 변경 필요가 발견되는 경우.
- PWA가 `/v1`, document, search, audit, AI, external, login 또는 auth-bearing request를 cache하는 경우.
- view/download audit event가 누락되는 경우.
- existing evidence가 private endpoint, token, cookie, customer data를 포함하는 경우.
- native desktop 구현이 이미 존재한다고 판단되나 ownership·security boundary가 불명확한 경우.

### rollback plan

문서-only PACK이므로 revert commit으로 rollback한다. PWA runtime 변경을 하지 않는다. audit 결과가 잘못된 경우 새 commit으로 정정하고 PR description에 correction note를 남긴다.

### human review

필요. Security reviewer가 cache/no-store/audit baseline과 native 착수 가능 여부를 승인해야 한다.

## 3. DESKTOP-TAURI-FOUNDATION — `apps/desktop` Tauri v2 thin shell scaffold

### 목적

원 계획은 `apps/desktop`을 새로 생성하되, 서버 runtime이나 데이터 저장소를 포함하지 않는 Tauri v2 thin shell foundation만 구성하는 것이었다. 현재 checkout에서는 foundation이 구현되어 있으므로 이 섹션은 traceability와 회귀 조건으로 읽는다.

### 포함 TUW

| TUW ID | Objective |
|---|---|
| DESKTOP-TAURI-FOUNDATION-TUW-001 | `apps/desktop` package scaffold를 추가한다. |
| DESKTOP-TAURI-FOUNDATION-TUW-002 | Tauri v2 기본 설정을 thin shell 모드로 구성하되 private origin을 hard-code하지 않는다. |
| DESKTOP-TAURI-FOUNDATION-TUW-003 | desktop package를 pnpm/turbo workflow에 최소 통합한다. |
| DESKTOP-TAURI-FOUNDATION-TUW-004 | default build/test scripts와 smoke placeholder를 추가한다. |
| DESKTOP-TAURI-FOUNDATION-TUW-005 | README 또는 docs section에 “not local Vault runtime” invariant를 명시한다. |

### create/modify files

- Create: `apps/desktop/package.json`.
- Create: `apps/desktop/src-tauri/Cargo.toml`.
- Create: `apps/desktop/src-tauri/tauri.conf.json`.
- Create: `apps/desktop/src-tauri/src/main.rs`.
- Create: `apps/desktop/src-tauri/capabilities/default.json`.
- Create: `apps/desktop/tests/README.md` or test scaffold docs.
- Modify only if needed: `turbo.json` for desktop build outputs.
- Modify only if needed: `pnpm-workspace.yaml`. Current `apps/*` glob already covers `apps/desktop`; change only if tooling requires explicit desktop handling.

### NOT-modify files

- `docs/package/**`.
- `apps/api/**`, except no change should be necessary.
- `apps/web/**`, except no change should be necessary.
- `db/**`, `workers/**`, `packages/ai/**`, search/vector/model gateway code.
- `docs/release/production-*` or production deployment gates.

### verification commands

- `pnpm install`.
- `pnpm --filter @amic-vault/desktop lint`.
- `pnpm --filter @amic-vault/desktop typecheck`.
- `pnpm --filter @amic-vault/desktop test`.
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`.
- `pnpm --filter @amic-vault/desktop tauri info`.
- `pnpm --filter @amic-vault/desktop tauri build --debug` for local non-release artifact only.
- `pnpm lint`.
- `pnpm typecheck`.
- `pnpm test`.
- `pnpm docs:frozen`.

### stop conditions

- Tauri scaffold requires bundling `apps/api`, PostgreSQL, MinIO/S3, worker, search index, vector store, model gateway, or document database.
- Private endpoint or production URL must be committed to make the app run.
- native capability must be opened before deny-by-default tests exist.
- package requires Electron or Node runtime as a dependency without separate approval.
- any server permission/audit/search/AI code change is proposed as “desktop foundation”.

### rollback plan

Delete `apps/desktop` and revert workspace/turbo changes. Since no server or data migration is allowed, rollback is repository-only.

### human review

필수에 준함. Architecture + Security review required before merge because this establishes the native boundary.

## 4. DESKTOP-ORIGIN-GUARD — approved origin config + navigation block

### 목적

Tauri shell이 승인된 Vault web origin만 열도록 하고, unapproved origin navigation, downgrade, private endpoint leakage를 fail-closed로 차단한다.

### 포함 TUW

| TUW ID | Objective |
|---|---|
| DESKTOP-ORIGIN-GUARD-TUW-001 | environment별 approved origin ref schema를 정의한다. |
| DESKTOP-ORIGIN-GUARD-TUW-002 | runtime origin resolver가 missing/invalid config를 차단하도록 한다. |
| DESKTOP-ORIGIN-GUARD-TUW-003 | webview navigation event에서 unapproved origin을 block한다. |
| DESKTOP-ORIGIN-GUARD-TUW-004 | local development 외 HTTP downgrade를 차단한다. |
| DESKTOP-ORIGIN-GUARD-TUW-005 | origin block log가 allow-listed fields만 기록함을 테스트한다. |

### create/modify files

- Modify: `apps/desktop/src-tauri/src/main.rs` or split guard module.
- Create: `apps/desktop/src-tauri/src/origin_guard.rs` or equivalent.
- Create: `apps/desktop/tests/origin-guard.spec.ts` or Rust tests.
- Create/modify: `docs/release/desktop-origin-policy.md` only if adding non-secret policy refinements.

### NOT-modify files

- `docs/package/**`.
- `apps/api/**`, `apps/web/**`, `db/**`, `workers/**`.
- Any file containing private endpoints, account ids, tokens, cookies, or customer data.

### verification commands

- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml origin`.
- `pnpm --filter @amic-vault/desktop test -- origin`.
- `pnpm --filter @amic-vault/desktop tauri build --debug`.
- `pnpm test:integration -- desktop-offline-leakage`.
- `pnpm docs:frozen`.

### stop conditions

- production/staging target requires raw endpoint value in git.
- SSO/IdP redirect handling is needed but approved IdP origin policy is missing.
- an unapproved origin can render inside the webview.
- origin guard logs full URL containing private data.

### rollback plan

Revert guard changes to previous foundation commit. If origin policy was refined incorrectly, revert doc change and keep Tauri shell unpublished.

### human review

필수. Origin allow-list and navigation blocking are security boundary controls.

## 5. DESKTOP-CAPABILITY-DENY — native capability deny-by-default

### 목적

Tauri native capability를 기본적으로 닫고, filesystem, clipboard, dialog, shell open, HTTP bypass, native share/mail compose 등이 server gate를 우회하지 못하도록 한다.

### 포함 TUW

| TUW ID | Objective |
|---|---|
| DESKTOP-CAPABILITY-DENY-TUW-001 | default capability file을 deny-by-default로 구성한다. |
| DESKTOP-CAPABILITY-DENY-TUW-002 | filesystem read/write, shell open, clipboard, dialog, notification, global shortcut, share/mail compose capability가 닫혀 있음을 static test로 증명한다. |
| DESKTOP-CAPABILITY-DENY-TUW-003 | capability request가 필요해지는 경우 별도 ADR 없이는 build/test가 fail하도록 policy check를 추가한다. |
| DESKTOP-CAPABILITY-DENY-TUW-004 | native download/open behavior가 server audit route를 우회하지 않는다는 invariant를 문서화한다. |

### create/modify files

- Modify: `apps/desktop/src-tauri/capabilities/default.json`.
- Create: `apps/desktop/tests/capability-deny.spec.ts`.
- Create: `tools/release/check-desktop-capabilities.mjs` or equivalent policy checker if repository convention permits.
- Modify: `package.json` only if adding a root script for capability check is approved.

### NOT-modify files

- `docs/package/**`.
- `apps/api/**`, `apps/web/**`.
- Any document/download/search/AI/audit route implementation.
- External sharing or Outlook/M365 integration code.

### verification commands

- `pnpm --filter @amic-vault/desktop test -- capability`.
- `pnpm desktop:capabilities:check` if added.
- `pnpm lint`.
- `pnpm typecheck`.
- `pnpm test`.
- `pnpm docs:frozen`.

### stop conditions

- a native capability is required for MVP without separate ADR and threat model.
- native file open/download/share/mail path is introduced.
- filesystem or clipboard permissions are opened for convenience.
- capability tests are implemented as allow-only tests without negative assertions.

### rollback plan

Revert capability config and tests to previous deny-all state. Do not ship any desktop artifact from this branch.

### human review

필수. Native capability changes can bypass server permission/audit boundaries.

## 6. DESKTOP-AUTH-SMOKE — webview auth/session smoke

### 목적

Tauri webview에서 server-owned auth/session behavior가 browser/PWA와 동일하게 유지되는지 확인한다. Desktop은 token issuer, credential store, or session proxy가 되지 않는다.

### 포함 TUW

| TUW ID | Objective |
|---|---|
| DESKTOP-AUTH-SMOKE-TUW-001 | unauthenticated launch가 `/login`으로 redirect되는지 smoke test한다. |
| DESKTOP-AUTH-SMOKE-TUW-002 | approved synthetic credential login 후 server session cookie로 dashboard가 열리는지 확인한다. |
| DESKTOP-AUTH-SMOKE-TUW-003 | logout 후 protected route가 다시 login으로 redirect되는지 확인한다. |
| DESKTOP-AUTH-SMOKE-TUW-004 | desktop logs/test evidence에 cookie, token, password, private URL이 없는지 scan한다. |
| DESKTOP-AUTH-SMOKE-TUW-005 | SSO/SAML webview behavior는 pending open question으로 남기고 임의 구현하지 않는다. |

### create/modify files

- Create: `apps/desktop/tests/auth-session-smoke.spec.ts`.
- Create/modify: `docs/release/desktop-it-handoff.md` session behavior note, if handoff doc exists in later pack.
- Optionally create: `tools/release/check-desktop-log-redaction.mjs` if shared with log validation.

### NOT-modify files

- `apps/api/src/modules/auth/**` unless a separately approved server auth PACK exists.
- session schema, token format, password/MFA logic.
- `docs/package/**`.
- SSO/SAML provider registry or external IdP docs without separate decision.

### verification commands

- `pnpm --filter @amic-vault/desktop test -- auth-session`.
- `pnpm release:smoke -- --local` or approved staging smoke when available.
- `pnpm test:integration -- cross-tenant`.
- `pnpm test:integration -- audit-coverage`.
- `pnpm docs:frozen`.

### stop conditions

- desktop needs to read or persist token/cookie to implement login.
- auth smoke requires weakening server cookie/session settings.
- logs contain cookie, token, password, reset token, private endpoint, or customer data.
- SSO/SAML behavior is required but no approved origin/redirect policy exists.

### rollback plan

Revert smoke tests and any desktop-only session handling. Keep browser/PWA login as fallback. No server auth migration is allowed in this PACK.

### human review

필요. Required if session handling differs from browser/PWA behavior.

## 7. DESKTOP-AUDIT-PRESERVE — view/download audit preservation

### 목적

Desktop view/download/native-open flows가 existing server API를 경유하며 `DOCUMENT_VIEWED` 및 `DOCUMENT_DOWNLOADED` audit semantics를 유지하는지 증명한다.

### 포함 TUW

| TUW ID | Objective |
|---|---|
| DESKTOP-AUDIT-PRESERVE-TUW-001 | desktop shell document detail navigation이 existing server route를 사용함을 확인한다. |
| DESKTOP-AUDIT-PRESERVE-TUW-002 | document download가 server route를 사용하고 no-store header를 유지함을 확인한다. |
| DESKTOP-AUDIT-PRESERVE-TUW-003 | native open/download shortcut이 없거나, 있더라도 server audit route 이후에만 동작함을 negative test한다. |
| DESKTOP-AUDIT-PRESERVE-TUW-004 | unauthorized view/download 시 safe denial과 `ACCESS_DENIED` audit behavior를 확인한다. |

### create/modify files

- Create: `apps/desktop/tests/audit-preserve.spec.ts`.
- Modify only if necessary: `tests/integration/audit-coverage/desktop-view-download-audit.spec.ts` to add desktop shell evidence while preserving server test.
- Create/modify: `docs/release/evidence-register.md` only with non-secret evidence refs in later release gate pack.

### NOT-modify files

- PermissionService implementation.
- AuditService semantics.
- document controller/service download/view logic unless separate server bugfix PR is required.
- `docs/package/**`.

### verification commands

- `pnpm --filter @amic-vault/desktop test -- audit-preserve`.
- `pnpm test:integration -- desktop-view-download-audit`.
- `pnpm test:integration -- document-access`.
- `pnpm test:integration -- audit-coverage`.
- `pnpm docs:frozen`.

### stop conditions

- desktop can read file bytes without server route.
- document view/download completes when AuditService write fails.
- audit metadata contains document body, snippet, private title, token, cookie, or local file path with sensitive content.
- native open/download bypasses permission checks.

### rollback plan

Disable native desktop artifact publication and revert desktop audit test changes. Browser/PWA path remains the supported path until evidence is green.

### human review

필수. Audit-by-default preservation is a constitutional invariant.

## 8. DESKTOP-NOLOCAL-STORAGE — local cache/storage negative tests

### 목적

desktop shell과 PWA가 document body, search result, AI context, audit row, tenant/matter/document data를 local cache/DB/index/log에 저장하지 않음을 negative tests로 증명한다.

### 포함 TUW

| TUW ID | Objective |
|---|---|
| DESKTOP-NOLOCAL-STORAGE-TUW-001 | service worker cache keys를 inspect하여 sensitive routes가 없는지 확인한다. |
| DESKTOP-NOLOCAL-STORAGE-TUW-002 | webview/app data directory에 document/search/AI/audit markers가 없는지 fixture scan한다. |
| DESKTOP-NOLOCAL-STORAGE-TUW-003 | desktop logs에 denied fields가 없는지 redaction scan한다. |
| DESKTOP-NOLOCAL-STORAGE-TUW-004 | offline mode에서 search/document/AI/audit pages가 safe unavailable/login flow 외 content를 render하지 않음을 검증한다. |
| DESKTOP-NOLOCAL-STORAGE-TUW-005 | local DB/index/file store dependency가 추가되지 않았음을 dependency/static scan한다. |

### create/modify files

- Create: `apps/desktop/tests/no-local-storage.spec.ts`.
- Modify: `tests/integration/document-access/desktop-document-cache.spec.ts` only if extending existing coverage.
- Modify: `tests/integration/metadata-leakage/desktop-offline-leakage.spec.ts` only if extending existing coverage.
- Create: `tools/release/check-desktop-local-storage.mjs` if necessary.

### NOT-modify files

- `apps/api/**`, `db/**`, `workers/**`, search/vector/AI implementation.
- `docs/package/**`.
- Any feature that creates local encrypted vault cache, offline queue, local OCR, or local AI.

### verification commands

- `pnpm --filter @amic-vault/desktop test -- no-local-storage`.
- `pnpm test:integration -- desktop-document-cache`.
- `pnpm test:integration -- desktop-offline-leakage`.
- `pnpm test:integration -- metadata-leakage`.
- `pnpm docs:frozen`.

### stop conditions

- local persistence of document body, preview, filename, title, snippet, search result, AI context, audit row, tenant/matter/document data is detected.
- “encrypted local cache” is proposed without separate ADR and customer/legal decision.
- offline document access is requested as scope creep.
- browser/webview storage cannot be inspected sufficiently for negative evidence.

### rollback plan

Revert desktop local storage changes and keep PWA-only distribution. If PWA cache regression is found, use existing Desktop/PWA rollback runbook to unregister service worker and return users to browser-only access.

### human review

필수. This PACK proves the most important desktop non-persistence invariant.

## 9. DESKTOP-SIGNING-PLAN — macOS/Windows signing/notarization docs

### 목적

macOS와 Windows 배포에 필요한 signing, notarization, installer packaging 절차를 문서화하되, signing secret, private endpoint, account id, customer data를 repo에 넣지 않는다.

### 포함 TUW

| TUW ID | Objective |
|---|---|
| DESKTOP-SIGNING-PLAN-TUW-001 | macOS Developer ID, hardened runtime, notarization, stapling, entitlement 최소화 절차를 정의한다. |
| DESKTOP-SIGNING-PLAN-TUW-002 | Windows code signing 및 MSIX/installer 선택 기준을 정의한다. |
| DESKTOP-SIGNING-PLAN-TUW-003 | signing material custody, CI secret boundary, manual approval step을 정의한다. |
| DESKTOP-SIGNING-PLAN-TUW-004 | artifact digest, signer identity, release evidence ref 양식을 정의한다. |

### create/modify files

- Create: `docs/release/desktop-signing-plan.md`.
- Create: `docs/release/desktop-macos-distribution.md`.
- Create: `docs/release/desktop-windows-distribution.md`.
- Create/modify: `docs/release/desktop-it-handoff.md` if handoff doc is grouped here.

### NOT-modify files

- `docs/package/**`.
- `apps/api/**`, `apps/web/**`, `apps/desktop/**` unless build signing hooks are separately approved.
- Any file containing certificate private key, Apple account secrets, Windows signing secret, notarization credentials, raw endpoint values, customer data.

### verification commands

- `pnpm docs:frozen`.
- `pnpm launch:readiness`.
- repository secret scan for patterns: token, cookie, private endpoint, AWS account id, certificate private key, password.
- markdown link/path check if available in repository tooling.

### stop conditions

- signing certificate private key or notarization credential would need to be committed.
- release docs require raw Apple/Windows account identifiers not approved for repo.
- customer-specific private deployment endpoint is requested in docs.
- signing owner and approval authority are not assigned.

### rollback plan

Revert docs. No artifact signing is performed in this PACK.

### human review

필수. Security/Ops must approve custody and release evidence model.

## 10. DESKTOP-UPDATER-POLICY — signed update + channel policy

### 목적

Tauri updater 또는 external update process가 signed artifact와 approved channel만 허용하도록 정책과 tests를 정의한다.

### 포함 TUW

| TUW ID | Objective |
|---|---|
| DESKTOP-UPDATER-POLICY-TUW-001 | release channels `local`, `staging`, `pilot`, `production`을 정의한다. |
| DESKTOP-UPDATER-POLICY-TUW-002 | update manifest와 artifact signature/digest validation policy를 정의한다. |
| DESKTOP-UPDATER-POLICY-TUW-003 | unsigned artifact, wrong-channel artifact, rollback artifact를 처리하는 fail-closed behavior를 정의한다. |
| DESKTOP-UPDATER-POLICY-TUW-004 | updater endpoint refs를 repo에 저장하되 raw private endpoint는 저장하지 않는 rule을 정의한다. |
| DESKTOP-UPDATER-POLICY-TUW-005 | updater tests 또는 policy checker를 추가한다. |

### create/modify files

- Create: `docs/release/desktop-update-policy.md`.
- Create: `docs/release/desktop-release-channels.md`.
- Create: `apps/desktop/tests/update-policy.spec.ts` if implementation reaches testable stage.
- Modify: `apps/desktop/src-tauri/tauri.conf.json` only if updater is enabled with signed policy and non-secret refs.

### NOT-modify files

- `docs/package/**`.
- API/web production deployment config.
- Any endpoint secret, token, signing key, private URL, customer data.
- Auto-update logic that bypasses channel approval.

### verification commands

- `pnpm --filter @amic-vault/desktop test -- update-policy`.
- `pnpm docs:frozen`.
- `pnpm launch:execution`.
- secret scan for raw endpoints and tokens.
- signed/wrong-channel/unsigned update negative tests.

### stop conditions

- updater cannot reject unsigned artifact.
- staging artifact can update production channel or production artifact can update staging channel without explicit policy.
- update manifest needs raw private URL or signing secret in repo.
- rollback cannot pin users to browser/PWA or previous desktop channel.

### rollback plan

Disable updater config, keep static installer-only distribution, and direct users to browser/PWA fallback. Revert update policy changes if test evidence is insufficient.

### human review

필수. Update path is a supply-chain and remote code execution boundary.

## 11. DESKTOP-RELEASE-GATE — CI/release evidence and rollback

### 목적

Desktop native release가 server production lane을 우회하지 않도록 CI, evidence, release gate, rollback, customer IT handoff를 정리한다.

### 포함 TUW

| TUW ID | Objective |
|---|---|
| DESKTOP-RELEASE-GATE-TUW-001 | desktop CI matrix를 server production deploy와 분리한다. |
| DESKTOP-RELEASE-GATE-TUW-002 | desktop artifact evidence refs, digest, signature, channel approval rows를 evidence register에 추가한다. |
| DESKTOP-RELEASE-GATE-TUW-003 | rollback to browser/PWA and previous desktop artifact 절차를 문서화한다. |
| DESKTOP-RELEASE-GATE-TUW-004 | customer IT handoff pack을 정의한다. |
| DESKTOP-RELEASE-GATE-TUW-005 | merge 전 full verification checklist와 human/security review gate를 확정한다. |

### create/modify files

- Create/modify: `.github/workflows/desktop.yml` or repository CI equivalent, if CI is managed in repo.
- Create/modify: `docs/release/evidence-register.md` using evidence refs only.
- Create/modify: `docs/release/rollback-runbook.md` desktop native subsection.
- Create: `docs/release/desktop-it-handoff.md`.
- Create: `docs/release/desktop-release-checklist.md`.
- Modify: `infra/ci/PROD_GATE.md` or production gate docs only to add desktop artifact approval rows, not to enable production auto-deploy.

### NOT-modify files

- `docs/package/**`.
- server production deployment scripts in a way that couples desktop artifact approval to API/web/worker production deploy.
- any private evidence or customer-specific operational details.

### verification commands

- `pnpm docs:frozen`.
- `pnpm lint`.
- `pnpm typecheck`.
- `pnpm test`.
- `pnpm test:integration`.
- `pnpm release:smoke -- --dry-run`.
- `pnpm launch:readiness`.
- `pnpm launch:execution`.
- `pnpm --filter @amic-vault/desktop tauri build --debug`.
- `pnpm --filter @amic-vault/desktop test`.
- signing/updater policy negative tests where available.

### stop conditions

- desktop artifact release can trigger server production deploy.
- release evidence includes private endpoints, account ids, tokens, cookies, customer data, screenshots with private URLs.
- rollback to browser/PWA is not documented or not testable.
- CI publishes unsigned or wrong-channel artifact.
- Security reviewer cannot reproduce origin/capability/no-local-storage evidence.

### rollback plan

Do not publish or withdraw desktop artifact. Disable updater channel. Direct users to approved browser/PWA URL. If PWA is also implicated, execute Desktop/PWA rollback runbook: disable service worker registration, deploy unregister worker, delete desktop shell caches, and return to browser-only access.

### human review

필수. Required reviewers: product architecture, security, release/Ops, and at least one server-side PermissionService/AuditService owner.

## 12. Recommended first PR

| 항목 | 권고 |
|---|---|
| PR 이름 | `docs(desktop): add desktop-next execution plan` |
| Branch 이름 | `docs/desktop-next-plan` |
| Scope | 문서-only. 현재 PWA/native 상태 audit, product decision, target architecture, execution packs, file-level plan, validation matrix, release/packaging plan, open questions를 추가한다. 코드, server behavior, web PWA runtime, CI, release production lane은 변경하지 않는다. |
| 파일 목록 | `docs/desktop-next/00_current_state_audit.md`; `docs/desktop-next/01_desktop_product_decision.md`; `docs/desktop-next/02_target_architecture.md`; `docs/desktop-next/03_execution_packs.md`; `docs/desktop-next/04_file_level_plan.md`; `docs/desktop-next/05_security_validation_matrix.md`; `docs/desktop-next/06_release_and_packaging_plan.md`; `docs/desktop-next/07_open_questions.md` |
| 검증 명령 | `pnpm docs:frozen`; `pnpm launch:readiness`; `pnpm launch:execution`; `pnpm release:smoke -- --dry-run`; `pnpm lint`; `pnpm typecheck` |
| Merge 전 review 조건 | Product architecture review, security review, release/Ops review. Reviewer는 target branch의 desktop 상태가 정확히 기록되었는지, “Tauri thin shell은 local Vault runtime이 아니다”, “server PermissionService/AuditService/search/AI/document storage authority를 우회하지 않는다”, “docs/package는 변경되지 않았다”, “문서에 secret/private endpoint/token/cookie/customer data가 없다”를 확인해야 한다. |
