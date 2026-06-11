# 10. Architecture & Tech Stack — 확정 스택·컴포넌트·배포 상세

버전: 1.0 | 작성일: 2026-06-11 | 상태: Normative (단, `00_Master_Brief.md`와 충돌 시 Brief가 우선)
독자: Codex (구현 에이전트). 이 문서는 대화 컨텍스트 없이 단독으로 읽고 실행할 수 있도록 작성되었다.
선행 문서: `00_Master_Brief.md` §1(DEC-01~18), §2(불변 원칙 7 + 절대 금지), §4(저장소 구조), §5(데이터 모델 v1.1)
관련 문서: `11_Repository_Structure.md`(디렉토리·모듈 경계), `20_Data_Model_v1_1.md`(DDL), `21_Permission_Model.md`(권한 평가 계약)

---

## 1. 아키텍처 요약

AMIC Vault는 **법무법인용 Matter 중심 문서 금고**다. 아키텍처의 모든 결정은 Brief §2 불변 원칙 7개를 코드보다 낮은 계층(DB·미들웨어)에서 집행하는 방향으로 내려졌다.

```
[Browser]
   │ HTTPS
   ▼
[apps/web  Next.js] ──(REST /v1, 세션 쿠키)──► [apps/api  NestJS]
                                                  │  ├─ 미들웨어 체인: correlation → tenant context → session → fail-closed guard
                                                  │  ├─ Domain modules (tenant/auth/user/client/matter/party/permission/ethical-wall/audit/document/storage/search/preview)
                                                  │  ├─ pg-boss job handlers (동일 프로세스, 분리 가능)
                                                  │  │
                                  ┌───────────────┼───────────────────┐
                                  ▼               ▼                   ▼
                        [PostgreSQL 16]    [MinIO / S3 호환]   [workers/ingestion  Python 3.12 FastAPI]
                        RLS + pg-boss +    tenant prefix +      PDF/DOCX/HWPX 추출 + OCR
                        PG FTS(tsvector)   at-rest 암호화       (DB 접근 금지, REST+HMAC로만 통신)
```

- 단일 배포 단위 3개: `apps/api`(NestJS), `apps/web`(Next.js), `workers/ingestion`(Python). 전부 컨테이너화(DEC-01: 국내 리전 클라우드 private 구성, on-prem 이식성 유지).
- R0~R3에는 **PostgreSQL 16 단일 데이터 스토어**(트랜잭션 데이터 + 큐(pg-boss) + 전문검색(PG FTS))와 MinIO(S3 호환)만 존재한다. OpenSearch는 R3 Gate에서 판단, pgvector는 R6, Neo4j는 R7 전 도입 금지(DEC-05).

---

## 2. 확정 스택 (DEC-03~09 상세)

| 영역 | 확정값 (DEC) | 상세 |
|---|---|---|
| 모노레포 | pnpm workspace + turborepo (DEC-03) | 루트 `pnpm-workspace.yaml`: `apps/*`, `packages/*`, `workers/*`. turbo 파이프라인: `lint`, `typecheck`, `test`, `build` |
| Backend | NestJS (TypeScript, strict) (DEC-03) | Node.js 22 LTS, TypeScript 5.x strict 모드. URI versioning(`/v1`, DEC-14). 정확한 마이너 버전 고정은 PACK-R0-01에서 lockfile로 확정 |
| Frontend | Next.js + React + Tailwind + shadcn/ui (DEC-04) | App Router(`src/app/`). 서버에서 권한 판정 결과만 수신, UI는 표시 전용 |
| DB | PostgreSQL 16 (DEC-05) | 전 row-level 테이블 `tenant_id NOT NULL` + RLS(DEC-02). 전문검색은 R3까지 PG FTS(tsvector), 벡터는 R6(pgvector), Neo4j는 R7 전 금지 |
| Ingestion | Python 3.12 + FastAPI (DEC-06) | OCR/PDF/DOCX/HWPX 파싱 전담. HWPX(XML)만 R2, HWP 5.0 바이너리는 R4~R6 별도 트랙(DEC-10) |
| Object storage | S3 호환, 개발은 MinIO (DEC-07) | 경로에 tenant prefix 필수, at-rest 암호화. 사용자 다운로드는 presigned URL이 아니라 API 프록시 경유(§8.6) |
| Queue | pg-boss (DEC-08) | PostgreSQL 기반. Kafka/Redis는 R4 이후 재평가. 토폴로지는 §6 |
| 인증 | 자체 세션 + MFA flag (DEC-09) | 세션은 PG 저장, httpOnly 쿠키. TOTP는 R1, SSO/SAML은 R13 — R3까지 SSO 코드 경로 일체 금지 |
| 관측성 | OpenTelemetry + structured log | §9 |
| 마이그레이션 | `db/migrations/NNNN_name.sql` 기본 | 도구는 **node-pg-migrate(SQL 파일 모드)로 확정**(`CORE-DATACORE-MIGR-TUW-001`에서 설정·ADR 주석). §8.2 RLS 필수 블록과 `11_Repository_Structure.md` §6 템플릿 의미론을 충족해야 함 |

버전 고정 규칙: 모든 런타임·이미지 버전은 R0에서 lockfile/digest로 고정하고 변경은 ADR 갱신 대상. 본 문서의 버전 표기는 최소 기준선이다.

---

## 3. NestJS 모듈 경계

`apps/api/src/modules/` 하위 13개 모듈(Brief §4). 각 모듈은 `*.module.ts / *.controller.ts / *.service.ts / *.spec.ts` 규약을 따르고, 다른 모듈에는 **모듈 public index와 Nest DI(exports)로만** 노출된다(상세 템플릿은 `11_Repository_Structure.md` §4).

| 모듈 | 책임 | 도입 release | 다른 모듈과의 경계 규칙 |
|---|---|---|---|
| `tenant` | tenant 해석, 요청 컨텍스트(AsyncLocalStorage), RLS GUC 바인딩 트랜잭션 제공, tenant settings API | R0 | 전 모듈이 의존하는 최하층. 다른 도메인 모듈을 import 금지 |
| `auth` | login/logout, 세션 발급·검증, MFA flag(TOTP는 R1), password reset skeleton | R0 | 권한 판정은 하지 않음(인증만). 권한은 `permission` 소관 |
| `user` | User CRUD, role 보유 정보 | R0~R1 | role **판정**은 `permission`에 위임 |
| `client` | Client 등록·조회·목록 | R1 | |
| `matter` | Matter CRUD, 상태머신 적용(전이 규칙은 `packages/domain` 순수 함수 호출), member 관리 | R1 | 상태 전이 규칙을 모듈 내 재구현 금지 |
| `party` | Party, role taxonomy, restricted party marker | R1 | |
| `permission` | role 7종(DEC-15), permission matrix, `canReadMatter/canEditMatter/canUploadToMatter`(R1), `canReadDocument/canDownloadDocument`(시그니처 R1, 구현 R2), 검색 필터 생성(R3) | R1~R3 | **문서/검색 endpoint가 이 모듈을 우회하면 절대 금지 위반.** deny-overrides·default-deny 평가 계약은 `21_Permission_Model.md` |
| `ethical-wall` | wall schema·membership·create API(R1, 보정 C-2), search enforcement는 R3에서 `search`와 통합 | R1, R3 | break-glass·고도화는 R5 — R3까지 코드 경로 금지 |
| `audit` | AuditService(append-only 기록), metadata normalizer(화이트리스트), audit query API | R0~R2 | audit_events에 UPDATE/DELETE 가능한 경로 제공 금지(§8.3) |
| `document` | upload/version/metadata/lifecycle(soft delete·restore·legal-hold check), 추출 잡 enqueue | R2 | 파일 바이트는 `storage` 경유로만 접근 |
| `storage` | S3/MinIO adapter, tenant prefix path resolver, presigned URL(내부 전용), encryption hook interface | R2 | storage URI를 다른 모듈이 직접 조립 금지 |
| `search` | PG FTS 인덱스 관리, 검색 API, **권한 필터 주입(쿼리 단계)** | R3 | 사후 필터링으로 권한 처리 금지(불변 원칙 1) |
| `preview` | PDF preview(권한 검사 endpoint), DOCX→PDF 변환 잡 | R2 | VIEWED audit 없이 응답 금지 |

공통 인프라(모듈이 아닌 횡단 요소)는 `apps/api/src/common/`에 둔다: correlation 미들웨어, fail-closed guard, 전역 exception filter, zod validation pipe, pg-boss 부트스트랩.

---

## 4. 핵심 컴포넌트 13종 — R0~R3 구현 범위 vs 이후 placeholder

원천 04번 §5의 13개 컴포넌트를 본 스택에 매핑한다. **"placeholder"는 `packages/ai/`의 TypeScript 인터페이스 선언만을 의미하며, 구현 코드·모델 SDK 의존성·호출 경로 추가는 절대 금지다**(Brief §2: AI 기능 R6 전 구현 금지).

| # | 컴포넌트 (원천 04 §5) | 구현 위치 | R0~R3 구현 범위 | R4 이후 |
|---|---|---|---|---|
| 1 | TenantContextService | `apps/api/modules/tenant` | **R0 전체 구현**: tenant 해석 미들웨어, AsyncLocalStorage 컨텍스트, `SET LOCAL app.current_tenant_id` 트랜잭션 래퍼, cross-tenant 차단 테스트(C) | schema-per-tenant 확장 경로 차단 금지(DEC-02) |
| 2 | PermissionService | `apps/api/modules/permission` | **R1**: role matrix, canReadMatter(C)/canEditMatter/canUploadToMatter, fail-closed wrapper(C), matter 검색 필터. **R2**: canReadDocument/canDownloadDocument 구현. **R3**: 검색 쿼리 필터 주입(C) | ABAC 일반화(R5), AI 권한 결합(R6) |
| 3 | AuditService | `apps/api/modules/audit` | **R0**: audit_events schema + append-only constraint(C). **R1**: logger service, metadata normalizer, PERMISSION_CHANGED/ACCESS_DENIED. **R2**: DOCUMENT_* 5종. **R3**: SEARCH audit | Audit Console enforcement(R5), AI audit 5종(R6) |
| 4 | DocumentIngestionService | `apps/api/modules/document` + `storage` | **R2 전체 구현**: upload API(권한 검사 포함), SHA-256 hash, immutable original(C), DocumentVersion/family_id, 실패 rollback | email 첨부 ingestion(R4) |
| 5 | CanonicalizationWorker | `workers/ingestion` (Python) | **R2**: PDF/DOCX 텍스트 추출, HWPX(XML) 추출(DEC-10), OCR(낮은 동시성 큐)·confidence 저장·OCR pending status, 실패 retry | HWP 5.0 바이너리(R4~R6), 고급 정규화 |
| 6 | ChunkingService | `packages/ai`(인터페이스만), 구현은 `workers/ingestion/chunking/` | **placeholder 인터페이스만.** `workers/ingestion/chunking/`은 빈 디렉토리 + README | R6 (parent-child chunking, provenance) |
| 7 | SearchIndexer | `apps/api/modules/search` | **R3**: PG FTS tsvector 인덱싱 잡, metadata 변경 갱신, reindex manager, deleted/superseded 제외. **vector 인덱싱 금지** | OpenSearch 전환(R3 Gate 판단), pgvector(R6) |
| 8 | GraphSyncService | 없음 | **금지. placeholder도 만들지 않는다**(Neo4j 의존성 추가 자체가 절대 금지) | R7 |
| 9 | PlaybookRuleEngine | 없음 | **금지.** `playbook_rules` 등 테이블은 20번 문서 스키마 일정에 따름(기능 아님) | R8 |
| 10 | RetrievalOrchestrator | `packages/ai`(인터페이스만) | **placeholder 인터페이스만** | R6 |
| 11 | EvidencePackBuilder | `packages/ai`(인터페이스만) | **placeholder 인터페이스만** | R6 |
| 12 | ModelGateway | `packages/ai`(인터페이스만) | **placeholder 인터페이스만.** 외부 모델 호출 코드 금지(DEC-11) | R6 (Gemma 로컬 only로 개방) |
| 13 | FeedbackService | 없음 | 기능 없음. 단 R3의 `evaluation_cases` 테이블 + 적재 스크립트(DEVOPS-EVALSET-V0)는 **데이터 준비이며 AI 기능이 아님**(DEC-16) | R6 (Feedback store) |

`packages/ai` placeholder의 형태(전체 패키지에서 허용되는 유일한 내용):

```ts
// packages/ai/src/interfaces/retrieval-orchestrator.interface.ts — R6 전 구현 금지
export interface RetrievalOrchestrator {
  /** R6에서 구현. 호출 시 반드시 permission·aiAllowed·ethical wall 통과 자료만 대상. */
  retrieve(request: RetrievalRequest): Promise<RetrievalResult>;
}
```

`apps/api`·`apps/web`은 R6 전 `packages/ai`를 import할 수 없다(lint로 차단 — `11_Repository_Structure.md` §5).

---

## 5. 요청 흐름 — 미들웨어 체인

모든 `/v1/*` 요청은 아래 순서를 통과한다. **순서 자체가 보안 계약이다** — tenant 미해석 상태에서 어떤 DB 쿼리도 실행되지 않고, 권한 판단 불가 시 controller에 도달하지 못한다.

```
요청
 1. CorrelationIdMiddleware   X-Request-Id 수용/발급 → AsyncLocalStorage + 응답 헤더
 2. TenantContextMiddleware   tenant 해석(세션의 tenant_id 기준; 해석 불가 → 401 AUTH_REQUIRED)
 3. SessionMiddleware         세션 쿠키 검증 → user/role 로드 (실패 → 401 AUTH_REQUIRED)
 4. FailClosedGuard (전역)    인증 확인 + 라우트 권한 메타데이터 평가.
                              판단 불가·예외·정책 미해석 → 403 PERMISSION_DENIED (불변 원칙 4)
 5. ZodValidationPipe         DTO 검증 (실패 → 400 VALIDATION_FAILED)
 6. Controller → Service      서비스 계층에서 PermissionService 명시 호출(assertCan*)
 7. Repository                tenant 트랜잭션 내 실행: BEGIN; SET LOCAL app.current_tenant_id = $1; ...
 8. AuditService.record()     상태 변경·열람·다운로드는 동일 트랜잭션 내 audit 기록
                              (audit insert 실패 = 본 작업 실패. 불변 원칙 3)
 9. GlobalExceptionFilter     표준 error code(§8.5)로 변환. 내부 정보·존재 여부 누출 금지
```

구현 규칙:

1. **FailClosedGuard**(`apps/api/src/common/guards/fail-closed.guard.ts`)는 전역 `APP_GUARD`로 등록한다. 가드 내부에서 발생하는 **모든** 예외는 catch 후 `PERMISSION_DENIED`로 변환한다. "권한 메타데이터가 없는 라우트"도 기본 거부다 — 공개 라우트(`/v1/auth/login`, `/healthz`, `/readyz`)만 `@Public()` 데코레이터로 명시 opt-out하며, opt-out 라우트 목록은 R0 가드 테스트(`CORE-SECFOUND-FAILCLOSE-TUW-002`)의 강제 오류 주입 대상이다.
2. 가드는 coarse-grained(인증·role·라우트 수준)만 담당한다. 자원 단위 판정(특정 matter/document)은 **서비스 계층에서 `PermissionService.assertCan*()`를 명시 호출**한다. 인터셉터·데코레이터 매직으로 자원 권한을 암묵 처리하지 않는다(검증 가능성 우선).
3. 거부 응답은 자원 존재 여부를 누출하지 않는다: 권한 없는 자원 접근은 404가 아니라 동일한 `PERMISSION_DENIED` 메시지(R2 `SEC-DOCUPERM-ACCECONT-TUW-006` safe denied message).
4. audit 기록은 비동기 후처리가 아니라 **동일 DB 트랜잭션**이다. audit insert가 실패하면 본 작업이 롤백된다.

TenantContextService의 트랜잭션 래퍼(전 repository가 사용하는 유일한 DB 진입점):

```ts
// apps/api/src/modules/tenant/tenant-context.service.ts (발췌)
async runInTenantTx<T>(ctx: RequestContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!ctx.tenantId) throw new PermissionDeniedError(); // fail-closed
  return this.pool.transaction(async (tx) => {
    // GUC는 트랜잭션 로컬. 풀 반환 시 잔류하지 않는다.
    await tx.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [ctx.tenantId]);
    return fn(tx);
  });
}
```

`app.current_tenant_id`가 설정되지 않은 커넥션에서 RLS 정책은 0행을 반환한다(§8.2) — 미들웨어를 우회한 쿼리도 데이터에 닿지 못한다(이중 방어).

---

## 6. pg-boss 잡 토폴로지 (DEC-08)

### 6.1 운영 형태

- pg-boss는 `DATABASE_URL`과 동일한 DB의 **`pgboss` 전용 스키마**를 사용한다. `pgboss.*` 테이블은 라이브러리가 관리하며 `db/migrations/` 대상이 아니고, RLS 예외다(글로벌 인프라 테이블 — 마이그레이션 convention 문서에 예외 사유 주석 필수).
- 앱 코드는 `pgboss.*` 테이블에 직접 SQL을 실행하지 않는다. 라이브러리 API(`send`, `work`, `complete`)만 사용한다.
- R0~R3에서 잡 핸들러는 `apps/api` 프로세스 내에서 구동한다(`JOBS_ENABLED=true`). 환경변수로 API serving과 잡 처리를 분리 기동할 수 있어야 한다(동일 코드, 역할 플래그).

### 6.2 큐 목록 (R2~R3에 존재하는 전부 — 이 외 큐 신설은 escalation 대상)

| 큐 이름 | 도입 | 생산자 | 핸들러 동작 | retry 정책 |
|---|---|---|---|---|
| `ingestion.extract` | R2 | document 모듈(버전 생성 시) | Python worker `POST /v1/internal/extract` 호출(§7) → 결과를 `canonical_documents`에 기록, 상태 갱신 | retryLimit 3, retryDelay 60s, backoff, expireIn 10m |
| `ingestion.ocr` | R2 | `ingestion.extract` 핸들러(스캔 PDF 판정 시) | worker OCR endpoint 호출(타임아웃 길게, 동시성 1~2) | retryLimit 3, retryDelay 300s, backoff |
| `preview.convert` | R2 | preview 모듈 | worker DOCX→PDF 변환 호출 → 변환본을 storage에 별도 FileObject로 저장(원본 불변) | retryLimit 3, retryDelay 60s |
| `upload.bulk` | R2 | upload API(bulk skeleton) | 항목별 upload 파이프라인 재사용 | skeleton — R2는 enqueue/상태 조회만 |
| `search.index.document` | R3 | `ingestion.extract` 완료 시 | tsvector upsert (deleted/superseded 제외 규칙 적용) | retryLimit 5, retryDelay 30s, backoff |
| `search.index.metadata` | R3 | metadata 변경 API | 해당 행 인덱스 갱신 | retryLimit 5, retryDelay 30s |
| `search.reindex` | R3 | reindex manager(관리 작업) | tenant 단위 배치 재색인, singleton | singletonKey=tenantId, retryLimit 1 |

### 6.3 payload 계약 (전 큐 공통)

```jsonc
{
  "tenantId": "uuid",        // 필수. 핸들러는 이 값으로 tenant 트랜잭션을 연다
  "correlationId": "uuid",   // 필수. 발신 요청의 correlation id 전파
  "actorId": "uuid|null",    // 행위 주체(시스템 잡이면 null)
  // 이하 큐별 참조 ID — 예: ingestion.extract
  "documentId": "uuid", "versionId": "uuid", "fileObjectId": "uuid", "mimeType": "application/pdf"
}
```

규칙: payload에는 **참조 ID·hash만** 넣는다. 문서 본문·추출 텍스트·파일명 원문·PII 금지(불변 원칙 7 — `pgboss.job.data`는 평문 저장되므로 로그와 동일하게 취급). 중복 방지가 필요한 잡은 `singletonKey`(예: `versionId`)를 사용한다. retry 소진 시 핸들러는 도메인 상태(`canonical_documents.extraction_status='failed'` 등)를 갱신하고 error tracking hook(§9)에 통지한다.

---

## 7. Python ingestion worker ↔ API 계약

### 7.1 원칙

1. **worker는 stateless이며 앱 DB에 접근하지 않는다.** 입력은 REST 요청, 파일은 presigned GET URL, 출력은 REST 응답 body. DB 기록은 전적으로 API(pg-boss 핸들러) 책임.
2. 호출 방향은 API → worker 단방향(R2). callback이 필요해지면(R4+) 동일 HMAC 체계의 역방향 endpoint를 추가한다.
3. worker는 외부 네트워크 호출 금지(파일 URL 제외). 외부 AI/API 호출은 절대 금지 목록 위반.

### 7.2 인증 — HMAC 서명

공유 비밀 `WORKER_SHARED_SECRET`(양측 환경변수). 모든 요청에:

```
X-Vault-Timestamp: 1718100000        # epoch seconds, ±300s 허용(재생 방지)
X-Vault-Signature: sha256=<hex>      # HMAC-SHA256(secret, timestamp + "." + raw_body)
X-Request-Id: <correlationId>        # 로그 상관관계
```

worker는 timestamp 창 검증 → 서명 상수시간 비교 → 실패 시 401(본문에 상세 사유 금지). 서명 검증 실패는 worker 구조화 로그에 기록한다.

### 7.3 Endpoints (worker 측, FastAPI)

| Endpoint | 용도 |
|---|---|
| `GET /healthz` | liveness (서명 불요) |
| `POST /v1/internal/extract` | 텍스트 추출 (PDF/DOCX/HWPX) |
| `POST /v1/internal/ocr` | OCR (스캔 PDF). 타임아웃 600s, 동시성 제한 |
| `POST /v1/internal/convert-pdf` | DOCX→PDF 변환(preview용). 변환 바이트는 presigned PUT URL로 업로드 |

`POST /v1/internal/extract` 요청:

```jsonc
{
  "job_id": "pg-boss job uuid",
  "tenant_id": "uuid",            // 로그 태깅용. worker는 권한 판단을 하지 않는다
  "version_id": "uuid",
  "mime_type": "application/pdf | application/vnd.openxmlformats-officedocument.wordprocessingml.document | application/hwp+zip",
  "file_url": "https://minio:9000/...presigned GET, TTL 10분",
  "language_hint": "ko",
  "max_bytes": 104857600
}
```

응답 200:

```jsonc
{
  "status": "extracted" | "ocr_required",   // ocr_required → API가 ingestion.ocr enqueue + status=ocr_pending
  "text": "추출 본문(extracted일 때)",
  "extraction_method": "pdf_text | docx_xml | hwpx_xml | ocr_tesseract",
  "confidence": 0.98,                        // OCR 외에는 1.0
  "page_count": 12,
  "warnings": []
}
```

오류: 422 `{ "error_code": "UNSUPPORTED_FILE_TYPE" | "EXTRACTION_FAILED", "detail_ref": "..." }` (detail에 문서 내용 포함 금지). 5xx·타임아웃은 pg-boss retry로 흡수.

### 7.4 잡 추적 테이블

- 큐 상태의 단일 진실은 `pgboss.job`(라이브러리 관리)이다.
- 도메인 가시성은 `canonical_documents.extraction_status` enum으로 노출한다: `queued → extracting → extracted | ocr_pending → extracted | failed` (+`confidence`, `extraction_method`, `extracted_at`). 상세 DDL은 `20_Data_Model_v1_1.md`가 규범.
- worker 자체는 어떤 잡 테이블도 갖지 않는다.

---

## 8. 보안 아키텍처

### 8.1 DB role 분리

| Role | 용도 | 권한 |
|---|---|---|
| `vault_migrator` | 마이그레이션 전용(테이블 owner) | DDL. 런타임 코드에서 사용 금지 |
| `vault_app` | API 런타임 | DML 중 허용분만. `BYPASSRLS` 없음. `audit_events`에 INSERT/SELECT만(§8.3). DELETE는 정당화된 테이블(예: `sessions`)에만 GRANT |

모든 테이블에 `FORCE ROW LEVEL SECURITY`를 적용해 owner 경유 우회도 차단한다.

### 8.2 RLS 정책 패턴 (전 row-level 테이블 필수 — DEC-02, Brief §5-3)

```sql
-- 패턴: 모든 row-level 테이블의 마이그레이션에 포함되는 필수 블록
ALTER TABLE matters ENABLE ROW LEVEL SECURITY;
ALTER TABLE matters FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON matters
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
```

- `current_setting(..., true)`는 GUC 미설정 시 NULL을 반환 → 정책 조건이 false → **0행**. 즉 tenant 컨텍스트 없는 커넥션은 자동 fail-closed.
- `WITH CHECK`가 INSERT/UPDATE 시 타 tenant로의 기록도 차단한다.
- RLS는 **2차 방어선**이다. 1차는 미들웨어·PermissionService이며, "RLS가 있으니 서비스 권한 검사를 생략"하는 것은 금지.
- 예외 허용 테이블: `tenants`, 글로벌 참조 테이블, `authorities`(scope global|tenant). 예외는 마이그레이션 파일에 `-- RLS-EXEMPT: <사유>` 주석 필수(`11_Repository_Structure.md` §6). `pgboss.*`도 동일 사유의 예외.

### 8.3 audit_events append-only (Brief §5-5, R0 `AUDIT-AUDIEVENCO-AUDILOGG-TUW-004`, Risk=C)

DB 계층에서 이중 차단한다 — 권한 박탈 **그리고** trigger:

```sql
-- (1) 권한 계층: 런타임 role에서 변경 권한 제거
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM vault_app;
GRANT INSERT, SELECT ON audit_events TO vault_app;

-- (2) trigger 계층: owner·superuser 경유 변경도 차단
CREATE OR REPLACE FUNCTION audit_events_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only (operation: %)', TG_OP
    USING ERRCODE = 'raise_exception';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_events_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_block_mutation();

CREATE TRIGGER trg_audit_events_no_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION audit_events_block_mutation();
```

검증 계약(R0 Gate): `vault_app`·`vault_migrator` 양쪽에서 UPDATE/DELETE/TRUNCATE 시도가 DB 오류로 실패하는 integration test(`tests/integration/audit-immutability/`)가 green이어야 한다. `metadata_json`은 화이트리스트 키만 허용하고 값은 참조 ID/hash 수준(R1 normalizer가 강제).

### 8.4 권한 평가 계약 (요약 — 전문은 `21_Permission_Model.md`)

default-deny / deny-overrides(wall DENY > 명시 DENY > 명시 ALLOW) / `matter_members`는 ALLOW의 필요조건 / `condition_json` 해석 불가 시 거부. PermissionService의 모든 public 메서드는 fail-closed wrapper로 감싼다: 내부 예외 → 거부 + `ACCESS_DENIED` audit.

### 8.5 표준 error code 9종 (원천 09번 §4 — R0 `CORE-SECFOUND-FAILCLOSE-TUW-001`에서 `packages/shared`에 정의)

`AUTH_REQUIRED` `PERMISSION_DENIED` `ETHICAL_WALL_BLOCKED` `AI_POLICY_BLOCKED` `DOCUMENT_LOCKED` `VALIDATION_FAILED` `UNSUPPORTED_FILE_TYPE` `EXTERNAL_LINK_EXPIRED` `TENANT_ISOLATION_VIOLATION`

R0~R3에서 실제 발생 가능한 것은 앞 7종이다. `ETHICAL_WALL_BLOCKED`은 외부 응답에서 `PERMISSION_DENIED`와 구분 불가하게 처리할 수 있다(wall 존재 누출 방지 — `21_Permission_Model.md` 따름). `EXTERNAL_LINK_EXPIRED`는 R11 전 발생 경로가 없어야 정상이다. `TENANT_ISOLATION_VIOLATION`은 격리 위반 **탐지** 시 내부 alert 코드다(사용자 응답은 `PERMISSION_DENIED`).

### 8.6 Storage 보안 (DEC-07)

- 경로 규약: `tenants/{tenant_id}/matters/{matter_id}/files/{file_object_id}` — path resolver(`storage` 모듈)가 유일한 조립 지점. tenant prefix 누락 경로는 생성 불가.
- **원본 불변**: 업로드된 객체 키에 대한 overwrite/delete 호출 금지. 새 버전은 항상 새 `file_object_id` 키(불변 원칙 5). soft delete는 메타데이터 상태 변경일 뿐 객체는 유지(hard delete는 R12 전 금지).
- presigned URL은 **내부(worker) 전용**, TTL ≤ 10분, GET/PUT 단건 키 한정. 사용자 다운로드·미리보기는 API 스트리밍 프록시 경유 — 권한 검사 + download reason(R2) + audit이 강제되는 유일한 경로다. R2 Gate의 "storage cross-tenant(서명 URL 포함) 차단" 테스트는 타 tenant 키에 대한 presigned 발급이 path resolver에서 거부됨을 검증한다.
- at-rest 암호화: 운영은 SSE(KMS), 개발 MinIO는 기본 설정. DLP 대상 식별자(주민/여권/외국인등록/계좌/카드번호)는 **컬럼 수준 암호화**(DEC-13) — R2에서는 encryption hook interface(`DOC-DOCUSTOR-OBJESTORAD-TUW-005`)만 정의(AES-256-GCM, `encryption_key_id` 컬럼 참조), 본격 적용은 DLP release와 동기화.

### 8.7 세션 보안 (DEC-09)

세션은 PG `sessions` 테이블 저장(서명된 불투명 토큰), 쿠키는 `httpOnly; Secure; SameSite=Lax`, 로그인 시 세션 ID 재발급(고정 공격 방지), idle/absolute TTL 환경변수화. `users.mfa_enabled` flag는 R0 스키마, TOTP enrollment/검증은 R1. 비밀번호는 argon2id.

---

## 9. 관측성 (R0 `CORE-OBSE-LOGGMETR-TUW-001~005`)

| 항목 | 규약 |
|---|---|
| structured log | JSON 한 줄(stdout). 필수 필드: `ts`, `level`, `msg`, `correlation_id`, `tenant_id`, `actor_id`, `module`. Node는 pino, Python은 structlog(또는 동등) — 필드 스키마는 양측 동일 |
| 로그 금지 사항 | 문서 본문·추출 텍스트·검색 쿼리 원문·파일명 원문·세션 토큰·비밀번호·PII. 필요 시 참조 ID 또는 SHA-256 hash만(불변 원칙 7). 검색어는 `query_hash`로 기록 |
| correlation id | 수신 `X-Request-Id` 사용, 없으면 UUID 발급. 응답 헤더 반환. pg-boss payload `correlationId`와 worker 호출 `X-Request-Id`로 전파 — 업로드→추출→색인 전 구간이 단일 id로 추적돼야 한다 |
| OTel | `@opentelemetry/sdk-node`(HTTP·pg 자동계측) + FastAPI instrumentation. trace_id를 로그 필드에 주입. exporter는 `OTEL_EXPORTER_OTLP_ENDPOINT` 설정 시에만 활성(dev 기본 비활성) |
| health | `GET /healthz`(liveness, 의존성 무검사) / `GET /readyz`(DB ping + storage head). worker는 `GET /healthz` |
| metrics | `GET /metrics` Prometheus 포맷 — 외부 비공개(내부 포트 또는 네트워크 제한). 기본: HTTP 지연·오류율, pg-boss 큐 깊이·실패 수, 추출 처리 시간 |
| error tracking hook | 인터페이스만 R0에 정의(콘솔 구현). Sentry 등 구체 연동은 별도 결정 — 사양에 없는 외부 전송 추가 금지 원칙 적용 |
| audit vs log | audit_events는 규제 대상 기록(DB, append-only), 로그는 운영 신호. **로그로 audit을 대체 금지** |

---

## 10. docker-compose.dev.yml 구성 명세 (`infra/docker-compose.dev.yml`)

서비스 3종: `postgres`, `minio`(+초기화 `minio-init`), `worker`. **api·web은 컨테이너가 아니라 호스트에서 `pnpm dev`로 구동**한다(R0~R3 개발 루프 단순화). worker가 presigned URL 호스트 `minio`를 해석해야 하므로 compose 네트워크에 포함된다(§8.6 — presigned는 내부 전용이므로 브라우저 해석 불필요).

```yaml
# infra/docker-compose.dev.yml
name: amic-vault-dev
services:
  postgres:
    image: postgres:16            # R0에서 digest 고정
    environment:
      POSTGRES_USER: vault
      POSTGRES_PASSWORD: vault_dev_only
      POSTGRES_DB: amic_vault
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U vault -d amic_vault"]
      interval: 5s
      timeout: 3s
      retries: 10

  minio:
    image: minio/minio            # R0에서 RELEASE 태그 고정
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: vault-dev
      MINIO_ROOT_PASSWORD: vault_dev_only
    ports: ["9000:9000", "9001:9001"]
    volumes: ["miniodata:/data"]
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 5s
      timeout: 3s
      retries: 10

  minio-init:                     # 버킷 생성 후 종료(one-shot)
    image: minio/mc
    depends_on:
      minio: { condition: service_healthy }
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 vault-dev vault_dev_only &&
      mc mb --ignore-existing local/amic-vault-dev &&
      mc anonymous set none local/amic-vault-dev"

  worker:
    build: ../workers/ingestion   # Dockerfile은 workers/ingestion/에 위치
    ports: ["8081:8081"]
    environment:
      WORKER_PORT: "8081"
      WORKER_SHARED_SECRET: dev_shared_secret_change_me
      LOG_LEVEL: info
      OCR_LANGS: kor+eng
      MAX_EXTRACT_MB: "100"
    depends_on:
      minio: { condition: service_healthy }
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://localhost:8081/healthz || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  pgdata:
  miniodata:
```

규칙: dev 자격증명은 위 고정값만 사용(실 비밀 금지), 운영 값은 별도 주입. DB role(`vault_migrator`/`vault_app`) 생성과 `pgboss` 스키마는 첫 마이그레이션(`pnpm db:migrate`)이 담당한다 — compose는 빈 PG만 제공.

기동·검증 순서(표준 명령 세트):

```bash
pnpm install
docker compose -f infra/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm test:integration        # compose 의존(PG/MinIO/worker)
```

---

## 11. 환경변수 표

dev 기본값은 위 compose와 일치해야 한다. 비밀값은 커밋 금지 — `*.env.example`만 커밋(`11_Repository_Structure.md` §2).

### apps/api (`apps/api/.env`)

| 변수 | dev 기본값 | 설명 |
|---|---|---|
| `NODE_ENV` | `development` | |
| `PORT` | `3001` | API 포트 |
| `DATABASE_URL` | `postgres://vault_app:...@localhost:5432/amic_vault` | 런타임(RLS 적용 role) |
| `DATABASE_URL_MIGRATOR` | `postgres://vault_migrator:...@localhost:5432/amic_vault` | `pnpm db:migrate`/`db:rollback` 전용 |
| `SESSION_SECRET` | (dev 임의값) | 세션 토큰 서명 키 |
| `SESSION_IDLE_TTL_MIN` / `SESSION_ABS_TTL_HOURS` | `60` / `12` | 세션 만료 |
| `S3_ENDPOINT` | `http://localhost:9000` | API→MinIO (호스트 관점) |
| `S3_PRESIGN_ENDPOINT` | `http://minio:9000` | presigned URL 호스트(worker 컨테이너 관점, 내부 전용) |
| `S3_REGION` / `S3_BUCKET` | `us-east-1` / `amic-vault-dev` | |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | `vault-dev` / `vault_dev_only` | |
| `WORKER_BASE_URL` | `http://localhost:8081` | ingestion worker |
| `WORKER_SHARED_SECRET` | `dev_shared_secret_change_me` | HMAC 키(§7.2) |
| `JOBS_ENABLED` | `true` | pg-boss 핸들러 구동 여부(§6.1) |
| `PGBOSS_SCHEMA` | `pgboss` | |
| `LOG_LEVEL` | `info` | |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | (없음=비활성) | |
| `COLUMN_ENCRYPTION_KEY` | (dev 임의값) | R2 encryption hook 인터페이스용(DEC-13). 미설정 시 hook은 fail-closed로 기동 거부 |

### apps/web (`apps/web/.env`)

| 변수 | dev 기본값 | 설명 |
|---|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:3001` | 브라우저→API. 그 외 서버 비밀을 web에 두지 않는다 |

### workers/ingestion (compose `environment` 또는 `.env`)

| 변수 | dev 기본값 | 설명 |
|---|---|---|
| `WORKER_PORT` | `8081` | |
| `WORKER_SHARED_SECRET` | api와 동일 | |
| `LOG_LEVEL` | `info` | |
| `OCR_LANGS` | `kor+eng` | tesseract 언어 |
| `MAX_EXTRACT_MB` | `100` | 입력 상한(초과 시 422) |

---

## 12. 배포 원칙 (DEC-01) — R0~R3 범위

- 모든 산출물은 컨테이너 이미지(api/web/worker). dev compose와 운영의 차이는 설정 주입뿐이어야 한다(on-prem 이식성).
- CI(R0 `CORE-REPOBUIL-CICD-TUW-003~005`): lint→typecheck→test→build green이 머지 조건. staging pipeline·prod gate는 R0에서 skeleton만.
- 운영 토폴로지(국내 리전 private, KMS, 네트워크 격리 상세)는 R4 이후 별도 문서 — 본 문서 범위 밖. 단 R0~R3 코드가 위 가정(스토리지 추상화, 설정 주입, stateless worker)을 깨면 안 된다.

## 13. 금지사항 재확인 (Brief §2 — 본 문서 적용분)

- R6 전 AI 기능 구현·외부 모델 호출·벡터/의미검색 금지. `packages/ai`는 인터페이스 placeholder만.
- R7 전 Neo4j/GraphSync 의존성 추가 금지. R11 전 외부 공유(secure link 포함) 금지.
- PermissionService 우회 document/search endpoint 금지. `audit_events` UPDATE/DELETE 경로 금지. hard delete 금지.
- 사양·본 패키지에 없는 외부 API/모델 호출 추가 금지(error tracking 구체 연동 포함 — 결정 전까지 인터페이스만).
