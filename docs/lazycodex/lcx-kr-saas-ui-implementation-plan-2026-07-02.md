# LCX-KSUI Korean SaaS UI Implementation Plan

Date: 2026-07-02
Status: planning baseline for LazyCodex implementation
Scope: AMIC Vault web UI under `apps/web/src/app` and shared UI components under `apps/web/src/components`

## Purpose

This plan turns the current AMIC Vault UI into implementable LazyCodex work.
The implementation condition is:

1. Every visible UI must include functions that are operationally plausible in Korean B2B SaaS.
2. Every visible action must be executable now, request-only, approval-gated, connection-gated, or hidden.
3. Customer-facing Korean copy must use natural Korean SaaS expressions.
4. `Matter` and `Matter code` are product proper nouns and must remain visible as-is.
5. Developer/internal terms such as API, ref, metadata, source, endpoint, claim, dry-run, queue, UUID, tenant ID, workspace ID, projection, and source-of-truth must not appear in normal customer-facing UI.

## Product Identity

AMIC Vault is not only a file cabinet. It is a law-firm knowledge repository built around Matter context.

The UI must therefore help users preserve and reuse institutional knowledge without exposing raw technical internals or unapproved AI features. Each implemented surface should answer at least one of these business questions:

- Which Matter does this knowledge belong to?
- Which customer, team, document, email, activity, retention rule, or information barrier is connected to it?
- What can this user safely read, download, restore, request, or cite?
- What changed, who acted, and where is the audit trail?
- Which search condition, folder, or saved view lets the firm find this knowledge again?
- Which operational state blocks reuse: missing permission, missing Matter code, expired connection, pending approval, hold, or policy restriction?

Knowledge-repository UI principles:

- Matter-first: document, email, record, audit, and search views must keep `Matter` and `Matter code` visible when the user has permission.
- Context preservation: a document detail should connect version history, activity history, related Matter, related email, retention state, and access state.
- Reusable search: saved search conditions should work as `검색 폴더`, not as developer-facing saved-query objects.
- Governance-aware retrieval: search and folder views must show only permission-scoped knowledge and must not leak inaccessible counts, labels, or snippets.
- Work-product continuity: restore, archive, hold, disposal, duplicate handling, and upload status must keep the firm record usable over time.
- AI-ready but AI-closed: UI may show `문서 정리 준비` or `파일 정리 상태`, but must not expose legal analysis, summaries, semantic search, prompts, model responses, or external model claims until the approved release scope allows it.

## Knowledge Repository Supplement

The current UI plan must close these gaps so AMIC Vault reads as an advanced law-firm knowledge repository, not a generic document list.

| Repository expectation | UI/function gap to close | Implementable UI form now |
| --- | --- | --- |
| Matter knowledge spine | Matter, document, search, records, and audit views can feel disconnected. | Keep `Matter`, `Matter code`, customer, team, access state, and related document/search/audit links visible on permitted Matter and document views. |
| Source Vault continuity | Document pages can become preview/download pages only. | Treat document detail as a knowledge profile: current version, version history, extraction/OCR/index state, file organization state, related Matter, related email, related documents, retention state, and activity history. |
| Classification-first filing | Upload can look like a file drop without legal context. | Require Matter code first, then show supported fields such as document type, subtype, confidentiality, privilege status, retention state, and duplicate/version decision. Unsupported fields stay hidden or unavailable, not fake. |
| Reusable search | Search can become one-off keyword lookup. | Saved search conditions must appear as `검색 폴더`; result cards must preserve Matter/document context and safe bounded preview only after permission checks. |
| Knowledge graph readiness | Related objects can look absent until graph features are fully approved. | Show backed related Matter/document/email/activity links now; use `관계 정보 준비 중` or `연결 필요` for graph-only relationships until the approved release scope exists. |
| Evidence readiness | AI prep can be mistaken for live legal analysis. | Use `근거 자료 준비 상태`, `문서 정리 준비`, and `파일 정리 상태` only for approved preparation states. Do not show legal conclusions, generated summaries, prompts, or model responses. |
| Governance in context | Records, walls, and audit can feel like separate admin pages. | Add contextual panels and links from Matter/document/search results to `보존 조치`, `접근 상태`, `정보 차단`, and `감사 로그` where backed by current APIs. |
| Specialized vault growth | DD, litigation, contract intelligence, and records can leak into navigation before approved. | Keep specialized routes hidden or blocked until approved. Current UI may expose only safe contextual status or links to approved internal surfaces. |
| Admin knowledge operations | Taxonomy/search/admin settings can look like implementation settings. | Present admin controls as document classification, Matter templates, search refiners, retention settings, search privacy, and index health using business language. |

## Evidence Baseline

The Korean SaaS operating baseline comes from current official/product sources:

| Product/source | Observed operating pattern | UI rule for AMIC Vault |
| --- | --- | --- |
| NAVER WORKS Drive | Folder access members can be set to edit/read, removed, or opened to the company. | Document/Matter access UI must expose `접근 멤버`, `읽기`, `편집`, `접근 제한` concepts instead of raw permission internals. |
| NAVER WORKS Drive | Link sharing supports share scope, link creation/copy, settings, and OTP-designated recipients. | External share surfaces must be disabled until approved, then must show share scope, recipient, expiry/security state, and audit state. |
| NAVER WORKS Drive | File version history supports preview, restore, and version delete constraints. | Document detail must include `버전 이력`, `미리보기`, `복원`, and immutable-original-safe wording. |
| NAVER WORKS Drive | File/folder activity shows activity history and can open viewer/folder from the activity entry. | Document and folder-like views must include `활동 내역` with safe navigation links. |
| NAVER WORKS Drive | Drive search supports keyword search and `본문만` scope for document/image body search. | Search must support title/body/all scope and permission-scoped results. |
| NAVER WORKS Admin | Shared link management supports search conditions, access-right filters, deletion, and Excel download. | Admin/security views must support condition search, export/download request, and reason tracking for sensitive exports. |
| NAVER WORKS Admin | File audit logs can record file download/view events. | Download, preview, upload, search, records, and AI-prep actions must have reference-only audit coverage. |
| Flow | Project work supports configurable fields, tree tasks, Gantt timeline, smart filtering, project insights, and dashboards. | Work/notification/home surfaces should show actionable work, status, owner, deadline, and filtered views only from real data. |
| Flow | Project administrators can change project settings, manage participants, and set read/file download permissions. | Matter team/admin UI must manage participants, roles, read/edit/download constraints, and membership lifecycle. |
| Flow | Posts support read scopes such as project participants, project admins, company employees, and link holders. | Access policy UI must express audience/scope in business terms and fail closed for sensitive content. |
| Flow Admin | Admin can view all projects with administrator, participant count, posts, comments, chats, schedules, tasks, recent activity, and created date. | Admin Matter/document inventory should show operational counts only when backed by real APIs. |
| Dooray | Projects support board/planning views, task references to wiki/drive, due dates in calendar, and guest access limited to invited projects. | Matter work UI should link related documents/email/tasks and keep external collaborator access scoped to approved contexts only. |
| DaouOffice | Security admin supports concurrent login, auto logout, IP access restriction, password policy, member access logs, and mobile device access approval. | Admin/security UI must include account security, session, IP/device restriction, and access log concepts where implemented. |
| DaouOffice | Approval document administrators can review deletion history through administrator work records. | Records/audit UI must expose deletion/disposal history only as reviewed records, not as raw hard-delete actions. |
| Hiworks | Mail archiving supports restore/download, up to multi-year storage, body search, backup/upload. | Retention/search UI should separate restore, archive, backup/import, and history continuity. |
| Cloudike | Folder owner/share model, read-only download sharing, team/user permissions, and admin activity logs. | Document ownership and admin visibility must be separated; admins should not imply unrestricted document content visibility. |
| Cloudike | Secure sharing supports download/print limits, IP restriction, link expiry, password protection, and real-time access log tracking. | External share and document security must require explicit scope, expiry, password/OTP/IP policy, and activity log. |
| kt cloud SecuDrive | SaaS DMS offers document boxes by document nature, co-editing/versioning, group/user permissions, permission-differentiated search results, local/cloud sync. | AMIC Vault must present document boxes/search results by permission and gate Office/OneDrive sync until the contract is approved. |
| KISA CSAP SaaS guide | SaaS certification guidance covers security level and user protection criteria. | Release readiness must keep security, logging, access control, and user protection as UI acceptance requirements. |

Reference links used for this baseline:

- NAVER WORKS Drive access members: https://help.worksmobile.com/ko/use-guides/drive/share/set-authority/
- NAVER WORKS Drive version history: https://help.worksmobile.com/ko/use-guides/drive/manage-file-folder/revision/
- NAVER WORKS Drive activity: https://help.worksmobile.com/ko/use-guides/drive/manage-file-folder/file-activity/
- NAVER WORKS Drive search: https://help.worksmobile.com/ko/use-guides/drive/search/search-file-folder-name/
- NAVER WORKS Admin file audit: https://help.worksmobile.com/ko/admin-guides/audit/files/
- Flow company project/admin management: https://support.flow.team/ko/flow/4404415741325
- Flow project creation and permission options: https://support.flow.team/ko/flow/4403611833741
- Dooray Project: https://dooray.com/main/en/service/project
- DaouOffice security admin: https://manual.daouoffice.co.kr/hc/ko/articles/24395835714713-%EB%B3%B4%EC%95%88%EA%B4%80%EB%A6%AC
- DaouOffice member access logs: https://helpdesk.daouoffice.co.kr/hc/ko/articles/42359514262809-%EB%A1%9C%EA%B7%B8
- Hiworks mail archiving manual index: https://customer.gabia.com/manual/hiworks/9827
- Cloudike Business product overview: https://buisness-docs.cloudike.io/
- kt cloud SecuDrive launch summary: https://tech.ktcloud.com/entry/kt-cloud-%EA%B3%B5%EA%B3%B5-%EC%B5%9C%EC%B4%88-SaaS%ED%98%95-%EB%AC%B8%EC%84%9C%EC%A4%91%EC%95%99%ED%99%94-%EC%86%94%EB%A3%A8%EC%85%98-%E2%80%98SecuDrive%E2%80%99-%EC%B6%9C%EC%8B%9C
- KISA CSAP overview: https://www.kisa.or.kr/1050603

## LazyCodex Status Vocabulary

Use these statuses in UI planning, copy, and verification.

| Status | Customer-facing Korean | Meaning |
| --- | --- | --- |
| `executable` | 사용 가능 | The backed action works end-to-end. |
| `request_only` | 요청 가능 | The UI creates a bounded request, not a final mutation. |
| `approval_required` | 승인 필요 | Human or owner approval is required before execution. |
| `connection_required` | 연결 필요 | External or companion system is not configured/ready. |
| `unavailable` | 사용 불가 | The function is intentionally blocked, with a safe reason. |
| `hidden` | 숨김 | Not in current production navigation/scope. |

Do not expose these English status keys in the product UI.

## Copy Rules

Approved customer-facing nouns:

- `고객`
- `Matter`
- `Matter code`
- `문서`
- `문서함`
- `파일`
- `버전 이력`
- `활동 내역`
- `접근 권한`
- `접근 멤버`
- `정보 차단`
- `보존 조치`
- `감사 로그`
- `검색 조건`
- `연동 상태`
- `운영 조건`
- `확인 정보`
- `보안 정책`
- `계정 보안`
- `접속 제한`
- `관리자 권한`
- `지식 보관`
- `관련 Matter`
- `관련 문서`
- `관련 이메일`
- `검색 폴더`
- `근거 자료`
- `관계 정보`
- `문서 분류`
- `검색 항목`
- `보존 기간`

Forbidden in normal user UI:

- API
- endpoint
- ref
- source
- source-of-truth
- projection
- metadata
- claim
- dry-run
- queue
- raw
- UUID
- tenant
- workspace
- matter ID
- document ID
- version ID
- token
- cookie

Allowed only in admin/security inspector surfaces when strictly necessary:

- bounded internal reference labels that are not copy-primary
- technical health labels inside admin-only diagnostics
- release evidence references outside product UI

## Implementation Phases

### LCX-KSUI-P0 Inventory And Guardrails

Objective: make every UI surface classifiable before further implementation.

Work:

- Add or update a route capability inventory for all current web routes.
- Assign each surface a LazyCodex status: executable, request-only, approval-required, connection-required, unavailable, hidden.
- Add production literal guards for forbidden customer-facing terms.
- Confirm `Matter` and `Matter code` are preserved.
- Link this plan from the UI inventory.
- Add a route-by-route repository role: Matter spine, source vault, search folder, governance, integration intake, admin knowledge operations, or hidden future vault.

Acceptance:

- Every route in `apps/web/src/app` appears in the traceability table.
- No customer-facing surface presents an unimplemented action as complete.
- Every visible route declares how it contributes to Matter-centered knowledge reuse or why it is hidden.
- `pnpm check:production-ui-literals` passes.

### LCX-KSUI-P1 Core Work Loop

Objective: make the daily legal-operations loop useful with implemented functions.

Surfaces:

- `/dashboard`
- `/work`
- `/notifications`
- `/matters`
- `/matters/[matterId]`
- `/matters/[matterId]/team`
- `/files`
- `/documents/[id]`

Work:

- Show real work items, recent activities, Matter list, document list, document detail, and Matter team.
- Wire visible action buttons to existing routes or request-only flows.
- Remove orphaned action labels.
- Standardize empty, loading, denied, blocked, and unavailable states.
- Add Matter-centered context links from daily work surfaces to related documents, emails, search folders, audit, and records where backed.
- Make the home/dashboard view highlight knowledge reuse states: recently updated Matter documents, failed extraction/OCR, file organization readiness, saved search return path, and integration blockers.

Acceptance:

- A user can navigate: Home -> Matter -> Matter documents -> Document detail -> Activity/Audit/Records link.
- A user can understand why a Matter or document is reusable, blocked, stale, under hold, or missing required context.
- Missing configuration blocks mutation with a clear Korean reason.
- No fake counts or placeholder people/documents appear.

### LCX-KSUI-P2 Document SaaS Controls

Objective: match Korean SaaS document-operation expectations.

Surfaces:

- `/files`
- `/documents/[id]`
- document upload panel
- Matter document list
- document action center

Work:

- Add or complete version history, restore request, activity history, download/preview audit visibility, file lock/open-save state, duplicate handling, and upload status.
- Keep Office live edit/open-save gated until runtime contract is approved.
- Make upload Matter-code-first.
- Turn document detail into a knowledge profile with current version, version history, extraction/OCR/index state, file organization state, related Matter, related email, related documents, retention state, access state, and activity history.
- Make upload and filing classification-first: document type/subtype, confidentiality, privilege status, retention state, duplicate/version decision, and supported search refiners.

Acceptance:

- Users see document status, version status, access status, and post-upload processing state.
- Users see whether the document is searchable, reusable, held, archived, blocked, or still being prepared.
- Restore/open-save/share/delete actions are not shown as final actions unless implemented.
- Every document action has audit or request evidence.

### LCX-KSUI-P3 Search And Saved Workspaces

Objective: make search operate like Korean SaaS search/folder products.

Surfaces:

- `/search`
- `/search/folders`
- search controls/results/saved search panel

Work:

- Support title/body/all scope.
- Support Matter code, customer, document type, confidentiality, privilege, extraction/OCR, retention, version, date, and status filters.
- Save search conditions as `검색 폴더`.
- Remove raw saved-search IDs from UI.
- Show result context path: Matter, customer, document type, version state, access state, and related document action.
- Support confidential search URL behavior by keeping reusable search links display-safe.
- Use `관계 정보 준비 중` or `연결 필요` for graph-only relationship views until approved graph capability is available.

Acceptance:

- Results are permission-scoped before result construction.
- Saved search opens the same safe result set from URL/state.
- Search folders behave like reusable knowledge views, not fake folder trees or technical query records.
- No inaccessible result label/count leaks.

### LCX-KSUI-P4 Governance, Retention, Audit

Objective: implement the admin/legal control plane with Korean SaaS operating language.

Surfaces:

- `/records`
- `/audit`
- `/walls`
- governance panels
- audit inspectors

Work:

- Records: retention policy, hold, archive request, disposal request, certificate view.
- Audit: condition search, event details, export request with reason, no sensitive payload.
- Walls: information barrier list, scope, members, exceptions, Matter code picker.
- Replace internal labels with `보존 조치`, `폐기 요청`, `감사 로그`, `정보 차단`, `예외 대상`.
- Put governance status in context on Matter/document/search result surfaces: access basis, hold state, retention state, wall state, archive/disposal readiness, and audit trail.

Acceptance:

- No hard-delete UI appears.
- Export/download requires reason where sensitive.
- Audit rows clear stale data on denied/error states.
- Users can move from a document or Matter to the relevant governance record without losing context.

### LCX-KSUI-P5 Integrations And Connection Gates

Objective: show integration readiness without pretending that disconnected systems are live.

Surfaces:

- `/integrations`
- `/integrations/matter-app`
- `/integrations/outlook`
- Outlook task pane
- future OneDrive/Office status cards

Work:

- Matter app: show connection, upload eligibility, freshness, and fallback state in customer-safe language.
- Outlook: show feature status, operating conditions, confirmation state, rollout state.
- OneDrive/Office: show connection-required and approval-required states only.
- Hide tokens, endpoints, cookies, internal ids, and raw setup values.
- Treat Matter app and Outlook as knowledge intake channels: Matter app controls Matter identity; Outlook filing must land in the same Matter/document/search/audit model as upload.

Acceptance:

- Connection state cannot be inferred as live without approved status data.
- Failed or unconfigured integrations do not open mutation flows.
- Admin users see next required action in Korean.
- No integration presents itself as a separate knowledge silo.

### LCX-KSUI-P6 Admin And Security Settings

Objective: bring admin/security settings in line with Korean groupware/SaaS expectations.

Surfaces:

- `/admin`
- `/admin/security`
- `/enterprise`
- account ledger admin
- route visibility guard

Work:

- Add account security, password/session policy, IP/device access state, admin role visibility, log retention, backup/compliance status.
- Keep advanced diagnostics separated from normal settings.
- Expose SSO/MFA/BYOK/SIEM/backup/compliance only after API success.
- Add knowledge operations settings where backed: document classification, Matter templates, search refiners, retention defaults, search privacy mode, and index/extraction health.

Acceptance:

- Security settings fail closed.
- Admin-only routes never appear optimistically.
- Copy uses `계정 보안`, `접속 제한`, `관리자 권한`, `로그 보관`, `보안 정책`.
- Admin settings describe knowledge operations in business terms, not implementation-setting terms.

### LCX-KSUI-P7 External And Hidden Surfaces

Objective: prevent hidden or public routes from weakening production truth.

Surfaces:

- `/external/[token]`
- `/outlook-addin`
- `/launch`
- `/scale`
- `/contracts`
- `/dd`
- `/litigation`
- `/showcase`

Work:

- Confirm external route remains isolated from internal app shell.
- Keep task pane separate from internal integration admin page.
- Keep hidden/internal/out-of-scope routes blocked or not found.
- Remove or gate any customer-visible promise that cannot be implemented now.
- Keep DD, litigation, contract intelligence, external portal, and VDR claims out of normal navigation until their approved release boundary opens.

Acceptance:

- Direct access to hidden internal routes renders safe blocked/not-found state.
- External portal does not inherit internal navigation.
- Outlook task pane does not become normal web navigation.
- Specialized vaults do not appear as live repository areas before their release gates.

### LCX-KSUI-P8 Verification And Release Evidence

Objective: make the plan enforceable.

Required checks for UI implementation PRs:

- `pnpm check:production-ui-literals`
- `pnpm ui:production-smoke`
- `pnpm check:ui-pr-checklist`
- `pnpm --filter @amic-vault/web test`
- `pnpm --filter @amic-vault/web typecheck`
- `pnpm --filter @amic-vault/web lint`
- `pnpm --filter @amic-vault/web build`
- `python3 /Users/jws/Applications/ai-slop-taxonomy/scripts/sloplint.py --repo "$PWD" --changed`

Manual QA:

- `/matters`
- `/files`
- `/documents/[id]` from a permitted document link
- `/search`
- `/search/folders`
- `/records`
- `/audit`
- `/walls`
- `/integrations`
- `/integrations/matter-app`
- `/integrations/outlook`
- Matter -> document -> search folder -> audit/records repository path
- Document detail knowledge profile states
- Search folder reuse and privacy state
- hidden route direct access

Acceptance:

- Tests pass.
- Forbidden literals do not appear.
- Real rendered routes show safe Korean SaaS states.
- Real rendered routes show Matter-centered knowledge context, not only isolated file actions.
- Screenshots or receipts do not contain secrets, raw document content, tokens, cookies, raw prompts, source text, or model responses.

## Execution Order

1. LCX-KSUI-P0: inventory and forbidden-literal guards.
2. LCX-KSUI-P1: core work loop.
3. LCX-KSUI-P2: document controls.
4. LCX-KSUI-P3: search and saved search folders.
5. LCX-KSUI-P4: governance, retention, audit.
6. LCX-KSUI-P5: integrations and connection gates.
7. LCX-KSUI-P6: admin/security settings.
8. LCX-KSUI-P7: external/hidden route hardening.
9. LCX-KSUI-P8: release evidence and manual QA.

## Stop Conditions

Stop and escalate if any implementation requires:

- External sharing before the approved product/security/legal boundary.
- Office/OneDrive connected-state claim before the approved runtime contract.
- AI legal analysis or document summary beyond approved file-organization prep.
- Displaying raw internal identifiers as normal-user labels.
- Updating `docs/package`.
- Weakening permission-before-search, permission-before-AI, audit-by-default, fail-closed, immutable original, or sensitive-data-not-logged rules.
