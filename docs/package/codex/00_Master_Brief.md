# 00. Master Brief — AMIC Vault 실행 패키지 (Codex 개발팀용)

버전: 1.0 | 작성일: 2026-06-11 | 상태: **Normative (규범)** — 이 패키지 내 모든 문서와 충돌 시 본 문서가 우선한다.

## 0. 이 패키지의 전제

1. **구현 주체는 Codex(코딩 에이전트)다.** 모든 작업 단위(TUW)는 Codex가 대화 컨텍스트 없이 이 패키지만 읽고 실행할 수 있도록 자기완결적으로 기술한다.
2. 원천 사양은 `../vault_dev_package/`(21개 문서, 불변 보존)와 `../Law_Firm_Vault_System_장기개발_사양명세서.docx`다. 본 패키지는 그 사양의 **검증·보정·실행 변환본**이며, 원천과 충돌하는 부분은 본 패키지가 우선한다(보정 근거는 §3).
3. 코드 저장소는 신규 생성한다(저장소명 `amic-vault`). 이 폴더(`AMIC Vault/`)는 사양 보관소이며 코드를 두지 않는다.

## 1. 확정 결정 (Adopted Decisions) — 더 이상 논의 대상이 아님

| ID | 결정 | 확정값 |
|---|---|---|
| DEC-01 | 배포방식 | 국내 리전 클라우드(private 구성), 컨테이너 기반으로 on-prem 이식성 유지 |
| DEC-02 | DB 격리 | **Shared DB + `tenant_id NOT NULL` + PostgreSQL RLS.** schema-per-tenant 확장 경로는 설계 시 차단 금지 |
| DEC-03 | 백엔드 | **NestJS (TypeScript), pnpm 모노레포(turborepo)** |
| DEC-04 | 프론트엔드 | **Next.js + React + Tailwind + shadcn/ui** |
| DEC-05 | DB/검색/벡터 | **PostgreSQL 16.** 전문검색은 R3까지 PG FTS → R3 Gate에서 OpenSearch 전환 판단. 벡터는 pgvector(R6). Neo4j는 R7 전 도입 금지 |
| DEC-06 | Ingestion worker | **Python 3.12 (FastAPI worker)** — OCR/HWPX/DOCX 파싱 전담 |
| DEC-07 | Object storage | S3 호환(개발: MinIO). 경로에 tenant prefix 필수, at-rest 암호화 |
| DEC-08 | Queue | **pg-boss(PostgreSQL 기반)** 로 시작. Kafka/Redis는 R4 이후 재평가 |
| DEC-09 | 인증 | 자체 세션 + MFA flag(R1에서 TOTP). SSO/SAML은 R13 |
| DEC-10 | HWP/HWPX | R2는 **HWPX(XML) 텍스트 추출만**. HWP 5.0 바이너리는 R4~R6 별도 트랙 |
| DEC-11 | 외부 AI 모델 | R6 출시 시점 **외부모델 전면 차단(Gemma 로컬 only)**. 승인 게이트 구축 후 단계 개방 |
| DEC-12 | 보존기간 | 법률검토 전까지 **자동삭제 없음·무기한 보존** 기본값. retention 필드만 R2에 준비 |
| DEC-13 | PII 암호화 | DLP 탐지 대상 식별자(주민/여권/외국인등록/계좌/카드번호)는 컬럼 수준 암호화, 나머지는 at-rest |
| DEC-14 | API versioning | URL prefix `/v1` |
| DEC-15 | 권한 taxonomy | 원천 08번 §3의 **role 7종을 v1로 채택**(Firm Admin, Security Admin, Matter Owner, Matter Member, Limited Reviewer, Knowledge Manager, External User) + practice_group 속성 1개. ABAC 일반화는 R5 |
| DEC-16 | 평가셋 | 종결 Matter 비식별화 계약서 20~50건으로 v0 시작(R3), R6 게이트 서브셋 ~1,000건 |
| DEC-17 | MVP 정의 | **MVP = R6 AI Governance Gate 통과 시점. 외부공유·VDR·Closing Binder·보존자동화·SSO 제외** |
| DEC-18 | Shadow pilot | R6 정식 공개 전 2~4주 내부 변호사 한정 파일럿 운영 (채택) |

## 2. 불변 원칙 (Constitution) — 모든 TUW에 적용

1. **Permission-before-search** — 검색은 쿼리 단계에서 권한 필터 주입. 사후 필터링으로 대체 금지.
2. **Permission-before-AI** — AI는 권한·윤리장벽·aiAllowed를 통과한 자료만 검색·인용.
3. **Audit-by-default** — 문서/권한/외부/AI 행위는 audit event 없이는 완료로 간주하지 않는다.
4. **Fail-closed** — 권한 판단 불가·오류·정책 미해석 시 무조건 차단(`PERMISSION_DENIED`).
5. **Immutable original** — 원본 파일 덮어쓰기 금지. 버전은 항상 신규 FileObject.
6. **No silent external sharing** — 외부 공유는 R11 전 어떤 형태로도 구현 금지.
7. **Sensitive data is not logged** — 로그·audit metadata에 문서 본문·기밀 원문 기록 금지(참조 ID/hash만).

### 절대 금지 (Codex가 위반 시 작업 즉시 중단)

- AI 기능 일체를 R6 전에 구현 (R2의 `ai_allowed`/`ai_policy_id` **스키마 컬럼**은 예외 — 기본값 거부, 기능 아님)
- VDR/External Portal/secure link/외부 사용자 — R11 전 금지
- hard delete — legal hold 인터페이스(R2) + Records(R12) 전 금지
- 벡터/의미검색 — R6 전 금지
- Neo4j/GraphSync — R7 전 금지
- PermissionService를 우회하는 document/search endpoint
- `audit_events`에 UPDATE/DELETE 가능한 경로
- 사양·본 패키지에 없는 외부 API/모델 호출 추가

## 3. 원천 사양 대비 보정사항 (근거: 적대적 검증 완료)

| # | 보정 | 원천의 문제 |
|---|---|---|
| C-1 | **Permission Model Freeze 마일스톤을 R1 종료에 신설.** Freeze 없이 R3 착수 금지 | 12번 §6 "권한모델 확정 전 검색 금지"의 '확정' 시점 미정의 |
| C-2 | **EthicalWall schema/membership/create API를 R1로 이동**, search enforcement는 R3, break-glass·고도화만 R5 잔류 | R3의 wall filter TUW가 R5 소속 schema에 의존(역전) |
| C-3 | **R2에 legal hold 인터페이스 계약 신설** (hold flag + delete precondition check만) | R2 delete hook이 R12 LegalHold schema에 의존(역전) |
| C-4 | **R4 진입조건에 핵심 DLP rule 4건(SEC-DLP-SENSDATADE-TUW-001~004: 주민번호·계좌·이메일/전화 탐지 + finding schema) 완료 포함** | R4 Email이 R5 DLP보다 선행하여 첨부 무검사 노출 |
| C-5 | **Semantic search(SEARCH-SEMASEAR-VECT-*)를 R3에서 R6로 이동** | 벡터 인덱스 권한 메타 동기화 계약이 선행 필요 |
| C-6 | **R9의 P13 사용은 내부 전용 data room mapping으로 한정** | Critical pillar P13이 R11 Gate보다 앞서 노출 |
| C-7 | 스키마 보강 8종(§5의 v1.1 데이터 모델): `ai_policies`, `ethical_wall_memberships`, 전 테이블 `tenant_id`, permissions 평가규칙, P13 예약 스키마, disposal 계열, `embeddings`, canonical 구조요소 | 07번의 dangling FK·격리 위협·자기 불일치 |
| C-8 | TUW verification은 **AND 의미론** (기능 AND 권한 AND 감사 AND 회귀 중 해당 영역 전부) | 원천 백로그 392건이 OR boilerplate |
| C-9 | R2/R3/R4 명칭에서 "MVP" 제거 → Document Vault Core / Search v1 / Email Vault v1 | MVP 3중 정의 충돌 |
| C-10 | 원천 14번 샘플 Work ID는 본 패키지의 canonical ID로 대체 (예: SEC-PERM-MATT-TUW-001 → SEC-MATTPERM-ACCECONT-TUW-001) | ID 체계 불일치로 추적성 단절 |

## 4. 저장소 구조 (신규 repo `amic-vault`) — 모든 TUW의 파일 경로 기준

```
amic-vault/
├── apps/api/                 # NestJS. src/modules/{tenant,auth,user,client,matter,party,
│                             #   permission,ethical-wall,audit,document,storage,search,preview}
├── apps/web/                 # Next.js. src/app/, src/components/, src/lib/
├── packages/shared/          # DTO, error codes, zod 스키마 (api·web·worker 공용 타입)
├── packages/domain/          # 상태머신·도메인 규칙 (순수 TS, IO 없음)
├── packages/ai/              # R6 전: 인터페이스 placeholder만 (구현 금지)
├── workers/ingestion/        # Python FastAPI: ocr/, parsers/{pdf,docx,hwpx}/, chunking/(R6)
├── db/migrations/            # node-pg-migrate(SQL 파일 모드) 확정. NNNN_name.sql
├── db/seeds/                 # seed SQL (데모 tenant 2개)
├── infra/                    # docker-compose.dev.yml, ci/
├── docs/package/             # vault_dev_package 이관본 (normative)
├── docs/adr/                 # ADR-001~012
├── docs/ledger/              # decision/execution/learning ledger (md, append-only)
├── tools/backlog/            # 백로그 CSV 검증 스크립트 (DAG·release 규칙)
├── tools/db/                 # migrate/seed 러너 스크립트
├── tests/integration/        # cross-tenant, permission-matrix, audit-immutability
├── tests/fixtures/           # 비식별 샘플 문서·이메일
└── AGENTS.md                 # Codex 운영 규칙 (본 패키지 90_AGENTS_TEMPLATE.md를 복사)
```

명명규약: 테이블 snake_case 복수형, API kebab-case, TS 파일 kebab-case, NestJS 모듈당 `*.module.ts / *.controller.ts / *.service.ts / *.spec.ts`. 모든 마이그레이션은 `tenant_id NOT NULL` + RLS 정책 동반(예외: `tenants`, 글로벌 참조 테이블은 명시 주석 필수).

## 5. 데이터 모델 v1.1 핵심 (상세 DDL은 20번 문서)

원천 07번의 33개 테이블을 승계하되 다음을 **필수 보강**한다:

1. `ai_policies` (policy_id, tenant_id, name, allowed_model_tiers, external_model_allowed=false, default_effect='DENY') — `matters.ai_policy_id` FK 대상. R2에서 테이블+컬럼만, 평가 로직은 R6
2. `ethical_wall_memberships` (wall_id FK, tenant_id, subject_type[user|group], subject_id, membership_type[insider|excluded], added_by, added_at)
3. **전 row-level 테이블 `tenant_id NOT NULL` + RLS** — 원천에서 누락된 14개(permissions, clauses, defined_terms, playbook_rules, drafting_patterns, feedback_items, evaluation_cases 등) 포함. `authorities`만 scope(global|tenant) 허용
4. `permissions` 평가 계약: **default-deny / deny-overrides(wall DENY > 명시 DENY > 명시 ALLOW) / matter_members는 ALLOW의 필요조건 / condition_json 해석 불가 시 거부.** priority, valid_from/valid_to, created_by, created_at 컬럼 추가. `groups`, `group_members` 테이블 신설
5. `audit_events`: **DB 계층 UPDATE/DELETE REVOKE + trigger 차단.** metadata_json은 화이트리스트 키만, 값은 참조 ID/hash 수준
6. legal hold 인터페이스(R2): `documents.legal_hold` boolean + `matters.legal_hold` boolean + 삭제 경로의 precondition check. 전체 LegalHold/disposal 테이블은 R12
7. P13(external_*), embeddings, disposal 계열은 **예약 스키마**로 문서화만 — 테이블 생성은 해당 release에서
8. 상태머신은 원천 07번 §4 그대로: Matter 8상태, Document 11상태 (packages/domain에 순수 함수로 구현)

## 6. TUW 표준

### 6.1 필수 필드 (모든 TUW 문서가 따름)

`ID / Title / Release / Module / Risk(L·M·H·C) / Size(S≤0.5d, M≤1d, L≤2d) / Depends_on(ID 목록) / Objective(검증가능 1문장) / Files create·modify·NOT-modify / Verification(AND 목록) / Edge cases / Stop condition / Escalation`

### 6.2 ID 체계

원천 13번 백로그의 canonical ID를 승계(예: `SEC-MATTPERM-ACCECONT-TUW-001`). 본 패키지 신설 TUW는 `NEW-` 없이 동일 패턴으로 부여하되 모듈명을 새로 정의(예: `CORE-FESHELL-APPSHELL-TUW-001`). ID는 패키지 전체에서 유일해야 한다.

### 6.3 Verification 의미론 (C-8)

- 모든 TUW: 기능검증(unit/integration) **AND** 회귀검증(기존 suite green)
- 권한·보안 영향 TUW: **AND** 권한검증(negative test 포함: 비인가 시도가 차단되는 테스트 필수)
- 행위 기록 대상 TUW: **AND** 감사검증(audit event 발생·필드 충족)
- Risk=C(Critical): 사람(또는 상위 검토 에이전트) 리뷰 게이트 필수. Codex 단독 머지 금지

### 6.4 Stop condition (공통)

스키마·권한·정책이 불명확 / verification fixture 부재 / Files NOT-modify 변경 필요 발견 / 동일 실패 3회 반복 → **작업 중단 후 escalation 기록** (`docs/ledger/execution.md`에 사유 기재)

## 7. R0~R3 TUW 인벤토리 (Normative — 상세 명세는 40~43번 문서가 이 표를 1:1 확장)

표기: Risk C/H/M, Size S/M/L. Deps의 `→`는 "선행 필요". 모듈 내 TUW는 별도 표기 없으면 직전 번호에 순차 의존.

### R0: Foundation (35 TUW)

| 모듈 | TUW | 핵심 Deps |
|---|---|---|
| CORE-REPOBUIL-CICD-TUW-001~005 | monorepo skeleton / 패키지 분리 / lint·test·build CI / staging pipeline skeleton / prod gate skeleton | 없음 (PACK-R0-01 시작점) |
| CORE-DATACORE-MIGR-TUW-001~005 | migration tool 확정·설정 / 초기 schema(tenants,users,audit_events) / seed loader(데모 tenant 2개) / rollback 절차 / tenant_id+RLS convention 문서화·템플릿 | 001→CICD-001 |
| CORE-TENACORE-TENACONT-TUW-001~005 | Tenant schema / tenant context middleware / workspace model / **cross-tenant access test(C)** / tenant settings API | 001→MIGR-002 |
| CORE-AUTHCORE-USERSESS-TUW-001~005 | User schema / login API / session middleware / MFA flag(TOTP는 R1) / password reset skeleton | 001→MIGR-002 |
| CORE-SECFOUND-FAILCLOSE-TUW-001~002 | fail-closed guard 골격(판단 불가→PERMISSION_DENIED) + 표준 error code 9종(09번 §4) / guard 강제오류 주입 테스트 | →TENACONT-002 |
| AUDIT-AUDIEVENCO-AUDILOGG-TUW-001, 004 | AuditEvent schema(테이블) / **append-only constraint: UPDATE·DELETE REVOKE+trigger(C)** | →MIGR-002 |
| CORE-OBSE-LOGGMETR-TUW-001~005 | structured logger / correlation id / health endpoint / metrics endpoint / error tracking hook | →CICD-002 |
| CORE-FESHELL-APPSHELL-TUW-001~003 | Next.js app shell+라우팅 / 디자인시스템 base(shadcn 설정) / auth guard+로그인 화면 | →AUTHCORE-002 |
| DEVOPS-DOCSPKG-TRANSFER-TUW-001~002 | vault_dev_package→docs/package 이관+normative 선언 / ADR-001~012 초안 작성 | →CICD-001 |
| DEVOPS-BACKLOG-VALIDATE-TUW-001 | tools/backlog: CSV 스키마·DAG·release 규칙(AI<R6 금지 등) 검증 스크립트+CI 연결 | →CICD-003 |

**R0 Gate (Foundation Completion)**: 신규 클론 재현(install→build→test green) / cross-tenant 전 endpoint 차단 / audit UPDATE·DELETE DB 실패 / fail-closed 동작 증명 / ADR 승인.

### R1: Matter Core + Permission + Audit (52 TUW)

| 모듈 | TUW | 핵심 Deps |
|---|---|---|
| AUDIT-AUDIEVENCO-AUDILOGG-TUW-002~003, 005 | audit logger service / metadata normalizer(화이트리스트) / retention label 연결 | →R0 AUDILOGG-001 |
| MATTER-CLIEMANA-CLIEREGI-TUW-001~005 | Client schema / create API / detail API / list filtering / metadata editor | 001→MIGR convention |
| MATTER-MATTMANA-MATTREGI-TUW-001~007 | Matter schema / create API / type taxonomy enum / metadata validation / detail API / list pagination / status badge UI | 001→CLIEREGI-001 |
| MATTER-MATTTEAM-MEMBMANA-TUW-001~006 | member schema / add API / remove API / role assignment / team UI / **member change audit(H)** | 001→MATTREGI-001 |
| MATTER-MATTLIFE-STATENGI-TUW-001~005 | state enum(8상태) / transition validation(domain 패키지) / closing action / archive action / closed matter mutation 차단 | →MATTREGI-001 |
| MATTER-PARTMANA-PARTREGI-TUW-001~005 | Party schema / role taxonomy / create API / party-matter link / restricted party marker | →MATTREGI-001 |
| SEC-RBAC-ROLEMATR-TUW-001~005 | role enum 7종(DEC-15) / **permission matrix 정의(C)** / role assignment API / role change audit / admin route guard | 001→AUTHCORE-001 |
| SEC-MATTPERM-ACCECONT-TUW-001~006 | **canReadMatter(C)** / canEditMatter / canUploadToMatter / 비멤버 차단 / matter search permission filter / **fail-closed wrapper(C)** | 001→MEMBMANA-001, ROLEMATR-002 |
| SEC-DOCUPERM-ACCECONT-TUW-001~002 | canReadDocument·canDownloadDocument **인터페이스 시그니처만**(구현 R2) | →MATTPERM-001 |
| SEC-ETHIWALL-WALLENFO-TUW-001~003 | **EthicalWall schema(C)** / **wall membership schema(C)** / wall create API | 001→MATTREGI-001 (C-2 보정으로 R1 배치) |
| AUDIT-PERMAUDI-PERMEVEN-TUW-001~002 | PERMISSION_CHANGED audit(before/after 참조ID 수준) / ACCESS_DENIED audit | →AUDILOGG-002, ROLEMATR-003 |
| SEC-PERMHARN-MATRIX-TUW-001~002 | **권한 매트릭스 테스트 하네스**(role 7 × action × wall 상태, 허용/차단 expected) / CI gate 연결 | →MATTPERM-006, WALLENFO-002 |
| DEVOPS-FREEZE-PERMMODEL-TUW-001 | **Permission Model Freeze 문서**: role matrix·canRead* 시그니처·wall schema·filter 주입 지점 동결 (Decision Ledger 등재) | →위 전부 (R1 Gate 산출물) |

**R1 Gate (Matter Core)**: 권한 매트릭스 하네스 100% / cross-tenant / audit coverage 100%(matter·member·permission 행위) / fail-closed 오류 주입 통과 / Freeze 문서 승인. **Freeze 전 R2·R3 착수 금지.**

### R2: Document Vault Core (59 TUW)

| 모듈 | TUW | 핵심 Deps |
|---|---|---|
| DOC-DOCUSTOR-OBJESTORAD-TUW-001~005 | storage adapter(S3/MinIO) / path resolver(tenant prefix) / file object record / 실패 rollback / encryption hook interface | 001→R1 Freeze |
| DOC-DOCUUPLO-UPLOAPI-TUW-001~008 | upload API / multipart / 확장자 validation / MIME validation / size validation / **upload permission check(H)** / error 표준화 / bulk job skeleton | 001→OBJESTORAD-001, SEC-MATTPERM-003 |
| DOC-DOCUINTE-HASHDUPL-TUW-001~005 | SHA-256 생성 / version.hash 저장 / 중복 후보 탐지 / **immutable original policy(C)** / hash mismatch alert | 001→UPLOAPI-001 |
| DOC-DOCUMETA-METAEXTR-TUW-001~006 | metadata schema / document type enum / filename parser / manual editor API / **metadata change audit(H)** / status enum(11상태) | 001→UPLOAPI-001 |
| DOC-DOCUVERS-VERSRESO-TUW-001~007 | DocumentVersion schema / family_id 규칙 / version_no 계산 / 신규버전 API / 목록 API / superseded 표시 / status filter | 001→HASHDUPL-002 |
| DOC-OCRTEXTEXT-EXTRWORK-TUW-001~006 | extraction job queue(pg-boss) / PDF extractor / DOCX extractor / OCR pending status / confidence 저장 / 실패 retry | 001→VERSRESO-001, workers/ingestion |
| DOC-HWPX-EXTRACT-TUW-001~002 | HWPX(XML) 텍스트 추출 어댑터 / HWPX fixture 검증 5종 | →EXTRWORK-001 (DEC-10) |
| DOC-DOCULIFE-LIFEMANA-TUW-001~006 | soft delete / **restore(C)** / legal-hold delete block(인터페이스 사용) / **archived mutation 차단(C)** / download audit / view audit | 001→VERSRESO-001; 003→HOLDIF-001 |
| RECORD-HOLDIF-INTERFACE-TUW-001 | **legal hold 인터페이스 계약(C-3)**: documents/matters.legal_hold flag + delete precondition check | →DOCUMETA-001 |
| SEC-DOCUPERM-ACCECONT-TUW-003~006 | confidentiality policy / download reason 요구 / permission UI / safe denied message | →R1 DOCUPERM-001~002 구현화 |
| DOC-PREVIEW-VIEWER-TUW-001~003 | PDF preview(권한 검사 endpoint) / DOCX→PDF 변환 worker / **DOCUMENT_VIEWED audit 연동(H)** | →LIFEMANA-006 |
| AUDIT-DOCUAUDI-DOCUEVEN-TUW-001~005 | UPLOADED / VIEWED / DOWNLOADED / DELETED audit / document audit query API | →R1 AUDILOGG-002 |
| AI-AIPOLI-SCHEMAONLY-TUW-001 | `documents.ai_allowed=false` + `matters.ai_policy_id` + `ai_policies` 테이블 — **스키마만, 기본 거부, 평가 로직 금지** | →DOCUMETA-001 |

**R2 Gate (Document Vault)**: 동일파일 동일 hash·1바이트 상이 / 원본 덮어쓰기 불가 / 권한 없는 업로드·다운로드·미리보기 차단 / hold flag 삭제 차단 / DOCUMENT_* audit 5종 누락 0 / storage cross-tenant(서명 URL 포함) 차단 / 파일 본문 로그 미기록.

### R3: Permission-bound Search v1 (28 TUW)

| 모듈 | TUW | 핵심 Deps |
|---|---|---|
| SEARCH-SEARINDE-INDE-TUW-001~005 | index schema(PG FTS, tsvector) / indexing job enqueue / metadata 변경 시 갱신 / reindex manager / 실패 retry | 001→R2 EXTRWORK-002 |
| SEARCH-METASEAR-FILT-TUW-001~005 | matterId / clientId / documentType / date range / version status filter | →INDE-001 |
| SEARCH-FULLSEAR-TEXTQUER-TUW-001~005 | full-text query API / snippet / highlighting / deleted 제외 / search audit | →INDE-002 |
| SEARCH-PERMSEAR-PERMFILT-TUW-001~005 | **matter permission filter 주입(C)** / **document permission filter 주입(C)** / **ethical wall filter 주입(C)** / permission regression test / **metadata leakage test(C)** | 001→R1 Freeze, MATTPERM-005; 003→WALLENFO-002 |
| SEC-ETHIWALL-WALLENFO-TUW-005 | **wall enforcement in search(C)** — PERMFILT-003과 통합 검증 | →PERMFILT-003 |
| SEARCH-UI-PAGE-TUW-001~003 | 검색 페이지 / facet / result card(권한 내 자료만, AI 표시 없음) | →FULLSEAR-002 |
| SEARCH-KOREAN-EVAL-TUW-001~002 | 한국어 토큰화 평가(PG FTS 한계 측정, 법률용어 fixture 30건) / OpenSearch 전환 판단 보고서(ADR-006 갱신) | →FULLSEAR-001 |
| DEVOPS-EVALSET-V0-TUW-001~002 | 평가셋 v0 수집 절차 문서(비식별화 규칙) / evaluation_cases 테이블+적재 스크립트 (DEC-16, **AI 기능 아님 — 데이터 준비**) | →R2 Gate |

**R3 Gate (Permission-bound Search)**: 권한 없는 문서가 **title/snippet/metadata 어디에도** 미노출 / wall 양측 상호 격리 / deleted·superseded 제외 / 인덱스 cross-tenant 차단 / 권한 변경→인덱스 반영 SLA 정의·측정 / 검색 audit 100%. **사후 필터링 우회 발견 시 Gate 불통과.**

## 8. R4~R14 개요 (TUW 상세화는 R3 Gate 후 — 44번 문서)

| Release | 범위 | 진입조건 |
|---|---|---|
| R4 Email Vault v1 | EML/MSG 파싱, 첨부 분리→Document 연결, 수동 filing+추천, thread, timeline | **핵심 DLP rule 4건(SEC-DLP-SENSDATADE-TUW-001~004) 선행 완료(C-4)** |
| R5 Security & Governance | ABAC, DLP 전체, break-glass dual approval(테이블 신설), 외부공유 정책(시행은 R11), Audit Console 권한 enforcement, wall 관리 UI | R4 Gate |
| R6 AI Knowledge Layer v1 = MVP | chunk store, hybrid retrieval(BM25+vector), Evidence Pack, citation, AI audit 5종, Gemma 로컬, Feedback store, shadow pilot 2~4주 | **31번 AI Readiness Checklist 전 항목** (평가셋 서브셋, Gemma PoC, 외부모델 차단 확정 포함) |
| R7~R14 | Graph → Contract Intelligence → DD(내부 한정) → Litigation → VDR → Records → Enterprise → Scale | 원천 16번 + 본 보정 C-6 |

## 9. 실행 모델 (Codex 운영)

1. 실행 단위는 **PACK**(TUW 3~8개 묶음, 0.5~3일). 60번 문서가 PACK 순서·프롬프트를 정의한다.
2. Codex는 PACK 단위로 브랜치 생성 → TUW 순서대로 구현 → PACK verification 명령 전체 green → PR. **Risk=C 포함 PACK은 사람 리뷰 필수.**
3. 모든 PACK 완료 시 `docs/ledger/execution.md`에 1줄 기록(PACK ID, 결과, 특이사항).
4. Gate는 PACK이 아니라 **release 단위 체크리스트**(50번 문서) — 통과 전 다음 release PACK 착수 금지.

## 10. 패키지 문서 맵

| 파일 | 내용 | 독자 |
|---|---|---|
| README.md | 사용 순서·인수인계 | PM·Codex |
| 00_Master_Brief.md | (본 문서) 결정·보정·인벤토리·규약 | 전체 |
| 01_Adopted_Decisions_ADR.md | ADR-001~012 확정 전문 | 전체 |
| 10_Architecture_Tech_Stack.md | 스택·컴포넌트·배포 상세 | Codex |
| 11_Repository_Structure.md | repo 구조·명명·모듈 경계 상세 | Codex |
| 20_Data_Model_v1_1.md | 보정 스키마 DDL 수준 | Codex |
| 21_Permission_Model.md | 권한 평가 계약·매트릭스 | Codex·보안 |
| 30_Release_Roadmap.md | R0~R14 보정판·Gate | PM |
| 31_AI_Readiness_Checklist.md | R6 진입 체크리스트 | PM·AI |
| 40~43_TUW_Backlog_R0~R3.md | TUW 전체 상세 명세 | Codex |
| 44_Outline_R4_R6.md | R4~R6 개요·선행조건 | PM |
| 50_Verification_Security_Gates.md | 검증 의미론·Gate 체크리스트·회귀맵 | Codex·QA |
| 60_Execution_Packs.md | PACK 순서·Codex 프롬프트 | Codex |
| 70_Risk_Register.md | 리스크·대응 | PM |
| 80_Open_Items.md | 잔여 미결·확장 후보 | PO |
| 90_AGENTS_TEMPLATE.md | repo에 복사할 AGENTS.md | Codex |
| data/backlog_r0_r3.csv·json | 기계가독 백로그 | 도구 |
