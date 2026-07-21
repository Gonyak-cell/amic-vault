# LCX-KSUI Korean SaaS UI Traceability

Date: 2026-07-02
Status: LazyCodex route-to-work traceability
Parent plan: `docs/lazycodex/lcx-kr-saas-ui-implementation-plan-2026-07-02.md`

## Legend

| Field | Meaning |
| --- | --- |
| LCX ID | LazyCodex work unit. |
| Surface | Route or component family. |
| Korean SaaS functions to support | Functions observed in Korean SaaS and applicable to AMIC Vault. |
| Implementation condition | What must be true before the UI can claim the function. |
| Copy rule | Required customer-facing Korean wording. |
| Verification | Minimum proof. |

## Traceability Table

| LCX ID | Surface | Korean SaaS functions to support | Implementation condition | Copy rule | Verification |
| --- | --- | --- | --- | --- | --- |
| LCX-KSUI-000 | Global navigation/AppShell | Menu groups, role-aware navigation, recent activity entry, settings/help affordances. | Navigation derives from route policy and fails closed while user role is loading. | Use `문서 보관`, `정책 관리`, `감사`, `보안`, `관리`, `연동 관리`; keep `Matter`. | Navigation tests, hidden-route smoke, literal guard. |
| LCX-KSUI-001 | `/dashboard` home | Dashboard with recent activity, pending work, failed processing, integration status, quick links. | All counts and rows come from dashboard/work APIs or connection state. | Use `홈`, `최근 활동`, `작업함`, `확인 필요`, `연동 상태`. | Dashboard tests and no fake-data scan. |
| LCX-KSUI-002 | `/work` | Work list, status filter, owner/target, due/created time, remediation links. | Items must link to executable or request-only routes; no fake assignments. | Use `작업함`, `상태`, `업무 구분`, `다시 시도`, `확인`. | Work queue tests and route-link checks. |
| LCX-KSUI-003 | `/notifications` | Notification center, unread/confirmed status, source filters, action links. | Notifications derive from real events or API state. | Use `알림`, `미확인`, `확인됨`, `관련 화면`. | Notification tests and no placeholder alerts. |
| LCX-KSUI-004 | `/matters` | Matter list, Matter code, customer, status, responsible team, file/search actions. | Matter data aligns with Matter app contract or is marked connection-required. | Keep `Matter`, `Matter code`; use `고객`, `상태`, `담당팀`, `파일함`, `검색`. | Matter page tests and rendered HTML check. |
| LCX-KSUI-005 | `/matters/[matterId]` | Matter detail, profile, governance context, activity, documents, email timeline. | Detail data permission-scoped; no label/count leakage on denied state. | Use `Matter 정보`, `활동 기록`, `관련 문서`, `관련 이메일`. | Matter detail component tests. |
| LCX-KSUI-006 | `/matters/[matterId]/team` | Participant list, role change, add/remove, access admin workflow. | Normal UI uses safe user labels and approved picker; raw refs only in advanced admin mode if enabled. | Use `Matter 팀`, `구성원`, `역할`, `추가`, `해제`. | Team member tests and raw-ref guard. |
| LCX-KSUI-007 | Matter code picker | Search by Matter code, Matter name, customer; unavailable/stale states. | Upload/mutation disabled unless source is configured, fresh, and upload-authoritative. | Use `Matter code 선택`, `Matter 이름`, `고객`, `연결 필요`. | Picker tests for UUID rejection and setup state. |
| LCX-KSUI-008 | `/files` | Document list, Matter-code-first upload, filters, sort, pagination, processing state. | Upload gated by selected Matter code; list permission-scoped before return. | Use `문서함`, `Matter code 선택`, `업로드`, `전체 문서`, `선택한 Matter 문서`. | Files page tests and production smoke. |
| LCX-KSUI-009 | Matter document list | Matter-scoped file cabinet, filters, status, document action links. | Only documents readable by user appear; empty/unavailable states distinct. | Use `Matter 문서함`, `필터`, `접근 권한`, `파일 정리 상태`. | Matter document list tests. |
| LCX-KSUI-010 | Document upload panel | Single/bulk upload, validation, duplicate decision, progress, partial failure. | No file is uploaded until Matter source, permission, and preflight pass. | Use `파일 선택`, `업로드`, `중복 확인`, `새 문서`, `새 버전`, `취소`. | Upload panel tests and denied-path tests. |
| LCX-KSUI-011 | `/documents/[id]` | Document profile, preview, download, version history, related docs/emails, records/audit links. | Document read permission required; stale rows clear on denied/error. | Use `문서 프로필`, `미리보기`, `다운로드`, `버전 이력`, `활동 내역`. | Document action center tests. |
| LCX-KSUI-012 | Document version controls | Version list, preview, restore request, immutable original safety. | Restore is executable only if backend supports safe new-version creation; otherwise request-only. | Use `버전 이력`, `복원 요청`, `현재 버전`, `이전 버전`. | Version UI tests and audit assertion. |
| LCX-KSUI-013 | Document activity/audit panel | View/download/upload/search/records activity history. | Audit metadata reference-only; no body/title leakage beyond permitted display labels. | Use `활동 내역`, `감사 로그`, `수행자`, `대상`, `결과`, `일시`. | Audit timeline tests. |
| LCX-KSUI-014 | Document sharing state | Share state, external sharing gate, link scope, expiry, password/OTP/IP policy. | External sharing remains unavailable until approved; no recipient flow before R11-approved scope. | Use `외부 공유`, `승인 필요`, `만료일`, `비밀번호`, `접근 범위`. | Literal guard and sharing-policy scan. |
| LCX-KSUI-015 | Document lock/open-save state | File lock, Office open/save connection status, co-editing gate. | Office/OneDrive runtime contract approved before connected/open/save claims. | Use `편집 잠금`, `연결 필요`, `Office 열기/저장`. | Integration gate tests and no connected-state claim scan. |
| LCX-KSUI-016 | `/search` | Keyword search, title/body/all scope, Matter code/customer filters, safe result cards. | Permission-before-search; no client-side post-filter substitute. | Use `문서 검색`, `검색 범위`, `본문만`, `제목`, `검색 조건`. | Search tests and URL state tests. |
| LCX-KSUI-017 | Search advanced controls | Type, status, version, confidentiality, privilege, OCR/extraction, retention filters. | Filter chips reflect only supported backend query fields. | Use `파일 유형`, `상태`, `버전 상태`, `기밀도`, `특권 상태`, `추출/OCR`. | Advanced controls tests. |
| LCX-KSUI-018 | Search results | Result card, preview hit context, document/Matter links, no inaccessible counts. | Safe bounded preview snippets only after permission check. | Use `검색 결과`, `관련 Matter`, `문서 열기`, `문서함에서 보기`. | Result card/search results tests. |
| LCX-KSUI-019 | `/search/folders` | Saved search conditions as folder-like entry, reopen saved results, delete/rename where supported. | Saved search APIs back list/create/update/delete; no fake folder tree. | Use `검색 폴더`, `저장된 검색 조건`, `열기`, `이름 변경`, `삭제`. | Search folders tests. |
| LCX-KSUI-020 | `/records` | Retention policies, holds, archive request, disposal request, certificate. | Hard delete never exposed; disposal is request/review/certificate flow. | Use `기록 보존`, `보존 조치`, `보관 처리`, `폐기 요청`, `증명서`. | Records governance tests. |
| LCX-KSUI-021 | Records target picker | Choose Matter/document with safe labels and permission-scoped options. | Target selection uses Matter code picker and document list after permission check. | Use `대상`, `선택된 Matter`, `선택된 문서`, `접근 권한`. | Records target tests. |
| LCX-KSUI-022 | `/audit` | Audit search, filters, event detail, export request with reason. | Sensitive export requires reason and stores reference-only request metadata. | Use `접근 기록`, `감사 로그`, `검색`, `다운로드 신청`, `다운로드 사유`. | Audit console tests and export-body scan. |
| LCX-KSUI-023 | Audit event inspector | Safe actor/action/result/target details. | No raw payload, token, cookie, document body, prompt, model response. | Use `수행자`, `작업`, `결과`, `대상`, `상세 정보`. | Audit inspector tests. |
| LCX-KSUI-024 | `/walls` | Information barrier list, Matter scope, members, exceptions, policy actions. | Policy mutations require admin role and audit; user/group picker safe. | Use `정보 차단`, `적용 범위`, `예외 대상`, `구성원`, `정책`. | Wall admin tests. |
| LCX-KSUI-025 | Governance context panels | Matter participation, access status, hold status, team/status warnings. | Panel reads only permission-safe context. | Use `접근 상태`, `Matter 참여 여부`, `보존 조치`, `담당자`. | Governance panel tests. |
| LCX-KSUI-026 | `/integrations` | Integration matrix for Matter app, Outlook, OneDrive, Office. | Cards reflect true connection/approval state; blocked systems do not open live flows. | Use `연동 관리`, `연결 상태`, `운영 조건`, `확인 정보`, `연결 필요`. | Integration page tests. |
| LCX-KSUI-027 | `/integrations/matter-app` | Matter app source status, upload eligibility, freshness, setup state. | Upload-authoritative only when runtime-ready and fresh. | Use `Matter 관리 시스템`, `Matter code 기준 정보`, `업로드 가능 여부`. | Matter app integration tests. |
| LCX-KSUI-028 | `/integrations/outlook` | Outlook feature status, rollout scope, audit availability, confirmation state. | Status comes from admin API; no Office task pane confusion. | Use `Outlook 운영 상태`, `기능별 운영 상태`, `운영 조건`, `확인 상태`. | Outlook integration tests. |
| LCX-KSUI-029 | `/outlook-addin` | Task-pane filing, Matter selection, attachment handling, send/file status. | Managed separately from internal console; no raw IDs or unsafe attachment content. | Use `Matter`, `첨부`, `전송 및 보관`, `선택됨`, `없음`. | Outlook add-in tests. |
| LCX-KSUI-030 | OneDrive/Office future cards | Storage sync, open/save, co-editing, lock, callback, rollback readiness. | Hidden or connection-required until ADR/runtime contract and rollback evidence approved. | Use `연결 필요`, `승인 필요`, `운영 조건 미충족`. | No connected-state claim scan. |
| LCX-KSUI-031 | `/admin` | Admin settings, SSO/MFA/BYOK/SIEM/backup/compliance, taxonomy/search settings. | Data appears only after API success and admin role approval. | Use `관리자 설정`, `계정 보안`, `보안 정책`, `백업`, `컴플라이언스`. | Admin tests and route guard tests. |
| LCX-KSUI-032 | `/admin/security` | Security policy and access control settings. | Admin-only direct route, fail closed. | Use `보안 설정`, `접속 제한`, `기기 접근`, `로그 보관`. | Hidden/guard smoke. |
| LCX-KSUI-033 | Account ledger admin | Account ledger lookup, operational ledger state. | Admin-only; do not expose internal ledger IDs as normal copy. | Use `계정 원장`, `상태`, `확인`. | Account ledger tests. |
| LCX-KSUI-034 | `/enterprise` | Compatibility admin route. | Alias only; hidden from navigation unless approved. | Use same admin copy as `/admin`. | Route visibility tests. |
| LCX-KSUI-035 | AI prep surfaces | File organization readiness, retry, stale/rejected status. | No legal analysis, summary, external model, prompt/source text, model response. | Use `문서 정리 준비`, `파일 정리 상태`, `다시 시도`. | AI prep tests and AI-scope guard. |
| LCX-KSUI-036 | `/external/[token]` | External portal token flow, NDA/manifest/download/Q&A if approved. | Isolated from internal app; no internal navigation/session assumptions. | Use external-user safe copy; no internal ids. | External portal tests. |
| LCX-KSUI-037 | `/login` and reset | Login, account activation/password reset, safe error states. | No credentials in logs; redirect next path safe. | Use `로그인`, `계정 활성화`, `비밀번호`, `재설정 링크`. | Auth form tests. |
| LCX-KSUI-038 | Hidden routes `/launch`, `/scale`, `/contracts`, `/dd`, `/litigation`, `/showcase` | None in current production scope. | Hidden or blocked/notFound until explicitly approved. | Use `표시할 수 없는 화면` when blocked. | Hidden route tests. |
| LCX-KSUI-039 | UI components | Empty/error/loading states, tables, filters, detail inspectors, secure references. | Components must not introduce forbidden literal or fake data. | Use natural Korean nouns and route-specific labels. | Component tests and sloplint. |
| LCX-KSUI-040 | Production literal guard | Guard customer-facing copy and dangerous claims. | Extend checks for Korean SaaS copy, `Matter`/`Matter code`, forbidden internal terms. | Error messages should name the visible string and file. | `pnpm check:production-ui-literals`. |
| LCX-KSUI-041 | Manual QA pack | Render key routes and verify implemented/gated states. | Use safe session or test fixtures; do not require live credentials in the plan. | Capture notes with route, status, visible Korean labels, no secrets. | Browser/curl smoke plus route screenshots when allowed. |
| LCX-KSUI-042 | Law-firm knowledge repository layer | Matter-centered context panels across document, search, records, audit, and email-related views; saved search as reusable knowledge folder; related Matter/document/email/activity/retention/access links. | Must be permission-scoped before display; no semantic search, legal analysis, prompt/model response, or inaccessible snippet leakage until approved release scope allows it. | Use `지식 보관`, `관련 Matter`, `관련 문서`, `관련 이메일`, `활동 내역`, `검색 폴더`, `보존 조치`, `접근 상태`. | Cross-route rendered QA from Matter -> document -> search folder -> audit/records, plus forbidden AI/internal-term guard. |
| LCX-KSUI-043 | Matter knowledge overview | Matter detail and dashboard panels that summarize related documents, related emails, saved search return paths, access state, hold/retention state, and recent activity. | Show only backed counts/links; unavailable or stale states must be explicit and permission-scoped. | Use `Matter 지식 현황`, `관련 문서`, `관련 이메일`, `최근 활동`, `접근 상태`, `보존 조치`. | Matter -> document/search/audit/records navigation smoke and no fake-count scan. |
| LCX-KSUI-044 | Document knowledge profile | Document detail profile that combines current version, version history, extraction/OCR/index state, file organization state, related Matter, related email, related documents, access state, retention state, and audit links. | Every row comes from document/detail/search/audit/records APIs or is hidden/unavailable; no document body, prompt, model response, or raw internal id appears. | Use `문서 프로필`, `현재 버전`, `버전 이력`, `검색 가능 상태`, `파일 정리 상태`, `관련 Matter`, `관련 문서`, `활동 내역`. | Document detail rendered QA, denied reload stale-row test, literal guard. |
| LCX-KSUI-045 | Classification-first filing profile | Upload and filing fields for Matter code, document type/subtype, confidentiality, privilege status, retention state, duplicate/version decision, and supported search refiners. | Upload stays disabled until Matter source, permission, and file validation pass; unsupported fields are hidden or marked unavailable. | Use `문서 분류`, `세부 유형`, `기밀도`, `특권 상태`, `보존 기간`, `중복 확인`, `새 버전`. | Upload tests for denied/unconfigured/duplicate/version paths. |
| LCX-KSUI-046 | Search folder knowledge view | Saved search folders with safe names, Matter/document context, privacy-safe reusable links, and current result-state refresh. | Saved-search APIs must back list/open/rename/delete; confidential search mode must not expose raw query terms or raw saved-search ids in labels/markup. | Use `검색 폴더`, `저장된 검색 조건`, `다시 열기`, `검색 조건`, `관련 Matter`, `문서함에서 보기`. | Search folder tests, private URL mode tests, no raw-id scan. |
| LCX-KSUI-047 | Contextual governance panel | Cross-surface panel for access basis, information barrier state, hold state, retention state, archive/disposal readiness, and audit link. | Reads permission-safe governance context only; mutation actions are executable/request-only/approval-required according to API support. | Use `접근 상태`, `정보 차단`, `보존 조치`, `보관 처리`, `폐기 요청`, `감사 로그`. | Governance panel tests across Matter/document/search result surfaces. |
| LCX-KSUI-048 | Knowledge intake channels | Matter app and Outlook filing status as intake paths into the same Matter/document/search/audit model. | Matter app identity source and Outlook status must be real or connection-required; no separate silo, fake connected state, endpoint, token, or raw setup value. | Use `Matter 관리 시스템`, `Outlook 보관`, `연동 상태`, `운영 조건`, `연결 필요`, `업로드 가능 여부`. | Integration tests and rendered integration matrix smoke. |
| LCX-KSUI-049 | Knowledge operations admin | Admin controls for document classification, Matter templates, search refiners, retention defaults, search privacy, index/extraction health. | Admin-only, fail-closed, API-backed where editable; read-only or unavailable where contracts are not approved. | Use `문서 분류`, `Matter 템플릿`, `검색 항목`, `보존 기간`, `검색 보안`, `색인 상태`. | Admin route guard, taxonomy/refiner tests, no technical-copy scan. |
| LCX-KSUI-050 | Specialized vault gates | DD, litigation, contract intelligence, external portal, and VDR surfaces remain hidden, blocked, or explicitly gated until release boundaries open. | No navigation exposure or live-function claim before approved release/gate; direct routes render safe blocked/not-found states. | Use `사용할 수 없는 화면`, `승인 필요`, `운영 조건 미충족` only where a blocked state must render. | Hidden route smoke and release-boundary literal scan. |

## First Slice Recommendation

Start with these units because they remove the most fake-openable risk:

1. LCX-KSUI-040 production literal guard.
2. LCX-KSUI-000 global navigation/AppShell status vocabulary.
3. LCX-KSUI-004 Matter list and LCX-KSUI-007 Matter code picker.
4. LCX-KSUI-008 files and LCX-KSUI-010 upload panel.
5. LCX-KSUI-026 integrations matrix and LCX-KSUI-030 OneDrive/Office connection gates.
6. LCX-KSUI-042 knowledge repository layer, starting with Matter/document/search/audit cross-links that are already backed or safely gated.
7. LCX-KSUI-043 to LCX-KSUI-047 as the first repository-depth pass: Matter overview, document profile, classification-first filing, search folders, and contextual governance.

## Backlog Rules

- One PR should include one coherent LCX bundle, not all 51 units.
- Any PR touching a route must update this traceability file if status or wording changes.
- Any new visible action must declare one of: executable, request-only, approval-required, connection-required, unavailable, hidden.
- Any new Korean copy must avoid translationese and preserve product nouns `Matter` and `Matter code`.
- Any action that touches documents, permissions, integrations, AI prep, records, or audit must include corresponding negative/fail-closed tests.
