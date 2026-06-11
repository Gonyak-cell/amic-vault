# 01. Adopted Decisions — ADR-001~012 확정 전문

버전: 1.0 | 작성일: 2026-06-11 | 상태: 전 ADR **Accepted** — `00_Master_Brief.md` §1(DEC-01~18)의 ADR 형식 변환본. Brief와 충돌 시 Brief가 우선한다.

## 0. 이 문서의 사용법

- 각 ADR은 **Context(배경) / Decision(결정) / Consequences(결과) / 재검토 트리거** 구조다. Codex는 구현 중 "왜 이렇게 되어 있는가"가 필요할 때 본 문서를 참조하되, **재검토 트리거 충족 전에는 결정 자체를 재논의하지 않는다.**
- ADR 변경 절차: 재검토 트리거 충족 → 사람(Human Owner) 승인 → status 변경(Superseded/Amended) + Decision Ledger(`docs/ledger/decision.md`) 등재. Codex 단독 변경 금지 (README §6).
- R0의 `DEVOPS-DOCSPKG-TRANSFER-TUW-002`에서 본 문서의 ADR을 repo `docs/adr/`에 파일 단위(ADR-001 ~ ADR-012)로 등재한다. R0 Gate는 ADR 승인을 포함한다.

### DEC ↔ ADR 매핑 (DEC-01~18 전수 커버)

| DEC | 결정 요지 | 귀속 ADR |
|---|---|---|
| DEC-01 | 배포방식 | ADR-001 |
| DEC-02 | DB 격리 | ADR-002 |
| DEC-03 | 백엔드 NestJS | ADR-003 |
| DEC-04 | 프론트엔드 Next.js | ADR-003 (관련) |
| DEC-05 | DB/검색/벡터 단계 전략 | ADR-006 |
| DEC-06 | Python ingestion worker | ADR-003 · ADR-008 (관련) |
| DEC-07 | Object storage·tenant prefix·at-rest 암호화 | ADR-007 |
| DEC-08 | Queue = pg-boss | ADR-008 |
| DEC-09 | 인증(자체 세션 + MFA, SSO는 R13) | ADR-004 (관련) |
| DEC-10 | HWP/HWPX 전략 | ADR-009 |
| DEC-11 | 외부 AI 모델 차단 정책 | ADR-011 |
| DEC-12 | 보존기간(무기한·자동삭제 없음) | ADR-005 (관련) |
| DEC-13 | PII 컬럼 수준 암호화 | ADR-007 |
| DEC-14 | API versioning `/v1` | ADR-010 |
| DEC-15 | 권한 taxonomy (role 7종 + practice_group) | ADR-004 |
| DEC-16 | 평가셋 v0 → R6 서브셋 | ADR-012 |
| DEC-17 | MVP = R6 AI Governance Gate | ADR-011 (관련) |
| DEC-18 | Shadow pilot 2~4주 | ADR-011 · ADR-012 (관련) |

---

## ADR-001. 배포 모델: 국내 리전 클라우드(private 구성) + 컨테이너 기반 on-prem 이식성

- Status: **Accepted** (2026-06-11)
- 관련 DEC: **DEC-01**

### Context

AMIC Vault는 로펌의 고객 기밀자료(계약서, 분쟁 전략 메모, 미공개 M&A 자료 등)를 다루는 시스템이다. 원천 사양은 배포방식을 미결(원천 18번 Q-001: cloud / private cloud / on-prem)로 남겼다. 국내 데이터 주권·개인정보 규제 환경, 로펌 고객의 데이터 소재지 요구, 그리고 장래 엔터프라이즈 고객의 on-prem 요구 가능성을 모두 수용해야 한다. 동시에 단일 팀(Codex 중심)이 운영 가능한 수준의 인프라 복잡도를 유지해야 한다.

### Decision

1. **국내 리전 클라우드에 private 구성으로 배포**한다(전용 네트워크 경계, 외부 직접 노출 최소화).
2. **전 컴포넌트를 컨테이너 기반으로 구성**하여 on-prem 이식성을 유지한다. 개발 환경은 `infra/docker-compose.dev.yml`로 전체 스택을 기동한다.
3. 특정 클라우드 벤더의 매니지드 서비스에 종속되는 기능 사용을 피한다. 외부 인터페이스는 표준 호환(예: object storage는 S3 호환 API — ADR-007)으로 한정한다.

### Consequences

- 개발·CI·스테이징·운영이 동일한 컨테이너 이미지를 사용하므로 환경 간 재현성이 확보된다. R0 Gate의 "신규 클론 재현(install→build→test green)"이 이 전제 위에 성립한다.
- on-prem 이식 시 교체 대상은 인프라 계층(스토리지 엔드포인트, 네트워크)뿐이며 애플리케이션 코드는 불변이어야 한다. 클라우드 전용 SDK 직접 호출이 코드에 들어오면 본 ADR 위반이다.
- 벤더 매니지드 서비스의 편의 기능(예: 매니지드 검색·큐)을 포기하는 비용이 발생한다. 이는 ADR-006·ADR-008의 단계 전략으로 흡수한다.

### 재검토 트리거

- on-prem 배포를 계약 조건으로 하는 고객이 확정될 때 (이식 작업 계획 수립).
- R13 Enterprise Hardening 진입 시 (BYOK·SIEM·DR 요구와 함께 배포 토폴로지 재평가).
- 국내 리전·데이터 소재지 관련 규제 변경.

---

## ADR-002. DB 격리: Shared DB + `tenant_id NOT NULL` + PostgreSQL RLS

- Status: **Accepted** (2026-06-11)
- 관련 DEC: **DEC-02**

### Context

멀티테넌트 로펌 SaaS에서 테넌트 격리 실패는 곧 타 로펌 기밀 노출이며, 원천 리스크 레지스터에서 Critical로 분류된 사고 유형이다. 격리 모델 후보는 shared DB(row-level), schema-per-tenant, DB-per-tenant다. 초기 테넌트 수가 적고 단일 팀이 운영하는 단계에서 schema/DB-per-tenant는 마이그레이션·백업·운영 복잡도를 테넌트 수에 비례해 증가시킨다. 원천 04번 §6도 "초기 shared DB + row-level isolation test 필수, 엔터프라이즈는 schema/DB-per-tenant 준비"를 제시했다.

### Decision

1. **Shared DB로 시작하되, 모든 row-level 테이블에 `tenant_id NOT NULL`을 강제하고 PostgreSQL RLS(Row Level Security) 정책을 동반**한다.
2. 예외는 `tenants`와 글로벌 참조 테이블뿐이며, 예외 테이블은 마이그레이션에 명시 주석 필수. `authorities`만 scope(global|tenant)를 허용한다 (Brief §5-3).
3. 원천 07번에서 tenant_id가 누락된 14개 테이블(permissions, clauses, defined_terms, playbook_rules, drafting_patterns, feedback_items, evaluation_cases 등)도 전부 보강한다 (보정 C-7).
4. **schema-per-tenant 확장 경로는 설계 시 차단하지 않는다.** 테넌트 식별이 코드 전역에 흩어지지 않도록 tenant context middleware(`CORE-TENACORE-TENACONT-TUW-002`)로 일원화한다.

### Consequences

- 애플리케이션 버그(WHERE 절 누락)가 있어도 DB 계층 RLS가 2차 방어선이 된다. 단, RLS는 보조 수단이며 **권한 필터는 쿼리 단계 주입이 원칙**(불변 원칙 1)이다.
- 모든 마이그레이션은 `tenant_id NOT NULL` + RLS 정책을 동반해야 하며(Brief §4 명명규약), convention 문서·템플릿은 `CORE-DATACORE-MIGR-TUW-005`가 산출한다.
- cross-tenant 접근 차단 테스트(`CORE-TENACORE-TENACONT-TUW-004`, Risk=C)가 R0 Gate 조건이고, `tests/integration/cross-tenant`로 전 release에서 회귀 유지된다.
- RLS로 인한 쿼리 플랜 비용이 발생할 수 있다. 성능 문제는 격리 완화가 아니라 인덱스·정책 최적화로 대응한다.

### 재검토 트리거

- 엔터프라이즈 고객이 schema-per-tenant 또는 DB-per-tenant를 계약 조건으로 요구할 때.
- RLS 기반 격리가 성능 SLA를 구조적으로 충족하지 못함이 측정으로 입증될 때.
- R13 Enterprise Hardening 진입 시.

---

## ADR-003. 백엔드 언어·런타임 분할: NestJS(TypeScript) 모노레포 + Python ingestion worker

- Status: **Accepted** (2026-06-11)
- 관련 DEC: **DEC-03** (주), **DEC-04 · DEC-06** (관련)

### Context

원천 04번 §4는 백엔드를 "NestJS/FastAPI"로 병기했고 단일 선택을 미뤘다. 도메인 API(Matter·Document·Permission·Audit)는 권한 계약·상태머신 등 타입 안전성과 모듈 경계가 중요하고, 프론트엔드(Next.js/React)와 타입을 공유하면 DTO 불일치 사고를 컴파일 타임에 차단할 수 있다. 반면 OCR·HWPX·DOCX 파싱은 Python 생태계(파서·OCR 라이브러리)가 압도적으로 우세하다. 두 요구를 단일 런타임으로 충족할 수 없다.

### Decision

1. **도메인 백엔드는 NestJS(TypeScript)**, `pnpm` 모노레포(turborepo)로 구성한다 (DEC-03).
2. **프론트엔드는 Next.js + React + Tailwind + shadcn/ui** (DEC-04).
3. **문서 ingestion(OCR/HWPX/DOCX 파싱)은 Python 3.12 FastAPI worker가 전담**한다 (DEC-06). 위치는 `workers/ingestion/`.
4. 공용 계약은 `packages/shared`(DTO·error code·zod 스키마)에 두고 api·web·worker가 공유한다. 도메인 규칙(상태머신)은 `packages/domain`(순수 TS, IO 없음)에 격리한다.
5. 권한 판단·audit 기록은 **NestJS 측 PermissionService·AuditService에만 둔다.** Python worker는 권한을 판단하지 않으며, 부여받은 작업(job)의 파싱만 수행한다.

### Consequences

- 단일 저장소에서 `pnpm lint / typecheck / test / build`로 TS 영역 전체가 검증되고, worker는 자체 테스트를 가진다. 표준 검증 명령 세트가 이 구조를 전제한다.
- 두 런타임 경계(TS↔Python)는 queue job payload와 storage 참조로 한정되며, 경계 계약은 R2 `DOC-OCRTEXTEXT-EXTRWORK-TUW-001`(extraction job queue)에서 확정한다.
- Python worker가 권한·audit을 우회하는 경로가 되지 않도록, worker의 결과 반영은 항상 NestJS 측 서비스를 경유해야 한다. 위반은 "PermissionService 우회 endpoint" 절대 금지에 해당한다.
- 두 언어 운영 비용(의존성·CI 이원화)이 발생하나, 파싱 품질 요구(한국어 법률문서 OCR 포함)가 이를 정당화한다.

### 재검토 트리거

- TS 생태계에서 HWPX/OCR 파싱 품질이 Python 동등 수준으로 검증될 때 (worker 통합 검토).
- worker 처리량이 FastAPI 단일 worker 구조의 한계에 도달할 때 (ADR-008과 함께 재평가).

---

## ADR-004. 권한 평가 모델: role 7종 RBAC v1 + default-deny / deny-overrides, ABAC 일반화는 R5

- Status: **Accepted** (2026-06-11)
- 관련 DEC: **DEC-15** (주), **DEC-09** (관련 — 인증은 권한 평가의 전제)

### Context

원천 08번 §2는 8계층 권한(Tenant/Client/Matter/Document/Clause/External/AI/Retention)을 제시하나, 전면 ABAC를 처음부터 구현하면 평가 규칙이 불투명해지고 검증 불가능해진다. 권한필터 누락은 원천 리스크 레지스터의 RISK-001(Critical)이다. 원천 12번 §6은 "권한모델 확정 전 검색 금지"를 요구했으나 '확정' 시점이 미정의였다(보정 C-1). 또한 원천 07번의 permissions 테이블은 평가 규칙(우선순위·충돌 해소)이 없었다(보정 C-7).

### Decision

1. **원천 08번 §3의 role 7종을 v1 권한 taxonomy로 채택**한다: Firm Admin, Security Admin, Matter Owner, Matter Member, Limited Reviewer, Knowledge Manager, External User (External User는 R11 전 비활성). 속성은 **practice_group 1개**만 추가한다. ABAC 일반화는 R5다 (DEC-15).
2. 권한 평가 계약(Brief §5-4): **default-deny / deny-overrides(wall DENY > 명시 DENY > 명시 ALLOW) / matter_members 등재는 ALLOW의 필요조건 / `condition_json` 해석 불가 시 거부.** permissions 테이블에 priority, valid_from/valid_to, created_by, created_at을 두고 `groups`·`group_members`를 신설한다.
3. 인증은 **자체 세션 + MFA flag(R1에서 TOTP)** 로 시작하고 SSO/SAML은 R13이다 (DEC-09). 인증된 주체 없이는 어떤 권한 평가도 ALLOW를 반환할 수 없다.
4. EthicalWall schema/membership/create API는 **R1에 배치**(보정 C-2)하여 R3 검색 필터가 의존할 수 있게 한다. break-glass·고도화만 R5 잔류.
5. **R1 종료 시 Permission Model Freeze**(보정 C-1): role matrix·canRead* 시그니처·wall schema·filter 주입 지점을 동결 문서로 확정한다. Freeze 전 R2·R3 착수 금지.

### Consequences

- 모든 권한 판단은 PermissionService로 중앙화되며, 이를 우회하는 document/search endpoint는 절대 금지 목록에 있다. 판단 불가·오류 시 `PERMISSION_DENIED`(불변 원칙 4 Fail-closed).
- role 7 × action × wall 상태의 **권한 매트릭스 테스트 하네스**(`SEC-PERMHARN-MATRIX-TUW-001~002`)가 CI gate로 상시 실행되어, 결정의 검증 가능성이 유지된다.
- ABAC급 요구(조항 수준 제한 등)는 R5 전까지 명시 DENY와 wall로 근사한다. 표현 불가능한 정책 요구는 escalation 대상이지 임시 우회 구현 대상이 아니다.
- Freeze 이후 권한 모델 변경은 동결 해제 절차(사람 승인 + 하네스 전체 재실행) 없이는 금지된다.

### 재검토 트리거

- R5 Security & Governance 진입 시 (ABAC 일반화 — 단, role 7종은 승계하며 폐기하지 않는다).
- 권한 매트릭스 하네스로 표현 불가능한 정책 요구가 실사용에서 확인될 때.
- R11 External Portal 진입 시 (External User role 활성화 조건 재확인).
- R13 진입 시 (SSO/SAML 도입에 따른 주체 모델 확장).

---

## ADR-005. Audit 불변성: append-only — DB 계층 UPDATE/DELETE REVOKE + trigger 차단

- Status: **Accepted** (2026-06-11)
- 관련 DEC: 직접 대응 DEC 없음 — Brief §2 불변 원칙 3(Audit-by-default)·7(Sensitive data is not logged) 및 §5-5에서 도출. **DEC-12** (관련 — 무기한 보존 기본값과 정합)

### Context

법률 시스템에서 감사로그는 책임 추적과 증거성의 토대이며, 사후 변조가 가능한 감사로그는 가치가 없다. 원천 08번 §6은 audit 이벤트 13종과 필수 metadata를 정의했으나, 불변성을 애플리케이션 관례에만 맡기면 버그·권한 상승·악의적 접근 한 번으로 무력화된다. 또한 audit metadata에 문서 본문이 흘러들면 감사로그 자체가 기밀 유출 경로가 된다.

### Decision

1. `audit_events` 테이블은 **DB 계층에서 UPDATE·DELETE 권한을 REVOKE하고 trigger로 차단**한다 (Brief §5-5). 애플리케이션 계정으로도 수정·삭제가 불가능해야 한다.
2. `audit_events`에 UPDATE/DELETE 가능한 경로를 만드는 것은 **절대 금지** 항목이다 (Brief §2).
3. `metadata_json`은 **화이트리스트 키만** 허용하고, 값은 참조 ID/hash 수준으로 제한한다(metadata normalizer: `AUDIT-AUDIEVENCO-AUDILOGG-TUW-003`). 문서 본문·기밀 원문 기록 금지(불변 원칙 7).
4. 문서/권한/외부/AI 행위는 audit event 없이는 완료로 간주하지 않는다(불변 원칙 3). 권한·보안 영향 TUW의 Verification에는 감사검증이 AND로 포함된다 (Brief §6.3).
5. 기록 정정이 필요한 경우 기존 행 수정이 아니라 **보정 이벤트 추가**로만 처리한다.

### Consequences

- append-only constraint(`AUDIT-AUDIEVENCO-AUDILOGG-TUW-004`, Risk=C)는 R0 산출물이며, "audit UPDATE·DELETE가 DB에서 실패함"이 R0 Gate 조건이다. `tests/integration/audit-immutability`로 회귀 유지된다.
- 저장량이 단조 증가한다. DEC-12(법률검토 전 자동삭제 없음·무기한 보존)와 정합하며, retention label 연결(R1 `AUDILOGG-005`)만 준비하고 폐기는 R12 Records에서 다룬다.
- 마이그레이션·운영 스크립트도 audit_events를 수정할 수 없으므로, 스키마 변경은 추가(additive) 방식으로 설계해야 한다.

### 재검토 트리거

- R12 Records Management에서 보존기간 법률검토가 완료되어 audit 보존·아카이브 정책이 확정될 때.
- 저장 비용이 운영 임계치를 초과해 아카이브 계층(콜드 스토리지) 설계가 필요할 때.
- 규제·감독기관 요구로 외부 SIEM 연동(R13)·WORM 스토리지 수준의 보강이 필요할 때.

---

## ADR-006. 검색엔진 단계 전략: PG FTS(R3) → R3 Gate에서 OpenSearch 전환 판단, 벡터는 pgvector(R6), Neo4j는 R7 전 금지

- Status: **Accepted** (2026-06-11)
- 관련 DEC: **DEC-05**

### Context

원천 04번 §4는 full-text를 "OpenSearch 또는 PostgreSQL FTS"로 병기했고, 벡터·그래프까지 합치면 저장 엔진이 4종(PG/OpenSearch/VectorDB/Neo4j)으로 늘어난다. 초기 단계에서 엔진을 늘릴수록 권한 필터 주입 지점과 테넌트 격리 경계가 분산되어 불변 원칙 1(Permission-before-search) 집행이 어려워진다. 한편 PG FTS의 한국어 토큰화 품질은 법률용어에서 한계가 예상되므로 측정 없이 단정할 수 없다. 또한 원천은 semantic search를 R3에 배치했으나 벡터 인덱스의 권한 메타 동기화 계약이 선행되어야 하므로 R6로 이동했다(보정 C-5).

### Decision

1. **PostgreSQL 16 단일 엔진으로 시작**한다. R3 전문검색은 **PG FTS(tsvector)** 로 구현한다.
2. **R3 Gate에서 OpenSearch 전환 여부를 데이터로 판단**한다: 한국어 토큰화 평가(법률용어 fixture 30건, `SEARCH-KOREAN-EVAL-TUW-001`)와 전환 판단 보고서(`TUW-002`)가 본 ADR의 갱신 입력이다.
3. **벡터 검색은 pgvector로 R6에 도입**한다. R6 전 벡터/의미검색 구현은 절대 금지다.
4. **Neo4j(지식그래프)는 R7 전 도입 금지**다. GraphSync 포함.
5. 어떤 엔진을 쓰든 권한 필터는 **쿼리 단계 주입**이며 사후 필터링 대체 금지(불변 원칙 1). 인덱스에는 권한 판단에 필요한 메타(tenant, matter, 상태)가 동기화되어야 하고, 권한 변경→인덱스 반영 SLA를 정의·측정한다(R3 Gate).

### Consequences

- R3까지 운영 인프라가 PostgreSQL 하나로 유지되어 cross-tenant 차단·권한 필터 검증 표면이 최소화된다.
- 검색 품질의 일부(한국어 형태소 분석)는 의도적으로 유보된 상태다. 품질 불만이 있어도 R3 Gate 평가 전 임의 전환은 금지된다.
- OpenSearch 전환이 결정되면 권한 필터 주입·테넌트 격리·인덱스 동기화 계약을 동일 수준으로 재증명해야 하므로, R3의 permission filter 구현(`SEARCH-PERMSEAR-PERMFILT-*`)은 엔진 중립적 계약으로 작성한다.
- deleted·superseded 제외, metadata leakage 차단(title/snippet/metadata 어디에도 미노출)은 엔진 선택과 무관한 Gate 조건이다.

### 재검토 트리거

- **R3 Gate의 한국어 토큰화 평가 결과** (본 ADR의 정규 갱신 시점 — 전환 판단 보고서로 status를 Amended 처리).
- 문서량·동시 사용자 증가로 PG FTS 인덱싱·질의 성능이 SLA를 미달할 때.
- R6 진입 시 hybrid retrieval(BM25+vector) 구성에서 keyword 측 엔진 재평가.
- R7 진입 시 Neo4j 도입 조건 검토 (그 전에는 트리거가 아니다).

---

## ADR-007. 스토리지·암호화: S3 호환 + tenant prefix + at-rest 암호화, DLP 대상 식별자는 컬럼 수준 암호화

- Status: **Accepted** (2026-06-11)
- 관련 DEC: **DEC-07 · DEC-13**

### Context

원본 문서는 object storage에, 구조화 데이터는 PostgreSQL에 저장된다. 로펌 자료 특성상 저장 계층 유출은 치명적이며, 특히 DLP 탐지 대상 식별자(주민등록번호·여권번호·외국인등록번호·계좌번호·카드번호 — 원천 08번 §7)는 DB 덤프·백업 유출 시에도 평문 노출되어서는 안 된다. 전 컬럼 암호화는 검색·인덱스·운영을 마비시키므로 범위 한정이 필요하다. 배포 이식성(ADR-001)을 위해 스토리지 인터페이스는 표준 호환이어야 한다.

### Decision

1. **Object storage는 S3 호환 API**로 추상화한다. 개발 환경은 MinIO (DEC-07).
2. **storage 경로에 tenant prefix 필수.** path resolver(`DOC-DOCUSTOR-OBJESTORAD-TUW-002`)가 일원 관리하며, 직접 경로 조립 금지.
3. **at-rest 암호화를 기본 적용**한다. R2에서 encryption hook interface(`OBJESTORAD-TUW-005`)를 마련해 구현체 교체(추후 KMS/BYOK)를 허용한다.
4. **컬럼 수준 암호화는 DLP 탐지 대상 식별자 5종(주민/여권/외국인등록/계좌/카드번호)에 한정**하고, 나머지는 at-rest 암호화로 충분하다 (DEC-13).
5. 원본 파일은 덮어쓰지 않는다 — 버전은 항상 신규 FileObject(불변 원칙 5). SHA-256 hash로 무결성을 검증한다(`DOC-DOCUINTE-HASHDUPL-*`).

### Consequences

- cross-tenant storage 접근(서명 URL 포함) 차단이 R2 Gate 조건이다. tenant prefix는 격리의 1차 수단이고, 서명 URL 발급 경로도 PermissionService를 경유해야 한다.
- 컬럼 암호화 대상 필드는 평문 인덱스·LIKE 검색이 불가능해진다. 해당 식별자는 검색 조건이 아니라 DLP 탐지·표시 용도로만 다룬다.
- 암호화 키 관리는 초기에는 플랫폼 수준(단일 키 계층)이며, 고객별 키(BYOK)·KMS 통합은 R13으로 미룬다. encryption hook interface가 그 교체 지점이다.
- MinIO(개발)와 운영 S3 호환 스토리지 간 동작 차이는 integration test로 흡수한다.

### 재검토 트리거

- R5 DLP 전체 구현 시 탐지 대상 확대(건강정보·인사평가 등)에 따른 컬럼 암호화 범위 재검토.
- 고객의 BYOK/KMS 요구 또는 R13 Enterprise Hardening 진입.
- 컬럼 암호화로 인한 기능 제약(검색·중복탐지)이 실사용 요구와 충돌할 때.

---

## ADR-008. 큐/워커: pg-boss(PostgreSQL 기반)로 시작, Kafka/Redis는 R4 이후 재평가

- Status: **Accepted** (2026-06-11)
- 관련 DEC: **DEC-08** (주), **DEC-06** (관련 — worker 런타임은 ADR-003)

### Context

비동기 처리(텍스트 추출, OCR, 인덱싱, 변환)는 R2부터 필요하다. 원천 04번 §4는 "Queue 기반 worker, 장기 Temporal/Kafka/Redpanda"만 제시했다. Kafka·Redis 도입은 운영 인프라를 1종 추가하며, 초기 처리량(단일 로펌 내부 사용, R4 이메일 대량 ingestion 전)은 PostgreSQL 기반 큐로 충분하다. 큐가 DB와 동일 PostgreSQL에 있으면 도메인 트랜잭션과 job enqueue의 원자성 확보가 단순해지고, 테넌트 격리·백업 경계도 하나로 유지된다.

### Decision

1. **pg-boss(PostgreSQL 기반 job queue)로 시작**한다 (DEC-08). 첫 적용은 R2 extraction job queue(`DOC-OCRTEXTEXT-EXTRWORK-TUW-001`)와 R3 indexing job enqueue다.
2. **Kafka/Redis 등 별도 브로커는 R4(Email Vault) 이후 부하 데이터를 근거로 재평가**한다. 그 전 도입 금지.
3. job payload에는 문서 본문을 싣지 않는다 — 참조 ID(version_id, storage key)만 전달한다(불변 원칙 7과 정합). Python worker와의 경계 계약은 ADR-003 §Decision 5를 따른다.
4. 실패 처리는 retry(횟수 제한)+상태 기록을 표준으로 한다(`EXTRWORK-TUW-006`, `SEARCH-SEARINDE-INDE-TUW-005`).

### Consequences

- R3까지 추가 인프라 없이 큐가 동작하며, `docker compose -f infra/docker-compose.dev.yml up -d` 한 번으로 개발 스택이 완결된다.
- pg-boss는 at-least-once 전달이므로 **모든 job handler는 멱등(idempotent)하게 작성**해야 한다(동일 version_id 재처리 시 결과 동일).
- 큐 부하가 DB 부하와 합산되므로, 대량 ingestion(R4 이메일) 시점에 처리량·격리 측정이 필요하다 — 이것이 재평가의 입력이다.
- 브로커 교체가 결정되더라도 enqueue 지점이 서비스 계층으로 추상화되어 있으면 교체 비용이 한정된다. job 발행을 pg-boss API 직접 호출로 산개시키지 않는다.

### 재검토 트리거

- R4 Email Vault의 ingestion 처리량·지연이 pg-boss 한계를 측정으로 초과할 때 (정규 재평가 시점).
- job 적체가 DB 본연의 성능(검색·트랜잭션)을 침해할 때.
- R7+ 그래프 동기화·R6 인덱싱 파이프라인에서 스트리밍 의미론이 실제로 필요해질 때.

---

## ADR-009. HWP 전략: R2는 HWPX(XML) 텍스트 추출만, HWP 5.0 바이너리는 R4~R6 별도 트랙

- Status: **Accepted** (2026-06-11)
- 관련 DEC: **DEC-10**

### Context

국내 법률 실무에서 HWP/HWPX 문서 비중은 무시할 수 없으며, 원천 18번 Q-003은 "HWP 지원이 MVP 필수인지"를 미결로 남겼다. HWPX는 공개 XML 포맷으로 파싱 난도가 낮고 검증 가능하다. 반면 HWP 5.0 바이너리는 복합 바이너리 구조로 파서 신뢰성 검증에 별도 투자가 필요하고, 추출 오류가 검색·(추후) AI 인용 품질을 오염시킨다. 둘을 묶으면 R2 일정과 품질이 모두 위험해진다.

### Decision

1. **R2에서는 HWPX(XML) 텍스트 추출만 구현**한다: `workers/ingestion/parsers/hwpx/` 어댑터(`DOC-HWPX-EXTRACT-TUW-001`) + HWPX fixture 5종 검증(`TUW-002`).
2. **HWP 5.0 바이너리 추출은 R4~R6 별도 트랙**으로 분리한다. 파서 후보 검증·fixture 구축을 포함하며, R2~R3 범위가 아니다.
3. HWP 바이너리 파일도 **원본 저장·버전·hash·권한·audit은 다른 파일과 동일하게 적용**된다(불변 원칙 5). 미지원은 "텍스트 추출"에 한정되며, 추출 상태는 명시적 보류 상태로 기록한다 — 조용한 실패로 처리하지 않는다.

### Consequences

- R2 추출 파이프라인은 PDF·DOCX·HWPX 3계열로 한정되어 검증 가능한 범위를 유지한다.
- HWP 바이너리 문서는 R3 검색에서 본문 검색이 되지 않고 메타데이터 검색만 가능하다. 이 한계는 사용자에게 상태로 노출되어야 한다(추출 보류 표시).
- HWP 트랙이 R4~R6 사이에 완료되면 기존 저장 원본을 재처리(추출 job 재실행)하는 것으로 소급 적용한다 — 원본 재업로드는 불필요하다.
- R6 AI 진입 전 HWP 본문이 평가셋·검색 품질에 필요하다고 판단되면 트랙 우선순위를 올린다(31번 체크리스트와 연동).

### 재검토 트리거

- HWP 5.0 파서 후보의 신뢰성 검증(fixture 통과율) 완료 시 — 트랙 착수 결정.
- 실사용 데이터에서 HWP 바이너리 비중이 예상을 크게 상회해 검색 공백이 업무 장애가 될 때.
- R6 진입 판단 시 평가셋의 HWP 커버리지 요구.

---

## ADR-010. API 버저닝: URL prefix `/v1`

- Status: **Accepted** (2026-06-11)
- 관련 DEC: **DEC-14**

### Context

원천 09번 §5는 API versioning 방식을 미결로 남겼다. 후보는 URL prefix, 헤더 기반, content negotiation이다. 이 시스템의 클라이언트는 당분간 자사 웹 프론트엔드(추후 add-in)로 한정되고, 감사·디버깅 시 요청 로그만으로 버전이 식별되는 것이 운영상 유리하다. 헤더 기반은 게이트웨이·캐시·로그 전 구간에서 추가 처리·실수 여지를 만든다.

### Decision

1. **모든 API endpoint는 URL prefix `/v1`을 사용**한다 (예: `POST /v1/matters/{matterId}/documents`). 원천 09번 §2의 endpoint 초안은 본 prefix를 붙여 승계한다.
2. breaking change는 `/v2` 신설로만 도입한다. `/v1` 내에서는 additive 변경(필드 추가, 신규 endpoint)만 허용한다.
3. 버전 분기 로직을 컨트롤러 내부 조건문으로 흩뿌리지 않는다. 버전은 라우팅 수준에서 분리한다.

### Consequences

- 클라이언트·로그·audit 모두에서 버전이 즉시 식별된다. 표준 error code(09번 §4 승계, R0 `CORE-SECFOUND-FAILCLOSE-TUW-001`)와 함께 계약 안정성의 기반이 된다.
- `/v1` 동결 범위가 넓어지지 않도록, 외부 노출이 불필요한 내부 endpoint를 공개 계약에 포함시키지 않는다.
- `packages/shared`의 DTO·zod 스키마가 버전 계약의 단일 진실원이 된다.

### 재검토 트리거

- 외부 connector·webhook·서드파티 클라이언트(R13+) 도입으로 세분화된 호환성 정책(deprecation 일정·sunset 헤더 등)이 필요해질 때.
- `/v2` 신설을 강제하는 breaking change 요구 발생 시 (사람 승인 필요).

---

## ADR-011. 모델 게이트웨이 정책: R6 출시 시점 외부모델 전면 차단(Gemma 로컬 only), 승인 게이트 구축 후 단계 개방

- Status: **Accepted** (2026-06-11)
- 관련 DEC: **DEC-11** (주), **DEC-17 · DEC-18** (관련)

### Context

원천 08번 §8은 자료 유형별 외부모델 전송 정책(고객 기밀 원칙 제한, 미공개 M&A 고위험 gate, 분쟁 전략 메모 원칙 금지 등)을 제시했고, 원천 18번 Q-002는 외부모델 전송 허용 여부를 미결로 남겼다. 자료 유형별 차등 정책을 첫 출시부터 정확히 집행하려면 분류·익명화·승인 체계가 모두 완성되어야 하는데, 이는 R6 시점에 불가능하다. 오분류 한 건이 곧 기밀 외부 유출이므로, 차등 개방의 실패 모드는 수용 불가능하다.

### Decision

1. **R6 출시 시점에는 외부 AI 모델을 전면 차단하고 Gemma 로컬 모델만 사용**한다 (DEC-11). `ai_policies.external_model_allowed=false`, `default_effect='DENY'`가 스키마 기본값이다 (Brief §5-1).
2. 외부모델 개방은 **승인 게이트(자료 분류·익명화·고객 동의·사람 승인 체계) 구축 후 단계적으로**만 진행하며, 각 단계 개방은 사람 승인 사항이다.
3. **R6 전 AI 기능 구현은 절대 금지**다. R2의 `ai_allowed`/`ai_policy_id`/`ai_policies`는 스키마 컬럼만이며(기본 거부) 평가 로직 구현은 R6다. `packages/ai`는 R6 전 인터페이스 placeholder만 둔다.
4. AI는 권한·윤리장벽·aiAllowed를 통과한 자료만 검색·인용한다(불변 원칙 2 Permission-before-AI). Model Gateway는 이 검사 이후에만 호출된다.
5. **MVP는 R6 AI Governance Gate 통과 시점**으로 정의되고(DEC-17), 정식 공개 전 **내부 변호사 한정 shadow pilot 2~4주**를 운영한다(DEC-18).
6. 사양·본 패키지에 없는 외부 API/모델 호출 추가는 절대 금지다.

### Consequences

- R6의 AI 품질은 로컬 Gemma + 지식저장소(검색·Evidence Pack) 품질로 결정된다. 외부 상위모델로 품질을 보완하는 선택지는 의도적으로 봉인되어 있다.
- R6 진입조건은 31번 AI Readiness Checklist 전 항목이며, 여기에 Gemma PoC와 외부모델 차단 확정이 포함된다.
- AI 행위는 audit 5종(AI_QUERY_SUBMITTED, AI_DOCUMENT_RETRIEVED 등)으로 기록된다(불변 원칙 3). 차단 결정도 기록 대상이다.
- 외부모델 차단으로 인해 일부 고난도 작업 품질이 제한될 수 있다 — 이는 shadow pilot에서 측정하고, 개방 논의의 입력으로만 사용한다(임시 우회 금지).

### 재검토 트리거

- 승인 게이트 구성요소(자료 분류 정확도, 익명화 파이프라인 검증, 고객 동의 체계) 완비가 입증될 때 — 단계 개방 검토(사람 승인 필수).
- shadow pilot(DEC-18) 결과 로컬 모델 품질이 출시 기준 미달일 때 (개방이 아니라 R6 Gate 보류가 기본 대응).
- 고객·규제 측 요구 변화(외부 처리 금지 계약 조건 등 — 차단 강화 방향 포함).

---

## ADR-012. 평가셋 전략: 종결 Matter 비식별화 계약서 20~50건으로 v0 시작(R3), R6 게이트 서브셋 ~1,000건

- Status: **Accepted** (2026-06-11)
- 관련 DEC: **DEC-16** (주), **DEC-18** (관련)

### Context

원천 리스크 레지스터 RISK-010은 "평가셋 부재 → 개선 불가능"을 High로 분류했고, Q-008은 golden dataset 확보 가능성을 미결로 남겼다. 평가셋 없이 R6에 진입하면 AI 품질·인용 정확도를 측정할 수 없어 AI Governance Gate 자체가 성립하지 않는다. 반면 대규모 평가셋을 처음부터 구축하는 것은 비식별화 비용·법률 리스크 때문에 비현실적이다. 평가셋 구축은 데이터 준비 작업이며 AI 기능이 아니므로 R6 전 수행이 가능하다.

### Decision

1. **종결 Matter의 비식별화 계약서 20~50건으로 평가셋 v0를 R3에서 시작**한다 (DEC-16).
2. R3 산출물: 수집 절차 문서(비식별화 규칙 포함, `DEVOPS-EVALSET-V0-TUW-001`)와 `evaluation_cases` 테이블+적재 스크립트(`TUW-002`). 이는 **AI 기능이 아니라 데이터 준비**이며, R6 전 AI 구현 금지와 충돌하지 않는다.
3. **R6 Gate 시점까지 평가셋을 ~1,000건 서브셋으로 확장**한다. 이는 31번 AI Readiness Checklist의 진입조건이다.
4. `evaluation_cases`는 다른 row-level 테이블과 동일하게 `tenant_id NOT NULL` + RLS를 적용한다 (Brief §5-3, 보정 C-7).
5. shadow pilot(DEC-18) 기간의 변호사 피드백·수정 결과는 Feedback store를 거쳐 평가셋 확장의 입력으로 환류한다.

### Consequences

- R3 검색 품질 평가(한국어 토큰화 fixture, ADR-006)와 R6 AI 평가가 같은 데이터 거버넌스(비식별화 규칙) 위에서 운영된다.
- 비식별화 규칙이 수집 절차 문서로 명문화되므로, 평가셋 데이터가 새로운 기밀 유출 경로가 되는 것을 차단한다. 비식별화 불완전이 의심되는 건은 적재 금지.
- 평가셋 규모(~1,000건)가 미달이면 R6 진입이 보류된다 — 일정 압박을 이유로 한 기준 완화는 사람 승인 없이 불가하다.
- `tests/fixtures/`의 비식별 샘플과 평가셋은 용도가 다르다(전자는 기능 검증, 후자는 품질 측정). 혼용하지 않는다.

### 재검토 트리거

- 비식별화 규칙에 대한 법률검토 결과가 수집 범위·방법의 변경을 요구할 때.
- R6 Gate 준비 시점에 서브셋 규모·구성(문서 유형 커버리지)이 기준 미달일 때 — 진입 보류 및 수집 전략 재수립.
- R8 Contract Intelligence 진입 시 조항 수준 평가셋으로의 확장 요구.
- shadow pilot 결과 평가셋과 실사용 질의 분포의 괴리가 확인될 때.

---

## 부록. ADR 운영 메모

- 본 문서의 12개 ADR은 R0 `DEVOPS-DOCSPKG-TRANSFER-TUW-002`에서 repo `docs/adr/ADR-001.md` ~ `ADR-012.md`로 등재되며, **R0 Gate는 ADR 승인을 포함**한다.
- ADR-006은 R3 Gate의 한국어 평가·전환 판단 보고서로 갱신되는 것이 **예정된** 유일한 ADR이다. 그 외 ADR의 갱신은 모두 예외 절차(재검토 트리거 + 사람 승인)다.
- 신규 결정이 필요하면 ADR-013부터 추번하되, 본 패키지가 아닌 repo `docs/adr/`에서 관리하고 Decision Ledger에 등재한다.
