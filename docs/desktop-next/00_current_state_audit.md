# 00. Current State Audit — AMIC Vault Desktop Next

검토일: 2026-06-21  
검토 기준: GitHub `Gonyak-cell/amic-vault`, default branch `main`; LazyCodex worktree `/Users/jws/Projects/amic-vault-desktop-lazycodex` 기준 SHA는 `ecec8384b91b205fc95be5ba9b2a640bc16d3271`이다.  
검토 방식: 첨부 desktop-next 패키지의 GitHub 기반 초안을 가져온 뒤, 로컬 LazyCodex worktree에서 `git ls-files`, repository tree, 기존 desktop/PWA 문서, PWA asset 존재 여부를 재검증했다. 후속 PR에서는 CI에서 동일 파일 존재·부재 및 테스트 명령을 다시 검증해야 한다.

## 1. 결론

현재 상태를 “이미 네이티브 데스크톱 앱”이라고 부르면 안 된다. 현재 저장소에는 PWA/installable web app 기반의 데스크톱 설치 가능성 구현과 그에 관한 보안·릴리즈 증거가 존재한다. 반면 `apps/desktop`, `src-tauri`, Tauri v2 앱 scaffold, Electron 앱 구현은 확인되지 않았다. 따라서 native desktop은 별도의 `apps/desktop` Tauri thin shell 단계로 구현해야 한다.

데스크톱 앱의 목적은 서버를 대체하는 것이 아니라 승인된 Vault web origin을 안전하게 감싸는 것이다. NestJS API, PostgreSQL, MinIO/S3, ingestion worker, search index, vector store, model gateway, PermissionService, AuditService는 서버 권한 경계에 남아야 한다.

## 2. 현재 repo에서 확인한 사실

| 항목 | 확인 결과 | 근거 파일 |
|---|---|---|
| 프로젝트 성격 | 로펌용 멀티테넌트 문서·사건 보관/권한/감사/검색 시스템. 스택은 NestJS, Next.js, PostgreSQL RLS, Python ingestion worker, pg-boss, MinIO/S3 계열로 규정됨. | `AGENTS.md`; `docs/package/codex/00_Master_Brief.md` |
| docs/package 처리 | `docs/package/` 이하 전체는 읽기 전용으로 규정되어 있음. | `AGENTS.md`; `docs/package/codex/00_Master_Brief.md` |
| Constitution | Permission-before-search, Permission-before-AI, Audit-by-default, Fail-closed, Immutable original, No silent external sharing, Sensitive data is not logged가 전역 원칙. | `AGENTS.md`; `docs/package/codex/00_Master_Brief.md` |
| 모노레포 구조 | `pnpm-workspace.yaml`은 `apps/*`, `packages/*`, `workers/*`를 workspace로 포함. | `pnpm-workspace.yaml` |
| root scripts | root `package.json`은 `lint`, `typecheck`, `test`, `build`, `test:integration`, `release:*`, `docs:frozen` 등 서버·웹·릴리즈 검증 스크립트를 보유. | `package.json` |
| API 앱 | `apps/api/package.json`이 존재하고 package name은 `@amic-vault/api`. NestJS, pg, pg-boss, pino 등을 사용. | `apps/api/package.json` |
| Web 앱 | `apps/web/package.json`이 존재하고 package name은 `@amic-vault/web`. Next.js 14, React 18 기반. | `apps/web/package.json` |
| API cache hardening | API bootstrap에서 `noStoreApiMiddleware`를 전역 적용하고 `/v1` prefix를 설정함. | `apps/api/src/main.ts`; `apps/api/src/common/security/no-store.middleware.ts` |
| Web cache hardening | Next middleware가 sensitive route에 `Cache-Control: no-store, no-cache, max-age=0, must-revalidate, private`, `Pragma: no-cache`, `Expires: 0`를 적용함. | `apps/web/src/middleware.ts`; `apps/web/src/lib/pwa/cache-policy.ts` |

## 3. `apps/api`, `apps/web` 중심 구조 확인

현재 저장소는 `apps/api` 및 `apps/web` 중심으로 구성되어 있다.

- `apps/api/package.json`: `@amic-vault/api`, NestJS 앱, CommonJS, `lint`, `typecheck`, `test`, `build`, `start` 스크립트 보유.
- `apps/web/package.json`: `@amic-vault/web`, Next.js 앱, `lint`, `typecheck`, `test`, `build`, `start` 스크립트 보유.
- `pnpm-workspace.yaml`: `apps/*`, `packages/*`, `workers/*`를 workspace 범위로 포함. 따라서 향후 `apps/desktop`을 추가하면 workspace glob에는 자연 편입되지만, desktop 전용 scripts, build output, CI matrix는 별도 정의가 필요하다.
- `docs/package/codex/00_Master_Brief.md`의 저장소 구조 표도 `apps/api`, `apps/web`, `packages/shared`, `packages/domain`, `packages/ai`, `workers/ingestion`, `db`, `infra`, `docs`, `tools`, `tests`를 기준으로 한다.

## 4. native desktop 구현 유무

| 확인 대상 | 결과 | 비고 |
|---|---|---|
| `apps/desktop/package.json` | 없음. GitHub contents 조회 결과 404. | Tauri/Electron 앱 package가 아직 없음. |
| `apps/desktop/*` | 별도 구현 확인 안 됨. | `docs/desktop-next`도 기존에는 없음. |
| `src-tauri` | 코드 검색에서 구현 파일이 아니라 `docs/desktop/desktop-app-plan.md`만 관련 결과로 확인됨. | 실제 Tauri scaffold 없음. |
| Tauri dependency | `@tauri-apps`, `tauri.conf`, `capabilities/default.json` 등 검색 결과 없음. | 후속 PR에서 recursive tree check로 재검증 필요. |
| Electron 구현 | `BrowserWindow`, Electron package/dependency 검색 결과 없음. | Electron은 계획상 fallback이어야 함. |

이상에 따라 현재 앱은 네이티브 데스크톱 앱이 아니라 PWA/installable web app 기반이다. native desktop은 별도 `apps/desktop` Tauri v2 thin shell 구현으로 착수해야 한다.

## 5. PWA 구현 상태

| 파일 | 상태 | 확인 내용 |
|---|---|---|
| `apps/web/public/manifest.webmanifest` | 존재 | `name`은 `AMIC Vault`, `short_name`은 `Vault`, `start_url`은 `/dashboard?source=pwa`, `scope`는 `/`, `display`는 `standalone`, icon set 포함. |
| `apps/web/public/sw.js` | 존재 | `CACHE_NAME`은 `amic-vault-desktop-shell-v1`; precache는 offline shell, manifest, icons 중심. 허용 cache prefix는 `/_next/static/`, `/fonts/amic/`, `/icons/`; 허용 path는 `/manifest.webmanifest`, `/offline.html`. `/v1`, `/dashboard`, `/matters`, `/search`, `/documents`, `/audit`, `/records`, `/ai`, `/external`, `/login` 등은 deny-list. Authorization header 보유 요청도 cache bypass. deny-list 평가가 allow-list 평가보다 앞선다. |
| `apps/web/public/offline.html` | 존재 | 정적 offline shell. 한국어 안전 문구만 포함하고 tenant/matter/document/search/audit/AI 상태를 표시하지 않도록 설계됨. |
| `apps/web/src/app/pwa-registration.tsx` | 존재 | production에서만 service worker를 `/sw.js`, scope `/`로 등록. online/offline 상태에 따라 `OfflineStatus`를 표시. |
| `apps/web/src/components/pwa/offline-status.tsx` | 존재 | offline 상태 안내 UI. |
| `apps/web/src/lib/pwa/cache-policy.ts` | 존재 | PWA desktop cache 정책 함수와 `DESKTOP_NO_STORE_HEADER_VALUE` 정의. |
| `apps/web/src/lib/pwa/cache-policy.spec.ts` | 존재 | static shell asset만 cache 허용, authenticated/API paths `no-store`, no-store value 검증. |
| `apps/web/src/app/layout.tsx` | 존재 | `manifest: /manifest.webmanifest`, Apple/mobile web app metadata, `PwaRegistration` 포함. |
| `apps/web/src/middleware.ts` | 존재 | sensitive route matcher에 `no-store` header 적용 및 auth redirect 처리. |

현재 PWA 구현은 “desktop-installable web app” 단계로 평가된다. 다만 이 구현은 native OS installer, signed update, notarization, origin guard를 제공하지 않는다.

## 6. 기존 데스크톱 계획 문서 확인

| 파일 | 읽은 결론 |
|---|---|
| `AGENTS.md` | `docs/package/` 읽기 전용, Constitution, PermissionService 우회 금지, sensitive data logging 금지, PACK 단위 실행, human review gate 등 전역 수칙 확인. |
| `docs/package/codex/00_Master_Brief.md` | Normative 문서. DEC-03 NestJS/pnpm turborepo, DEC-04 Next.js, DEC-05 PostgreSQL, DEC-06 Python ingestion, DEC-07 S3 호환 스토리지, DEC-09 자체 세션, DEC-11 외부 AI 차단 등 확인. |
| `docs/package/codex/50_Verification_Security_Gates.md` | 표준 검증 명령, canonical integration suite 10개 디렉터리, AND verification semantics, negative test 4요소, R2 document audit 및 R3 search metadata leakage gate 확인. |
| `docs/package/codex/60_Execution_Packs.md` | PACK은 한 브랜치·한 PR 단위이며, 선행 PACK 및 Gate 통과 전 다음 release 착수 금지. Risk=C는 human review 필수. |
| `docs/adr/ADR-014-desktop-client-strategy.md` | Status는 Proposed. 결정은 PWA-first + 필요 시 Tauri v2 thin shell. Tauri는 approved Vault web origin을 로드하며 서버 런타임을 bundle하지 않음. Electron은 fallback. |
| `docs/desktop/desktop-app-plan.md` | Phase 1 PWA와 Phase 2 release evidence는 implemented로 기술되어 있음. Phase 3는 Tauri thin shell feasibility이며 `apps/desktop` scaffold는 아직 future task로 정의됨. |
| `docs/release/desktop-origin-policy.md` | repo에는 private endpoint, account id, ARN, secret, cookie, customer data를 넣지 않고 approved origin evidence ref만 기록해야 함. Tauri는 signed installer/update policy, origin allow-list, capability deny-by-default, local log allow-list 등이 있어야 착수 가능. |
| `docs/security/desktop-threat-model.md` | desktop surface는 access layer일 뿐 local runtime, local document store, local search index, audit authority가 아님. Server-owned controls가 인증, tenant context, PermissionService, AuditService, RLS, preview/download, search, AI, records, external portal policy를 보유. |
| `docs/security/desktop-cache-policy.md` | service worker allowed keys와 denied keys, response header, desktop log allow-list/deny-list가 명시됨. |

## 7. 이미 존재하는 테스트·릴리즈 증거

| 영역 | 기존 증거 | 현재 의미 |
|---|---|---|
| PWA cache policy unit test | `apps/web/src/lib/pwa/cache-policy.spec.ts` | static shell cache allow-list 및 sensitive no-store 정책을 검증. |
| Document/cache integration | `tests/integration/document-access/desktop-document-cache.spec.ts` | document, search, audit, records, AI, API paths가 cache policy에서 제외되는지 및 service worker deny-before-allow를 검증. |
| Offline leakage integration | `tests/integration/metadata-leakage/desktop-offline-leakage.spec.ts` | offline shell과 manifest가 tenant/matter/document/search/audit/AI/client 상태를 포함하지 않는지 검증. |
| View/download audit integration | `tests/integration/audit-coverage/desktop-view-download-audit.spec.ts` | document detail 및 download가 no-store header를 유지하고 `DOCUMENT_VIEWED`, `DOCUMENT_DOWNLOADED` audit event를 남기는지 검증. |
| Staging smoke | `tools/release/staging-smoke.mjs` | SMOKE-012~SMOKE-015가 manifest, service worker deny-list, offline shell, installability metadata를 점검. |
| Evidence register | `docs/release/evidence-register.md` | EV-DESKTOP-001~EV-DESKTOP-004가 PWA phase, desktop smoke, desktop UAT, rollback readiness를 기록. |
| Synthetic UAT | `docs/release/synthetic-uat-scenarios.md` | DESKTOP-UAT-001~005가 install/open, login, view/download audit, denied search, offline safe failure를 정의. |
| Rollback | `docs/release/rollback-runbook.md` | PWA rollback path가 service worker registration disable, unregister worker, cache deletion, browser-only fallback을 정의. |

## 8. 불확실하거나 추가 확인이 필요한 항목

1. 로컬 LazyCodex worktree에서는 `apps/desktop`, `src-tauri`, Electron/Tauri dependency가 확인되지 않았다. 후속 PR에서는 CI에서 `git ls-files`, `find apps -maxdepth ...`, dependency graph, lockfile scan으로 이 부재를 다시 확인해야 한다.
2. `docs/desktop/desktop-app-plan.md`의 Phase 1 task는 일부 integration spec 예시를 `*.int.spec.ts`로 표기하지만 실제 확인 파일은 `*.spec.ts`이다. runner가 keyword 방식으로 안정적으로 매핑되는지 확인해야 한다.
3. `apps/web/src/components/pwa/*`에는 현재 `offline-status.tsx`만 확인되었다. install prompt UI가 필요한지 여부는 product decision에서 별도 결정해야 한다.
4. `docs/release/desktop-signing-plan.md`, `docs/release/desktop-update-policy.md`, `docs/release/desktop-macos-distribution.md`, `docs/release/desktop-windows-distribution.md`, `docs/release/desktop-release-channels.md`, `docs/release/desktop-it-handoff.md`는 현 시점에 확인되지 않았다. Tauri 단계에서 새로 작성해야 한다.
5. production custom domain은 `desktop-origin-policy`상 broad customer rollout 전 필요하나 확정 여부가 문서상 확인되지 않는다.
6. 고객 IT가 signed installer, MSIX, notarized DMG/PKG, auto-update, offline mode, SSO/SAML webview behavior를 실제 요구하는지 확인되지 않는다.
7. Tauri v2의 remote origin loading, CSP, navigation event guard, updater signature validation은 아직 구현 증거가 없다. Phase 3에서 새로 검증해야 한다.

## 9. 현재 상태 기준 작업 원칙

- `docs/package/`는 읽기 전용이다.
- 데스크톱화는 release/production lane과 분리된 branch/worktree에서 진행한다.
- native desktop 구현 전에도 PWA 보안 회귀 테스트는 먼저 재실행한다.
- Tauri shell은 승인된 Vault web origin wrapper일 뿐이며, 로컬 Vault 런타임이 아니다.
- 서버 권한·감사·검색·AI·문서 저장소를 우회하는 native path는 설계 금지 항목이다.
