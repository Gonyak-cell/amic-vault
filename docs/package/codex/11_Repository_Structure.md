# 11. Repository Structure — 디렉토리 책임·모듈 경계·명명 상세

버전: 1.0 | 작성일: 2026-06-11 | 상태: Normative (단, `00_Master_Brief.md`와 충돌 시 Brief가 우선)
독자: Codex (구현 에이전트). 이 문서는 대화 컨텍스트 없이 단독으로 읽고 실행할 수 있도록 작성되었다.
선행 문서: `00_Master_Brief.md` §4(저장소 구조·명명규약), §2(불변 원칙·절대 금지), §6.4(Stop condition)
관련 문서: `10_Architecture_Tech_Stack.md`(스택·컴포넌트·보안 SQL), `20_Data_Model_v1_1.md`(DDL), `90_AGENTS_TEMPLATE.md`(AGENTS.md 원본)

대원칙: **아래에 없는 최상위 디렉토리·패키지의 신설은 Stop condition이다**(Brief §6.4 "Files NOT-modify 변경 필요 발견"과 동일 취급). 필요 시 작업을 중단하고 `docs/ledger/execution.md`에 escalation을 기록한다.

---

## 1. 전체 구조 (Brief §4 — 기준 트리)

```
amic-vault/
├── apps/api/                 # NestJS 백엔드
├── apps/web/                 # Next.js 프론트엔드
├── packages/shared/          # DTO, error codes, zod 스키마 (api·web·worker 공용 타입 — worker는 §5.1의 REST 스키마 경유)
├── packages/domain/          # 상태머신·도메인 규칙 (순수 TS, IO 없음)
├── packages/ai/              # R6 전: 인터페이스 placeholder만 (구현 금지)
├── workers/ingestion/        # Python 3.12 FastAPI worker
├── db/migrations/            # NNNN_name.sql (+ .down.sql)
├── db/seeds/                 # 시드 데이터 (release별 r0/, r1/ ... — 마이그레이션과 분리, 50번 §6.1)
├── infra/                    # docker-compose.dev.yml, ci/
├── docs/package/             # vault_dev_package 이관본 + codex/(본 패키지 이관본) (normative, 수정 금지)
├── docs/adr/                 # ADR-001~012
├── docs/ledger/              # decision/execution/learning ledger (append-only)
├── docs/reports/             # 평가·전환 판단 보고서 (R3: 한국어 토큰화 평가, OpenSearch 제안)
├── docs/evalset/             # 평가셋 v0 수집 절차 문서 (DEC-16)
├── tools/backlog/            # 백로그 CSV 검증 스크립트
├── tools/db/                 # 마이그레이션 러너·시드 스크립트 (migrate.ts, seed.ts)
├── tools/search-eval/        # R3: 한국어 검색 평가 스크립트 (SEARCH-KOREAN-EVAL)
├── tools/evalset/            # R3: 평가셋 v0 적재·위생 검사 스크립트 (DEVOPS-EVALSET-V0)
├── tests/integration/        # cross-tenant, permission-matrix, audit-immutability
├── tests/fixtures/           # 비식별 샘플 문서·이메일
├── AGENTS.md                 # 90_AGENTS_TEMPLATE.md 복사본
├── package.json              # 루트: 표준 스크립트(db:migrate, test:integration 등)
├── pnpm-workspace.yaml       # apps/*, packages/*, workers/*
└── turbo.json                # lint/typecheck/test/build 파이프라인
```

루트 `package.json`은 표준 검증 명령 세트를 제공해야 한다: `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build`(turbo 위임), `pnpm db:migrate` / `pnpm db:rollback`(`DATABASE_URL_MIGRATOR` 사용), `pnpm test:integration`(compose 의존 suite).

---

## 2. 디렉토리별 책임과 금지사항

| 디렉토리 | 책임 | **두면 안 되는 것** |
|---|---|---|
| `apps/api/` | NestJS REST API(`/v1`), 도메인 모듈 13종 + `health`(공개 liveness/readiness 모듈), pg-boss 핸들러, 미들웨어·가드 | React/UI 코드 · 상태머신 규칙 재구현(`packages/domain` 호출만) · `pgboss.*` 직접 SQL · 외부 AI/모델 SDK · PermissionService를 우회하는 endpoint |
| `apps/web/` | Next.js UI, app shell, 로그인·matter·문서·검색 화면 | DB 접근 코드 · 권한 **판정** 로직(서버 판정 결과 표시만) · API 외 데이터 소스 · 서버 비밀(`NEXT_PUBLIC_` 외 비밀 금지) |
| `packages/shared/` | DTO·zod 스키마·error code 9종·공용 enum·상수. api/web 공용 타입의 단일 출처 | IO(네트워크/파일/DB) · NestJS/Next.js 의존 · 비즈니스 로직 · 환경변수 접근 |
| `packages/domain/` | Matter 8상태·Document 11상태 상태머신, 권한 평가 순수 함수 보조, 도메인 규칙 — 전부 **순수 함수** | **IO 일체**(fs/net/DB/process.env) · 프레임워크 의존 · 비결정성(`Date.now()`·랜덤은 인자로 주입받는다) · 로깅 |
| `packages/ai/` | R6 전: TypeScript 인터페이스 선언 + README만 | 구현 코드 · 모델/임베딩 SDK 의존성 · `apps/*`에서의 import(§5에서 lint 차단) |
| `workers/ingestion/` | FastAPI worker: `ocr/`, `parsers/{pdf,docx,hwpx}/`, `chunking/`(R6 전 빈 디렉토리+README), HMAC 검증, Dockerfile | 앱 DB 접근 · 영구 상태(stateless) · 외부 네트워크 호출(presigned URL 제외) · HWP 5.0 바이너리 파서(R4~R6 트랙, DEC-10) |
| `db/migrations/` | `NNNN_name.sql` + `NNNN_name.down.sql`. §6 템플릿 준수 | RLS 블록 누락(예외는 `RLS-EXEMPT` 주석 필수) · 적용된 마이그레이션 파일의 사후 수정(새 번호로 추가) · hard delete/`DROP`으로 데이터 파괴(R12 전 금지) · 시드 데이터(시드는 `db/seeds/` + `tools/db/seed.ts`) |
| `db/seeds/` | release별 시드 데이터(`r0/`, `r1/`...) — 데모 tenant 2개, 멱등 적재(`pnpm db:seed`, 50번 §6.1) | 실데이터·실존 PII · 마이그레이션 SQL(스키마 변경은 `db/migrations/`) |
| `tools/db/` | 마이그레이션 러너·시드 스크립트(`migrate.ts`, `seed.ts`) — `pnpm db:migrate / db:rollback / db:seed`의 구현체 | 도메인 비즈니스 로직 · 운영 자격증명 |
| `infra/` | `docker-compose.dev.yml`, `ci/`(워크플로·검사 스크립트, 예: `ci/check-migrations.sh`) | 비밀값 커밋 · 운영 자격증명 · 사양에 없는 서비스 추가(예: Redis, OpenSearch — 각각 R4+/R3 Gate 결정 전 금지) |
| `docs/package/` | `vault_dev_package` 21개 문서 이관본 + normative 선언 | **일체의 수정**(read-only). 보정은 `codex_dev_package` 이관 문서·ADR로만 |
| `docs/adr/` | ADR-001~012 (+이후 증분) | 결정 없는 메모 · 기존 ADR 본문 소급 수정(Superseded 마킹으로만 변경) |
| `docs/ledger/` | `decision.md` / `execution.md` / `learning.md` — **append-only** | 기존 행 수정·삭제 · 문서 본문/기밀 내용 기재(참조 ID만) |
| `tools/backlog/` | 백로그 CSV 스키마·DAG·release 규칙(AI<R6 금지 등) 검증 스크립트 + CI 연결 | 백로그 데이터 자체의 수기 변조 |
| `tools/search-eval/` | R3 한국어 토큰화 평가 스크립트(`SEARCH-KOREAN-EVAL-TUW-001~002`) — 보고서는 `docs/reports/` | AI/임베딩 기반 평가(R6 전 금지 — 통계 측정만) |
| `tools/evalset/` | R3 평가셋 v0 적재·식별자 위생 검사 스크립트(`DEVOPS-EVALSET-V0-TUW-002`) | 평가셋 실데이터 커밋(repo 외 보안 저장 — 50번 §6.5) |
| `docs/reports/` | 평가·전환 판단 보고서(R3: `R3_korean_tokenization_eval.md`, `R3_opensearch_decision_proposal.md`) | 결정 기록(결정은 ADR·ledger 소관) |
| `docs/evalset/` | 평가셋 v0 수집 절차 문서(`Evaluation_Set_v0_Collection_Procedure.md`, DEC-16) | 평가셋 데이터 자체 |
| `tests/integration/` | cross-tenant/permission-matrix/audit-immutability 등 통합 테스트(§7) | 단위 테스트(소스 옆 배치) · fixtures 외부의 테스트 데이터 · 실데이터 |
| `tests/fixtures/` | 비식별 샘플 문서·이메일·HWPX(§8) | **실제 고객 데이터·실존 PII 일체** · 비식별화 증빙(manifest) 없는 파일 |
| `AGENTS.md` | Codex 운영 규칙(90번 템플릿 복사) | 템플릿과 다른 임의 규칙 추가(변경은 escalation) |

### apps/api 내부 구조

```
apps/api/src/
├── main.ts                    # bootstrap: 미들웨어 순서·전역 가드·versioning(/v1) 고정
├── app.module.ts
├── common/                    # 횡단 요소 (도메인 로직 금지)
│   ├── middleware/            # correlation-id, tenant-context, session
│   ├── guards/                # fail-closed.guard.ts
│   ├── filters/               # global-exception.filter.ts (표준 error code 변환)
│   ├── pipes/                 # zod-validation.pipe.ts
│   └── jobs/                  # pg-boss 부트스트랩·큐 상수
└── modules/
    ├── tenant/  auth/  user/  client/  matter/  party/
    ├── permission/  ethical-wall/  audit/
    ├── document/  storage/  search/  preview/
    └── health/                # 공개 /healthz·/readyz (R0, @Public opt-out 라우트)
```

### apps/web 내부 구조

```
apps/web/src/
├── app/            # App Router 라우트 (R0: 로그인·shell, R1: matter, R2: 문서, R3: 검색)
├── components/     # shadcn/ui 기반 디자인시스템 + 화면 컴포넌트
└── lib/            # API 클라이언트(fetch 래퍼, error code 매핑), 세션 유틸
```

---

## 3. 명명규약 (Brief §4 — 전 저장소 공통)

| 대상 | 규약 | 예 |
|---|---|---|
| DB 테이블 | snake_case **복수형** | `matters`, `document_versions`, `ethical_wall_memberships` |
| DB 컬럼 | snake_case | `tenant_id`, `created_at` |
| API 경로 | kebab-case, `/v1` prefix(DEC-14) | `POST /v1/matters/{matterId}/members` |
| TS 파일 | kebab-case | `tenant-context.service.ts` |
| NestJS 모듈 파일 | `*.module.ts / *.controller.ts / *.service.ts / *.spec.ts` | §4 템플릿 |
| TS 식별자 | 클래스 PascalCase, 변수·함수 camelCase, 상수 UPPER_SNAKE | `PermissionService`, `canReadMatter` |
| Python | PEP 8 (모듈 snake_case) | `parsers/hwpx/extractor.py` |
| pg-boss 큐 | `<domain>.<action>` 점 표기 | `ingestion.extract` (`10_Architecture` §6.2의 7종 외 신설 금지) |
| 마이그레이션 | `NNNN_<동사>_<대상>.sql` | §6 |
| 브랜치 | `feat/pack-rN-NN-<slug>` — `60_Execution_Packs.md`에 PACK별로 지정된 브랜치명 그대로 사용 | `feat/pack-r0-01-foundation` |

---

## 4. NestJS 모듈 파일 템플릿

새 모듈은 아래 골격을 그대로 따른다(예: `matter`). **다른 모듈이 import할 수 있는 것은 `index.ts`(public API)와 Nest DI `exports`에 오른 provider뿐이다.**

```
apps/api/src/modules/matter/
├── index.ts                     # public API: module 클래스 + 외부 노출 타입만 re-export
├── matter.module.ts
├── matter.controller.ts
├── matter.controller.spec.ts    # unit test — 소스 옆 배치(§7)
├── matter.service.ts
├── matter.service.spec.ts
├── matter.repository.ts         # DB 접근은 repository로 격리 (tenant 트랜잭션 필수)
├── dto/
│   ├── create-matter.dto.ts     # zod 스키마는 packages/shared에서 import하여 재사용
│   └── matter-response.dto.ts
└── entities/
    └── matter.entity.ts         # 영속 모델 (도메인 규칙 금지 — 규칙은 packages/domain)
```

```ts
// matter.module.ts
import { Module } from '@nestjs/common';
import { PermissionModule } from '../permission';   // index.ts 경유만 허용
import { AuditModule } from '../audit';
import { MatterController } from './matter.controller';
import { MatterService } from './matter.service';
import { MatterRepository } from './matter.repository';

@Module({
  imports: [PermissionModule, AuditModule],
  controllers: [MatterController],
  providers: [MatterService, MatterRepository],
  exports: [MatterService],                          // 외부 노출은 명시적으로만
})
export class MatterModule {}
```

```ts
// matter.controller.ts — 컨트롤러는 얇게: DTO 검증·서비스 위임·HTTP 변환만
import { Controller, Get, Param, Post, Body } from '@nestjs/common';
import { MatterService } from './matter.service';
import { Ctx, RequestContext } from '../../common/middleware/request-context';

@Controller({ path: 'matters', version: '1' })       // → /v1/matters
export class MatterController {
  constructor(private readonly matterService: MatterService) {}

  @Post()
  create(@Ctx() ctx: RequestContext, @Body() dto: CreateMatterDto) {
    return this.matterService.createMatter(ctx, dto);
  }

  @Get(':matterId')
  get(@Ctx() ctx: RequestContext, @Param('matterId') matterId: string) {
    return this.matterService.getMatter(ctx, matterId);
  }
}
```

```ts
// matter.service.ts — 표준 패턴: 권한(assertCan*) → 도메인 규칙(packages/domain) → 영속 + audit 동일 트랜잭션
async createMatter(ctx: RequestContext, dto: CreateMatterDto): Promise<MatterResponseDto> {
  await this.permissionService.assertCanCreateMatter(ctx);          // fail-closed (불변 원칙 4)
  return this.tenantContext.runInTenantTx(ctx, async (tx) => {
    const matter = await this.matterRepository.insert(tx, ctx, dto);
    await this.auditService.record(tx, ctx, {
      action: 'MATTER_CREATED',
      targetType: 'matter',
      targetId: matter.matterId,                                    // 참조 ID만 — 본문·제목 원문 금지
    });                                                             // audit 실패 = 트랜잭션 롤백 (불변 원칙 3)
    return toMatterResponse(matter);
  });
}
```

체크리스트(새 모듈 PR의 리뷰 기준):

- [ ] `index.ts`가 module 클래스와 노출 타입만 export하는가
- [ ] DB 접근이 repository + `runInTenantTx`로만 이루어지는가
- [ ] 상태 전이·도메인 규칙이 `packages/domain` 순수 함수 호출인가
- [ ] 권한 검사(`assertCan*`)가 모든 자원 접근 경로에 있는가 (negative test 포함)
- [ ] 행위 기록 대상 작업에 동일 트랜잭션 audit가 있는가
- [ ] `*.spec.ts`가 각 controller/service 옆에 존재하는가

---

## 5. 의존 방향 규칙과 import 경계 lint

### 5.1 의존 그래프 (화살표 = "의존한다")

```
apps/web ──────► packages/shared ◄────── apps/api
                       ▲                    │ │
                       │                    │ └────► packages/ai   (R6부터. R6 전 import 금지)
              packages/domain ◄─────────────┘
```

| 패키지 | 의존 가능 대상 | 절대 금지 |
|---|---|---|
| `packages/shared` | (없음 — zod 등 최소 유틸 라이브러리만) | 다른 워크스페이스 패키지 일체 |
| `packages/domain` | `packages/shared`만 | IO 라이브러리(`pg`,`fs`,`node:*`,HTTP 클라이언트), 프레임워크(`@nestjs/*`,`next`,`react`), `process.env` |
| `packages/ai` | `packages/shared`만 (인터페이스 시그니처용) | 모델 SDK·구현 의존성 일체 (R6 전) |
| `apps/api` | `shared`, `domain` | `apps/web`, `packages/ai`(R6 전), 타 모듈 내부 파일(§5.3) |
| `apps/web` | `shared`만 | `apps/api`, `packages/domain`, `packages/ai` — UI에 필요한 enum·타입은 shared로 승격하여 노출 |
| `workers/ingestion`(Python) | TS 패키지 import 불가 — 계약은 `10_Architecture` §7 REST 스키마가 단일 출처 | 앱 DB 드라이버, 외부 API 클라이언트 |

`packages/domain`의 `package.json` `dependencies`는 `@amic-vault/shared` 하나여야 한다(CI에서 검사 가능한 규칙).

### 5.2 루트 ESLint 경계 규칙

```js
// eslint.config.mjs (루트, 발췌) — import 경계. glob 세부는 PACK-R0-01에서 확정하되 의미론은 불변
rules: {
  'import/no-restricted-paths': ['error', {
    zones: [
      // shared는 최하층: 어떤 워크스페이스 패키지도 import 금지
      { target: './packages/shared', from: ['./apps', './packages/domain', './packages/ai', './workers'] },
      // domain은 상위 계층을 모른다
      { target: './packages/domain', from: ['./apps', './packages/ai'] },
      // web은 shared만: domain/ai/api import 금지
      { target: './apps/web', from: ['./packages/domain', './packages/ai', './apps/api'] },
      // api는 web을 모른다 + R6 전 ai 금지 (R6 Gate 통과 시 이 zone 한 줄만 제거)
      { target: './apps/api', from: ['./apps/web'] },
      { target: './apps/api', from: ['./packages/ai'],
        message: 'R6 AI Governance Gate 전 packages/ai import 금지 (Brief §2 절대 금지)' },
    ],
  }],
}
```

```js
// packages/domain/eslint.config.mjs — IO·비결정성 차단
rules: {
  'no-restricted-imports': ['error', {
    patterns: [{ group: ['node:*', 'fs', 'fs/*', 'path', 'http', 'https', 'pg', 'pg-*', 'axios', 'undici',
                          '@nestjs/*', 'next', 'next/*', 'react', 'react/*'],
                 message: 'packages/domain은 순수 TS — IO·프레임워크 의존 금지 (Brief §4)' }],
  }],
  'no-restricted-globals': ['error',
    { name: 'process', message: 'domain에서 process.env 금지' },
    { name: 'fetch',   message: 'domain에서 네트워크 IO 금지' }],
}
```

### 5.3 apps/api 모듈 간 경계

```js
// apps/api/eslint.config.mjs — 타 모듈 내부 파일 직접 import 차단 (index.ts 경유 강제)
rules: {
  'no-restricted-imports': ['error', {
    patterns: [{ group: ['**/modules/*/!(index)', '**/modules/*/!(index).*', '**/modules/*/*/**'],
                 message: '다른 모듈은 public index(../<module>)로만 import (11_Repository_Structure §4)' }],
  }],
}
```

같은 모듈 내부에서는 상대 경로 자유. 서비스 간 협력은 Nest DI(`exports`에 오른 provider 주입)가 기본이고, 타입만 필요하면 `index.ts`가 re-export한 타입을 쓴다. **`pnpm lint`는 위 3개 설정이 모두 활성화된 상태로 green이어야 하며, 경계 규칙의 완화·삭제는 escalation 대상이다**(예외: R6 Gate 통과 시 ai zone 제거).

---

## 6. 마이그레이션 파일 — 명명과 템플릿

기본 도구는 raw SQL(`db/migrations/`)이며, PACK-R0-01(`CORE-DATACORE-MIGR-TUW-001`)에서 TypeORM/Prisma로 바꾸더라도 **아래 명명·필수 블록 의미론은 그대로 유지**되어야 한다.

### 6.1 명명

```
db/migrations/
├── 0001_init_roles_and_extensions.sql        # vault_migrator/vault_app role, pgcrypto 등
├── 0001_init_roles_and_extensions.down.sql   # 역방향 (pnpm db:rollback)
├── 0002_create_tenants.sql                   # RLS-EXEMPT 예시 (§6.4)
├── 0002_create_tenants.down.sql
├── 0003_create_users.sql
└── ...
```

- `NNNN` 4자리 0-padding, 저장소 전체 단조 증가. 병렬 PACK에서 번호 충돌 시 **나중에 머지되는 쪽이 번호를 재부여**한다(빈 번호 허용, 재사용 금지).
- 한 파일 = 한 목적(테이블 1~2개 또는 단일 변경). 적용된 마이그레이션 파일은 수정 금지 — 정정도 새 번호의 새 파일로.
- 모든 `NNNN_*.sql`에는 짝이 되는 `.down.sql`이 필수다(`pnpm db:rollback` 계약, R0 `CORE-DATACORE-MIGR-TUW-004`). 단 `audit_events`처럼 down이 데이터 파괴를 의미하는 경우 down은 구조 제거가 아니라 `RAISE EXCEPTION '... requires manual review'`로 막을 수 있다(주석으로 사유 명시).

### 6.2 표준 템플릿 (row-level 테이블 — tenant_id + RLS 필수 블록 포함)

```sql
-- ============================================================================
-- Migration : 0007_create_matters
-- Release   : R1
-- TUW       : MATTER-MATTMANA-MATTREGI-TUW-001
-- Purpose   : Matter 핵심 테이블 생성
-- RLS       : REQUIRED (tenant_id)        -- 또는 "EXEMPT" + §6.4 주석
-- Rollback  : 0007_create_matters.down.sql
-- ============================================================================
BEGIN;

CREATE TABLE matters (
  matter_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants (tenant_id),   -- [필수] 전 row-level 테이블
  client_id    uuid NOT NULL REFERENCES clients (client_id),
  matter_name  text NOT NULL,
  matter_type  text NOT NULL,
  status       text NOT NULL DEFAULT 'proposed',
  -- ... 상세 컬럼은 20_Data_Model_v1_1.md가 규범 ...
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_matters_tenant ON matters (tenant_id);
CREATE INDEX idx_matters_tenant_client ON matters (tenant_id, client_id);

-- ──[필수 블록: RLS — 이 블록 없는 row-level 테이블 마이그레이션은 머지 금지]──
ALTER TABLE matters ENABLE ROW LEVEL SECURITY;
ALTER TABLE matters FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON matters
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
-- ──[필수 블록 끝]──

-- 런타임 권한은 필요한 만큼만. DELETE는 정당화 주석 없이 GRANT 금지(hard delete 차단)
GRANT SELECT, INSERT, UPDATE ON matters TO vault_app;

COMMIT;
```

```sql
-- 0007_create_matters.down.sql
BEGIN;
DROP TABLE IF EXISTS matters;
COMMIT;
```

### 6.3 필수 블록 규칙 요약

1. `tenant_id uuid NOT NULL` + `tenants` FK — 전 row-level 테이블(Brief §5-3, 원천 누락 14개 포함).
2. `ENABLE` + `FORCE ROW LEVEL SECURITY` + `tenant_isolation` 정책(USING + WITH CHECK 모두).
3. `tenant_id` 선두 복합 인덱스(조회 패턴 기준).
4. `GRANT`는 화이트리스트 방식 — 특히 `audit_events`는 `INSERT, SELECT`만 + append-only trigger(`10_Architecture_Tech_Stack.md` §8.3 SQL 그대로).

### 6.4 RLS 예외 (허용 목록 외 예외는 escalation)

`tenants`, 글로벌 참조 테이블, `authorities`(scope global|tenant), pg-boss의 `pgboss.*`(라이브러리 관리)만 예외이며, 예외 파일에는 다음 주석이 필수다:

```sql
-- RLS-EXEMPT: tenants는 tenant 식별의 루트 테이블로 자기 자신을 tenant 범위로 가둘 수 없음.
-- 접근은 vault_app에 SELECT만 GRANT하고 컬럼을 최소화하는 것으로 통제한다. (근거: Brief §4 명명규약 단서)
```

### 6.5 CI 검사

`infra/ci/check-migrations.sh`(R0 `CORE-DATACORE-MIGR-TUW-005`에서 작성)가 lint 단계에서 강제한다: (a) `CREATE TABLE`이 있는 파일은 `ENABLE ROW LEVEL SECURITY` 또는 `RLS-EXEMPT` 주석을 포함할 것, (b) `tenant_id` 컬럼 부재 + 예외 주석 부재 → 실패, (c) `.down.sql` 짝 존재, (d) 번호 중복 없음.

---

## 7. 테스트 배치 규칙

| 계층 | 위치 | 명명 | 실행 명령 | 외부 의존 |
|---|---|---|---|---|
| Unit (TS) | **소스 파일 바로 옆** | `*.spec.ts` (`matter.service.ts` ↔ `matter.service.spec.ts`) | `pnpm test` | 없음 — DB/네트워크 mock. compose 불요 |
| Unit (domain) | `packages/domain/src/` 옆 | `*.spec.ts` | `pnpm test` | 순수 함수이므로 mock조차 불요 |
| Integration | `tests/integration/<영역>/` | `*.int.spec.ts` | `pnpm test:integration` | compose(PG·MinIO·worker) + `pnpm db:migrate` 선행 |
| Worker (Python) | `workers/ingestion/tests/` | `test_*.py` (pytest) | `pnpm test` (워크스페이스 `package.json`의 `test` 스크립트가 pytest 호출 — turbo 파이프라인에 포함) | fixtures만 |

### 7.1 tests/integration 표준 하위 구조 (Gate 체크리스트와 1:1 — `50_Verification_Security_Gates.md` 참조)

```
tests/integration/
├── helpers/                  # 테스트 tenant 2개 부트스트랩(시드 loader 재사용), 로그인 헬퍼
├── cross-tenant/             # R0 Gate: 전 endpoint 타 tenant 자원 접근 차단 (C)
├── permission-matrix/        # R1 Gate: role 7종 × action × wall 상태 하네스 (SEC-PERMHARN-MATRIX)
├── audit-immutability/       # R0 Gate: UPDATE/DELETE/TRUNCATE DB 계층 실패 (C)
├── document-vault/           # R2 Gate: hash·immutable original·hold flag·DOCUMENT_* audit 5종
└── search/                   # R3 Gate: 미권한 문서 title/snippet/metadata 미노출, wall 상호 격리
```

### 7.2 규칙

1. unit과 integration의 구분 기준은 **외부 프로세스 의존 여부**다. DB가 필요하면 integration이다 — unit에서 실 DB 접속 금지.
2. 권한·보안 영향 테스트는 **negative case가 필수**다(Brief §6.3): "비인가 시도가 차단된다"가 없는 suite는 검증 미충족.
3. integration 테스트는 자체 트랜잭션/시드로 격리하고 실행 순서에 의존하지 않는다. 테스트 데이터는 helpers의 시드 loader(데모 tenant 2개)와 `tests/fixtures/`만 사용.
4. cross-tenant suite는 **신규 endpoint 추가 시 자동으로 포괄**하도록 라우트 목록 기반으로 작성한다(라우트 등록부를 순회하며 타 tenant 토큰으로 호출 → 전부 거부 확인). 개별 작성 누락이 Gate 구멍이 되지 않게 한다.
5. CI 순서: `pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm build` → (compose 기동 + `pnpm db:migrate`) → `pnpm test:integration`.

---

## 8. fixtures 규칙 (`tests/fixtures/`) — 비식별화

```
tests/fixtures/
├── manifest.json             # [필수] 전 파일의 출처·비식별화 증빙 대장
├── documents/                # PDF/DOCX 합성 계약서·메모
├── hwpx/                     # HWPX 검증 5종 (DOC-HWPX-EXTRACT-TUW-002)
├── emails/                   # EML/MSG (R4 준비분 — R4 전 파싱 코드 금지, 파일 보관만)
└── dlp/                      # 합성 식별자 패턴 (DLP 테스트용, R4 진입조건 C-4 대비)
```

1. **실제 고객 문서·실존 인물 PII는 어떤 형태로도 커밋 금지.** 허용되는 출처는 두 가지뿐: (a) 처음부터 합성(synthetic), (b) 종결 Matter 기반 비식별화(DEC-16 — 단, 비식별화 절차 문서 `DEVOPS-EVALSET-V0-TUW-001` 승인 후에만, R3부터).
2. `manifest.json` 필수 — manifest에 없는 파일은 CI에서 실패 처리:

```jsonc
[{
  "path": "documents/sample_nda_ko.docx",
  "type": "docx",
  "source": "synthetic",              // synthetic | anonymized
  "purpose": "DOCX extractor 검증 (DOC-OCRTEXTEXT-EXTRWORK-TUW-003)",
  "pii": "none",                      // none | synthetic-identifiers
  "approved_by": "PM",                // anonymized인 경우 승인자 필수
  "created_at": "2026-06-11"
}]
```

3. 합성 식별자(주민번호·계좌번호 등 패턴 테스트용)는 생성 스크립트로 만들고 `pii: "synthetic-identifiers"`로 표기한다. 실존 번호와의 충돌 가능성을 차단하는 규칙(예: 명백한 테스트 대역 사용)을 스크립트에 주석으로 남긴다.
4. 회사명·인명은 명백한 가상 명칭(예: "가나다 주식회사", "홍길동")만. 실존 로펌·고객사명 금지.
5. HWPX fixture 5종은 최소: 일반 본문 / 표 포함 / 각주·미주 / 한자 혼용 / 손상 파일(파서 실패 시 원본 무손상 검증용)을 포괄한다.
6. fixture는 크기 상한 10MB/파일. 대용량이 필요한 성능 테스트는 생성 스크립트를 커밋(산출물 커밋 금지).

---

## 9. 기타 운영 파일 규칙

- **`docs/ledger/`**: 3개 파일(`decision.md`, `execution.md`, `learning.md`) 모두 append-only — 새 줄 추가만 허용, 기존 줄 수정·삭제 금지(git diff로 검증 가능). PACK 완료 시 `execution.md`에 1줄(PACK ID, 결과, 특이사항), escalation 발생 시 사유 기재(Brief §6.4, §9).
- **`docs/package/`**: 이관 시점에 디렉토리 README에 "normative 원천, read-only" 선언을 넣는다(`DEVOPS-DOCSPKG-TRANSFER-TUW-001`). 이후 어떤 PACK도 이 디렉토리를 Files modify에 포함할 수 없다.
- **시크릿**: `.env`는 전부 `.gitignore`. 각 앱은 `.env.example`(키 + dev 기본값, 비밀 placeholder)을 커밋한다. 환경변수 정의는 `10_Architecture_Tech_Stack.md` §11이 규범.
- **생성물**: `dist/`, `.next/`, `.turbo/`, `coverage/`, `__pycache__/`, MinIO/PG 볼륨 — 커밋 금지(`.gitignore`).
