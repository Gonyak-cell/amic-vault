# 43. TUW Backlog — R3: Permission-bound Search v1 (28 TUW 전체 상세 명세)

버전: 1.0 | 작성일: 2026-06-11 | 상태: Normative 확장본 — `00_Master_Brief.md` §7 R3 인벤토리를 1:1로 상세화한다. 본 문서와 Brief가 충돌하면 Brief가 우선한다.

---

## 0. R3 공통 규약 (모든 TUW에 적용 — 각 TUW 표는 이 절을 전제한다)

### 0.1 진입 전제 (release-level)

- **R2 Gate 통과** 및 **R1 Permission Model Freeze**(`DEVOPS-FREEZE-PERMMODEL-TUW-001`) 승인 없이는 어떤 R3 TUW도 착수 금지 (Brief C-1).
- Freeze가 동결한 항목 — role matrix, `canReadMatter`/`canReadDocument` 계열 시그니처, wall schema, **search filter 주입 지점** — 은 R3에서 변경 금지. 변경 필요 발견 = 즉시 Stop condition.

### 0.2 불변 원칙 집행 (Brief §2)

1. **Permission-before-search**: 모든 권한·wall 필터는 SQL **쿼리 단계 주입**(WHERE/EXISTS/CTE). 결과 fetch 후 애플리케이션 레벨 배열 필터링(`.filter()` 등)으로 권한을 거르는 **사후 필터링은 어떤 TUW에서도 금지**이며, 발견 시 해당 PR 머지 금지 + R3 Gate 불통과 사유다.
2. **Fail-closed**: 권한 scope 산출 불가·오류·미구현 상태에서 검색 호출 → `PERMISSION_DENIED`. 빈 필터로 전체 노출하는 폴백 금지.
3. **Audit-by-default**: 검색 실행·재인덱스 트리거는 audit event 없이는 완료가 아니다.
4. **Sensitive data is not logged**: 검색 쿼리 원문·문서 본문·snippet을 로그/audit metadata에 기록 금지. audit에는 `query_hash`(SHA-256)·참조 ID·카운트만.
5. **AI/벡터 전면 금지**: embedding, pgvector, similarity, hybrid score 등 의미검색 관련 코드·스키마·의존성·UI 표기 일체 금지 (R6, C-5). 원천 13번의 `SEARCH-SEMASEAR-VECT-TUW-001~005`는 **본 백로그에 존재하지 않으며 R6로 이관**되었다 (§3 참조).

### 0.3 표준 검증 명령 세트

```
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker compose -f infra/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm db:rollback
pnpm test:integration
```

모든 TUW의 회귀검증 = `pnpm lint && pnpm typecheck && pnpm test && pnpm build` green AND 기존 통합 suite(`pnpm test:integration`) green. 마이그레이션 포함 TUW는 `pnpm db:migrate` → `pnpm db:rollback` → `pnpm db:migrate` 왕복 green 추가.

### 0.4 공통 Stop condition (Brief §6.4 + R3 추가)

스키마·권한·정책 불명확 / verification fixture 부재 / Files NOT-modify 변경 필요 발견 / 동일 실패 3회 반복 / **Freeze 동결 항목 변경 필요 발견** / **사후 필터링 외 구현 경로가 없다고 판단되는 경우** → 작업 중단, `docs/ledger/execution.md`에 TUW ID·차단 지점·사유 기록 후 escalation.

### 0.5 공통 Escalation

`docs/ledger/execution.md`에 1줄 기록 → PM/사람 검토 요청. **Risk=C TUW는 구현·테스트 green 이후에도 사람(또는 상위 검토 에이전트) 리뷰 게이트 통과 전 머지 금지** (Brief §6.3). Risk=C 포함 PACK 전체가 사람 리뷰 대상이다 (Brief §9).

### 0.6 공통 Files NOT to modify (전 TUW 기본값 — 각 TUW의 NOT-modify에 암묵 포함)

- `docs/package/**` (vault_dev_package 이관본, normative)
- 기존 `db/migrations/*.sql` (append-only — 새 번호 파일만 추가)
- `apps/api/src/modules/audit/**`의 append-only 제약·스키마 (이벤트 타입 레지스트리 추가는 허용 범위를 각 TUW에 명시)
- `apps/api/src/modules/permission/**`, `apps/api/src/modules/ethical-wall/**`의 평가 로직·시그니처 (R3는 **호출만**)
- `packages/ai/**` (placeholder 유지 — 어떤 R3 TUW도 이 패키지를 건드리지 않는다)
- `AGENTS.md`, `tools/backlog/**`의 release 규칙(완화 방향 수정 금지)

### 0.7 R3 신설 audit event (metadata_json 화이트리스트 — Brief §5.5)

| Event | 필수 metadata (참조 ID/hash/카운트만) | 도입 TUW |
|---|---|---|
| `SEARCH_EXECUTED` | actor_id, tenant_id, query_hash(SHA-256), query_length, filter_refs(matter_id/client_id/document_type/date_range/version_status), result_count, duration_ms | SEARCH-FULLSEAR-TEXTQUER-TUW-005 |
| `SEARCH_REINDEX_REQUESTED` | actor_id, tenant_id, scope_type(tenant\|matter), scope_id, enqueued_job_count | SEARCH-SEARINDE-INDE-TUW-004 |

검색 쿼리 **원문은 어디에도 저장 금지** (audit 포함). 위반은 테스트로 차단한다 (TEXTQUER-005).

### 0.8 검색 API 계약 요약 (원천 09번 §3 `POST /search` 승계, DEC-14 적용)

- 단일 진입점: `POST /v1/search` — 메타데이터 검색·전문검색 공용. PermissionService를 우회하는 다른 검색/문서 endpoint 신설 금지 (Brief §2 절대 금지).
- Request(zod, `packages/shared`): `{ query?: string, filters?: { matterId?, clientId?, documentType?, dateFrom?, dateTo?, versionStatus? }, page?: number, pageSize?: number }`
- Response: `{ results: [{ documentId, versionId, matterId, clientId, title, snippet, highlights, documentType, versionStatus, score, updatedAt }], total, facets? }`
- 오류: 표준 error code 9종 사용 (`AUTH_REQUIRED`, `PERMISSION_DENIED`, `VALIDATION_FAILED` 등). **wall 차단은 오류가 아니라 silent exclusion** — `ETHICAL_WALL_BLOCKED`를 검색 응답에서 반환하면 존재 자체가 누설되므로 금지.

### 0.9 마이그레이션 번호

R3 권장 대역 `03xx` (예시 번호 사용; 실제 번호는 repo의 직전 마이그레이션 +1 규칙을 따른다).

---

## 1. R3 인벤토리 (28 TUW — Brief §7과 1:1, 추가·삭제 없음)

| # | ID | Title | Risk | Size |
|---|---|---|---|---|
| 1 | SEARCH-SEARINDE-INDE-TUW-001 | search index schema (PG FTS tsvector + RLS) | H | M |
| 2 | SEARCH-SEARINDE-INDE-TUW-002 | document indexing job enqueue (pg-boss) | M | M |
| 3 | SEARCH-SEARINDE-INDE-TUW-003 | index update on metadata change (+SLA 측정) | M | S |
| 4 | SEARCH-SEARINDE-INDE-TUW-004 | reindex manager (admin 전용) | M | M |
| 5 | SEARCH-SEARINDE-INDE-TUW-005 | index failure retry + dead-letter | L | S |
| 6 | SEARCH-METASEAR-FILT-TUW-001 | matterId filter + SearchFilterBuilder 골격 | M | M |
| 7 | SEARCH-METASEAR-FILT-TUW-002 | clientId filter | L | S |
| 8 | SEARCH-METASEAR-FILT-TUW-003 | documentType filter | L | S |
| 9 | SEARCH-METASEAR-FILT-TUW-004 | date range filter | L | S |
| 10 | SEARCH-METASEAR-FILT-TUW-005 | version status filter (superseded 기본 제외) | M | S |
| 11 | SEARCH-FULLSEAR-TEXTQUER-TUW-001 | full-text query API `POST /v1/search` (fail-closed scope 필수) | H | M |
| 12 | SEARCH-FULLSEAR-TEXTQUER-TUW-002 | snippet generator (ts_headline) | M | S |
| 13 | SEARCH-FULLSEAR-TEXTQUER-TUW-003 | highlighting | L | S |
| 14 | SEARCH-FULLSEAR-TEXTQUER-TUW-004 | deleted document exclusion (해제 불가 고정 조건) | M | S |
| 15 | SEARCH-FULLSEAR-TEXTQUER-TUW-005 | search audit event `SEARCH_EXECUTED` | M | S |
| 16 | SEARCH-PERMSEAR-PERMFILT-TUW-001 | **matter permission filter 쿼리 주입 (C)** | C | M |
| 17 | SEARCH-PERMSEAR-PERMFILT-TUW-002 | **document permission filter 쿼리 주입 (C)** | C | M |
| 18 | SEARCH-PERMSEAR-PERMFILT-TUW-003 | **ethical wall filter 쿼리 주입 (C)** | C | M |
| 19 | SEARCH-PERMSEAR-PERMFILT-TUW-004 | permission filter regression test + 반영 SLA 측정 | H | M |
| 20 | SEARCH-PERMSEAR-PERMFILT-TUW-005 | **metadata leakage test (C)** | C | M |
| 21 | SEC-ETHIWALL-WALLENFO-TUW-005 | **wall enforcement in search 통합 검증 (C)** | C | M |
| 22 | SEARCH-UI-PAGE-TUW-001 | 검색 페이지 (Next.js) | M | M |
| 23 | SEARCH-UI-PAGE-TUW-002 | facet (서버 계산, 권한 필터 후 집계) | M | M |
| 24 | SEARCH-UI-PAGE-TUW-003 | result card (권한 내 자료만, AI 표시 없음) | M | S |
| 25 | SEARCH-KOREAN-EVAL-TUW-001 | 한국어 토큰화 평가 (법률용어 fixture 30건) | M | M |
| 26 | SEARCH-KOREAN-EVAL-TUW-002 | OpenSearch 전환 판단 보고서 (ADR-006 갱신) | M | S |
| 27 | DEVOPS-EVALSET-V0-TUW-001 | 평가셋 v0 수집 절차 문서 (비식별화 규칙) | M | S |
| 28 | DEVOPS-EVALSET-V0-TUW-002 | evaluation_cases 테이블 + 적재 스크립트 | M | M |

Risk=C 5건(#16, #17, #18, #20, #21)은 전부 **사람 리뷰 게이트 필수**.

---

## 2. TUW 상세 명세

### 모듈 SEARCH-SEARINDE-INDE — Search Indexing

#### SEARCH-SEARINDE-INDE-TUW-001 — search index schema (PG FTS tsvector + RLS)

| 필드 | 내용 |
|---|---|
| ID | SEARCH-SEARINDE-INDE-TUW-001 |
| Title | `document_search_index` 테이블 생성 (PG FTS tsvector, tenant_id NOT NULL + RLS) |
| Release | R3 |
| Module | SEARCH-SEARINDE-INDE (Search Indexing) |
| Risk | H |
| Size | M |
| Depends_on | DOC-OCRTEXTEXT-EXTRWORK-TUW-002, CORE-DATACORE-MIGR-TUW-005 (release 전제: R2 Gate 통과) |
| Objective | `document_search_index` 테이블이 `tenant_id NOT NULL`+RLS 정책+GIN(tsvector) 인덱스로 생성되어 migrate/rollback 왕복과 cross-tenant 차단 통합테스트가 green이다. |
| Files to create | `db/migrations/0301_create_document_search_index.sql` · `apps/api/src/modules/search/search.module.ts` · `apps/api/src/modules/search/index/search-index.repository.ts` · `apps/api/src/modules/search/index/search-index.repository.spec.ts` · `tests/integration/cross-tenant/search-cross-tenant.spec.ts` |
| Files to modify | `apps/api/src/app.module.ts` (SearchModule 등록) |
| Files NOT to modify | §0.6 공통 + `apps/api/src/modules/document/**` 스키마(읽기 전용 참조) |
| Verification (AND) | (기능) migrate→rollback→migrate 왕복 green, repository upsert/조회 unit green · (격리·negative) tenant A 세션 컨텍스트에서 tenant B 인덱스 row 조회 0건 — RLS 통합테스트, superuser 우회 경로 부재 확인 · (회귀) §0.3 전체 green |
| Edge cases | 1) 동일 version 재인덱스 → `UNIQUE(tenant_id, version_id)` upsert로 중복 row 0건 2) 추출 텍스트 초대형(>1MB) → truncation 정책(1MB 한도, `source_text_hash`는 원문 기준 보존) 3) FTS config는 `simple` 기본(한국어 측정은 KOREAN-EVAL-001) — config 변경이 reindex를 요구함을 주석으로 명시 |
| Stop condition | §0.4 공통 + RLS 컨벤션 템플릿(CORE-DATACORE-MIGR-TUW-005 산출) 부재/불일치 발견 시 |
| Escalation | §0.5 공통 |

구현 메모: 컬럼 — `id`, `tenant_id NOT NULL`, `document_id`, `version_id`, `matter_id`, `client_id`, `document_type`, `document_status`, `version_status`, `title`, `content_text`, `title_tsv`, `content_tsv`, `fts_config`, `source_text_hash`, `indexed_at`. `content_text`는 인덱싱 목적 저장이며 로그·audit로 복사 금지(§0.2-4).

#### SEARCH-SEARINDE-INDE-TUW-002 — document indexing job enqueue

| 필드 | 내용 |
|---|---|
| ID | SEARCH-SEARINDE-INDE-TUW-002 |
| Title | 텍스트 추출 완료 → pg-boss `search-index` job enqueue + processor upsert |
| Release | R3 |
| Module | SEARCH-SEARINDE-INDE |
| Risk | M |
| Size | M |
| Depends_on | SEARCH-SEARINDE-INDE-TUW-001 |
| Objective | 추출 완료된 DocumentVersion이 pg-boss job을 거쳐 `document_search_index`에 upsert되어 "추출완료→검색가능" 흐름이 통합테스트로 증명된다. |
| Files to create | `apps/api/src/modules/search/index/indexing.service.ts` · `apps/api/src/modules/search/index/indexing.processor.ts` · `apps/api/src/modules/search/index/indexing.service.spec.ts` · `tests/integration/search-permission/search-indexing-flow.spec.ts` |
| Files to modify | R2 추출 완료 핸들러(`apps/api/src/modules/document/extraction/` 내 완료 지점 — R2 구현 파일명 기준) 1곳에 enqueue 호출 추가 |
| Files NOT to modify | §0.6 공통 + `workers/ingestion/**` (worker 측 변경 불요 — API 측 완료 핸들러에서 hook) |
| Verification (AND) | (기능) 추출 완료 이벤트 → job enqueue → processor 처리 → 인덱스 row 존재 통합테스트 green · (격리·negative) job payload의 tenant_id와 다른 tenant 컨텍스트로 processor 강제 실행 시 upsert 실패(RLS) 테스트 · (회귀) §0.3 전체 green |
| Edge cases | 1) 빈 추출 텍스트(0바이트) → 메타데이터만 인덱스, content_tsv 빈 값 허용 2) 동일 version 중복 job → 멱등 upsert 3) job payload에 본문 포함 금지 — 참조 ID만 싣고 processor가 DB/storage에서 로드 |
| Stop condition | §0.4 공통 + R2 추출 완료 hook 지점이 특정 불가하면 중단 |
| Escalation | §0.5 공통 |

#### SEARCH-SEARINDE-INDE-TUW-003 — index update on metadata change

| 필드 | 내용 |
|---|---|
| ID | SEARCH-SEARINDE-INDE-TUW-003 |
| Title | 메타데이터·버전 상태 변경 시 인덱스 갱신 + 반영 SLA 측정 |
| Release | R3 |
| Module | SEARCH-SEARINDE-INDE |
| Risk | M |
| Size | S |
| Depends_on | SEARCH-SEARINDE-INDE-TUW-002, DOC-DOCUMETA-METAEXTR-TUW-004 |
| Objective | 메타데이터 수정·문서/버전 상태 전이가 인덱스 row에 정의된 SLA(p95 ≤ 60s, dev 기준; Gate에서 수치 확정) 내 반영됨이 측정 테스트로 증명된다. |
| Files to create | `apps/api/src/modules/search/index/index-sync.hook.ts` · `apps/api/src/modules/search/index/index-sync.hook.spec.ts` · `tests/integration/search-permission/search-index-sync-sla.spec.ts` |
| Files to modify | 메타데이터 편집 서비스(R2 DOC-DOCUMETA-METAEXTR-TUW-004 산출)와 상태 전이 서비스의 변경 commit 지점에 enqueue 호출 추가 |
| Files NOT to modify | §0.6 공통 + `packages/domain/**` 상태머신 규칙 |
| Verification (AND) | (기능) 메타 변경→인덱스 반영 통합테스트 + 반영 시간 측정값을 테스트 출력으로 기록(Gate 증빙) · (회귀) §0.3 전체 green |
| Edge cases | 1) soft-deleted 문서의 메타 변경 → 인덱스 제외 상태 유지 2) 연속 변경 race → 처리 시점 재조회로 last-write 일관성 3) matter 이동 시 인덱스의 `matter_id`/`client_id` 동시 갱신(권한 필터 정합의 전제) |
| Stop condition | §0.4 공통 |
| Escalation | §0.5 공통 |

#### SEARCH-SEARINDE-INDE-TUW-004 — reindex manager

| 필드 | 내용 |
|---|---|
| ID | SEARCH-SEARINDE-INDE-TUW-004 |
| Title | admin 전용 reindex manager (`POST /v1/admin/search/reindex`) |
| Release | R3 |
| Module | SEARCH-SEARINDE-INDE |
| Risk | M |
| Size | M |
| Depends_on | SEARCH-SEARINDE-INDE-TUW-003, SEC-RBAC-ROLEMATR-TUW-005 |
| Objective | Firm Admin/Security Admin만 tenant·matter 범위 재인덱스를 트리거할 수 있고, 비인가 호출은 `PERMISSION_DENIED`, 실행은 `SEARCH_REINDEX_REQUESTED` audit으로 기록된다. |
| Files to create | `apps/api/src/modules/search/index/reindex.service.ts` · `apps/api/src/modules/search/index/reindex.controller.ts` · `apps/api/src/modules/search/index/reindex.service.spec.ts` · `tests/integration/search-permission/search-reindex.spec.ts` |
| Files to modify | audit event 타입 레지스트리(이벤트 타입 추가만 — append 방식) |
| Files NOT to modify | §0.6 공통 (admin route guard 자체 수정 금지 — 적용만) |
| Verification (AND) | (기능) matter 범위 reindex → 대상 version 전부 재enqueue 통합테스트 · (권한·negative) Matter Member/Limited Reviewer 호출 → `PERMISSION_DENIED`, 타 tenant admin 호출 → 거부 · (감사) `SEARCH_REINDEX_REQUESTED` 발생 + §0.7 필수 metadata 충족 · (회귀) §0.3 전체 green |
| Edge cases | 1) 동일 범위 reindex 중복 트리거 → 진행 중이면 멱등 처리(신규 job 미생성, 200 + 기존 작업 참조) 2) 범위 내 문서 0건 → enqueued_job_count=0 정상 종료 3) 대량(>10k versions) → 배치 분할 enqueue |
| Stop condition | §0.4 공통 |
| Escalation | §0.5 공통 |

#### SEARCH-SEARINDE-INDE-TUW-005 — index failure retry

| 필드 | 내용 |
|---|---|
| ID | SEARCH-SEARINDE-INDE-TUW-005 |
| Title | 인덱싱 job 실패 retry(지수 backoff) + dead-letter + 메트릭 |
| Release | R3 |
| Module | SEARCH-SEARINDE-INDE |
| Risk | L |
| Size | S |
| Depends_on | SEARCH-SEARINDE-INDE-TUW-004 |
| Objective | 인덱싱 job 실패가 지수 backoff로 최대 5회 재시도되고 최종 실패는 dead-letter 기록과 메트릭(`search_index_failures_total`)으로 관측된다. |
| Files to create | `apps/api/src/modules/search/index/index-failure.handler.ts` · `apps/api/src/modules/search/index/index-failure.handler.spec.ts` |
| Files to modify | `apps/api/src/modules/search/index/indexing.processor.ts` (pg-boss retryLimit/backoff 옵션) · 메트릭 등록부(CORE-OBSE-LOGGMETR-TUW-004 산출)에 counter 추가 |
| Files NOT to modify | §0.6 공통 |
| Verification (AND) | (기능) 강제 오류 주입 → 재시도 횟수·backoff·dead-letter 도달 테스트, 메트릭 증가 확인 · (로그 위생) 실패 로그에 본문 미기록 — 참조 ID/hash만 assert · (회귀) §0.3 전체 green |
| Edge cases | 1) 영구 실패(추출 텍스트 손상)와 일시 실패(DB 타임아웃) 구분 — 영구 실패는 즉시 dead-letter 2) 재시도 대기 중 문서 삭제됨 → job 무해 종료(no-op) |
| Stop condition | §0.4 공통 |
| Escalation | §0.5 공통 |

### 모듈 SEARCH-METASEAR-FILT — Metadata Search Filters

공통 설계: 본 모듈은 **public endpoint를 만들지 않는다**(endpoint는 TEXTQUER-001). 산출물은 `SearchFilterBuilder`(파라미터 바인딩 SQL 조각 조립기)와 zod DTO이며, 문자열 연결 SQL 생성은 금지(SQL injection 차단). 모든 필터는 권한 scope(PERMFILT 모듈) **내부의 교집합**으로만 동작한다.

#### SEARCH-METASEAR-FILT-TUW-001 — matterId filter + SearchFilterBuilder 골격

| 필드 | 내용 |
|---|---|
| ID | SEARCH-METASEAR-FILT-TUW-001 |
| Title | SearchFilterBuilder 골격 + `filters.matterId` 조건 |
| Release | R3 |
| Module | SEARCH-METASEAR-FILT (Metadata Search) |
| Risk | M |
| Size | M |
| Depends_on | SEARCH-SEARINDE-INDE-TUW-001 |
| Objective | matterId 필터가 파라미터 바인딩 SQL 조건으로 적용되어 해당 matter의 인덱스 row만 반환됨이 unit/통합테스트로 증명된다. |
| Files to create | `apps/api/src/modules/search/query/search-filter.builder.ts` · `apps/api/src/modules/search/query/search-filter.builder.spec.ts` · `packages/shared/src/search/search-query.dto.ts` (zod) |
| Files to modify | `packages/shared/src/index.ts` (export 추가) |
| Files NOT to modify | §0.6 공통 |
| Verification (AND) | (기능) matterId 적용 시 대상 matter row만 반환, 미적용 시 전체(테스트 scope 내) — repository 레벨 통합테스트 · (안전) 생성 SQL이 바인딩 파라미터만 사용함을 빌더 unit으로 강제(악성 입력 `'; DROP TABLE` fixture가 문자 그대로 바인딩) · (회귀) §0.3 전체 green |
| Edge cases | 1) 존재하지 않는 matterId → 빈 결과(오류 아님; 존재 여부 누설 금지) 2) UUID 형식 위반 → `VALIDATION_FAILED` 3) 복수 필터 결합 시 AND 의미론 고정 |
| Stop condition | §0.4 공통 |
| Escalation | §0.5 공통 |

#### SEARCH-METASEAR-FILT-TUW-002 — clientId filter

| 필드 | 내용 |
|---|---|
| ID | SEARCH-METASEAR-FILT-TUW-002 |
| Title | `filters.clientId` 조건 구현 |
| Release | R3 |
| Module | SEARCH-METASEAR-FILT |
| Risk | L |
| Size | S |
| Depends_on | SEARCH-METASEAR-FILT-TUW-001 |
| Objective | clientId 필터가 해당 client 소속 matter들의 인덱스 row만 반환함이 테스트로 증명된다. |
| Files to create | (빌더에 조건 추가) `apps/api/src/modules/search/query/search-filter.builder.spec.ts`에 케이스 추가 |
| Files to modify | `apps/api/src/modules/search/query/search-filter.builder.ts` · `packages/shared/src/search/search-query.dto.ts` |
| Files NOT to modify | §0.6 공통 |
| Verification (AND) | (기능) clientId 필터 정확성 unit/통합 green · (안전) 바인딩 파라미터 강제 유지 · (회귀) §0.3 전체 green |
| Edge cases | 1) clientId+matterId 동시 지정인데 matter가 그 client 소속이 아님 → 빈 결과 2) 존재하지 않는 clientId → 빈 결과 |
| Stop condition | §0.4 공통 |
| Escalation | §0.5 공통 |

#### SEARCH-METASEAR-FILT-TUW-003 — documentType filter

| 필드 | 내용 |
|---|---|
| ID | SEARCH-METASEAR-FILT-TUW-003 |
| Title | `filters.documentType` 조건 구현 (R2 enum 검증) |
| Release | R3 |
| Module | SEARCH-METASEAR-FILT |
| Risk | L |
| Size | S |
| Depends_on | SEARCH-METASEAR-FILT-TUW-002, DOC-DOCUMETA-METAEXTR-TUW-002 |
| Objective | documentType 필터가 R2 document type enum 값만 수용하고(`VALIDATION_FAILED` 외), 해당 타입 row만 반환함이 테스트로 증명된다. |
| Files to create | spec 케이스 추가 |
| Files to modify | `apps/api/src/modules/search/query/search-filter.builder.ts` · `packages/shared/src/search/search-query.dto.ts` (enum 참조는 R2 정의를 import — 재정의 금지) |
| Files NOT to modify | §0.6 공통 + R2 document type enum 정의 파일(값 추가·변경 금지) |
| Verification (AND) | (기능) 타입별 필터 정확성 green · (입력검증·negative) enum 외 값 → `VALIDATION_FAILED` · (회귀) §0.3 전체 green |
| Edge cases | 1) 복수 타입 배열 지정(IN 절) 2) 타입 미지정 문서(NULL) → 타입 필터 시 제외 |
| Stop condition | §0.4 공통 |
| Escalation | §0.5 공통 |

#### SEARCH-METASEAR-FILT-TUW-004 — date range filter

| 필드 | 내용 |
|---|---|
| ID | SEARCH-METASEAR-FILT-TUW-004 |
| Title | `filters.dateFrom/dateTo` 범위 조건 구현 |
| Release | R3 |
| Module | SEARCH-METASEAR-FILT |
| Risk | L |
| Size | S |
| Depends_on | SEARCH-METASEAR-FILT-TUW-003 |
| Objective | ISO8601 date range 필터가 경계 포함(`[from, to]`) 의미론으로 정확히 동작함이 경계값 테스트로 증명된다. |
| Files to create | spec 케이스 추가 |
| Files to modify | `apps/api/src/modules/search/query/search-filter.builder.ts` · `packages/shared/src/search/search-query.dto.ts` |
| Files NOT to modify | §0.6 공통 |
| Verification (AND) | (기능) from/to 경계 포함, from만/to만 단독 지정 케이스 green · (입력검증·negative) `from > to` → `VALIDATION_FAILED`, 비ISO 문자열 → `VALIDATION_FAILED` · (회귀) §0.3 전체 green |
| Edge cases | 1) timezone — 입력을 UTC로 정규화(KST 입력 fixture 포함) 2) 자정 경계(23:59:59 vs 다음날 00:00) 3) 기준 컬럼은 문서 `updated_at`(명세 고정, 주석 명시) |
| Stop condition | §0.4 공통 |
| Escalation | §0.5 공통 |

#### SEARCH-METASEAR-FILT-TUW-005 — version status filter

| 필드 | 내용 |
|---|---|
| ID | SEARCH-METASEAR-FILT-TUW-005 |
| Title | `filters.versionStatus` 조건 — 기본값 latest only(superseded 제외) |
| Release | R3 |
| Module | SEARCH-METASEAR-FILT |
| Risk | M |
| Size | S |
| Depends_on | SEARCH-METASEAR-FILT-TUW-004, DOC-DOCUVERS-VERSRESO-TUW-006 |
| Objective | 검색 기본값이 superseded 버전을 제외하고 최신 버전만 반환하며, 명시 옵션으로만 과거 버전이 포함됨이 테스트로 증명된다 (R3 Gate "deleted·superseded 제외" 항목의 superseded 절반). |
| Files to create | spec 케이스 추가 |
| Files to modify | `apps/api/src/modules/search/query/search-filter.builder.ts` · `packages/shared/src/search/search-query.dto.ts` |
| Files NOT to modify | §0.6 공통 + R2 버전 상태 정의 |
| Verification (AND) | (기능) 기본 호출에서 superseded row 0건, `versionStatus: 'all'` 명시 시 포함 · (negative) 어떤 필터 조합으로도 deleted 문서는 미포함(TEXTQUER-004 고정 조건과 결합 테스트) · (회귀) §0.3 전체 green |
| Edge cases | 1) family 내 전 버전 superseded(현행 없음) → 미노출 2) 신규 버전 업로드 직후 인덱스 갱신 전 시점 — 이전 버전이 잠시 노출될 수 있음을 SLA(INDE-003)로 한정 |
| Stop condition | §0.4 공통 |
| Escalation | §0.5 공통 |

### 모듈 SEARCH-FULLSEAR-TEXTQUER — Full-text Search

#### SEARCH-FULLSEAR-TEXTQUER-TUW-001 — full-text query API

| 필드 | 내용 |
|---|---|
| ID | SEARCH-FULLSEAR-TEXTQUER-TUW-001 |
| Title | `POST /v1/search` 전문검색 API (permission scope provider 필수·fail-closed) |
| Release | R3 |
| Module | SEARCH-FULLSEAR-TEXTQUER (Full-text Search) |
| Risk | H |
| Size | M |
| Depends_on | SEARCH-SEARINDE-INDE-TUW-002, SEARCH-METASEAR-FILT-TUW-001, CORE-SECFOUND-FAILCLOSE-TUW-001 |
| Objective | `POST /v1/search`가 `websearch_to_tsquery` 기반 전문검색을 score순으로 반환하되, `SearchPermissionScopeProvider`가 주입되지 않은 상태(기본 구현=deny-all)에서는 무조건 `PERMISSION_DENIED`를 반환한다. |
| Files to create | `apps/api/src/modules/search/search.controller.ts` · `apps/api/src/modules/search/search.service.ts` · `apps/api/src/modules/search/query/search-query.builder.ts` · `apps/api/src/modules/search/permission/search-permission-scope.provider.ts` (인터페이스 + **deny-all 기본 구현**) · 각 `.spec.ts` · `tests/integration/search-permission/search-api.spec.ts` |
| Files to modify | `apps/api/src/modules/search/search.module.ts` (provider 바인딩) |
| Files NOT to modify | §0.6 공통. 특히 **PermissionService 우회 endpoint 추가 금지** — 검색 진입점은 본 API 하나뿐 |
| Verification (AND) | (기능) 매칭/비매칭/score 정렬 unit·통합 green (테스트는 scope provider를 test-allow로 대체하여 기능만 검증) · (권한·negative) 기본 deny-all 상태에서 호출 → `PERMISSION_DENIED`; 미인증 → `AUTH_REQUIRED`; scope provider가 예외 throw 시 → `PERMISSION_DENIED`(fail-closed, 빈 필터 폴백 부재를 오류 주입으로 증명) · (회귀) §0.3 전체 green |
| Edge cases | 1) `query` 없이 filters만 → 메타데이터 검색 경로로 동작 2) FTS 연산자·특수문자 입력 → `websearch_to_tsquery`로 안전 처리(원문 그대로 SQL 미삽입) 3) `pageSize` 상한 50 초과 → `VALIDATION_FAILED`, page 음수 거부 |
| Stop condition | §0.4 공통 + Freeze 문서의 filter 주입 지점 정의와 provider 인터페이스가 불일치하면 중단 |
| Escalation | §0.5 공통 |

설계 메모: 실 권한 scope는 PERMSEAR-PERMFILT-001~003이 이 provider를 구현·교체한다. 그 전까지 본 API는 **모든 호출에 대해 fail-closed**다(전체 노출 폴백 금지 — Brief §2-1·§2-4). 이 순서 덕에 "PermissionService를 우회하는 search endpoint"가 한순간도 존재하지 않는다.

#### SEARCH-FULLSEAR-TEXTQUER-TUW-002 — snippet generator

| 필드 | 내용 |
|---|---|
| ID | SEARCH-FULLSEAR-TEXTQUER-TUW-002 |
| Title | snippet generator (`ts_headline`, 권한 통과 row 한정) |
| Release | R3 |
| Module | SEARCH-FULLSEAR-TEXTQUER |
| Risk | M |
| Size | S |
| Depends_on | SEARCH-FULLSEAR-TEXTQUER-TUW-001 |
| Objective | 검색 결과 각 row에 매칭 주변 문맥 snippet(최대 200자)이 포함되되, snippet은 권한 scope를 통과한 row에 대해서만 같은 SQL 내에서 생성된다. |
| Files to create | `apps/api/src/modules/search/query/snippet-builder.ts` · `apps/api/src/modules/search/query/snippet-builder.spec.ts` |
| Files to modify | `apps/api/src/modules/search/query/search-query.builder.ts` (ts_headline 결합) |
| Files NOT to modify | §0.6 공통 |
| Verification (AND) | (기능) 매칭어 포함 snippet 생성·길이 한도 unit green · (보안) snippet 생성이 권한 필터 적용 **후** SELECT 절에서만 수행됨을 쿼리 구조 테스트로 확인(비통과 row의 본문이 어떤 중간 결과에도 미포함) · (로그 위생) snippet이 서버 로그에 미기록 assert · (회귀) §0.3 전체 green |
| Edge cases | 1) 제목만 매칭(본문 무매칭) → 본문 서두 또는 제목 기반 snippet 2) 한글 멀티바이트 경계 절단 금지(문자 단위 절단) 3) 동일 문서 다중 매칭 → 최고 밀도 구간 1개 |
| Stop condition | §0.4 공통 |
| Escalation | §0.5 공통 |

#### SEARCH-FULLSEAR-TEXTQUER-TUW-003 — highlighting

| 필드 | 내용 |
|---|---|
| ID | SEARCH-FULLSEAR-TEXTQUER-TUW-003 |
| Title | snippet 내 매칭어 highlighting (XSS-safe) |
| Release | R3 |
| Module | SEARCH-FULLSEAR-TEXTQUER |
| Risk | L |
| Size | S |
| Depends_on | SEARCH-FULLSEAR-TEXTQUER-TUW-002 |
| Objective | snippet의 매칭 구간이 escape된 텍스트 + 별도 마커(`<mark>` 또는 오프셋 배열)로 반환되어 클라이언트에서 XSS 없이 강조 렌더가 가능하다. |
| Files to create | spec 케이스 추가 |
| Files to modify | `apps/api/src/modules/search/query/snippet-builder.ts` · `packages/shared/src/search/search-query.dto.ts` (highlights 응답 타입) |
| Files NOT to modify | §0.6 공통 |
| Verification (AND) | (기능) 매칭어 강조 위치 정확성 unit green · (보안·negative) 본문에 `<script>` 포함 fixture → 응답에서 escape 처리 확인 · (회귀) §0.3 전체 green |
| Edge cases | 1) 대소문자 상이 매칭 강조 2) 중첩/인접 매칭 병합 3) 마커 문자가 원문에 이미 존재하는 경우 |
| Stop condition | §0.4 공통 |
| Escalation | §0.5 공통 |

#### SEARCH-FULLSEAR-TEXTQUER-TUW-004 — deleted document exclusion

| 필드 | 내용 |
|---|---|
| ID | SEARCH-FULLSEAR-TEXTQUER-TUW-004 |
| Title | soft-deleted 문서 제외 — 옵션으로 해제 불가한 고정 조건 |
| Release | R3 |
| Module | SEARCH-FULLSEAR-TEXTQUER |
| Risk | M |
| Size | S |
| Depends_on | SEARCH-FULLSEAR-TEXTQUER-TUW-003, DOC-DOCULIFE-LIFEMANA-TUW-001 |
| Objective | soft-deleted 문서가 어떤 query·filter·page 조합으로도 검색 결과(results/total/facets)에 나타나지 않음이 negative test로 증명된다 (R3 Gate "deleted 제외" 항목). |
| Files to create | `tests/integration/search-permission/search-deleted-exclusion.spec.ts` |
| Files to modify | `apps/api/src/modules/search/query/search-query.builder.ts` (DTO로 제어 불가능한 고정 WHERE 조건) · `apps/api/src/modules/search/index/index-sync.hook.ts` (삭제 시 인덱스 상태 동기화) |
| Files NOT to modify | §0.6 공통 + R2 lifecycle 서비스의 삭제·restore 로직 |
| Verification (AND) | (기능) 삭제→미노출, restore→재노출 통합테스트 green · (negative) DTO 어떤 값으로도 deleted 포함 불가(필터 옵션 부재를 타입+런타임 양쪽에서 확인) · (회귀) §0.3 전체 green |
| Edge cases | 1) 삭제 후 restore된 문서 → 재인덱스 후 재노출 2) family 일부 버전만 해당 상태 3) archived matter 문서 — R3에서는 검색 노출 유지하되 mutation 차단은 R2 책임(범위 명시) |
| Stop condition | §0.4 공통 |
| Escalation | §0.5 공통 |

#### SEARCH-FULLSEAR-TEXTQUER-TUW-005 — search audit event

| 필드 | 내용 |
|---|---|
| ID | SEARCH-FULLSEAR-TEXTQUER-TUW-005 |
| Title | `SEARCH_EXECUTED` audit event (query 원문 비저장) |
| Release | R3 |
| Module | SEARCH-FULLSEAR-TEXTQUER |
| Risk | M |
| Size | S |
| Depends_on | SEARCH-FULLSEAR-TEXTQUER-TUW-004, AUDIT-AUDIEVENCO-AUDILOGG-TUW-002 |
| Objective | 모든 `POST /v1/search` 실행(성공·거부 포함)이 `SEARCH_EXECUTED` audit event로 기록되며 metadata에 query 원문이 아닌 `query_hash`만 저장됨이 테스트로 증명된다. |
| Files to create | `tests/integration/audit-coverage/search-audit.spec.ts` |
| Files to modify | `apps/api/src/modules/search/search.service.ts` (audit logger 호출) · audit event 타입 레지스트리(타입 추가) |
| Files NOT to modify | §0.6 공통 — audit 모듈의 normalizer·append-only 제약은 호출만 |
| Verification (AND) | (기능) 검색 1회 → event 1건, §0.7 화이트리스트 필드 전부 충족 · (감사) 거부된 검색(`PERMISSION_DENIED`)도 기록(기존 ACCESS_DENIED와 중복 아닌 보완 — actor·query_hash 추적) · (위생·negative) audit row 전체에서 query 원문 문자열 부재 assert · (회귀) §0.3 전체 green |
| Edge cases | 1) audit 기록 실패 시 검색도 실패 처리(audit-by-default — 완료 간주 금지) 2) 빈 query(필터만) → query_hash는 정규화된 빈 값 hash 3) 동일 사용자 연속 검색 — 각각 기록(샘플링 금지) |
| Stop condition | §0.4 공통 |
| Escalation | §0.5 공통 |

### 모듈 SEARCH-PERMSEAR-PERMFILT — Permission-bound Search (R3의 심장부)

공통: 본 모듈 전 TUW는 **권한·보안 영향 TUW**다(negative test 의무). 필터는 전부 TEXTQUER-001의 `SearchPermissionScopeProvider` 주입 지점(Freeze 동결 지점)에서 SQL 쿼리 단계로 결합한다. `apps/api/src/modules/permission/**`·`ethical-wall/**`은 **호출만** 하고 수정하지 않는다. Risk=C 4건은 사람 리뷰 게이트 필수.

#### SEARCH-PERMSEAR-PERMFILT-TUW-001 — matter permission filter 주입 (C)

| 필드 | 내용 |
|---|---|
| ID | SEARCH-PERMSEAR-PERMFILT-TUW-001 |
| Title | search query에 matter permission filter 주입 — **Risk C, 사람 리뷰 게이트 필수** |
| Release | R3 |
| Module | SEARCH-PERMSEAR-PERMFILT (Permission-bound Search) |
| Risk | **C** |
| Size | M |
| Depends_on | DEVOPS-FREEZE-PERMMODEL-TUW-001, SEC-MATTPERM-ACCECONT-TUW-005, SEARCH-FULLSEAR-TEXTQUER-TUW-001 |
| Objective | 사용자가 member로서 접근 가능한 matter의 문서만 검색 결과에 포함되도록 R1 matter search permission filter(SEC-MATTPERM-ACCECONT-TUW-005)가 SQL 쿼리 단계(EXISTS/IN 서브쿼리)로 주입되고, deny-all placeholder가 실 구현으로 교체된다. |
| Files to create | `apps/api/src/modules/search/permission/matter-scope.filter.ts` · `apps/api/src/modules/search/permission/matter-scope.filter.spec.ts` · `tests/integration/search-permission/search-permission-matter.spec.ts` |
| Files to modify | `apps/api/src/modules/search/permission/search-permission-scope.provider.ts` (deny-all → matter scope 연결) · `apps/api/src/modules/search/search.module.ts` |
| Files NOT to modify | §0.6 공통 — 특히 `apps/api/src/modules/permission/**`(평가 로직 호출만), Freeze 동결 시그니처 일체 |
| Verification (AND) | (기능) member인 matter의 문서가 검색됨 · (권한·negative) ① 비member matter 문서가 results/total/facet/정렬 어디에도 0건 ② matter_members 아닌 Firm Admin도 미노출(§5-4: matter_members는 ALLOW의 필요조건) ③ 권한 평가 오류 주입 시 `PERMISSION_DENIED`(fail-closed) ④ 사후 필터링 부재 — repository 반환 이후 결과 배열 필터 코드가 없음을 코드 검사로 확인 · (감사) `SEARCH_EXECUTED` 정상 유지 · (회귀) §0.3 전체 + R1 권한 매트릭스 하네스(SEC-PERMHARN) green |
| Edge cases | 1) 검색 직전 멤버십 제거 → 쿼리타임 주입이므로 다음 쿼리부터 즉시 미노출 2) 접근 가능 matter 0건 사용자 → 빈 결과(200, 오류 아님) 3) valid_from/valid_to 경계의 한시 권한 — 만료 ALLOW 무효 |
| Stop condition | §0.4 공통 + matter filter를 쿼리 주입으로 구현할 수 없는 구조 발견(=사후 필터링만 가능) 시 즉시 중단·escalation |
| Escalation | §0.5 공통 + **사람 리뷰 게이트 필수(머지 차단)** |

#### SEARCH-PERMSEAR-PERMFILT-TUW-002 — document permission filter 주입 (C)

| 필드 | 내용 |
|---|---|
| ID | SEARCH-PERMSEAR-PERMFILT-TUW-002 |
| Title | document 단위 permission filter 주입 (confidentiality 반영) — **Risk C, 사람 리뷰 게이트 필수** |
| Release | R3 |
| Module | SEARCH-PERMSEAR-PERMFILT |
| Risk | **C** |
| Size | M |
| Depends_on | SEARCH-PERMSEAR-PERMFILT-TUW-001, SEC-DOCUPERM-ACCECONT-TUW-003 |
| Objective | matter 접근이 가능해도 문서 단위 제한(confidentiality policy, 명시 DENY)이 걸린 문서는 검색에서 제외되며, 검색 노출 집합이 `canReadDocument` 개별 평가 결과와 일치함이 동치성 테스트로 증명된다. |
| Files to create | `apps/api/src/modules/search/permission/document-scope.filter.ts` · `apps/api/src/modules/search/permission/document-scope.filter.spec.ts` · `tests/integration/search-permission/search-permission-document.spec.ts` (동치성: fixture 전 문서에 대해 `canReadDocument`=true ⟺ 검색 노출) |
| Files to modify | `apps/api/src/modules/search/permission/search-permission-scope.provider.ts` (document scope 결합) |
| Files NOT to modify | §0.6 공통 — `canReadDocument` 구현·시그니처(Freeze) 수정 금지. 검색용 SQL 술어는 permission 모듈이 노출하는 계약(허용 집합/쿼리 fragment)을 소비, 평가 규칙 재구현 금지 |
| Verification (AND) | (기능) 제한 없는 문서 정상 노출 · (권한·negative) ① 문서 단위 DENY 문서가 matter member에게도 미노출(deny-overrides) ② condition_json 해석 불가 문서 제외(fail-closed) ③ 동치성 테스트: 개별 평가와 검색 집합 불일치 0건 ④ 사후 필터링 부재 코드 검사 · (감사) 유지 · (회귀) §0.3 + 권한 하네스 green |
| Edge cases | 1) matter ALLOW + 문서 DENY → 미노출(deny-overrides) 2) 권한 만료(valid_to 경과) 직후 검색 → 미노출 3) restricted party 연계 문서(R1 PARTREGI-005 marker) — 문서 권한 규칙대로 처리, 검색에서 특별 경로 금지 |
| Stop condition | §0.4 공통 + permission 모듈이 검색용 계약(fragment/집합)을 제공하지 않으면 중단(평가 규칙을 검색 쪽에 복제하지 말 것 — drift 위험) |
| Escalation | §0.5 공통 + **사람 리뷰 게이트 필수** |

#### SEARCH-PERMSEAR-PERMFILT-TUW-003 — ethical wall filter 주입 (C)

| 필드 | 내용 |
|---|---|
| ID | SEARCH-PERMSEAR-PERMFILT-TUW-003 |
| Title | ethical wall filter 주입 — excluded 사용자에 대한 silent exclusion — **Risk C, 사람 리뷰 게이트 필수** |
| Release | R3 |
| Module | SEARCH-PERMSEAR-PERMFILT |
| Risk | **C** |
| Size | M |
| Depends_on | SEARCH-PERMSEAR-PERMFILT-TUW-002, SEC-ETHIWALL-WALLENFO-TUW-002 |
| Objective | wall에서 excluded인 사용자(직접 또는 group 경유)에게 wall 대상 matter/문서가 검색 결과·카운트·facet 어디에도 나타나지 않으며, 오류(`ETHICAL_WALL_BLOCKED`)조차 반환하지 않는 silent exclusion이 쿼리 주입으로 구현된다. |
| Files to create | `apps/api/src/modules/search/permission/wall-scope.filter.ts` · `apps/api/src/modules/search/permission/wall-scope.filter.spec.ts` · `tests/integration/search-permission/search-wall.spec.ts` |
| Files to modify | `apps/api/src/modules/search/permission/search-permission-scope.provider.ts` (wall scope 결합 — 평가 순서: wall DENY > 명시 DENY > 명시 ALLOW, §5-4) |
| Files NOT to modify | §0.6 공통 — `ethical_wall_memberships` schema(R1, Freeze)·wall 평가 로직 수정 금지 |
| Verification (AND) | (기능) wall 무관 사용자 정상 검색 · (권한·negative) ① excluded 사용자: 대상 문서 0건 + total/facet 무반영 + 응답에 오류·차단 표식 없음 ② subject_type=group 경유 excluded 동일 차단 ③ wall 평가 불가 시 `PERMISSION_DENIED`(fail-closed) ④ 사후 필터링 부재 코드 검사 · (감사) `SEARCH_EXECUTED` 유지(wall 차단 사실을 metadata에 기록하되 대상 문서 ID 미기록) · (회귀) §0.3 + 권한 하네스 green |
| Edge cases | 1) 동일 사용자가 wall A insider + wall B excluded → B 대상만 차단 2) wall 생성 직후 첫 쿼리부터 반영(쿼리타임 주입 — 인덱스 재빌드 불요) 3) insider이면서 해당 matter 비member → matter filter가 우선 차단(필터 교집합) |
| Stop condition | §0.4 공통 |
| Escalation | §0.5 공통 + **사람 리뷰 게이트 필수** |

#### SEARCH-PERMSEAR-PERMFILT-TUW-004 — permission filter regression test + SLA

| 필드 | 내용 |
|---|---|
| ID | SEARCH-PERMSEAR-PERMFILT-TUW-004 |
| Title | 권한 필터 회귀 테스트(role 7 × wall 상태 × 검색) + 권한 변경 반영 SLA 정의·측정 |
| Release | R3 |
| Module | SEARCH-PERMSEAR-PERMFILT |
| Risk | H |
| Size | M |
| Depends_on | SEARCH-PERMSEAR-PERMFILT-TUW-003, SEC-PERMHARN-MATRIX-TUW-001 |
| Objective | R1 권한 매트릭스 하네스가 검색 액션으로 확장되어 role 7종 × wall 상태 × 권한 조합별 검색 노출 기대표가 100% 통과하고, 권한 변경→검색 반영 SLA(쿼리타임 주입=즉시, 인덱스 메타 갱신=INDE-003 SLA)가 정의·측정되어 CI gate에 연결된다. |
| Files to create | `tests/integration/search-permission/search-permission-regression.spec.ts` (expected 매트릭스 데이터 포함) · `tests/integration/search-permission/search-permission-sla.spec.ts` |
| Files to modify | SEC-PERMHARN 하네스 정의 파일(검색 action 행 추가 — 기존 행 변경 금지) · `infra/ci/` 파이프라인에 suite 추가 |
| Files NOT to modify | §0.6 공통 + 기존 하네스 expected 값(변경 필요 발견 = Freeze 위반 신호 → 중단) |
| Verification (AND) | (기능) 매트릭스 전 조합 green(허용 케이스 노출 + 차단 케이스 negative 모두 expected와 일치) · (권한·negative) 멤버십 제거/권한 만료/ wall 추가 각각 직후 쿼리에서 즉시 미노출 — SLA 측정값 기록(Gate 증빙) · (회귀) §0.3 전체 green + CI에서 suite 필수화 확인 |
| Edge cases | 1) External User role — R3에 외부 기능이 없으므로 모든 검색 차단 expected 2) Knowledge Manager — 권한 매트릭스(21번 문서) 정의대로만, 추론 금지 3) 동일 사용자 복수 role 보유 시 deny-overrides 우선 |
| Stop condition | §0.4 공통 + 21번 권한 매트릭스에 검색 액션 기대값이 미정의된 조합 발견 시 중단(추측으로 채우지 말 것) |
| Escalation | §0.5 공통 |

#### SEARCH-PERMSEAR-PERMFILT-TUW-005 — metadata leakage test (C)

| 필드 | 내용 |
|---|---|
| ID | SEARCH-PERMSEAR-PERMFILT-TUW-005 |
| Title | **metadata leakage test — 비인가 문서의 title/snippet/metadata/카운트 전면 비노출 증명 (C, 사람 리뷰 게이트 필수)** |
| Release | R3 |
| Module | SEARCH-PERMSEAR-PERMFILT |
| Risk | **C** |
| Size | M |
| Depends_on | SEARCH-PERMSEAR-PERMFILT-TUW-004 |
| Objective | 비인가 문서의 정보가 검색 응답의 **어떤 채널**(title, snippet, highlights, metadata 필드, total 카운트, facet 카운트, 페이지네이션 수치, 정렬 부수효과, 오류 메시지)로도 누출되지 않음이 전용 leakage corpus로 증명된다 — R3 Gate 핵심 통과 조건. |
| Files to create | `tests/integration/metadata-leakage/search-metadata-leakage.spec.ts` · `tests/fixtures/search/leakage-corpus/` (인가/비인가 쌍 문서 — 동일 키워드·식별 가능한 고유 토큰 포함, 비식별 데이터만) |
| Files to modify | `infra/ci/` 파이프라인(본 테스트를 R3 필수 gate suite로 등록) |
| Files NOT to modify | §0.6 공통 — 본 TUW는 **테스트 전용**: 프로덕션 코드 수정 필요 발견 시 해당 결함을 PERMFILT-001~003에 귀속시켜 중단·escalation (테스트를 통과시키기 위한 코드 수정과 테스트 완화 금지) |
| Verification (AND) | (기능=보안) ① 비인가 문서만 매칭되는 쿼리 → `total=0`·빈 results·facet 무반영 ② 혼합 매칭(인가 5+비인가 5) → `total=5` ③ 응답 JSON 전체 직렬화 문자열에서 비인가 문서의 고유 토큰·title·documentId·hash **부재 grep assert** ④ page 경계에서 비인가 row로 인한 빈 페이지/수치 불일치 없음 ⑤ 오류 응답에 자원 존재 단서 없음(safe denied message와 일관) · (negative) wall excluded·비member·문서 DENY 세 종류 비인가 각각 검증 · (회귀) §0.3 전체 green |
| Edge cases | 1) 비인가 문서가 인가 문서와 동일 family(버전 관계) — family 메타로도 누설 금지 2) facet의 documentType 카운트가 비인가 문서 포함 여부로 달라지는 경우 — 권한 필터 후 집계만 허용 3) 타이밍 부수채널은 본 TUW 범위 외(보고서에 명시, R5 보안 강화로 이관) |
| Stop condition | §0.4 공통 + 누출 발견 시: 테스트 완화 금지, 원인 TUW 결함으로 기록 후 중단 |
| Escalation | §0.5 공통 + **사람 리뷰 게이트 필수** — leakage 발견 이력은 `docs/ledger/execution.md`와 R3 Gate 증빙에 기재 |

### 모듈 SEC-ETHIWALL-WALLENFO — Ethical Wall (R3 분량: TUW-005 1건)

#### SEC-ETHIWALL-WALLENFO-TUW-005 — wall enforcement in search 통합 검증 (C)

| 필드 | 내용 |
|---|---|
| ID | SEC-ETHIWALL-WALLENFO-TUW-005 |
| Title | **wall enforcement in search — 양방향 상호 격리 통합 검증 (C, 사람 리뷰 게이트 필수)** — PERMFILT-003과 통합 검증 |
| Release | R3 |
| Module | SEC-ETHIWALL-WALLENFO (Ethical Wall Enforcement) |
| Risk | **C** |
| Size | M |
| Depends_on | SEARCH-PERMSEAR-PERMFILT-TUW-003 |
| Objective | wall 양측(insider/excluded) 사용자가 상호 격리됨 — 각 측이 상대측 wall 대상 자료를 검색·카운트·facet 어디서도 볼 수 없음 — 이 권한 매트릭스 하네스의 wall 시나리오로 증명되고 R3 Gate 증빙으로 기록된다. |
| Files to create | `tests/integration/search-permission/search-wall-bidirectional.spec.ts` (시나리오: wall W가 matter M1 격리, user A=insider(M1), user B=excluded → B는 M1 자료 전면 비노출; 동시에 A는 자신이 excluded인 다른 wall 대상 비노출) |
| Files to modify | SEC-PERMHARN 하네스에 wall 양방향 시나리오 행 추가(기존 행 변경 금지) · `infra/ci/` gate suite 등록 |
| Files NOT to modify | §0.6 공통 + `apps/api/src/modules/ethical-wall/**`(검증 전용 TUW — 프로덕션 코드 수정 발견 시 PERMFILT-003 결함으로 귀속·중단) |
| Verification (AND) | (기능=보안) 양방향 시나리오 전부 green · (권한·negative) ① excluded→대상 0건+오류 비반환(silent) ② group 경유 excluded 동일 ③ membership insider 추가 직후 쿼리부터 노출, excluded 추가 직후 쿼리부터 차단(반영 SLA=즉시 확인) · (감사) wall 관련 기존 audit(ETHICAL_WALL_APPLIED, R1) 회귀 무손상 · (회귀) §0.3 + 권한 하네스 100% green |
| Edge cases | 1) wall 해제(비활성화) 후 검색 → 즉시 재노출(권한 필터 정상 범위 내) 2) 한 matter에 복수 wall 적용 → 합집합 차단 3) wall 대상 matter의 문서가 다른 matter로 이동 → 이동 후 기준으로 평가(INDE-003 동기화 전제) |
| Stop condition | §0.4 공통 |
| Escalation | §0.5 공통 + **사람 리뷰 게이트 필수** |

### 모듈 SEARCH-UI-PAGE — 검색 UI (Next.js)

#### SEARCH-UI-PAGE-TUW-001 — 검색 페이지

| 필드 | 내용 |
|---|---|
| ID | SEARCH-UI-PAGE-TUW-001 |
| Title | 검색 페이지 (`/search`) — 검색바·결과 목록·페이지네이션 |
| Release | R3 |
| Module | SEARCH-UI-PAGE (Search UI) |
| Risk | M |
| Size | M |
| Depends_on | SEARCH-FULLSEAR-TEXTQUER-TUW-002, CORE-FESHELL-APPSHELL-TUW-003, SEARCH-PERMSEAR-PERMFILT-TUW-001 |
| Objective | 인증 사용자가 `/search`에서 검색어 입력→`POST /v1/search` 호출→결과 목록·페이지네이션을 사용할 수 있고, 미인증 접근은 로그인으로 리다이렉트된다. |
| Files to create | `apps/web/src/app/search/page.tsx` · `apps/web/src/components/search/search-bar.tsx` · `apps/web/src/components/search/search-results.tsx` · `apps/web/src/lib/api/search.ts` · 컴포넌트 테스트 파일 |
| Files to modify | 내비게이션 컴포넌트(검색 메뉴 항목 추가) |
| Files NOT to modify | §0.6 공통 + auth guard 구현(적용만) |
| Verification (AND) | (기능) 입력→결과 렌더·빈 결과 상태·페이지네이션 동작 컴포넌트/통합 테스트 green · (권한·negative) 미인증 접근 → 로그인 리다이렉트; API `PERMISSION_DENIED` 시 일반 오류 메시지(내부 사유·자원 단서 미노출) · (회귀) §0.3 전체 green |
| Edge cases | 1) 빈 검색어 제출 → 클라이언트 검증(요청 미발생) 2) 로딩 중 중복 제출 방지 3) URL query param 동기화(새로고침 시 검색 상태 복원) |
| Stop condition | §0.4 공통 |
| Escalation | §0.5 공통 |

#### SEARCH-UI-PAGE-TUW-002 — facet

| 필드 | 내용 |
|---|---|
| ID | SEARCH-UI-PAGE-TUW-002 |
| Title | facet 패널 (matter/client/documentType/dateRange/versionStatus — 서버 집계) |
| Release | R3 |
| Module | SEARCH-UI-PAGE |
| Risk | M |
| Size | M |
| Depends_on | SEARCH-UI-PAGE-TUW-001, SEARCH-METASEAR-FILT-TUW-005 |
| Objective | facet 카운트가 **권한 필터 적용 후** 서버에서 집계되어 표시되고, facet 선택이 filters로 재검색을 트리거함이 테스트로 증명된다. |
| Files to create | `apps/web/src/components/search/search-facets.tsx` · 테스트 파일 |
| Files to modify | `apps/api/src/modules/search/search.service.ts` + `query/search-query.builder.ts` (facet 집계 — 권한 scope 적용된 동일 CTE에서 GROUP BY) · `packages/shared/src/search/search-query.dto.ts` (facets 응답 타입) |
| Files NOT to modify | §0.6 공통 |
| Verification (AND) | (기능) facet 선택→filters 반영→결과 갱신 green · (권한·negative) 비인가 문서가 facet 카운트에 미반영(PERMFILT-005 corpus 재사용 통합테스트) — 클라이언트 측 집계 코드 부재 확인 · (회귀) §0.3 전체 green |
| Edge cases | 1) facet 값 0건 항목 숨김 2) 다중 facet 동시 선택(AND) 3) facet 카운트와 total 불일치 금지(동일 쿼리·동일 scope에서 산출) |
| Stop condition | §0.4 공통 |
| Escalation | §0.5 공통 |

#### SEARCH-UI-PAGE-TUW-003 — result card

| 필드 | 내용 |
|---|---|
| ID | SEARCH-UI-PAGE-TUW-003 |
| Title | result card — 권한 내 자료만 렌더, AI 표시 일절 없음 |
| Release | R3 |
| Module | SEARCH-UI-PAGE |
| Risk | M |
| Size | S |
| Depends_on | SEARCH-UI-PAGE-TUW-002, SEARCH-PERMSEAR-PERMFILT-TUW-002 |
| Objective | result card가 서버 응답 필드(title/snippet/highlight/matter·client 참조/documentType/updatedAt)만 렌더하고(추가 fetch 금지), AI 관련 표시·버튼·문구가 일절 없음이 테스트로 증명된다. |
| Files to create | `apps/web/src/components/search/result-card.tsx` · `apps/web/src/components/search/result-card.spec.tsx` |
| Files to modify | `apps/web/src/components/search/search-results.tsx` (card 적용) |
| Files NOT to modify | §0.6 공통 |
| Verification (AND) | (기능) 필드 렌더 스냅샷·highlight `<mark>` XSS-safe 렌더 green · (정책) 컴포넌트 트리·문자열에 AI/semantic/추천 관련 표기 부재 assert(R6 전 금지 — Brief §2 절대 금지) · (보안) card가 응답 외 데이터를 추가 fetch하지 않음(권한 우회 경로 차단) · (회귀) §0.3 전체 green |
| Edge cases | 1) 제목 없는 문서 → 파일명 fallback 2) 긴 제목/snippet truncation(한글 경계 보존) 3) 클릭 시 문서 상세 이동 — 상세 접근은 R2 권한 검사에 위임(card에서 사전 판단 금지) |
| Stop condition | §0.4 공통 |
| Escalation | §0.5 공통 |

### 모듈 SEARCH-KOREAN-EVAL — 한국어 검색 품질 평가 (AI 기능 아님 — 통계 측정)

#### SEARCH-KOREAN-EVAL-TUW-001 — 한국어 토큰화 평가

| 필드 | 내용 |
|---|---|
| ID | SEARCH-KOREAN-EVAL-TUW-001 |
| Title | PG FTS 한국어 토큰화 한계 측정 — 법률용어 fixture 30건 |
| Release | R3 |
| Module | SEARCH-KOREAN-EVAL (Korean Search Evaluation) |
| Risk | M |
| Size | M |
| Depends_on | SEARCH-FULLSEAR-TEXTQUER-TUW-001 |
| Objective | 법률용어 fixture 30건(용어·변형·기대 매칭 정의)에 대한 PG FTS(`simple` config) recall/precision 측정이 재현 가능한 스크립트로 산출되어 보고서에 수치로 기록된다. |
| Files to create | `tests/fixtures/search/korean-legal-terms.json` (30건: 표제어, 조사 결합형, 복합명사, 띄어쓰기 변형, 한자 병기, 기대 매칭 여부) · `tools/search-eval/run-korean-eval.ts` · `tools/search-eval/run-korean-eval.spec.ts` · `docs/reports/R3_korean_tokenization_eval.md` |
| Files to modify | 루트 `package.json` (script `search:eval:korean` 추가) |
| Files NOT to modify | §0.6 공통 + 검색 프로덕션 코드(측정 전용 — 튜닝은 결과 보고 후 별도 결정) |
| Verification (AND) | (기능) 스크립트 2회 실행 시 동일 수치 재현, 보고서에 recall/false-positive율·실패 패턴 분류(조사, 복합명사 분해, 부분일치) 기록 · (정책) 형태소 분석기 등 신규 의존성 도입 금지(측정만 — 도입 여부는 EVAL-002 판단 입력) · (회귀) §0.3 전체 green |
| Edge cases | 1) 동일 표기 이의어(예: '대주' 임대인/금전대주) — false-positive로 분류 2) 영문 혼용 법률용어(예: 'M&A 계약') 3) 한자 병기 표제어 매칭 |
| Stop condition | §0.4 공통 + fixture 30건의 기대 매칭 정의에 법률 도메인 판단이 필요한 미결 항목 발견 시 사람 확인 요청 |
| Escalation | §0.5 공통 |

#### SEARCH-KOREAN-EVAL-TUW-002 — OpenSearch 전환 판단 보고서

| 필드 | 내용 |
|---|---|
| ID | SEARCH-KOREAN-EVAL-TUW-002 |
| Title | OpenSearch 전환 판단 보고서 작성 + ADR-006 갱신 (DEC-05 R3 Gate 판단 입력) |
| Release | R3 |
| Module | SEARCH-KOREAN-EVAL |
| Risk | M |
| Size | S |
| Depends_on | SEARCH-KOREAN-EVAL-TUW-001 |
| Objective | EVAL-001 측정치를 근거로 "PG FTS 유지 vs OpenSearch 전환" 권고안(비용·운영·권한 필터 주입 호환성 분석 포함)이 ADR-006 갱신안과 함께 산출되어 사람 승인 대기 상태로 기록된다. |
| Files to create | `docs/reports/R3_opensearch_decision_proposal.md` |
| Files to modify | `docs/adr/` 내 ADR-006(검색엔진 결정 — 01번 문서의 명칭 기준) 상태 갱신(Proposed 추가안 — 기존 결정 본문 삭제 금지, 이력 보존) · `docs/ledger/decision.md` (append 1줄) |
| Files NOT to modify | §0.6 공통 + 검색 구현 코드 일체(전환 결정 전 코드 변경 금지), `docs/adr/`의 다른 ADR |
| Verification (AND) | (기능=문서 품질) 보고서가 ①측정 수치 인용 ②전환/유지 각각의 권한 필터 주입 설계 영향(Permission-before-search가 OpenSearch에서도 쿼리 단계 주입 가능한지) ③권고안·전환 시 R4 이후 마이그레이션 경로를 포함 · (절차) decision ledger 기재 + 승인 주체(사람) 명시 · (회귀) §0.3 green(문서 TUW이나 lint 등 무손상 확인) |
| Edge cases | 1) 측정 결과가 경계선일 때 — 권고 유보 + 추가 측정 항목 제안으로 처리(임의 결정 금지) 2) OpenSearch 전환 권고 시에도 R3 산출물은 PG FTS로 Gate 통과(전환은 차기 release 작업) |
| Stop condition | §0.4 공통 |
| Escalation | §0.5 공통 + **최종 전환 결정은 사람 승인 사항** — Codex는 권고안까지만 |

### 모듈 DEVOPS-EVALSET-V0 — 평가셋 v0 (DEC-16; AI 기능 아님 — 데이터 준비)

#### DEVOPS-EVALSET-V0-TUW-001 — 평가셋 v0 수집 절차 문서

| 필드 | 내용 |
|---|---|
| ID | DEVOPS-EVALSET-V0-TUW-001 |
| Title | 평가셋 v0 수집 절차 문서 — 종결 Matter 비식별화 계약서 20~50건 (DEC-16) |
| Release | R3 |
| Module | DEVOPS-EVALSET-V0 (Evaluation Set v0) |
| Risk | M |
| Size | S |
| Depends_on | MATTER-MATTLIFE-STATENGI-TUW-003, DOC-DOCUUPLO-UPLOAPI-TUW-001 (release 전제: R2 Gate 통과 — Brief §7 명시) |
| Objective | 종결 Matter 계약서 20~50건의 수집·비식별화·검수·반입 절차가 단독 실행 가능한 문서로 작성되어 사람 검수자가 추가 설명 없이 수행할 수 있다. |
| Files to create | `docs/evalset/Evaluation_Set_v0_Collection_Procedure.md` |
| Files to modify | (없음) |
| Files NOT to modify | §0.6 공통 + 코드 일체(문서 전용 TUW) |
| Verification (AND) | (기능=문서 완결성) 문서가 ①대상 선정 기준(종결 Matter, 계약서, 20~50건) ②비식별화 규칙 — DLP 식별자 5종(주민/여권/외국인등록/계좌/카드, DEC-13) + 당사자 성명·회사명·주소·서명 치환표 ③2인 검수 규칙(비식별 수행자 ≠ 검수자) ④반입 포맷(`tests/fixtures/evalset-v0/` 구조, 파일명 규약, 원본 반입 절대 금지) ⑤폐기·격리 절차(비식별 실패본)를 모두 포함 · (정합) Brief DEC-16·DEC-13과 충돌 0건 교차 확인 · (회귀) §0.3 green |
| Edge cases | 1) 20건 미달 시 절차 — 진행 가능하되 R3 Gate 체크리스트에 미달 사유 기재 2) 스캔본(이미지 PDF) 계약서 — 비식별화가 텍스트 치환으로 불가능한 경우 제외 규칙 3) 외국어 계약서 포함 여부 — v0는 한국어 한정 명시 |
| Stop condition | §0.4 공통 + 비식별화 규칙 중 법무 판단 필요 항목(예: 사건 특정 가능 정황 정보) 발견 시 사람 확인 |
| Escalation | §0.5 공통 |

#### DEVOPS-EVALSET-V0-TUW-002 — evaluation_cases 테이블 + 적재 스크립트

| 필드 | 내용 |
|---|---|
| ID | DEVOPS-EVALSET-V0-TUW-002 |
| Title | `evaluation_cases` 테이블(tenant_id+RLS) + 적재 스크립트(식별자 패턴 위생 검사) |
| Release | R3 |
| Module | DEVOPS-EVALSET-V0 |
| Risk | M |
| Size | M |
| Depends_on | DEVOPS-EVALSET-V0-TUW-001, CORE-DATACORE-MIGR-TUW-005 |
| Objective | `evaluation_cases` 테이블이 `tenant_id NOT NULL`+RLS로 생성되고(Brief §5 C-7), 적재 스크립트가 비식별 fixture를 멱등 적재하되 핵심 식별자 패턴(주민번호 등) 발견 시 적재를 거부한다. |
| Files to create | `db/migrations/0302_create_evaluation_cases.sql` · `tools/evalset/load-evaluation-cases.ts` · `tools/evalset/identifier-pattern.check.ts` (정규식 위생 검사 — **DLP 기능 아님**, 적재 전 데이터 위생) · `tools/evalset/load-evaluation-cases.spec.ts` · `tests/fixtures/evalset-v0/README.md` (포맷 정의) |
| Files to modify | 루트 `package.json` (script `evalset:load` 추가) |
| Files NOT to modify | §0.6 공통 + `packages/ai/**` (평가셋은 데이터 준비일 뿐 — AI 코드 연결 금지, 사용은 R6) |
| Verification (AND) | (기능) migrate/rollback 왕복 green, fixture 적재→row 수 일치, 재실행 멱등(중복 0) · (격리·negative) RLS — 타 tenant 컨텍스트 조회 0건 · (위생·negative) 주민번호 패턴 포함 오염 fixture 적재 시도 → 거부 + 어떤 row도 미적재(전체 롤백) · (회귀) §0.3 전체 green |
| Edge cases | 1) `expected_refs`가 존재하지 않는 문서 참조 → 적재 실패(정합성 검증) 2) 20건 미만 적재 → 경고 출력 후 진행(Gate 체크리스트에서 확인) 3) 동일 case 갱신 적재 → upsert(이력 컬럼 updated_at) |
| Stop condition | §0.4 공통 + fixture에 비식별 미완료 의심 데이터 발견 시 즉시 중단·격리(EVALSET-V0-TUW-001 절차 §폐기 적용) |
| Escalation | §0.5 공통 |

테이블 명세: `evaluation_cases(id, tenant_id NOT NULL, case_no, source_doc_ref, case_type, query_text, expected_refs jsonb, deidentified boolean NOT NULL DEFAULT true, notes, created_at, updated_at)` — snake_case 복수형, RLS 정책 동반.

---

## 3. 제외 확인 — semantic/vector 검색 TUW 부재 (C-5)

원천 13번의 `SEARCH-SEMASEAR-VECT-TUW-001~005`(embedding job, vector index, similarity API, hybrid combiner, semantic permission filter)는 **Brief C-5 보정에 따라 R6로 이관**되었으며 본 백로그에 존재하지 않는다. R3에서:

- `embeddings` 테이블 생성 금지(예약 스키마 문서화만 — Brief §5-7)
- pgvector extension 활성화 금지
- 코드·의존성·UI 어디에도 semantic/vector/embedding/similarity 도입 금지
- `DEVOPS-BACKLOG-VALIDATE-TUW-001`의 release 규칙(AI<R6 금지)이 CI에서 이를 차단하며, R3 Gate에서 부재를 재확인한다 (§4 체크리스트 G-12)

---

## 4. R3 Gate 체크리스트 — Permission-bound Search Gate (Brief §7 R3 Gate 확장)

통과 기준: **전 항목 AND**. 하나라도 미충족 시 R4 PACK 착수 금지 (Brief §9-4). 증빙은 `docs/ledger/execution.md` 및 CI 아티팩트로 남긴다.

| # | 항목 | 판정 기준 | 근거 TUW |
|---|---|---|---|
| G-1 | **비인가 문서 전면 비노출** | metadata leakage test green — title/snippet/highlights/metadata/total/facet/페이지네이션/오류 메시지 전 채널에서 비인가 문서 단서 0건 (비member·문서 DENY·wall excluded 3종 각각) | PERMFILT-005 |
| G-2 | **wall 양측 상호 격리** | 양방향 시나리오 테스트 green + silent exclusion(오류 비반환) 확인 | PERMFILT-003, WALLENFO-005 |
| G-3 | **deleted·superseded 제외** | soft-deleted는 어떤 옵션으로도 미노출(고정 조건), superseded는 기본 제외·명시 옵션만 포함 | TEXTQUER-004, FILT-005 |
| G-4 | **인덱스 cross-tenant 차단** | `document_search_index` RLS negative test green + 검색 API 타 tenant 자료 0건 + reindex 타 tenant 거부 | INDE-001, INDE-002, INDE-004 |
| G-5 | **권한 변경→반영 SLA 정의·측정** | 권한·멤버십·wall 변경은 쿼리타임 즉시 반영 증명 + 메타데이터→인덱스 갱신 p95 측정치가 정의 SLA 이내(수치 기록) | PERMFILT-004, INDE-003 |
| G-6 | **검색 audit 100%** | 모든 검색 실행(거부 포함)에 `SEARCH_EXECUTED` 기록, §0.7 화이트리스트 충족, query 원문 비저장 assert green, reindex는 `SEARCH_REINDEX_REQUESTED` 기록 | TEXTQUER-005, INDE-004 |
| G-7 | **사후 필터링 우회 0건** | 권한 필터가 전부 SQL 쿼리 단계 주입임을 코드 리뷰+정적 점검(repository 반환 후 결과 배열 권한 필터 패턴 부재)으로 확인. **우회 발견 = Gate 즉시 불통과** | PERMFILT-001~003 |
| G-8 | **fail-closed 증명** | scope provider 미주입/오류 주입 시 `PERMISSION_DENIED` — 전체 노출 폴백 부재 오류 주입 테스트 green | TEXTQUER-001, PERMFILT-001 |
| G-9 | **권한 매트릭스 하네스 확장 100%** | role 7 × 검색 action × wall 상태 expected 전 조합 green + CI 필수 suite 등재 | PERMFILT-004 |
| G-10 | **한국어 검색 평가 + OpenSearch 판단** | 측정 보고서(수치 재현 가능) + ADR-006 갱신안 + 사람 승인 결정 기록 (DEC-05: "R3 Gate에서 OpenSearch 전환 판단") | KOREAN-EVAL-001~002 |
| G-11 | **평가셋 v0 적재** | 절차 문서 승인 + `evaluation_cases` 20~50건 적재(미달 시 사유 기재) + 식별자 패턴 위생 검사 green + RLS 확인 (DEC-16) | EVALSET-V0-001~002 |
| G-12 | **semantic/vector 부재** | pgvector·embeddings 테이블·semantic 코드/의존성/UI 표기 부재를 backlog validator + grep 점검으로 확인 (C-5, Brief §2 절대 금지) | §3, DEVOPS-BACKLOG-VALIDATE-TUW-001 |
| G-13 | **회귀 무손상** | R0~R2 전체 suite + R2 Gate 항목(업로드/다운로드/미리보기 권한, hold 차단, audit 5종) 재실행 green | 전체 |
| G-14 | **Risk=C 사람 리뷰 완료** | PERMFILT-001/002/003/005, WALLENFO-005 — 5건 모두 사람 리뷰 승인 기록 존재 (Brief §6.3) | 해당 5건 |
| G-15 | **레저 기록 완결** | 전 PACK의 `docs/ledger/execution.md` 기록 + escalation 잔여 미해결 0건 | 전체 |

Gate 판정 주체: 사람(PM + 보안 검토자). Codex는 증빙 패키지를 준비하고 자체 판정하지 않는다.

---

*문서 끝. 본 문서는 Brief §7 R3 인벤토리 28 TUW를 1:1로 상세화했으며 임의 추가·삭제가 없다. R4 이후 TUW 상세화는 R3 Gate 통과 후 44번 문서 기준으로 진행한다.*
