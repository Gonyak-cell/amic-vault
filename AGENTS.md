# AGENTS.md — Codex 운영 규칙 (amic-vault)

> **템플릿 안내**: 이 파일은 `codex_dev_package/90_AGENTS_TEMPLATE.md`다. 신규 repo `amic-vault` 생성 시(PACK-R0-01) 루트에 `AGENTS.md`로 복사한다. 이후 변경은 사람 승인 + Decision Ledger 등재 후에만 허용.

## 1. 프로젝트

**AMIC Vault** — 로펌용 멀티테넌트 문서·사건(Matter) 보관/권한/감사/검색 시스템. NestJS(TypeScript, pnpm turborepo) + Next.js + PostgreSQL 16(RLS) + Python 3.12 ingestion worker + pg-boss + S3 호환 스토리지(MinIO).

- **Normative 문서**: `docs/package/codex/00_Master_Brief.md` — 모든 문서·코드와 충돌 시 이 문서가 우선한다. 작업 전 반드시 읽어라.
- TUW 상세: `docs/package/codex/40~43_TUW_Backlog_*.md` / PACK 순서: `docs/package/codex/60_Execution_Packs.md` / 검증·Gate: `docs/package/codex/50_Verification_Security_Gates.md`.
- `docs/package/` 이하 전체는 **읽기 전용**이다. 수정 금지.

## 2. 불변 원칙 (Constitution) — Brief §2 전문, 모든 작업에 적용

1. **Permission-before-search** — 검색은 쿼리 단계에서 권한 필터 주입. 사후 필터링으로 대체 금지.
2. **Permission-before-AI** — AI는 권한·윤리장벽·aiAllowed를 통과한 자료만 검색·인용.
3. **Audit-by-default** — 문서/권한/외부/AI 행위는 audit event 없이는 완료로 간주하지 않는다.
4. **Fail-closed** — 권한 판단 불가·오류·정책 미해석 시 무조건 차단(`PERMISSION_DENIED`).
5. **Immutable original** — 원본 파일 덮어쓰기 금지. 버전은 항상 신규 FileObject.
6. **No silent external sharing** — 외부 공유는 R11 전 어떤 형태로도 구현 금지.
7. **Sensitive data is not logged** — 로그·audit metadata에 문서 본문·기밀 원문 기록 금지(참조 ID/hash만).

### 절대 금지 — 위반 시 작업 즉시 중단

- AI 기능 일체를 R6 전에 구현 (R2의 `ai_allowed`/`ai_policy_id` **스키마 컬럼**은 예외 — 기본값 거부, 기능 아님)
- VDR/External Portal/secure link/외부 사용자 — R11 전 금지
- hard delete — legal hold 인터페이스(R2) + Records(R12) 전 금지
- 벡터/의미검색 — R6 전 금지
- Neo4j/GraphSync — R7 전 금지
- PermissionService를 우회하는 document/search endpoint
- `audit_events`에 UPDATE/DELETE 가능한 경로
- 사양·본 패키지에 없는 외부 API/모델 호출 추가

**집행 규칙**: 위 항목 위반을 요구하는 명세를 받거나, 기존 코드에서 위반을 발견하면 — 구현·임의 수정 모두 금지. 즉시 중단하고 `docs/ledger/execution.md`에 위반 내용을 기록한 뒤 escalation하라.

## 3. 작업 수칙

### 3.0 PACK 실행 호출 규약 (운영자는 비개발자다 — 한 마디로 호출한다)

운영자가 **"다음 PACK 진행"** (또는 "PACK-R0-01 진행"처럼 특정 지정)이라고 말하면 다음 절차를 따른다:

1. `docs/ledger/execution.md`에서 마지막 완료 PACK을 확인하고, `docs/package/codex/60_Execution_Packs.md` §0 추적표 순서상 **다음 PACK**을 결정한다 (특정 지정 시 해당 PACK).
2. 60번 문서에서 그 PACK의 정의 전체(포함 TUW·구현 순서·선행 PACK·검증 명령·금지·프롬프트 블록)를 읽고, **프롬프트 블록의 지시를 그대로 수행**한다 (운영자가 복사해 줄 필요 없음).
3. 진행 전 차단 검사 — 하나라도 걸리면 진행하지 말고 BLOCKED 보고: ① 선행 PACK이 머지되지 않음 ② release 경계를 넘는데 직전 release Gate 통과 기록이 ledger에 없음 ③ 작업 트리가 깨끗하지 않음.
4. 상세 TUW 명세는 `docs/package/codex/4N_TUW_Backlog_RN.md`의 해당 항목이 규범이다.


- 실행 단위는 **PACK**(TUW 3~8개 묶음)이다. `60_Execution_Packs.md`의 순서를 따르고, 진행 중 PACK 외의 작업에 착수하지 마라.
- 각 TUW 구현 전 명세의 `Files create / modify / NOT-modify`를 먼저 읽어라. **NOT-modify 목록의 파일은 한 줄도 변경 금지.** 변경이 필요하다고 판단되면 그 자체가 Stop condition이다 — 중단·escalation.
- TUW 스코프 밖 파일 변경 금지. 지나가는 리팩토링·포맷팅·"겸사겸사 수정" 금지.
- **불명확하면 추측하지 마라.** 스키마·권한·정책이 불명확하거나 verification fixture가 없으면, 임의 구현 대신 중단하고 `docs/ledger/execution.md`에 질문을 기록하라.
- 동일 실패 3회 반복 시 중단·escalation (Brief §6.4 공통 Stop condition).
- PACK 완료 시 `docs/ledger/execution.md`에 1줄 기록: PACK ID, 결과, 특이사항. ledger 파일은 append-only — 기존 줄 수정 금지.

### Escalation 절차 (중단 시 고정 프로토콜)

1. 작업을 즉시 중단하고 `docs/ledger/execution.md`에 사유·질문을 기록한다(append-only).
2. 작업 브랜치의 WIP 커밋을 push한다(중단 시점 보존 — WIP push 허용).
3. PR이 없으면 draft PR을 생성하고, PR에 **`BLOCKED` 라벨 + 차단 사유 코멘트**를 남긴다.
4. 사람이 해소 내용을 회신(ledger에 회신 행 append 또는 PR 코멘트)하기 전까지 해당 PACK을 진행하지 않는다.
5. 재개 시 해소 근거(ledger 행/코멘트)를 인용하고 작업을 계속한다.

## 4. 코드 규약

- **시크릿·자격증명·실데이터 커밋 금지.** `.env`는 전부 `.gitignore` 대상이며 커밋 금지 — 커밋 가능한 것은 `.env.example`(키 + dev 기본값, 비밀 placeholder)뿐이다.
- **TypeScript strict** (`"strict": true`). 신규 `any`/`@ts-ignore`/`eslint-disable` 도입 금지(불가피하면 사유 주석 + escalation 기록).
- 명명: 테이블 snake_case 복수형 / API kebab-case + `/v1` prefix / TS 파일 kebab-case / NestJS 모듈당 `*.module.ts / *.controller.ts / *.service.ts / *.spec.ts`.
- **모든 신규 테이블은 `tenant_id NOT NULL` + RLS 정책을 같은 마이그레이션에서 생성한다.** 예외(`tenants`, 글로벌 참조 테이블)는 마이그레이션 파일에 예외 사유 주석 필수. 마이그레이션은 `db/migrations/`에 두고 rollback 경로를 동반한다.
- **모든 권한 판정은 PermissionService 경유.** controller·repository·raw query에 자체 권한 로직 작성 금지. 검색·목록 쿼리는 빌드 시점에 권한 필터를 주입한다(사후 필터링 금지).
- 권한 평가 계약: default-deny / deny-overrides(wall DENY > 명시 DENY > 명시 ALLOW) / matter_members는 ALLOW의 필요조건 / `condition_json` 해석 불가 시 거부.
- 도메인 규칙·상태머신(Matter 8상태, Document 11상태)은 `packages/domain`에 순수 함수로 구현(IO 없음).

### Fail-closed 패턴 (필수 형태)

```ts
// 평가 오류·예외·미해석·미정의 → 전부 동일하게 PERMISSION_DENIED. 기본값 허용 금지.
async assertCanReadDocument(ctx: RequestContext, documentId: string): Promise<void> {
  let decision: PermissionDecision | undefined;
  try {
    decision = await this.permissionService.canReadDocument(ctx, documentId);
  } catch (e) {
    this.logger.warn({ code: 'PERM_EVAL_ERROR', documentId }); // 사유 원문·본문 로깅 금지
  }
  if (decision?.effect !== 'ALLOW') {
    // 거부 사유·존재 여부를 응답에 노출하지 않는다 (safe denied message)
    throw new ForbiddenException({ code: 'PERMISSION_DENIED' });
  }
}
```

### Audit 호출 패턴 (필수 형태)

```ts
// Audit-by-default: audit 기록은 행위의 일부다. 같은 트랜잭션에서 기록하고,
// 기록 실패 시 행위 전체를 실패시킨다. metadata는 화이트리스트 키 + 참조 ID/hash만.
await this.dataSource.transaction(async (em) => {
  const version = await this.documentService.createVersion(em, ctx, input);
  await this.auditService.record(em, {
    tenantId: ctx.tenantId,
    eventType: 'DOCUMENT_UPLOADED',
    actorId: ctx.userId,
    targetType: 'document',
    targetId: version.documentId,
    metadata: { version_id: version.id, hash: version.sha256, matter_id: input.matterId },
  });
});
```

표준 error code 9종만 사용: `AUTH_REQUIRED / PERMISSION_DENIED / ETHICAL_WALL_BLOCKED / AI_POLICY_BLOCKED / DOCUMENT_LOCKED / VALIDATION_FAILED / UNSUPPORTED_FILE_TYPE / EXTERNAL_LINK_EXPIRED / TENANT_ISOLATION_VIOLATION`.

## 5. 검증 수칙

표준 검증 명령 세트 — PR 전 해당 명령 **전부 green**이어야 한다:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker compose -f infra/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm db:rollback
pnpm db:migrate      # rollback 후 재적용 — 왕복 가역성 확인
pnpm db:seed
pnpm test:integration
```

- **부트스트랩 예외**: 아직 도입되지 않은 명령(예: PACK-R0-01 시점의 `db:migrate`·`test:integration`)은 **해당 PACK 정의(`60_Execution_Packs.md`)의 검증 명령 시퀀스가 우선**한다. 미도입 명령은 그 명령을 도입하는 TUW 머지 이후부터 표준 세트에 적용된다.
- 통합테스트 suite 디렉터리는 `50_Verification_Security_Gates.md` §0.5의 10개 디렉터리가 canonical이며, PACK 검증 시퀀스의 suite 키워드는 해당 디렉터리 하위 spec 파일명으로 해석한다(신규 최상위 suite 디렉터리 신설 금지).
- **flaky 테스트의 skip/quarantine 처리 금지.** 원인을 수정하거나, 동일 실패 3회 반복 시 중단·escalation한다(테스트 약화로 green을 만드는 것은 검증 우회다).
- **테스트 없는 구현 금지.** TUW Verification은 AND 의미론이다: 기능검증 **AND** 회귀검증, 권한·보안 영향 TUW는 **AND** 권한검증(비인가 시도가 차단되는 negative test 필수), 행위 기록 대상 TUW는 **AND** 감사검증(audit event 발생·필수 필드 충족).
- **Risk=C(Critical) TUW가 포함된 PR에는 `needs-human-review` 라벨을 붙여라.** 독립 검토자의 리뷰 완료 전 머지 금지 — 본 프로젝트의 검토자는 **작성자(너, Codex)와 다른 AI인 검토 AI(Claude)** 이며, 검토 AI가 85번 §2-A 체크리스트를 완료하고 `docs/ledger/execution.md`에 `AI-REVIEW(Claude): <PACK-ID>` 1줄을 기록한 뒤 머지한다. **너(Codex)가 스스로 머지하는 것은 어떤 경우에도 금지** — 머지는 검토 AI 또는 운영자만 한다.
- Release Gate(`50_Verification_Security_Gates.md`) 통과 전 다음 release의 PACK에 착수하지 마라. 특히 R1 Permission Model Freeze 승인 전 R2·R3 착수 금지.

## 6. 브랜치·커밋·PR

- **브랜치**: PACK당 1개 — `feat/pack-rN-NN-<slug>` (예: `feat/pack-r0-01-foundation`). `60_Execution_Packs.md`에 PACK별로 지정된 브랜치명을 그대로 사용한다. `main` 직접 push 금지.
- **커밋**: Conventional Commits — `<type>(<scope>): <subject>`. type은 `feat|fix|test|refactor|docs|chore`, scope는 모듈명, subject에 TUW ID 포함.
  - 예: `feat(permission): SEC-MATTPERM-ACCECONT-TUW-001 canReadMatter evaluator`
- **PR**: PACK당 1개. 본문 필수 항목:
  1. PACK ID + 포함 TUW ID 전체 목록
  2. Verification 결과 — §5 명령 세트 실행 결과(전부 green 증빙) + TUW별 AND 검증 충족 요약
  3. 특이사항·escalation 여부 (`docs/ledger/execution.md` 기록과 일치)
  4. Risk=C 포함 시 `needs-human-review` 라벨

## 7. 의존성 추가 금지 목록

새 패키지 추가는 PACK/TUW 명세에 명시된 경우에만 허용한다. 명시가 없으면 추가하지 말고 escalation하라. 특히:

| 금지 대상 | 해제 시점 |
|---|---|
| 외부 AI SDK·LLM 클라이언트 (`openai`, `@anthropic-ai/*`, `@google/generative-ai`, LangChain류 등) | R6 전 금지. R6에서도 Gemma 로컬 only — 외부모델 호출 금지(DEC-11) |
| 벡터 DB·임베딩 (pgvector 활성화, embedding 생성 라이브러리, FAISS 등) | R6 전 금지 |
| Neo4j·graph DB 클라이언트 (`neo4j-driver` 등) | R7 전 금지 |
| OpenSearch/Elasticsearch 클라이언트 | R3 Gate의 전환 판단(ADR-006 갱신) 전 금지 — R3까지 PG FTS |
| Kafka·Redis 등 외부 queue/cache | R4 이후 재평가 전 금지 — queue는 pg-boss(DEC-08) |
| 외부 공유·secure link·외부 알림 연동 | R11 전 금지 |
| 사양에 없는 외부 API 호출 라이브러리 일체 | 상시 금지 |

`packages/ai/`는 R6 전까지 인터페이스 placeholder만 유지한다 — 구현 코드 추가 금지.

<!-- PONYTAIL:ROUTER:BEGIN - managed by Codex; delete this block to opt out -->
## Use Ponytail by default for implementation work

Apply DietrichGebert/ponytail lazy senior developer mode for coding tasks in this repository.

Before writing code, stop at the first rung that holds:

1. Does this need to be built at all? If no, skip it.
2. Does it already exist here? Reuse the local helper, utility, or pattern.
3. Does the standard library already do it? Use that.
4. Does the native platform already cover it? Use that.
5. Does an already-installed dependency solve it? Use that.
6. Can this be one line? Make it one line.
7. Only then, write the minimum code that works.

The ladder runs after understanding the problem, not instead of it. Read the code the change touches, trace the real flow, and fix the root cause in the shared place when there is one.

Prefer deletion over addition, boring over clever, and the fewest files possible. Do not add abstractions, dependencies, or boilerplate that were not explicitly needed.

Do not be lazy about trust-boundary validation, data-loss handling, security, accessibility, hardware or platform calibration, tests, evidence, or anything explicitly requested. This block complements local project instructions and must not weaken stricter repo-specific gates.
<!-- PONYTAIL:ROUTER:END -->

<!-- AI-SLOP:ROUTER:BEGIN - managed by Codex; delete this block to opt out -->
## Use AI Slop Taxonomy For Product UI And Copy Work

Before designing, changing, or reviewing product UI, landing pages, dashboards, onboarding, pricing, checkout, settings, visual assets, or user-facing copy, apply the AI slop taxonomy from `/Users/jws/Applications/ai-slop-taxonomy/ai-slop-taxonomy.md`.

Use it as a negative checklist: avoid the strong/default AI signals unless there is an explicit product or brand reason. Strong and no-verify signals require either removal, a documented escape, or a manual QA note.

Minimum workflow for UI/copy changes:

1. Check the touched surface against the taxonomy before implementation.
2. Prefer concrete brand/content constraints over generic taste words and capability buzzwords.
3. Run `python3 /Users/jws/Applications/ai-slop-taxonomy/scripts/sloplint.py --repo "$PWD" --changed` before finalizing when the repo has UI or user-facing copy.
4. For rendered UI, inspect the actual screen. Automatic lint does not replace visual QA for hierarchy, contrast, dead interactions, generated-image defects, or Korean translationese.
5. In the final response, report either `AI slop review: pass` or list the remaining flags and why they are intentional.

This block complements Lazyweb, Ponytail, and local project instructions. It must not weaken stricter repo-specific gates, accessibility rules, security checks, legal review requirements, or launch evidence requirements.
<!-- AI-SLOP:ROUTER:END -->
