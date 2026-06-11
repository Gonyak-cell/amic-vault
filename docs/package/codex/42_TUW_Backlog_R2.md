# 42. TUW Backlog — R2: Document Vault Core (전체 상세 명세)

버전: 1.0 | 작성일: 2026-06-11 | 상태: Normative 파생 — `00_Master_Brief.md` §7 R2 인벤토리의 1:1 확장본. 본 문서와 Brief가 충돌하면 **Brief가 우선**한다.

> R2의 공식 명칭은 **Document Vault Core**다(보정 C-9 — "MVP" 명칭 사용 금지).

---

## 1. 공통 규칙 (모든 R2 TUW에 적용)

### 1.1 공통 선행 조건 — Permission Model Freeze

**`DEVOPS-FREEZE-PERMMODEL-TUW-001`(R1 Gate 산출물)은 R2 전체 TUW의 공통 선행이다.** Freeze 문서(role matrix·`canRead*` 시그니처·wall schema·filter 주입 지점 동결, Decision Ledger 등재)가 승인되기 전에는 R2의 어떤 TUW도 착수할 수 없다(Brief 보정 C-1). 본 문서의 각 모듈 첫 TUW `Depends_on`에 해당 ID를 명시했고, 나머지 TUW는 모듈 내 순차 의존을 통해 전이적으로 이 조건을 승계한다.

### 1.2 의존성 표기 규칙

- Brief §7 규칙대로 **모듈 내 TUW는 별도 표기 없으면 직전 번호에 순차 의존**한다. 본 문서는 이를 ID 단위로 전개해 두었다.
- `Depends_on`의 R0·R1 TUW ID는 `40_TUW_Backlog_R0.md`·`41_TUW_Backlog_R1.md`에 정의된 것을 가리킨다. R0/R1 산출물의 실제 파일 경로가 본 문서의 가정 경로와 다르면 해당 백로그 문서의 확정 경로를 따른다.

### 1.3 Verification 의미론 (Brief §6.3, 보정 C-8 — AND)

- 모든 TUW: **기능검증** AND **회귀검증**(기존 suite green: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`).
- 권한·보안 영향 TUW: AND **권한검증** — 반드시 negative test(비인가 시도가 `PERMISSION_DENIED` 등으로 차단됨을 증명하는 테스트) 포함.
- 행위 기록 대상 TUW: AND **감사검증** — audit event 발생 및 필수 필드(`tenant_id, actor_id, action, target_type, target_id, created_at`, correlation id) 충족.
- **Risk=C(Critical): 사람(또는 상위 검토 에이전트) 리뷰 게이트 필수. Codex 단독 머지 금지.**

### 1.4 표준 검증 명령 세트

`pnpm install` / `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` / `docker compose -f infra/docker-compose.dev.yml up -d` / `pnpm db:migrate` / `pnpm db:rollback` / `pnpm test:integration`

workers/ingestion(Python) 테스트는 turbo 파이프라인의 `pnpm test`에 포함시킨다(미연결 시 해당 TUW에서 연결하고 CI에 반영).

### 1.5 공통 Stop condition / Escalation (Brief §6.4)

다음 중 하나라도 발생하면 **작업 중단 후 `docs/ledger/execution.md`에 사유 기재**:
1. 스키마·권한·정책 불명확(20·21번 문서와 본 문서로 해소 불가)
2. verification fixture 부재
3. `Files NOT to modify` 대상의 변경 필요 발견
4. 동일 실패 3회 반복

Escalation 기본 경로: execution ledger 기록 → PACK PR에 `BLOCKED` 라벨 → 사람 검토 요청. Risk=C TUW는 차단 여부와 무관하게 머지 전 사람 리뷰 필수.

### 1.6 공통 Files NOT to modify (모든 R2 TUW)

- `db/migrations/` 내 **기존(이미 머지된) 마이그레이션 파일** — 수정 금지, 항상 신규 파일 추가
- `apps/api/src/modules/audit/` 의 append-only 제약(REVOKE·trigger) 관련 마이그레이션·코드 (R0 AUDILOGG-004 산출물)
- `packages/ai/` — placeholder 인터페이스 외 일체 구현 금지 (절대 금지: AI 기능 R6 전 구현)
- `docs/package/` (vault_dev_package 이관본, normative)
- R1 Freeze 산출물의 **시그니처**: `apps/api/src/modules/permission/` 의 `canReadMatter/canEditMatter/canUploadToMatter/canReadDocument/canDownloadDocument` 함수 시그니처, role matrix 정의, wall schema (구현 본체 채움은 SEC-DOCUPERM-ACCECONT-TUW-003에서만 허용)
- `AGENTS.md`, `docs/ledger/` 기존 행(append-only)

각 TUW의 `Files NOT to modify`는 "공통(§1.6)" + TUW 특이 항목으로 표기한다.

### 1.7 R2 audit 이벤트 taxonomy

R2 Gate가 요구하는 `DOCUMENT_*` 5종: `DOCUMENT_UPLOADED` / `DOCUMENT_VIEWED` / `DOCUMENT_DOWNLOADED` / `DOCUMENT_DELETED` / `DOCUMENT_METADATA_CHANGED`. 보조 이벤트: `DOCUMENT_RESTORED`, `DOCUMENT_VERSION_ADDED`, `DOCUMENT_INTEGRITY_ALERT`, `LEGAL_HOLD_CHANGED`. metadata_json은 화이트리스트 키만 허용하며 값은 참조 ID/hash 수준(불변 원칙 7 — 본문·기밀 원문 기록 금지).

### 1.8 표준 error code

R0 `CORE-SECFOUND-FAILCLOSE-TUW-001`이 구현한 9종(원천 09번 §4)을 사용: `AUTH_REQUIRED, PERMISSION_DENIED, ETHICAL_WALL_BLOCKED, AI_POLICY_BLOCKED, DOCUMENT_LOCKED, VALIDATION_FAILED, UNSUPPORTED_FILE_TYPE, EXTERNAL_LINK_EXPIRED, TENANT_ISOLATION_VIOLATION`. legal hold 차단은 `DOCUMENT_LOCKED`, 권한 차단은 `PERMISSION_DENIED`.

### 1.9 마이그레이션 규약

- 모든 신규 테이블: `tenant_id NOT NULL` + RLS 정책 동반(R0 `CORE-DATACORE-MIGR-TUW-005` 템플릿 사용). 예외는 명시 주석 필수.
- 본 문서의 마이그레이션 번호(`02xx`)는 권장값이다. 실제 번호는 머지 시점의 직전 번호+1로 조정하되 파일명 의미부는 유지한다.
- 모든 마이그레이션 TUW의 기능검증에 `pnpm db:migrate && pnpm db:rollback && pnpm db:migrate` 왕복 통과를 포함한다.

### 1.10 Document 상태머신 (원천 07번 §4 — 11상태)

`Draft → Internal Review → Client Sent → Counterparty Sent → Markup Received → Negotiation → Final → Executed → Archived → Disposal Locked → Deleted`. 전이 규칙은 `packages/domain`에 순수 함수로 구현하며(IO 없음), 상태명·전이는 원천 그대로 따른다(임의 추가 금지).

---

## 2. R2 TUW 인벤토리 요약 (59건)

Brief §7 R2 표의 행 단위 범위를 1:1 전개한 결과 **59건**이다(Brief §7 헤더도 "59 TUW"로 보정 완료 — §5 notes 참조. 행 단위 인벤토리가 규범이므로 59건 전부 상세화, 임의 추가·삭제 없음).

| # | 모듈 | TUW ID 범위 | 건수 | Risk=C 포함 |
|---|---|---|---|---|
| 2.1 | DOC-DOCUSTOR-OBJESTORAD | TUW-001~005 | 5 | — |
| 2.2 | DOC-DOCUUPLO-UPLOAPI | TUW-001~008 | 8 | — |
| 2.3 | DOC-DOCUINTE-HASHDUPL | TUW-001~005 | 5 | 004 |
| 2.4 | DOC-DOCUMETA-METAEXTR | TUW-001~006 | 6 | — |
| 2.5 | DOC-DOCUVERS-VERSRESO | TUW-001~007 | 7 | — |
| 2.6 | DOC-OCRTEXTEXT-EXTRWORK | TUW-001~006 | 6 | — |
| 2.7 | DOC-HWPX-EXTRACT | TUW-001~002 | 2 | — |
| 2.8 | DOC-DOCULIFE-LIFEMANA | TUW-001~006 | 6 | 002, 004 |
| 2.9 | RECORD-HOLDIF-INTERFACE | TUW-001 | 1 | — |
| 2.10 | SEC-DOCUPERM-ACCECONT | TUW-003~006 | 4 | 003 |
| 2.11 | DOC-PREVIEW-VIEWER | TUW-001~003 | 3 | — |
| 2.12 | AUDIT-DOCUAUDI-DOCUEVEN | TUW-001~005 | 5 | — |
| 2.13 | AI-AIPOLI-SCHEMAONLY | TUW-001 | 1 | — |

---

## 2.1 DOC-DOCUSTOR-OBJESTORAD — Object Storage Adapter

### DOC-DOCUSTOR-OBJESTORAD-TUW-001 — object storage adapter(S3/MinIO) 구현

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCUSTOR-OBJESTORAD-TUW-001 |
| Title | S3 호환 object storage adapter 구현 (개발환경 MinIO, DEC-07) |
| Release | R2 |
| Module | DOC-DOCUSTOR-OBJESTORAD |
| Risk | H |
| Size | M |
| Depends_on | DEVOPS-FREEZE-PERMMODEL-TUW-001 |
| Objective | `StorageAdapter` 인터페이스(put/get/head/delete, put-if-absent 의미론)와 S3 구현체가 MinIO 컨테이너 대상으로 통합 테스트를 통과한다. |
| Files to create | `apps/api/src/modules/storage/storage.module.ts`, `apps/api/src/modules/storage/storage.service.ts`, `apps/api/src/modules/storage/storage.service.spec.ts`, `apps/api/src/modules/storage/s3-storage.adapter.ts`, `apps/api/src/modules/storage/storage-adapter.interface.ts` |
| Files to modify | `infra/docker-compose.dev.yml`(minio 서비스·버킷 초기화), `.env.example`(S3 endpoint/credential 키), `apps/api/src/app.module.ts`(모듈 등록) |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능: `docker compose -f infra/docker-compose.dev.yml up -d` 후 put→get→head 왕복, 스트리밍 업로드(100MB급) 통과 2) 기능: put-if-absent — 동일 key 재-put 시 명시적 오류 3) 기능: MinIO 미기동 시 표준 오류(스택·credential 미노출) 4) 회귀: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green |
| Edge cases | 버킷 미존재 시 기동 검사 실패 메시지 / 네트워크 단절 중 put 재시도 정책 / 0바이트 객체 |
| Stop condition | 공통(§1.5) + S3 자격증명 관리 방식이 R0 설정 규약과 충돌 발견 시 |
| Escalation | execution ledger 기록 후 PACK PR `BLOCKED` |

### DOC-DOCUSTOR-OBJESTORAD-TUW-002 — storage path resolver (tenant prefix 필수)

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCUSTOR-OBJESTORAD-TUW-002 |
| Title | tenant prefix 강제 storage path resolver 구현 |
| Release | R2 |
| Module | DOC-DOCUSTOR-OBJESTORAD |
| Risk | H |
| Size | S |
| Depends_on | DOC-DOCUSTOR-OBJESTORAD-TUW-001 |
| Objective | 모든 object key가 `tenants/{tenant_id}/matters/{matter_id}/documents/{document_id}/{file_object_id}` 규약(20번 §5.4와 동일 — tenant_slug 사용 금지)을 따르고, 요청 컨텍스트의 tenant_id와 불일치하는 key 접근이 `TENANT_ISOLATION_VIOLATION`으로 차단된다. |
| Files to create | `apps/api/src/modules/storage/storage-path.resolver.ts`, `apps/api/src/modules/storage/storage-path.resolver.spec.ts` |
| Files to modify | `apps/api/src/modules/storage/storage.service.ts`(resolver 경유 강제 — adapter 직접 key 사용 금지) |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능: 정상 key 생성·파싱 왕복 2) 권한(negative): 타 tenant_id prefix key 접근 시도 → 차단 + `TENANT_ISOLATION_VIOLATION` 3) 권한(negative): `../`·URL 인코딩 traversal 입력 거부 4) 회귀: 기존 suite green |
| Edge cases | path traversal(`../`, `%2e%2e`) / key 내 비ASCII·공백 문자 / UUID 형식 위반 segment |
| Stop condition | 공통(§1.5) |
| Escalation | tenant 격리 위반 가능 경로 발견 시 즉시 중단·사람 보고(격리 위협은 H급 에스컬레이션) |

### DOC-DOCUSTOR-OBJESTORAD-TUW-003 — file object record 생성

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCUSTOR-OBJESTORAD-TUW-003 |
| Title | `file_objects` 테이블 + 레코드 생성 서비스 구현 |
| Release | R2 |
| Module | DOC-DOCUSTOR-OBJESTORAD |
| Risk | M |
| Size | M |
| Depends_on | DOC-DOCUSTOR-OBJESTORAD-TUW-002, CORE-DATACORE-MIGR-TUW-005 |
| Objective | 업로드 1건이 storage object와 1:1 대응하는 `file_objects` 행(`file_object_id, tenant_id, storage_uri, original_filename, normalized_filename, mime_type, size_bytes, encryption_key_id, source_system`)을 RLS 하에서 생성한다. |
| Files to create | `db/migrations/0201_create_file_objects.sql`(tenant_id NOT NULL + RLS), `apps/api/src/modules/storage/file-object.service.ts`, `apps/api/src/modules/storage/file-object.service.spec.ts` |
| Files to modify | `packages/shared/src/types/file-object.ts`(신규 export 추가 시 index) |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능: `pnpm db:migrate && pnpm db:rollback && pnpm db:migrate` 왕복 green 2) 기능: 레코드 생성·조회 통과 3) 권한(negative): 타 tenant 세션에서 RLS로 행 비가시 (`pnpm test:integration` cross-tenant) 4) 회귀: suite green |
| Edge cases | 동일 요청 재시도 멱등성(클라이언트 제공 idempotency key) / original_filename NFC/NFD 정규화 |
| Stop condition | 공통(§1.5) + 20번 문서의 file_objects DDL과 필드 충돌 시 |
| Escalation | execution ledger 기록 |

### DOC-DOCUSTOR-OBJESTORAD-TUW-004 — storage 실패 rollback

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCUSTOR-OBJESTORAD-TUW-004 |
| Title | storage-DB 정합 실패 시 보상 rollback 구현 |
| Release | R2 |
| Module | DOC-DOCUSTOR-OBJESTORAD |
| Risk | M |
| Size | S |
| Depends_on | DOC-DOCUSTOR-OBJESTORAD-TUW-003 |
| Objective | object put 성공 후 DB 트랜잭션 실패 시 업로드 object가 보상 삭제(또는 orphan 표시 후 정리 잡 enqueue)되어 고아 object가 잔존하지 않는다. |
| Files to create | `apps/api/src/modules/storage/storage-rollback.spec.ts` |
| Files to modify | `apps/api/src/modules/storage/storage.service.ts`, `apps/api/src/modules/storage/file-object.service.ts` |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능: DB 실패 주입 → object 보상 삭제 확인 2) 기능: 보상 삭제도 실패 시 orphan 기록·로그(본문 미포함) 남김 3) 회귀: suite green |
| Edge cases | 보상 삭제 자체 실패(이중 장애) / 트랜잭션 커밋 후 응답 직전 크래시(orphan 아님 — 정합 검사로 구분) |
| Stop condition | 공통(§1.5) |
| Escalation | execution ledger 기록 |

### DOC-DOCUSTOR-OBJESTORAD-TUW-005 — encryption hook interface

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCUSTOR-OBJESTORAD-TUW-005 |
| Title | at-rest 암호화 hook 인터페이스 작성 (DEC-07/DEC-13 대비) |
| Release | R2 |
| Module | DOC-DOCUSTOR-OBJESTORAD |
| Risk | M |
| Size | S |
| Depends_on | DOC-DOCUSTOR-OBJESTORAD-TUW-004 |
| Objective | `EncryptionHook` 인터페이스(beforePut/afterGet, `encryption_key_id` 결정)와 기본 pass-through 구현이 정의되어 R5 이후 컬럼·객체 암호화 강화 시 어댑터 교체만으로 가능하다. |
| Files to create | `apps/api/src/modules/storage/encryption-hook.interface.ts`, `apps/api/src/modules/storage/noop-encryption.hook.ts`, `apps/api/src/modules/storage/noop-encryption.hook.spec.ts` |
| Files to modify | `apps/api/src/modules/storage/storage.service.ts`(hook 주입 지점) |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능: hook 경유 put/get 왕복 동일 바이트 2) 기능: `encryption_key_id`가 file_objects에 기록 3) 회귀: suite green |
| Edge cases | hook 예외 발생 시 업로드 실패(fail-closed — 부분 저장 금지) |
| Stop condition | 공통(§1.5) + 실제 암호화 구현 요구로 범위 초과 판단 시(인터페이스만이 본 TUW 범위) |
| Escalation | execution ledger 기록 |

---

## 2.2 DOC-DOCUUPLO-UPLOAPI — Upload API

### DOC-DOCUUPLO-UPLOAPI-TUW-001 — document upload API

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCUUPLO-UPLOAPI-TUW-001 |
| Title | `POST /v1/matters/:matterId/documents` 업로드 API 구현 |
| Release | R2 |
| Module | DOC-DOCUUPLO-UPLOAPI |
| Risk | H |
| Size | L |
| Depends_on | DEVOPS-FREEZE-PERMMODEL-TUW-001, DOC-DOCUSTOR-OBJESTORAD-TUW-003, SEC-MATTPERM-ACCECONT-TUW-003, MATTER-MATTMANA-MATTREGI-TUW-001 |
| Objective | 인증·matter 멤버 사용자가 파일 1건을 업로드하면 storage object + `file_objects` + 최소 `documents` 행(status='Draft')이 원자적으로 생성되고 201과 document_id가 반환된다. |
| Files to create | `db/migrations/0202_create_documents_minimal.sql`(`document_id, tenant_id, matter_id, document_family_id, title, status, created_by, created_at` + RLS), `apps/api/src/modules/document/document.module.ts`, `apps/api/src/modules/document/document.controller.ts`, `apps/api/src/modules/document/document.service.ts`, `apps/api/src/modules/document/document.service.spec.ts`, `apps/api/src/modules/document/document-upload.service.ts`, `apps/api/src/modules/document/document-upload.service.spec.ts`, `packages/shared/src/dto/document/upload-document.dto.ts` |
| Files to modify | `apps/api/src/app.module.ts` |
| Files NOT to modify | 공통(§1.6) — 특히 permission 시그니처 변경 금지(호출만) |
| Verification (AND) | 1) 기능: 멤버 업로드 → 201 + documents/file_objects 행 + object 존재 2) 권한(negative): 비멤버·미인증 업로드 → `PERMISSION_DENIED`/`AUTH_REQUIRED` (canUploadToMatter 경유 — PermissionService 우회 endpoint 금지) 3) 권한(negative): 타 tenant matter에 업로드 → 차단 4) 회귀: suite green. (감사검증은 AUDIT-DOCUAUDI-DOCUEVEN-TUW-001에서 연결되며 R2 Gate 전 필수) |
| Edge cases | 0바이트 파일 거부 / 파일명 한글 NFD→NFC 정규화 / 동일 파일 동시 업로드 2건(각각 별도 document) |
| Stop condition | 공통(§1.5) + canUploadToMatter 시그니처가 Freeze 문서와 불일치 발견 시 |
| Escalation | execution ledger 기록 |

### DOC-DOCUUPLO-UPLOAPI-TUW-002 — multipart parser 설정

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCUUPLO-UPLOAPI-TUW-002 |
| Title | multipart/form-data 파서 설정 및 스트리밍 처리 |
| Release | R2 | Module | DOC-DOCUUPLO-UPLOAPI | Risk | M | Size | S |
| Depends_on | DOC-DOCUUPLO-UPLOAPI-TUW-001 |
| Objective | multipart 업로드가 메모리 적재 없이 스트리밍으로 storage adapter에 전달되고 잘못된 multipart 요청은 `VALIDATION_FAILED`로 거부된다. |
| Files to create | `apps/api/src/modules/document/multipart.config.ts`, `apps/api/src/modules/document/multipart.config.spec.ts` |
| Files to modify | `apps/api/src/modules/document/document.controller.ts` |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능: 정상 multipart 업로드 통과(대용량 스트리밍 — heap 사용량 상수 수준) 2) 기능(negative): 경계 손상·file part 누락 → `VALIDATION_FAILED` 3) 회귀: suite green |
| Edge cases | file part 2개 이상(거부 — 단건 API) / Content-Type 헤더 누락 |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 |

### DOC-DOCUUPLO-UPLOAPI-TUW-003 — 확장자 validation

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCUUPLO-UPLOAPI-TUW-003 |
| Title | 파일 확장자 화이트리스트 validation 구현 |
| Release | R2 | Module | DOC-DOCUUPLO-UPLOAPI | Risk | M | Size | S |
| Depends_on | DOC-DOCUUPLO-UPLOAPI-TUW-002 |
| Objective | 설정 기반 허용 확장자(최소 pdf/docx/hwpx 포함) 외 업로드가 `UNSUPPORTED_FILE_TYPE`으로 거부된다. |
| Files to create | `apps/api/src/modules/document/validators/file-extension.validator.ts`, `apps/api/src/modules/document/validators/file-extension.validator.spec.ts` |
| Files to modify | `apps/api/src/modules/document/document-upload.service.ts`, `.env.example`(허용 확장자 설정 키) |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능: 허용 확장자 통과 2) 기능(negative): `.exe`, 무확장자 → `UNSUPPORTED_FILE_TYPE` 3) 기능(negative): 이중 확장자 `.pdf.exe` 거부(최종 확장자 기준) 4) 회귀: suite green |
| Edge cases | 대문자 `.PDF`(허용 — case-insensitive) / 확장자만 있는 파일명 `.pdf` |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 |

### DOC-DOCUUPLO-UPLOAPI-TUW-004 — MIME validation

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCUUPLO-UPLOAPI-TUW-004 |
| Title | MIME type validation(magic bytes 대조) 구현 |
| Release | R2 | Module | DOC-DOCUUPLO-UPLOAPI | Risk | M | Size | S |
| Depends_on | DOC-DOCUUPLO-UPLOAPI-TUW-003 |
| Objective | 선언 MIME·확장자·실제 magic bytes 3자 대조에 실패한 업로드가 `UNSUPPORTED_FILE_TYPE`으로 거부되고 sniffing 결과가 `file_objects.mime_type`에 저장된다. |
| Files to create | `apps/api/src/modules/document/validators/mime-type.validator.ts`, `apps/api/src/modules/document/validators/mime-type.validator.spec.ts` |
| Files to modify | `apps/api/src/modules/document/document-upload.service.ts` |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능: PDF/DOCX/HWPX 정상 판별 fixture 통과 2) 기능(negative): 확장자 `.pdf` + ZIP magic bytes → 거부 3) 회귀: suite green |
| Edge cases | `application/octet-stream` 선언(실측 우선) / HWPX는 ZIP 컨테이너(내부 mimetype 엔트리로 구분) |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 |

### DOC-DOCUUPLO-UPLOAPI-TUW-005 — size validation

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCUUPLO-UPLOAPI-TUW-005 |
| Title | 파일 크기 한도 validation 구현 |
| Release | R2 | Module | DOC-DOCUUPLO-UPLOAPI | Risk | M | Size | S |
| Depends_on | DOC-DOCUUPLO-UPLOAPI-TUW-004 |
| Objective | 설정 한도(기본 200MB, env 조정 가능)를 초과하는 업로드가 스트리밍 중단과 함께 `VALIDATION_FAILED`로 거부된다. |
| Files to create | `apps/api/src/modules/document/validators/file-size.validator.ts`, `apps/api/src/modules/document/validators/file-size.validator.spec.ts` |
| Files to modify | `apps/api/src/modules/document/multipart.config.ts`, `.env.example` |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능: 한도 이하 통과, 정확히 한도 크기 통과 2) 기능(negative): 한도+1바이트 거부(스트림 조기 중단 — 전체 수신 후 거부 금지) 3) 기능(negative): Content-Length 위조(작게 선언, 실제 초과) 거부 4) 회귀: suite green |
| Edge cases | Content-Length 부재(chunked) 시 실측 카운트 |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 |

### DOC-DOCUUPLO-UPLOAPI-TUW-006 — upload permission check (H)

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCUUPLO-UPLOAPI-TUW-006 |
| Title | 업로드 권한 검사 완전 연결(role matrix × matter 상태 × wall) |
| Release | R2 | Module | DOC-DOCUUPLO-UPLOAPI | Risk | **H** | Size | M |
| Depends_on | DOC-DOCUUPLO-UPLOAPI-TUW-005, SEC-MATTPERM-ACCECONT-TUW-003, SEC-MATTPERM-ACCECONT-TUW-006 |
| Objective | 업로드 경로가 `canUploadToMatter`(fail-closed wrapper 경유)를 통과해야만 실행되며, R1 권한 매트릭스의 업로드 행(role 7종 × matter 상태 × wall 상태) 전 케이스가 expected와 일치한다. |
| Files to create | `tests/integration/document-access/upload-permission.spec.ts` |
| Files to modify | `apps/api/src/modules/document/document-upload.service.ts`, `apps/api/src/modules/document/document.controller.ts` |
| Files NOT to modify | 공통(§1.6) — permission 함수 본체·시그니처 수정 금지(호출만) |
| Verification (AND) | 1) 기능: 허용 케이스 업로드 성공 2) 권한(negative): 비멤버 / Limited Reviewer / External User / wall excluded / Closed·Archived matter 업로드 → 전부 차단(`PERMISSION_DENIED`, wall은 `ETHICAL_WALL_BLOCKED`) 3) 권한: 권한 평가 강제 오류 주입 → fail-closed 차단 4) 회귀: SEC-PERMHARN-MATRIX 하네스 green 유지 |
| Edge cases | 평가 중 membership 동시 변경(트랜잭션 시점 기준) / matter 상태 Closing 중 업로드(매트릭스 expected 따름) |
| Stop condition | 공통(§1.5) + 매트릭스 expected 불명확 케이스 발견 시(21번 문서로 해소 불가) |
| Escalation | execution ledger 기록 + 매트릭스 갱신은 Freeze 변경 절차 필요(사람 승인) |

### DOC-DOCUUPLO-UPLOAPI-TUW-007 — upload error 표준화

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCUUPLO-UPLOAPI-TUW-007 |
| Title | 업로드 오류 응답 표준화(error code 9종 매핑) |
| Release | R2 | Module | DOC-DOCUUPLO-UPLOAPI | Risk | M | Size | S |
| Depends_on | DOC-DOCUUPLO-UPLOAPI-TUW-006 |
| Objective | 업로드 전 구간 오류가 §1.8 표준 코드 + 안전 메시지(내부 경로·스택·타 리소스 정보 미노출)로 반환된다. |
| Files to create | `apps/api/src/modules/document/document-error.mapper.ts`, `apps/api/src/modules/document/document-error.mapper.spec.ts` |
| Files to modify | `apps/api/src/modules/document/document.controller.ts` |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능: validation/권한/storage 장애 각각 표준 코드 매핑 테스트 2) 기능(negative): 오류 응답 본문에 스택·내부 경로·SQL 부재 assert 3) 회귀: suite green |
| Edge cases | 미분류 예외 → 일반 500 + correlation id(상세 미노출) |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 |

### DOC-DOCUUPLO-UPLOAPI-TUW-008 — bulk upload job skeleton

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCUUPLO-UPLOAPI-TUW-008 |
| Title | bulk upload job skeleton(pg-boss) 구현 |
| Release | R2 | Module | DOC-DOCUUPLO-UPLOAPI | Risk | M | Size | M |
| Depends_on | DOC-DOCUUPLO-UPLOAPI-TUW-007 |
| Objective | 다건 업로드 요청을 pg-boss job(queue `document.bulk-upload`)으로 받아 항목별 단건 업로드 파이프라인(권한검사 포함)을 재사용해 처리하고 항목별 성공/실패 보고서를 남기는 skeleton이 동작한다(UI 없음). |
| Files to create | `apps/api/src/modules/document/bulk-upload.job.ts`, `apps/api/src/modules/document/bulk-upload.job.spec.ts`, `packages/shared/src/dto/document/bulk-upload.dto.ts` |
| Files to modify | `apps/api/src/modules/document/document.module.ts` |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능: 3건 중 1건 권한 실패 시나리오 → 2건 성공·1건 `PERMISSION_DENIED` 항목별 보고 2) 권한(negative): 항목별 권한검사 누락 없음(단건 파이프라인 재사용 확인) 3) 회귀: suite green |
| Edge cases | 중복 enqueue(dedupe key) / job 중단 후 재시작 시 부분 재처리 멱등성 |
| Stop condition | 공통(§1.5) + UI·대량 최적화 요구 발견 시(skeleton 범위 초과) |
| Escalation | execution ledger 기록 |

---

## 2.3 DOC-DOCUINTE-HASHDUPL — Document Integrity

### DOC-DOCUINTE-HASHDUPL-TUW-001 — SHA-256 생성

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCUINTE-HASHDUPL-TUW-001 |
| Title | 스트리밍 SHA-256 hash 생성 함수 구현 |
| Release | R2 | Module | DOC-DOCUINTE-HASHDUPL | Risk | M | Size | S |
| Depends_on | DOC-DOCUUPLO-UPLOAPI-TUW-001 |
| Objective | 업로드 스트림에서 단일 패스로 SHA-256을 계산하는 유틸이 알려진 test vector와 일치한다. |
| Files to create | `apps/api/src/modules/document/integrity/sha256.util.ts`, `apps/api/src/modules/document/integrity/sha256.util.spec.ts` |
| Files to modify | `apps/api/src/modules/document/document-upload.service.ts`(스트림 tee) |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능: NIST test vector·빈 파일 hash 일치 2) 기능: 대용량 스트리밍 시 메모리 상수 수준 3) 회귀: suite green |
| Edge cases | 스트림 중단 시 부분 hash 폐기(저장 금지) |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 |

### DOC-DOCUINTE-HASHDUPL-TUW-002 — hash 저장

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCUINTE-HASHDUPL-TUW-002 |
| Title | `file_objects.sha256` 저장(추후 DocumentVersion.file_hash가 참조) |
| Release | R2 | Module | DOC-DOCUINTE-HASHDUPL | Risk | M | Size | S |
| Depends_on | DOC-DOCUINTE-HASHDUPL-TUW-001 |
| Objective | 모든 업로드가 `file_objects.sha256`(NOT NULL, hex 64자)을 저장하며 hash 계산 실패 시 업로드 자체가 실패한다(fail-closed). VERSRESO-001의 `document_versions.file_hash`는 이 값을 승계한다. |
| Files to create | `db/migrations/0203_add_file_objects_sha256.sql` |
| Files to modify | `apps/api/src/modules/storage/file-object.service.ts`, `apps/api/src/modules/document/document-upload.service.ts` |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능: migrate/rollback 왕복 + 업로드 후 sha256 저장 확인 2) 기능: 동일 파일 2회 업로드 → 동일 hash, 1바이트 변경 → 상이 hash (R2 Gate 항목) 3) 기능(negative): hash 계산 오류 주입 → 업로드 실패·레코드 미생성 4) 회귀: suite green |
| Edge cases | 기존 행 backfill(R2 내 데이터는 신규뿐 — backfill 불필요 주석) |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 |

### DOC-DOCUINTE-HASHDUPL-TUW-003 — 중복 후보 탐지

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCUINTE-HASHDUPL-TUW-003 |
| Title | 동일 hash 중복 후보 탐지(권한 경계 내) 구현 |
| Release | R2 | Module | DOC-DOCUINTE-HASHDUPL | Risk | M | Size | M |
| Depends_on | DOC-DOCUINTE-HASHDUPL-TUW-002 |
| Objective | 업로드 응답에 **동일 tenant·동일 matter 내** 동일 sha256 문서의 중복 후보 목록이 포함되고, matter 밖·tenant 밖 문서는 존재 여부조차 노출되지 않는다. |
| Files to create | `apps/api/src/modules/document/integrity/duplicate-detector.service.ts`, `apps/api/src/modules/document/integrity/duplicate-detector.service.spec.ts` |
| Files to modify | `apps/api/src/modules/document/document-upload.service.ts`, `packages/shared/src/dto/document/upload-document.dto.ts`(응답에 duplicates 필드) |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능: 동일 matter 내 동일 hash → 후보 반환 2) 권한(negative): 타 matter·타 tenant에 동일 hash 존재 시 후보 미노출(개수 힌트 포함 일체 누설 금지 — metadata leakage 방지) 3) 회귀: suite green |
| Edge cases | 동일 matter 내 후보가 deleted 상태(후보 제외) / 후보 다수일 때 상한(예: 10건) |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 |

### DOC-DOCUINTE-HASHDUPL-TUW-004 — immutable original policy (C)

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCUINTE-HASHDUPL-TUW-004 |
| Title | 원본 불변(immutable original) 정책 집행 |
| Release | R2 | Module | DOC-DOCUINTE-HASHDUPL | Risk | **C — 사람 리뷰 게이트 필수(Codex 단독 머지 금지)** | Size | M |
| Depends_on | DOC-DOCUINTE-HASHDUPL-TUW-003, DOC-DOCUSTOR-OBJESTORAD-TUW-001 |
| Objective | 저장된 원본 object와 `file_objects` 행이 어떤 코드 경로로도 덮어쓰기·수정되지 않음을 계층별(storage put-if-absent, DB trigger로 storage_uri/sha256 UPDATE 차단, 서비스 계층 신규 FileObject 강제)로 집행한다(불변 원칙 5). |
| Files to create | `db/migrations/0204_file_objects_immutability_trigger.sql`, `tests/integration/storage-isolation/immutable-original.spec.ts` |
| Files to modify | `apps/api/src/modules/storage/s3-storage.adapter.ts`(put-if-absent 강제), `apps/api/src/modules/storage/file-object.service.ts` |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능(negative): 동일 object key 재-put 시도 → adapter 거부 2) 기능(negative): `file_objects.storage_uri/sha256` UPDATE 시도 → DB trigger 거부 3) 기능: 새 버전 업로드는 항상 신규 file_object_id·신규 key 4) 회귀: suite green 5) **사람 리뷰 승인 기록(PR)** |
| Edge cases | 멱등 재시도와 덮어쓰기 구분(idempotency key 동일하면 기존 레코드 반환, put 미수행) / 관리자 권한으로도 우회 불가 |
| Stop condition | 공통(§1.5) + 덮어쓰기 필요 사례 발견 시(설계 결함 — 즉시 에스컬레이션) |
| Escalation | execution ledger 기록 + 사람 리뷰 요청(머지 게이트) |

### DOC-DOCUINTE-HASHDUPL-TUW-005 — hash mismatch alert

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCUINTE-HASHDUPL-TUW-005 |
| Title | 다운로드 시 hash 재검증·불일치 alert 구현 |
| Release | R2 | Module | DOC-DOCUINTE-HASHDUPL | Risk | M | Size | S |
| Depends_on | DOC-DOCUINTE-HASHDUPL-TUW-004 |
| Objective | 다운로드/미리보기 경로에서 object의 재계산 hash가 저장값과 불일치하면 전송을 차단하고 `DOCUMENT_INTEGRITY_ALERT` audit event(참조 ID·hash만)와 metrics를 발생시킨다. |
| Files to create | `apps/api/src/modules/document/integrity/integrity-check.service.ts`, `apps/api/src/modules/document/integrity/integrity-check.service.spec.ts` |
| Files to modify | `apps/api/src/modules/storage/storage.service.ts` |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능: object 변조 fixture → 다운로드 차단 + alert 2) 감사: `DOCUMENT_INTEGRITY_ALERT` 발생, metadata에 기대/실측 hash만 포함(본문 없음) 3) 회귀: suite green |
| Edge cases | 대용량 파일 재검증 비용(스트리밍 검증, 응답은 검증 완료 후) / 검증 비활성 설정은 두지 않음(fail-closed) |
| Stop condition | 공통(§1.5) | Escalation | 불일치 실발생 시 사람 보고(데이터 무결성 사고) |

---

## 2.4 DOC-DOCUMETA-METAEXTR — Document Metadata

### DOC-DOCUMETA-METAEXTR-TUW-001 — metadata schema

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCUMETA-METAEXTR-TUW-001 |
| Title | documents 메타데이터 스키마 확장(07번·20번 정합) |
| Release | R2 | Module | DOC-DOCUMETA-METAEXTR | Risk | M | Size | M |
| Depends_on | DOC-DOCUUPLO-UPLOAPI-TUW-001, CORE-DATACORE-MIGR-TUW-005 |
| Objective | `documents`에 `document_type, subtype, confidentiality_level, privilege_status` 컬럼이 추가되어(07번 필드 정합, `ai_allowed`는 AI-AIPOLI-SCHEMAONLY-TUW-001 소관) RLS 하에서 읽기/쓰기가 동작한다. |
| Files to create | `db/migrations/0205_extend_documents_metadata.sql`, `packages/shared/src/types/document.ts` |
| Files to modify | `apps/api/src/modules/document/document.service.ts` |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능: migrate/rollback 왕복 2) 기능: 메타데이터 포함 생성·조회 3) 권한(negative): cross-tenant RLS 비가시 회귀 4) 회귀: suite green |
| Edge cases | confidentiality_level 기본값(20번 문서의 기본 등급 — 불명확 시 stop) / NULL 허용 필드 명시 |
| Stop condition | 공통(§1.5) + 20번 문서 DDL과 컬럼 충돌 시 |
| Escalation | execution ledger 기록 |

### DOC-DOCUMETA-METAEXTR-TUW-002 — document type enum

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCUMETA-METAEXTR-TUW-002 |
| Title | document type taxonomy enum 구현 |
| Release | R2 | Module | DOC-DOCUMETA-METAEXTR | Risk | M | Size | S |
| Depends_on | DOC-DOCUMETA-METAEXTR-TUW-001 |
| Objective | 원천 02·07번 기반 document_type/subtype enum이 `packages/domain`에 정의되고 API validation에 연결되어 미정의 값이 `VALIDATION_FAILED`로 거부된다. |
| Files to create | `packages/domain/src/document/document-type.ts`, `packages/domain/src/document/document-type.spec.ts` |
| Files to modify | `packages/shared/src/dto/document/upload-document.dto.ts`(zod enum) |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능: 전체 enum 값 왕복 2) 기능(negative): 미정의 값 거부 3) 회귀: suite green |
| Edge cases | 대소문자·공백 변형 입력 거부(정규화 후 매칭 금지 — 정확 일치) |
| Stop condition | 공통(§1.5) + taxonomy 목록이 원천에서 식별 불가 시 |
| Escalation | execution ledger 기록 |

### DOC-DOCUMETA-METAEXTR-TUW-003 — filename parser

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCUMETA-METAEXTR-TUW-003 |
| Title | 파일명 기반 metadata 후보 파서 구현 |
| Release | R2 | Module | DOC-DOCUMETA-METAEXTR | Risk | M | Size | M |
| Depends_on | DOC-DOCUMETA-METAEXTR-TUW-002 |
| Objective | 파일명에서 날짜·버전 표기·문서유형 키워드를 추출해 **후보(suggestion)** 로만 반환하고(자동 확정 금지), 패턴 미일치 시 빈 결과를 반환한다. |
| Files to create | `apps/api/src/modules/document/filename-metadata.parser.ts`, `apps/api/src/modules/document/filename-metadata.parser.spec.ts` |
| Files to modify | `apps/api/src/modules/document/document-upload.service.ts`(응답 suggestion 필드) |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능: 한국어 파일명 fixture 10종 파싱 기대값 일치 2) 기능: 미일치 파일명 → 빈 suggestion(추측 생성 금지) 3) 회귀: suite green |
| Edge cases | `계약서_v3_최종_(2).docx` 류 중첩 버전 표기 / 날짜 형식 혼재(YYYYMMDD, YYYY.MM.DD) |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 |

### DOC-DOCUMETA-METAEXTR-TUW-004 — manual metadata editor API

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCUMETA-METAEXTR-TUW-004 |
| Title | `PATCH /v1/documents/:id/metadata` 수동 편집 API 구현 |
| Release | R2 | Module | DOC-DOCUMETA-METAEXTR | Risk | M | Size | M |
| Depends_on | DOC-DOCUMETA-METAEXTR-TUW-003 |
| Objective | 편집 권한 보유자(canEditMatter 기반)가 화이트리스트 필드(title, document_type, subtype, confidentiality_level)만 수정할 수 있고 그 외 필드·비인가자는 거부된다. |
| Files to create | `packages/shared/src/dto/document/update-document-metadata.dto.ts` |
| Files to modify | `apps/api/src/modules/document/document.controller.ts`, `apps/api/src/modules/document/document.service.ts`, `apps/api/src/modules/document/document.service.spec.ts` |
| Files NOT to modify | 공통(§1.6) — `document_family_id`·status·hash 필드는 본 API로 수정 불가 |
| Verification (AND) | 1) 기능: 허용 필드 수정 왕복 2) 권한(negative): 비멤버·Limited Reviewer 수정 → `PERMISSION_DENIED` 3) 기능(negative): status/hash/family_id 수정 시도 → `VALIDATION_FAILED` 4) 회귀: suite green |
| Edge cases | Closed/Archived matter 문서 편집 차단(MATTER-MATTLIFE-STATENGI-TUW-005 규칙 준수) / 동시 수정(updated_at 기반 optimistic lock) |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 |

### DOC-DOCUMETA-METAEXTR-TUW-005 — metadata change audit (H)

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCUMETA-METAEXTR-TUW-005 |
| Title | `DOCUMENT_METADATA_CHANGED` audit 연결 |
| Release | R2 | Module | DOC-DOCUMETA-METAEXTR | Risk | **H** | Size | S |
| Depends_on | DOC-DOCUMETA-METAEXTR-TUW-004, AUDIT-AUDIEVENCO-AUDILOGG-TUW-002, AUDIT-AUDIEVENCO-AUDILOGG-TUW-003 |
| Objective | 메타데이터 수정 성공 시 `DOCUMENT_METADATA_CHANGED` audit event(변경 필드명 목록 + before/after는 화이트리스트 키·참조 수준)가 동일 트랜잭션으로 기록되며, 기록 실패 시 수정도 실패한다(audit-by-default). |
| Files to create | — |
| Files to modify | `apps/api/src/modules/document/document.service.ts`, `tests/integration/audit-coverage/document-audit.spec.ts`(케이스 추가) |
| Files NOT to modify | 공통(§1.6) — audit append-only 계층 |
| Verification (AND) | 1) 감사: 수정 1회 → event 1건, 필수 필드 충족 2) 감사(negative): audit 기록 강제 실패 주입 → 수정 트랜잭션 롤백 3) 기능: 변경 없는 PATCH(no-op) → event 미발생 4) 회귀: suite green |
| Edge cases | metadata_json에 자유 텍스트 값 원문 미기록(필드명·enum 값 수준만 — 불변 원칙 7) |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 |

### DOC-DOCUMETA-METAEXTR-TUW-006 — document status enum (11상태)

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCUMETA-METAEXTR-TUW-006 |
| Title | Document 11상태 enum + 전이 함수(domain) 구현 |
| Release | R2 | Module | DOC-DOCUMETA-METAEXTR | Risk | M | Size | M |
| Depends_on | DOC-DOCUMETA-METAEXTR-TUW-005 |
| Objective | §1.10의 11상태와 허용 전이가 `packages/domain` 순수 함수로 구현되고, documents.status 변경이 반드시 이 함수를 통과한다(위반 전이는 `VALIDATION_FAILED`). |
| Files to create | `packages/domain/src/document/document-status.ts`, `packages/domain/src/document/document-status.spec.ts` |
| Files to modify | `apps/api/src/modules/document/document.service.ts`, `db/migrations/0206_documents_status_check.sql`(CHECK 제약 — 신규 파일) |
| Files NOT to modify | 공통(§1.6) — 상태명 임의 변경·추가 금지(원천 07번 §4 그대로) |
| Verification (AND) | 1) 기능: 허용 전이 전수 테스트(인접 행렬) 2) 기능(negative): 비허용 전이(예: Executed→Draft) 거부 3) 회귀: suite green |
| Edge cases | Deleted/Disposal Locked에서의 모든 전이 차단(restore는 LIFEMANA-002의 명시 경로만) |
| Stop condition | 공통(§1.5) + 전이 행렬 불명확(20번 문서로 해소 불가) 시 |
| Escalation | execution ledger 기록 |

---

## 2.5 DOC-DOCUVERS-VERSRESO — Document Versioning

### DOC-DOCUVERS-VERSRESO-TUW-001 — DocumentVersion schema

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCUVERS-VERSRESO-TUW-001 |
| Title | `document_versions` 테이블 구현 |
| Release | R2 | Module | DOC-DOCUVERS-VERSRESO | Risk | H | Size | M |
| Depends_on | DOC-DOCUINTE-HASHDUPL-TUW-002, DOC-DOCUMETA-METAEXTR-TUW-001 |
| Objective | `document_versions`(`version_id, tenant_id, document_id, version_no, version_status, file_object_id, file_hash, created_by, created_at, supersedes_version_id`, UNIQUE(document_id, version_no), RLS)가 생성되고 기존 업로드 경로가 version 행을 함께 생성한다. |
| Files to create | `db/migrations/0207_create_document_versions.sql`, `apps/api/src/modules/document/document-version.service.ts`, `apps/api/src/modules/document/document-version.service.spec.ts` |
| Files to modify | `apps/api/src/modules/document/document-upload.service.ts`(최초 업로드 = version 1) |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능: migrate/rollback 왕복 + 업로드 시 version 1 생성, file_hash=file_objects.sha256 승계 2) 권한(negative): cross-tenant RLS 비가시 3) 회귀: suite green |
| Edge cases | file_object 1개가 여러 version에서 참조되지 않음(1:1) — FK UNIQUE |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 |

### DOC-DOCUVERS-VERSRESO-TUW-002 — family_id 규칙

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCUVERS-VERSRESO-TUW-002 |
| Title | `document_family_id` 생성·승계 규칙 구현 |
| Release | R2 | Module | DOC-DOCUVERS-VERSRESO | Risk | H | Size | M |
| Depends_on | DOC-DOCUVERS-VERSRESO-TUW-001 |
| Objective | 최초 업로드 시 family_id가 해당 문서의 document_id와 동일하게 설정되고(20번 §5.2), 같은 family에 추가되는 모든 버전이 동일 family_id를 승계하며 family_id는 설정 후 불변이다. |
| Files to create | `packages/domain/src/document/document-family.ts`, `packages/domain/src/document/document-family.spec.ts` |
| Files to modify | `apps/api/src/modules/document/document-version.service.ts`, `db/migrations/0208_documents_family_immutable_trigger.sql`(신규) |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능: 최초 업로드 시 family_id = document_id 설정, 버전 추가 승계 2) 기능(negative): family_id UPDATE 시도 → trigger 거부 3) 회귀: suite green |
| Edge cases | Deleted 상태 family에 버전 추가 시도(거부) / 타 matter 문서의 family에 연결 시도(거부) |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 |

### DOC-DOCUVERS-VERSRESO-TUW-003 — version_no 계산

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCUVERS-VERSRESO-TUW-003 |
| Title | version_no 단조증가 계산 함수 구현 |
| Release | R2 | Module | DOC-DOCUVERS-VERSRESO | Risk | M | Size | S |
| Depends_on | DOC-DOCUVERS-VERSRESO-TUW-002 |
| Objective | 동시 업로드 경쟁에서도 document별 version_no가 1부터 결번·중복 없이 단조증가한다(UNIQUE 제약 + 충돌 시 재시도). |
| Files to create | `apps/api/src/modules/document/version-number.resolver.ts`, `apps/api/src/modules/document/version-number.resolver.spec.ts` |
| Files to modify | `apps/api/src/modules/document/document-version.service.ts` |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능: 순차 추가 1..N 2) 기능: 동시 10건 추가 race → 중복·결번 0 (`pnpm test:integration`) 3) 회귀: suite green |
| Edge cases | 재시도 한도 도달 시 표준 오류(무한 루프 금지) |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 |

### DOC-DOCUVERS-VERSRESO-TUW-004 — 신규 버전 업로드 API

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCUVERS-VERSRESO-TUW-004 |
| Title | `POST /v1/documents/:documentId/versions` 신규 버전 API 구현 |
| Release | R2 | Module | DOC-DOCUVERS-VERSRESO | Risk | H | Size | L |
| Depends_on | DOC-DOCUVERS-VERSRESO-TUW-003 |
| Objective | 업로드 파이프라인(validation·hash·권한)을 재사용해 기존 문서에 신규 버전을 추가하면 **신규 FileObject + 신규 version 행**이 생성되고 원본은 불변이다(불변 원칙 5). |
| Files to create | `packages/shared/src/dto/document/add-version.dto.ts`, `tests/integration/document-access/document-versioning.spec.ts` |
| Files to modify | `apps/api/src/modules/document/document.controller.ts`, `apps/api/src/modules/document/document-version.service.ts` |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능: 버전 추가 → version_no+1, 신규 file_object, 기존 object 무변경(hash 재확인) 2) 권한(negative): 업로드 권한 없는 사용자 버전 추가 차단 3) 감사: `DOCUMENT_VERSION_ADDED` event 발생 4) 회귀: suite green |
| Edge cases | 직전 버전과 동일 hash 업로드(허용하되 응답에 중복 경고) / Archived·Deleted 문서에 버전 추가 거부 |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 |

### DOC-DOCUVERS-VERSRESO-TUW-005 — 버전 목록 API

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCUVERS-VERSRESO-TUW-005 |
| Title | `GET /v1/documents/:documentId/versions` 목록 API 구현 |
| Release | R2 | Module | DOC-DOCUVERS-VERSRESO | Risk | M | Size | S |
| Depends_on | DOC-DOCUVERS-VERSRESO-TUW-004 |
| Objective | 읽기 권한 보유자가 버전 목록(version_no 내림차순, hash·작성자·시각 포함)을 조회하고 비인가자는 차단된다. |
| Files to create | `packages/shared/src/dto/document/version-list.dto.ts` |
| Files to modify | `apps/api/src/modules/document/document.controller.ts`, `apps/api/src/modules/document/document-version.service.ts` |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능: 다버전 문서 목록 정렬·필드 일치 2) 권한(negative): 비멤버 조회 → `PERMISSION_DENIED`(목록 크기 힌트 미노출) 3) 회귀: suite green |
| Edge cases | 단일 버전 문서 / 페이지네이션(버전 수 과다) |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 |

### DOC-DOCUVERS-VERSRESO-TUW-006 — superseded 표시

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCUVERS-VERSRESO-TUW-006 |
| Title | superseded version 자동 표시 구현 |
| Release | R2 | Module | DOC-DOCUVERS-VERSRESO | Risk | M | Size | S |
| Depends_on | DOC-DOCUVERS-VERSRESO-TUW-005 |
| Objective | 신규 버전 추가 시 직전 최신 버전의 `version_status`가 superseded로, `supersedes_version_id`가 연결되어 항상 정확히 1개의 current 버전이 유지된다. |
| Files to create | — |
| Files to modify | `apps/api/src/modules/document/document-version.service.ts`, `apps/api/src/modules/document/document-version.service.spec.ts`, `tests/integration/document-access/document-versioning.spec.ts` |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능: 3버전 추가 후 current 1개·superseded 2개·체인 정합 2) 기능: 동시 추가 race 후에도 current 정확히 1개 3) 회귀: suite green |
| Edge cases | current 버전 superseded 직접 마킹 시도(거부 — 신규 버전 추가로만 전이) |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 |

### DOC-DOCUVERS-VERSRESO-TUW-007 — version status filter

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCUVERS-VERSRESO-TUW-007 |
| Title | 버전 목록 status filter 구현 |
| Release | R2 | Module | DOC-DOCUVERS-VERSRESO | Risk | M | Size | S |
| Depends_on | DOC-DOCUVERS-VERSRESO-TUW-006 |
| Objective | 버전 목록 API가 `?status=current|superseded` 필터를 지원하고 미정의 값은 `VALIDATION_FAILED`로 거부한다. |
| Files to create | — |
| Files to modify | `apps/api/src/modules/document/document.controller.ts`, `apps/api/src/modules/document/document-version.service.ts`, `packages/shared/src/dto/document/version-list.dto.ts` |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능: 필터별 결과 정확성 2) 기능(negative): 미정의 status 값 거부 3) 회귀: suite green |
| Edge cases | 필터 결과 0건(빈 배열, 404 아님) |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 |

---

## 2.6 DOC-OCRTEXTEXT-EXTRWORK — Extraction Worker

### DOC-OCRTEXTEXT-EXTRWORK-TUW-001 — extraction job queue (pg-boss)

| 필드 | 내용 |
|---|---|
| ID | DOC-OCRTEXTEXT-EXTRWORK-TUW-001 |
| Title | 추출 job queue(pg-boss `ingestion.extract`) + worker dispatcher + 결과 테이블 구현 |
| Release | R2 | Module | DOC-OCRTEXTEXT-EXTRWORK | Risk | H | Size | L |
| Depends_on | DEVOPS-FREEZE-PERMMODEL-TUW-001, DOC-DOCUVERS-VERSRESO-TUW-001, CORE-REPOBUIL-CICD-TUW-002 |
| Objective | 버전 생성 시 `ingestion.extract` job(payload는 version_id 등 참조 ID만 — 본문·파일 미포함)이 enqueue되고, dispatcher가 workers/ingestion FastAPI `/extract`를 호출해 결과를 `canonical_documents`(`canonical_id, tenant_id, version_id, body_text, extraction_status, extraction_method, confidence, extracted_at`, RLS)에 저장한다. |
| Files to create | `db/migrations/0209_create_canonical_documents.sql`, `apps/api/src/modules/document/extraction/extraction-queue.service.ts`, `apps/api/src/modules/document/extraction/extraction-queue.service.spec.ts`, `apps/api/src/modules/document/extraction/extraction-dispatcher.ts`, `workers/ingestion/app/main.py`, `workers/ingestion/app/extract_router.py`, `workers/ingestion/tests/test_extract_router.py` |
| Files to modify | `infra/docker-compose.dev.yml`(ingestion worker 서비스), `apps/api/src/modules/document/document-version.service.ts`(enqueue hook), `turbo.json`(worker 테스트를 `pnpm test`에 연결) |
| Files NOT to modify | 공통(§1.6) — `packages/ai/`(chunking은 R6) |
| Verification (AND) | 1) 기능: 업로드→job 생성→worker 호출→canonical_documents 행 생성 e2e (`docker compose ... up -d` 후 `pnpm test:integration`) 2) 기능: job payload에 파일 본문·원문 부재 assert(참조 ID만 — 불변 원칙 7) 3) 권한(negative): worker가 타 tenant version_id 처리 요청 거부(tenant 검증) 4) 회귀: suite green |
| Edge cases | 동일 version 중복 enqueue(dedupe key=version_id) / worker 다운 중 enqueue(재기동 후 처리) |
| Stop condition | 공통(§1.5) + pg-boss↔Python 연동 방식이 10번 문서와 충돌 시 |
| Escalation | execution ledger 기록 |

### DOC-OCRTEXTEXT-EXTRWORK-TUW-002 — PDF extractor

| 필드 | 내용 |
|---|---|
| ID | DOC-OCRTEXTEXT-EXTRWORK-TUW-002 |
| Title | PDF 텍스트 추출 어댑터(Python) 구현 |
| Release | R2 | Module | DOC-OCRTEXTEXT-EXTRWORK | Risk | M | Size | M |
| Depends_on | DOC-OCRTEXTEXT-EXTRWORK-TUW-001 |
| Objective | 텍스트 레이어가 있는 PDF에서 페이지 순서 보존 텍스트를 추출해 `extraction_method='pdf_text'`, `confidence=1.0`으로 저장한다. |
| Files to create | `workers/ingestion/parsers/pdf/pdf_extractor.py`, `workers/ingestion/tests/test_pdf_extractor.py`, `tests/fixtures/pdf/`(한국어 계약서 비식별 fixture 3종) |
| Files to modify | `workers/ingestion/app/extract_router.py` |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능: fixture 3종 기대 텍스트 일치(한국어 인코딩 무손실) 2) 기능(negative): 암호화 PDF → 명시적 실패 코드(크래시 금지) 3) 회귀: suite green |
| Edge cases | 텍스트 레이어 없는 스캔 PDF(EXTRWORK-004로 위임) / 손상 PDF |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 |

### DOC-OCRTEXTEXT-EXTRWORK-TUW-003 — DOCX extractor

| 필드 | 내용 |
|---|---|
| ID | DOC-OCRTEXTEXT-EXTRWORK-TUW-003 |
| Title | DOCX 텍스트 추출 어댑터(Python) 구현 |
| Release | R2 | Module | DOC-OCRTEXTEXT-EXTRWORK | Risk | M | Size | M |
| Depends_on | DOC-OCRTEXTEXT-EXTRWORK-TUW-002 |
| Objective | DOCX 본문·표·각주 텍스트를 문서 순서로 추출해 `extraction_method='docx'`, `confidence=1.0`으로 저장한다. |
| Files to create | `workers/ingestion/parsers/docx/docx_extractor.py`, `workers/ingestion/tests/test_docx_extractor.py`, `tests/fixtures/docx/`(fixture 3종) |
| Files to modify | `workers/ingestion/app/extract_router.py` |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능: fixture 기대 텍스트 일치(표 셀 포함) 2) 기능(negative): 암호 보호 DOCX → 명시적 실패 3) 회귀: suite green |
| Edge cases | 매크로 포함(.docm은 확장자 단계에서 이미 거부) / 변경추적(track changes) 텍스트 처리 정책(수락 본문 기준) |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 |

### DOC-OCRTEXTEXT-EXTRWORK-TUW-004 — OCR pending status

| 필드 | 내용 |
|---|---|
| ID | DOC-OCRTEXTEXT-EXTRWORK-TUW-004 |
| Title | OCR pending 상태 처리 구현 |
| Release | R2 | Module | DOC-OCRTEXTEXT-EXTRWORK | Risk | M | Size | S |
| Depends_on | DOC-OCRTEXTEXT-EXTRWORK-TUW-003, DOC-DOCUMETA-METAEXTR-TUW-006 |
| Objective | 텍스트 레이어가 없는(또는 추출량 임계 미만) PDF가 `extraction_status='ocr_pending'`으로 표시되고 문서 상세 응답에 해당 상태가 노출된다(OCR 엔진 자체 연결은 worker 내 후속 — 상태 계약이 본 TUW 범위). |
| Files to create | `workers/ingestion/parsers/pdf/text_layer_detector.py`, `workers/ingestion/tests/test_text_layer_detector.py` |
| Files to modify | `workers/ingestion/app/extract_router.py`, `apps/api/src/modules/document/document.service.ts`(상세 응답 extraction_status) |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능: 스캔 PDF fixture → ocr_pending 저장·노출 2) 기능: 텍스트 PDF는 ocr_pending 미진입 3) 회귀: suite green |
| Edge cases | 일부 페이지만 스캔인 혼합 PDF(임계 비율 기준, 설정값) |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 |

### DOC-OCRTEXTEXT-EXTRWORK-TUW-005 — confidence 저장

| 필드 | 내용 |
|---|---|
| ID | DOC-OCRTEXTEXT-EXTRWORK-TUW-005 |
| Title | extraction confidence 저장 구현 |
| Release | R2 | Module | DOC-OCRTEXTEXT-EXTRWORK | Risk | M | Size | S |
| Depends_on | DOC-OCRTEXTEXT-EXTRWORK-TUW-004 |
| Objective | 모든 추출 결과가 `confidence`(0.0~1.0, CHECK 제약)와 `extraction_method`를 저장하며 범위 밖 값은 저장 단계에서 거부된다. |
| Files to create | — |
| Files to modify | `workers/ingestion/app/extract_router.py`, `apps/api/src/modules/document/extraction/extraction-dispatcher.ts`, `db/migrations/0210_canonical_confidence_check.sql`(신규) |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능: 방법별 confidence 저장 확인(텍스트 추출=1.0) 2) 기능(negative): 1.0 초과·음수 → 거부 3) 회귀: suite green |
| Edge cases | confidence null(허용 안 함 — 방법별 기본값 명시) |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 |

### DOC-OCRTEXTEXT-EXTRWORK-TUW-006 — 실패 retry

| 필드 | 내용 |
|---|---|
| ID | DOC-OCRTEXTEXT-EXTRWORK-TUW-006 |
| Title | 추출 실패 retry·영구 실패 처리 구현 |
| Release | R2 | Module | DOC-OCRTEXTEXT-EXTRWORK | Risk | M | Size | M |
| Depends_on | DOC-OCRTEXTEXT-EXTRWORK-TUW-005 |
| Objective | 일시 실패는 지수 백오프로 최대 3회 재시도되고, 영구 실패는 `extraction_status='failed'` + 실패 사유 코드(본문 미포함)로 종결되며 metrics에 집계된다. |
| Files to create | `apps/api/src/modules/document/extraction/extraction-retry.spec.ts` |
| Files to modify | `apps/api/src/modules/document/extraction/extraction-queue.service.ts`(pg-boss retry 옵션), `workers/ingestion/app/extract_router.py`(실패 분류) |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능: 일시 실패 주입 → 재시도 후 성공 2) 기능: 영구 실패(손상 파일) → 3회 후 failed 종결·poison job 격리 3) 기능: 실패 사유에 파일 본문·내용 미포함 4) 회귀: suite green |
| Edge cases | 재시도 중 문서 삭제됨(잡 중단·정리) / worker 타임아웃 vs 실패 구분 |
| Stop condition | 공통(§1.5) — 동일 실패 3회 반복 시 중단·에스컬레이션(§1.5와 잡 재시도는 별개) |
| Escalation | execution ledger 기록 |

---

## 2.7 DOC-HWPX-EXTRACT — HWPX 추출 (DEC-10)

### DOC-HWPX-EXTRACT-TUW-001 — HWPX 텍스트 추출 어댑터

| 필드 | 내용 |
|---|---|
| ID | DOC-HWPX-EXTRACT-TUW-001 |
| Title | HWPX(XML) 텍스트 추출 어댑터 구현 — HWP 5.0 바이너리 제외 |
| Release | R2 | Module | DOC-HWPX-EXTRACT | Risk | M | Size | M |
| Depends_on | DEVOPS-FREEZE-PERMMODEL-TUW-001, DOC-OCRTEXTEXT-EXTRWORK-TUW-001 |
| Objective | HWPX(ZIP+XML) 파일에서 본문·표 텍스트를 추출해 `extraction_method='hwpx'`로 저장하고, HWP 5.0 바이너리는 `UNSUPPORTED_FILE_TYPE`으로 명시 거부한다(DEC-10 — R4~R6 별도 트랙). |
| Files to create | `workers/ingestion/parsers/hwpx/hwpx_extractor.py`, `workers/ingestion/tests/test_hwpx_extractor.py` |
| Files to modify | `workers/ingestion/app/extract_router.py` |
| Files NOT to modify | 공통(§1.6) — HWP 바이너리 파서 추가 금지 |
| Verification (AND) | 1) 기능: 기본 HWPX fixture 텍스트 추출 일치 2) 기능(negative): HWP 5.0 바이너리 입력 → 명시적 unsupported(크래시·부분 추출 금지) 3) 회귀: suite green |
| Edge cases | ZIP 손상 HWPX / `mimetype` 엔트리 누락 변형 파일 |
| Stop condition | 공통(§1.5) + HWP 바이너리 지원 요구 발견 시(범위 외 — 즉시 중단) |
| Escalation | execution ledger 기록 |

### DOC-HWPX-EXTRACT-TUW-002 — HWPX fixture 검증 5종

| 필드 | 내용 |
|---|---|
| ID | DOC-HWPX-EXTRACT-TUW-002 |
| Title | HWPX fixture 5종 회귀 검증 세트 구축 |
| Release | R2 | Module | DOC-HWPX-EXTRACT | Risk | M | Size | S |
| Depends_on | DOC-HWPX-EXTRACT-TUW-001 |
| Objective | 비식별 HWPX fixture 5종(일반 본문/표 포함/이미지 위주/대용량/구버전 포맷)과 기대 텍스트 스냅샷이 CI 회귀 세트로 고정된다. |
| Files to create | `tests/fixtures/hwpx/sample_01_basic.hwpx` ~ `sample_05_legacy.hwpx`, `tests/fixtures/hwpx/expected/*.txt`, `workers/ingestion/tests/test_hwpx_fixtures.py` |
| Files to modify | — |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능: 5종 전부 기대 스냅샷 일치 2) 기능: 이미지 위주 fixture → 빈 텍스트 + 정상 종결(실패 아님) 3) 회귀: suite green |
| Edge cases | fixture에 실제 개인정보·실명 부재 검수(비식별 규칙) |
| Stop condition | 공통(§1.5) + 비식별 fixture 확보 불가 시(fixture 부재 = 공통 stop) |
| Escalation | execution ledger 기록 + fixture 공급 요청 |

---

## 2.8 DOC-DOCULIFE-LIFEMANA — Document Lifecycle

### DOC-DOCULIFE-LIFEMANA-TUW-001 — soft delete

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCULIFE-LIFEMANA-TUW-001 |
| Title | `DELETE /v1/documents/:id` soft delete 구현 (hard delete 금지) |
| Release | R2 | Module | DOC-DOCULIFE-LIFEMANA | Risk | H | Size | M |
| Depends_on | DEVOPS-FREEZE-PERMMODEL-TUW-001, DOC-DOCUVERS-VERSRESO-TUW-001, DOC-DOCUMETA-METAEXTR-TUW-006 |
| Objective | 삭제 권한 보유자의 삭제 요청이 status='Deleted' + `deleted_at/deleted_by` 마킹으로만 처리되고, 행·object의 물리 삭제 경로가 코드베이스에 존재하지 않는다(절대 금지: hard delete). |
| Files to create | `apps/api/src/modules/document/document-lifecycle.service.ts`, `apps/api/src/modules/document/document-lifecycle.service.spec.ts`, `db/migrations/0211_documents_soft_delete_columns.sql` |
| Files to modify | `apps/api/src/modules/document/document.controller.ts` |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능: 삭제 후 행 잔존·status=Deleted·object 잔존 2) 권한(negative): 비인가 삭제 → `PERMISSION_DENIED` 3) 기능(negative): 코드베이스에 documents/file_objects 대상 물리 DELETE 부재(정적 검사 스크립트) 4) 회귀: suite green. (`DOCUMENT_DELETED` audit는 DOCUEVEN-004에서 연결 — R2 Gate 전 필수) |
| Edge cases | 이미 Deleted 문서 재삭제(멱등 204 또는 409 — DTO에 명시) / 삭제 문서의 상세 조회 정책(멤버에게 tombstone) |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 |

### DOC-DOCULIFE-LIFEMANA-TUW-002 — restore (C)

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCULIFE-LIFEMANA-TUW-002 |
| Title | `POST /v1/documents/:id/restore` 복구 구현 |
| Release | R2 | Module | DOC-DOCULIFE-LIFEMANA | Risk | **C — 사람 리뷰 게이트 필수(Codex 단독 머지 금지)** | Size | M |
| Depends_on | DOC-DOCULIFE-LIFEMANA-TUW-001 |
| Objective | Matter Owner 또는 Firm Admin만 Deleted 문서를 삭제 직전 상태로 복구할 수 있고, 복구는 `DOCUMENT_RESTORED` audit와 함께만 완료된다. |
| Files to create | `tests/integration/document-access/document-restore.spec.ts` |
| Files to modify | `apps/api/src/modules/document/document-lifecycle.service.ts`, `apps/api/src/modules/document/document.controller.ts` |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능: 삭제→복구 후 상태·버전 체인·family 정합 복원 2) 권한(negative): Matter Member(일반)·비멤버 복구 시도 → `PERMISSION_DENIED` 3) 감사: `DOCUMENT_RESTORED` event(복구 전 상태 참조 포함) 4) 회귀: suite green 5) **사람 리뷰 승인 기록(PR)** |
| Edge cases | 삭제 전 상태 추적(직전 status 저장 필요 — 삭제 시 `previous_status` 기록) / Deleted 아닌 문서 restore 거부 / 소속 matter가 Archived면 복구 거부 |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 + 사람 리뷰 요청 |

### DOC-DOCULIFE-LIFEMANA-TUW-003 — legal-hold delete block

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCULIFE-LIFEMANA-TUW-003 |
| Title | legal hold 삭제 차단 hook 연결(HOLDIF 인터페이스 사용) |
| Release | R2 | Module | DOC-DOCULIFE-LIFEMANA | Risk | H | Size | M |
| Depends_on | DOC-DOCULIFE-LIFEMANA-TUW-002, RECORD-HOLDIF-INTERFACE-TUW-001 |
| Objective | `documents.legal_hold=true` 또는 소속 `matters.legal_hold=true`인 문서의 삭제 요청이 precondition check에서 `DOCUMENT_LOCKED`로 차단된다. |
| Files to create | `tests/integration/legal-hold/legal-hold-block.spec.ts` |
| Files to modify | `apps/api/src/modules/document/document-lifecycle.service.ts` |
| Files NOT to modify | 공통(§1.6) — R12 LegalHold 테이블 생성 금지(flag 인터페이스만 사용) |
| Verification (AND) | 1) 기능(negative): document hold 삭제 시도 → `DOCUMENT_LOCKED` 2) 기능(negative): matter hold 산하 문서 삭제 시도 → `DOCUMENT_LOCKED` 3) 기능: hold 해제 후 삭제 정상 동작 4) 회귀: suite green |
| Edge cases | hold 검사와 삭제 사이 race(동일 트랜잭션에서 flag 재확인) / bulk 경로에서도 항목별 차단 |
| Stop condition | 공통(§1.5) + 전체 LegalHold 테이블 필요 판단 시(R12 영역 — 중단) |
| Escalation | execution ledger 기록 |

### DOC-DOCULIFE-LIFEMANA-TUW-004 — archived mutation 차단 (C)

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCULIFE-LIFEMANA-TUW-004 |
| Title | Archived 문서 mutation 전면 차단 |
| Release | R2 | Module | DOC-DOCULIFE-LIFEMANA | Risk | **C — 사람 리뷰 게이트 필수(Codex 단독 머지 금지)** | Size | M |
| Depends_on | DOC-DOCULIFE-LIFEMANA-TUW-003 |
| Objective | status='Archived'(또는 'Disposal Locked') 문서에 대한 메타데이터 수정·버전 추가·삭제가 모든 endpoint에서 차단되고(`VALIDATION_FAILED`/`DOCUMENT_LOCKED`), 차단이 단일 guard로 중앙화되어 우회 경로가 없다. |
| Files to create | `apps/api/src/modules/document/guards/immutable-state.guard.ts`, `apps/api/src/modules/document/guards/immutable-state.guard.spec.ts`, `tests/integration/document-access/archived-mutation-block.spec.ts` |
| Files to modify | `apps/api/src/modules/document/document.controller.ts`(mutation 경로 전체에 guard 적용) |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능(negative): Archived 문서 metadata PATCH/버전 POST/DELETE 전부 차단 2) 기능: mutation endpoint 전수 조사 테스트(guard 미적용 경로 0건) 3) 권한: Firm Admin도 우회 불가(상태 차단은 권한과 독립) 4) 회귀: suite green 5) **사람 리뷰 승인 기록(PR)** |
| Edge cases | Archived matter 산하 비archived 문서 정책(MATTER-MATTLIFE-STATENGI-TUW-004 규칙 준수 — matter Archived면 문서 mutation도 차단) / 읽기·다운로드는 허용 |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 + 사람 리뷰 요청 |

### DOC-DOCULIFE-LIFEMANA-TUW-005 — download + download audit (H)

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCULIFE-LIFEMANA-TUW-005 |
| Title | `GET /v1/documents/:id/download` 다운로드 endpoint + `DOCUMENT_DOWNLOADED` audit 연결 |
| Release | R2 | Module | DOC-DOCULIFE-LIFEMANA | Risk | **H** | Size | M |
| Depends_on | DOC-DOCULIFE-LIFEMANA-TUW-004, SEC-DOCUPERM-ACCECONT-TUW-003, AUDIT-DOCUAUDI-DOCUEVEN-TUW-003 |
| Objective | 다운로드가 `canDownloadDocument` 통과 시에만 단기 만료 서명 URL(또는 스트림)으로 제공되고, 제공 시점에 `DOCUMENT_DOWNLOADED` audit가 기록되며 audit 실패 시 다운로드도 실패한다. |
| Files to create | `tests/integration/document-access/document-download.spec.ts` |
| Files to modify | `apps/api/src/modules/document/document.controller.ts`, `apps/api/src/modules/document/document-lifecycle.service.ts`, `apps/api/src/modules/storage/storage.service.ts`(서명 URL 발급 — tenant·만료 검증 포함) |
| Files NOT to modify | 공통(§1.6) — PermissionService 우회 다운로드 경로 생성 금지 |
| Verification (AND) | 1) 기능: 인가 다운로드 바이트 일치(hash 재검증 — HASHDUPL-005 경유) 2) 권한(negative): 비인가·wall excluded 다운로드 차단, 만료 서명 URL 재사용 차단, 타 tenant 서명 URL 차단 3) 감사: 다운로드 1회당 `DOCUMENT_DOWNLOADED` 1건 4) 회귀: suite green |
| Edge cases | Deleted 문서 다운로드 거부 / 서명 URL TTL(기본 60초, env) / Range 요청 |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 |

### DOC-DOCULIFE-LIFEMANA-TUW-006 — view audit (H)

| 필드 | 내용 |
|---|---|
| ID | DOC-DOCULIFE-LIFEMANA-TUW-006 |
| Title | 문서 상세 열람 `DOCUMENT_VIEWED` audit 연결 |
| Release | R2 | Module | DOC-DOCULIFE-LIFEMANA | Risk | **H** | Size | S |
| Depends_on | DOC-DOCULIFE-LIFEMANA-TUW-005, AUDIT-DOCUAUDI-DOCUEVEN-TUW-002 |
| Objective | 문서 상세 조회(`GET /v1/documents/:id`)와 본문 열람이 `DOCUMENT_VIEWED` audit와 함께만 완료되고, 목록 조회는 VIEWED를 발생시키지 않는다(이벤트 남발 방지 계약). |
| Files to create | — |
| Files to modify | `apps/api/src/modules/document/document.controller.ts`, `apps/api/src/modules/document/document.service.ts`, `tests/integration/audit-coverage/document-audit.spec.ts` |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 감사: 상세 조회 1회 → VIEWED 1건(필수 필드 충족) 2) 감사: 목록 조회 → VIEWED 0건 3) 권한(negative): 비인가 상세 조회 → 차단 + VIEWED 미발생(ACCESS_DENIED audit는 R1 PERMEVEN-002 경로) 4) 회귀: suite green |
| Edge cases | 동일 사용자 연속 조회(매회 기록 — dedup 없음, 명시) |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 |

---

## 2.9 RECORD-HOLDIF-INTERFACE — Legal Hold 인터페이스 (보정 C-3)

### RECORD-HOLDIF-INTERFACE-TUW-001 — legal hold 인터페이스 계약

| 필드 | 내용 |
|---|---|
| ID | RECORD-HOLDIF-INTERFACE-TUW-001 |
| Title | legal hold flag + delete precondition check 인터페이스 구현 |
| Release | R2 | Module | RECORD-HOLDIF-INTERFACE | Risk | H | Size | M |
| Depends_on | DEVOPS-FREEZE-PERMMODEL-TUW-001, DOC-DOCUMETA-METAEXTR-TUW-001, MATTER-MATTMANA-MATTREGI-TUW-001 |
| Objective | `documents.legal_hold`·`matters.legal_hold`(boolean NOT NULL DEFAULT false) 컬럼과 `assertDeletable(document)` 순수 함수(둘 중 하나라도 true면 `DOCUMENT_LOCKED`) 및 flag 변경 API(Firm Admin·Security Admin 한정, `LEGAL_HOLD_CHANGED` audit)가 제공된다. **R12 LegalHold/disposal 테이블 생성 금지 — flag 인터페이스 계약만.** |
| Files to create | `db/migrations/0212_add_legal_hold_flags.sql`, `packages/domain/src/records/legal-hold.ts`, `packages/domain/src/records/legal-hold.spec.ts` |
| Files to modify | `apps/api/src/modules/document/document.controller.ts`(flag 변경 endpoint), `apps/api/src/modules/matter/matter.controller.ts`, `apps/api/src/modules/matter/matter.service.ts` |
| Files NOT to modify | 공통(§1.6) — `legal_holds`·`retention_policies`·disposal 계열 테이블 생성 금지(예약 스키마 문서화만, Brief §5-7) |
| Verification (AND) | 1) 기능: migrate/rollback 왕복 + flag 변경 왕복 2) 권한(negative): Matter Owner·일반 멤버의 flag 변경 → `PERMISSION_DENIED` 3) 감사: `LEGAL_HOLD_CHANGED` event(before/after flag) 4) 기능(negative): `legal_holds` 테이블 미존재 assert(스키마 스냅샷) 5) 회귀: suite green |
| Edge cases | hold 중 버전 추가·열람은 허용(삭제만 차단 — 계약에 명시) / matter flag 해제가 document flag를 자동 해제하지 않음 |
| Stop condition | 공통(§1.5) + R12 테이블 필요 판단 시 즉시 중단 |
| Escalation | execution ledger 기록 |

---

## 2.10 SEC-DOCUPERM-ACCECONT — Document Permission (R1 시그니처의 구현화)

### SEC-DOCUPERM-ACCECONT-TUW-003 — confidentiality policy + canRead/canDownload 구현 (C)

| 필드 | 내용 |
|---|---|
| ID | SEC-DOCUPERM-ACCECONT-TUW-003 |
| Title | document confidentiality policy 구현 — R1 `canReadDocument`/`canDownloadDocument` 시그니처의 본체 구현 포함 |
| Release | R2 | Module | SEC-DOCUPERM-ACCECONT | Risk | **C — 사람 리뷰 게이트 필수(Codex 단독 머지 금지)** | Size | L |
| Depends_on | DEVOPS-FREEZE-PERMMODEL-TUW-001, SEC-DOCUPERM-ACCECONT-TUW-001, SEC-DOCUPERM-ACCECONT-TUW-002, SEC-MATTPERM-ACCECONT-TUW-001, SEC-MATTPERM-ACCECONT-TUW-006, SEC-ETHIWALL-WALLENFO-TUW-002, DOC-DOCUMETA-METAEXTR-TUW-001 |
| Objective | R1에서 동결된 시그니처 그대로 `canReadDocument`·`canDownloadDocument` 본체를 구현한다 — 평가 계약(Brief §5-4): default-deny / deny-overrides(wall DENY > 명시 DENY > 명시 ALLOW) / matter 멤버십은 ALLOW의 필요조건 / `confidentiality_level`별 추가 제한 / condition_json 해석 불가 시 거부(fail-closed). |
| Files to create | `apps/api/src/modules/permission/confidentiality-policy.ts`, `apps/api/src/modules/permission/confidentiality-policy.spec.ts`, `tests/integration/permission-matrix/document-permission-matrix.spec.ts` |
| Files to modify | `apps/api/src/modules/permission/document-permission.service.ts`(본체 구현 — **시그니처 변경 금지**), `apps/api/src/modules/permission/document-permission.service.spec.ts` |
| Files NOT to modify | 공통(§1.6) — 시그니처·role matrix·wall schema(Freeze 산출물) |
| Verification (AND) | 1) 기능: role 7종 × confidentiality 등급 × wall 상태 매트릭스 expected 100% 일치(SEC-PERMHARN-MATRIX 하네스 확장) 2) 권한(negative): wall excluded 사용자는 명시 ALLOW가 있어도 DENY(`ETHICAL_WALL_BLOCKED`) / 비멤버는 어떤 ALLOW로도 접근 불가 / condition_json 파싱 오류 주입 → 거부 3) 권한(negative): 평가 예외 발생 → fail-closed `PERMISSION_DENIED` 4) 회귀: R1 권한 하네스 green 5) **사람 리뷰 승인 기록(PR)** |
| Edge cases | privilege_status 문서의 등급 상향 처리 / valid_from/valid_to 경계 시각 / 동일 사용자에 ALLOW·DENY 동시 존재(deny-overrides) |
| Stop condition | 공통(§1.5) + 21번 매트릭스와 Freeze 문서 간 불일치 발견 시 즉시 중단 |
| Escalation | execution ledger 기록 + Freeze 변경은 Decision Ledger 절차(사람 승인) 필요 |

### SEC-DOCUPERM-ACCECONT-TUW-004 — download reason 요구

| 필드 | 내용 |
|---|---|
| ID | SEC-DOCUPERM-ACCECONT-TUW-004 |
| Title | 다운로드 사유(reason) 요구 정책 구현 |
| Release | R2 | Module | SEC-DOCUPERM-ACCECONT | Risk | **H** | Size | M |
| Depends_on | SEC-DOCUPERM-ACCECONT-TUW-003, AUDIT-DOCUAUDI-DOCUEVEN-TUW-003 |
| Objective | confidentiality 상위 등급 문서 다운로드 시 `reason_code`(enum) + 선택 텍스트(≤200자)가 필수이며, 사유는 `DOCUMENT_DOWNLOADED` audit metadata 화이트리스트 키로 기록된다. |
| Files to create | `packages/shared/src/dto/document/download-reason.dto.ts` |
| Files to modify | `apps/api/src/modules/document/document.controller.ts`, `apps/api/src/modules/permission/document-permission.service.ts`(정책 분기), `tests/integration/document-access/document-download.spec.ts` |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능: 사유 포함 다운로드 성공 + audit metadata에 reason_code 기록 2) 권한(negative): 사유 누락 → `VALIDATION_FAILED`(다운로드 미발생·서명 URL 미발급) 3) 기능(negative): enum 외 reason_code·201자 텍스트 거부 4) 회귀: suite green |
| Edge cases | 일반 등급 문서는 사유 불요(등급 경계 명시) / reason 텍스트에 개인정보 입력 가능성 — audit에는 code 필수, 텍스트는 길이 제한·로그 미출력 |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 |

### SEC-DOCUPERM-ACCECONT-TUW-005 — document permission UI

| 필드 | 내용 |
|---|---|
| ID | SEC-DOCUPERM-ACCECONT-TUW-005 |
| Title | 문서 권한 표시·관리 UI 구현 (서버 집행은 불변) |
| Release | R2 | Module | SEC-DOCUPERM-ACCECONT | Risk | M | Size | L |
| Depends_on | SEC-DOCUPERM-ACCECONT-TUW-004 |
| Objective | 문서 상세 화면에서 권한 보유자에게 confidentiality 등급·접근 가능 주체를 표시하고 Matter Owner가 등급을 변경할 수 있는 패널이 동작한다(집행은 전적으로 서버 — UI는 표시·요청만). |
| Files to create | `apps/web/src/components/document/document-permission-panel.tsx`, `apps/web/src/components/document/document-permission-panel.test.tsx`, `apps/web/src/lib/api/document-permissions.ts` |
| Files to modify | `apps/web/src/app/documents/[id]/page.tsx` |
| Files NOT to modify | 공통(§1.6) — 서버 권한 코드 일체 |
| Verification (AND) | 1) 기능: 패널 렌더·등급 변경 요청 왕복(컴포넌트 테스트) 2) 권한(negative): 비인가 사용자에게 패널 비노출 + API 직접 호출도 서버에서 차단(UI 우회 불가 통합 테스트) 3) 회귀: suite green |
| Edge cases | 권한 조회 API 실패 시 패널 숨김(fail-closed 표시) / 낙관적 업데이트 롤백 |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 |

### SEC-DOCUPERM-ACCECONT-TUW-006 — safe denied message

| 필드 | 내용 |
|---|---|
| ID | SEC-DOCUPERM-ACCECONT-TUW-006 |
| Title | permission denied 안전 응답 구현 (존재·메타데이터 누설 차단) |
| Release | R2 | Module | SEC-DOCUPERM-ACCECONT | Risk | **H** | Size | S |
| Depends_on | SEC-DOCUPERM-ACCECONT-TUW-005 |
| Objective | 접근 거부 응답이 문서 제목·유형·matter명·존재 여부 힌트를 일체 포함하지 않는 표준 `PERMISSION_DENIED` 본문으로 통일되고, 권한 없는 리소스와 미존재 리소스의 응답이 구별 불가능하다. |
| Files to create | `tests/integration/document-access/safe-denied-message.spec.ts` |
| Files to modify | `apps/api/src/modules/document/document-error.mapper.ts`, `apps/web/src/lib/api/error-messages.ts`(사용자 문구) |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 권한(negative): 비인가 조회/다운로드/미리보기 거부 응답 본문에 제목·메타데이터 부재 assert 2) 권한(negative): 미존재 ID vs 권한 없는 ID 응답 status·본문·응답시간 분포 동형성 3) 회귀: suite green |
| Edge cases | 오류 메시지 다국어화 시에도 누설 금지 / correlation id는 포함(추적용 — 메타데이터 아님) |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 |

---

## 2.11 DOC-PREVIEW-VIEWER — Preview

### DOC-PREVIEW-VIEWER-TUW-001 — PDF preview endpoint (권한 검사)

| 필드 | 내용 |
|---|---|
| ID | DOC-PREVIEW-VIEWER-TUW-001 |
| Title | `GET /v1/documents/:id/preview` PDF 미리보기 endpoint 구현 |
| Release | R2 | Module | DOC-PREVIEW-VIEWER | Risk | H | Size | M |
| Depends_on | DEVOPS-FREEZE-PERMMODEL-TUW-001, DOC-DOCULIFE-LIFEMANA-TUW-006, SEC-DOCUPERM-ACCECONT-TUW-003 |
| Objective | `canReadDocument` 통과자에게만 current 버전 PDF가 스트리밍되며, PermissionService를 우회하는 미리보기 경로가 존재하지 않는다. |
| Files to create | `apps/api/src/modules/preview/preview.module.ts`, `apps/api/src/modules/preview/preview.controller.ts`, `apps/api/src/modules/preview/preview.service.ts`, `apps/api/src/modules/preview/preview.service.spec.ts` |
| Files to modify | `apps/api/src/app.module.ts` |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 기능: 인가자 PDF 스트리밍(Range 지원) 2) 권한(negative): 비인가·wall excluded·타 tenant 미리보기 차단, 미리보기 URL 직접 접근 시 권한 재검사(토큰 만료 포함) 3) 회귀: suite green |
| Edge cases | Deleted 문서 미리보기 거부 / 추출 전 문서(원본이 PDF면 즉시 가능) / 대용량 PDF Range 처리 |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 |

### DOC-PREVIEW-VIEWER-TUW-002 — DOCX→PDF 변환 worker

| 필드 | 내용 |
|---|---|
| ID | DOC-PREVIEW-VIEWER-TUW-002 |
| Title | DOCX→PDF 미리보기 변환 worker 구현 |
| Release | R2 | Module | DOC-PREVIEW-VIEWER | Risk | M | Size | L |
| Depends_on | DOC-PREVIEW-VIEWER-TUW-001, DOC-OCRTEXTEXT-EXTRWORK-TUW-001 |
| Objective | DOCX 문서의 미리보기 요청 시 변환 job(queue `document.preview-convert`)이 worker(LibreOffice headless)에서 PDF **파생물**(신규 file_object, `source_system='preview_derived'`)을 생성하고 원본 family 버전에는 추가되지 않는다(원본 불변). |
| Files to create | `workers/ingestion/converters/docx_to_pdf.py`, `workers/ingestion/tests/test_docx_to_pdf.py`, `apps/api/src/modules/preview/preview-convert.job.ts`, `apps/api/src/modules/preview/preview-convert.job.spec.ts` |
| Files to modify | `infra/docker-compose.dev.yml`(LibreOffice 의존 추가), `apps/api/src/modules/preview/preview.service.ts` |
| Files NOT to modify | 공통(§1.6) — `document_versions`에 파생물 추가 금지 |
| Verification (AND) | 1) 기능: DOCX fixture → PDF 파생물 생성·미리보기 제공 2) 기능: 파생물이 신규 file_object이고 원본 object·버전 무변경 3) 기능(negative): 변환 실패 시 명시적 fallback 응답(다운로드 안내) — 부분 PDF 미제공 4) 회귀: suite green |
| Edge cases | 폰트 누락 시 대체 폰트 / 변환 타임아웃(대형 문서) / 동일 버전 중복 변환 캐시(파생물 재사용) |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 |

### DOC-PREVIEW-VIEWER-TUW-003 — DOCUMENT_VIEWED audit 연동 (H)

| 필드 | 내용 |
|---|---|
| ID | DOC-PREVIEW-VIEWER-TUW-003 |
| Title | 미리보기 `DOCUMENT_VIEWED` audit 연동 |
| Release | R2 | Module | DOC-PREVIEW-VIEWER | Risk | **H** | Size | S |
| Depends_on | DOC-PREVIEW-VIEWER-TUW-002, AUDIT-DOCUAUDI-DOCUEVEN-TUW-002 |
| Objective | 미리보기 열람 1회당 `DOCUMENT_VIEWED` audit(채널=preview 구분 키 포함) 1건이 기록되고, 기록 실패 시 미리보기 제공도 실패한다. |
| Files to create | — |
| Files to modify | `apps/api/src/modules/preview/preview.service.ts`, `tests/integration/audit-coverage/document-audit.spec.ts` |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 감사: 미리보기 1회 → VIEWED 1건(페이지 스크롤·Range 추가 요청은 추가 이벤트 없음) 2) 감사(negative): audit 실패 주입 → 미리보기 차단 3) 회귀: suite green |
| Edge cases | 변환 대기 중 폴링 요청(이벤트 미발생 — 실제 콘텐츠 제공 시점만) |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 |

---

## 2.12 AUDIT-DOCUAUDI-DOCUEVEN — Document Audit Events

### AUDIT-DOCUAUDI-DOCUEVEN-TUW-001 — DOCUMENT_UPLOADED audit

| 필드 | 내용 |
|---|---|
| ID | AUDIT-DOCUAUDI-DOCUEVEN-TUW-001 |
| Title | `DOCUMENT_UPLOADED` audit event 구현·업로드 경로 연결 |
| Release | R2 | Module | AUDIT-DOCUAUDI-DOCUEVEN | Risk | **H** | Size | S |
| Depends_on | DEVOPS-FREEZE-PERMMODEL-TUW-001, AUDIT-AUDIEVENCO-AUDILOGG-TUW-002, AUDIT-AUDIEVENCO-AUDILOGG-TUW-003, DOC-DOCUUPLO-UPLOAPI-TUW-001 |
| Objective | 업로드(단건·bulk·신규버전 포함) 성공이 `DOCUMENT_UPLOADED` audit(document_id, version_id, file hash, matter_id — 본문·파일명 원문 제외는 normalizer 화이트리스트 따름)와 동일 트랜잭션으로 기록된다. |
| Files to create | `apps/api/src/modules/audit/events/document-events.ts`, `apps/api/src/modules/audit/events/document-events.spec.ts`, `tests/integration/audit-coverage/document-audit.spec.ts` |
| Files to modify | `apps/api/src/modules/document/document-upload.service.ts` |
| Files NOT to modify | 공통(§1.6) — audit append-only 계층 |
| Verification (AND) | 1) 감사: 업로드 1건당 event 1건·필수 필드 충족 2) 감사(negative): audit 실패 주입 → 업로드 롤백(문서·object 미생성 또는 보상 삭제) 3) 감사(negative): metadata_json 화이트리스트 외 키 거부 4) 회귀: suite green + audit append-only(UPDATE/DELETE DB 거부) 회귀 |
| Edge cases | bulk 항목별 1 event / 업로드 실패 시 event 미발생 |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 |

### AUDIT-DOCUAUDI-DOCUEVEN-TUW-002 — DOCUMENT_VIEWED audit

| 필드 | 내용 |
|---|---|
| ID | AUDIT-DOCUAUDI-DOCUEVEN-TUW-002 |
| Title | `DOCUMENT_VIEWED` audit event 타입 구현 |
| Release | R2 | Module | AUDIT-DOCUAUDI-DOCUEVEN | Risk | **H** | Size | S |
| Depends_on | AUDIT-DOCUAUDI-DOCUEVEN-TUW-001 |
| Objective | `DOCUMENT_VIEWED` 이벤트 타입(채널 구분: detail|preview)과 빌더가 정의되어 LIFEMANA-006·PREVIEW-003이 소비할 수 있다. |
| Files to create | — |
| Files to modify | `apps/api/src/modules/audit/events/document-events.ts`, `apps/api/src/modules/audit/events/document-events.spec.ts` |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 감사: 이벤트 빌더 필수 필드·화이트리스트 검증 단위 테스트 2) 회귀: suite green |
| Edge cases | channel 미지정 시 빌더 거부(필수) |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 |

### AUDIT-DOCUAUDI-DOCUEVEN-TUW-003 — DOCUMENT_DOWNLOADED audit

| 필드 | 내용 |
|---|---|
| ID | AUDIT-DOCUAUDI-DOCUEVEN-TUW-003 |
| Title | `DOCUMENT_DOWNLOADED` audit event 타입 구현 |
| Release | R2 | Module | AUDIT-DOCUAUDI-DOCUEVEN | Risk | **H** | Size | S |
| Depends_on | AUDIT-DOCUAUDI-DOCUEVEN-TUW-002 |
| Objective | `DOCUMENT_DOWNLOADED` 이벤트 타입(version_id, reason_code 키 포함 가능)과 빌더가 정의되어 LIFEMANA-005·DOCUPERM-004가 소비할 수 있다. |
| Files to create | — |
| Files to modify | `apps/api/src/modules/audit/events/document-events.ts`, `apps/api/src/modules/audit/events/document-events.spec.ts` |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 감사: 빌더 필수 필드 검증 + reason 자유 텍스트 원문이 metadata에 미포함(code만) 2) 회귀: suite green |
| Edge cases | 서명 URL 발급 시점 기록(실제 GET 완료 여부와 무관 — 계약 명시) |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 |

### AUDIT-DOCUAUDI-DOCUEVEN-TUW-004 — DOCUMENT_DELETED audit

| 필드 | 내용 |
|---|---|
| ID | AUDIT-DOCUAUDI-DOCUEVEN-TUW-004 |
| Title | `DOCUMENT_DELETED` audit event 구현·삭제 경로 연결 |
| Release | R2 | Module | AUDIT-DOCUAUDI-DOCUEVEN | Risk | **H** | Size | S |
| Depends_on | AUDIT-DOCUAUDI-DOCUEVEN-TUW-003, DOC-DOCULIFE-LIFEMANA-TUW-001 |
| Objective | soft delete 성공이 `DOCUMENT_DELETED` audit(직전 status 참조 포함)와 동일 트랜잭션으로 기록되고, `DOCUMENT_RESTORED`(LIFEMANA-002 소비용) 타입도 함께 정의된다. |
| Files to create | — |
| Files to modify | `apps/api/src/modules/audit/events/document-events.ts`, `apps/api/src/modules/document/document-lifecycle.service.ts`, `tests/integration/audit-coverage/document-audit.spec.ts` |
| Files NOT to modify | 공통(§1.6) |
| Verification (AND) | 1) 감사: 삭제 1회 → DELETED 1건 2) 감사(negative): audit 실패 주입 → 삭제 롤백(status 원복) 3) 회귀: suite green |
| Edge cases | legal hold 차단된 삭제 시도 → DELETED 미발생(차단 이벤트는 ACCESS_DENIED/DOCUMENT_LOCKED 경로) |
| Stop condition | 공통(§1.5) | Escalation | execution ledger 기록 |

### AUDIT-DOCUAUDI-DOCUEVEN-TUW-005 — document audit query API

| 필드 | 내용 |
|---|---|
| ID | AUDIT-DOCUAUDI-DOCUEVEN-TUW-005 |
| Title | `GET /v1/documents/:id/audit-events` 조회 API 구현 |
| Release | R2 | Module | AUDIT-DOCUAUDI-DOCUEVEN | Risk | **H** | Size | M |
| Depends_on | AUDIT-DOCUAUDI-DOCUEVEN-TUW-004, SEC-RBAC-ROLEMATR-TUW-005 |
| Objective | Firm Admin·Security Admin(전체)과 Matter Owner(자기 matter 한정)가 문서별 audit 이력을 시간 역순·페이지네이션으로 조회하고 그 외 역할은 차단된다(21번 매트릭스 따름). 읽기 전용 — 어떤 변형 연산도 제공하지 않는다. |
| Files to create | `apps/api/src/modules/audit/audit-query.controller.ts`, `apps/api/src/modules/audit/audit-query.service.ts`, `apps/api/src/modules/audit/audit-query.service.spec.ts`, `packages/shared/src/dto/audit/audit-query.dto.ts` |
| Files to modify | `apps/api/src/modules/audit/audit.module.ts` |
| Files NOT to modify | 공통(§1.6) — audit_events 쓰기 경로 일체 |
| Verification (AND) | 1) 기능: 이벤트 5종 조회·필터(event_type, 기간)·페이지네이션 2) 권한(negative): 일반 멤버·비멤버·타 matter Owner 조회 → `PERMISSION_DENIED` 3) 권한(negative): cross-tenant 조회 차단 4) 회귀: suite green |
| Edge cases | 대량 이벤트 페이지네이션 커서 안정성 / 삭제된 문서의 audit 이력은 조회 가능(이력 보존) |
| Stop condition | 공통(§1.5) + audit 열람 권한 매트릭스 불명확 시(21번 문서 확인) |
| Escalation | execution ledger 기록 |

---

## 2.13 AI-AIPOLI-SCHEMAONLY — AI Policy 스키마 (스키마만 — 기능 아님)

### AI-AIPOLI-SCHEMAONLY-TUW-001 — ai_allowed / ai_policy_id / ai_policies 스키마

| 필드 | 내용 |
|---|---|
| ID | AI-AIPOLI-SCHEMAONLY-TUW-001 |
| Title | `documents.ai_allowed=false` + `matters.ai_policy_id` + `ai_policies` 테이블 — **스키마만, 기본 거부, 평가 로직 구현 금지** |
| Release | R2 | Module | AI-AIPOLI-SCHEMAONLY | Risk | **H** | Size | M |
| Depends_on | DEVOPS-FREEZE-PERMMODEL-TUW-001, DOC-DOCUMETA-METAEXTR-TUW-001, MATTER-MATTMANA-MATTREGI-TUW-001, CORE-DATACORE-MIGR-TUW-005 |
| Objective | `ai_policies`(`policy_id, tenant_id, name, allowed_model_tiers, external_model_allowed=false, default_effect='DENY'`, RLS) 테이블과 `documents.ai_allowed boolean NOT NULL DEFAULT false`, `matters.ai_policy_id` FK(nullable)가 생성되되, **이 컬럼·테이블을 읽어 어떤 동작을 분기하는 코드가 R2 코드베이스에 단 한 줄도 존재하지 않는다**(Brief 절대 금지 — AI 기능 R6 전 구현, 스키마 컬럼만 예외). |
| Files to create | `db/migrations/0213_create_ai_policies_and_flags.sql`, `packages/shared/src/types/ai-policy.ts`(타입 선언만) |
| Files to modify | — (서비스·컨트롤러 수정 없음 — 의도적) |
| Files NOT to modify | 공통(§1.6) — **`packages/ai/` 절대 금지**, 어떤 service/controller에도 ai_allowed/ai_policy 분기 추가 금지, ai_allowed 변경 API 미제공(R6에서 게이트와 함께) |
| Verification (AND) | 1) 기능: migrate/rollback 왕복 + DEFAULT/NOT NULL/CHECK(`default_effect='DENY'`, `external_model_allowed=false`) 제약 확인 2) 권한(negative): ai_policies cross-tenant RLS 비가시 3) **기능(negative — 평가 로직 부재 증명): (a) `apps/`·`workers/`·`packages/`(타입 선언 제외)에서 `ai_allowed`·`ai_policy` 참조 grep 0건 CI 검사, (b) `/v1` 라우트 표에 AI 관련 endpoint 0건 assert, (c) `packages/ai/`에 placeholder 인터페이스 외 변경 없음(diff 검사)** 4) 회귀: suite green + DEVOPS-BACKLOG-VALIDATE의 "AI<R6 금지" 규칙 통과 |
| Edge cases | 신규 업로드 문서 ai_allowed 항상 false(서비스가 값을 만지지 않아도 DB DEFAULT로 보장) / ai_policy_id가 가리키는 정책 행 삭제 시 FK RESTRICT |
| Stop condition | 공통(§1.5) + 평가 로직·플래그 변경 API 요구를 발견하는 즉시 중단(절대 금지 위반 — Brief §2) |
| Escalation | execution ledger 기록 + 사람 보고(절대 금지 경계 이슈) |

---

## 3. R2 Gate 체크리스트 — Document Vault Core (Brief §7 Gate 기준 확장)

Gate는 release 단위이며, 전 항목 통과 전 **R3 PACK 착수 금지**. 각 항목은 증빙(테스트 결과·스크립트 출력)을 `docs/ledger/execution.md`에 링크한다.

| # | 항목 | 기준 | 검증 방법 |
|---|---|---|---|
| G2-1 | 파일 무결성 | 동일 파일 2회 업로드 → 동일 sha256, 1바이트 상이 파일 → 상이 sha256 | `pnpm test:integration` (HASHDUPL-002 케이스) |
| G2-2 | 원본 불변 | object 덮어쓰기·`file_objects` 핵심 컬럼 UPDATE가 adapter·DB trigger 양 계층에서 거부, 새 버전은 항상 신규 FileObject | `tests/integration/storage-isolation/immutable-original.spec.ts` green + 사람 리뷰 기록(HASHDUPL-004) |
| G2-3 | 권한 차단 (negative 전수) | 비멤버·Limited Reviewer·External User·wall excluded의 업로드/다운로드/미리보기/메타수정/버전추가/복구/감사조회 전부 차단, 권한 매트릭스 expected 100% | SEC-PERMHARN-MATRIX 확장 하네스 + `tests/integration/permission-matrix/document-permission-matrix.spec.ts` |
| G2-4 | Fail-closed | 권한 평가 강제 오류 주입 시 모든 문서 endpoint가 `PERMISSION_DENIED` | 오류 주입 테스트(R0 FAILCLOSE 하네스 재사용) |
| G2-5 | Legal hold | document/matter `legal_hold=true`에서 삭제(단건·bulk) 시도 → `DOCUMENT_LOCKED`, R12 테이블 미생성 | `tests/integration/legal-hold/legal-hold-block.spec.ts` + 스키마 스냅샷 |
| G2-6 | Audit 5종 누락 0 | UPLOADED/VIEWED/DOWNLOADED/DELETED/METADATA_CHANGED가 해당 행위 100%에서 발생, audit 실패 시 행위 롤백, append-only(UPDATE/DELETE DB 거부) 회귀 green | `tests/integration/audit-coverage/document-audit.spec.ts` 커버리지 리포트 |
| G2-7 | Storage cross-tenant | 타 tenant object key 접근·타 tenant 서명 URL 사용·RLS 우회 전부 차단(`TENANT_ISOLATION_VIOLATION`) | `tests/integration/storage-isolation/` suite (서명 URL 케이스 포함) + `tests/integration/cross-tenant/` 회귀 |
| G2-8 | 로그 위생 | 업로드→추출→미리보기→다운로드 전 구간에서 로그·audit metadata·job payload에 문서 본문/원문/자유 텍스트 사유 원문 부재 | 로그 스캔 스크립트(`tools/` 검사) + EXTRWORK-001 payload assert |
| G2-9 | AI 금지 경계 | `ai_allowed` 기본 false, 평가 로직·AI endpoint·`packages/ai` 구현 0건, backlog validator "AI<R6" 규칙 green | AIPOLI-001 negative 검사 3종 + DEVOPS-BACKLOG-VALIDATE CI |
| G2-10 | 상태머신·불변 상태 | Document 11상태 비허용 전이 거부, Archived/Disposal Locked mutation 차단(관리자 포함), Closed/Archived matter 산하 문서 mutation 차단 | domain 전이 전수 테스트 + `archived-mutation-block.spec.ts` + 사람 리뷰 기록(LIFEMANA-004) |
| G2-11 | 복구 안전성 | restore가 권한 한정·audit 동반·체인 정합 보장 | `document-restore.spec.ts` + 사람 리뷰 기록(LIFEMANA-002) |
| G2-12 | 추출 파이프라인 | PDF/DOCX/HWPX fixture 전수 추출 green, ocr_pending·failed 상태 정확, HWP 바이너리 명시 거부 | worker 테스트 + e2e (`docker compose ... up -d` 환경) |
| G2-13 | 안전 거부 응답 | 거부 응답에 존재·제목·메타데이터 누설 0(미존재와 구별 불가) | `safe-denied-message.spec.ts` |
| G2-14 | 회귀·재현성 | R0·R1 전체 suite + 권한 하네스 green, 신규 클론에서 `pnpm install && pnpm build && pnpm test && pnpm db:migrate` 재현 | CI 전체 green + 클린 클론 절차 |
| G2-15 | 운영 장부 | 전 PACK의 execution ledger 기재, Risk=C 4건(HASHDUPL-004, LIFEMANA-002, LIFEMANA-004, DOCUPERM-003) PR에 사람 리뷰 승인 기록 | `docs/ledger/execution.md` + PR 감사 |

---

## 4. 비고 (notes)

1. **건수**: Brief §7 R2 표의 행 단위 범위(모듈×TUW 번호)를 1:1 전개하면 59건이며, Brief §7 헤더 표기도 "59 TUW"로 보정 완료되었다(구 "54 TUW"는 오기). 행 단위 인벤토리가 규범적 목록이므로 본 문서는 59건 전부를 상세화했고 임의 추가·삭제는 없다.
2. **canReadDocument/canDownloadDocument 구현 본체**: R1 SEC-DOCUPERM-ACCECONT-TUW-001~002는 "인터페이스 시그니처만(구현 R2)"이므로, 구현 본체는 Brief 행의 "구현화" 지시에 따라 R2 SEC-DOCUPERM-ACCECONT-TUW-003 범위에 포함시켰다(별도 TUW 신설 없이 1:1 유지).
3. **원천 SEC-ETHIWALL-WALLENFO-TUW-004(document access wall enforcement)**: Brief R2 인벤토리에 없으므로 별도 TUW로 추가하지 않았다. 해당 효과(문서 접근 시 wall DENY 우선)는 평가 계약상 SEC-DOCUPERM-ACCECONT-TUW-003의 deny-overrides 구현·검증에 흡수된다. 검색 단계 wall 집행은 R3(PERMFILT-003, WALLENFO-005).
4. **다운로드 endpoint 소속**: R2 인벤토리에 독립 "download API" TUW가 없어, endpoint 구현은 DOC-DOCULIFE-LIFEMANA-TUW-005(download audit 연결)의 범위에 명시했다.
5. 마이그레이션 번호(02xx)는 권장값이며 실제 적용 시 직전 번호+1로 조정한다(§1.9).
