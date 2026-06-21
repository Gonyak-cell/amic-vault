# 05. Security Validation Matrix — AMIC Vault Desktop Next

검토일: 2026-06-21  
목표: desktop/PWA/native shell에서 서버 권한·감사·검색·AI·문서 저장소를 우회하지 않는다는 점을 risk별로 검증한다.

## 1. Required validation matrix

| Risk | Current or future test location | Negative stimulus | Expected result | Evidence standard |
|---|---|---|---|---|
| Unapproved origin navigation | Future: `apps/desktop/tests/origin-guard.spec.ts`; Tauri Rust unit test | desktop config에 unapproved HTTPS origin, unknown scheme, HTTP non-local origin, private endpoint-looking value, external IdP origin without policy를 주입 | Webview navigation blocked; app fails closed; log contains only reason code and approved origin ref, not full private URL | test output + non-secret log sample |
| Local document persistence | Current: `tests/integration/document-access/desktop-document-cache.spec.ts`; Future: `apps/desktop/tests/no-local-storage.spec.ts` | authorized document view/download 후 service worker cache, webview appdata, temp dir, logs, indexed/local DB candidates를 fixture marker로 scan | document body, preview, filename, title, snippet, hash tied to private content, matter/document IDs outside approved refs not found | marker scan 0 hits |
| Service worker sensitive cache | Current: `apps/web/src/lib/pwa/cache-policy.spec.ts`; `tests/integration/document-access/desktop-document-cache.spec.ts` | `/documents`, `/search`, `/audit`, `/records`, `/ai`, `/external`, `/login`, auth-bearing GET request를 simulate | `isDesktopCacheAllowedPath` false; directive no-store; service worker evaluates deny-list before allow-list | unit/integration green |
| `/v1/*` cache | Current: `apps/web/public/sw.js`; `apps/api/src/common/security/no-store.middleware.ts`; `tests/integration/document-access/desktop-document-cache.spec.ts` | `/v1/documents/:id/preview`, `/v1/documents/:id/download`, `/v1/search` 요청 | service worker bypass; API response no-store; no cache key created | response header and cache inspection evidence |
| Search offline leakage | Current: `tests/integration/metadata-leakage/desktop-offline-leakage.spec.ts`; Future: desktop offline e2e | offline 상태에서 `/search` or installed app launch; prior authorized search after cache warm-up | safe unavailable/login flow only; no title, snippet, metadata, count, facet, query, AI hint rendered from local cache | screenshot/evidence must be redacted or synthetic-only; marker scan 0 hits |
| AI context leakage | Current policy: cache policy denies `/ai`; Future: `apps/desktop/tests/no-local-storage.spec.ts` and `tests/integration/metadata-leakage` extension | AI session/citation/context route access followed by offline/local storage scan | no AI prompt, response, citation, context chunk, vector/id list, model output in local cache/log/appdata | marker scan 0 hits; route no-store |
| Audit missing on view/download | Current: `tests/integration/audit-coverage/desktop-view-download-audit.spec.ts`; Future: `apps/desktop/tests/audit-preserve.spec.ts` | authorized detail/download through desktop shell; unauthorized direct URL attempt | authorized path produces `DOCUMENT_VIEWED`/`DOCUMENT_DOWNLOADED`; unauthorized path safe-denied and records required denied audit where server policy requires; response no-store | audit row exists with allow-listed metadata; no local audit row cache |
| Native capability bypass | Future: `apps/desktop/tests/capability-deny.spec.ts`; `tools/release/check-desktop-capabilities.mjs` | attempt filesystem read/write, clipboard, shell open, share sheet, mail compose, external URL open, custom protocol bypass | capability denied; no file/dialog/share/mail behavior; tests fail if new capability appears without ADR ref | static policy gate + runtime denial evidence |
| Unsigned or wrong-channel update | Future: `apps/desktop/tests/update-policy.spec.ts`; release gate checker | unsigned update manifest, valid signature but wrong channel, stale rollback artifact without approval, mismatched digest | update rejected fail-closed; app remains current or enters safe manual update state; no server production deploy triggered | signed/unsigned/wrong-channel test logs with no secrets |
| Sensitive data in logs | Current policy: `docs/security/desktop-cache-policy.md`; Future: log redaction checker | trigger auth failure, origin block, view/download, search, update failure, capability denial | logs contain only app version, channel, approved origin ref, OS family, correlation/request ref, reason code; no document names/snippets/tokens/cookies/private endpoints | automated grep/regex scan 0 hits for denied patterns |

## 2. Test placement rules

- Do not create new top-level integration suite directories unless the canonical suite registry is formally revised and approved. Existing desktop-related integration tests should stay under `document-access`, `metadata-leakage`, and `audit-coverage` where applicable.
- Tauri-specific tests may live under `apps/desktop/tests/*` because they validate the desktop package rather than server integration suite taxonomy.
- Server authority tests remain under existing API integration suites. Desktop tests may call those routes but must not duplicate server permission logic locally.
- Evidence must use synthetic markers and reference IDs only. No real customer data or screenshots with private endpoints.

## 3. Existing coverage inventory

| Existing test | Coverage | Gap |
|---|---|---|
| `apps/web/src/lib/pwa/cache-policy.spec.ts` | cache allow-list and sensitive no-store path classification | Does not inspect actual browser/webview cache runtime. |
| `tests/integration/document-access/desktop-document-cache.spec.ts` | sensitive path excluded from desktop cache policy; service worker deny-before-allow ordering | Needs future native webview appdata scan. |
| `tests/integration/metadata-leakage/desktop-offline-leakage.spec.ts` | offline shell and manifest do not contain sensitive markers or `/v1` | Does not perform browser visual/offline runtime replay. |
| `tests/integration/audit-coverage/desktop-view-download-audit.spec.ts` | server detail/download no-store and audit events | Needs future desktop shell route-level smoke. |
| `tools/release/staging-smoke.mjs` SMOKE-012~015 | manifest, service worker, offline shell, installability smoke | Needs staging/pilot execution evidence after native shell exists. |

## 4. Required negative assertions

Every desktop security test must include at least one negative assertion. The minimum negative assertions are:

- unapproved origin is blocked;
- auth-bearing or `/v1` request is not cached;
- document/search/AI/audit marker is absent from local storage/logs;
- native capability request is denied;
- unsigned or wrong-channel update is rejected;
- unauthorized document/search route does not leak title, snippet, count, facet, metadata, or existence;
- view/download cannot complete without server audit event under the applicable server semantics.

## 5. Merge-blocking criteria

A desktop PR must not merge if any of the following occurs.

- False allow: unapproved origin renders, unauthorized document/search/AI data appears, or native capability opens without ADR.
- Audit gap: view/download path lacks required server audit event.
- Cache gap: `/v1` or authenticated app surface is cached.
- Local persistence: document body, search result, AI context, audit row, tenant/matter/document data found in local storage/logs.
- Supply-chain gap: updater accepts unsigned/wrong-channel artifact.
- Evidence leak: PR, docs, CI logs, release evidence include token, cookie, private endpoint, account id, or customer data.

## 6. Validation command set by maturity stage

| Stage | Commands |
|---|---|
| PWA baseline | `pnpm docs:frozen`; `pnpm test -- apps/web/src/lib/pwa/cache-policy.spec.ts`; `pnpm test:integration -- desktop-document-cache`; `pnpm test:integration -- desktop-offline-leakage`; `pnpm test:integration -- desktop-view-download-audit`; `pnpm release:smoke -- --dry-run` |
| Tauri foundation | PWA baseline commands plus `pnpm --filter @amic-vault/desktop lint`; `pnpm --filter @amic-vault/desktop typecheck`; `pnpm --filter @amic-vault/desktop test`; `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml`; `pnpm --filter @amic-vault/desktop tauri build --debug` |
| Release candidate | Tauri foundation commands plus `pnpm test:integration`; `pnpm launch:readiness`; `pnpm launch:execution`; signing policy check; updater negative tests; customer IT handoff review |

## 7. Security owner review checklist

Before merge, the security reviewer should confirm:

1. Desktop remains a wrapper over approved Vault web origin.
2. No server authority moved to desktop.
3. No local document/search/AI/audit storage exists.
4. Native capabilities are closed unless approved by separate ADR.
5. Logs and evidence are reference-only and synthetic-only.
6. Rollback to browser/PWA is documented and testable.
7. `docs/package/` remains unchanged.
