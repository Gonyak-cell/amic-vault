# 02. Target Architecture — AMIC Vault Desktop Next

검토일: 2026-06-21  
목표: AMIC Vault를 desktop-installable하게 만들되, 서버 권한·감사·검색·AI·문서 저장소 경계를 우회하지 않는 target architecture를 정의한다.

## 1. Architecture thesis

AMIC Vault Desktop은 local Vault runtime이 아니다. 데스크톱 앱은 승인된 Vault web origin을 안전하게 감싸는 thin shell이다. 서버는 계속해서 authentication, tenant context, PermissionService, AuditService, PostgreSQL RLS, document preview/download lifecycle, search, AI, records, external portal policy의 권위자이다.

현재 baseline은 `apps/web` PWA이며, native 단계는 `apps/desktop` Tauri v2 thin shell로 별도 구현한다.

## 2. Component boundary

| Component | 책임 | 비책임 |
|---|---|---|
| `apps/web` | UI source of truth, PWA manifest, service worker, offline shell, auth redirect UX, no-store web middleware, server API 호출 | 서버 권한 판단 자체, audit event 생성 authority, document byte storage, local search/AI index |
| `apps/api` | authentication/session, tenant context, PermissionService, AuditService, document lifecycle, preview/download, search, AI policy, records, storage access, no-store API middleware | desktop packaging, OS updater, native window shell |
| `workers/ingestion` | OCR/HWPX/DOCX/PDF parsing and ingestion jobs under server-controlled queue/storage | desktop-local ingestion, local OCR, local AI |
| PostgreSQL | server-side RLS, authoritative tables, audit append-only, permissions, tenant/matter/document/search/AI metadata | local desktop DB, offline tenant mirror |
| MinIO/S3-compatible storage | server-controlled object storage with tenant prefix and server-mediated signed URL policy | desktop-direct bucket access, local document vault |
| `apps/desktop` | Tauri v2 thin shell, approved origin launch, navigation guard, capability deny-by-default, signed installer/update policy, minimal local logging | NestJS API, PostgreSQL, storage, worker, search index, vector store, model gateway, audit authority, local document/search/AI/audit cache |

## 3. Desktop responsibilities

Desktop layer may own only the following responsibilities.

- App identity: bundle identifier, product name, icon, version, release channel.
- Window shell: initial window, title, close/reopen behavior, safe navigation guard.
- Approved origin launch: origin ref must resolve to an approved Vault web origin for the current environment.
- Release and update presentation: signed artifact, digest-pinned release, approved channel policy.
- Minimal health and troubleshooting logs: allow-listed metadata only.
- Optional future deep link handling: only after separate ADR, origin policy, permission tests, and audit preservation tests.

## 4. Desktop non-responsibilities

Desktop layer must not own, implement, or cache the following.

- NestJS API runtime.
- PostgreSQL or any local database containing tenant, matter, document, audit, records, search, AI, or user data.
- MinIO/S3 object storage or local object replica.
- Ingestion worker, OCR, HWPX/DOCX/PDF parsing, queue workers.
- Search index, full-text index, vector index, graph index.
- Model gateway, local model runtime, AI context store, prompt/response store.
- PermissionService or alternate local permission evaluator.
- AuditService or local audit row buffer.
- Document bytes, previews, downloads, names, snippets, search results, AI citations, audit rows.
- External sharing, native share sheet, native mail compose, secure link, external user handoff.

## 5. High-level flow

| Flow | Required path | Security rule |
|---|---|---|
| Launch | Desktop opens approved Vault web origin. | Missing or unapproved origin fails closed. |
| Login | Webview loads server login route; session is server-owned cookie/session behavior. | Desktop does not mint tokens or store credentials. |
| Dashboard/matter/document page | `apps/web` renders server-gated routes. | Sensitive web routes receive no-store and are never service-worker cached. |
| Search | `apps/web` calls server search endpoint. | PermissionService filters before result construction; no local search corpus. |
| AI | `apps/web` calls server AI routes when enabled. | Permission-before-AI and AI audit remain server-gated; no local AI context. |
| Preview/download | `apps/web` uses existing server routes. | `DOCUMENT_VIEWED`/`DOCUMENT_DOWNLOADED` audit preservation required before/with response; no native bypass. |
| Audit console | `apps/web` calls server audit query APIs. | No local audit row storage; metadata remains allow-listed. |
| Update | Tauri updater checks signed manifest/artifact for channel. | Unsigned or wrong-channel updates fail closed. |

## 6. Approved origin allow-list

The desktop shell must load only approved Vault web origins. The allow-list must store environment refs or approved public domain refs, not private endpoint values.

| Environment | Allowed shape | Repo storage | Packaging rule |
|---|---|---|---|
| Local | `http://localhost:<port>` only for developer local builds | non-secret developer default allowed | never packaged for customer use |
| Staging | approved staging evidence ref resolving outside repo to HTTPS target | evidence ref only | allowed for smoke/UAT builds |
| Pilot | approved pilot origin ref, ideally customer-facing HTTPS domain or controlled staging/pilot endpoint | evidence ref only | signed pilot artifact only |
| Production | approved production custom domain ref | approved domain/ref only, no private target | required before broad rollout |

Implementation principles:

- No private endpoint, load balancer DNS name, AWS account id, ARN, bucket name, database hostname, token, cookie, or customer data in repo or packaged sample config.
- Navigation to any origin not in the allow-list is blocked and logged only with non-sensitive reason code and correlation ref.
- If SSO/SAML introduces IdP redirects, each IdP origin must be handled through a separate approved auth redirect policy. Until then, arbitrary external navigation remains blocked or opened through the system browser only under a reviewed policy.
- The desktop shell must prevent downgrade from HTTPS to HTTP except for local development.

## 7. Auth/session handling

| Topic | Policy |
|---|---|
| Session authority | Server-owned. Desktop does not issue, refresh, inspect, or log session tokens. |
| Cookie storage | Webview runtime may hold ordinary server session cookies as part of browsing behavior. Desktop must not export, log, replicate, or sync cookies. |
| Credential storage | No desktop credential vault or OS keychain token storage by default. If demanded, separate ADR and threat model delta are required. |
| Logout | Logout must call the server logout route and rely on server session invalidation. Desktop may clear webview storage only as a defensive cleanup step and must not touch document/search/AI/audit data because none should exist locally. |
| MFA/SSO | Use existing server-authored flows. SSO/SAML webview behavior is an open question for human decision and must not be invented by desktop layer. |
| CSRF/session policy | Maintain current server/web policy. Desktop does not add alternate API authentication. |

## 8. Update, signing, notarization boundary

| Boundary | Rule |
|---|---|
| macOS signing | Developer ID certificate, hardened runtime, notarization, staple procedure must be documented. Secrets stay in external CI secret store or operator-owned signing environment, not repo. |
| Windows signing | Code signing certificate and MSIX or installer signing procedure must be documented. Certificate private key stays outside repo. |
| Updater | Disabled until signed update manifest, channel policy, wrong-channel rejection, rollback plan, and tests exist. |
| Artifact identity | Each artifact must have version, commit/ref, channel, digest, signature, and release approval ref. |
| Production boundary | Desktop artifact approval is separate from server production approval. Native app release must not auto-promote API/web/worker production deploy. |

## 9. Local logging allow-list

Desktop logs may contain only:

- application version;
- release channel;
- approved origin evidence ref;
- operating system family;
- non-sensitive correlation/request refs;
- failure reason codes such as `ORIGIN_BLOCKED`, `UPDATE_SIGNATURE_INVALID`, `CAPABILITY_DENIED`.

Desktop logs must not contain:

- document names, titles, snippets, previews, text, extracted terms, AI prompts, AI responses, AI citations;
- search queries or search result rows unless separately approved as server-side audit metadata with redaction;
- audit row payloads;
- tenant-specific matter/client names;
- cookies, tokens, session IDs, password reset tokens;
- private endpoints, account IDs, ARNs, bucket names, database hostnames;
- customer data or real law-firm document content.

## 10. No local document/search/AI/audit storage principle

The desktop shell must pass negative tests proving the following.

- No document body, preview, download, filename, title, snippet, search result, AI context, AI citation, audit row, tenant/matter/document data is stored in local DB, local cache, local index, app data directory, logs, updater metadata, crash dumps, or test evidence.
- Service worker cache remains restricted to static shell assets, icons, manifest, and safe offline shell.
- `/v1/*`, `/documents/*`, `/search`, `/audit`, `/records`, `/ai`, `/external`, `/login`, authenticated app surfaces, and auth-bearing requests bypass cache.
- Desktop tests inspect cache/storage/log surfaces after view/download/search/offline flows.
- Any future capability request that writes files, uses clipboard, invokes share/mail, imports folders, watches filesystem, opens native downloads, or performs offline queueing requires a new ADR and human security approval.

## 11. Branch/worktree architecture boundary

Desktop work must proceed in a branch/worktree separate from release/production lane.

- Do not combine Tauri scaffold with production deployment, server migrations, permission model changes, search/AI changes, or external sharing changes.
- First native PR should be architecture/foundation only.
- Every desktop PACK must run `pnpm docs:frozen` to prove `docs/package/` remains unchanged.
- Risk=C-equivalent changes, origin policy changes, updater changes, signing changes, native capabilities, and any auth/session behavior change require human/security review before merge.
