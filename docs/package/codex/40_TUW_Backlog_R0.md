# 40. TUW Backlog R0 — Foundation 상세 명세

버전: 1.0 | 작성일: 2026-06-11 | 상태: Normative (00_Master_Brief.md §7 R0 인벤토리의 1:1 확장본. 충돌 시 00_Master_Brief.md가 우선)

대상 독자: Codex (구현 에이전트). 이 문서는 대화 컨텍스트 없이 단독으로 읽고 실행 가능하도록 작성되었다.

---

## 0. 공통 규약 (모든 R0 TUW에 적용)

### 0.1 범위와 개수

본 문서는 Brief §7 "R0: Foundation" 인벤토리 표의 TUW를 행 단위로 1:1 전개한 것이다. 인벤토리 행을 전개하면 **총 35 TUW**다 (Brief §7 헤더 표기는 35 TUW로 보정 완료 — 행 목록이 규범이며, 임의 추가·삭제 없음).

| 모듈 | TUW 수 | Risk=C |
|---|---|---|
| CORE-REPOBUIL-CICD | 5 | - |
| CORE-DATACORE-MIGR | 5 | - |
| CORE-TENACORE-TENACONT | 5 | TUW-004 |
| CORE-AUTHCORE-USERSESS | 5 | - |
| CORE-SECFOUND-FAILCLOSE | 2 | - |
| AUDIT-AUDIEVENCO-AUDILOGG | 2 (001, 004) | TUW-004 |
| CORE-OBSE-LOGGMETR | 5 | - |
| CORE-FESHELL-APPSHELL | 3 | - |
| DEVOPS-DOCSPKG-TRANSFER | 2 | - |
| DEVOPS-BACKLOG-VALIDATE | 1 | - |
| **합계** | **35** | **2** |

### 0.2 표준 검증 명령 세트

모든 TUW의 Verification은 아래 명령만 사용한다 (repo 루트 기준).

```
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

### 0.3 Verification 의미론 (Brief §6.3, AND)

- 모든 TUW: **기능검증 AND 회귀검증**(기존 suite 전체 green).
- 권한·보안 영향 TUW: **AND 권한검증** — 비인가 시도가 차단되는 **negative test 필수**.
- 행위 기록 대상 TUW: **AND 감사검증**. 단, R0에는 audit logger service(R1의 AUDILOGG-TUW-002)가 없으므로 R0 행위 기록은 구조화 로그까지만 요구하고, audit event 연동 의무는 R1에서 발생한다(각 TUW에 명시).
- **Risk=C: 사람(또는 상위 검토 에이전트) 리뷰 게이트 필수. Codex 단독 머지 금지.**

### 0.4 공통 Stop condition (Brief §6.4)

다음 중 하나라도 발생하면 작업을 중단하고 `docs/ledger/execution.md`에 사유를 기재한다:
(a) 스키마·권한·정책이 본 패키지 문서로 해석 불가, (b) verification fixture 부재, (c) "Files NOT to modify" 파일의 변경 필요 발견, (d) 동일 실패 3회 반복.

### 0.5 공통 Files NOT to modify (전 TUW 기본 금지목록)

- `../vault_dev_package/**` 및 DOCX 원본 (repo 외부 — 어떤 경우에도 수정 금지)
- `docs/package/**` (이관 완료 후 read-only)
- 이미 머지된 번호의 `db/migrations/NNNN_*.sql` (수정 금지 — 변경은 항상 신규 번호 마이그레이션으로)
- `packages/ai/**`에 구현 코드 추가 (R6 전 인터페이스 placeholder만 허용 — Brief §2 절대 금지)
- `docs/ledger/*.md`의 기존 행 수정·삭제 (append-only)

각 TUW의 "Files NOT to modify"는 위 공통 목록에 **추가되는** 항목만 기재한다.

### 0.6 공통 Escalation 경로

1. `docs/ledger/execution.md`에 TUW ID·중단 사유·시도 내역 1줄 기록 → 2. 해당 PACK 중단 → 3. 사람(프로젝트 오너) 판단 대기. Risk=C TUW는 성공 시에도 머지 전 사람 리뷰 기록을 ledger에 남긴다.

### 0.7 Depends_on 전개 규칙

Brief §7의 "모듈 내 순차규칙(별도 표기 없으면 직전 번호 의존)" + "핵심 Deps"를 ID 단위로 전개했다. 모듈 단위로만 표기된 Deps(`→X`)는 해당 모듈의 첫 TUW에 귀속시켰다. 실행 가능성을 위해 최소한으로 보충한 deps는 §11 notes에 사유와 함께 기재했다 (TUW 추가·삭제는 없음).

### 0.8 마이그레이션 파일 번호

본 문서의 `db/migrations/000N_*.sql` 번호는 **예시**다. 실제 번호는 머지 시점에 순차 부여하되, 파일명 의미부(`_initial_schema` 등)는 유지한다.

---

## 1. CORE-REPOBUIL-CICD — Repository & Build / CI-CD

### CORE-REPOBUIL-CICD-TUW-001 — monorepo skeleton 구성

| 필드 | 내용 |
|---|---|
| ID | CORE-REPOBUIL-CICD-TUW-001 |
| Title | pnpm + turborepo 모노레포 skeleton 및 개발 인프라 compose 구성 |
| Release | R0 |
| Module | CORE-REPOBUIL-CICD |
| Risk | M |
| Size | M |
| Depends_on | (없음 — PACK-R0-01 시작점) |
| Objective | 신규 클론에서 `pnpm install`이 성공하고 `docker compose -f infra/docker-compose.dev.yml up -d`로 PostgreSQL 16 + MinIO가 기동되는 `amic-vault` repo 루트 골격이 존재한다. |
| Files to create | `package.json`(루트, scripts: lint/typecheck/test/build/db:migrate/db:rollback/test:integration 자리), `pnpm-workspace.yaml`(apps/*, packages/*, workers/* 등록), `turbo.json`, `tsconfig.base.json`, `.gitignore`, `.npmrc`, `.nvmrc`, `README.md`, `AGENTS.md`(90_AGENTS_TEMPLATE.md 복사), `infra/docker-compose.dev.yml`(postgres:16 + minio, named volume, 기본 자격증명은 .env.example로), `.env.example`, 디렉터리 골격: `apps/ packages/ workers/ db/migrations/ infra/ci/ docs/package/ docs/adr/ docs/ledger/ tools/backlog/ tests/integration/ tests/fixtures/` (각각 `.gitkeep` 또는 README) |
| Files to modify | (없음 — 신규 repo) |
| Files NOT to modify | 공통 금지목록(§0.5) |
| Verification (AND) | (1) 신규 클론에서 `pnpm install` exit 0 · (2) `docker compose -f infra/docker-compose.dev.yml up -d` 후 postgres:16·minio 컨테이너 healthy · (3) `pnpm-workspace.yaml`에 apps/packages/workers 글롭 존재 · (4) `AGENTS.md`가 90_AGENTS_TEMPLATE.md와 내용 일치 · (5) 회귀: 해당 없음(최초 TUW) — CI 도입(TUW-003) 후 본 구성이 깨지지 않음을 회귀로 확인 |
| Edge cases | (1) 포트 5432/9000 충돌 시 `.env`로 오버라이드 가능해야 함 · (2) compose volume 미정의로 컨테이너 재기동 시 데이터 소실되지 않아야 함 |
| Stop condition | 공통(§0.4) + Node/pnpm 버전 정책을 결정할 수 없을 때(LTS 고정 실패) |
| Escalation | 공통(§0.6) |

### CORE-REPOBUIL-CICD-TUW-002 — backend/frontend/shared 패키지 분리

| 필드 | 내용 |
|---|---|
| ID | CORE-REPOBUIL-CICD-TUW-002 |
| Title | apps/api(NestJS)·apps/web(Next.js)·packages/shared·packages/domain·packages/ai(placeholder)·workers/ingestion(FastAPI) 패키지 분리 |
| Release | R0 |
| Module | CORE-REPOBUIL-CICD |
| Risk | M |
| Size | M |
| Depends_on | CORE-REPOBUIL-CICD-TUW-001 |
| Objective | 6개 패키지가 분리 생성되어 `pnpm build`가 전 패키지에서 exit 0이고, packages/ai에는 구현 없는 인터페이스 placeholder만 존재한다. |
| Files to create | `apps/api/`(package.json, nest-cli.json, tsconfig.json, `src/main.ts`(글로벌 prefix `/v1`), `src/app.module.ts`), `apps/web/`(package.json, next.config.mjs, tsconfig.json, `src/app/layout.tsx`, `src/app/page.tsx`), `packages/shared/`(package.json, `src/index.ts`), `packages/domain/`(package.json, `src/index.ts` — 순수 TS, IO 금지 명시 주석), `packages/ai/`(package.json, `src/index.ts` — "R6 전 구현 금지" 주석과 빈 인터페이스 export만), `workers/ingestion/`(pyproject.toml, `app/main.py` — FastAPI `/health`만, `README.md`) |
| Files to modify | `pnpm-workspace.yaml`(필요 시 글롭 보정), `turbo.json`(build/test 파이프라인), 루트 `package.json` |
| Files NOT to modify | 공통(§0.5). 특히 `packages/ai/`에 인터페이스 외 코드 추가 금지 |
| Verification (AND) | (1) `pnpm install && pnpm build` exit 0 (api/web/shared/domain/ai 전부) · (2) api 기동 시 `/v1` prefix 적용 확인(스모크) · (3) `packages/ai/src/**`에 함수 구현체·외부 호출 0건(정적 grep 검사) · (4) `packages/domain`이 node 내장 IO/네트워크 모듈을 import하지 않음(grep) · (5) 회귀: TUW-001 verification 재통과 |
| Edge cases | (1) 패키지 간 순환 의존 발생 시 build 실패해야 함(turbo 그래프) · (2) workers/ingestion은 pnpm 그래프 밖(Python) — 루트 build에 포함하지 않되 README에 실행법 명시 |
| Stop condition | 공통(§0.4) + NestJS/Next.js 메이저 버전 선택이 10_Architecture 문서와 충돌할 때 |
| Escalation | 공통(§0.6) |

### CORE-REPOBUIL-CICD-TUW-003 — lint/test/build CI 구성

| 필드 | 내용 |
|---|---|
| ID | CORE-REPOBUIL-CICD-TUW-003 |
| Title | lint·typecheck·test·build를 실행하는 CI 파이프라인 구성 |
| Release | R0 |
| Module | CORE-REPOBUIL-CICD |
| Risk | M |
| Size | M |
| Depends_on | CORE-REPOBUIL-CICD-TUW-002 |
| Objective | 모든 PR에서 `pnpm lint && pnpm typecheck && pnpm test && pnpm build`가 자동 실행되어 실패 시 머지가 차단된다. |
| Files to create | `.github/workflows/ci.yml`(또는 확정된 CI 플랫폼 동등물 — 플랫폼은 infra/ci/README.md에 기록), `infra/ci/README.md`, `eslint.config.mjs`(루트 공유), `.prettierrc`, 테스트 러너 설정(`vitest.config.ts` 또는 jest — apps/api는 NestJS 기본 jest 허용), 샘플 테스트 각 패키지 1개(`*.spec.ts`) |
| Files to modify | 루트 `package.json`(lint/typecheck/test scripts 확정), `turbo.json` |
| Files NOT to modify | 공통(§0.5) |
| Verification (AND) | (1) `pnpm lint`·`pnpm typecheck`·`pnpm test`·`pnpm build` 로컬 exit 0 · (2) CI가 PR 트리거로 위 4단계를 실행하고 실패 시 red (고의 실패 커밋으로 1회 증명 후 revert) · (3) 회귀: TUW-001~002 verification 재통과 |
| Edge cases | (1) lint-only 변경에도 test가 스킵되지 않아야 함(turbo 캐시는 허용, 단계 생략은 불가) · (2) workers/ingestion Python lint는 본 TUW 범위 외 — CI에 placeholder job만(no-op 명시) |
| Stop condition | 공통(§0.4) + CI 플랫폼 자체를 결정할 근거 부재 시(사람 결정 필요) |
| Escalation | 공통(§0.6) |

### CORE-REPOBUIL-CICD-TUW-004 — staging deployment pipeline skeleton

| 필드 | 내용 |
|---|---|
| ID | CORE-REPOBUIL-CICD-TUW-004 |
| Title | 컨테이너 이미지 빌드·태깅까지 수행하는 staging 배포 파이프라인 skeleton |
| Release | R0 |
| Module | CORE-REPOBUIL-CICD |
| Risk | M |
| Size | S |
| Depends_on | CORE-REPOBUIL-CICD-TUW-003 |
| Objective | main 브랜치 머지 시 api/web/ingestion 3개 컨테이너 이미지가 빌드·태깅(커밋 SHA)되는 파이프라인 skeleton이 동작한다(실 배포 대상 연결은 범위 외). |
| Files to create | `apps/api/Dockerfile`, `apps/web/Dockerfile`, `workers/ingestion/Dockerfile`, `.dockerignore`, `infra/ci/staging-deploy.yml`(이미지 빌드+태깅까지, 배포 스텝은 `# TODO(R-deploy): 대상 미확정` 주석으로 명시적 no-op) |
| Files to modify | `.github/workflows/ci.yml`(또는 동등물 — staging 워크플로 등록) |
| Files NOT to modify | 공통(§0.5) |
| Verification (AND) | (1) `docker build` 3종 로컬 exit 0 · (2) 파이프라인 실행 로그에서 3개 이미지 SHA 태깅 확인 · (3) 이미지에 `.env`·시크릿 파일 미포함(이미지 inspect) · (4) 회귀: CI(TUW-003) green |
| Edge cases | (1) Next.js standalone 출력 미설정 시 이미지 비대 — multi-stage 필수 · (2) ingestion 이미지는 OCR 의존성 미포함(R2에서 추가) 명시 |
| Stop condition | 공통(§0.4) + 컨테이너 레지스트리 부재로 push 단계 정의 불가 시(태깅까지로 종료하고 ledger 기록) |
| Escalation | 공통(§0.6) |

### CORE-REPOBUIL-CICD-TUW-005 — production deployment gate skeleton

| 필드 | 내용 |
|---|---|
| ID | CORE-REPOBUIL-CICD-TUW-005 |
| Title | 수동 승인 단계를 포함한 production 배포 gate skeleton |
| Release | R0 |
| Module | CORE-REPOBUIL-CICD |
| Risk | M |
| Size | S |
| Depends_on | CORE-REPOBUIL-CICD-TUW-004 |
| Objective | production 트랙에 "사람 수동 승인 없이는 진행 불가" gate가 존재하고, gate 문서가 release 체크리스트(50번 문서)를 참조한다. |
| Files to create | `infra/ci/prod-gate.yml`(manual approval environment/step, 실 배포 스텝은 no-op), `infra/ci/PROD_GATE.md`(gate 조건: 해당 release Gate 체크리스트 통과 + Risk=C 리뷰 완료 — 50_Verification_Security_Gates.md 참조) |
| Files to modify | (없음) |
| Files NOT to modify | 공통(§0.5) + `infra/ci/staging-deploy.yml`의 승인 우회 경로 추가 금지 |
| Verification (AND) | (1) prod 워크플로 수동 트리거 시 승인 대기 상태에서 정지함을 실행 로그로 증명 · (2) 승인 없이 후속 스텝 실행 경로가 없음(워크플로 정적 검토) · (3) 회귀: CI·staging 파이프라인 green |
| Edge cases | (1) 승인자 미지정 시 워크플로가 실패(무한 대기 아님)하도록 타임아웃 명시 |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.6) |

---

## 2. CORE-DATACORE-MIGR — Database Core / Migration

### CORE-DATACORE-MIGR-TUW-001 — migration tool 확정·설정

| 필드 | 내용 |
|---|---|
| ID | CORE-DATACORE-MIGR-TUW-001 |
| Title | PostgreSQL migration 도구 확정 및 `pnpm db:migrate / db:rollback` 배선 |
| Release | R0 |
| Module | CORE-DATACORE-MIGR |
| Risk | H |
| Size | M |
| Depends_on | CORE-REPOBUIL-CICD-TUW-001 |
| Objective | 마이그레이션 도구는 **node-pg-migrate(SQL 파일 모드)로 확정**(SQL-first, `db/migrations/NNNN_name.sql` 규약 — Brief §4)되어 빈 DB에서 `pnpm db:migrate`·`pnpm db:rollback`이 동작한다. |
| Files to create | `db/migrations/README.md`(도구·번호 규약·실행법), node-pg-migrate 설정(SQL 파일 모드 — `db/migrations/NNNN_name.sql` up/down 페어를 그대로 실행. 도구 변경은 ADR 개정+사람 승인 필요 명시), `db/migrations/0000_noop.sql`(러너 검증용, up/down 페어) |
| Files to modify | 루트 `package.json`(`db:migrate`, `db:rollback` scripts), `.env.example`(DATABASE_URL) |
| Files NOT to modify | 공통(§0.5) |
| Verification (AND) | (1) compose로 띄운 빈 DB에서 `pnpm db:migrate` exit 0, 마이그레이션 이력 테이블 생성 확인 · (2) `pnpm db:rollback`으로 0000 되돌림 성공 · (3) 동일 마이그레이션 재실행 시 idempotent(skip) · (4) 도구 선택 근거를 `docs/adr/`(TRANSFER-002 전이면 `db/migrations/README.md`)에 기록 · (5) 회귀: 기존 suite green |
| Edge cases | (1) DB 연결 실패 시 명확한 오류로 종료(무한 재시도 금지) · (2) 마이그레이션 도중 실패 시 트랜잭션 롤백으로 부분 적용 잔류 없음 |
| Stop condition | 공통(§0.4) + node-pg-migrate(SQL 파일 모드)로 구현 불가한 제약 발견 시(도구 변경은 ADR 개정 사항 — 사람 결정) |
| Escalation | 공통(§0.6) — 도구 결정은 Decision Ledger(`docs/ledger/decision.md`)에 1줄 등재 |

### CORE-DATACORE-MIGR-TUW-002 — 초기 schema (tenants, users, audit_events)

| 필드 | 내용 |
|---|---|
| ID | CORE-DATACORE-MIGR-TUW-002 |
| Title | tenants·users·audit_events 초기 스키마 마이그레이션 (tenant_id NOT NULL + RLS) |
| Release | R0 |
| Module | CORE-DATACORE-MIGR |
| Risk | H |
| Size | M |
| Depends_on | CORE-DATACORE-MIGR-TUW-001 |
| Objective | 20_Data_Model_v1_1(§5 보강 반영) 기준의 tenants/users/audit_events 테이블이 RLS 포함으로 생성되어, tenant context 미설정 세션에서는 users/audit_events row가 0건 조회된다. |
| Files to create | `db/migrations/0001_initial_schema.sql` — (a) `tenants`(tenant_id PK, name, slug text NOT NULL UNIQUE — 20번 §3.1 CHECK 패턴 포함(storage tenant prefix·URL용), region, data_residency, status, settings_json jsonb NOT NULL DEFAULT '{}', created_at, updated_at; **글로벌 테이블 — RLS 예외, 예외 사유 주석 필수**), (b) `users`(user_id PK, tenant_id NOT NULL FK, email, name, role text — enum 강제는 R1 SEC-RBAC-ROLEMATR-TUW-001, status, mfa_enabled boolean NOT NULL DEFAULT false, password_hash, created_at, UNIQUE(tenant_id,email)) + RLS, (c) `audit_events`(event_id PK, tenant_id NOT NULL, actor_id, action, target_type, target_id, matter_id NULL, metadata_json jsonb, ip_address, created_at) + RLS. 컬럼 상세는 20_Data_Model_v1_1 §3.1~3.4가 규범(단 users.role CHECK는 R1에서 추가 — 위 주석). RLS는 `ENABLE`+`FORCE ROW LEVEL SECURITY`, 정책 `tenant_id = current_setting('app.current_tenant_id')::uuid`, 앱 DB role은 BYPASSRLS·superuser 금지 |
| Files to modify | `db/migrations/README.md`(테이블 목록 갱신) |
| Files NOT to modify | 공통(§0.5) |
| Verification (AND) | (1) `pnpm db:migrate` exit 0, 3개 테이블 존재 · (2) **권한(negative)**: `app.current_tenant_id` 미설정 세션에서 users/audit_events SELECT 0건, 타 tenant_id 설정 시 해당 tenant row만 조회됨(SQL 레벨 테스트) · (3) users.tenant_id에 NULL INSERT 실패 · (4) `pnpm db:rollback` 후 테이블 부재 확인, 재적용 성공(왕복) · (5) 회귀: 기존 suite green |
| Edge cases | (1) `current_setting('app.current_tenant_id')` 미설정 시 오류가 아닌 0건 동작이 되도록 `current_setting(..., true)` + NULL 비교 처리 · (2) 동일 email이 다른 tenant에는 존재 가능(UNIQUE 범위 검증) · (3) audit_events.actor_id는 시스템 행위 대비 NULL 허용 여부를 주석으로 확정(허용, 'system' 식별 규약) |
| Stop condition | 공통(§0.4) + 20_Data_Model_v1_1 컬럼 정의와 Brief §5가 충돌할 때 |
| Escalation | 공통(§0.6) |

### CORE-DATACORE-MIGR-TUW-003 — seed loader (데모 tenant 2개)

| 필드 | 내용 |
|---|---|
| ID | CORE-DATACORE-MIGR-TUW-003 |
| Title | 데모 tenant 2개와 tenant별 사용자 fixture를 적재하는 seed loader |
| Release | R0 |
| Module | CORE-DATACORE-MIGR |
| Risk | M |
| Size | S |
| Depends_on | CORE-DATACORE-MIGR-TUW-002 |
| Objective | `pnpm db:seed` 1회 실행으로 데모 tenant 2개(`tenant-alpha`, `tenant-beta`)와 각 tenant 사용자 2명(고정 UUID·해시된 비밀번호)이 멱등 적재되어 cross-tenant 테스트 fixture로 사용 가능하다. |
| Files to create | `tools/db/seed.ts`(또는 `db/seeds/0001_dev_seed.sql` — MIGR-001 도구 규약 준수), `tests/fixtures/seed/users.json`(고정 UUID, 평문 비밀번호는 dev 전용 명시) |
| Files to modify | 루트 `package.json`(`db:seed` script), `db/migrations/README.md` |
| Files NOT to modify | 공통(§0.5) + `db/migrations/0001_initial_schema.sql` |
| Verification (AND) | (1) 빈 DB에서 migrate→seed 후 tenants 2건·users 4건 · (2) seed 재실행 시 중복 생성 0(멱등) · (3) 비밀번호가 평문으로 DB에 저장되지 않음(해시 확인) · (4) production 환경변수(`NODE_ENV=production`)에서 seed 실행 거부 · (5) 회귀: 기존 suite green |
| Edge cases | (1) 일부 row 선존재 시 upsert로 수렴 · (2) seed 계정 mfa_enabled=false 고정(R0 로그인 가능해야 함 — USERSESS-004 참조) |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.6) |

### CORE-DATACORE-MIGR-TUW-004 — migration rollback 절차

| 필드 | 내용 |
|---|---|
| ID | CORE-DATACORE-MIGR-TUW-004 |
| Title | 마이그레이션 rollback 절차 문서화 및 down 경로 검증 자동화 |
| Release | R0 |
| Module | CORE-DATACORE-MIGR |
| Risk | H |
| Size | S |
| Depends_on | CORE-DATACORE-MIGR-TUW-003 |
| Objective | 모든 기존 마이그레이션이 down 경로를 갖고, "migrate→rollback 전체→재migrate" 왕복이 CI에서 자동 검증된다. |
| Files to create | `db/migrations/ROLLBACK.md`(절차: 단계 롤백/전체 롤백/실패 시 대응, **audit_events 등 append-only 데이터는 운영 환경에서 rollback으로 파기 금지** — dev/CI 한정 명시), `infra/ci/scripts/migration-roundtrip.sh`(빈 DB에서 왕복 검증) |
| Files to modify | `.github/workflows/ci.yml`(왕복 검증 job 추가) |
| Files NOT to modify | 공통(§0.5) + 기존 0000/0001 마이그레이션 본문(down 누락 발견 시 신규 마이그레이션이 아닌 **작업 중단·escalation** — 머지 전이라면 해당 PR 내 수정은 허용) |
| Verification (AND) | (1) `migration-roundtrip.sh` exit 0 (migrate→rollback 전체→재migrate→스키마 동일성 해시 비교) · (2) down 없는 마이그레이션 존재 시 스크립트가 실패함을 고의 케이스로 증명 후 제거 · (3) CI에서 해당 job green · (4) 회귀: 기존 suite green |
| Edge cases | (1) rollback 중 실패 시 부분 상태 잔류 없음(트랜잭션) · (2) seed 적재 상태에서 rollback 시 FK로 인한 실패가 명확한 메시지로 보고됨 |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.6) |

### CORE-DATACORE-MIGR-TUW-005 — tenant_id + RLS convention 문서화·템플릿

| 필드 | 내용 |
|---|---|
| ID | CORE-DATACORE-MIGR-TUW-005 |
| Title | 전 row-level 테이블 tenant_id NOT NULL + RLS 동반 규약 문서·템플릿·CI 검사 |
| Release | R0 |
| Module | CORE-DATACORE-MIGR |
| Risk | H |
| Size | M |
| Depends_on | CORE-DATACORE-MIGR-TUW-004 |
| Objective | 신규 테이블 마이그레이션이 tenant_id NOT NULL + RLS 정책을 동반하지 않으면(명시 예외 주석 없이) CI가 실패하는 규약·템플릿·검사 스크립트가 존재한다. |
| Files to create | `db/migrations/CONVENTIONS.md`(Brief §4·§5 규약: tenant_id NOT NULL, ENABLE+FORCE RLS, 정책 명명 `rls_<table>_tenant`, 예외는 `-- RLS-EXEMPT: <사유>` 주석 필수 — 예외 허용 대상: `tenants`, 글로벌 참조 테이블, `authorities`(scope 컬럼)), `db/migrations/TEMPLATE.sql`(신규 테이블 보일러플레이트), `infra/ci/scripts/check-migration-conventions.sh`(CREATE TABLE 감지 → tenant_id·RLS·예외주석 검사) |
| Files to modify | `.github/workflows/ci.yml`(검사 job), `db/migrations/README.md` |
| Files NOT to modify | 공통(§0.5) |
| Verification (AND) | (1) 기존 0001 마이그레이션이 검사 통과(tenants는 예외 주석 보유) · (2) **negative**: tenant_id 누락/RLS 누락/예외주석 누락 3종의 위반 fixture가 각각 검사 실패함을 증명(fixture는 `tests/fixtures/migrations-bad/`에 보존) · (3) CI green · (4) 회귀: 기존 suite green |
| Edge cases | (1) `CREATE TABLE IF NOT EXISTS`·따옴표 식별자도 감지 · (2) partition/인덱스 전용 마이그레이션은 오탐 없이 통과 |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.6) — 규약 자체는 Decision Ledger 등재 |

---

## 3. CORE-TENACORE-TENACONT — Tenant Core / Tenant Context

### CORE-TENACORE-TENACONT-TUW-001 — Tenant schema (API 측 구현)

| 필드 | 내용 |
|---|---|
| ID | CORE-TENACORE-TENACONT-TUW-001 |
| Title | tenant 엔티티·리포지토리·서비스 구현 (NestJS tenant module 골격) |
| Release | R0 |
| Module | CORE-TENACORE-TENACONT |
| Risk | H |
| Size | S |
| Depends_on | CORE-DATACORE-MIGR-TUW-002 |
| Objective | apps/api에 tenant module이 존재하여 tenant 조회(service 수준)가 동작하고, tenant 식별자 타입이 packages/shared에 단일 정의된다. |
| Files to create | `apps/api/src/modules/tenant/tenant.module.ts`, `tenant.entity.ts`, `tenant.service.ts`, `tenant.service.spec.ts`, `packages/shared/src/types/tenant.ts`(TenantId 브랜드 타입, TenantStatus) |
| Files to modify | `apps/api/src/app.module.ts`(TenantModule 등록), `packages/shared/src/index.ts` |
| Files NOT to modify | 공통(§0.5) + `db/migrations/0001_initial_schema.sql` |
| Verification (AND) | (1) unit: tenant 조회·status 필터 service 테스트 green · (2) 존재하지 않는 tenant 조회 시 null/NotFound 계약이 명확(테스트) · (3) 회귀: 기존 suite green |
| Edge cases | (1) status가 active가 아닌 tenant 처리 규약(조회는 가능, 컨텍스트 진입은 TUW-002에서 차단) |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.6) |

### CORE-TENACORE-TENACONT-TUW-002 — tenant context middleware

| 필드 | 내용 |
|---|---|
| ID | CORE-TENACORE-TENACONT-TUW-002 |
| Title | 요청 단위 tenant context 전파(AsyncLocalStorage) + DB 세션 `app.current_tenant_id` 주입 미들웨어 |
| Release | R0 |
| Module | CORE-TENACORE-TENACONT |
| Risk | H |
| Size | M |
| Depends_on | CORE-TENACORE-TENACONT-TUW-001 |
| Objective | 모든 보호 요청은 tenant context가 설정된 상태에서만 DB에 접근하며(트랜잭션마다 `SET LOCAL app.current_tenant_id`), context 부재 시 공개 엔드포인트(health, login)를 제외하고 요청이 차단된다. |
| Files to create | `apps/api/src/modules/tenant/tenant-context.ts`(AsyncLocalStorage 기반 컨텍스트), `tenant-context.middleware.ts`, `tenant-context.middleware.spec.ts`, `apps/api/src/common/db/tenant-aware-datasource.ts`(트랜잭션 래퍼: context의 tenant_id를 `SET LOCAL`로 주입, context 부재 시 throw) |
| Files to modify | `apps/api/src/app.module.ts`(미들웨어 전역 적용, 공개 경로 allowlist: `/v1/health*`, `/v1/auth/login`, `/v1/auth/password-reset/*`, `/metrics`) |
| Files NOT to modify | 공통(§0.5) + RLS 정책 마이그레이션(우회용 변경 금지) |
| Verification (AND) | (1) unit: context 설정/전파/소멸 테스트 green · (2) **권한(negative)**: context 없이 tenant-aware datasource 사용 시 예외(쿼리 미실행)임을 테스트로 증명 · (3) 트랜잭션 로그에서 `SET LOCAL app.current_tenant_id` 주입 확인(integration) · (4) 공개 allowlist 외 경로는 context 부재 시 401/403 계열로 차단 · (5) 회귀: 기존 suite green |
| Edge cases | (1) 비동기 콜백 체인에서 context 유실 없음(ALS 전파 테스트) · (2) 커넥션 풀 재사용 시 이전 요청의 tenant_id 잔류 금지 — `SET LOCAL`+트랜잭션 경계로 보장 · (3) tenant status≠active면 context 진입 거부 |
| Stop condition | 공통(§0.4) — 특히 R0 시점 tenant 결정 소스(세션 전 단계)는 "login 요청 본문의 tenant 식별자 + 세션 확립 후에는 세션값"으로 하되 모호하면 중단 |
| Escalation | 공통(§0.6) |

### CORE-TENACORE-TENACONT-TUW-003 — workspace model

| 필드 | 내용 |
|---|---|
| ID | CORE-TENACORE-TENACONT-TUW-003 |
| Title | tenant 하위 workspace 모델(테이블+서비스) 구현 |
| Release | R0 |
| Module | CORE-TENACORE-TENACONT |
| Risk | H |
| Size | M |
| Depends_on | CORE-TENACORE-TENACONT-TUW-002 |
| Objective | tenant 1:N workspace 모델이 존재하고(기본 workspace 자동 1개), workspace 조회가 tenant context 범위로 격리된다. |
| Files to create | `db/migrations/0002_workspaces.sql`(workspace_id PK, tenant_id NOT NULL FK, name, status, created_at + RLS — CONVENTIONS 준수), `apps/api/src/modules/tenant/workspace.entity.ts`, `workspace.service.ts`, `workspace.service.spec.ts` |
| Files to modify | `apps/api/src/modules/tenant/tenant.module.ts`, `tools/db/seed.ts`(tenant별 기본 workspace) |
| Files NOT to modify | 공통(§0.5) |
| Verification (AND) | (1) migrate 후 RLS 규약 검사(check-migration-conventions) green · (2) unit: workspace 생성·조회 green · (3) **권한(negative)**: tenant A context에서 tenant B workspace 조회 0건(integration) · (4) 회귀: migration 왕복 포함 기존 suite green |
| Edge cases | (1) tenant 생성 시 기본 workspace 누락 케이스 — seed/서비스에서 보정 · (2) workspace name tenant 내 중복 허용 여부 명시(UNIQUE(tenant_id,name) 채택) |
| Stop condition | 공통(§0.4) + workspace의 권한 의미(R1 권한모델과의 관계)가 사양으로 해석 불가하면 중단 — R0에서는 격리 단위가 아닌 조직 단위로만 사용 |
| Escalation | 공통(§0.6) |

### CORE-TENACORE-TENACONT-TUW-004 — cross-tenant access test (Risk=C)

| 필드 | 내용 |
|---|---|
| ID | CORE-TENACORE-TENACONT-TUW-004 |
| Title | 전 등록 endpoint 대상 cross-tenant 접근 차단 integration test 하네스 |
| Release | R0 |
| Module | CORE-TENACORE-TENACONT |
| Risk | **C — 사람 리뷰 게이트 필수 (Codex 단독 머지 금지)** |
| Size | M |
| Depends_on | CORE-TENACORE-TENACONT-TUW-003, CORE-DATACORE-MIGR-TUW-003, CORE-AUTHCORE-USERSESS-TUW-003, CORE-SECFOUND-FAILCLOSE-TUW-001 |
| Objective | tenant-alpha 사용자가 tenant-beta의 모든 리소스 엔드포인트에 접근 시 100% 차단(404 또는 PERMISSION_DENIED/TENANT_ISOLATION_VIOLATION, 데이터 비노출)됨을 등록 라우트 전수 순회로 증명하는 테스트가 CI에서 상시 실행된다. |
| Files to create | `tests/integration/cross-tenant.spec.ts`(라우터에서 등록 라우트 목록을 동적 수집 → 공개 allowlist 제외 전수 검사: A 세션으로 B 리소스 ID 접근), `tests/integration/helpers/tenant-fixtures.ts`(seed 기반 A/B 세션 확립), `tests/integration/rls-bypass.spec.ts`(app DB role로 tenant context 불일치 직접 SQL 시도 → 0건/거부) |
| Files to modify | 루트 `package.json`(`test:integration` 확정), `.github/workflows/ci.yml`(integration job: compose+migrate+seed 후 실행) |
| Files NOT to modify | 공통(§0.5) + 본 테스트를 약화시키는 변경(allowlist 확대, 라우트 수집 제외 추가)은 본 TUW 이후 **사람 승인 없이는 금지** — 테스트 파일에 경고 주석 명시 |
| Verification (AND) | (1) **권한(negative — 본 TUW의 본질)**: 전수 순회에서 차단 실패(2xx 또는 타 tenant 데이터 노출) 0건 · (2) 신규 라우트 추가 시 자동으로 검사 대상에 포함됨(고의 누락 라우트 fixture로 하네스가 fail함을 1회 증명) · (3) 응답 본문에 타 tenant의 존재 추론 가능 정보(제목·이름 등) 미포함 검사 · (4) RLS 직접 우회 시도 거부(integration) · (5) `pnpm test:integration` CI green · (6) 회귀: 전체 suite green · (7) **사람 리뷰 기록이 `docs/ledger/execution.md`에 존재** |
| Edge cases | (1) 404 vs 403 정책: 리소스 존재 노출을 피하려면 404 허용 — 둘 다 통과로 정의하되 5xx·2xx는 실패 · (2) ID 추측이 불가능한 UUID라도 차단은 컨텍스트 기준이어야 함(실존 B 리소스 ID로 검사) · (3) 라우트가 0건 수집되면 하네스 자체가 실패(공집합 통과 금지) |
| Stop condition | 공통(§0.4) + 차단 실패 라우트 발견 시 해당 라우트 수정이 본 TUW 범위를 넘으면 중단·escalation |
| Escalation | 공통(§0.6) + Risk=C: 머지 전 사람 리뷰 필수, 결과를 ledger에 기록 |

### CORE-TENACORE-TENACONT-TUW-005 — tenant settings API

| 필드 | 내용 |
|---|---|
| ID | CORE-TENACORE-TENACONT-TUW-005 |
| Title | `GET /v1/tenant/settings` 조회 API 구현 |
| Release | R0 |
| Module | CORE-TENACORE-TENACONT |
| Risk | M |
| Size | S |
| Depends_on | CORE-TENACORE-TENACONT-TUW-004 |
| Objective | 인증된 사용자가 자신의 tenant 설정(이름·region·data_residency·status)을 조회할 수 있고 비인증 요청은 AUTH_REQUIRED로 차단된다. |
| Files to create | `apps/api/src/modules/tenant/tenant.controller.ts`, `tenant.controller.spec.ts`, `packages/shared/src/dto/tenant-settings.dto.ts` |
| Files to modify | `apps/api/src/modules/tenant/tenant.module.ts` |
| Files NOT to modify | 공통(§0.5) + 수정(PATCH) 엔드포인트 추가 금지 — 설정 변경은 R1 RBAC(Firm Admin) 이후 |
| Verification (AND) | (1) 기능: 인증 세션으로 200 + 자신 tenant 값 · (2) **권한(negative)**: 비인증 401(AUTH_REQUIRED), 타 tenant 값 노출 불가(cross-tenant 하네스에 자동 포함) · (3) DTO에 내부 컬럼(암호화 키 등 향후 필드) 비노출 화이트리스트 방식 · (4) 회귀: cross-tenant 하네스 green |
| Edge cases | (1) tenant status≠active 시 응답 정책(조회는 허용, 명시) |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.6) |

---

## 4. CORE-AUTHCORE-USERSESS — Auth Core / User Session

### CORE-AUTHCORE-USERSESS-TUW-001 — User schema (API 측 구현)

| 필드 | 내용 |
|---|---|
| ID | CORE-AUTHCORE-USERSESS-TUW-001 |
| Title | user 엔티티·리포지토리·서비스 구현 (password hash 정책 포함) |
| Release | R0 |
| Module | CORE-AUTHCORE-USERSESS |
| Risk | H |
| Size | S |
| Depends_on | CORE-DATACORE-MIGR-TUW-002 |
| Objective | apps/api에 user module이 존재하여 tenant 범위 내 사용자 조회·생성(service 수준)이 동작하고, 비밀번호는 argon2id 해시로만 저장된다. |
| Files to create | `apps/api/src/modules/user/user.module.ts`, `user.entity.ts`, `user.service.ts`, `user.service.spec.ts`, `apps/api/src/modules/user/password.ts`(argon2id 해시·검증 유틸), `packages/shared/src/types/user.ts` |
| Files to modify | `apps/api/src/app.module.ts`, `packages/shared/src/index.ts` |
| Files NOT to modify | 공통(§0.5) + `db/migrations/0001_initial_schema.sql` |
| Verification (AND) | (1) unit: 생성 시 평문 비저장·해시 검증 round-trip green · (2) **보안(negative)**: user 객체 직렬화(JSON) 시 password_hash 미노출 테스트 · (3) 동일 email 타 tenant 생성 허용, 동일 tenant 중복 거부 · (4) 회귀: 기존 suite green |
| Edge cases | (1) email 정규화(소문자) 일관성 · (2) role 컬럼은 R0에서 자유 문자열 — 7종 enum 강제는 R1(SEC-RBAC-ROLEMATR-TUW-001)임을 주석 명시 |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.6) |

### CORE-AUTHCORE-USERSESS-TUW-002 — login API

| 필드 | 내용 |
|---|---|
| ID | CORE-AUTHCORE-USERSESS-TUW-002 |
| Title | `POST /v1/auth/login`·`POST /v1/auth/logout` + 서버측 세션 저장 구현 |
| Release | R0 |
| Module | CORE-AUTHCORE-USERSESS |
| Risk | H |
| Size | M |
| Depends_on | CORE-AUTHCORE-USERSESS-TUW-001 |
| Objective | 유효 자격증명으로 로그인 시 httpOnly 세션 쿠키가 발급되고(서버측 sessions 테이블), 무효 자격증명은 계정 존재를 노출하지 않는 단일 오류로 거부된다. |
| Files to create | `db/migrations/0003_sessions.sql`(session_id PK, tenant_id NOT NULL, user_id FK, token_hash text NOT NULL UNIQUE — 토큰 원문 저장 금지·SHA-256 해시만(20번 §3.3), mfa_verified boolean NOT NULL DEFAULT false, ip_address, user_agent, created_at, last_seen_at, expires_at, revoked_at NULL + RLS — 컬럼 상세는 20번 §3.3이 규범, CONVENTIONS 준수), `apps/api/src/modules/auth/auth.module.ts`, `auth.controller.ts`, `auth.service.ts`, `auth.service.spec.ts`, `session.repository.ts`, `packages/shared/src/dto/auth.dto.ts`(login 요청: tenant 식별자+email+password) |
| Files to modify | `apps/api/src/app.module.ts` |
| Files NOT to modify | 공통(§0.5) + `apps/api/src/modules/user/password.ts`의 해시 정책 약화 금지 |
| Verification (AND) | (1) 기능: 정상 로그인 200 + Set-Cookie(httpOnly, SameSite=Lax 이상, dev 외 Secure) · (2) **권한(negative)**: 잘못된 비밀번호/없는 계정/없는 tenant 모두 동일 401 응답(타이밍 차 최소화 — 더미 해시 검증), 응답에 존재 여부 미노출 · (3) logout 후 해당 세션으로 보호 자원 접근 401 · (4) 로그인 성공/실패가 구조화 로그에 기록되되 비밀번호·해시 미기록(로그 검사 테스트) — audit event 연동은 R1 AUDILOGG-TUW-002에서(주석 명시) · (5) 회귀: cross-tenant 하네스 포함 suite green |
| Edge cases | (1) 연속 실패 시 지수 지연(기본 5회 임계) — 본격 lockout 정책은 R1로 이관 명시 · (2) 세션 토큰은 충돌 불가 랜덤(≥128bit), DB에는 토큰 해시 저장 · (3) mfa_enabled=true 사용자 처리(TUW-004에서 확정 — 본 TUW에서는 TODO 거부 경로 자리만) |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.6) |

### CORE-AUTHCORE-USERSESS-TUW-003 — session middleware

| 필드 | 내용 |
|---|---|
| ID | CORE-AUTHCORE-USERSESS-TUW-003 |
| Title | 세션 검증 가드/미들웨어 + 세션→tenant context 연결 |
| Release | R0 |
| Module | CORE-AUTHCORE-USERSESS |
| Risk | H |
| Size | M |
| Depends_on | CORE-AUTHCORE-USERSESS-TUW-002 |
| Objective | 보호 엔드포인트는 유효 세션 없이는 AUTH_REQUIRED(401)로 차단되고, 유효 세션의 tenant_id가 tenant context(TENACONT-002)의 단일 출처가 된다. |
| Files to create | `apps/api/src/modules/auth/session.guard.ts`(전역 가드, `@Public()` 데코레이터로만 예외), `session.guard.spec.ts`, `apps/api/src/modules/auth/public.decorator.ts` |
| Files to modify | `apps/api/src/app.module.ts`(전역 가드 등록), `apps/api/src/modules/tenant/tenant-context.middleware.ts`(tenant 결정 소스를 세션값으로 교체 — 헤더 등 클라이언트 임의 지정 경로 제거) |
| Files NOT to modify | 공통(§0.5) + `@Public()` 적용은 health/login/password-reset/metrics 외 금지(가드 테스트로 고정) |
| Verification (AND) | (1) 기능: 유효 세션으로 보호 자원 200 · (2) **권한(negative)**: 무세션/만료 세션/revoked 세션/위조 토큰 각각 401, 클라이언트가 보낸 tenant 헤더가 세션 tenant를 덮어쓰지 못함을 테스트로 증명 · (3) `@Public()` 적용 라우트 목록이 allowlist와 일치(스냅샷 테스트) · (4) 회귀: cross-tenant 하네스 green |
| Edge cases | (1) 세션 만료 경계(expires_at 정확히 now) — 만료로 처리 · (2) 동시 다중 세션 허용 정책 명시(허용) · (3) 세션 sliding 연장은 R0 범위 외(고정 TTL) |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.6) |

### CORE-AUTHCORE-USERSESS-TUW-004 — MFA flag (TOTP는 R1)

| 필드 | 내용 |
|---|---|
| ID | CORE-AUTHCORE-USERSESS-TUW-004 |
| Title | mfa_enabled flag의 로그인 흐름 연결 (fail-closed: TOTP 미구현 동안 true면 로그인 거부) |
| Release | R0 |
| Module | CORE-AUTHCORE-USERSESS |
| Risk | M |
| Size | S |
| Depends_on | CORE-AUTHCORE-USERSESS-TUW-003 |
| Objective | `users.mfa_enabled=true`인 계정은 TOTP가 구현되는 R1까지 로그인이 fail-closed로 거부되고(MFA 단계 우회 불가), flag가 사용자 DTO에 노출된다. |
| Files to create | `apps/api/src/modules/auth/mfa.policy.ts`(R0 정책: enabled→거부, 사유 코드 `AUTH_REQUIRED` + reason `mfa_not_available`; R1 TOTP 교체 지점 주석), `mfa.policy.spec.ts` |
| Files to modify | `apps/api/src/modules/auth/auth.service.ts`(로그인 흐름에 정책 삽입), `packages/shared/src/dto/auth.dto.ts`, `packages/shared/src/types/user.ts`(mfaEnabled 노출) |
| Files NOT to modify | 공통(§0.5) + TOTP 검증 로직 구현 금지(R1 범위 — DEC-09) |
| Verification (AND) | (1) 기능: mfa_enabled=false 계정 정상 로그인 · (2) **권한(negative)**: mfa_enabled=true 계정 로그인 401 + 세션 미발급(DB에 세션 row 0건) · (3) flag 변경이 즉시 다음 로그인에 반영 · (4) 회귀: 로그인 테스트 suite green |
| Edge cases | (1) seed 계정은 전부 false 유지(MIGR-003과 정합) · (2) 거부 응답이 MFA 존재를 과도하게 노출하지 않도록 일반 메시지 + 내부 reason 로그 |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.6) |

### CORE-AUTHCORE-USERSESS-TUW-005 — password reset flow skeleton

| 필드 | 내용 |
|---|---|
| ID | CORE-AUTHCORE-USERSESS-TUW-005 |
| Title | 비밀번호 재설정 토큰 발급·확인 skeleton (메일 발송은 스텁) |
| Release | R0 |
| Module | CORE-AUTHCORE-USERSESS |
| Risk | M |
| Size | S |
| Depends_on | CORE-AUTHCORE-USERSESS-TUW-004 |
| Objective | `POST /v1/auth/password-reset/request`와 `POST /v1/auth/password-reset/confirm`이 단회용·만료형 토큰으로 동작하되(메일 발송은 인터페이스 스텁), 계정 존재 여부를 노출하지 않는다. |
| Files to create | `db/migrations/0004_password_reset_tokens.sql`(token_hash, tenant_id NOT NULL, user_id, expires_at, used_at NULL + RLS), `apps/api/src/modules/auth/password-reset.service.ts`, `password-reset.service.spec.ts`, `apps/api/src/modules/auth/mailer.stub.ts`(인터페이스 + 콘솔 스텁 — **외부 메일 API 연동 금지**, 사양 외 외부 호출 금지 원칙) |
| Files to modify | `apps/api/src/modules/auth/auth.controller.ts`(2개 라우트, `@Public()`), `apps/api/src/modules/auth/auth.module.ts` |
| Files NOT to modify | 공통(§0.5) |
| Verification (AND) | (1) 기능: request→confirm으로 비밀번호 변경 후 신규 비밀번호 로그인 성공·구 비밀번호 실패 · (2) **권한(negative)**: 만료 토큰/재사용 토큰/위조 토큰 confirm 전부 거부, 존재하지 않는 email request도 200 동일 응답(존재 비노출) · (3) confirm 성공 시 해당 사용자 기존 세션 전부 revoke · (4) 토큰 원문이 DB·로그에 미저장(해시만) · (5) 회귀: auth suite green |
| Edge cases | (1) 동일 사용자 연속 request 시 직전 토큰 무효화 · (2) 토큰 TTL 기본 30분 명시 |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.6) |

---

## 5. CORE-SECFOUND-FAILCLOSE — Security Foundation / Fail-closed

### CORE-SECFOUND-FAILCLOSE-TUW-001 — fail-closed guard 골격 + 표준 error code 9종

| 필드 | 내용 |
|---|---|
| ID | CORE-SECFOUND-FAILCLOSE-TUW-001 |
| Title | 표준 error code 9종(09번 §4) 정의 + 권한 판단 불가 시 PERMISSION_DENIED로 수렴하는 fail-closed guard 골격 |
| Release | R0 |
| Module | CORE-SECFOUND-FAILCLOSE |
| Risk | H |
| Size | M |
| Depends_on | CORE-TENACORE-TENACONT-TUW-002 |
| Objective | 권한 평가 경로에서 발생하는 모든 예외·타임아웃·미해석 결과가 PERMISSION_DENIED(403)로 변환되고(Brief §2 원칙 4), 표준 error code 9종이 packages/shared 단일 출처로 전 API 응답에 사용된다. |
| Files to create | `packages/shared/src/errors/error-codes.ts`(9종: `AUTH_REQUIRED`, `PERMISSION_DENIED`, `ETHICAL_WALL_BLOCKED`, `AI_POLICY_BLOCKED`, `DOCUMENT_LOCKED`, `VALIDATION_FAILED`, `UNSUPPORTED_FILE_TYPE`, `EXTERNAL_LINK_EXPIRED`, `TENANT_ISOLATION_VIOLATION` + HTTP 매핑표), `packages/shared/src/errors/app-error.ts`, `apps/api/src/modules/permission/permission.module.ts`(골격), `apps/api/src/modules/permission/fail-closed.ts`(권한 평가 래퍼: try/catch+timeout → DENY, 평가기 부재 시 DENY), `fail-closed.spec.ts`, `apps/api/src/common/filters/global-exception.filter.ts`(미분류 오류 → 500 + 내부정보 비노출, error code 응답 포맷 `{ code, message, requestId }`) |
| Files to modify | `apps/api/src/main.ts`(전역 필터 등록), `packages/shared/src/index.ts` |
| Files NOT to modify | 공통(§0.5) + error code 9종의 명칭·의미 변경 금지(09번 §4 고정) |
| Verification (AND) | (1) 기능: 9종 코드·HTTP 매핑 단위 테스트(401/403/403/403/423(or 409 — 매핑표에 고정)/400/415/410/403) · (2) **권한(negative)**: 평가기 예외/timeout/undefined 반환 3종 모두 DENY가 되는 테스트 · (3) 오류 응답 본문에 스택트레이스·SQL·내부 경로 미노출(스냅샷 테스트) · (4) 회귀: 기존 suite green |
| Edge cases | (1) DENY 변환 시 원인 오류는 구조화 로그에 (본문 아닌) requestId로 연결 · (2) ALLOW를 기본값으로 갖는 코드 경로가 생기지 않도록 래퍼 반환 타입을 `ALLOW | DENY` 명시 유니온으로 강제 · (3) timeout 기본 2s — 초과는 DENY |
| Stop condition | 공통(§0.4) + HTTP 매핑이 09번과 모순될 때 |
| Escalation | 공통(§0.6) |

### CORE-SECFOUND-FAILCLOSE-TUW-002 — guard 강제오류 주입 테스트

| 필드 | 내용 |
|---|---|
| ID | CORE-SECFOUND-FAILCLOSE-TUW-002 |
| Title | fail-closed 래퍼에 대한 오류 주입(fault injection) 테스트 suite |
| Release | R0 |
| Module | CORE-SECFOUND-FAILCLOSE |
| Risk | H |
| Size | S |
| Depends_on | CORE-SECFOUND-FAILCLOSE-TUW-001 |
| Objective | 권한 평가기에 강제 주입된 오류(throw/timeout/null/잘못된 타입/DB 단절) 전 케이스에서 응답이 PERMISSION_DENIED이고 2xx가 한 번도 발생하지 않음이 CI에서 상시 증명된다. |
| Files to create | `tests/integration/fail-closed-injection.spec.ts`(평가기 스텁 5종 주입: throw / 2s 초과 지연 / null 반환 / 비정형 객체 반환 / DB 커넥션 강제 종료), `tests/integration/helpers/fault-injector.ts` |
| Files to modify | `.github/workflows/ci.yml`(integration job 포함 확인) |
| Files NOT to modify | 공통(§0.5) + `apps/api/src/modules/permission/fail-closed.ts`(테스트를 통과시키기 위한 본체 약화 금지 — 수정 필요 시 escalation) |
| Verification (AND) | (1) **권한(negative)**: 주입 5종 전부 403 PERMISSION_DENIED, 2xx 0건 · (2) 주입 상황에서 응답 시간 상한(timeout+α) 내 종료(무한 대기 없음) · (3) 주입 오류가 로그에 requestId와 함께 기록되되 민감정보 없음 · (4) 회귀: 전체 suite green |
| Edge cases | (1) 평가기가 ALLOW를 반환한 직후 후속 단계에서 오류가 나도 결과는 DENY(부분 성공 누수 금지) |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.6) |

---

## 6. AUDIT-AUDIEVENCO-AUDILOGG — Audit Event Core / Audit Logger

> R0 범위는 TUW-001과 TUW-004 두 건이다. TUW-002(logger service)·003(metadata normalizer)·005(retention label)는 R1 (41번 문서).

### AUDIT-AUDIEVENCO-AUDILOGG-TUW-001 — AuditEvent schema

| 필드 | 내용 |
|---|---|
| ID | AUDIT-AUDIEVENCO-AUDILOGG-TUW-001 |
| Title | audit_events 스키마 확정·보강(인덱스·metadata_json 화이트리스트 규약) + audit module 골격 |
| Release | R0 |
| Module | AUDIT-AUDIEVENCO-AUDILOGG |
| Risk | H |
| Size | M |
| Depends_on | CORE-DATACORE-MIGR-TUW-002 |
| Objective | audit_events 테이블이 조회 인덱스와 metadata_json 화이트리스트 규약(키 화이트리스트, 값은 참조 ID/hash 수준 — Brief §2 원칙 7)을 갖추고, apps/api에 audit module 골격과 event action 타입의 단일 출처가 존재한다. |
| Files to create | `db/migrations/0005_audit_events_hardening.sql`(인덱스: `(tenant_id, created_at DESC)`, `(tenant_id, target_type, target_id)`, `(tenant_id, actor_id, created_at)`; 컬럼 주석으로 metadata_json 화이트리스트 규약 명시), `apps/api/src/modules/audit/audit.module.ts`, `audit-event.entity.ts`, `audit-event.types.ts`(R0 action 초기값: `LOGIN_SUCCESS`,`LOGIN_FAILURE`,`SESSION_REVOKED`,`PERMISSION_DENIED_HIT` — 41번 §0.7 canonical enum과 동일 명칭, 실제 기록 시작은 R1 logger service), `packages/shared/src/types/audit.ts`(metadata 화이트리스트 키 타입: 참조 ID·hash·코드값만, 자유 텍스트 필드 금지) |
| Files to modify | `apps/api/src/app.module.ts`, `packages/shared/src/index.ts` |
| Files NOT to modify | 공통(§0.5) + `db/migrations/0001_initial_schema.sql` |
| Verification (AND) | (1) migrate green + 인덱스 존재 확인 · (2) 타입 테스트: metadata에 화이트리스트 외 키·자유 텍스트 필드 추가 시 typecheck 실패(컴파일 negative 케이스) · (3) **격리(negative)**: RLS로 타 tenant audit row 조회 0건 · (4) 회귀: migration 왕복 포함 suite green |
| Edge cases | (1) metadata_json 빈 객체 허용 · (2) actor 없는 시스템 이벤트는 actor_id NULL + metadata.actor='system' 규약 · (3) 이벤트 본문에 문서 내용 절대 금지 — 타입 수준 + 규약 주석 이중 명시 |
| Stop condition | 공통(§0.4) + 화이트리스트 키 목록이 20번 문서와 충돌할 때 |
| Escalation | 공통(§0.6) |

### AUDIT-AUDIEVENCO-AUDILOGG-TUW-004 — append-only constraint (Risk=C)

| 필드 | 내용 |
|---|---|
| ID | AUDIT-AUDIEVENCO-AUDILOGG-TUW-004 |
| Title | audit_events DB 계층 append-only 강제: UPDATE·DELETE·TRUNCATE REVOKE + 차단 trigger |
| Release | R0 |
| Module | AUDIT-AUDIEVENCO-AUDILOGG |
| Risk | **C — 사람 리뷰 게이트 필수 (Codex 단독 머지 금지)** |
| Size | M |
| Depends_on | AUDIT-AUDIEVENCO-AUDILOGG-TUW-001 |
| Objective | 앱 DB role 기준 audit_events에 대한 UPDATE/DELETE/TRUNCATE가 DB 계층에서 100% 실패하고(REVOKE + BEFORE trigger 이중 방어), 이를 깨는 어떤 API 경로도 존재하지 않음이 integration test로 상시 증명된다 (Brief §2 절대 금지: "audit_events에 UPDATE/DELETE 가능한 경로"). |
| Files to create | `db/migrations/0006_audit_append_only.sql`(앱 role 대상 `REVOKE UPDATE, DELETE, TRUNCATE ON audit_events`; `CREATE TRIGGER audit_events_block_mutation BEFORE UPDATE OR DELETE ... RAISE EXCEPTION 'audit_events is append-only'`; **down 마이그레이션은 의도적으로 제공하지 않음 — ROLLBACK.md에 예외 절차(사람 승인) 명시**), `tests/integration/audit-immutability.spec.ts`(앱 role로 UPDATE/DELETE/TRUNCATE 직접 SQL → 전부 실패; ORM/리포지토리 경유 시도 → 실패; API 라우트 전수에서 audit_events 변경 엔드포인트 부재 확인) |
| Files to modify | `db/migrations/ROLLBACK.md`(append-only 예외 절차), `.github/workflows/ci.yml`(immutability job 포함 확인) |
| Files NOT to modify | 공통(§0.5) + 본 마이그레이션과 테스트를 약화시키는 변경은 사람 승인 없이 금지(파일 경고 주석) |
| Verification (AND) | (1) **보안(negative — 본질)**: UPDATE/DELETE/TRUNCATE 3종 × (직접 SQL, 리포지토리 경유) 전부 거부 · (2) INSERT·SELECT는 정상 동작(append와 조회는 유지) · (3) migration roundtrip 스크립트가 본 마이그레이션의 down 부재를 허용 예외로 처리함을 확인(예외 목록 명시) · (4) `pnpm test:integration` green · (5) 회귀: 전체 suite green · (6) **사람 리뷰 기록이 `docs/ledger/execution.md`에 존재** |
| Edge cases | (1) superuser/마이그레이션 role은 REVOKE 대상 외 — 운영 절차상 superuser 접근 통제는 인프라 영역임을 문서에 명시 · (2) 파티셔닝 도입(미래) 시 트리거 승계 필요 — 주석 명시 · (3) CASCADE 삭제 경로(FK) 부재 확인: audit_events를 참조하거나 참조되는 FK에 ON DELETE CASCADE 금지 |
| Stop condition | 공통(§0.4) + REVOKE가 마이그레이션 러너 role과 충돌해 적용 불가하면 중단(roles 분리 필요 — 사람 결정) |
| Escalation | 공통(§0.6) + Risk=C: 머지 전 사람 리뷰 필수 |

---

## 7. CORE-OBSE-LOGGMETR — Observability / Logging & Metrics

### CORE-OBSE-LOGGMETR-TUW-001 — structured logger

| 필드 | 내용 |
|---|---|
| ID | CORE-OBSE-LOGGMETR-TUW-001 |
| Title | JSON 구조화 로거 + 민감정보 redaction 정책 구현 |
| Release | R0 |
| Module | CORE-OBSE-LOGGMETR |
| Risk | M |
| Size | M |
| Depends_on | CORE-REPOBUIL-CICD-TUW-002 |
| Objective | apps/api 전역이 JSON 구조화 로거(pino 계열)를 사용하고, redaction 목록(password, password_hash, token, cookie, authorization, body 본문 필드)이 강제되어 민감정보가 로그에 기록되지 않는다 (Brief §2 원칙 7). |
| Files to create | `apps/api/src/common/logging/logger.module.ts`, `logger.ts`(redact paths 상수 포함), `logger.spec.ts`(redaction 검증) |
| Files to modify | `apps/api/src/main.ts`(부트스트랩 로거 교체), `apps/api/src/app.module.ts` |
| Files NOT to modify | 공통(§0.5) + redact 목록 축소 금지(추가만 허용 — 주석 명시) |
| Verification (AND) | (1) 기능: 로그 출력이 JSON 1줄 포맷(level, time, msg, context) · (2) **보안(negative)**: redact 대상 필드를 포함한 요청을 로깅했을 때 출력에 해당 값 미존재(테스트) · (3) 회귀: 기존 suite green |
| Edge cases | (1) 중첩 객체 내 민감 키도 redact · (2) 대용량 본문 로깅 차단(요청 body 전체를 info 레벨로 찍는 경로 금지 — lint 규칙 또는 코드 리뷰 체크 명시) |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.6) |

### CORE-OBSE-LOGGMETR-TUW-002 — request correlation id

| 필드 | 내용 |
|---|---|
| ID | CORE-OBSE-LOGGMETR-TUW-002 |
| Title | 요청 correlation id(requestId) 생성·전파·응답 헤더 노출 |
| Release | R0 |
| Module | CORE-OBSE-LOGGMETR |
| Risk | L |
| Size | S |
| Depends_on | CORE-OBSE-LOGGMETR-TUW-001 |
| Objective | 모든 요청에 requestId가 부여되어(수신 `x-request-id` 검증 후 수용 또는 신규 UUID) 해당 요청의 모든 로그 라인과 오류 응답 본문에 동일 id가 나타난다. |
| Files to create | `apps/api/src/common/logging/correlation.middleware.ts`, `correlation.middleware.spec.ts` |
| Files to modify | `apps/api/src/app.module.ts`, `apps/api/src/common/filters/global-exception.filter.ts`(requestId 포함 — FAILCLOSE-001의 응답 포맷과 정합) |
| Files NOT to modify | 공통(§0.5) |
| Verification (AND) | (1) 기능: 동일 요청의 전 로그 라인에 같은 requestId(테스트) + 응답 헤더 `x-request-id` · (2) 외부 제공 id가 비정형(과대 길이·제어문자)일 때 폐기 후 신규 발급(negative) · (3) 회귀: suite green |
| Edge cases | (1) ALS 컨텍스트(TENACONT-002)와 충돌 없이 공존 |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.6) |

### CORE-OBSE-LOGGMETR-TUW-003 — health endpoint

| 필드 | 내용 |
|---|---|
| ID | CORE-OBSE-LOGGMETR-TUW-003 |
| Title | `GET /v1/health/live`·`GET /v1/health/ready`(DB ping 포함) 구현 |
| Release | R0 |
| Module | CORE-OBSE-LOGGMETR |
| Risk | L |
| Size | S |
| Depends_on | CORE-OBSE-LOGGMETR-TUW-002 |
| Objective | liveness는 무의존 200, readiness는 DB 연결 확인 후 200/503을 반환하며 두 엔드포인트 모두 인증 없이 접근 가능하되 내부 상태 상세를 노출하지 않는다. |
| Files to create | `apps/api/src/modules/health/health.module.ts`, `health.controller.ts`, `health.controller.spec.ts` |
| Files to modify | `apps/api/src/app.module.ts`(`@Public()` allowlist 정합 — USERSESS-003) |
| Files NOT to modify | 공통(§0.5) |
| Verification (AND) | (1) 기능: live 200 상시, DB 정지 시 ready 503·기동 시 200(integration) · (2) 응답에 DB 호스트·버전 등 내부 정보 미노출 · (3) 회귀: cross-tenant 하네스(공개 allowlist 정합) green |
| Edge cases | (1) DB ping timeout 짧게(1s) — health가 행걸리지 않음 |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.6) |

### CORE-OBSE-LOGGMETR-TUW-004 — metrics endpoint

| 필드 | 내용 |
|---|---|
| ID | CORE-OBSE-LOGGMETR-TUW-004 |
| Title | Prometheus 형식 `/metrics` 엔드포인트 (HTTP 기본 지표) |
| Release | R0 |
| Module | CORE-OBSE-LOGGMETR |
| Risk | L |
| Size | S |
| Depends_on | CORE-OBSE-LOGGMETR-TUW-003 |
| Objective | 요청 수·지연·상태코드 히스토그램이 Prometheus 텍스트 형식으로 `/metrics`에 노출되고, 라벨에 사용자·tenant 식별정보가 포함되지 않는다. |
| Files to create | `apps/api/src/common/metrics/metrics.module.ts`, `metrics.middleware.ts`, `metrics.controller.ts`, `metrics.spec.ts` |
| Files to modify | `apps/api/src/app.module.ts`, `infra/docker-compose.dev.yml`(필요 시 포트 주석) |
| Files NOT to modify | 공통(§0.5) |
| Verification (AND) | (1) 기능: 호출 후 `/metrics`에 http_requests_total 증가 확인 · (2) **보안(negative)**: 라벨·지표명에 tenant_id/user_id/email 미포함(테스트), 경로 라벨은 라우트 패턴(원시 URL 금지 — cardinality·PII) · (3) 회귀: suite green |
| Edge cases | (1) high-cardinality 방지: 동적 파라미터는 `:id`로 정규화 |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.6) |

### CORE-OBSE-LOGGMETR-TUW-005 — error tracking hook

| 필드 | 내용 |
|---|---|
| ID | CORE-OBSE-LOGGMETR-TUW-005 |
| Title | 전역 예외 필터에 error tracking hook 인터페이스 연결 (외부 전송 기본 비활성) |
| Release | R0 |
| Module | CORE-OBSE-LOGGMETR |
| Risk | M |
| Size | S |
| Depends_on | CORE-OBSE-LOGGMETR-TUW-004 |
| Objective | 미처리 예외가 ErrorTracker 인터페이스로 전달되는 hook이 존재하되, 기본 구현은 구조화 로그 어댑터이고 외부 서비스 전송은 비활성이다(사양 외 외부 API 호출 금지 — Brief §2). |
| Files to create | `apps/api/src/common/errors/error-tracker.ts`(인터페이스 + LogErrorTracker 기본 구현, 민감정보 스크럽: 본문·헤더 제외, requestId·스택만), `error-tracker.spec.ts` |
| Files to modify | `apps/api/src/common/filters/global-exception.filter.ts`(hook 호출) |
| Files NOT to modify | 공통(§0.5) + 외부 APM/Sentry SDK 의존성 추가 금지(인터페이스만) |
| Verification (AND) | (1) 기능: 강제 예외 발생 시 tracker 호출 1회(spy) + requestId 포함 · (2) **보안(negative)**: tracker 페이로드에 요청 본문·쿠키·비밀번호 미포함 테스트 · (3) tracker 자체 예외가 응답을 깨지 않음(try/catch) · (4) 회귀: suite green |
| Edge cases | (1) 동일 예외 폭주 시 로그 폭주 — 간단한 dedupe/rate 메모(구현은 선택, 주석으로 한계 명시) |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.6) |

---

## 8. CORE-FESHELL-APPSHELL — Frontend Shell / App Shell

### CORE-FESHELL-APPSHELL-TUW-001 — Next.js app shell + 라우팅

| 필드 | 내용 |
|---|---|
| ID | CORE-FESHELL-APPSHELL-TUW-001 |
| Title | Next.js App Router 셸·레이아웃·라우트 그룹((auth)/(app)) 및 API 클라이언트 골격 |
| Release | R0 |
| Module | CORE-FESHELL-APPSHELL |
| Risk | M |
| Size | M |
| Depends_on | CORE-REPOBUIL-CICD-TUW-002, CORE-AUTHCORE-USERSESS-TUW-002 |
| Objective | apps/web이 (auth)/(app) 라우트 그룹 구조와 전역 레이아웃을 갖추고, `/v1` API 베이스의 fetch 클라이언트(쿠키 포함, 표준 error code 파싱)가 단일 모듈로 존재한다. |
| Files to create | `apps/web/src/app/(auth)/layout.tsx`, `apps/web/src/app/(app)/layout.tsx`(헤더·네비 자리), `apps/web/src/app/(app)/dashboard/page.tsx`(placeholder), `apps/web/src/lib/api-client.ts`(credentials include, `packages/shared` error code 타입 사용), `apps/web/src/lib/config.ts`(API base URL env) |
| Files to modify | `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`(→ dashboard redirect) |
| Files NOT to modify | 공통(§0.5) + `packages/shared`의 error code 정의 |
| Verification (AND) | (1) `pnpm build`(web) exit 0 + 라우트 트리에 (auth)/(app) 존재 · (2) api-client 단위 테스트: 표준 오류 응답 `{code,...}` 파싱·AUTH_REQUIRED 식별 · (3) 회귀: 전체 build green |
| Edge cases | (1) API base URL 미설정 시 빌드 아닌 런타임 명확 오류 · (2) 서버 컴포넌트에서 쿠키 전달 경로 주석 명시 |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.6) |

### CORE-FESHELL-APPSHELL-TUW-002 — 디자인시스템 base (shadcn/ui 설정)

| 필드 | 내용 |
|---|---|
| ID | CORE-FESHELL-APPSHELL-TUW-002 |
| Title | Tailwind + shadcn/ui 초기화 및 기본 컴포넌트·토큰 세트 |
| Release | R0 |
| Module | CORE-FESHELL-APPSHELL |
| Risk | L |
| Size | M |
| Depends_on | CORE-FESHELL-APPSHELL-TUW-001 |
| Objective | shadcn/ui가 설정되어 Button·Input·Card·Form·Toast 기본 컴포넌트와 디자인 토큰(globals.css)이 빌드에 포함되고 dashboard placeholder가 이를 사용한다. |
| Files to create | `apps/web/components.json`, `apps/web/tailwind.config.ts`, `apps/web/src/styles/globals.css`(토큰), `apps/web/src/components/ui/{button,input,card,form,toast}.tsx`(shadcn 생성물), `apps/web/src/components/ui/README.md`(추가 규약: shadcn CLI 경유) |
| Files to modify | `apps/web/src/app/layout.tsx`(globals.css·Toaster), `apps/web/src/app/(app)/dashboard/page.tsx`(샘플 사용) |
| Files NOT to modify | 공통(§0.5) |
| Verification (AND) | (1) `pnpm build`(web) exit 0 · (2) `pnpm lint` green(생성물 포함) · (3) dashboard 렌더 스모크 테스트(컴포넌트 마운트) · (4) 회귀: suite green |
| Edge cases | (1) 다크모드 토큰은 자리만(전환 UI는 범위 외) |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.6) |

### CORE-FESHELL-APPSHELL-TUW-003 — auth guard + 로그인 화면

| 필드 | 내용 |
|---|---|
| ID | CORE-FESHELL-APPSHELL-TUW-003 |
| Title | 로그인 화면 + 미인증 보호 라우트 redirect guard (Next middleware) |
| Release | R0 |
| Module | CORE-FESHELL-APPSHELL |
| Risk | M |
| Size | M |
| Depends_on | CORE-FESHELL-APPSHELL-TUW-002, CORE-AUTHCORE-USERSESS-TUW-003 |
| Objective | `/login`에서 tenant 식별자+email+비밀번호로 로그인하면 dashboard로 이동하고, 미인증 상태의 (app) 라우트 접근은 `/login`으로 redirect되며 로그아웃이 동작한다 (서버측 권한 강제는 API가 담당 — FE guard는 UX 계층임을 주석 명시). |
| Files to create | `apps/web/src/app/(auth)/login/page.tsx`, `apps/web/src/app/(auth)/login/login-form.tsx`, `apps/web/middleware.ts`(세션 쿠키 부재 시 redirect), `apps/web/src/lib/auth.ts`(login/logout 호출, 401 공통 처리 → /login) |
| Files to modify | `apps/web/src/app/(app)/layout.tsx`(로그아웃 버튼), `apps/web/src/lib/api-client.ts`(401 인터셉트) |
| Files NOT to modify | 공통(§0.5) + API의 세션·가드 코드(`apps/api/src/modules/auth/**`) |
| Verification (AND) | (1) 기능: 정상 로그인→dashboard, 로그아웃→/login (e2e 또는 통합 스모크) · (2) **권한(negative)**: 쿠키 없는 상태로 (app) 경로 직접 접근 시 /login redirect, 만료 세션의 API 401 시 /login 유도 · (3) 로그인 실패 시 일반 오류 메시지(계정 존재 비노출 — API 계약 그대로 표시) · (4) 회귀: web build·suite green |
| Edge cases | (1) redirect 루프 방지(/login 자체는 guard 제외) · (2) 로그인 폼 비밀번호 autocomplete/노출 방지 속성 |
| Stop condition | 공통(§0.4) |
| Escalation | 공통(§0.6) |

---

## 9. DEVOPS-DOCSPKG-TRANSFER — Docs Package Transfer

### DEVOPS-DOCSPKG-TRANSFER-TUW-001 — vault_dev_package + codex_dev_package → docs/package 이관 + normative 선언

| 필드 | 내용 |
|---|---|
| ID | DEVOPS-DOCSPKG-TRANSFER-TUW-001 |
| Title | 원천 사양 21개 문서와 codex_dev_package 전체를 repo `docs/package/`로 이관(read-only)하고 우선순위 선언 README + 루트 `AGENTS.md` 작성 |
| Release | R0 |
| Module | DEVOPS-DOCSPKG-TRANSFER |
| Risk | M |
| Size | S |
| Depends_on | CORE-REPOBUIL-CICD-TUW-001 |
| Objective | `docs/package/`에 vault_dev_package 문서 21개가, `docs/package/codex/`에 codex_dev_package 전체(md 문서 + `data/` + `diagrams/` 포함)가 무수정 복사되고, `docs/package/codex/90_AGENTS_TEMPLATE.md` 사본이 repo 루트 `AGENTS.md`로 존재하며, README가 "본 이관본은 normative 참조이며 codex_dev_package(특히 00_Master_Brief)가 충돌 시 우선"을 선언하고, 이후 CI가 이관본 변경을 차단한다(60번 PACK-R0-01 부트스트랩 특칙과 정합). |
| Files to create | `docs/package/README.md`(우선순위 선언 + 원본 위치·이관 일자·문서 목록 체크섬), `docs/package/*.md`(vault 21개 복사), `docs/package/codex/**`(codex_dev_package 전체 복사 — md 문서 + `data/backlog_r0_r3.csv`·`.json` + `diagrams/` 포함), `AGENTS.md`(repo 루트 — `docs/package/codex/90_AGENTS_TEMPLATE.md` 복사본), `infra/ci/scripts/check-docs-package-frozen.sh`(체크섬 비교로 변경 감지 — `docs/package/codex/**` 하위 포함) |
| Files to modify | `.github/workflows/ci.yml`(frozen 검사 job) |
| Files NOT to modify | 공통(§0.5) — 특히 원본 `../vault_dev_package/**` 절대 수정 금지, 이관 시 내용 변경(오탈자 포함) 금지 |
| Verification (AND) | (1) vault 21개 파일 + `docs/package/codex/**` 전체(data·diagrams 포함) 존재 + 원본과 체크섬 일치 · (2) 루트 `AGENTS.md`가 `docs/package/codex/90_AGENTS_TEMPLATE.md`와 내용 일치 · (3) **negative**: 이관본(codex/ 하위 포함) 1바이트 변경 시 frozen 검사 실패 증명(후 원복) · (4) 회귀: CI green |
| Edge cases | (1) 파일명 인코딩(한글 경로 없음 확인) · (2) DOCX 원본은 이관 대상 아님(vault는 md 21개만, codex는 data·diagrams 포함 전체) — README에 명시 |
| Stop condition | 공통(§0.4) + 원본 파일 목록(vault 21개 / codex 전체)이 실제와 불일치할 때 |
| Escalation | 공통(§0.6) |

### DEVOPS-DOCSPKG-TRANSFER-TUW-002 — ADR-001~012 초안 작성

| 필드 | 내용 |
|---|---|
| ID | DEVOPS-DOCSPKG-TRANSFER-TUW-002 |
| Title | 확정 결정(DEC-01~18, C-1~10)을 ADR-001~012로 정식화하여 `docs/adr/`에 작성 |
| Release | R0 |
| Module | DEVOPS-DOCSPKG-TRANSFER |
| Risk | M |
| Size | L |
| Depends_on | DEVOPS-DOCSPKG-TRANSFER-TUW-001 |
| Objective | `docs/adr/ADR-001.md`~`ADR-012.md`가 표준 ADR 형식(Status/Context/Decision/Consequences)으로 존재하고, 각 ADR이 Brief §1 DEC 및 §3 보정사항과 추적 가능하게 매핑되며 Status는 사람 승인 전 `proposed`다. |
| Files to create | `docs/adr/README.md`(번호↔DEC 매핑표 — codex_dev_package `01_Adopted_Decisions_ADR.md`와 일치시킴; 01번 문서 부재 시 Brief §1을 12건으로 정리: 배포/DB격리/백엔드·모노레포/프론트엔드/DB·검색·벡터/ingestion worker/스토리지/큐/인증·MFA/HWP 전략/외부 AI 차단/보존·PII·기타), `docs/adr/ADR-001.md` ~ `ADR-012.md` |
| Files to modify | `docs/ledger/decision.md`(ADR 초안 등재 1줄) |
| Files NOT to modify | 공통(§0.5) + 확정 결정의 내용 변경 금지(형식화만 — 결정 변경은 사람 영역) |
| Verification (AND) | (1) 12개 파일 존재 + 필수 섹션 4종 포함(스크립트 또는 수동 체크리스트) · (2) 각 ADR에 근거 DEC/C-번호 인용 존재 · (3) Brief §2 절대 금지 목록과 모순되는 서술 0건(검토) · (4) 회귀: docs frozen 검사 green · (5) **R0 Gate에서 사람 승인 → Status `accepted` 전환** (전환 자체는 Gate 절차) |
| Edge cases | (1) 18개 DEC를 12개 ADR로 묶는 그룹핑은 README 매핑표로 추적성 보장 · (2) ADR 간 상호 참조(예: 큐 선택이 DB 선택에 의존) 명시 |
| Stop condition | 공통(§0.4) + DEC 간 모순 발견 시(형식화 불가) 중단·escalation |
| Escalation | 공통(§0.6) |

---

## 10. DEVOPS-BACKLOG-VALIDATE — Backlog Validation

### DEVOPS-BACKLOG-VALIDATE-TUW-001 — 백로그 CSV 스키마·DAG·release 규칙 검증 스크립트 + CI 연결

| 필드 | 내용 |
|---|---|
| ID | DEVOPS-BACKLOG-VALIDATE-TUW-001 |
| Title | 기계가독 백로그(csv/json) 검증기: 스키마·ID 유일성·DAG 무순환·release 규칙(AI<R6 금지 등) + CI gate |
| Release | R0 |
| Module | DEVOPS-BACKLOG-VALIDATE |
| Risk | M |
| Size | M |
| Depends_on | CORE-REPOBUIL-CICD-TUW-003 |
| Objective | `tools/backlog/validate.mjs`(Node 스크립트 — TS 아님, 빌드 없이 `node`로 직접 실행)가 백로그 파일(`docs/package/codex/data/backlog_r0_r3.csv`·`.json` — TRANSFER-001 이관본)을 검사하여 (a) 필수 필드 스키마, (b) ID 유일성, (c) depends_on 실존·무순환 DAG, (d) depends_on의 release 역전 금지(후행 release TUW에 의존 금지), (e) 금지 규칙 — AI 기능 TUW의 R6 미만 배정 금지(예외: `AI-AIPOLI-SCHEMAONLY-TUW-001`은 R2 스키마 한정), VDR/External의 R11 미만 금지, Neo4j/Graph의 R7 미만 금지, vector/semantic의 R6 미만 금지 — 를 위반 시 비-0 종료하고 CI를 실패시킨다. 표준 실행 명령은 `node tools/backlog/validate.mjs docs/package/codex/data/backlog_r0_r3.csv`(60번 PACK-R0-01 검증 시퀀스와 동일). |
| Files to create | `tools/backlog/validate.mjs`, `tools/backlog/rules.mjs`(금지 규칙 표 — Brief §2 절대 금지 목록과 1:1 주석), `tools/backlog/README.md`, `tools/backlog/fixtures/`(위반 케이스 5종: 중복 ID/유령 dep/순환/release 역전/AI-R2) — 백로그 데이터 자체는 TRANSFER-001이 `docs/package/codex/data/`로 이관 완료(부재 시 Stop condition) |
| Files to modify | `.github/workflows/ci.yml`(validate job), 루트 `package.json`(`backlog:validate` script — `node tools/backlog/validate.mjs docs/package/codex/data/backlog_r0_r3.csv` 위임) |
| Files NOT to modify | 공통(§0.5) + 백로그 데이터 자체의 내용 수정 금지(검증기가 데이터에 맞추는 것 금지 — 위반 발견 시 escalation) |
| Verification (AND) | (1) 기능: 정상 백로그 입력 exit 0 · (2) **negative**: 위반 fixture 5종 각각 비-0 종료 + 위반 항목 식별 메시지 · (3) CI에서 validate job green · (4) 회귀: 전체 suite green |
| Edge cases | (1) csv/json 불일치 시 실패(이중 소스 정합성 검사) · (2) 빈 depends_on 허용(R0 시작점) · (3) 모듈명에 'AI' 부분 문자열 오탐 방지(모듈 prefix 정확 매칭) |
| Stop condition | 공통(§0.4) + 백로그 데이터 자체의 위반 발견 시(데이터 수정은 본 TUW 권한 밖) |
| Escalation | 공통(§0.6) |

---

## 11. Notes (편차·보충 기록)

1. **개수 표기**: Brief §7 R0 헤더 표기는 "(35 TUW)"로 보정 완료 — 행 목록 전개치(35)와 일치. TUW 추가·삭제 없음.
2. **보충 deps** (실행 가능성 목적, Brief §7 핵심 Deps의 ID 전개 외 최소 추가):
   - TENACONT-004 ← MIGR-003(데모 tenant 2개 fixture), USERSESS-003(A/B 세션 확립), FAILCLOSE-001(표준 error code 단언).
   - APPSHELL-001 ← CICD-002(apps/web 패키지 존재). 모듈 표기 dep `→AUTHCORE-002`는 규칙(§0.7)에 따라 APPSHELL-001에 귀속.
   - APPSHELL-003 ← USERSESS-003(세션 가드 계약).
3. **AUDILOGG 모듈 분담**: audit_events 테이블 생성은 MIGR-002(Brief가 초기 schema에 명시), AUDILOGG-001은 인덱스·metadata 규약·module 골격 보강으로 정의해 중복 생성을 배제.
4. **R0 audit 기록 의무**: audit logger service(AUDILOGG-002)가 R1이므로 R0의 로그인 등 행위는 구조화 로그까지만 — R1에서 audit event 소급 연결(41번 문서 책임).
5. **MFA fail-closed**: TOTP(R1) 전 mfa_enabled=true 계정 로그인 거부는 Brief 원칙 4(fail-closed)의 적용 — DEC-09와 충돌 없음.

---

## 12. R0 Gate — Foundation Completion 체크리스트 (Brief §7 Gate 기준 확장)

Gate는 release 단위이며, 전 항목 통과 전 R1 PACK 착수 금지 (Brief §9). 판정 결과와 증빙 링크는 `docs/ledger/execution.md`에 기록한다.

### 12.1 재현성 (Brief: "신규 클론 재현")

- [ ] G0-01 신규 클론에서 `pnpm install` → `docker compose -f infra/docker-compose.dev.yml up -d` → `pnpm db:migrate` → `pnpm db:seed` → `pnpm build` → `pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm test:integration` 전부 exit 0 (클린 머신/컨테이너에서 1회 증빙)
- [ ] G0-02 `pnpm db:rollback` 전체 왕복(migrate→rollback→재migrate) green — append-only 마이그레이션은 문서화된 예외
- [ ] G0-03 seed 멱등성: `pnpm db:seed` 2회 실행 후 row 수 불변

### 12.2 Tenant 격리 (Brief: "cross-tenant 전 endpoint 차단")

- [ ] G0-04 cross-tenant 하네스(TENACONT-004): 등록 라우트 전수 순회에서 차단 실패 0건, 라우트 수집 0건이면 하네스 실패(공집합 통과 금지) 확인
- [ ] G0-05 RLS: 전 row-level 테이블(users, audit_events, workspaces, sessions, password_reset_tokens)에 ENABLE+FORCE RLS 적용 — `pg_catalog` 조회 증빙. 예외 테이블(tenants)은 `-- RLS-EXEMPT` 주석 존재
- [ ] G0-06 RLS 직접 우회 시도(앱 DB role, 타 tenant context) 거부 — rls-bypass 테스트 green
- [ ] G0-07 마이그레이션 규약 검사(check-migration-conventions) CI green + 위반 fixture가 실패함을 재확인

### 12.3 Audit 불변성 (Brief: "audit UPDATE·DELETE DB 실패")

- [ ] G0-08 audit_events에 UPDATE/DELETE/TRUNCATE × (직접 SQL, 리포지토리 경유) 전부 DB 계층 거부 — audit-immutability 테스트 green + 수동 SQL 1회 증빙 캡처
- [ ] G0-09 audit_events를 변경하는 API 엔드포인트 부재(라우트 전수 검사)
- [ ] G0-10 audit_events 관련 FK에 ON DELETE CASCADE 부재 확인

### 12.4 Fail-closed (Brief: "fail-closed 동작 증명")

- [ ] G0-11 오류 주입 5종(throw/timeout/null/비정형/DB 단절) 전부 PERMISSION_DENIED, 2xx 0건 — fail-closed-injection 테스트 green
- [ ] G0-12 표준 error code 9종이 packages/shared 단일 출처이고 HTTP 매핑 테스트 green
- [ ] G0-13 오류 응답에 스택트레이스·SQL·내부 경로 미노출(스냅샷 증빙)

### 12.5 인증·세션

- [ ] G0-14 무세션/만료/revoked/위조 토큰 4종 모두 401 — negative suite green
- [ ] G0-15 클라이언트 제공 tenant 식별자가 세션 tenant를 덮어쓰지 못함(테스트 증빙)
- [ ] G0-16 mfa_enabled=true 계정 로그인 거부(fail-closed) 확인
- [ ] G0-17 비밀번호·세션 토큰·reset 토큰의 평문이 DB·로그 어디에도 없음(해시 저장 증빙 + 로그 redaction 테스트)

### 12.6 로깅·관측 (Brief §2 원칙 7)

- [ ] G0-18 redaction 테스트 green: password/token/cookie/authorization/요청 본문이 로그에 미기록
- [ ] G0-19 metrics 라벨에 tenant_id/user_id/email/원시 URL 미포함
- [ ] G0-20 requestId가 로그·오류 응답에 일관 전파

### 12.7 ADR·문서·백로그 (Brief: "ADR 승인")

- [ ] G0-21 `docs/package/` 21개 문서 + `docs/package/codex/` 전체(data·diagrams 포함) 이관 완료, 루트 `AGENTS.md` 생성 + frozen 검사 CI green(원본 무수정 확인 포함)
- [ ] G0-22 ADR-001~012 전건 **사람 승인** 후 Status=accepted 전환, `docs/ledger/decision.md` 기록 존재
- [ ] G0-23 backlog validator CI green + 위반 fixture 5종 실패 재확인
- [ ] G0-24 `AGENTS.md`가 90_AGENTS_TEMPLATE.md와 정합

### 12.8 절대 금지 준수 (Brief §2)

- [ ] G0-25 `packages/ai/`에 구현 코드 0건(인터페이스 placeholder만) — 정적 검사 증빙
- [ ] G0-26 VDR/external/secure-link/벡터/Neo4j 관련 코드·의존성 0건(grep 증빙)
- [ ] G0-27 사양 외 외부 API 호출 0건(의존성 트리 검토: 메일·APM 등은 스텁/인터페이스만)

### 12.9 거버넌스

- [ ] G0-28 Risk=C 2건(TENACONT-004, AUDILOGG-004)의 사람 리뷰 기록이 `docs/ledger/execution.md`에 존재
- [ ] G0-29 전 R0 PACK의 execution ledger 1줄 기록 존재
- [ ] G0-30 본 Gate 판정 자체를 ledger에 기록(판정자·일자·증빙 링크)

**Gate 불통과 시**: 미통과 항목을 ledger에 기재하고 해당 TUW로 회귀. R1 PACK 착수 금지.
