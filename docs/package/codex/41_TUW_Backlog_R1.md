# 41. TUW Backlog — R1: Matter Core + Permission + Audit (52 TUW 상세 명세)

버전: 1.0 | 작성일: 2026-06-11 | 상태: Normative (단, `00_Master_Brief.md`와 충돌 시 Brief가 우선)

본 문서는 Brief §7의 R1 인벤토리(52 TUW)를 **1:1로 전부** 상세화한 실행 명세다. Codex는 대화 컨텍스트 없이 본 문서와 Brief만으로 각 TUW를 구현·검증할 수 있어야 한다. 임의 TUW 추가·삭제 없음.

---

## 0. 공통 규약 (모든 R1 TUW에 적용)

### 0.1 표준 검증 명령 세트

모든 TUW의 Verification은 아래 명령만 사용한다 (Brief 규약):

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker compose -f infra/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm db:rollback
pnpm db:migrate      # 왕복 가역성 확인 후 재적용
pnpm db:seed
pnpm test:integration
```

### 0.2 Verification AND 의미론 (Brief §6.3, C-8)

- **모든 TUW**: 기능검증(unit/integration) **AND** 회귀검증(기존 suite 전체 green — `pnpm test` + `pnpm test:integration`).
- **권한·보안 영향 TUW**: **AND** 권한검증 — 반드시 negative test(비인가 시도가 `PERMISSION_DENIED` 등으로 차단됨을 증명하는 테스트) 포함.
- **행위 기록 대상 TUW**: **AND** 감사검증 — audit event 발생 및 필수 필드 충족, 누락 시 테스트 실패.
- **Risk=C**: 위 전부 **AND 사람(또는 상위 검토 에이전트) 리뷰 게이트 필수. Codex 단독 머지 금지.**

각 TUW의 Verification 항목은 전부 AND로 결합된다. 하나라도 실패하면 해당 TUW는 미완료다.

### 0.3 공통 Files NOT to modify (전 R1 TUW 기본값)

각 TUW의 "Files NOT to modify"는 아래 공통 목록에 **추가**되는 항목만 기재한다.

1. `db/migrations/` 내 기존(이미 머지된) 마이그레이션 파일 — 변경 금지, 신규 파일 추가만 허용
2. `audit_events` 테이블에 UPDATE/DELETE 가능 경로를 만드는 모든 변경 (DB·ORM·API 계층 불문, Brief §2 절대 금지)
3. `packages/ai/**` — R6 전 인터페이스 placeholder 외 일체 구현 금지
4. `docs/package/**` — 원천 사양 이관본, 수정 금지
5. `../vault_dev_package/**` 및 DOCX 원본 — 수정 금지 (repo 외부)
6. `apps/api/src/modules/audit/` 의 append-only 보장 코드 — AUDILOGG 계열 TUW 외 수정 금지
7. 외부공유·VDR·secure link·벡터·Neo4j 관련 어떤 파일도 생성 금지 (Brief §2 절대 금지)

### 0.4 공통 Stop condition (Brief §6.4)

다음 중 하나라도 발생하면 **작업 중단 후 escalation 기록**:
스키마·권한·정책 불명확 / verification fixture 부재 / Files NOT-modify 변경 필요 발견 / 동일 실패 3회 반복.
각 TUW의 Stop condition 필드는 `공통 + (추가 조건)` 형식으로 기재한다.

### 0.5 공통 Escalation

`docs/ledger/execution.md`에 TUW ID·중단 사유·시도 내역 1줄 이상 기재 → 진행 중 PACK PR에 `BLOCKED` 라벨 → 사람 리뷰 요청. Risk=C TUW는 차단 여부와 무관하게 머지 전 사람 리뷰 필수.

### 0.6 마이그레이션 규약

- 파일명 `db/migrations/NNNN_name.sql`. `NNNN`은 구현 시점의 마지막 번호+1 (R0가 사용한 번호에 이어서 부여). 본 문서에서는 `NNNN`으로 표기하며 **name 부분이 normative**다.
- 모든 신규 row-level 테이블은 `tenant_id UUID NOT NULL` + PostgreSQL RLS 정책(`tenant_id = current_setting('app.current_tenant_id')::uuid`) 동반 (Brief §4·§5.3). 예외 없음(R1 신규 테이블 중 글로벌 참조 테이블 없음).
- 모든 마이그레이션은 `pnpm db:migrate` → `pnpm db:rollback` → `pnpm db:migrate` 왕복이 green이어야 한다.

### 0.7 R1 audit event 타입 (본 문서가 정의하는 화이트리스트)

`packages/shared/src/audit/audit-event-types.ts`에 enum으로 고정한다. R1 신규 **19종**(50번 R1-G3 분모와 1:1):
`CLIENT_CREATED`, `CLIENT_UPDATED`, `MATTER_CREATED`, `MATTER_UPDATED`, `MATTER_STATUS_CHANGED`, `MATTER_MEMBER_ADDED`, `MATTER_MEMBER_REMOVED`, `MATTER_MEMBER_ROLE_CHANGED`, `PARTY_ADDED`, `PARTY_RESTRICTED_MARKED`, `ROLE_ASSIGNED`, `ROLE_CHANGED`, `PERMISSION_CHANGED`, `ACCESS_DENIED`, `ETHICAL_WALL_CREATED`, `ETHICAL_WALL_MEMBERSHIP_CHANGED`, `ETHICAL_WALL_APPLIED`, `LOGIN_SUCCESS`, `LOGIN_FAILURE`.
(`LOGIN_SUCCESS`/`LOGIN_FAILURE`는 R0 로그인 흐름에 AUDILOGG-TUW-002가 소급 연결, `ROLE_ASSIGNED`는 ROLEMATR-TUW-003/004, `ETHICAL_WALL_CREATED`/`ETHICAL_WALL_MEMBERSHIP_CHANGED`는 WALLENFO-TUW-003에서 기록.)
metadata_json에는 참조 ID/hash/enum 값만 허용 (Brief §2 원칙 7 — 문서 본문·기밀 원문 기록 금지).

### 0.8 표준 error code (원천 09번 §4 승계)

`AUTH_REQUIRED` / `PERMISSION_DENIED` / `ETHICAL_WALL_BLOCKED` / `AI_POLICY_BLOCKED` / `DOCUMENT_LOCKED` / `VALIDATION_FAILED` / `UNSUPPORTED_FILE_TYPE` / `EXTERNAL_LINK_EXPIRED` / `TENANT_ISOLATION_VIOLATION` — R0 `CORE-SECFOUND-FAILCLOSE-TUW-001`이 `packages/shared/src/errors/error-codes.ts`에 정의했다고 전제. R1은 이를 import만 하고 재정의 금지.

### 0.9 API 규약

URL prefix `/v1`(DEC-14), kebab-case. 모든 endpoint는 R0의 tenant context middleware + session middleware를 통과해야 하며, PermissionService를 우회하는 matter/document 경로 생성은 절대 금지(Brief §2).

---

## 1. R1 인벤토리 요약 (Brief §7과 1:1 — 52 TUW)

| # | ID | Title | Risk | Size | Depends_on (요약 — 상세 블록이 normative) |
|---|---|---|---|---|---|
| 1 | AUDIT-AUDIEVENCO-AUDILOGG-TUW-002 | audit logger service 구현 | H | M | R0: AUDILOGG-001, AUDILOGG-004, TENACONT-002 |
| 2 | AUDIT-AUDIEVENCO-AUDILOGG-TUW-003 | audit metadata normalizer(화이트리스트) 구현 | H | M | AUDILOGG-002 |
| 3 | AUDIT-AUDIEVENCO-AUDILOGG-TUW-005 | audit event retention label 연결 | M | S | AUDILOGG-003 |
| 4 | MATTER-CLIEMANA-CLIEREGI-TUW-001 | Client schema 구현 | M | M | R0: MIGR-002, MIGR-005 |
| 5 | MATTER-CLIEMANA-CLIEREGI-TUW-002 | client create API 구현 | M | M | CLIEREGI-001 + R0: TENACONT-002, USERSESS-003 + AUDILOGG-002, ROLEMATR-001 |
| 6 | MATTER-CLIEMANA-CLIEREGI-TUW-003 | client detail API 구현 | M | S | CLIEREGI-002 |
| 7 | MATTER-CLIEMANA-CLIEREGI-TUW-004 | client list filtering 구현 | M | S | CLIEREGI-003 |
| 8 | MATTER-CLIEMANA-CLIEREGI-TUW-005 | client metadata editor 구현 | M | M | CLIEREGI-004 |
| 9 | MATTER-MATTMANA-MATTREGI-TUW-001 | Matter schema 구현 | H | M | CLIEREGI-001 + R0: MIGR-005 |
| 10 | MATTER-MATTMANA-MATTREGI-TUW-002 | Matter create API 구현 | H | M | MATTREGI-001, AUDILOGG-002 + R0: TENACONT-002 |
| 11 | MATTER-MATTMANA-MATTREGI-TUW-003 | Matter type taxonomy enum 구현 | M | S | MATTREGI-002 |
| 12 | MATTER-MATTMANA-MATTREGI-TUW-004 | Matter metadata validation 구현 | M | S | MATTREGI-003 |
| 13 | MATTER-MATTMANA-MATTREGI-TUW-005 | Matter detail API 구현 | H | M | MATTREGI-004 |
| 14 | MATTER-MATTMANA-MATTREGI-TUW-006 | Matter list pagination 구현 | M | S | MATTREGI-005 |
| 15 | MATTER-MATTMANA-MATTREGI-TUW-007 | Matter status badge UI 구현 | L | S | MATTREGI-006, STATENGI-001 + R0: APPSHELL-002 |
| 16 | MATTER-MATTTEAM-MEMBMANA-TUW-001 | Matter member schema 구현 | H | M | MATTREGI-001 + R0: MIGR-005 |
| 17 | MATTER-MATTTEAM-MEMBMANA-TUW-002 | member add API 구현 | H | M | MEMBMANA-001, ROLEMATR-001, AUDILOGG-002 |
| 18 | MATTER-MATTTEAM-MEMBMANA-TUW-003 | member remove API 구현 | H | S | MEMBMANA-002 |
| 19 | MATTER-MATTTEAM-MEMBMANA-TUW-004 | matter role assignment 구현 | H | S | MEMBMANA-003 |
| 20 | MATTER-MATTTEAM-MEMBMANA-TUW-005 | matter team UI 구현 | M | M | MEMBMANA-004 + R0: APPSHELL-003 |
| 21 | MATTER-MATTTEAM-MEMBMANA-TUW-006 | member change audit hook 연결 | H | S | MEMBMANA-005, AUDILOGG-003 |
| 22 | MATTER-MATTLIFE-STATENGI-TUW-001 | Matter state enum(8상태) 구현 | M | S | MATTREGI-001 |
| 23 | MATTER-MATTLIFE-STATENGI-TUW-002 | state transition validation 구현 | H | M | STATENGI-001, AUDILOGG-002 |
| 24 | MATTER-MATTLIFE-STATENGI-TUW-003 | closing state action 구현 | M | S | STATENGI-002 |
| 25 | MATTER-MATTLIFE-STATENGI-TUW-004 | archive state action 구현 | M | S | STATENGI-003 |
| 26 | MATTER-MATTLIFE-STATENGI-TUW-005 | closed matter mutation 차단 구현 | H | M | STATENGI-004 |
| 27 | MATTER-PARTMANA-PARTREGI-TUW-001 | Party schema 구현 | M | M | MATTREGI-001 + R0: MIGR-005 |
| 28 | MATTER-PARTMANA-PARTREGI-TUW-002 | party role taxonomy 구현 | M | S | PARTREGI-001 |
| 29 | MATTER-PARTMANA-PARTREGI-TUW-003 | party create API 구현 | M | S | PARTREGI-002, AUDILOGG-002 |
| 30 | MATTER-PARTMANA-PARTREGI-TUW-004 | party-to-matter link 구현 | M | S | PARTREGI-003 |
| 31 | MATTER-PARTMANA-PARTREGI-TUW-005 | restricted party marker 구현 | H | S | PARTREGI-004, ROLEMATR-001 |
| 32 | SEC-RBAC-ROLEMATR-TUW-001 | role enum 7종 구현 (DEC-15) | M | S | R0: USERSESS-001 |
| 33 | SEC-RBAC-ROLEMATR-TUW-002 | role permission matrix 정의 | **C** | M | ROLEMATR-001 |
| 34 | SEC-RBAC-ROLEMATR-TUW-003 | role assignment API 구현 | H | M | ROLEMATR-002, AUDILOGG-002 |
| 35 | SEC-RBAC-ROLEMATR-TUW-004 | role change audit 구현 | H | S | ROLEMATR-003, AUDILOGG-003 |
| 36 | SEC-RBAC-ROLEMATR-TUW-005 | admin-only route guard 구현 | H | M | ROLEMATR-004 + R0: FAILCLOSE-001 |
| 37 | SEC-MATTPERM-ACCECONT-TUW-001 | canReadMatter 구현 | **C** | L | MEMBMANA-001, ROLEMATR-002, WALLENFO-002 |
| 38 | SEC-MATTPERM-ACCECONT-TUW-002 | canEditMatter 구현 | H | S | MATTPERM-001 |
| 39 | SEC-MATTPERM-ACCECONT-TUW-003 | canUploadToMatter 구현 | H | S | MATTPERM-002, STATENGI-001 |
| 40 | SEC-MATTPERM-ACCECONT-TUW-004 | 비멤버 접근 차단 연결 | H | M | MATTPERM-003, MATTREGI-005 |
| 41 | SEC-MATTPERM-ACCECONT-TUW-005 | matter search permission filter 구현 | H | M | MATTPERM-004, MATTREGI-006 |
| 42 | SEC-MATTPERM-ACCECONT-TUW-006 | fail-closed permission wrapper 구현 | **C** | M | MATTPERM-005 + R0: FAILCLOSE-001 |
| 43 | SEC-DOCUPERM-ACCECONT-TUW-001 | canReadDocument 인터페이스 시그니처 정의 | M | S | MATTPERM-001 |
| 44 | SEC-DOCUPERM-ACCECONT-TUW-002 | canDownloadDocument 인터페이스 시그니처 정의 | M | S | DOCUPERM-001 |
| 45 | SEC-ETHIWALL-WALLENFO-TUW-001 | EthicalWall schema 구현 | **C** | M | MATTREGI-001 + R0: MIGR-005 |
| 46 | SEC-ETHIWALL-WALLENFO-TUW-002 | wall membership schema 구현 | **C** | M | WALLENFO-001 |
| 47 | SEC-ETHIWALL-WALLENFO-TUW-003 | wall create API 구현 | H | M | WALLENFO-002, ROLEMATR-005, AUDILOGG-002 |
| 48 | AUDIT-PERMAUDI-PERMEVEN-TUW-001 | PERMISSION_CHANGED audit 구현 | H | M | AUDILOGG-002, ROLEMATR-003, MEMBMANA-004, WALLENFO-003 |
| 49 | AUDIT-PERMAUDI-PERMEVEN-TUW-002 | ACCESS_DENIED audit 구현 | H | S | PERMEVEN-001, MATTPERM-006 |
| 50 | SEC-PERMHARN-MATRIX-TUW-001 | 권한 매트릭스 테스트 하네스 구현 | **C** | L | MATTPERM-006, WALLENFO-002, ROLEMATR-002 |
| 51 | SEC-PERMHARN-MATRIX-TUW-002 | 권한 매트릭스 CI gate 연결 | H | S | PERMHARN-001 + R0: CICD-003 |
| 52 | DEVOPS-FREEZE-PERMMODEL-TUW-001 | Permission Model Freeze 문서 작성·등재 | **C** | M | ROLEMATR-005, MATTPERM-006, DOCUPERM-002, WALLENFO-003, PERMEVEN-002, PERMHARN-002, MEMBMANA-006 |

Risk=C는 7건(33·37·42·45·46·50·52번) — 전부 **사람 리뷰 게이트 필수**.

---

## 2. 모듈별 상세 명세

### 2.1 AUDIT-AUDIEVENCO-AUDILOGG — Audit Event Core / Audit Logger (R1분: 002·003·005)

R0에서 `audit_events` 테이블(AUDILOGG-001)과 append-only 제약(AUDILOGG-004: UPDATE·DELETE REVOKE + trigger 차단)이 완료된 상태를 전제한다.

#### AUDIT-AUDIEVENCO-AUDILOGG-TUW-002 — audit logger service 구현

| 필드 | 값 |
|---|---|
| ID | AUDIT-AUDIEVENCO-AUDILOGG-TUW-002 |
| Title | audit logger service 구현 |
| Release | R1 |
| Module | AUDIT-AUDIEVENCO-AUDILOGG (Audit Event Core / Audit Logger) |
| Risk | H |
| Size | M |
| Depends_on | AUDIT-AUDIEVENCO-AUDILOGG-TUW-001 (R0), AUDIT-AUDIEVENCO-AUDILOGG-TUW-004 (R0), CORE-TENACORE-TENACONT-TUW-002 (R0) |
| Objective | 모든 모듈이 주입받아 호출하는 `AuditService.log(event)`가 tenant context·actor·action·target·correlation id를 INSERT-only로 기록하고, 기록 실패 시 호출 측 트랜잭션을 함께 실패시킨다(Audit-by-default — audit 없는 행위는 미완료). 또한 R0 로그인 흐름(USERSESS-TUW-002)에 `LOGIN_SUCCESS`/`LOGIN_FAILURE` audit event를 소급 연결한다(40번 Notes-4의 R1 책임 이행). |
| Files to create | `apps/api/src/modules/audit/audit.module.ts`, `apps/api/src/modules/audit/audit.service.ts`, `apps/api/src/modules/audit/audit.service.spec.ts`, `packages/shared/src/audit/audit-event-types.ts` (§0.7 enum) |
| Files to modify | `apps/api/src/app.module.ts` (AuditModule 글로벌 등록), `apps/api/src/modules/auth/auth.service.ts` (로그인 성공·실패 경로에 `LOGIN_SUCCESS`/`LOGIN_FAILURE` 기록 소급 연결 — 구조화 로그는 유지) |
| Files NOT to modify | 공통(§0.3) + `db/migrations/`의 audit_events DDL·trigger 파일 일체 |
| Verification (AND) | 1) 기능: `log()` 호출 시 audit_events에 1행 INSERT, 필수 필드(event_id, tenant_id, actor_id, action, target_type, target_id, created_at) 충족 unit test — `pnpm test` 2) 감사: 동일 트랜잭션 내 audit INSERT 실패 주입 시 비즈니스 쓰기도 rollback됨을 integration test로 증명 — `pnpm test:integration` 3) 권한(negative): tenant context 부재 상태에서 `log()` 호출 시 기록 거부+예외(임의 tenant_id 추정 금지) 4) 감사(소급 연결): 로그인 성공 시 `LOGIN_SUCCESS` 1건·실패 시 `LOGIN_FAILURE` 1건 기록(비밀번호·해시 미포함) integration test 5) 회귀: R0 audit-immutability suite 포함 기존 suite green |
| Edge cases | (a) action 값이 §0.7 enum 외 문자열 → 컴파일/런타임 거부 (b) 동시 다발 호출(병렬 50건)에서 유실 0 (c) actor_id가 시스템 작업(seed 등)인 경우 예약 actor `system` 처리 규칙 |
| Stop condition | 공통(§0.4) + R0 audit_events 스키마가 §0.7 필드를 수용하지 못함을 발견한 경우(스키마 변경은 본 TUW 범위 밖) |
| Escalation | 공통(§0.5) |

#### AUDIT-AUDIEVENCO-AUDILOGG-TUW-003 — audit metadata normalizer 구현

| 필드 | 값 |
|---|---|
| ID | AUDIT-AUDIEVENCO-AUDILOGG-TUW-003 |
| Title | audit metadata normalizer(화이트리스트) 구현 |
| Release | R1 |
| Module | AUDIT-AUDIEVENCO-AUDILOGG |
| Risk | H |
| Size | M |
| Depends_on | AUDIT-AUDIEVENCO-AUDILOGG-TUW-002 |
| Objective | `metadata_json`을 화이트리스트 키만 통과시키고 값을 참조 ID/hash/enum/256자 이하 문자열로 제한하여, 문서 본문·기밀 원문이 audit metadata에 기록될 수 없게 강제한다(Brief §2 원칙 7, §5.5). |
| Files to create | `apps/api/src/modules/audit/audit-metadata.normalizer.ts`, `apps/api/src/modules/audit/audit-metadata.normalizer.spec.ts`, `packages/shared/src/audit/audit-metadata-keys.ts` (화이트리스트: `before_ref`, `after_ref`, `reason_code`, `role_before`, `role_after`, `diff_keys`, `wall_id`, `member_user_id`, `client_id`, `matter_id`, `party_id`, `correlation_id`, `ip_address`, `document_id`, `version_id`, `hash` — `document_id`·`version_id`·`hash`·`reason_code`는 R2 문서 모듈(42번)에서 사용 예정) |
| Files to modify | `apps/api/src/modules/audit/audit.service.ts` (`log()` 경로에 normalizer 강제 삽입 — 우회 경로 없어야 함) |
| Files NOT to modify | 공통(§0.3) |
| Verification (AND) | 1) 기능: 화이트리스트 외 키 제거, 256자 초과 값 거부(예외), 중첩 객체 거부 unit test 2) 권한/보안(negative): 본문성 긴 텍스트(fixture: 계약서 단락)를 metadata로 주입 시 저장 불가 + 저장된 행에 해당 문자열 미존재 integration test 3) 감사: normalizer 통과본만 INSERT됨 4) 회귀: 기존 suite green |
| Edge cases | (a) null/undefined/빈 객체 metadata 허용(빈 JSON 저장) (b) diff_keys는 필드명 배열만 허용, 필드 값 포함 시 거부 (c) 유니코드 다중바이트 문자열의 길이 산정(문자 수 기준) |
| Stop condition | 공통(§0.4) + 화이트리스트에 없는 키가 업무상 필수로 판단되는 경우(키 추가는 본 문서 개정 사항 — 임의 추가 금지) |
| Escalation | 공통(§0.5) |

#### AUDIT-AUDIEVENCO-AUDILOGG-TUW-005 — audit event retention label 연결

| 필드 | 값 |
|---|---|
| ID | AUDIT-AUDIEVENCO-AUDILOGG-TUW-005 |
| Title | audit event retention label 연결 |
| Release | R1 |
| Module | AUDIT-AUDIEVENCO-AUDILOGG |
| Risk | M |
| Size | S |
| Depends_on | AUDIT-AUDIEVENCO-AUDILOGG-TUW-003 |
| Objective | `audit_events.retention_label` 컬럼(기본값 `'PERMANENT'`)을 추가하고 logger가 라벨을 기록하되, 어떤 삭제·변경·만료 처리 경로도 만들지 않는다(DEC-12: 자동삭제 없음·무기한 보존, 필드만 준비). |
| Files to create | `db/migrations/NNNN_audit_retention_label.sql` (`ALTER TABLE audit_events ADD COLUMN retention_label TEXT NOT NULL DEFAULT 'PERMANENT'` — UPDATE/DELETE REVOKE·trigger는 그대로 유지) |
| Files to modify | `apps/api/src/modules/audit/audit.service.ts` (INSERT 시 라벨 포함), `apps/api/src/modules/audit/audit.service.spec.ts` |
| Files NOT to modify | 공통(§0.3) + append-only trigger 정의 변경 금지 |
| Verification (AND) | 1) 기능: 신규 이벤트에 retention_label='PERMANENT' 저장 unit test 2) 감사/회귀: migration 적용 후에도 audit_events UPDATE·DELETE가 DB 계층에서 실패하는 R0 immutability test green — `pnpm db:migrate && pnpm test:integration` 3) 회귀: `pnpm db:rollback` 후 재적용 왕복 green |
| Edge cases | (a) 기존 행(컬럼 추가 전)도 DEFAULT로 채워짐 (b) 라벨 임의 값 주입 시도 → enum 외 거부('PERMANENT'만 R1 허용) |
| Stop condition | 공통(§0.4) + retention 만료·삭제 로직 요구 발견 시(R12 범위 — 즉시 중단) |
| Escalation | 공통(§0.5) |

---

### 2.2 MATTER-CLIEMANA-CLIEREGI — Client Management / Client Registry (001~005)

#### MATTER-CLIEMANA-CLIEREGI-TUW-001 — Client schema 구현

| 필드 | 값 |
|---|---|
| ID | MATTER-CLIEMANA-CLIEREGI-TUW-001 |
| Title | Client schema 구현 |
| Release | R1 |
| Module | MATTER-CLIEMANA-CLIEREGI (Client Management / Client Registry) |
| Risk | M |
| Size | M |
| Depends_on | CORE-DATACORE-MIGR-TUW-002 (R0), CORE-DATACORE-MIGR-TUW-005 (R0) |
| Objective | `clients` 테이블(client_id PK, tenant_id NOT NULL, name, client_type, confidentiality_level, status, metadata_json, created_by, created_at, updated_at — 컬럼 상세는 20번 §4.1이 규범)을 RLS 정책과 함께 생성하고 entity·DTO 타입을 제공한다. |
| Files to create | `db/migrations/NNNN_create_clients.sql`, `apps/api/src/modules/client/client.entity.ts`, `packages/shared/src/client/client.dto.ts` (zod), `packages/shared/src/client/client-enums.ts` (20번 §4.1 CHECK 값과 1:1 — client_type: `corporation|individual|government|fund|npo|other`; status: `active|dormant|closed`; confidentiality_level: `standard|high|restricted`) |
| Files to modify | 없음 |
| Files NOT to modify | 공통(§0.3) |
| Verification (AND) | 1) 기능: `pnpm db:migrate` green, 테이블·제약·RLS 정책 존재 검증 테스트 2) 권한(negative): 타 tenant context로 SELECT 시 0행(RLS 차단) integration test — `pnpm test:integration` 3) 회귀: `pnpm db:rollback` 왕복 green + 기존 suite green |
| Edge cases | (a) tenant_id NULL INSERT 시도 → DB 거부 (b) 동일 tenant 내 동일 name 허용 여부: 허용하되 (tenant_id, name) 보조 인덱스만 (c) client_type enum 외 값 → CHECK 거부 |
| Stop condition | 공통(§0.4) + R0 RLS convention 템플릿(MIGR-005 산출물)과 충돌 발견 시 |
| Escalation | 공통(§0.5) |

#### MATTER-CLIEMANA-CLIEREGI-TUW-002 — client create API 구현

| 필드 | 값 |
|---|---|
| ID | MATTER-CLIEMANA-CLIEREGI-TUW-002 |
| Title | client create API 구현 |
| Release | R1 |
| Module | MATTER-CLIEMANA-CLIEREGI |
| Risk | M |
| Size | M |
| Depends_on | MATTER-CLIEMANA-CLIEREGI-TUW-001, CORE-TENACORE-TENACONT-TUW-002 (R0), CORE-AUTHCORE-USERSESS-TUW-003 (R0), AUDIT-AUDIEVENCO-AUDILOGG-TUW-002, SEC-RBAC-ROLEMATR-TUW-001 |
| Objective | `POST /v1/clients`가 인증된 Firm Admin·Matter Owner 역할만 허용하여 client를 생성하고 `CLIENT_CREATED` audit event를 동일 트랜잭션으로 기록한다. |
| Files to create | `apps/api/src/modules/client/client.module.ts`, `apps/api/src/modules/client/client.controller.ts`, `apps/api/src/modules/client/client.service.ts`, `apps/api/src/modules/client/client.service.spec.ts`, `apps/api/src/modules/client/dto/create-client.dto.ts` |
| Files to modify | `apps/api/src/app.module.ts` |
| Files NOT to modify | 공통(§0.3) |
| Verification (AND) | 1) 기능: 정상 생성 201 + 본문 검증, `VALIDATION_FAILED` 케이스 unit/e2e 2) 권한(negative): 미인증 → `AUTH_REQUIRED`; Limited Reviewer/Knowledge Manager 역할 → `PERMISSION_DENIED` 3) 감사: 생성 1건당 `CLIENT_CREATED` 1건(client_id 참조만, 이름 등 원문 metadata 금지 — normalizer 경유) 4) 회귀: 기존 suite green |
| Edge cases | (a) 요청 body에 tenant_id 포함 시 무시하고 context 값 강제 (b) name 공백/1000자 초과 → VALIDATION_FAILED (c) 중복 호출(같은 payload 2회) → 2건 생성 허용(멱등성 키는 범위 외) |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.5) |

#### MATTER-CLIEMANA-CLIEREGI-TUW-003 — client detail API 구현

| 필드 | 값 |
|---|---|
| ID | MATTER-CLIEMANA-CLIEREGI-TUW-003 |
| Title | client detail API 구현 |
| Release | R1 |
| Module | MATTER-CLIEMANA-CLIEREGI |
| Risk | M |
| Size | S |
| Depends_on | MATTER-CLIEMANA-CLIEREGI-TUW-002 |
| Objective | `GET /v1/clients/{clientId}`가 동일 tenant의 인증 사용자에게 client 상세를 반환하고 타 tenant 자원은 존재 여부조차 노출하지 않는다. |
| Files to create | `apps/api/src/modules/client/dto/client-detail.dto.ts` |
| Files to modify | `apps/api/src/modules/client/client.controller.ts`, `apps/api/src/modules/client/client.service.ts`, `apps/api/src/modules/client/client.service.spec.ts` |
| Files NOT to modify | 공통(§0.3) |
| Verification (AND) | 1) 기능: 정상 조회 200 2) 권한(negative): 타 tenant clientId 조회 → 404(존재 비노출, `TENANT_ISOLATION_VIOLATION` 내부 기록) integration test 3) 회귀: 기존 suite green |
| Edge cases | (a) 잘못된 UUID 형식 → VALIDATION_FAILED (b) dormant·closed client 조회는 허용(읽기) |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.5) |

#### MATTER-CLIEMANA-CLIEREGI-TUW-004 — client list filtering 구현

| 필드 | 값 |
|---|---|
| ID | MATTER-CLIEMANA-CLIEREGI-TUW-004 |
| Title | client list filtering 구현 |
| Release | R1 |
| Module | MATTER-CLIEMANA-CLIEREGI |
| Risk | M |
| Size | S |
| Depends_on | MATTER-CLIEMANA-CLIEREGI-TUW-003 |
| Objective | `GET /v1/clients?status=&clientType=&q=`가 tenant 범위 내에서 필터·부분일치 검색·페이지네이션(기본 20, 최대 100)을 제공한다. |
| Files to create | `apps/api/src/modules/client/dto/list-clients.query.ts` |
| Files to modify | `apps/api/src/modules/client/client.controller.ts`, `apps/api/src/modules/client/client.service.ts`, `apps/api/src/modules/client/client.service.spec.ts` |
| Files NOT to modify | 공통(§0.3) |
| Verification (AND) | 1) 기능: 필터 조합·페이지네이션 unit test 2) 권한(negative): 타 tenant 데이터가 결과·totalCount에 미포함 integration test 3) 회귀: 기존 suite green |
| Edge cases | (a) q에 SQL 메타문자(`%`, `_`, `'`) → 이스케이프 후 literal 매칭 (b) pageSize>100 → 100으로 클램프 (c) 결과 0건 → 빈 배열+totalCount 0 |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.5) |

#### MATTER-CLIEMANA-CLIEREGI-TUW-005 — client metadata editor 구현

| 필드 | 값 |
|---|---|
| ID | MATTER-CLIEMANA-CLIEREGI-TUW-005 |
| Title | client metadata editor 구현 |
| Release | R1 |
| Module | MATTER-CLIEMANA-CLIEREGI |
| Risk | M |
| Size | M |
| Depends_on | MATTER-CLIEMANA-CLIEREGI-TUW-004 |
| Objective | `PATCH /v1/clients/{clientId}`가 Firm Admin·Matter Owner에 한해 name·client_type·confidentiality_level·status를 수정하고 `CLIENT_UPDATED` audit(변경 필드명 목록 `diff_keys`만)을 기록한다. |
| Files to create | `apps/api/src/modules/client/dto/update-client.dto.ts` |
| Files to modify | `apps/api/src/modules/client/client.controller.ts`, `apps/api/src/modules/client/client.service.ts`, `apps/api/src/modules/client/client.service.spec.ts` |
| Files NOT to modify | 공통(§0.3) |
| Verification (AND) | 1) 기능: 부분 수정 200, 알 수 없는 필드 무시 또는 VALIDATION_FAILED(zod strict) 2) 권한(negative): Matter Member 역할 수정 시도 → `PERMISSION_DENIED` 3) 감사: 수정 1건당 `CLIENT_UPDATED` 1건, metadata에 diff_keys만 존재(변경 전후 값 미기록) 4) 회귀: 기존 suite green |
| Edge cases | (a) 빈 PATCH body → no-op + audit 미발생 (b) client_id 자체 변경 시도 → 거부 (c) 타 tenant clientId → 404 |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.5) |

---

### 2.3 MATTER-MATTMANA-MATTREGI — Matter Management / Matter Registry (001~007)

#### MATTER-MATTMANA-MATTREGI-TUW-001 — Matter schema 구현

| 필드 | 값 |
|---|---|
| ID | MATTER-MATTMANA-MATTREGI-TUW-001 |
| Title | Matter schema 구현 |
| Release | R1 |
| Module | MATTER-MATTMANA-MATTREGI (Matter Management / Matter Registry) |
| Risk | H |
| Size | M |
| Depends_on | MATTER-CLIEMANA-CLIEREGI-TUW-001, CORE-DATACORE-MIGR-TUW-005 (R0) |
| Objective | `matters` 테이블(matter_id PK, tenant_id NOT NULL, client_id FK→clients, matter_code NOT NULL — UNIQUE(tenant_id, matter_code), matter_name, matter_type, status DEFAULT 'proposed', practice_group NULL 허용, opened_at, closed_at, lead_lawyer_id FK→users, metadata_json, created_by, created_at, updated_at — 컬럼 상세는 20번 §4.3이 규범)을 RLS와 함께 생성한다. **주의: `ai_policy_id`·`legal_hold` 컬럼은 R2 범위(AI-AIPOLI-SCHEMAONLY-TUW-001, RECORD-HOLDIF-INTERFACE-TUW-001) — R1에서 생성 금지.** |
| Files to create | `db/migrations/NNNN_create_matters.sql`, `apps/api/src/modules/matter/matter.entity.ts`, `packages/shared/src/matter/matter.dto.ts` |
| Files to modify | 없음 |
| Files NOT to modify | 공통(§0.3) + `packages/ai/**` (ai_policy 관련 어떤 흔적도 금지) |
| Verification (AND) | 1) 기능: migrate green, FK·CHECK·RLS 존재 검증 2) 권한(negative): cross-tenant SELECT 0행, 타 tenant client_id로 FK 연결 시도 거부(트리거 또는 service 검증, 최소 service 계층 보장) 3) 회귀: rollback 왕복 + 기존 suite green |
| Edge cases | (a) client_id가 동일 tenant 소속인지 검증(복합 FK (tenant_id, client_id) 권장) (b) closed_at < opened_at 입력 → CHECK 거부 (c) status 초기값은 'proposed'만 허용 (d) 동일 tenant 내 matter_code 중복 INSERT → UNIQUE 거부 |
| Stop condition | 공통(§0.4) + 20번 문서(데이터 모델 v1.1)와 컬럼 불일치 발견 시 |
| Escalation | 공통(§0.5) |

#### MATTER-MATTMANA-MATTREGI-TUW-002 — Matter create API 구현

| 필드 | 값 |
|---|---|
| ID | MATTER-MATTMANA-MATTREGI-TUW-002 |
| Title | Matter create API 구현 |
| Release | R1 |
| Module | MATTER-MATTMANA-MATTREGI |
| Risk | H |
| Size | M |
| Depends_on | MATTER-MATTMANA-MATTREGI-TUW-001, AUDIT-AUDIEVENCO-AUDILOGG-TUW-002, CORE-TENACORE-TENACONT-TUW-002 (R0) |
| Objective | `POST /v1/matters`가 인증 사용자(Firm Admin·Matter Owner)에 한해 matter를 생성(status='proposed')하고 `MATTER_CREATED` audit를 동일 트랜잭션으로 기록한다. |
| Files to create | `apps/api/src/modules/matter/matter.module.ts`, `apps/api/src/modules/matter/matter.controller.ts`, `apps/api/src/modules/matter/matter.service.ts`, `apps/api/src/modules/matter/matter.service.spec.ts`, `apps/api/src/modules/matter/dto/create-matter.dto.ts` |
| Files to modify | `apps/api/src/app.module.ts` |
| Files NOT to modify | 공통(§0.3) |
| Verification (AND) | 1) 기능: 정상 생성 201, 존재하지 않는 client_id → VALIDATION_FAILED 2) 권한(negative): 타 tenant의 client_id 지정 → 404/`PERMISSION_DENIED`(존재 비노출); 비인가 역할 생성 시도 차단 3) 감사: `MATTER_CREATED` 1건(matter_id·client_id 참조만) 4) 회귀: 기존 suite green |
| Edge cases | (a) lead_lawyer_id가 타 tenant 사용자 → 거부 (b) lead_lawyer의 matter_members 자동 등록은 MEMBMANA-002에서 연결(여기서는 생성+audit만 — 코드에 연결 지점 주석 명시) (c) opened_at 미지정 시 NULL 유지(open 전이 시 기록) |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.5) |

#### MATTER-MATTMANA-MATTREGI-TUW-003 — Matter type taxonomy enum 구현

| 필드 | 값 |
|---|---|
| ID | MATTER-MATTMANA-MATTREGI-TUW-003 |
| Title | Matter type taxonomy enum 구현 |
| Release | R1 |
| Module | MATTER-MATTMANA-MATTREGI |
| Risk | M |
| Size | S |
| Depends_on | MATTER-MATTMANA-MATTREGI-TUW-002 |
| Objective | matter_type v1 taxonomy(20번 §4.3 CHECK 10종: `advisory|contract|ma|litigation|arbitration|investigation|compliance|ip|finance|other`)를 shared enum + DB CHECK로 고정하여 API·DB가 동일 어휘를 강제한다. |
| Files to create | `packages/shared/src/matter/matter-type.ts`, `db/migrations/NNNN_matter_type_check.sql` |
| Files to modify | `apps/api/src/modules/matter/dto/create-matter.dto.ts`, `apps/api/src/modules/matter/matter.service.spec.ts` |
| Files NOT to modify | 공통(§0.3) |
| Verification (AND) | 1) 기능: enum 외 값 API 거부(VALIDATION_FAILED) + DB CHECK 거부 unit/integration test 2) 회귀: 기존 fixture matter들이 신규 CHECK 통과(seed 보정 포함) |
| Edge cases | (a) 대소문자 변형 입력(`MA`, `Litigation`) → 거부(정규화 없음, 소문자 고정) (b) 향후 값 추가 절차를 파일 주석에 명시(마이그레이션+enum 동시 변경 — 20번 §4.3 "CHECK 교체 마이그레이션" 규약) |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.5) |

#### MATTER-MATTMANA-MATTREGI-TUW-004 — Matter metadata validation 구현

| 필드 | 값 |
|---|---|
| ID | MATTER-MATTMANA-MATTREGI-TUW-004 |
| Title | Matter metadata validation 구현 |
| Release | R1 |
| Module | MATTER-MATTMANA-MATTREGI |
| Risk | M |
| Size | S |
| Depends_on | MATTER-MATTMANA-MATTREGI-TUW-003 |
| Objective | matter 생성·수정 입력에 대한 zod 기반 검증(필수 필드, 길이 한도, 날짜 정합 opened_at ≤ closed_at, client 존재·동일 tenant)을 단일 validator로 통합하고 실패를 `VALIDATION_FAILED` 표준 응답으로 반환한다. |
| Files to create | `packages/shared/src/matter/matter-validation.ts`, `packages/shared/src/matter/matter-validation.spec.ts` |
| Files to modify | `apps/api/src/modules/matter/matter.service.ts`, `apps/api/src/modules/matter/dto/create-matter.dto.ts` |
| Files NOT to modify | 공통(§0.3) |
| Verification (AND) | 1) 기능: 유효/무효 케이스 표 기반 unit test(최소 10케이스) 2) 회귀: 기존 suite green |
| Edge cases | (a) matter_name 앞뒤 공백 trim 후 길이 검증 (b) 미래 날짜 opened_at 허용(예정 사건) (c) 알 수 없는 키 strict 거부 |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.5) |

#### MATTER-MATTMANA-MATTREGI-TUW-005 — Matter detail API 구현

| 필드 | 값 |
|---|---|
| ID | MATTER-MATTMANA-MATTREGI-TUW-005 |
| Title | Matter detail API 구현 |
| Release | R1 |
| Module | MATTER-MATTMANA-MATTREGI |
| Risk | H |
| Size | M |
| Depends_on | MATTER-MATTMANA-MATTREGI-TUW-004 |
| Objective | `GET /v1/matters/{matterId}`가 tenant 격리 하에 matter 상세를 반환하되, PermissionService 연결 전까지 **보수적 가드(lead_lawyer 본인 또는 Firm Admin만 허용)** 를 적용한다 — 가드 완화가 아니라 SEC-MATTPERM-ACCECONT-TUW-004에서 canReadMatter로 **교체**된다(fail-closed 유지). |
| Files to create | `apps/api/src/modules/matter/dto/matter-detail.dto.ts` |
| Files to modify | `apps/api/src/modules/matter/matter.controller.ts`, `apps/api/src/modules/matter/matter.service.ts`, `apps/api/src/modules/matter/matter.service.spec.ts` |
| Files NOT to modify | 공통(§0.3) |
| Verification (AND) | 1) 기능: lead_lawyer 본인 조회 200 2) 권한(negative): 타 tenant matterId → 404; lead가 아닌 동일 tenant 사용자 → `PERMISSION_DENIED`(보수적 가드 증명) integration test 3) 회귀: 기존 suite green |
| Edge cases | (a) 잘못된 UUID → VALIDATION_FAILED (b) 보수적 가드 교체 지점에 `// REPLACED-BY: SEC-MATTPERM-ACCECONT-TUW-004` 주석 필수 |
| Stop condition | 공통(§0.4) + 보수적 가드 없이 공개 접근이 요구되는 설계 압력 발생 시(허용 금지 — 중단·보고) |
| Escalation | 공통(§0.5) |

#### MATTER-MATTMANA-MATTREGI-TUW-006 — Matter list pagination 구현

| 필드 | 값 |
|---|---|
| ID | MATTER-MATTMANA-MATTREGI-TUW-006 |
| Title | Matter list pagination 구현 |
| Release | R1 |
| Module | MATTER-MATTMANA-MATTREGI |
| Risk | M |
| Size | S |
| Depends_on | MATTER-MATTMANA-MATTREGI-TUW-005 |
| Objective | `GET /v1/matters?status=&matterType=&clientId=&page=&pageSize=`가 페이지네이션(기본 20, 최대 100)·정렬(opened_at desc 기본)을 제공하되, MATTREGI-005와 동일한 보수적 가드 범위(자신이 lead인 matter + Firm Admin은 tenant 전체) 내 결과만 반환한다(SEC-MATTPERM-ACCECONT-TUW-005가 membership 기반 필터로 교체). |
| Files to create | `apps/api/src/modules/matter/dto/list-matters.query.ts` |
| Files to modify | `apps/api/src/modules/matter/matter.controller.ts`, `apps/api/src/modules/matter/matter.service.ts`, `apps/api/src/modules/matter/matter.service.spec.ts` |
| Files NOT to modify | 공통(§0.3) |
| Verification (AND) | 1) 기능: 필터·페이지·정렬 unit test 2) 권한(negative): 타인 lead matter가 결과·totalCount에 미포함; 타 tenant 미포함 3) 회귀: 기존 suite green |
| Edge cases | (a) page=0/음수 → VALIDATION_FAILED (b) 존재하지 않는 clientId 필터 → 빈 결과(오류 아님) (c) 교체 지점 주석 `// REPLACED-BY: SEC-MATTPERM-ACCECONT-TUW-005` |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.5) |

#### MATTER-MATTMANA-MATTREGI-TUW-007 — Matter status badge UI 구현

| 필드 | 값 |
|---|---|
| ID | MATTER-MATTMANA-MATTREGI-TUW-007 |
| Title | Matter status badge UI 구현 |
| Release | R1 |
| Module | MATTER-MATTMANA-MATTREGI |
| Risk | L |
| Size | S |
| Depends_on | MATTER-MATTMANA-MATTREGI-TUW-006, MATTER-MATTLIFE-STATENGI-TUW-001, CORE-FESHELL-APPSHELL-TUW-002 (R0) |
| Objective | 8개 matter 상태 각각에 대한 시각 구분 배지 컴포넌트를 디자인시스템(shadcn) 기반으로 구현하고 matter 목록·상세 화면에 적용한다. |
| Files to create | `apps/web/src/components/matter/matter-status-badge.tsx`, `apps/web/src/components/matter/matter-status-badge.test.tsx`, `apps/web/src/app/matters/page.tsx`, `apps/web/src/app/matters/[matterId]/page.tsx` |
| Files to modify | `apps/web/src/lib/api-client.ts` (matters 조회 함수 추가) |
| Files NOT to modify | 공통(§0.3) + `apps/api/**` (본 TUW는 프론트 전용) |
| Verification (AND) | 1) 기능: 8상태 전부 렌더링 스냅샷/단위 test — `pnpm test` 2) 기능: `pnpm build` green (Next.js 빌드 포함) 3) 회귀: 기존 suite green |
| Edge cases | (a) 알 수 없는 상태 문자열 수신 → fallback 배지(오류 아님, 'unknown' 표기) (b) 로그인 전 접근 → R0 auth guard로 로그인 화면 이동 |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.5) |

---

### 2.4 MATTER-MATTTEAM-MEMBMANA — Matter Team / Member Manager (001~006)

#### MATTER-MATTTEAM-MEMBMANA-TUW-001 — Matter member schema 구현

| 필드 | 값 |
|---|---|
| ID | MATTER-MATTTEAM-MEMBMANA-TUW-001 |
| Title | Matter member schema 구현 |
| Release | R1 |
| Module | MATTER-MATTTEAM-MEMBMANA (Matter Team / Member Manager) |
| Risk | H |
| Size | M |
| Depends_on | MATTER-MATTMANA-MATTREGI-TUW-001, CORE-DATACORE-MIGR-TUW-005 (R0) |
| Objective | `matter_members` 테이블(matter_id FK, user_id FK, tenant_id NOT NULL — 원천 07 누락분 보강(C-7), matter_role `owner|member|limited_reviewer`, access_level `read|edit`, added_by, added_at, PK(matter_id, user_id))을 RLS와 함께 생성한다 — matter_members는 모든 matter ALLOW의 필요조건이 되는 권한 기준 테이블(Brief §5.4). |
| Files to create | `db/migrations/NNNN_create_matter_members.sql`, `apps/api/src/modules/matter/matter-member.entity.ts`, `packages/shared/src/matter/matter-member.dto.ts` (matter_role·access_level enum 포함) |
| Files to modify | 없음 |
| Files NOT to modify | 공통(§0.3) |
| Verification (AND) | 1) 기능: migrate green, PK·FK·CHECK·RLS 검증 2) 권한(negative): cross-tenant SELECT 0행; matter와 user가 서로 다른 tenant인 행 INSERT 거부(복합 FK 또는 trigger) 3) 회귀: rollback 왕복 + 기존 suite green |
| Edge cases | (a) 동일 (matter_id, user_id) 중복 INSERT → PK 거부 (b) matter_role enum 외 값 → CHECK 거부 (c) added_by NULL 금지 |
| Stop condition | 공통(§0.4) + 권한 평가 계약(Brief §5.4)과 컬럼 의미 충돌 발견 시 |
| Escalation | 공통(§0.5) |

#### MATTER-MATTTEAM-MEMBMANA-TUW-002 — member add API 구현

| 필드 | 값 |
|---|---|
| ID | MATTER-MATTTEAM-MEMBMANA-TUW-002 |
| Title | member add API 구현 |
| Release | R1 |
| Module | MATTER-MATTTEAM-MEMBMANA |
| Risk | H |
| Size | M |
| Depends_on | MATTER-MATTTEAM-MEMBMANA-TUW-001, SEC-RBAC-ROLEMATR-TUW-001, AUDIT-AUDIEVENCO-AUDILOGG-TUW-002 |
| Objective | `POST /v1/matters/{matterId}/members`가 해당 matter의 owner 또는 Firm Admin에 한해 멤버를 추가하고, matter 생성 시 lead_lawyer를 owner로 자동 등록하는 연결을 완성한다. |
| Files to create | `apps/api/src/modules/matter/matter-member.controller.ts`, `apps/api/src/modules/matter/matter-member.service.ts`, `apps/api/src/modules/matter/matter-member.service.spec.ts`, `apps/api/src/modules/matter/dto/add-member.dto.ts` |
| Files to modify | `apps/api/src/modules/matter/matter.module.ts`, `apps/api/src/modules/matter/matter.service.ts` (생성 시 lead_lawyer owner 자동 등록 — MATTREGI-002의 주석 지점) |
| Files NOT to modify | 공통(§0.3) |
| Verification (AND) | 1) 기능: 정상 추가 201; matter 생성 → lead_lawyer가 owner로 자동 등록됨 integration test 2) 권한(negative): owner 아닌 member의 추가 시도 → `PERMISSION_DENIED`; 타 tenant 사용자 추가 시도 → 거부 3) 감사: 추가 1건당 `MATTER_MEMBER_ADDED` 1건(연결 의무는 MEMBMANA-006에서 검증 — 본 TUW에서 이벤트 호출 코드 작성) 4) 회귀: 기존 suite green |
| Edge cases | (a) 이미 멤버인 사용자 재추가 → 409/VALIDATION_FAILED (b) closed/archived matter에 추가 → 거부(STATENGI-005 가드 적용 후 회귀 유지) (c) External User 역할 사용자 추가 시도 → 거부(R11 전 금지) |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.5) |

#### MATTER-MATTTEAM-MEMBMANA-TUW-003 — member remove API 구현

| 필드 | 값 |
|---|---|
| ID | MATTER-MATTTEAM-MEMBMANA-TUW-003 |
| Title | member remove API 구현 |
| Release | R1 |
| Module | MATTER-MATTTEAM-MEMBMANA |
| Risk | H |
| Size | S |
| Depends_on | MATTER-MATTTEAM-MEMBMANA-TUW-002 |
| Objective | `DELETE /v1/matters/{matterId}/members/{userId}`가 owner·Firm Admin에 한해 멤버를 제거하되 마지막 owner 제거를 차단한다. |
| Files to create | 없음 |
| Files to modify | `apps/api/src/modules/matter/matter-member.controller.ts`, `apps/api/src/modules/matter/matter-member.service.ts`, `apps/api/src/modules/matter/matter-member.service.spec.ts` |
| Files NOT to modify | 공통(§0.3) |
| Verification (AND) | 1) 기능: 정상 제거 204 2) 권한(negative): 일반 member의 제거 시도 → `PERMISSION_DENIED` 3) 감사: `MATTER_MEMBER_REMOVED` 호출 코드 포함(검증은 006) 4) 회귀: 기존 suite green |
| Edge cases | (a) 마지막 owner 제거 → `VALIDATION_FAILED`(사유 코드 `LAST_OWNER`) (b) 멤버 아닌 userId 제거 → 404 (c) 자기 자신 제거: owner 본인이 마지막 owner면 차단, 아니면 허용 |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.5) |

#### MATTER-MATTTEAM-MEMBMANA-TUW-004 — matter role assignment 구현

| 필드 | 값 |
|---|---|
| ID | MATTER-MATTTEAM-MEMBMANA-TUW-004 |
| Title | matter role assignment 구현 |
| Release | R1 |
| Module | MATTER-MATTTEAM-MEMBMANA |
| Risk | H |
| Size | S |
| Depends_on | MATTER-MATTTEAM-MEMBMANA-TUW-003 |
| Objective | `PATCH /v1/matters/{matterId}/members/{userId}`가 owner·Firm Admin에 한해 matter_role·access_level을 변경하되 마지막 owner의 강등을 차단한다. |
| Files to create | `apps/api/src/modules/matter/dto/update-member.dto.ts` |
| Files to modify | `apps/api/src/modules/matter/matter-member.controller.ts`, `apps/api/src/modules/matter/matter-member.service.ts`, `apps/api/src/modules/matter/matter-member.service.spec.ts` |
| Files NOT to modify | 공통(§0.3) |
| Verification (AND) | 1) 기능: role/access_level 변경 200 2) 권한(negative): member의 자기 승급 시도 → `PERMISSION_DENIED` 3) 감사: `MATTER_MEMBER_ROLE_CHANGED` 호출 코드 포함(role_before/role_after — 검증은 006) 4) 회귀: 기존 suite green |
| Edge cases | (a) 마지막 owner → member 강등 → 차단(`LAST_OWNER`) (b) 동일 값으로 변경 → no-op + audit 미발생 (c) limited_reviewer에 access_level='edit' 조합 → 거부(읽기 전용 역할) |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.5) |

#### MATTER-MATTTEAM-MEMBMANA-TUW-005 — matter team UI 구현

| 필드 | 값 |
|---|---|
| ID | MATTER-MATTTEAM-MEMBMANA-TUW-005 |
| Title | matter team UI 구현 |
| Release | R1 |
| Module | MATTER-MATTTEAM-MEMBMANA |
| Risk | M |
| Size | M |
| Depends_on | MATTER-MATTTEAM-MEMBMANA-TUW-004, CORE-FESHELL-APPSHELL-TUW-003 (R0) |
| Objective | matter 상세 내 팀 탭에서 멤버 목록 조회·추가·제거·역할 변경 UI를 제공하되, 비-owner에게는 변경 컨트롤이 렌더링되지 않고 API 거부 응답을 안전 메시지로 표시한다. |
| Files to create | `apps/web/src/app/matters/[matterId]/team/page.tsx`, `apps/web/src/components/matter/team-member-list.tsx`, `apps/web/src/components/matter/add-member-dialog.tsx`, `apps/web/src/components/matter/team-member-list.test.tsx` |
| Files to modify | `apps/web/src/lib/api-client.ts` |
| Files NOT to modify | 공통(§0.3) + `apps/api/**` |
| Verification (AND) | 1) 기능: 목록 렌더·추가·제거·변경 흐름 컴포넌트 test 2) 권한(negative): 비-owner 뷰에서 변경 버튼 미렌더 + API `PERMISSION_DENIED` 수신 시 대상 정보가 노출되지 않는 안전 메시지 표시 test 3) 기능: `pnpm build` green 4) 회귀: 기존 suite green |
| Edge cases | (a) 멤버 0명(이론상 불가 — 방어적 빈 상태 UI) (b) 동시 변경 충돌(409) 수신 시 재조회 (c) 본인 제거 후 접근 권한 상실 → matter 목록으로 리다이렉트 |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.5) |

#### MATTER-MATTTEAM-MEMBMANA-TUW-006 — member change audit hook 연결

| 필드 | 값 |
|---|---|
| ID | MATTER-MATTTEAM-MEMBMANA-TUW-006 |
| Title | member change audit hook 연결 |
| Release | R1 |
| Module | MATTER-MATTTEAM-MEMBMANA |
| Risk | H |
| Size | S |
| Depends_on | MATTER-MATTTEAM-MEMBMANA-TUW-005, AUDIT-AUDIEVENCO-AUDILOGG-TUW-003 |
| Objective | 멤버 추가·제거·역할변경 3개 경로 전부가 `MATTER_MEMBER_ADDED`/`MATTER_MEMBER_REMOVED`/`MATTER_MEMBER_ROLE_CHANGED` audit event를 누락 없이(트랜잭션 결합) 기록함을 커버리지 테스트로 보증한다. |
| Files to create | `tests/integration/audit/member-change-audit.spec.ts` |
| Files to modify | `apps/api/src/modules/matter/matter-member.service.ts` (누락 경로 보완), `apps/api/src/modules/matter/matter-member.service.spec.ts` |
| Files NOT to modify | 공통(§0.3) |
| Verification (AND) | 1) 감사: 3개 변이 경로 각각 이벤트 1건, 필수 metadata(member_user_id, role_before/role_after — normalizer 화이트리스트 준수) — `pnpm test:integration` 2) 감사(negative): audit INSERT 실패 주입 시 멤버 변이도 rollback 3) 권한 회귀: 비인가 시도는 이벤트 미발생(ACCESS_DENIED는 PERMEVEN-002 범위) 4) 회귀: 기존 suite green |
| Edge cases | (a) lead_lawyer 자동 등록 경로도 `MATTER_MEMBER_ADDED` 발생 (b) no-op PATCH는 이벤트 미발생 (c) metadata에 사용자 이름·이메일 원문 미기록(ID만) |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.5) |

---

### 2.5 MATTER-MATTLIFE-STATENGI — Matter Lifecycle / State Engine (001~005)

#### MATTER-MATTLIFE-STATENGI-TUW-001 — Matter state enum(8상태) 구현

| 필드 | 값 |
|---|---|
| ID | MATTER-MATTLIFE-STATENGI-TUW-001 |
| Title | Matter state enum(8상태) 구현 |
| Release | R1 |
| Module | MATTER-MATTLIFE-STATENGI (Matter Lifecycle / State Engine) |
| Risk | M |
| Size | S |
| Depends_on | MATTER-MATTMANA-MATTREGI-TUW-001 |
| Objective | 원천 07 §4 그대로 Matter 8상태(`proposed|open|active|closing|closed|archived|disposal_review|disposed`)를 `packages/domain`에 순수 TS enum으로 구현하고 DB CHECK와 정합시킨다(IO 없음 — Brief §4). |
| Files to create | `packages/domain/src/matter/matter-state.ts`, `packages/domain/src/matter/matter-state.spec.ts`, `db/migrations/NNNN_matter_status_check.sql` |
| Files to modify | `packages/shared/src/matter/matter.dto.ts` (상태 타입을 domain enum 참조로) |
| Files NOT to modify | 공통(§0.3) + `packages/domain` 내 다른 도메인 파일 |
| Verification (AND) | 1) 기능: enum 8개 값·순서 고정 unit test, DB CHECK 거부 테스트 2) 회귀: 기존 matter fixture 상태값 정합 + suite green |
| Edge cases | (a) `disposal_review`·`disposed`는 R12 전 전이 불가(전이표에서 차단 — 002) (b) 직렬화 시 소문자 snake 고정 |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.5) |

#### MATTER-MATTLIFE-STATENGI-TUW-002 — state transition validation 구현

| 필드 | 값 |
|---|---|
| ID | MATTER-MATTLIFE-STATENGI-TUW-002 |
| Title | state transition validation 구현 |
| Release | R1 |
| Module | MATTER-MATTLIFE-STATENGI |
| Risk | H |
| Size | M |
| Depends_on | MATTER-MATTLIFE-STATENGI-TUW-001, AUDIT-AUDIEVENCO-AUDILOGG-TUW-002 |
| Objective | 허용 전이표(proposed→open→active→closing→closed→archived; disposal 계열 전이는 R12 전 전부 거부)를 `packages/domain` 순수 함수 `validateMatterTransition(from, to)`로 구현하고, `PATCH /v1/matters/{matterId}/status`가 이를 강제하며 `MATTER_STATUS_CHANGED` audit를 기록한다. |
| Files to create | `packages/domain/src/matter/matter-transitions.ts`, `packages/domain/src/matter/matter-transitions.spec.ts`, `apps/api/src/modules/matter/dto/update-matter-status.dto.ts` |
| Files to modify | `apps/api/src/modules/matter/matter.controller.ts`, `apps/api/src/modules/matter/matter.service.ts`, `apps/api/src/modules/matter/matter.service.spec.ts` |
| Files NOT to modify | 공통(§0.3) |
| Verification (AND) | 1) 기능: 8×8 전이 행렬 전수 unit test(허용 5·나머지 거부) 2) 권한(negative): owner·Firm Admin 외 상태 변경 시도 → `PERMISSION_DENIED` 3) 감사: 전이 성공 1건당 `MATTER_STATUS_CHANGED` 1건(before/after 상태값) 4) 회귀: 기존 suite green |
| Edge cases | (a) 동일 상태로 전이 → no-op 거부(VALIDATION_FAILED) (b) open 전이 시 opened_at 자동 기록 (c) 역방향 전이(active→open 등) 전부 거부 — reopen은 R1 범위 외 |
| Stop condition | 공통(§0.4) + 전이표 외 전이가 업무상 필요하다는 판단이 필요한 경우(임의 허용 금지) |
| Escalation | 공통(§0.5) |

#### MATTER-MATTLIFE-STATENGI-TUW-003 — closing state action 구현

| 필드 | 값 |
|---|---|
| ID | MATTER-MATTLIFE-STATENGI-TUW-003 |
| Title | closing state action 구현 |
| Release | R1 |
| Module | MATTER-MATTLIFE-STATENGI |
| Risk | M |
| Size | S |
| Depends_on | MATTER-MATTLIFE-STATENGI-TUW-002 |
| Objective | closing→closed 전이 액션이 closed_at을 기록하고 owner·Firm Admin에 한해 실행되며 audit로 추적된다. |
| Files to create | 없음 |
| Files to modify | `apps/api/src/modules/matter/matter.service.ts`, `apps/api/src/modules/matter/matter.service.spec.ts` |
| Files NOT to modify | 공통(§0.3) |
| Verification (AND) | 1) 기능: closing→closed 시 closed_at 기록 2) 권한(negative): 일반 member의 close 시도 차단 3) 감사: `MATTER_STATUS_CHANGED` 기록 4) 회귀: 기존 suite green |
| Edge cases | (a) closed_at 기존 값 존재 시(재close 불가) 거부 (b) active→closed 직행 거부(closing 경유 강제) |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.5) |

#### MATTER-MATTLIFE-STATENGI-TUW-004 — archive state action 구현

| 필드 | 값 |
|---|---|
| ID | MATTER-MATTLIFE-STATENGI-TUW-004 |
| Title | archive state action 구현 |
| Release | R1 |
| Module | MATTER-MATTLIFE-STATENGI |
| Risk | M |
| Size | S |
| Depends_on | MATTER-MATTLIFE-STATENGI-TUW-003 |
| Objective | closed→archived 전이 액션이 owner·Firm Admin에 한해 실행되고 archive 시점이 audit로 추적된다(hard delete·보존 변경 없음 — DEC-12). |
| Files to create | 없음 |
| Files to modify | `apps/api/src/modules/matter/matter.service.ts`, `apps/api/src/modules/matter/matter.service.spec.ts` |
| Files NOT to modify | 공통(§0.3) |
| Verification (AND) | 1) 기능: closed→archived 200 2) 권한(negative): 비인가 archive 차단 3) 감사: `MATTER_STATUS_CHANGED` 기록 4) 회귀: 기존 suite green |
| Edge cases | (a) closing 상태에서 archive 직행 거부 (b) archived 재호출 → 거부 |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.5) |

#### MATTER-MATTLIFE-STATENGI-TUW-005 — closed matter mutation 차단 구현

| 필드 | 값 |
|---|---|
| ID | MATTER-MATTLIFE-STATENGI-TUW-005 |
| Title | closed matter mutation 차단 구현 |
| Release | R1 |
| Module | MATTER-MATTLIFE-STATENGI |
| Risk | H |
| Size | M |
| Depends_on | MATTER-MATTLIFE-STATENGI-TUW-004 |
| Objective | closed·archived 상태 matter에 대한 모든 변이(메타데이터 수정·멤버 추가/제거/역할변경·party 추가)가 서비스 계층 단일 가드에서 `VALIDATION_FAILED`(사유 `MATTER_CLOSED`)로 차단된다 — 읽기는 허용, 예외는 archive 전이 자체뿐. |
| Files to create | `apps/api/src/modules/matter/guards/matter-mutability.guard.ts`, `tests/integration/matter/closed-matter-mutation.spec.ts` |
| Files to modify | `apps/api/src/modules/matter/matter.service.ts`, `apps/api/src/modules/matter/matter-member.service.ts`, `apps/api/src/modules/party/party.service.ts` (가드 호출) |
| Files NOT to modify | 공통(§0.3) |
| Verification (AND) | 1) 기능: closed matter에 대한 변이 4종(메타·멤버추가·멤버역할·party) 전부 차단 integration test 2) 권한(negative): Firm Admin도 변이 불가(상태 가드는 role 무관) 3) 회귀: open/active matter의 동일 변이는 정상 동작 + 기존 suite green |
| Edge cases | (a) closed→archived 전이는 가드 예외로 허용 (b) 가드와 권한 검사 순서: 권한 거부가 우선(정보 노출 최소화) (c) party.service가 아직 없으면(병행 개발) 가드 호출 지점을 PARTREGI-003에서 연결하고 본 TUW 테스트에 포함 |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.5) |

---

### 2.6 MATTER-PARTMANA-PARTREGI — Party Management / Party Registry (001~005)

#### MATTER-PARTMANA-PARTREGI-TUW-001 — Party schema 구현

| 필드 | 값 |
|---|---|
| ID | MATTER-PARTMANA-PARTREGI-TUW-001 |
| Title | Party schema 구현 |
| Release | R1 |
| Module | MATTER-PARTMANA-PARTREGI (Party Management / Party Registry) |
| Risk | M |
| Size | M |
| Depends_on | MATTER-MATTMANA-MATTREGI-TUW-001, CORE-DATACORE-MIGR-TUW-005 (R0) |
| Objective | `parties` 테이블(party_id PK, tenant_id NOT NULL, matter_id FK, name, party_type, party_role, related_client_id NULL FK→clients, created_by, created_at)을 RLS와 함께 생성한다(원천 07 §3 승계). |
| Files to create | `db/migrations/NNNN_create_parties.sql`, `apps/api/src/modules/party/party.entity.ts`, `packages/shared/src/party/party.dto.ts` |
| Files to modify | 없음 |
| Files NOT to modify | 공통(§0.3) |
| Verification (AND) | 1) 기능: migrate green, FK·RLS 검증 2) 권한(negative): cross-tenant SELECT 0행 3) 회귀: rollback 왕복 + 기존 suite green |
| Edge cases | (a) related_client_id가 타 tenant client → 거부 (b) 동일 matter 내 동일 name party 허용(동명 당사자 존재 가능) |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.5) |

#### MATTER-PARTMANA-PARTREGI-TUW-002 — party role taxonomy 구현

| 필드 | 값 |
|---|---|
| ID | MATTER-PARTMANA-PARTREGI-TUW-002 |
| Title | party role taxonomy 구현 |
| Release | R1 |
| Module | MATTER-PARTMANA-PARTREGI |
| Risk | M |
| Size | S |
| Depends_on | MATTER-PARTMANA-PARTREGI-TUW-001 |
| Objective | party_type(`individual|corporation|government|other`)과 party_role(20번 §4.5 CHECK 11종: `client|counterparty|co_counsel|opposing_counsel|target|investor|lender|borrower|guarantor|witness|other`) v1 taxonomy를 shared enum + DB CHECK로 고정한다. |
| Files to create | `packages/shared/src/party/party-enums.ts`, `db/migrations/NNNN_party_taxonomy_check.sql` |
| Files to modify | `packages/shared/src/party/party.dto.ts` |
| Files NOT to modify | 공통(§0.3) |
| Verification (AND) | 1) 기능: enum 외 값 API/DB 거부 unit·integration test 2) 회귀: 기존 suite green |
| Edge cases | (a) 향후 값 추가 절차 주석 명시 (b) party_role과 party_type의 비논리 조합(government+client)은 허용(검증은 업무 영역) |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.5) |

#### MATTER-PARTMANA-PARTREGI-TUW-003 — party create API 구현

| 필드 | 값 |
|---|---|
| ID | MATTER-PARTMANA-PARTREGI-TUW-003 |
| Title | party create API 구현 |
| Release | R1 |
| Module | MATTER-PARTMANA-PARTREGI |
| Risk | M |
| Size | S |
| Depends_on | MATTER-PARTMANA-PARTREGI-TUW-002, AUDIT-AUDIEVENCO-AUDILOGG-TUW-002 |
| Objective | `POST /v1/matters/{matterId}/parties`가 matter owner·edit 권한 멤버에 한해 party를 생성하고 `PARTY_ADDED` audit를 기록한다. |
| Files to create | `apps/api/src/modules/party/party.module.ts`, `apps/api/src/modules/party/party.controller.ts`, `apps/api/src/modules/party/party.service.ts`, `apps/api/src/modules/party/party.service.spec.ts`, `apps/api/src/modules/party/dto/create-party.dto.ts` |
| Files to modify | `apps/api/src/app.module.ts` |
| Files NOT to modify | 공통(§0.3) |
| Verification (AND) | 1) 기능: 정상 생성 201 2) 권한(negative): 비멤버·read-only 멤버 생성 시도 → `PERMISSION_DENIED` 3) 감사: `PARTY_ADDED` 1건(party_id·matter_id 참조만, 당사자 이름 원문 metadata 금지) 4) 회귀: 기존 suite green |
| Edge cases | (a) closed matter에 party 추가 → `MATTER_CLOSED` 차단(STATENGI-005 가드 연결) (b) 타 tenant matterId → 404 |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.5) |

#### MATTER-PARTMANA-PARTREGI-TUW-004 — party-to-matter link 구현

| 필드 | 값 |
|---|---|
| ID | MATTER-PARTMANA-PARTREGI-TUW-004 |
| Title | party-to-matter link 구현 |
| Release | R1 |
| Module | MATTER-PARTMANA-PARTREGI |
| Risk | M |
| Size | S |
| Depends_on | MATTER-PARTMANA-PARTREGI-TUW-003 |
| Objective | `GET /v1/matters/{matterId}/parties` 목록 API와 party↔matter↔client 연결 정합성 검증(동일 tenant, related_client_id 유효성)을 제공한다. |
| Files to create | `apps/api/src/modules/party/dto/list-parties.dto.ts` |
| Files to modify | `apps/api/src/modules/party/party.controller.ts`, `apps/api/src/modules/party/party.service.ts`, `apps/api/src/modules/party/party.service.spec.ts` |
| Files NOT to modify | 공통(§0.3) |
| Verification (AND) | 1) 기능: matter별 party 목록 조회 200 2) 권한(negative): matter 읽기 권한 없는 사용자(보수적 가드 기준) → `PERMISSION_DENIED`/404 3) 회귀: 기존 suite green |
| Edge cases | (a) party 0건 → 빈 배열 (b) related_client_id가 dormant·closed client → 조회는 허용, 표시만 |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.5) |

#### MATTER-PARTMANA-PARTREGI-TUW-005 — restricted party marker 구현

| 필드 | 값 |
|---|---|
| ID | MATTER-PARTMANA-PARTREGI-TUW-005 |
| Title | restricted party marker 구현 |
| Release | R1 |
| Module | MATTER-PARTMANA-PARTREGI |
| Risk | H |
| Size | S |
| Depends_on | MATTER-PARTMANA-PARTREGI-TUW-004, SEC-RBAC-ROLEMATR-TUW-001 |
| Objective | `parties.is_restricted` boolean(기본 false)을 추가하고 Security Admin·Matter Owner만 `PATCH /v1/parties/{partyId}`로 마킹 가능하며 `PARTY_RESTRICTED_MARKED` audit를 기록한다 — 이해충돌·윤리장벽 후보 식별용 표시(시행 효과는 R3 wall enforcement·R5에서). |
| Files to create | `db/migrations/NNNN_party_restricted_marker.sql`, `apps/api/src/modules/party/dto/update-party.dto.ts` |
| Files to modify | `apps/api/src/modules/party/party.controller.ts`, `apps/api/src/modules/party/party.service.ts`, `apps/api/src/modules/party/party.service.spec.ts` |
| Files NOT to modify | 공통(§0.3) |
| Verification (AND) | 1) 기능: 마킹/해제 200 2) 권한(negative): 일반 member 마킹 시도 → `PERMISSION_DENIED` 3) 감사: 마킹 변경 1건당 `PARTY_RESTRICTED_MARKED` 1건(party_id·before/after boolean) 4) 회귀: 기존 suite green |
| Edge cases | (a) 동일 값 재설정 → no-op + audit 미발생 (b) closed matter의 party 마킹 → 허용(보안 표시는 상태 가드 예외 — 단, 본 문서 명시 외 변이는 불가) |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.5) |

---

### 2.7 SEC-RBAC-ROLEMATR — RBAC / Role Matrix (001~005)

#### SEC-RBAC-ROLEMATR-TUW-001 — role enum 7종 구현 (DEC-15)

| 필드 | 값 |
|---|---|
| ID | SEC-RBAC-ROLEMATR-TUW-001 |
| Title | role enum 7종 구현 (DEC-15) |
| Release | R1 |
| Module | SEC-RBAC-ROLEMATR (RBAC / Role Matrix) |
| Risk | M |
| Size | S |
| Depends_on | CORE-AUTHCORE-USERSESS-TUW-001 (R0) |
| Objective | DEC-15의 role 7종(`firm_admin|security_admin|matter_owner|matter_member|limited_reviewer|knowledge_manager|external_user`)과 practice_group 속성 타입을 shared enum으로 고정하고 `users.role`에 CHECK를 적용한다 — `external_user`는 enum에 존재하되 R11 전 세션 발급 차단(fail-closed). |
| Files to create | `packages/shared/src/permission/roles.ts`, `packages/shared/src/permission/roles.spec.ts`, `db/migrations/NNNN_user_role_check.sql` (CHECK + `users.practice_group TEXT NULL` 추가) |
| Files to modify | `apps/api/src/modules/auth/session.service.ts` (external_user 세션 발급 거부) |
| Files NOT to modify | 공통(§0.3) |
| Verification (AND) | 1) 기능: enum 7종 고정 unit test, CHECK 위반 거부 2) 권한(negative): role='external_user' 사용자의 로그인 → `PERMISSION_DENIED`(세션 미발급) integration test 3) 회귀: R0 login suite green |
| Edge cases | (a) 기존 users.role 값이 7종 외인 경우 migration에서 매핑 실패 → migration 중단(데이터 보정 선행) (b) practice_group은 자유 문자열(v1) — ABAC 일반화는 R5 |
| Stop condition | 공통(§0.4) + R0 users.role 기존 값과 7종 매핑 규칙이 불명확한 경우 |
| Escalation | 공통(§0.5) |

#### SEC-RBAC-ROLEMATR-TUW-002 — role permission matrix 정의 (C)

| 필드 | 값 |
|---|---|
| ID | SEC-RBAC-ROLEMATR-TUW-002 |
| Title | role permission matrix 정의 |
| Release | R1 |
| Module | SEC-RBAC-ROLEMATR |
| Risk | **C — 사람 리뷰 게이트 필수 (Codex 단독 머지 금지)** |
| Size | M |
| Depends_on | SEC-RBAC-ROLEMATR-TUW-001 |
| Objective | role 7종 × R1 action 전체(client.create/update, matter.create/read/edit/status, member.add/remove/role, party.create/restrict, user.role.assign, wall.create, audit.read)의 허용/차단 매트릭스를 **default-deny** 코드 상수로 정의하고, 매트릭스에 없는 (role, action) 조합은 무조건 거부함을 타입·테스트로 보증한다(21_Permission_Model.md와 정합). 또한 20번 §4.2·§4.6의 `permissions`·`groups`·`group_members` 테이블을 RLS와 함께 생성한다(**스키마만 생성** — 명시 permissions 행 평가·group 전개 로직은 R5, R1 권한 평가는 role matrix+membership+wall로 한정). |
| Files to create | `packages/shared/src/permission/role-permission-matrix.ts`, `packages/shared/src/permission/role-permission-matrix.spec.ts`, `packages/shared/src/permission/permission-actions.ts` (action 식별자 enum), `db/migrations/NNNN_create_permissions_groups.sql` (`permissions`·`groups`·`group_members` — 20번 §4.2·§4.6 DDL 기준, 표준 RLS 포함) |
| Files to modify | `docs/ledger/decision.md` (매트릭스 채택 항목 append) |
| Files NOT to modify | 공통(§0.3) + `docs/package/21`(이관본) — 불일치 발견 시 코드가 아니라 escalation |
| Verification (AND) | 1) 기능: 매트릭스 전 셀(7 role × 전 action) 명시 정의 — 미정의 셀 존재 시 컴파일 실패하는 타입 설계 unit test 2) 권한(negative): 매트릭스 외 임의 action 문자열 질의 → deny 반환 3) 기능: permissions·groups·group_members migrate green + 권한(negative): cross-tenant SELECT 0행(RLS) integration test + `pnpm db:rollback` 왕복 green 4) 권한(negative): R1 코드에 permissions 행 평가·group 전개 호출 경로 부재(정적 grep — 스키마만 생성 증명) 5) 회귀: 기존 suite green 6) **사람 리뷰: 매트릭스 전 셀 승인 기록(PR 승인 + decision ledger)** |
| Edge cases | (a) external_user는 전 action deny(R11 전) (b) knowledge_manager는 R1 action 전부 deny(권한 대상 기능이 R8 이후) — deny 명시 (c) matter 단위 권한(member 여부)은 본 매트릭스가 아닌 MATTPERM 평가에서 AND 결합됨을 주석 명시 (d) groups 중첩(그룹의 그룹)은 v1 금지 — 20번 §4.2 규약 주석 (e) permissions/groups에 쓰기 API는 R1 생성 금지(스키마 예약) |
| Stop condition | 공통(§0.4) + 21_Permission_Model.md와 셀 단위 충돌 발견 시 |
| Escalation | 공통(§0.5) + 충돌 셀 목록을 decision ledger에 기재 후 사람 결정 대기 |

#### SEC-RBAC-ROLEMATR-TUW-003 — role assignment API 구현

| 필드 | 값 |
|---|---|
| ID | SEC-RBAC-ROLEMATR-TUW-003 |
| Title | role assignment API 구현 |
| Release | R1 |
| Module | SEC-RBAC-ROLEMATR |
| Risk | H |
| Size | M |
| Depends_on | SEC-RBAC-ROLEMATR-TUW-002, AUDIT-AUDIEVENCO-AUDILOGG-TUW-002 |
| Objective | `PATCH /v1/users/{userId}/role`이 Firm Admin에 한해 tenant 내 사용자 role을 변경하되, `external_user` 부여는 R11 전 무조건 거부한다. |
| Files to create | `apps/api/src/modules/user/user-role.controller.ts`, `apps/api/src/modules/user/user-role.service.ts`, `apps/api/src/modules/user/user-role.service.spec.ts`, `apps/api/src/modules/user/dto/assign-role.dto.ts` |
| Files to modify | `apps/api/src/modules/user/user.module.ts` |
| Files NOT to modify | 공통(§0.3) |
| Verification (AND) | 1) 기능: 정상 변경 200 2) 권한(negative): Security Admin·Matter Owner의 role 변경 시도 → `PERMISSION_DENIED`; 타 tenant 사용자 대상 → 404; `external_user` 부여 → `PERMISSION_DENIED` 3) 감사: 부여·변경 호출 코드에 `ROLE_ASSIGNED`(신규/최초 부여)·`ROLE_CHANGED`(기존 role 변경) 이벤트 포함(완전 검증은 004) 4) 회귀: 기존 suite green |
| Edge cases | (a) 자기 자신의 firm_admin 해제 → tenant 내 마지막 firm_admin이면 차단(`LAST_ADMIN`) (b) 동일 role 재부여 → no-op + audit 미발생 (c) 비활성(status≠active) 사용자 role 변경 허용 여부: 허용(복귀 대비) |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.5) |

#### SEC-RBAC-ROLEMATR-TUW-004 — role change audit 구현

| 필드 | 값 |
|---|---|
| ID | SEC-RBAC-ROLEMATR-TUW-004 |
| Title | role change audit 구현 |
| Release | R1 |
| Module | SEC-RBAC-ROLEMATR |
| Risk | H |
| Size | S |
| Depends_on | SEC-RBAC-ROLEMATR-TUW-003, AUDIT-AUDIEVENCO-AUDILOGG-TUW-003 |
| Objective | 모든 role 부여·변경이 `ROLE_ASSIGNED`(신규/최초 부여)·`ROLE_CHANGED`(기존 role 변경) audit event(role_before/role_after, 대상 user_id, approver=actor)를 트랜잭션 결합으로 기록함을 커버리지 테스트로 보증한다(§0.7 19종·50번 R1-G3과 정합). |
| Files to create | `tests/integration/audit/role-change-audit.spec.ts` |
| Files to modify | `apps/api/src/modules/user/user-role.service.ts`, `apps/api/src/modules/user/user-role.service.spec.ts` |
| Files NOT to modify | 공통(§0.3) |
| Verification (AND) | 1) 감사: 신규 부여 1건당 `ROLE_ASSIGNED` 1건·변경 1건당 `ROLE_CHANGED` 1건 + 필수 metadata, audit 실패 주입 시 role 변경도 rollback — `pnpm test:integration` 2) 권한 회귀: 비인가 시도는 이벤트 미발생 3) 회귀: 기존 suite green |
| Edge cases | (a) metadata에 사용자 이메일·이름 원문 금지(user_id만) (b) 연속 2회 변경 시 이벤트 2건 각각 before/after 정확 |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.5) |

#### SEC-RBAC-ROLEMATR-TUW-005 — admin-only route guard 구현

| 필드 | 값 |
|---|---|
| ID | SEC-RBAC-ROLEMATR-TUW-005 |
| Title | admin-only route guard 구현 |
| Release | R1 |
| Module | SEC-RBAC-ROLEMATR |
| Risk | H |
| Size | M |
| Depends_on | SEC-RBAC-ROLEMATR-TUW-004, CORE-SECFOUND-FAILCLOSE-TUW-001 (R0) |
| Objective | NestJS guard `@RequireRoles(...)`가 admin 전용 라우트(tenant settings, user 관리, role 부여, wall create)를 role matrix 기반으로 보호하고, role 판별 불가·세션 손상 시 무조건 `PERMISSION_DENIED`를 반환한다(fail-closed). |
| Files to create | `apps/api/src/common/guards/require-roles.guard.ts`, `apps/api/src/common/guards/require-roles.guard.spec.ts`, `apps/api/src/common/decorators/require-roles.decorator.ts` |
| Files to modify | `apps/api/src/modules/tenant/tenant.controller.ts`, `apps/api/src/modules/user/user-role.controller.ts` (guard 적용) |
| Files NOT to modify | 공통(§0.3) + R0 fail-closed guard 골격의 시그니처 변경 금지 |
| Verification (AND) | 1) 기능: 허용 role 통과 unit test 2) 권한(negative): 7개 role 각각에 대해 보호 라우트 접근 결과가 매트릭스와 일치(deny 케이스 전부 `PERMISSION_DENIED`); role 클레임 누락/위조 세션 → 차단 3) 권한(오류 주입): matrix 조회 예외 발생 시 → 차단 4) 회귀: 기존 suite green |
| Edge cases | (a) 데코레이터 미적용 라우트의 기본값: 인증만으로 통과 금지 영역(admin prefix)은 모듈 레벨 guard로 이중 방어 (b) 다중 role 요구(`firm_admin|security_admin`) OR 의미 (c) guard 순서: auth → tenant → roles |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.5) |

---

### 2.8 SEC-MATTPERM-ACCECONT — Matter Permission / Access Control (001~006)

이 모듈은 Brief §5.4 권한 평가 계약을 구현한다: **default-deny / deny-overrides(wall DENY > 명시 DENY > 명시 ALLOW) / matter_members는 ALLOW의 필요조건 / condition 해석 불가 시 거부.**

#### SEC-MATTPERM-ACCECONT-TUW-001 — canReadMatter 구현 (C)

| 필드 | 값 |
|---|---|
| ID | SEC-MATTPERM-ACCECONT-TUW-001 |
| Title | canReadMatter 구현 |
| Release | R1 |
| Module | SEC-MATTPERM-ACCECONT (Matter Permission / Access Control) |
| Risk | **C — 사람 리뷰 게이트 필수 (Codex 단독 머지 금지)** |
| Size | L |
| Depends_on | MATTER-MATTTEAM-MEMBMANA-TUW-001, SEC-RBAC-ROLEMATR-TUW-002, SEC-ETHIWALL-WALLENFO-TUW-002 |
| Objective | `PermissionService.canReadMatter(ctx, matterId)`가 평가 계약(§5.4)을 구현한다: ① tenant 일치 AND ② matter_members 존재(필요조건 — Firm Admin 포함 예외 없음, 콘텐츠 접근 기준) AND ③ role matrix상 read allow AND ④ ethical_wall_memberships상 excluded가 아님(wall DENY 최우선) — 어느 단계든 판단 불가 시 deny. |
| Files to create | `apps/api/src/modules/permission/permission.module.ts`, `apps/api/src/modules/permission/permission.service.ts`, `apps/api/src/modules/permission/permission.service.spec.ts`, `apps/api/src/modules/permission/wall-membership.reader.ts` (ethical_wall_memberships 조회 전용 — 쓰기 금지), `packages/shared/src/permission/permission-decision.ts` (`{ effect: 'ALLOW'|'DENY', reason_code }`) |
| Files to modify | `apps/api/src/app.module.ts` |
| Files NOT to modify | 공통(§0.3) + `apps/api/src/modules/ethical-wall/**` (조회 전용 — wall 데이터 변이 금지) |
| Verification (AND) | 1) 기능: 평가 단계별 unit test — 멤버+allow → ALLOW; 비멤버 → DENY; wall excluded → DENY(`ETHICAL_WALL_BLOCKED` 사유) 2) 권한(negative): role 7종 × 멤버여부 2 × wall 상태 3(무관/insider/excluded) 표 기반 전수 테스트에서 ALLOW는 오직 '멤버 AND matrix allow AND wall 비차단' 조합뿐임을 증명 3) 권한(오류 주입): wall 조회 예외 → DENY 4) 회귀: 기존 suite green 5) **사람 리뷰 승인** |
| Edge cases | (a) wall이 matter에 존재하나 사용자가 insider 명단에 있으면 ALLOW 경로 유지 (b) 동일 사용자가 excluded와 insider에 동시 등재(데이터 오류) → deny-overrides로 DENY (c) matter 미존재 → DENY(404 변환은 호출 측) |
| Stop condition | 공통(§0.4) + 평가 순서·우선순위가 21_Permission_Model.md와 충돌 시 |
| Escalation | 공통(§0.5) + 충돌 시 Freeze 전 결정 필요 항목으로 decision ledger 기재 |

#### SEC-MATTPERM-ACCECONT-TUW-002 — canEditMatter 구현

| 필드 | 값 |
|---|---|
| ID | SEC-MATTPERM-ACCECONT-TUW-002 |
| Title | canEditMatter 구현 |
| Release | R1 |
| Module | SEC-MATTPERM-ACCECONT |
| Risk | H |
| Size | S |
| Depends_on | SEC-MATTPERM-ACCECONT-TUW-001 |
| Objective | `canEditMatter`가 canReadMatter 통과를 전제로 matter_role='owner' 또는 access_level='edit'인 멤버에게만 ALLOW를 반환한다(limited_reviewer는 항상 DENY). |
| Files to create | 없음 |
| Files to modify | `apps/api/src/modules/permission/permission.service.ts`, `apps/api/src/modules/permission/permission.service.spec.ts` |
| Files NOT to modify | 공통(§0.3) |
| Verification (AND) | 1) 기능: owner/edit ALLOW, read-only member DENY unit test 2) 권한(negative): read 불가 사용자는 edit도 무조건 DENY(read⊃edit 함의 검증) 3) 회귀: 기존 suite green |
| Edge cases | (a) wall excluded는 edit도 DENY (b) closed matter: 권한은 ALLOW일 수 있으나 변이는 상태 가드가 차단(권한과 상태의 책임 분리 주석) |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.5) |

#### SEC-MATTPERM-ACCECONT-TUW-003 — canUploadToMatter 구현

| 필드 | 값 |
|---|---|
| ID | SEC-MATTPERM-ACCECONT-TUW-003 |
| Title | canUploadToMatter 구현 |
| Release | R1 |
| Module | SEC-MATTPERM-ACCECONT |
| Risk | H |
| Size | S |
| Depends_on | SEC-MATTPERM-ACCECONT-TUW-002, MATTER-MATTLIFE-STATENGI-TUW-001 |
| Objective | `canUploadToMatter`가 edit 권한 멤버에게만 ALLOW하되 closed·archived·disposal 계열 상태의 matter는 DENY한다 — R2 upload API(DOC-DOCUUPLO-UPLOAPI-TUW-006)가 이 함수를 그대로 사용한다(R1에서는 함수+테스트만, 업로드 기능 없음). |
| Files to create | 없음 |
| Files to modify | `apps/api/src/modules/permission/permission.service.ts`, `apps/api/src/modules/permission/permission.service.spec.ts` |
| Files NOT to modify | 공통(§0.3) + `apps/api/src/modules/document/**`·`apps/api/src/modules/storage/**` 생성 금지(R2 범위) |
| Verification (AND) | 1) 기능: edit 멤버+active matter → ALLOW; closed matter → DENY(`MATTER_CLOSED` 사유) unit test 2) 권한(negative): limited_reviewer·비멤버 → DENY 3) 회귀: 기존 suite green |
| Edge cases | (a) proposed 상태 업로드: ALLOW(개시 전 자료 수집 허용) (b) 상태 조회 실패 → DENY(fail-closed) |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.5) |

#### SEC-MATTPERM-ACCECONT-TUW-004 — 비멤버 접근 차단 연결

| 필드 | 값 |
|---|---|
| ID | SEC-MATTPERM-ACCECONT-TUW-004 |
| Title | Matter member 아닌 사용자 접근 차단 |
| Release | R1 |
| Module | SEC-MATTPERM-ACCECONT |
| Risk | H |
| Size | M |
| Depends_on | SEC-MATTPERM-ACCECONT-TUW-003, MATTER-MATTMANA-MATTREGI-TUW-005 |
| Objective | matter 상세·party 목록·팀 조회 등 모든 matter 읽기 endpoint의 보수적 가드(MATTREGI-005)를 `canReadMatter`로 교체하여, 비멤버는 어떤 matter 단건 endpoint에서도 존재 여부조차 알 수 없게 한다(404). |
| Files to create | `tests/integration/permission/non-member-access.spec.ts` |
| Files to modify | `apps/api/src/modules/matter/matter.service.ts`, `apps/api/src/modules/matter/matter-member.service.ts`, `apps/api/src/modules/party/party.service.ts` (`// REPLACED-BY` 주석 지점 교체) |
| Files NOT to modify | 공통(§0.3) + `apps/api/src/modules/permission/permission.service.ts`의 평가 로직(호출만) |
| Verification (AND) | 1) 기능: 멤버 정상 조회 유지 2) 권한(negative): 비멤버가 matter 상세/멤버 목록/party 목록 접근 → 전부 404 응답이며 응답 본문·헤더에 matter 존재 단서 없음 integration test; Firm Admin도 비멤버면 콘텐츠 접근 차단 3) 회귀: MATTREGI-005·006 테스트가 새 가드 기준으로 갱신 후 green |
| Edge cases | (a) lead_lawyer지만 멤버 행이 삭제된 경우 → DENY(멤버십이 유일 기준) (b) 권한 평가 중 예외 → 404/`PERMISSION_DENIED`(스택·내부사유 미노출) |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.5) |

#### SEC-MATTPERM-ACCECONT-TUW-005 — matter search permission filter 구현

| 필드 | 값 |
|---|---|
| ID | SEC-MATTPERM-ACCECONT-TUW-005 |
| Title | matter search permission filter 구현 |
| Release | R1 |
| Module | SEC-MATTPERM-ACCECONT |
| Risk | H |
| Size | M |
| Depends_on | SEC-MATTPERM-ACCECONT-TUW-004, MATTER-MATTMANA-MATTREGI-TUW-006 |
| Objective | matter 목록·검색 쿼리에 membership+wall 기반 필터를 **쿼리 단계에서 주입**(JOIN/EXISTS — 사후 필터링 절대 금지, Permission-before-search)하여 비멤버 matter가 결과·count·페이지네이션 메타 어디에도 나타나지 않게 한다. R3 검색(SEARCH-PERMSEAR-PERMFILT-TUW-001)이 이 필터 빌더를 재사용한다. |
| Files to create | `apps/api/src/modules/permission/permission-query.builder.ts`, `apps/api/src/modules/permission/permission-query.builder.spec.ts`, `tests/integration/permission/matter-list-filter.spec.ts` |
| Files to modify | `apps/api/src/modules/matter/matter.service.ts` (목록 쿼리에 빌더 적용 — `// REPLACED-BY` 지점) |
| Files NOT to modify | 공통(§0.3) + `apps/api/src/modules/search/**` 생성 금지(R3 범위) |
| Verification (AND) | 1) 기능: 멤버인 matter만 반환 2) 권한(negative): 비멤버 matter가 rows·totalCount·페이지 수 계산에 전부 미포함; wall excluded matter 미포함; 생성된 SQL에 권한 필터가 WHERE 절에 존재함을 쿼리 텍스트 검증(사후 필터링 부재 증명) 3) 회귀: 기존 suite green |
| Edge cases | (a) 멤버십 0건 사용자 → 빈 목록(오류 아님) (b) 페이지 경계에서 필터 적용 후 재계산 정확성 (c) Firm Admin의 운영용 전체 목록은 R1 범위 외 — 동일 필터 적용 |
| Stop condition | 공통(§0.4) + 쿼리 주입이 불가능해 사후 필터링이 유일해 보이는 경우(구현 금지 — 즉시 중단) |
| Escalation | 공통(§0.5) |

#### SEC-MATTPERM-ACCECONT-TUW-006 — fail-closed permission wrapper 구현 (C)

| 필드 | 값 |
|---|---|
| ID | SEC-MATTPERM-ACCECONT-TUW-006 |
| Title | fail-closed permission wrapper 구현 |
| Release | R1 |
| Module | SEC-MATTPERM-ACCECONT |
| Risk | **C — 사람 리뷰 게이트 필수 (Codex 단독 머지 금지)** |
| Size | M |
| Depends_on | SEC-MATTPERM-ACCECONT-TUW-005, CORE-SECFOUND-FAILCLOSE-TUW-001 (R0) |
| Objective | 모든 `can*` 평가를 감싸는 단일 wrapper가 예외·timeout(기본 2초)·미해석 조건·null 반환 등 모든 비정상 경로를 `PERMISSION_DENIED`로 변환하고 ACCESS_DENIED audit hook 지점(PERMEVEN-002가 연결)을 노출한다 — PermissionService 외부에서 평가 함수를 직접 호출할 수 없도록 봉인한다. |
| Files to create | `apps/api/src/modules/permission/fail-closed.wrapper.ts`, `apps/api/src/modules/permission/fail-closed.wrapper.spec.ts`, `tests/integration/permission/fail-closed-injection.spec.ts` |
| Files to modify | `apps/api/src/modules/permission/permission.service.ts` (전 공개 메서드를 wrapper 경유로), `packages/shared/src/permission/permission-decision.ts` |
| Files NOT to modify | 공통(§0.3) + R0 `CORE-SECFOUND-FAILCLOSE` 골격의 외부 계약 변경 금지 |
| Verification (AND) | 1) 기능: 정상 ALLOW/DENY 투과 unit test 2) 권한(오류 주입 negative): 평가 함수 예외 throw / DB 연결 강제 차단 / 2초 초과 지연 / undefined 반환 — 4종 주입 전부 `PERMISSION_DENIED` + 거부 사유 코드 `EVAL_FAILURE` integration test 3) 감사: 거부 시 audit hook 호출됨(hook 자체 검증은 PERMEVEN-002) 4) 회귀: 기존 suite green 5) **사람 리뷰 승인** |
| Edge cases | (a) wrapper 재진입(중첩 호출) 시 timeout 누적 방지 (b) ALLOW 경로의 hook 미호출(거부만 기록) (c) 평가 실패의 내부 원인은 구조화 로그(본문·기밀 없음)로만 |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.5) |

---

### 2.9 SEC-DOCUPERM-ACCECONT — Document Permission / Access Control (001~002: 인터페이스 시그니처만)

R1에서는 **시그니처와 fail-closed stub만** 정의한다. 구현(confidentiality policy·download reason 등)은 R2 `SEC-DOCUPERM-ACCECONT-TUW-003~006`이 본 시그니처를 동결 상태로 받아 구현화한다(Brief §7 R2, C-1 Freeze 대상).

#### SEC-DOCUPERM-ACCECONT-TUW-001 — canReadDocument 인터페이스 시그니처 정의

| 필드 | 값 |
|---|---|
| ID | SEC-DOCUPERM-ACCECONT-TUW-001 |
| Title | canReadDocument 함수 인터페이스 시그니처 정의 |
| Release | R1 |
| Module | SEC-DOCUPERM-ACCECONT (Document Permission / Access Control) |
| Risk | M |
| Size | S |
| Depends_on | SEC-MATTPERM-ACCECONT-TUW-001 |
| Objective | `DocumentPermissionService.canReadDocument(ctx, documentId): Promise<PermissionDecision>` 인터페이스(matter 권한 AND 문서 confidentiality AND wall을 평가한다는 계약 주석 포함)를 정의하고, R1 stub은 **무조건 DENY**(`NOT_IMPLEMENTED` 사유)를 반환한다 — 문서 기능 자체가 R2이므로 허용 경로가 존재해선 안 된다. |
| Files to create | `packages/shared/src/permission/document-permission.interface.ts`, `apps/api/src/modules/permission/document-permission.stub.ts`, `apps/api/src/modules/permission/document-permission.stub.spec.ts` |
| Files to modify | 없음 |
| Files NOT to modify | 공통(§0.3) + `apps/api/src/modules/document/**` 생성 금지(R2) |
| Verification (AND) | 1) 기능: 시그니처 타입 컴파일 + stub DENY 반환 unit test 2) 권한(negative): stub이 어떤 입력에도 ALLOW를 반환하지 않음(property-based 또는 대표 입력 전수) 3) 회귀: 기존 suite green |
| Edge cases | (a) 시그니처는 Freeze 대상 — 변경 시 FREEZE-PERMMODEL 개정 필요 주석 (b) ctx 타입은 canReadMatter와 동일 구조 재사용 |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.5) |

#### SEC-DOCUPERM-ACCECONT-TUW-002 — canDownloadDocument 인터페이스 시그니처 정의

| 필드 | 값 |
|---|---|
| ID | SEC-DOCUPERM-ACCECONT-TUW-002 |
| Title | canDownloadDocument 함수 인터페이스 시그니처 정의 |
| Release | R1 |
| Module | SEC-DOCUPERM-ACCECONT |
| Risk | M |
| Size | S |
| Depends_on | SEC-DOCUPERM-ACCECONT-TUW-001 |
| Objective | `canDownloadDocument(ctx, documentId, reason?: string): Promise<PermissionDecision>` 시그니처(download reason 파라미터는 R2 SEC-DOCUPERM-ACCECONT-TUW-004 예약)를 정의하고 stub은 무조건 DENY를 반환한다. |
| Files to create | 없음 |
| Files to modify | `packages/shared/src/permission/document-permission.interface.ts`, `apps/api/src/modules/permission/document-permission.stub.ts`, `apps/api/src/modules/permission/document-permission.stub.spec.ts` |
| Files NOT to modify | 공통(§0.3) + `apps/api/src/modules/document/**`·`storage/**` 생성 금지 |
| Verification (AND) | 1) 기능: 시그니처 컴파일 + stub DENY unit test 2) 권한(negative): reason 유무와 무관하게 R1에서는 항상 DENY 3) 회귀: 기존 suite green |
| Edge cases | (a) reason 최대 길이 512자 타입 제약(R2 구현 시 동일 적용) (b) download는 read를 함의하지 않음 — 별도 평가 계약 주석 |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.5) |

---

### 2.10 SEC-ETHIWALL-WALLENFO — Ethical Wall / Wall Enforcement (001~003, C-2 보정으로 R1 배치)

R1 범위는 **schema + membership + create API까지**다. search enforcement는 R3(WALLENFO-005·PERMFILT-003), document access enforcement·break-glass는 R5 잔류(C-2). 단, matter 읽기 평가의 wall DENY 단계는 MATTPERM-001이 본 모듈의 membership 테이블을 조회하여 R1에서 이미 작동한다.

#### SEC-ETHIWALL-WALLENFO-TUW-001 — EthicalWall schema 구현 (C)

| 필드 | 값 |
|---|---|
| ID | SEC-ETHIWALL-WALLENFO-TUW-001 |
| Title | EthicalWall schema 구현 |
| Release | R1 |
| Module | SEC-ETHIWALL-WALLENFO (Ethical Wall / Wall Enforcement) |
| Risk | **C — 사람 리뷰 게이트 필수 (Codex 단독 머지 금지)** |
| Size | M |
| Depends_on | MATTER-MATTMANA-MATTREGI-TUW-001, CORE-DATACORE-MIGR-TUW-005 (R0) |
| Objective | `ethical_walls` 테이블(wall_id PK, tenant_id NOT NULL, matter_id FK, wall_name, reason, status `active|released`, created_by, created_at)을 RLS와 함께 생성한다(원천 07 §3 승계 + tenant 격리 보강). |
| Files to create | `db/migrations/NNNN_create_ethical_walls.sql`, `apps/api/src/modules/ethical-wall/ethical-wall.entity.ts`, `packages/shared/src/ethical-wall/ethical-wall.dto.ts` |
| Files to modify | 없음 |
| Files NOT to modify | 공통(§0.3) |
| Verification (AND) | 1) 기능: migrate green, FK·CHECK·RLS 검증 2) 권한(negative): cross-tenant SELECT 0행; 타 tenant matter_id FK 연결 거부 3) 회귀: rollback 왕복 + 기존 suite green 4) **사람 리뷰 승인(스키마가 Freeze 대상)** |
| Edge cases | (a) 동일 matter에 active wall 복수 허용(사유별) — (matter_id, wall_name) unique (b) status='released' 전환 컬럼만 존재, 해제 API는 R5(경로 생성 금지) (c) reason은 참조 텍스트 최대 512자 — 기밀 상세 기재 금지 주석 |
| Stop condition | 공통(§0.4) + 20번 데이터 모델 문서와 불일치 시 |
| Escalation | 공통(§0.5) |

#### SEC-ETHIWALL-WALLENFO-TUW-002 — wall membership schema 구현 (C)

| 필드 | 값 |
|---|---|
| ID | SEC-ETHIWALL-WALLENFO-TUW-002 |
| Title | wall membership schema 구현 |
| Release | R1 |
| Module | SEC-ETHIWALL-WALLENFO |
| Risk | **C — 사람 리뷰 게이트 필수 (Codex 단독 머지 금지)** |
| Size | M |
| Depends_on | SEC-ETHIWALL-WALLENFO-TUW-001 |
| Objective | `ethical_wall_memberships` 테이블(Brief §5.2: wall_id FK, tenant_id NOT NULL, subject_type `user|group`, subject_id, membership_type `insider|excluded`, added_by, added_at, PK(wall_id, subject_type, subject_id))을 RLS와 함께 생성한다 — R1 운용은 subject_type='user'만 사용하며 'group'은 스키마 예약(groups 테이블 자체는 ROLEMATR-TUW-002가 R1에서 생성하나, group 해석·전개 로직은 R5 ABAC). |
| Files to create | `db/migrations/NNNN_create_ethical_wall_memberships.sql`, `apps/api/src/modules/ethical-wall/wall-membership.entity.ts`, `packages/shared/src/ethical-wall/wall-membership.dto.ts` |
| Files to modify | 없음 |
| Files NOT to modify | 공통(§0.3) |
| Verification (AND) | 1) 기능: migrate green, PK·CHECK·RLS 검증 2) 권한(negative): cross-tenant SELECT 0행 3) 회귀: rollback 왕복 + 기존 suite green; MATTPERM-001 wall 조회 테스트가 본 테이블 기준 green(이미 머지된 경우) 4) **사람 리뷰 승인(스키마가 Freeze 대상)** |
| Edge cases | (a) 동일 subject가 insider·excluded 양쪽 등재 — DB는 PK상 불가하지 않으므로(membership_type이 PK 밖) **UNIQUE(wall_id, subject_type, subject_id)로 단일 행 강제** (b) subject_type='group' INSERT는 스키마상 허용되나 R1 API에서 거부 (c) wall 삭제 금지 — FK ON DELETE RESTRICT |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.5) |

#### SEC-ETHIWALL-WALLENFO-TUW-003 — wall create API 구현

| 필드 | 값 |
|---|---|
| ID | SEC-ETHIWALL-WALLENFO-TUW-003 |
| Title | wall create API 구현 |
| Release | R1 |
| Module | SEC-ETHIWALL-WALLENFO |
| Risk | H |
| Size | M |
| Depends_on | SEC-ETHIWALL-WALLENFO-TUW-002, SEC-RBAC-ROLEMATR-TUW-005, AUDIT-AUDIEVENCO-AUDILOGG-TUW-002 |
| Objective | `POST /v1/ethical-walls`가 Security Admin에 한해 wall과 membership 배열(subject_type='user'만)을 원자적으로 생성하고 `ETHICAL_WALL_CREATED`(wall 생성)·`ETHICAL_WALL_MEMBERSHIP_CHANGED`(membership 등록 — wall 단위 1건 + 대상 ID 목록)·`ETHICAL_WALL_APPLIED`(matter 적용 효력, wall_id·reason_code·scope=matter_id) audit를 기록한다(§0.7 19종·50번 R1-G3과 정합) — 해제·수정·break-glass 경로는 생성 금지(R5). |
| Files to create | `apps/api/src/modules/ethical-wall/ethical-wall.module.ts`, `apps/api/src/modules/ethical-wall/ethical-wall.controller.ts`, `apps/api/src/modules/ethical-wall/ethical-wall.service.ts`, `apps/api/src/modules/ethical-wall/ethical-wall.service.spec.ts`, `apps/api/src/modules/ethical-wall/dto/create-wall.dto.ts` |
| Files to modify | `apps/api/src/app.module.ts` |
| Files NOT to modify | 공통(§0.3) |
| Verification (AND) | 1) 기능: wall+membership 원자 생성 201(부분 실패 시 전체 rollback) 2) 권한(negative): Firm Admin·Matter Owner의 생성 시도 → `PERMISSION_DENIED`; subject_type='group' → `VALIDATION_FAILED` 3) 감사: 생성 1건당 `ETHICAL_WALL_CREATED`·`ETHICAL_WALL_APPLIED` 각 1건 + membership 배열 비어있지 않으면 `ETHICAL_WALL_MEMBERSHIP_CHANGED` 1건(대상 ID 목록) + 필수 metadata 4) 권한(즉시 효력): wall 생성 직후 excluded 사용자의 해당 matter `canReadMatter` → DENY integration test 5) 회귀: 기존 suite green |
| Edge cases | (a) excluded 대상이 해당 matter의 owner인 경우 → 생성은 허용하되 응답에 경고 필드(차단 효력 우선) (b) 존재하지 않는 user_id 포함 → 전체 거부 (c) 빈 membership 배열 → 허용(wall 선언만) — 단 excluded 0명이면 효력 없음 경고 |
| Stop condition | 공통(§0.4) + 해제(released) API 요구 발견 시(R5 범위 — 중단) |
| Escalation | 공통(§0.5) |

---

### 2.11 AUDIT-PERMAUDI-PERMEVEN — Permission Audit / Permission Events (001~002)

#### AUDIT-PERMAUDI-PERMEVEN-TUW-001 — PERMISSION_CHANGED audit 구현

| 필드 | 값 |
|---|---|
| ID | AUDIT-PERMAUDI-PERMEVEN-TUW-001 |
| Title | PERMISSION_CHANGED audit 구현 |
| Release | R1 |
| Module | AUDIT-PERMAUDI-PERMEVEN (Permission Audit / Permission Events) |
| Risk | H |
| Size | M |
| Depends_on | AUDIT-AUDIEVENCO-AUDILOGG-TUW-002, SEC-RBAC-ROLEMATR-TUW-003, MATTER-MATTTEAM-MEMBMANA-TUW-004, SEC-ETHIWALL-WALLENFO-TUW-003 |
| Objective | 권한 지형을 바꾸는 모든 변이(tenant role 변경, matter member 추가/제거/역할변경, wall 생성/membership 등록)가 표준 `PERMISSION_CHANGED` audit event(before/after **참조 ID·enum 수준**, approver=actor)를 추가 기록함을 단일 커버리지 suite로 보증한다 — 세부 이벤트(`ROLE_CHANGED` 등)와 병행 기록(이중 분류: 세부 + 표준). |
| Files to create | `apps/api/src/modules/audit/permission-event.recorder.ts`, `apps/api/src/modules/audit/permission-event.recorder.spec.ts`, `tests/integration/audit/permission-changed-coverage.spec.ts` |
| Files to modify | `apps/api/src/modules/user/user-role.service.ts`, `apps/api/src/modules/matter/matter-member.service.ts`, `apps/api/src/modules/ethical-wall/ethical-wall.service.ts` (recorder 호출 연결) |
| Files NOT to modify | 공통(§0.3) |
| Verification (AND) | 1) 감사: 권한 변이 6경로(role, member add/remove/role, wall create/membership) 각각 `PERMISSION_CHANGED` 1건 + before_ref/after_ref/reason_code 충족 — `pnpm test:integration` 2) 감사(negative): metadata에 화이트리스트 외 키·원문 값 부재 3) 권한 회귀: 비인가 변이 시도는 이벤트 미발생 4) 회귀: 기존 suite green |
| Edge cases | (a) 단일 요청 다중 membership 등록 → membership당 1건이 아니라 wall 단위 1건 + 대상 ID 목록 (b) no-op 변경은 미기록 (c) recorder 실패 시 변이 rollback(트랜잭션 결합) |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.5) |

#### AUDIT-PERMAUDI-PERMEVEN-TUW-002 — ACCESS_DENIED audit 구현

| 필드 | 값 |
|---|---|
| ID | AUDIT-PERMAUDI-PERMEVEN-TUW-002 |
| Title | ACCESS_DENIED audit 구현 |
| Release | R1 |
| Module | AUDIT-PERMAUDI-PERMEVEN |
| Risk | H |
| Size | S |
| Depends_on | AUDIT-PERMAUDI-PERMEVEN-TUW-001, SEC-MATTPERM-ACCECONT-TUW-006 |
| Objective | fail-closed wrapper의 거부 hook에 `ACCESS_DENIED` audit event(actor, 시도 action, target 참조, reason_code `PERMISSION_DENIED|ETHICAL_WALL_BLOCKED|TENANT_ISOLATION_VIOLATION|EVAL_FAILURE`)를 연결하되, audit 기록 실패가 거부 응답 자체를 막지 않게 한다(거부는 항상 반환 — 비동기 후처리 허용 유일 예외). |
| Files to create | `tests/integration/audit/access-denied-audit.spec.ts` |
| Files to modify | `apps/api/src/modules/permission/fail-closed.wrapper.ts` (hook에 recorder 연결), `apps/api/src/modules/audit/permission-event.recorder.ts` |
| Files NOT to modify | 공통(§0.3) + wrapper의 거부 의미론 변경 금지 |
| Verification (AND) | 1) 감사: 비멤버 접근·wall 차단·오류 주입 3개 시나리오 각각 `ACCESS_DENIED` 1건 + reason_code 정확 — `pnpm test:integration` 2) 감사(negative): metadata에 대상 자원의 이름·본문 등 원문 부재(ID/hash만) 3) 기능: audit 기록 실패 주입 시에도 거부 응답 정상 반환 + 구조화 로그 경보 4) 회귀: 기존 suite green |
| Edge cases | (a) 동일 사용자 반복 거부(50회) — 전부 기록(rate 제한 없음, R5 보안 이벤트에서 집계) (b) 미인증 요청의 거부는 `AUTH_REQUIRED`로 audit 대상 아님(actor 불명) (c) ALLOW 경로 미기록 |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.5) |

---

### 2.12 SEC-PERMHARN-MATRIX — Permission Harness / Matrix Tests (001~002)

#### SEC-PERMHARN-MATRIX-TUW-001 — 권한 매트릭스 테스트 하네스 구현 (C)

| 필드 | 값 |
|---|---|
| ID | SEC-PERMHARN-MATRIX-TUW-001 |
| Title | 권한 매트릭스 테스트 하네스 구현 |
| Release | R1 |
| Module | SEC-PERMHARN-MATRIX (Permission Harness / Matrix Tests) |
| Risk | **C — 사람 리뷰 게이트 필수 (Codex 단독 머지 금지)** |
| Size | L |
| Depends_on | SEC-MATTPERM-ACCECONT-TUW-006, SEC-ETHIWALL-WALLENFO-TUW-002, SEC-RBAC-ROLEMATR-TUW-002 |
| Objective | role 7종 × R1 action 전체(§2.7 ROLEMATR-002의 action enum) × wall 상태 3종(없음/insider/excluded) × 멤버십 2종의 expected 허용/차단 표(기계가독 fixture)를 정의하고, 실제 API/PermissionService 호출 결과가 전 셀에서 expected와 일치함을 data-driven integration suite로 검증한다 — expected의 유일한 출처는 role-permission-matrix + 평가 계약(§5.4)이며, 불일치 1건이라도 있으면 suite 실패. |
| Files to create | `tests/integration/permission-matrix/matrix-expected.csv` (셀 전수: role, action, is_member, wall_state, expected), `tests/integration/permission-matrix/permission-matrix.harness.spec.ts`, `tests/integration/permission-matrix/fixtures.ts` (tenant 2개·역할별 사용자 7명·wall fixture — R0 seed loader 확장), `tests/integration/permission-matrix/README.md` (셀 추가 규칙) |
| Files to modify | `tests/fixtures/` seed 정의 파일(역할별 사용자 추가) |
| Files NOT to modify | 공통(§0.3) + `apps/api/src/modules/permission/**` (하네스는 구현을 변경하지 않는다 — 불일치는 escalation) |
| Verification (AND) | 1) 기능: 전 셀 실행·집계 리포트 출력, 셀 누락 시 실패(expected 행 수 = 계산된 조합 수 assert) 2) 권한: 차단 expected 셀 전부가 negative test로 실행되어 `PERMISSION_DENIED`/404 확인 3) 감사: 차단 셀 실행 시 `ACCESS_DENIED` 발생 샘플 검증(최소 wall·비멤버 각 1) 4) 회귀: 기존 suite green 5) **사람 리뷰: expected CSV 전 행 승인(이 표가 R1 권한의 사실상 명세)** |
| Edge cases | (a) cross-tenant 시나리오는 별도 R0 suite와 중복되므로 하네스에서는 tenant 내 조합만(중복 금지 주석) (b) wall_state는 matter 단위 — wall 없는 matter fixture와 wall 있는 matter fixture 분리 (c) expected가 '404'인지 '`PERMISSION_DENIED`'인지 응답 형태까지 고정 |
| Stop condition | 공통(§0.4) + 구현과 expected 불일치 발견 시(구현·expected 어느 쪽도 임의 수정 금지 — 중단·보고) |
| Escalation | 공통(§0.5) + 불일치 셀 목록을 decision ledger에 기재, Freeze 보류 |

#### SEC-PERMHARN-MATRIX-TUW-002 — 권한 매트릭스 CI gate 연결

| 필드 | 값 |
|---|---|
| ID | SEC-PERMHARN-MATRIX-TUW-002 |
| Title | 권한 매트릭스 CI gate 연결 |
| Release | R1 |
| Module | SEC-PERMHARN-MATRIX |
| Risk | H |
| Size | S |
| Depends_on | SEC-PERMHARN-MATRIX-TUW-001, CORE-REPOBUIL-CICD-TUW-003 (R0) |
| Objective | permission-matrix 하네스를 CI 필수 job으로 등록하여 실패 시 merge가 차단되고, `pnpm test:integration`에 포함되어 로컬에서도 동일하게 실행된다. |
| Files to create | `infra/ci/permission-matrix.yml` (또는 R0 CI 구성 파일 형식에 따른 job 정의) |
| Files to modify | R0 CI 파이프라인 정의 파일(`infra/ci/` 내 — CICD-003 산출물), 루트 `package.json`(`test:integration` 스크립트에 하네스 포함 확인) |
| Files NOT to modify | 공통(§0.3) + 하네스 spec·expected CSV(본 TUW는 배선만) |
| Verification (AND) | 1) 기능: CI 실행에서 하네스 job 수행·통과 확인(파이프라인 로그) 2) 기능(negative): expected 1셀을 의도적으로 뒤집은 브랜치에서 CI 실패 확인 후 원복(머지 금지 증명) 3) 회귀: `pnpm test:integration` 로컬 전체 green |
| Edge cases | (a) 하네스 소요 시간 > 10분 시 병렬화(셀 분할) (b) CI 환경 DB 미가용 → job 실패(skip 금지) |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.5) |

---

### 2.13 DEVOPS-FREEZE-PERMMODEL — Permission Model Freeze (001, C-1 보정 신설)

#### DEVOPS-FREEZE-PERMMODEL-TUW-001 — Permission Model Freeze 문서 작성·등재 (C)

| 필드 | 값 |
|---|---|
| ID | DEVOPS-FREEZE-PERMMODEL-TUW-001 |
| Title | Permission Model Freeze 문서 작성·등재 |
| Release | R1 |
| Module | DEVOPS-FREEZE-PERMMODEL (Permission Model Freeze — R1 Gate 산출물) |
| Risk | **C — 사람 리뷰 게이트 필수 (승인 없이는 R1 Gate 불통과, R2·R3 착수 금지)** |
| Size | M |
| Depends_on | SEC-RBAC-ROLEMATR-TUW-005, SEC-MATTPERM-ACCECONT-TUW-006, SEC-DOCUPERM-ACCECONT-TUW-002, SEC-ETHIWALL-WALLENFO-TUW-003, AUDIT-PERMAUDI-PERMEVEN-TUW-002, SEC-PERMHARN-MATRIX-TUW-002, MATTER-MATTTEAM-MEMBMANA-TUW-006 |
| Objective | 다음 4요소를 버전·파일 경로·해시 수준으로 동결 선언하는 Freeze 문서를 작성하고 Decision Ledger에 등재한다: ① role permission matrix(ROLEMATR-002 상수) ② `canReadMatter/canEditMatter/canUploadToMatter/canReadDocument/canDownloadDocument` 시그니처 ③ ethical_walls·ethical_wall_memberships·matter_members 스키마 ④ 권한 filter 주입 지점(permission-query.builder — R3 검색이 재사용할 유일 진입점). 동결 후 변경은 ADR 개정+사람 승인 없이는 금지(C-1: Freeze 없이 R3 착수 금지). |
| Files to create | `docs/adr/ADR-013-permission-model-freeze.md` (ADR-001~012에 이어 신규 번호 — 동결 4요소 명세·근거·해제 절차 포함) |
| Files to modify | `docs/ledger/decision.md` (Freeze 등재 항목 append — append-only) |
| Files NOT to modify | 공통(§0.3) + 동결 대상 코드 4요소 일체(문서 작성 TUW — 코드 변경 0이어야 함) |
| Verification (AND) | 1) 기능: 문서가 동결 4요소의 실제 파일 경로·export 심볼·매트릭스 행 수와 일치함을 점검 스크립트 또는 수동 체크리스트로 확인 2) 회귀: 코드 diff 0 (`git diff --stat`로 docs/ 외 변경 없음 증명) + `pnpm test && pnpm test:integration` green 상태에서 등재 3) **사람 리뷰: Freeze 승인 서명(PR 승인자 기록)** — 승인 전 R2·R3 PACK 착수 금지 |
| Edge cases | (a) 하네스에 미해결 불일치 셀 존재 → Freeze 불가(PERMHARN-001 stop condition으로 회귀) (b) 동결 후 R2에서 시그니처 변경 필요 발견 → ADR-013 개정 절차 명시 (c) decision ledger 과거 항목 수정 금지(append만) |
| Stop condition | 공통(§0.4) + 선행 7개 TUW 중 미완료 존재 시 착수 금지 |
| Escalation | 공통(§0.5) + 승인 거부 시 거부 사유를 ledger에 기재하고 해당 TUW 재작업 목록 생성 |

---

## 3. 의존 구조 요약

### 3.1 모듈 간 흐름 (R1 내부)

```
[R0 Foundation]
   │
   ├─→ AUDILOGG-002 → 003 → 005                      (audit 기반 — 거의 모든 모듈이 사용)
   │
   ├─→ CLIEREGI-001 → … → 005
   │        └─→ MATTREGI-001 → … → 007
   │                 ├─→ MEMBMANA-001 → … → 006
   │                 ├─→ STATENGI-001 → … → 005
   │                 ├─→ PARTREGI-001 → … → 005
   │                 └─→ WALLENFO-001 → 002 → 003
   │
   ├─→ ROLEMATR-001 → 002(C) → 003 → 004 → 005
   │
   └─→ MATTPERM-001(C) ←─ MEMBMANA-001 + ROLEMATR-002 + WALLENFO-002
            → 002 → 003 → 004 → 005 → 006(C)
                 └─→ DOCUPERM-001 → 002 (시그니처만)
   PERMEVEN-001 ←─ AUDILOGG-002 + ROLEMATR-003 + MEMBMANA-004 + WALLENFO-003
   PERMEVEN-002 ←─ PERMEVEN-001 + MATTPERM-006
   PERMHARN-001(C) ←─ MATTPERM-006 + WALLENFO-002 + ROLEMATR-002
   PERMHARN-002 ←─ PERMHARN-001 + CICD-003(R0)
   FREEZE-PERMMODEL-001(C) ←─ 보안 트랙 전 종단 TUW (R1 Gate 산출물)
```

### 3.2 R0 cross-release 의존 전체 목록 (R1에서 참조하는 R0 TUW)

| R0 TUW ID | R1에서 의존하는 TUW |
|---|---|
| AUDIT-AUDIEVENCO-AUDILOGG-TUW-001 | AUDILOGG-002 |
| AUDIT-AUDIEVENCO-AUDILOGG-TUW-004 | AUDILOGG-002 (append-only 전제) |
| CORE-DATACORE-MIGR-TUW-002 | CLIEREGI-001 |
| CORE-DATACORE-MIGR-TUW-005 | CLIEREGI-001, MATTREGI-001, MEMBMANA-001, PARTREGI-001, WALLENFO-001 |
| CORE-TENACORE-TENACONT-TUW-002 | AUDILOGG-002, CLIEREGI-002, MATTREGI-002 |
| CORE-AUTHCORE-USERSESS-TUW-001 | ROLEMATR-001 |
| CORE-AUTHCORE-USERSESS-TUW-003 | CLIEREGI-002 |
| CORE-SECFOUND-FAILCLOSE-TUW-001 | ROLEMATR-005, MATTPERM-006 |
| CORE-FESHELL-APPSHELL-TUW-002 | MATTREGI-007 |
| CORE-FESHELL-APPSHELL-TUW-003 | MEMBMANA-005 |
| CORE-REPOBUIL-CICD-TUW-003 | PERMHARN-002 |

R0 Gate 미통과 상태에서 R1 PACK 착수 금지(Brief §9.4).

---

## 4. R1 Gate 체크리스트 (Matter Core — Brief §7 Gate 기준 확장)

아래 전 항목이 AND로 충족되어야 R1 Gate 통과다. 하나라도 미충족이면 **R2·R3 PACK 착수 금지**.

### G1. 권한 매트릭스 하네스 100%

- [ ] `pnpm test:integration` 내 permission-matrix suite 전 셀 green (role 7 × action 전체 × 멤버십 2 × wall 상태 3 — 셀 누락 0)
- [ ] expected CSV가 사람 승인됨(PERMHARN-001 리뷰 기록)
- [ ] CI에서 하네스 실패 시 merge 차단 동작 증명(PERMHARN-002 negative 확인 기록)

### G2. Cross-tenant 격리

- [ ] R0 cross-tenant suite green 유지
- [ ] R1 신규 테이블 9종(clients, matters, matter_members, parties, ethical_walls, ethical_wall_memberships, permissions, groups, group_members) 전부 RLS로 타 tenant SELECT 0행
- [ ] R1 신규 endpoint 전수(클라이언트·matter·member·party·wall·role)에서 타 tenant 자원 접근 → 404/`PERMISSION_DENIED`, 존재 단서 비노출

### G3. Audit coverage 100% (matter·member·permission 행위)

- [ ] 행위→이벤트 매핑 전수 검증(§0.7 19종, 50번 R1-G3 분모와 1:1): CLIENT_CREATED/UPDATED, MATTER_CREATED/UPDATED/STATUS_CHANGED, MATTER_MEMBER_ADDED/REMOVED/ROLE_CHANGED, PARTY_ADDED/RESTRICTED_MARKED, ROLE_ASSIGNED, ROLE_CHANGED, PERMISSION_CHANGED, ETHICAL_WALL_CREATED, ETHICAL_WALL_MEMBERSHIP_CHANGED, ETHICAL_WALL_APPLIED, ACCESS_DENIED, LOGIN_SUCCESS, LOGIN_FAILURE — 누락 0 (coverage spec green)
- [ ] audit_events UPDATE·DELETE가 DB 계층에서 실패(R0 immutability 회귀, retention_label 추가 후에도)
- [ ] audit metadata에 본문·기밀 원문 부재 — 본문 fixture 문자열 grep 0건 (normalizer negative suite)

### G4. Fail-closed 오류 주입 통과

- [ ] 평가 함수 예외/DB 단절/timeout/undefined 4종 주입 전부 `PERMISSION_DENIED` (fail-closed-injection suite)
- [ ] 거부 시 `ACCESS_DENIED` audit 발생, 거부 응답에 내부 사유·스택 비노출
- [ ] 사후 필터링 부재: matter 목록·검색 쿼리의 WHERE 절에 권한 필터 존재 증명(쿼리 텍스트 검증 테스트)

### G5. Permission Model Freeze

- [ ] `docs/adr/ADR-013-permission-model-freeze.md` 사람 승인 + `docs/ledger/decision.md` 등재
- [ ] 동결 4요소(matrix·can* 시그니처·wall/member 스키마·filter 주입 지점)가 코드 실물과 일치
- [ ] **Freeze 승인 전 R2·R3 착수 금지** 가 execution ledger에 공지됨

### G6. 표준 검증·재현성

- [ ] 신규 클론에서: `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build` 전부 green
- [ ] `docker compose -f infra/docker-compose.dev.yml up -d && pnpm db:migrate && pnpm test:integration` green
- [ ] `pnpm db:rollback` → `pnpm db:migrate` 왕복 green (R1 마이그레이션 전체)

### G7. 절대 금지 회귀 (Brief §2)

- [ ] AI 기능 0 (packages/ai는 placeholder 그대로, ai_policy 관련 컬럼·코드 부재 — R2 스키마 예외 전 단계)
- [ ] 외부공유·VDR·secure link 경로 0 / hard delete 경로 0 / 벡터·Neo4j 흔적 0
- [ ] PermissionService 우회 matter endpoint 0 (코드 리뷰 + backlog validator green)
- [ ] Risk=C 7건 전부 사람 리뷰 승인 기록 존재 (ROLEMATR-002, MATTPERM-001, MATTPERM-006, WALLENFO-001, WALLENFO-002, PERMHARN-001, FREEZE-PERMMODEL-001)

Gate 판정 결과와 증빙 링크는 `docs/ledger/execution.md`에 R1 Gate 항목으로 기록한다.

---

## 5. 변경 이력

| 버전 | 일자 | 내용 |
|---|---|---|
| 1.0 | 2026-06-11 | 최초 작성 — Brief §7 R1 인벤토리 52 TUW 1:1 상세화 |





