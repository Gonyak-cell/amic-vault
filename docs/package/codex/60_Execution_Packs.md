# 60. Execution Packs — Codex 실행 단위(PACK) 정의서

버전: 1.0 | 작성일: 2026-06-11 | 상태: **Normative-운영** — `00_Master_Brief.md`(이하 Brief)에 종속되며, 충돌 시 Brief가 우선한다.

독자: Codex(구현 에이전트), PM(진행 추적). 선행 문서: Brief §2(불변 원칙)·§6(TUW 표준)·§7(인벤토리)·§9(실행 모델), 40~43번(TUW 상세 명세), 50번(Gate 체크리스트), 90번(AGENTS 템플릿).

---

## 0. 문서 개요 및 정합성 주기

### 0.1 PACK 정의

- **PACK** = Codex가 한 브랜치·한 PR로 수행하는 실행 단위. TUW 3~8개, 예상 규모 0.5~3일 (Brief §9-1).
- PACK ID 체계: `PACK-R<release>-<순번 2자리>` (예: `PACK-R0-01`).
- 본 문서의 PACK 순서는 Brief §7의 의존성(Deps)을 위상정렬한 결과다. **선행 PACK이 전부 머지되기 전에 해당 PACK을 착수할 수 없다.**

### 0.2 총괄

| Release | PACK 수 | TUW 수 | 예상 규모(직렬 합계) |
|---|---|---|---|
| R0 Foundation | 5 | 35 | 약 12.5일 |
| R1 Matter Core + Permission + Audit | 7 | 52 | 약 19.5일 |
| R2 Document Vault Core | 8 | 59 | 약 22.0일 |
| R3 Permission-bound Search v1 | 5 | 28 | 약 10.5일 |
| **합계** | **25** | **174** | **약 64.5일** |

### 0.3 정합성 주기 (Normative)

1. **TUW 전수 기준**: Brief §7 표에 열거된 TUW ID **전수(174개 — R0 35 / R1 52 / R2 59 / R3 28, Brief §7 헤더 집계와 일치)**를 PACK에 1:1 배정했다(누락·중복 없음 — §8 검증표 참조). 기계가독 백로그(`data/backlog_r0_r3.csv·json`, 174행)와도 1:1이다.
2. **모듈 분할 주기**: 다음 2개 모듈은 PACK 크기 상한(8 TUW) 때문에 **순차 의존 경계에서** 연속 PACK으로 분할했다. 분할 지점 외 의존 역전은 없다.
   - `DOC-DOCUUPLO-UPLOAPI-TUW-001~003` → PACK-R2-01 / `004~008` → PACK-R2-02
   - `DOC-DOCUINTE-HASHDUPL-TUW-001~003` → PACK-R2-02 / `004~005` → PACK-R2-03
3. **검증 suite 명명**: `pnpm test:integration -- <suite>`의 `<suite>`는 50번 §0.5의 **canonical 10개 디렉터리** 또는 그 하위 spec 파일명 키워드다(매핑 규칙은 50번 §0.5 — 키워드는 러너의 경로/파일명 필터로 동작하며, 10개 외 신규 suite 디렉터리 신설 금지). 무인자 `pnpm test:integration`(전체 회귀)은 모든 PACK의 마지막 검증 단계에서 항상 실행한다.
4. **워커(Python) 테스트**: `workers/ingestion`은 pnpm/turbo 그래프 밖이다(40번 CICD-TUW-002). pytest는 **CI의 별도 job**으로 실행하며 `pnpm test`에 포함되지 않는다. Python lint는 R0에서 no-op placeholder job만 둔다(40번 CICD-TUW-003).

---

## 1. PACK 실행 수칙 (Normative — 모든 PACK 공통)

1. **실행 사이클(고정)**: ① 브랜치 생성 → ② TUW를 명시된 순서대로 구현 → ③ PACK 검증 명령 시퀀스 전부 green → ④ PR 생성 → ⑤ `docs/ledger/execution.md`에 1줄 기록 → ⑥ (사람 리뷰 필수 PACK) 승인 후 머지. 어떤 단계도 생략·순서 변경 금지.
2. **브랜치/PR**: PACK당 브랜치 1개·PR 1개. 브랜치명은 본 문서에 지정된 `feat/pack-rN-NN-<slug>` 형식 그대로 사용. PR 제목은 `[PACK-R0-01] <PACK 이름>` 형식, PR 본문에 포함 TUW 체크리스트와 검증 명령 실행 결과를 첨부한다.
3. **TUW 순서 준수**: 모듈 내 TUW는 별도 표기가 없으면 직전 번호에 순차 의존한다(Brief §7). PACK 내 교차 모듈 순서는 각 PACK의 "구현 순서"를 따른다.
4. **검증 AND 의미론(Brief §6.3)**: PACK 검증 시퀀스 green은 필요조건일 뿐이다. 각 TUW의 Verification 항목(기능 AND 회귀 AND 해당 시 권한(negative 포함) AND 감사)을 40~43번 명세 기준으로 전부 충족해야 완료다.
5. **Risk=C 리뷰 게이트**: Risk=C TUW를 포함한 PACK은 **사람(또는 상위 검토 에이전트) 리뷰 승인 전 머지 금지**. Codex 단독 머지 불가(Brief §6.3).
6. **Stop condition(Brief §6.4)**: 스키마·권한·정책 불명확 / verification fixture 부재 / Files NOT-modify 변경 필요 발견 / 동일 실패 3회 반복 → 작업 중단 후 `docs/ledger/execution.md`에 escalation 사유 기록.
7. **Gate 규칙**: Gate는 PACK이 아니라 release 단위 체크리스트(50번 문서)다. **Gate 통과 전 다음 release의 어떤 PACK도 착수 금지.** R1 내 특칙: PACK-R1-07의 Permission Model Freeze 문서가 **승인되기 전 R2·R3 착수 금지**(Brief C-1).
8. **병렬 실행**: "선행 PACK"이 전부 머지된 PACK만 착수 가능. §3 위상정렬에서 병렬 가능으로 표시된 조합 외 동시 진행 금지. 동시 진행은 최대 2 PACK을 권장(동일 파일 충돌 회피).
9. **Ledger 기록 형식**: `| YYYY-MM-DD | PACK-R0-01 | done(또는 stopped) | 특이사항 1줄 |` — `docs/ledger/execution.md`, append-only.
10. **불변 원칙·절대 금지의 전역 적용**: Brief §2의 불변 원칙 7개와 절대 금지 목록은 **모든 PACK에 무조건 적용**된다. 각 PACK 프롬프트의 "금지" 목록은 해당 PACK에서 특히 위반 위험이 큰 항목의 강조이며, 전체 목록을 대체하지 않는다.

---

## 2. PACK 진행 추적표

완료 시 체크. Gate 항목은 50번 문서 체크리스트 통과 + 승인 기록을 의미한다.

### R0 Foundation
- [ ] PACK-R0-01 — Repo·CI 부트스트랩·문서 이관 (8 TUW / 3.0일 / 리뷰 권장)
- [ ] PACK-R0-02 — DB 코어·감사 불변성 (7 TUW / 2.5일 / **리뷰 필수: C**)
- [ ] PACK-R0-03 — Tenant 격리·Fail-closed (7 TUW / 2.5일 / **리뷰 필수: C**)
- [ ] PACK-R0-04 — 인증·세션 (5 TUW / 2.0일 / 리뷰 권장)
- [ ] PACK-R0-05 — 관측성·웹 셸 (8 TUW / 2.5일 / 리뷰 선택)
- [ ] **R0 Gate (Foundation Completion)** — 통과 전 R1 착수 금지

### R1 Matter Core + Permission + Audit
- [ ] PACK-R1-01 — Audit Logger·Client 등록 (8 TUW / 2.5일 / 리뷰 권장)
- [ ] PACK-R1-02 — Matter 코어 (7 TUW / 3.0일 / 리뷰 권장)
- [ ] PACK-R1-03 — RBAC·Ethical Wall 스키마 (8 TUW / 3.0일 / **리뷰 필수: C**)
- [ ] PACK-R1-04 — Matter 팀·권한 감사 이벤트 (8 TUW / 3.0일 / 리뷰 권장: H)
- [ ] PACK-R1-05 — Matter 라이프사이클 상태머신 (5 TUW / 2.0일 / 리뷰 선택)
- [ ] PACK-R1-06 — Matter 권한 평가기 (8 TUW / 3.0일 / **리뷰 필수: C**)
- [ ] PACK-R1-07 — Party·권한 하네스·Permission Freeze (8 TUW / 3.0일 / **리뷰 필수: Gate 산출물**)
- [ ] **R1 Gate (Matter Core) + Permission Model Freeze 승인** — 승인 전 R2·R3 착수 금지

### R2 Document Vault Core
- [ ] PACK-R2-01 — Storage 어댑터·업로드 기본 (8 TUW / 3.0일 / 리뷰 권장)
- [ ] PACK-R2-02 — 업로드 검증·해시 (8 TUW / 2.5일 / 리뷰 권장: H)
- [ ] PACK-R2-03 — 원본 불변성·메타데이터 (8 TUW / 3.0일 / **리뷰 필수: C**)
- [ ] PACK-R2-04 — 버전 체계·Legal Hold 인터페이스 (8 TUW / 3.0일 / 리뷰 권장)
- [ ] PACK-R2-05 — 추출 워커(PDF/DOCX/HWPX) (8 TUW / 3.0일 / 리뷰 선택)
- [ ] PACK-R2-06 — 문서 라이프사이클·AI 정책 스키마 (7 TUW / 3.0일 / **리뷰 필수: C**)
- [ ] PACK-R2-07 — 문서 권한 UI·미리보기 (7 TUW / 2.5일 / **리뷰 필수: C**)
- [ ] PACK-R2-08 — 문서 감사 이벤트 완성 (5 TUW / 2.0일 / 리뷰 권장)
- [ ] **R2 Gate (Document Vault)** — 통과 전 R3 착수 금지

### R3 Permission-bound Search v1
- [ ] PACK-R3-01 — 검색 인덱스·평가셋 v0 (7 TUW / 2.5일 / 리뷰 권장)
- [ ] PACK-R3-02 — 메타데이터 필터(SearchFilterBuilder) (5 TUW / 1.5일 / 리뷰 선택)
- [ ] PACK-R3-03 — 전문검색 코어·한국어 평가 (7 TUW / 2.5일 / 리뷰 권장)
- [ ] PACK-R3-04 — 권한 필터 주입 (6 TUW / 3.0일 / **리뷰 필수: C**)
- [ ] PACK-R3-05 — 검색 UI·공개 (3 TUW / 1.0일 / 리뷰 권장)
- [ ] **R3 Gate (Permission-bound Search)** — 통과 전 R4 착수 금지

---

## 3. 의존성 위상정렬 (실행 순서 개요)

```text
[R0]
R0-01 ──→ R0-02 ──┬──→ R0-03 ──────────────┐
                  └──→ R0-04 ──→ R0-05 ────┴──→ ◇ R0 Gate
  · R0-03 ∥ R0-04 병렬 가능 (둘 다 R0-02 이후)
  · R0-05는 R0-01(CI)·R0-04(login API) 완료 필요

[R1]
◇ R0 Gate ──→ R1-01 ──→ R1-02 ──→ R1-03 ──→ R1-04 ──→ R1-06 ──→ R1-07 ──→ ◇ R1 Gate(+Freeze 승인)
                              └──→ R1-05 (R1-03~R1-06과 병렬 가능, R1-07 전 완료 필수)

[R2]
◇ R1 Gate ──→ R2-01 ──→ R2-02 ──→ R2-03 ──→ R2-04 ──┬──→ R2-05 ──┐
                                                     └──→ R2-06 ──┴──→ R2-07 ──→ R2-08 ──→ ◇ R2 Gate
  · R2-05 ∥ R2-06 병렬 가능 (둘 다 R2-04 이후). R2-07은 R2-05·R2-06 모두 필요

[R3]
◇ R2 Gate ──→ R3-01 ──→ R3-02 ──→ R3-03 ──→ R3-04 ──→ R3-05 ──→ ◇ R3 Gate
  · 43번 depends_on 위상정렬: FILT-001(R3-02)이 TEXTQUER-001(R3-03)의 선행 — 메타필터가 전문검색보다 먼저
  · 검색 endpoint는 R3-04(권한 필터) 머지 전 deny-all scope provider로 봉인, UI·공개는 R3-05 (Permission-before-search)
```

---

## 4. R0 Foundation — PACK 정의 (5 PACK / 35 TUW)

### PACK-R0-01 — Repo·CI 부트스트랩·문서 이관

목적: `amic-vault` 신규 저장소의 모노레포 골격·CI·사양 패키지 이관을 완성하여 이후 전 PACK의 기반을 만든다.

| 항목 | 내용 |
|---|---|
| 포함 TUW (8) | CORE-REPOBUIL-CICD-TUW-001~005, DEVOPS-DOCSPKG-TRANSFER-TUW-001~002, DEVOPS-BACKLOG-VALIDATE-TUW-001 |
| 구현 순서 | CICD-001→002→003 → TRANSFER-001→002 → VALIDATE-001 → CICD-004→005 |
| 선행 PACK | 없음 (전체 시작점) |
| 예상 규모 | 3.0일 |
| 브랜치 | `feat/pack-r0-01-foundation` |
| Risk | C 없음 (repo 구조·CI는 전 PACK의 기반) |
| 사람 리뷰 | 권장 — repo 구조·CI 게이트 구성은 이후 변경 비용이 크므로 1회 확인 권장 |

검증 명령 시퀀스 (전부 green 필수):

```bash
pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
docker compose -f infra/docker-compose.dev.yml up -d
node tools/backlog/validate.mjs docs/package/codex/data/backlog_r0_r3.csv   # 특화: 백로그 DAG·release 규칙 검증(CI job 연결 확인)
```

Codex 투입 프롬프트:

```text
[PACK-R0-01 | 브랜치: feat/pack-r0-01-foundation]

부트스트랩 특칙: 본 PACK 시작 시점에는 신규 저장소가 비어 있다. 작업 디렉터리에 제공된 사양 패키지
(codex_dev_package/, vault_dev_package/)의 codex_dev_package/00_Master_Brief.md §2(불변 원칙)·§4(저장소 구조)·§10을 먼저 읽어라.
본 PACK에서 vault_dev_package/를 docs/package/로, codex_dev_package/를 docs/package/codex/로 복사(이관)하고
docs/package/codex/90_AGENTS_TEMPLATE.md를 repo 루트 AGENTS.md로 복사한다. 이후 모든 PACK은 repo 내 경로를 기준으로 한다.

다음 TUW를 순서대로 구현하라:
  1) CORE-REPOBUIL-CICD-TUW-001 — pnpm 모노레포(turborepo) skeleton (apps/api, apps/web, packages/*, workers/ingestion, db, infra, tools, tests, docs)
  2) CORE-REPOBUIL-CICD-TUW-002 — 패키지 분리(shared/domain/ai placeholder, 의존 방향 강제)
  3) CORE-REPOBUIL-CICD-TUW-003 — lint·test·build CI 파이프라인 (PR 필수 체크)
  4) DEVOPS-DOCSPKG-TRANSFER-TUW-001 — vault_dev_package→docs/package 이관 + normative 선언 (+ codex 패키지→docs/package/codex 복사, AGENTS.md 생성)
  5) DEVOPS-DOCSPKG-TRANSFER-TUW-002 — docs/adr/ADR-001~012 초안 작성 (docs/package/codex/01_Adopted_Decisions_ADR.md 기반)
  6) DEVOPS-BACKLOG-VALIDATE-TUW-001 — tools/backlog: CSV 스키마·DAG·release 규칙(AI<R6 금지 등) 검증 스크립트 + CI 연결
  7) CORE-REPOBUIL-CICD-TUW-004 — staging pipeline skeleton (배포 자동화 활성화 없이 골격만)
  8) CORE-REPOBUIL-CICD-TUW-005 — prod gate skeleton (수동 승인 게이트, 자동 배포 금지)
상세 명세는 docs/package/codex/40_TUW_Backlog_R0.md의 해당 항목을 따른다
(Files NOT-modify / Edge cases / Verification AND 목록 포함. 충돌 시 00_Master_Brief.md가 우선).

완료 기준 — 아래 명령이 순서대로 전부 green:
  pnpm install
  pnpm lint
  pnpm typecheck
  pnpm test          # TS 패키지 단위 테스트 (workers/ingestion pytest는 pnpm 그래프 밖 — CI 별도 job, §0.3-4)
  pnpm build
  docker compose -f infra/docker-compose.dev.yml up -d
  node tools/backlog/validate.mjs docs/package/codex/data/backlog_r0_r3.csv
추가: 신규 클론에서 위 시퀀스 재현 가능해야 한다(R0 Gate 항목).

금지:
  - docs/package/ 이관본(원천 사양)의 내용 수정 금지 — 이관은 복사이며, 보정은 docs/package/codex/가 담당
  - prod 자동 배포 활성화 금지 (skeleton·수동 게이트만)
  - 사양에 없는 외부 SaaS/API 연동 추가 금지
  - packages/ai에 placeholder 인터페이스 외 구현 추가 금지 (AI 기능은 R6 전 금지)

중단 조건(Brief §6.4): 스키마·권한·정책 불명확 / verification fixture 부재 / Files NOT-modify 변경 필요 / 동일 실패 3회
→ 즉시 중단하고 docs/ledger/execution.md에 escalation 사유를 기록하라.

완료 후: PR 생성(제목 "[PACK-R0-01] Repo·CI 부트스트랩·문서 이관"), docs/ledger/execution.md에 1줄 기록.
```

---

### PACK-R0-02 — DB 코어·감사 불변성

목적: 마이그레이션 체계·초기 스키마·tenant_id+RLS 규약·audit_events append-only를 확립한다.

| 항목 | 내용 |
|---|---|
| 포함 TUW (7) | CORE-DATACORE-MIGR-TUW-001~005, AUDIT-AUDIEVENCO-AUDILOGG-TUW-001, AUDIT-AUDIEVENCO-AUDILOGG-TUW-004 |
| 구현 순서 | MIGR-001→002→003→004→005 → AUDILOGG-001 → AUDILOGG-004 |
| 선행 PACK | PACK-R0-01 |
| 예상 규모 | 2.5일 |
| Risk | **C: AUDILOGG-004 (append-only constraint)** |
| 브랜치 | `feat/pack-r0-02-db-migration-audit` |
| 사람 리뷰 | **필수** (Risk=C 포함 — Codex 단독 머지 금지) |

검증 명령 시퀀스 (전부 green 필수):

```bash
pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
docker compose -f infra/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm db:rollback && pnpm db:migrate                      # 특화: 마이그레이션 왕복 검증 (MIGR-004)
pnpm test:integration -- audit-immutability              # 특화: UPDATE/DELETE가 DB 계층에서 실패(C)
pnpm test:integration
```

Codex 투입 프롬프트:

```text
[PACK-R0-02 | 브랜치: feat/pack-r0-02-db-migration-audit]

AGENTS.md와 docs/package/codex/00_Master_Brief.md §2(불변 원칙)·§4(명명규약)·§5(데이터 모델 v1.1)·§7(R0 인벤토리)을 읽고,
다음 TUW를 순서대로 구현하라:
  1) CORE-DATACORE-MIGR-TUW-001 — migration tool 설정 (node-pg-migrate, SQL 파일 모드로 확정 — 40번 MIGR-TUW-001·10번 §2)
  2) CORE-DATACORE-MIGR-TUW-002 — 초기 schema: tenants, users, audit_events (전 row-level 테이블 tenant_id NOT NULL + RLS, 예외는 명시 주석)
  3) CORE-DATACORE-MIGR-TUW-003 — seed loader (데모 tenant 2개, 비식별 가짜 데이터만)
  4) CORE-DATACORE-MIGR-TUW-004 — rollback 절차 (pnpm db:rollback)
  5) CORE-DATACORE-MIGR-TUW-005 — tenant_id+RLS convention 문서화·마이그레이션 템플릿
  6) AUDIT-AUDIEVENCO-AUDILOGG-TUW-001 — AuditEvent schema (metadata_json 화이트리스트 키 규약 포함)
  7) AUDIT-AUDIEVENCO-AUDILOGG-TUW-004 [Risk=C] — append-only constraint: UPDATE·DELETE REVOKE + trigger 차단
상세 명세는 docs/package/codex/40_TUW_Backlog_R0.md의 해당 항목을 따른다.

완료 기준 — 아래 명령이 순서대로 전부 green:
  pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
  docker compose -f infra/docker-compose.dev.yml up -d
  pnpm db:migrate
  pnpm db:rollback && pnpm db:migrate
  pnpm test:integration -- audit-immutability    # superuser가 아닌 모든 role에서 UPDATE/DELETE 시도가 DB 오류로 실패해야 함
  pnpm test:integration

금지:
  - audit_events에 UPDATE/DELETE가 가능한 어떤 경로(권한·함수·트리거 우회 포함)도 생성 금지
  - row-level 테이블에 tenant_id NULL 허용 금지 (글로벌 참조 테이블 예외는 마이그레이션 주석 필수)
  - seed에 실데이터·PII 사용 금지
  - hard delete 경로 생성 금지
  - 로그·audit metadata에 본문/기밀 원문 기록 금지 (참조 ID/hash만)

중단 조건(Brief §6.4): 스키마·권한·정책 불명확 / fixture 부재 / Files NOT-modify 변경 필요 / 동일 실패 3회
→ 즉시 중단하고 docs/ledger/execution.md에 escalation 사유를 기록하라.

완료 후: PR 생성(제목 "[PACK-R0-02] DB 코어·감사 불변성"), docs/ledger/execution.md에 1줄 기록.
본 PACK은 Risk=C(AUDIT-AUDIEVENCO-AUDILOGG-TUW-004) 포함 — 사람 리뷰 승인 전 머지 금지.
```

---

### PACK-R0-03 — Tenant 격리·Fail-closed

목적: tenant context·cross-tenant 차단·fail-closed guard라는 시스템의 보안 척추를 세운다.

| 항목 | 내용 |
|---|---|
| 포함 TUW (7) | CORE-TENACORE-TENACONT-TUW-001~005, CORE-SECFOUND-FAILCLOSE-TUW-001~002 |
| 구현 순서 | TENACONT-001→002→003 → FAILCLOSE-001→002 → TENACONT-004→005 |
| 선행 PACK | PACK-R0-02 (병렬 가능: PACK-R0-04) |
| 예상 규모 | 2.5일 |
| Risk | **C: TENACONT-004 (cross-tenant access test)** |
| 브랜치 | `feat/pack-r0-03-tenant-failclosed` |
| 사람 리뷰 | **필수** (Risk=C 포함) |

검증 명령 시퀀스 (전부 green 필수):

```bash
pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
docker compose -f infra/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm db:rollback && pnpm db:migrate
pnpm test:integration -- cross-tenant        # 특화: 전 endpoint cross-tenant 차단 negative(C)
pnpm test:integration -- fail-closed         # 특화: guard 강제 오류 주입 → PERMISSION_DENIED
pnpm test:integration
```

Codex 투입 프롬프트:

```text
[PACK-R0-03 | 브랜치: feat/pack-r0-03-tenant-failclosed]

AGENTS.md와 docs/package/codex/00_Master_Brief.md §2(불변 원칙 1·4)·§5·§7(R0 인벤토리)을 읽고,
다음 TUW를 순서대로 구현하라:
  1) CORE-TENACORE-TENACONT-TUW-001 — Tenant schema
  2) CORE-TENACORE-TENACONT-TUW-002 — tenant context middleware (모든 요청에 tenant 해석·주입)
  3) CORE-TENACORE-TENACONT-TUW-003 — workspace model
  4) CORE-SECFOUND-FAILCLOSE-TUW-001 — fail-closed guard 골격(판단 불가·오류 시 무조건 PERMISSION_DENIED) + 표준 error code 9종(docs/package/09_API_Service_Contract.md §4)
  5) CORE-SECFOUND-FAILCLOSE-TUW-002 — guard 강제 오류 주입 테스트 (오류 시 fail-open이 아님을 증명)
  6) CORE-TENACORE-TENACONT-TUW-004 [Risk=C] — cross-tenant access test: 존재하는 전 endpoint에 대해 타 tenant 자원 접근이 차단됨을 증명하는 integration suite
  7) CORE-TENACORE-TENACONT-TUW-005 — tenant settings API
상세 명세는 docs/package/codex/40_TUW_Backlog_R0.md의 해당 항목을 따른다.

완료 기준 — 아래 명령이 순서대로 전부 green:
  pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
  docker compose -f infra/docker-compose.dev.yml up -d
  pnpm db:migrate
  pnpm db:rollback && pnpm db:migrate
  pnpm test:integration -- cross-tenant
  pnpm test:integration -- fail-closed
  pnpm test:integration

금지:
  - cross-tenant 차단을 응답 사후 필터링으로 대체 금지 — 쿼리(RLS·tenant 조건) 단계 강제
  - fail-open 기본값 금지: 권한·tenant 판단 불가 시 무조건 PERMISSION_DENIED (불변 원칙 4)
  - 표준 error code 9종 외 임의 오류 코드 신설 금지
  - 오류 응답·로그에 타 tenant 자원의 존재를 암시하는 정보 노출 금지

중단 조건(Brief §6.4) 발생 시 즉시 중단하고 docs/ledger/execution.md에 escalation 사유를 기록하라.

완료 후: PR 생성(제목 "[PACK-R0-03] Tenant 격리·Fail-closed"), docs/ledger/execution.md에 1줄 기록.
본 PACK은 Risk=C(CORE-TENACORE-TENACONT-TUW-004) 포함 — 사람 리뷰 승인 전 머지 금지.
```

---

### PACK-R0-04 — 인증·세션

목적: 자체 세션 기반 인증(DEC-09)의 골격을 완성한다. TOTP·SSO는 범위 밖.

| 항목 | 내용 |
|---|---|
| 포함 TUW (5) | CORE-AUTHCORE-USERSESS-TUW-001~005 |
| 구현 순서 | 001→002→003→004→005 |
| 선행 PACK | PACK-R0-02 (병렬 가능: PACK-R0-03) |
| 예상 규모 | 2.0일 |
| Risk | C 없음 |
| 브랜치 | `feat/pack-r0-04-auth-session` |
| 사람 리뷰 | 권장 (인증 흐름은 보안 기반) |

검증 명령 시퀀스 (전부 green 필수):

```bash
pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
docker compose -f infra/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm db:rollback && pnpm db:migrate
pnpm test:integration -- auth-session        # 특화: 로그인 성공/실패, 비인가 접근 negative, 세션 만료
pnpm test:integration
```

Codex 투입 프롬프트:

```text
[PACK-R0-04 | 브랜치: feat/pack-r0-04-auth-session]

AGENTS.md와 docs/package/codex/00_Master_Brief.md §1(DEC-09)·§2·§7(R0 인벤토리)을 읽고,
다음 TUW를 순서대로 구현하라:
  1) CORE-AUTHCORE-USERSESS-TUW-001 — User schema (tenant_id NOT NULL + RLS)
  2) CORE-AUTHCORE-USERSESS-TUW-002 — login API (자체 세션, 실패 시 계정 존재 여부 비노출)
  3) CORE-AUTHCORE-USERSESS-TUW-003 — session middleware
  4) CORE-AUTHCORE-USERSESS-TUW-004 — MFA flag (boolean flag만 — TOTP 구현은 R1)
  5) CORE-AUTHCORE-USERSESS-TUW-005 — password reset skeleton
상세 명세는 docs/package/codex/40_TUW_Backlog_R0.md의 해당 항목을 따른다.

완료 기준 — 아래 명령이 순서대로 전부 green:
  pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
  docker compose -f infra/docker-compose.dev.yml up -d
  pnpm db:migrate
  pnpm db:rollback && pnpm db:migrate
  pnpm test:integration -- auth-session
  pnpm test:integration                       # cross-tenant·fail-closed 회귀 포함

금지:
  - SSO/SAML 구현 금지 (R13)
  - TOTP 등 MFA 실제 구현 금지 (R1 — 본 PACK은 flag 컬럼만)
  - 비밀번호·세션 토큰의 평문 저장·로깅 금지
  - 로그인 오류 응답에 계정 존재 여부 노출 금지
  - 권한(role) 평가 로직 선구현 금지 (R1 SEC-RBAC 소관)

중단 조건(Brief §6.4) 발생 시 즉시 중단하고 docs/ledger/execution.md에 escalation 사유를 기록하라.

완료 후: PR 생성(제목 "[PACK-R0-04] 인증·세션"), docs/ledger/execution.md에 1줄 기록.
```

---

### PACK-R0-05 — 관측성·웹 셸

목적: structured logging·health/metrics와 Next.js 앱 셸·로그인 화면을 완성하여 R0 Gate 진입 조건을 채운다.

| 항목 | 내용 |
|---|---|
| 포함 TUW (8) | CORE-OBSE-LOGGMETR-TUW-001~005, CORE-FESHELL-APPSHELL-TUW-001~003 |
| 구현 순서 | LOGGMETR-001→002→003→004→005 → APPSHELL-001→002→003 |
| 선행 PACK | PACK-R0-01(CI), PACK-R0-04(login API) |
| 예상 규모 | 2.5일 |
| Risk | C 없음 |
| 브랜치 | `feat/pack-r0-05-observability-shell` |
| 사람 리뷰 | 선택 |

검증 명령 시퀀스 (전부 green 필수):

```bash
pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
docker compose -f infra/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm test:integration -- observability       # 특화: health/metrics 응답, correlation id 전파, 민감정보 미로깅
pnpm test:integration -- auth-guard          # 특화: 비로그인 → 로그인 화면 redirect negative
pnpm test:integration
```

Codex 투입 프롬프트:

```text
[PACK-R0-05 | 브랜치: feat/pack-r0-05-observability-shell]

AGENTS.md와 docs/package/codex/00_Master_Brief.md §2(불변 원칙 7)·§4·§7(R0 인벤토리)을 읽고,
다음 TUW를 순서대로 구현하라:
  1) CORE-OBSE-LOGGMETR-TUW-001 — structured logger (JSON, 민감정보 필드 차단 목록 포함)
  2) CORE-OBSE-LOGGMETR-TUW-002 — correlation id (요청 전 구간 전파)
  3) CORE-OBSE-LOGGMETR-TUW-003 — health endpoint
  4) CORE-OBSE-LOGGMETR-TUW-004 — metrics endpoint
  5) CORE-OBSE-LOGGMETR-TUW-005 — error tracking hook (외부 SaaS 전송 없이 hook 인터페이스만)
  6) CORE-FESHELL-APPSHELL-TUW-001 — Next.js app shell + 라우팅
  7) CORE-FESHELL-APPSHELL-TUW-002 — 디자인시스템 base (Tailwind + shadcn/ui 설정)
  8) CORE-FESHELL-APPSHELL-TUW-003 — auth guard + 로그인 화면 (PACK-R0-04 login API 연동)
상세 명세는 docs/package/codex/40_TUW_Backlog_R0.md의 해당 항목을 따른다.

완료 기준 — 아래 명령이 순서대로 전부 green:
  pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
  docker compose -f infra/docker-compose.dev.yml up -d
  pnpm db:migrate
  pnpm test:integration -- observability
  pnpm test:integration -- auth-guard
  pnpm test:integration

금지:
  - 로그·메트릭·에러 트래킹에 문서 본문·기밀 원문·비밀번호·세션 토큰 기록 금지 (불변 원칙 7 — 참조 ID/hash만)
  - 사양에 없는 외부 APM/analytics SaaS 연동 금지 (hook 인터페이스만)
  - UI에 AI 관련 요소(검색·요약·챗 등) 일체 금지 (R6 전 금지)
  - health/metrics endpoint에 tenant·사용자 식별 데이터 노출 금지

중단 조건(Brief §6.4) 발생 시 즉시 중단하고 docs/ledger/execution.md에 escalation 사유를 기록하라.

완료 후: PR 생성(제목 "[PACK-R0-05] 관측성·웹 셸"), docs/ledger/execution.md에 1줄 기록.
본 PACK 머지 후 R0 Gate(50번 문서) 체크리스트를 수행한다. Gate 통과 전 R1 PACK 착수 금지.
```

---

## 5. R1 Matter Core + Permission + Audit — PACK 정의 (7 PACK / 52 TUW)

### PACK-R1-01 — Audit Logger·Client 등록

목적: audit logger 서비스(화이트리스트 normalizer 포함)와 Client 도메인을 완성한다. 이후 모든 행위 기록의 공통 기반.

| 항목 | 내용 |
|---|---|
| 포함 TUW (8) | AUDIT-AUDIEVENCO-AUDILOGG-TUW-002~003, AUDIT-AUDIEVENCO-AUDILOGG-TUW-005, MATTER-CLIEMANA-CLIEREGI-TUW-001~005 |
| 구현 순서 | AUDILOGG-002→003→005 → CLIEREGI-001→002→003→004→005 |
| 선행 PACK | R0 Gate 통과 (직접 의존: PACK-R0-02) |
| 예상 규모 | 2.5일 |
| Risk | C 없음 |
| 브랜치 | `feat/pack-r1-01-audit-logger-client` |
| 사람 리뷰 | 권장 (metadata 화이트리스트는 불변 원칙 7의 집행 지점) |

검증 명령 시퀀스 (전부 green 필수):

```bash
pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
docker compose -f infra/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm db:rollback && pnpm db:migrate
pnpm test:integration -- audit-logger        # 특화: 이벤트 발생·화이트리스트 외 키 거부·원문 미포함
pnpm test:integration -- client              # 특화: Client CRUD + 행위 audit + cross-tenant negative
pnpm test:integration
```

Codex 투입 프롬프트:

```text
[PACK-R1-01 | 브랜치: feat/pack-r1-01-audit-logger-client]

AGENTS.md와 docs/package/codex/00_Master_Brief.md §2(불변 원칙 3·7)·§5·§7(R1 인벤토리)을 읽고,
다음 TUW를 순서대로 구현하라:
  1) AUDIT-AUDIEVENCO-AUDILOGG-TUW-002 — audit logger service (모든 모듈이 사용할 공통 API)
  2) AUDIT-AUDIEVENCO-AUDILOGG-TUW-003 — metadata normalizer (화이트리스트 키만 허용, 값은 참조 ID/hash 수준)
  3) AUDIT-AUDIEVENCO-AUDILOGG-TUW-005 — retention label 연결 (DEC-12: 자동삭제 없음, 라벨만)
  4) MATTER-CLIEMANA-CLIEREGI-TUW-001 — Client schema (tenant_id NOT NULL + RLS, R0 convention 템플릿 사용)
  5) MATTER-CLIEMANA-CLIEREGI-TUW-002 — create API (+ audit)
  6) MATTER-CLIEMANA-CLIEREGI-TUW-003 — detail API
  7) MATTER-CLIEMANA-CLIEREGI-TUW-004 — list filtering
  8) MATTER-CLIEMANA-CLIEREGI-TUW-005 — metadata editor (+ 변경 audit)
상세 명세는 docs/package/codex/41_TUW_Backlog_R1.md의 해당 항목을 따른다.

완료 기준 — 아래 명령이 순서대로 전부 green:
  pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
  docker compose -f infra/docker-compose.dev.yml up -d
  pnpm db:migrate
  pnpm db:rollback && pnpm db:migrate
  pnpm test:integration -- audit-logger
  pnpm test:integration -- client
  pnpm test:integration

금지:
  - audit metadata_json에 화이트리스트 외 키·문서/기밀 원문 값 기록 금지 (참조 ID/hash만)
  - client 생성·수정이 audit event 없이 완료 처리되는 경로 금지 (Audit-by-default)
  - hard delete 금지
  - retention 자동삭제 로직 구현 금지 (DEC-12 — 필드/라벨만)

중단 조건(Brief §6.4) 발생 시 즉시 중단하고 docs/ledger/execution.md에 escalation 사유를 기록하라.

완료 후: PR 생성(제목 "[PACK-R1-01] Audit Logger·Client 등록"), docs/ledger/execution.md에 1줄 기록.
```

---

### PACK-R1-02 — Matter 코어

목적: Matter 등록·조회·목록의 도메인 코어를 완성한다. R1 후속 전 PACK의 전제.

| 항목 | 내용 |
|---|---|
| 포함 TUW (7) | MATTER-MATTMANA-MATTREGI-TUW-001~007 |
| 구현 순서 | 001→002→003→004→005→006→007 |
| 선행 PACK | PACK-R1-01 |
| 예상 규모 | 3.0일 |
| Risk | C 없음 |
| 브랜치 | `feat/pack-r1-02-matter-core` |
| 사람 리뷰 | 권장 (Matter schema는 이후 권한·문서·검색의 중심 엔터티) |

검증 명령 시퀀스 (전부 green 필수):

```bash
pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
docker compose -f infra/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm db:rollback && pnpm db:migrate
pnpm test:integration -- matter-core         # 특화: CRUD·pagination·validation + 행위 audit + cross-tenant negative
pnpm test:integration
```

Codex 투입 프롬프트:

```text
[PACK-R1-02 | 브랜치: feat/pack-r1-02-matter-core]

AGENTS.md와 docs/package/codex/00_Master_Brief.md §2·§5·§7(R1 인벤토리)을 읽고,
다음 TUW를 순서대로 구현하라:
  1) MATTER-MATTMANA-MATTREGI-TUW-001 — Matter schema (clients FK, tenant_id NOT NULL + RLS)
  2) MATTER-MATTMANA-MATTREGI-TUW-002 — create API (+ MATTER_CREATED audit)
  3) MATTER-MATTMANA-MATTREGI-TUW-003 — type taxonomy enum
  4) MATTER-MATTMANA-MATTREGI-TUW-004 — metadata validation
  5) MATTER-MATTMANA-MATTREGI-TUW-005 — detail API
  6) MATTER-MATTMANA-MATTREGI-TUW-006 — list pagination
  7) MATTER-MATTMANA-MATTREGI-TUW-007 — status badge UI
상세 명세는 docs/package/codex/41_TUW_Backlog_R1.md의 해당 항목을 따른다.

완료 기준 — 아래 명령이 순서대로 전부 green:
  pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
  docker compose -f infra/docker-compose.dev.yml up -d
  pnpm db:migrate
  pnpm db:rollback && pnpm db:migrate
  pnpm test:integration -- matter-core
  pnpm test:integration

금지:
  - 세션·tenant 검증을 우회하는 matter endpoint 금지 (정밀 권한 평가는 PACK-R1-06에서 강화되지만, 본 PACK에서도 비인가 노출 금지)
  - matters에 ai_policy_id 등 AI 관련 컬럼 추가 금지 (R2 AI-AIPOLI-SCHEMAONLY 소관)
  - matter 생성·수정이 audit 없이 완료되는 경로 금지
  - hard delete 금지

중단 조건(Brief §6.4) 발생 시 즉시 중단하고 docs/ledger/execution.md에 escalation 사유를 기록하라.

완료 후: PR 생성(제목 "[PACK-R1-02] Matter 코어"), docs/ledger/execution.md에 1줄 기록.
```

---

### PACK-R1-03 — RBAC·Ethical Wall 스키마

목적: role 7종·permission matrix(C)·EthicalWall schema/membership/create API(C-2 보정)를 확정한다. Freeze 대상의 핵심.

| 항목 | 내용 |
|---|---|
| 포함 TUW (8) | SEC-RBAC-ROLEMATR-TUW-001~005, SEC-ETHIWALL-WALLENFO-TUW-001~003 |
| 구현 순서 | ROLEMATR-001→002→003→004→005 → WALLENFO-001→002→003 |
| 선행 PACK | PACK-R1-01(audit), PACK-R1-02(matter) |
| 예상 규모 | 3.0일 |
| Risk | **C: ROLEMATR-002(permission matrix), WALLENFO-001(wall schema), WALLENFO-002(membership schema)** |
| 브랜치 | `feat/pack-r1-03-rbac-ethical-wall` |
| 사람 리뷰 | **필수** (Risk=C 3건 포함) |

검증 명령 시퀀스 (전부 green 필수):

```bash
pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
docker compose -f infra/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm db:rollback && pnpm db:migrate
pnpm test:integration -- rbac                # 특화: role 7종·matrix 정의·role 변경 audit·admin guard negative
pnpm test:integration -- ethical-wall        # 특화: wall/membership schema·create API·비인가 생성 negative
pnpm test:integration
```

Codex 투입 프롬프트:

```text
[PACK-R1-03 | 브랜치: feat/pack-r1-03-rbac-ethical-wall]

AGENTS.md와 docs/package/codex/00_Master_Brief.md §1(DEC-15)·§2·§3(C-2)·§5(데이터 모델 2·4항)·§7(R1 인벤토리) 및
docs/package/codex/21_Permission_Model.md를 읽고, 다음 TUW를 순서대로 구현하라:
  1) SEC-RBAC-ROLEMATR-TUW-001 — role enum 7종 (Firm Admin, Security Admin, Matter Owner, Matter Member, Limited Reviewer, Knowledge Manager, External User) + practice_group 속성
  2) SEC-RBAC-ROLEMATR-TUW-002 [Risk=C] — permission matrix 정의 (role × action, default-deny / deny-overrides / matter_members는 ALLOW의 필요조건)
  3) SEC-RBAC-ROLEMATR-TUW-003 — role assignment API
  4) SEC-RBAC-ROLEMATR-TUW-004 — role change audit
  5) SEC-RBAC-ROLEMATR-TUW-005 — admin route guard
  6) SEC-ETHIWALL-WALLENFO-TUW-001 [Risk=C] — EthicalWall schema
  7) SEC-ETHIWALL-WALLENFO-TUW-002 [Risk=C] — ethical_wall_memberships schema (subject_type[user|group], membership_type[insider|excluded])
  8) SEC-ETHIWALL-WALLENFO-TUW-003 — wall create API (+ audit)
상세 명세는 docs/package/codex/41_TUW_Backlog_R1.md의 해당 항목을 따른다.

완료 기준 — 아래 명령이 순서대로 전부 green:
  pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
  docker compose -f infra/docker-compose.dev.yml up -d
  pnpm db:migrate
  pnpm db:rollback && pnpm db:migrate
  pnpm test:integration -- rbac
  pnpm test:integration -- ethical-wall
  pnpm test:integration

금지:
  - wall의 search enforcement 구현 금지 (R3 SEARCH-PERMSEAR-PERMFILT-003 소관 — 본 PACK은 schema·membership·create API까지만)
  - break-glass·wall 고도화 금지 (R5)
  - ABAC 일반화 금지 (R5 — DEC-15: role 7종 + practice_group 속성 1개만)
  - default-allow 평가 경로 금지: default-deny / deny-overrides(wall DENY > 명시 DENY > 명시 ALLOW)에서 벗어나는 정의 금지
  - role·wall 변경이 audit 없이 완료되는 경로 금지

중단 조건(Brief §6.4) 발생 시 즉시 중단하고 docs/ledger/execution.md에 escalation 사유를 기록하라.

완료 후: PR 생성(제목 "[PACK-R1-03] RBAC·Ethical Wall 스키마"), docs/ledger/execution.md에 1줄 기록.
본 PACK은 Risk=C 3건 포함 — 사람 리뷰 승인 전 머지 금지.
```

---

### PACK-R1-04 — Matter 팀·권한 감사 이벤트

목적: Matter 멤버십 관리와 PERMISSION_CHANGED/ACCESS_DENIED 감사 이벤트를 완성한다.

| 항목 | 내용 |
|---|---|
| 포함 TUW (8) | MATTER-MATTTEAM-MEMBMANA-TUW-001~006, AUDIT-PERMAUDI-PERMEVEN-TUW-001~002 |
| 구현 순서 | MEMBMANA-001→002→003→004→005→006 → PERMEVEN-001→002 |
| 선행 PACK | PACK-R1-02, PACK-R1-03 (PERMEVEN→ROLEMATR-003), PACK-R1-01(AUDILOGG-002) |
| 예상 규모 | 3.0일 |
| Risk | H: MEMBMANA-006 (member change audit) |
| 브랜치 | `feat/pack-r1-04-members-perm-audit` |
| 사람 리뷰 | 권장 (Risk=H 포함, 권한 감사 이벤트의 필드 설계 확인) |

검증 명령 시퀀스 (전부 green 필수):

```bash
pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
docker compose -f infra/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm db:rollback && pnpm db:migrate
pnpm test:integration -- matter-team         # 특화: add/remove/role + member change audit(H) 누락 0
pnpm test:integration -- permission-audit    # 특화: PERMISSION_CHANGED before/after 참조ID 수준, ACCESS_DENIED 발생
pnpm test:integration
```

Codex 투입 프롬프트:

```text
[PACK-R1-04 | 브랜치: feat/pack-r1-04-members-perm-audit]

AGENTS.md와 docs/package/codex/00_Master_Brief.md §2(불변 원칙 3·7)·§5·§7(R1 인벤토리)을 읽고,
다음 TUW를 순서대로 구현하라:
  1) MATTER-MATTTEAM-MEMBMANA-TUW-001 — member schema (matter_members)
  2) MATTER-MATTTEAM-MEMBMANA-TUW-002 — add API
  3) MATTER-MATTTEAM-MEMBMANA-TUW-003 — remove API
  4) MATTER-MATTTEAM-MEMBMANA-TUW-004 — role assignment (matter 수준)
  5) MATTER-MATTTEAM-MEMBMANA-TUW-005 — team UI
  6) MATTER-MATTTEAM-MEMBMANA-TUW-006 [Risk=H] — member change audit (추가·제거·role 변경 100% 기록)
  7) AUDIT-PERMAUDI-PERMEVEN-TUW-001 — PERMISSION_CHANGED audit (before/after는 참조 ID 수준만)
  8) AUDIT-PERMAUDI-PERMEVEN-TUW-002 — ACCESS_DENIED audit
상세 명세는 docs/package/codex/41_TUW_Backlog_R1.md의 해당 항목을 따른다.

완료 기준 — 아래 명령이 순서대로 전부 green:
  pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
  docker compose -f infra/docker-compose.dev.yml up -d
  pnpm db:migrate
  pnpm db:rollback && pnpm db:migrate
  pnpm test:integration -- matter-team
  pnpm test:integration -- permission-audit
  pnpm test:integration

금지:
  - member 추가·제거·role 변경이 audit 없이 완료되는 경로 금지 (Audit-by-default)
  - audit metadata에 권한 값 원문·개인 식별 정보 직렬화 금지 (참조 ID/hash만)
  - ACCESS_DENIED 응답·기록에 자원 존재를 암시하는 정보 포함 금지
  - hard delete 금지 (member 제거는 기록이 남는 soft 방식)

중단 조건(Brief §6.4) 발생 시 즉시 중단하고 docs/ledger/execution.md에 escalation 사유를 기록하라.

완료 후: PR 생성(제목 "[PACK-R1-04] Matter 팀·권한 감사 이벤트"), docs/ledger/execution.md에 1줄 기록.
```

---

### PACK-R1-05 — Matter 라이프사이클 상태머신

목적: Matter 8상태 상태머신을 `packages/domain`에 순수 함수로 구현하고 종결/보관 행위를 연결한다.

| 항목 | 내용 |
|---|---|
| 포함 TUW (5) | MATTER-MATTLIFE-STATENGI-TUW-001~005 |
| 구현 순서 | 001→002→003→004→005 |
| 선행 PACK | PACK-R1-02 (병렬 가능: PACK-R1-03~R1-06 — 단 R1-07 전 완료 필수) |
| 예상 규모 | 2.0일 |
| Risk | C 없음 |
| 브랜치 | `feat/pack-r1-05-matter-lifecycle` |
| 사람 리뷰 | 선택 |

검증 명령 시퀀스 (전부 green 필수):

```bash
pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
docker compose -f infra/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm test:integration -- matter-lifecycle    # 특화: 8상태 전이표 전수, closed matter mutation 차단 negative, closing/archive audit
pnpm test:integration
```

Codex 투입 프롬프트:

```text
[PACK-R1-05 | 브랜치: feat/pack-r1-05-matter-lifecycle]

AGENTS.md와 docs/package/codex/00_Master_Brief.md §2·§4(packages/domain)·§5(8항: 상태머신)·§7(R1 인벤토리) 및
docs/package/07_Data_Model_and_Schema_Draft.md §4(Matter 8상태)를 읽고, 다음 TUW를 순서대로 구현하라:
  1) MATTER-MATTLIFE-STATENGI-TUW-001 — state enum (Matter 8상태, 원천 07번 §4 그대로)
  2) MATTER-MATTLIFE-STATENGI-TUW-002 — transition validation (packages/domain 순수 함수, IO 없음)
  3) MATTER-MATTLIFE-STATENGI-TUW-003 — closing action (+ audit)
  4) MATTER-MATTLIFE-STATENGI-TUW-004 — archive action (+ audit)
  5) MATTER-MATTLIFE-STATENGI-TUW-005 — closed matter mutation 차단
상세 명세는 docs/package/codex/41_TUW_Backlog_R1.md의 해당 항목을 따른다.

완료 기준 — 아래 명령이 순서대로 전부 green:
  pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
  docker compose -f infra/docker-compose.dev.yml up -d
  pnpm db:migrate
  pnpm test:integration -- matter-lifecycle
  pnpm test:integration

금지:
  - packages/domain에 IO(DB·HTTP·파일) 추가 금지 — 순수 TS 함수만
  - 상태 전이표(8상태) 외 임의 상태·전이 추가 금지
  - transition validation을 우회하는 상태 변경 경로 금지
  - Document 11상태 선구현 금지 (R2 DOC-DOCUMETA-METAEXTR-006 소관)

중단 조건(Brief §6.4) 발생 시 즉시 중단하고 docs/ledger/execution.md에 escalation 사유를 기록하라.

완료 후: PR 생성(제목 "[PACK-R1-05] Matter 라이프사이클 상태머신"), docs/ledger/execution.md에 1줄 기록.
```

---

### PACK-R1-06 — Matter 권한 평가기

목적: canReadMatter(C)·fail-closed wrapper(C) 등 PermissionService의 핵심 평가기를 완성한다. **이 시그니처들이 Freeze 대상이다.**

| 항목 | 내용 |
|---|---|
| 포함 TUW (8) | SEC-MATTPERM-ACCECONT-TUW-001~006, SEC-DOCUPERM-ACCECONT-TUW-001~002 |
| 구현 순서 | MATTPERM-001→002→003→004→005→006 → DOCUPERM-001→002 |
| 선행 PACK | PACK-R1-03(ROLEMATR-002), PACK-R1-04(MEMBMANA-001) |
| 예상 규모 | 3.0일 |
| Risk | **C: MATTPERM-001(canReadMatter), MATTPERM-006(fail-closed wrapper)** |
| 브랜치 | `feat/pack-r1-06-matter-permission` |
| 사람 리뷰 | **필수** (Risk=C 2건 포함) |

검증 명령 시퀀스 (전부 green 필수):

```bash
pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
docker compose -f infra/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm test:integration -- matter-permission   # 특화: canRead/canEdit/canUpload negative 포함, 비멤버 차단, 필터 주입(사후 필터링 아님)
pnpm test:integration -- fail-closed         # 특화: wrapper 오류 주입 → PERMISSION_DENIED
pnpm test:integration -- permission-audit    # 특화: 차단 시 ACCESS_DENIED audit 연동
pnpm test:integration
```

Codex 투입 프롬프트:

```text
[PACK-R1-06 | 브랜치: feat/pack-r1-06-matter-permission]

AGENTS.md와 docs/package/codex/00_Master_Brief.md §2(불변 원칙 1·4)·§5(4항: permissions 평가 계약)·§7(R1 인벤토리) 및
docs/package/codex/21_Permission_Model.md를 읽고, 다음 TUW를 순서대로 구현하라:
  1) SEC-MATTPERM-ACCECONT-TUW-001 [Risk=C] — canReadMatter (default-deny / deny-overrides / matter_members는 ALLOW의 필요조건 / condition_json 해석 불가 시 거부)
  2) SEC-MATTPERM-ACCECONT-TUW-002 — canEditMatter
  3) SEC-MATTPERM-ACCECONT-TUW-003 — canUploadToMatter
  4) SEC-MATTPERM-ACCECONT-TUW-004 — 비멤버 차단 (negative test 필수)
  5) SEC-MATTPERM-ACCECONT-TUW-005 — matter search permission filter (목록·검색 쿼리 단계 필터 주입)
  6) SEC-MATTPERM-ACCECONT-TUW-006 [Risk=C] — fail-closed wrapper (평가기 오류·미해석 → PERMISSION_DENIED)
  7) SEC-DOCUPERM-ACCECONT-TUW-001 — canReadDocument 인터페이스 시그니처만 (구현 R2)
  8) SEC-DOCUPERM-ACCECONT-TUW-002 — canDownloadDocument 인터페이스 시그니처만 (구현 R2)
상세 명세는 docs/package/codex/41_TUW_Backlog_R1.md의 해당 항목을 따른다.

완료 기준 — 아래 명령이 순서대로 전부 green:
  pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
  docker compose -f infra/docker-compose.dev.yml up -d
  pnpm db:migrate
  pnpm test:integration -- matter-permission
  pnpm test:integration -- fail-closed
  pnpm test:integration -- permission-audit
  pnpm test:integration

금지:
  - 권한을 응답 사후 필터링으로 적용하는 경로 금지 — 목록·검색은 쿼리 단계 필터 주입 (Permission-before-search)
  - PermissionService를 우회하는 matter/document endpoint 금지
  - canRead*/canEdit*/canUpload* 시그니처의 임의 확장·변경 금지 (PACK-R1-07에서 Freeze 예정)
  - SEC-DOCUPERM 001~002의 구현 금지 — 시그니처(인터페이스)만, 구현은 R2
  - 평가 불가 시 허용(fail-open) 금지 — 무조건 PERMISSION_DENIED

중단 조건(Brief §6.4) 발생 시 즉시 중단하고 docs/ledger/execution.md에 escalation 사유를 기록하라.

완료 후: PR 생성(제목 "[PACK-R1-06] Matter 권한 평가기"), docs/ledger/execution.md에 1줄 기록.
본 PACK은 Risk=C 2건 포함 — 사람 리뷰 승인 전 머지 금지.
```

---

### PACK-R1-07 — Party·권한 하네스·Permission Freeze

목적: Party 도메인을 완성하고, 권한 매트릭스 테스트 하네스를 CI gate로 연결한 뒤, Permission Model Freeze 문서(C-1)를 산출한다. **R1 Gate의 산출물 PACK.**

| 항목 | 내용 |
|---|---|
| 포함 TUW (8) | MATTER-PARTMANA-PARTREGI-TUW-001~005, SEC-PERMHARN-MATRIX-TUW-001~002, DEVOPS-FREEZE-PERMMODEL-TUW-001 |
| 구현 순서 | PARTREGI-001→002→003→004→005 → PERMHARN-001→002 → FREEZE-001 |
| 선행 PACK | PACK-R1-02, PACK-R1-03, PACK-R1-06 + **R1 전 PACK 머지(FREEZE는 전부에 의존)** — R1-05 포함 |
| 예상 규모 | 3.0일 |
| Risk | C 없음 — 단 Freeze 문서는 R1 Gate 산출물 |
| 브랜치 | `feat/pack-r1-07-party-harness-freeze` |
| 사람 리뷰 | **필수** — Freeze 문서는 사람 승인으로만 효력 발생. 승인 전 R2·R3 착수 금지 |

검증 명령 시퀀스 (전부 green 필수):

```bash
pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
docker compose -f infra/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm db:rollback && pnpm db:migrate
pnpm test:integration -- party               # 특화: party-matter link, restricted party marker negative
pnpm test:integration -- permission-matrix   # 특화: role 7 × action × wall 상태 전수 하네스 100% (CI gate 연결 확인)
pnpm test:integration
```

Codex 투입 프롬프트:

```text
[PACK-R1-07 | 브랜치: feat/pack-r1-07-party-harness-freeze]

AGENTS.md와 docs/package/codex/00_Master_Brief.md §2·§3(C-1)·§7(R1 인벤토리·R1 Gate) 및
docs/package/codex/21_Permission_Model.md를 읽고, 다음 TUW를 순서대로 구현하라:
  1) MATTER-PARTMANA-PARTREGI-TUW-001 — Party schema
  2) MATTER-PARTMANA-PARTREGI-TUW-002 — role taxonomy
  3) MATTER-PARTMANA-PARTREGI-TUW-003 — create API (+ audit)
  4) MATTER-PARTMANA-PARTREGI-TUW-004 — party-matter link
  5) MATTER-PARTMANA-PARTREGI-TUW-005 — restricted party marker
  6) SEC-PERMHARN-MATRIX-TUW-001 — 권한 매트릭스 테스트 하네스 (role 7종 × action × wall 상태 조합 전수, 허용/차단 expected 명시)
  7) SEC-PERMHARN-MATRIX-TUW-002 — CI gate 연결 (하네스 실패 시 머지 차단)
  8) DEVOPS-FREEZE-PERMMODEL-TUW-001 — Permission Model Freeze 문서: role matrix·canRead* 시그니처·wall schema·filter 주입 지점 동결,
     docs/ledger/decision.md에 등재 (승인란 포함 — 승인은 사람이 수행)
상세 명세는 docs/package/codex/41_TUW_Backlog_R1.md의 해당 항목을 따른다.

완료 기준 — 아래 명령이 순서대로 전부 green:
  pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
  docker compose -f infra/docker-compose.dev.yml up -d
  pnpm db:migrate
  pnpm db:rollback && pnpm db:migrate
  pnpm test:integration -- party
  pnpm test:integration -- permission-matrix   # 100% 통과 필수 (R1 Gate 조건)
  pnpm test:integration

금지:
  - 하네스의 expected 값을 구현에 맞춰 수정하는 행위(테스트 조작) 금지 — expected는 21_Permission_Model.md가 근거
  - Freeze 문서 승인 전 R2·R3 TUW 착수 금지 (C-1)
  - restricted party 정보의 로그·오류 메시지 노출 금지
  - Freeze 대상(시그니처·matrix·wall schema·주입 지점)의 본 PACK 내 임의 변경 금지 — 변경 필요 발견 시 중단 후 escalation

중단 조건(Brief §6.4) 발생 시 즉시 중단하고 docs/ledger/execution.md에 escalation 사유를 기록하라.

완료 후: PR 생성(제목 "[PACK-R1-07] Party·권한 하네스·Permission Freeze"), docs/ledger/execution.md에 1줄 기록.
본 PACK은 R1 Gate 산출물(Freeze) 포함 — 사람 리뷰·승인 전 머지 금지. 머지 후 R1 Gate(50번 문서)를 수행한다.
```

---

## 6. R2 Document Vault Core — PACK 정의 (8 PACK / 59 TUW)

> R2 전 PACK 공통 전제: **R1 Gate 통과 + Permission Model Freeze 승인**. 모듈 분할 주기(§0.3-2): UPLOAPI는 R2-01/R2-02에, HASHDUPL은 R2-02/R2-03에 순차 의존 경계로 분할.

### PACK-R2-01 — Storage 어댑터·업로드 기본

목적: S3/MinIO 어댑터(tenant prefix·암호화 hook)와 업로드 API 기본 흐름을 완성한다.

| 항목 | 내용 |
|---|---|
| 포함 TUW (8) | DOC-DOCUSTOR-OBJESTORAD-TUW-001~005, DOC-DOCUUPLO-UPLOAPI-TUW-001~003 |
| 구현 순서 | OBJESTORAD-001→002→003→004→005 → UPLOAPI-001→002→003 |
| 선행 PACK | R1 Gate + Freeze 승인 (직접 의존: PACK-R1-06의 MATTPERM-003) |
| 예상 규모 | 3.0일 |
| Risk | C 없음 (tenant prefix·암호화 hook은 보안 기반) |
| 브랜치 | `feat/pack-r2-01-storage-upload-base` |
| 사람 리뷰 | 권장 (storage 경로 설계는 이후 변경 비용이 큼) |

검증 명령 시퀀스 (전부 green 필수):

```bash
pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
docker compose -f infra/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm db:rollback && pnpm db:migrate
pnpm test:integration -- storage-tenant      # 특화: tenant prefix 강제, cross-tenant 객체·서명 URL 차단
pnpm test:integration -- upload              # 특화: 업로드 기본 흐름 + canUploadToMatter negative + 실패 rollback
pnpm test:integration
```

Codex 투입 프롬프트:

```text
[PACK-R2-01 | 브랜치: feat/pack-r2-01-storage-upload-base]

AGENTS.md와 docs/package/codex/00_Master_Brief.md §1(DEC-07)·§2(불변 원칙 5)·§7(R2 인벤토리)을 읽고,
다음 TUW를 순서대로 구현하라:
  1) DOC-DOCUSTOR-OBJESTORAD-TUW-001 — storage adapter (S3 호환, 개발은 MinIO)
  2) DOC-DOCUSTOR-OBJESTORAD-TUW-002 — path resolver (모든 객체 경로에 tenant prefix 필수)
  3) DOC-DOCUSTOR-OBJESTORAD-TUW-003 — file object record (DB 레코드와 객체의 정합)
  4) DOC-DOCUSTOR-OBJESTORAD-TUW-004 — 실패 rollback (업로드 실패 시 고아 객체·고아 레코드 0)
  5) DOC-DOCUSTOR-OBJESTORAD-TUW-005 — encryption hook interface (at-rest 암호화 연결점)
  6) DOC-DOCUUPLO-UPLOAPI-TUW-001 — upload API (canUploadToMatter[SEC-MATTPERM-ACCECONT-TUW-003] 통과 필수)
  7) DOC-DOCUUPLO-UPLOAPI-TUW-002 — multipart 업로드
  8) DOC-DOCUUPLO-UPLOAPI-TUW-003 — 확장자 validation
상세 명세는 docs/package/codex/42_TUW_Backlog_R2.md의 해당 항목을 따른다.

완료 기준 — 아래 명령이 순서대로 전부 green:
  pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
  docker compose -f infra/docker-compose.dev.yml up -d
  pnpm db:migrate
  pnpm db:rollback && pnpm db:migrate
  pnpm test:integration -- storage-tenant
  pnpm test:integration -- upload
  pnpm test:integration

금지:
  - tenant prefix 없는 storage 경로 생성 금지
  - 기존 객체 덮어쓰기 API/경로 금지 (Immutable original — 버전은 항상 신규 FileObject)
  - public bucket·무권한 서명 URL 발급 금지 (외부 공유는 R11 전 일체 금지)
  - PermissionService(canUploadToMatter)를 우회하는 업로드 경로 금지
  - 파일 본문·내용의 로그 기록 금지 (참조 ID/hash만)

중단 조건(Brief §6.4) 발생 시 즉시 중단하고 docs/ledger/execution.md에 escalation 사유를 기록하라.

완료 후: PR 생성(제목 "[PACK-R2-01] Storage 어댑터·업로드 기본"), docs/ledger/execution.md에 1줄 기록.
```

---

### PACK-R2-02 — 업로드 검증·해시

목적: 업로드 입력 검증(MIME/size)·권한 체크(H)·오류 표준화와 SHA-256 해시 파이프라인을 완성한다.

| 항목 | 내용 |
|---|---|
| 포함 TUW (8) | DOC-DOCUUPLO-UPLOAPI-TUW-004~008, DOC-DOCUINTE-HASHDUPL-TUW-001~003 |
| 구현 순서 | UPLOAPI-004→005→006→007→008 → HASHDUPL-001→002→003 |
| 선행 PACK | PACK-R2-01 |
| 예상 규모 | 2.5일 |
| Risk | H: UPLOAPI-006 (upload permission check) |
| 브랜치 | `feat/pack-r2-02-upload-validation-hash` |
| 사람 리뷰 | 권장 (Risk=H 포함) |

검증 명령 시퀀스 (전부 green 필수):

```bash
pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
docker compose -f infra/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm test:integration -- upload              # 특화: MIME/size negative 일괄, 권한 체크(H) negative, 표준 에러코드 일치
pnpm test:integration -- document-hash       # 특화: 동일 파일 동일 hash · 1바이트 상이 hash, 중복 후보 탐지
pnpm test:integration
```

Codex 투입 프롬프트:

```text
[PACK-R2-02 | 브랜치: feat/pack-r2-02-upload-validation-hash]

AGENTS.md와 docs/package/codex/00_Master_Brief.md §2·§7(R2 인벤토리) 및 docs/package/09_API_Service_Contract.md §4(표준 error code)를 읽고,
다음 TUW를 순서대로 구현하라:
  1) DOC-DOCUUPLO-UPLOAPI-TUW-004 — MIME validation (선언 MIME과 실제 콘텐츠 검사)
  2) DOC-DOCUUPLO-UPLOAPI-TUW-005 — size validation
  3) DOC-DOCUUPLO-UPLOAPI-TUW-006 [Risk=H] — upload permission check (비인가 시도 차단 negative test 필수)
  4) DOC-DOCUUPLO-UPLOAPI-TUW-007 — error 표준화 (09번 §4의 표준 코드만 사용)
  5) DOC-DOCUUPLO-UPLOAPI-TUW-008 — bulk job skeleton (권한 체크 동일 적용, 기능 골격만)
  6) DOC-DOCUINTE-HASHDUPL-TUW-001 — SHA-256 생성 (업로드 파이프라인 내)
  7) DOC-DOCUINTE-HASHDUPL-TUW-002 — version.hash 저장
  8) DOC-DOCUINTE-HASHDUPL-TUW-003 — 중복 후보 탐지 (hash 기반, 자동 병합 금지 — 후보 표시만)
상세 명세는 docs/package/codex/42_TUW_Backlog_R2.md의 해당 항목을 따른다.

완료 기준 — 아래 명령이 순서대로 전부 green:
  pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
  docker compose -f infra/docker-compose.dev.yml up -d
  pnpm db:migrate
  pnpm test:integration -- upload
  pnpm test:integration -- document-hash
  pnpm test:integration

금지:
  - 검증 실패 파일의 스토리지 잔존(고아 객체) 금지
  - bulk job이 단건 업로드의 권한 체크·검증을 우회하는 경로 금지
  - 중복 탐지 시 기존 원본 병합·삭제 금지 (Immutable original — 후보 표시만)
  - 파일 본문·내용의 로그 기록 금지
  - 표준 error code 외 임의 코드 신설 금지

중단 조건(Brief §6.4) 발생 시 즉시 중단하고 docs/ledger/execution.md에 escalation 사유를 기록하라.

완료 후: PR 생성(제목 "[PACK-R2-02] 업로드 검증·해시"), docs/ledger/execution.md에 1줄 기록.
```

---

### PACK-R2-03 — 원본 불변성·메타데이터

목적: immutable original policy(C)를 집행하고 문서 메타데이터 체계(11상태 enum 포함)를 완성한다.

| 항목 | 내용 |
|---|---|
| 포함 TUW (8) | DOC-DOCUINTE-HASHDUPL-TUW-004~005, DOC-DOCUMETA-METAEXTR-TUW-001~006 |
| 구현 순서 | HASHDUPL-004→005 → METAEXTR-001→002→003→004→005→006 |
| 선행 PACK | PACK-R2-02 |
| 예상 규모 | 3.0일 |
| Risk | **C: HASHDUPL-004 (immutable original policy)** / H: METAEXTR-005 (metadata change audit) |
| 브랜치 | `feat/pack-r2-03-immutable-metadata` |
| 사람 리뷰 | **필수** (Risk=C 포함) |

검증 명령 시퀀스 (전부 green 필수):

```bash
pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
docker compose -f infra/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm db:rollback && pnpm db:migrate
pnpm test:integration -- document-immutability   # 특화: 원본 덮어쓰기 시도 전 경로 차단(C), hash mismatch alert
pnpm test:integration -- document-metadata       # 특화: metadata CRUD + 변경 audit(H) + 11상태 enum
pnpm test:integration
```

Codex 투입 프롬프트:

```text
[PACK-R2-03 | 브랜치: feat/pack-r2-03-immutable-metadata]

AGENTS.md와 docs/package/codex/00_Master_Brief.md §2(불변 원칙 3·5)·§5·§7(R2 인벤토리)을 읽고,
다음 TUW를 순서대로 구현하라:
  1) DOC-DOCUINTE-HASHDUPL-TUW-004 [Risk=C] — immutable original policy: 원본 FileObject를 변경·덮어쓰기하는 모든 경로(API·storage·DB)를 차단하고 negative test로 증명
  2) DOC-DOCUINTE-HASHDUPL-TUW-005 — hash mismatch alert (저장 hash와 재계산 hash 불일치 시 경보+audit)
  3) DOC-DOCUMETA-METAEXTR-TUW-001 — metadata schema
  4) DOC-DOCUMETA-METAEXTR-TUW-002 — document type enum
  5) DOC-DOCUMETA-METAEXTR-TUW-003 — filename parser
  6) DOC-DOCUMETA-METAEXTR-TUW-004 — manual editor API
  7) DOC-DOCUMETA-METAEXTR-TUW-005 [Risk=H] — metadata change audit (변경 100% 기록, before/after 참조 수준)
  8) DOC-DOCUMETA-METAEXTR-TUW-006 — status enum (Document 11상태, 원천 07번 §4 그대로 — packages/domain)
상세 명세는 docs/package/codex/42_TUW_Backlog_R2.md의 해당 항목을 따른다.

완료 기준 — 아래 명령이 순서대로 전부 green:
  pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
  docker compose -f infra/docker-compose.dev.yml up -d
  pnpm db:migrate
  pnpm db:rollback && pnpm db:migrate
  pnpm test:integration -- document-immutability
  pnpm test:integration -- document-metadata
  pnpm test:integration

금지:
  - 원본 파일 덮어쓰기·수정 경로 일체 금지 (버전은 항상 신규 FileObject — 불변 원칙 5)
  - metadata 변경이 audit 없이 완료되는 경로 금지
  - 11상태 enum 외 임의 문서 상태 추가 금지
  - audit·로그에 문서 본문/추출 텍스트 기록 금지

중단 조건(Brief §6.4) 발생 시 즉시 중단하고 docs/ledger/execution.md에 escalation 사유를 기록하라.

완료 후: PR 생성(제목 "[PACK-R2-03] 원본 불변성·메타데이터"), docs/ledger/execution.md에 1줄 기록.
본 PACK은 Risk=C(DOC-DOCUINTE-HASHDUPL-TUW-004) 포함 — 사람 리뷰 승인 전 머지 금지.
```

---

### PACK-R2-04 — 버전 체계·Legal Hold 인터페이스

목적: DocumentVersion 체계(family_id/version_no)와 legal hold 인터페이스 계약(C-3)을 완성한다.

| 항목 | 내용 |
|---|---|
| 포함 TUW (8) | DOC-DOCUVERS-VERSRESO-TUW-001~007, RECORD-HOLDIF-INTERFACE-TUW-001 |
| 구현 순서 | VERSRESO-001→002→003→004→005→006→007 → HOLDIF-001 |
| 선행 PACK | PACK-R2-02(HASHDUPL-002), PACK-R2-03(METAEXTR-001) |
| 예상 규모 | 3.0일 |
| Risk | C 없음 — 단 HOLDIF는 C-3 보정의 인터페이스 계약(삭제 차단 전제) |
| 브랜치 | `feat/pack-r2-04-versioning-legalhold` |
| 사람 리뷰 | 권장 (hold precondition은 R12까지 사용되는 계약) |

검증 명령 시퀀스 (전부 green 필수):

```bash
pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
docker compose -f infra/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm db:rollback && pnpm db:migrate
pnpm test:integration -- document-versioning   # 특화: family_id·version_no 규칙, 신규 버전=신규 FileObject, superseded 표시
pnpm test:integration -- legal-hold            # 특화: hold flag 설정 시 삭제 precondition 차단 negative
pnpm test:integration
```

Codex 투입 프롬프트:

```text
[PACK-R2-04 | 브랜치: feat/pack-r2-04-versioning-legalhold]

AGENTS.md와 docs/package/codex/00_Master_Brief.md §2(불변 원칙 5)·§3(C-3)·§5(6항: legal hold 인터페이스)·§7(R2 인벤토리)을 읽고,
다음 TUW를 순서대로 구현하라:
  1) DOC-DOCUVERS-VERSRESO-TUW-001 — DocumentVersion schema
  2) DOC-DOCUVERS-VERSRESO-TUW-002 — family_id 규칙
  3) DOC-DOCUVERS-VERSRESO-TUW-003 — version_no 계산
  4) DOC-DOCUVERS-VERSRESO-TUW-004 — 신규 버전 API (항상 신규 FileObject 생성, 기존 row·객체 불변)
  5) DOC-DOCUVERS-VERSRESO-TUW-005 — 버전 목록 API
  6) DOC-DOCUVERS-VERSRESO-TUW-006 — superseded 표시
  7) DOC-DOCUVERS-VERSRESO-TUW-007 — status filter
  8) RECORD-HOLDIF-INTERFACE-TUW-001 — legal hold 인터페이스 계약(C-3): documents.legal_hold + matters.legal_hold boolean,
     모든 삭제 경로에 hold precondition check (전체 LegalHold/disposal 테이블은 R12 — 여기서는 flag+check만)
상세 명세는 docs/package/codex/42_TUW_Backlog_R2.md의 해당 항목을 따른다.

완료 기준 — 아래 명령이 순서대로 전부 green:
  pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
  docker compose -f infra/docker-compose.dev.yml up -d
  pnpm db:migrate
  pnpm db:rollback && pnpm db:migrate
  pnpm test:integration -- document-versioning
  pnpm test:integration -- legal-hold
  pnpm test:integration

금지:
  - 버전 갱신이 기존 FileObject·기존 version row를 변경하는 경로 금지 (Immutable original)
  - LegalHold/disposal 전체 테이블 구현 금지 (R12 — flag + precondition check만)
  - hard delete 금지 — hold precondition은 soft delete 경로에도 적용
  - hold flag 해제·우회로 삭제를 허용하는 관리자 단축 경로 금지

중단 조건(Brief §6.4) 발생 시 즉시 중단하고 docs/ledger/execution.md에 escalation 사유를 기록하라.

완료 후: PR 생성(제목 "[PACK-R2-04] 버전 체계·Legal Hold 인터페이스"), docs/ledger/execution.md에 1줄 기록.
```

---

### PACK-R2-05 — 추출 워커 (PDF/DOCX/HWPX)

목적: pg-boss 기반 추출 잡 큐와 Python ingestion worker의 PDF/DOCX/HWPX 텍스트 추출을 완성한다(DEC-06·DEC-10).

| 항목 | 내용 |
|---|---|
| 포함 TUW (8) | DOC-OCRTEXTEXT-EXTRWORK-TUW-001~006, DOC-HWPX-EXTRACT-TUW-001~002 |
| 구현 순서 | EXTRWORK-001→002→003→004→005→006 → HWPX-001→002 |
| 선행 PACK | PACK-R2-04(VERSRESO-001) (병렬 가능: PACK-R2-06) |
| 예상 규모 | 3.0일 |
| Risk | C 없음 |
| 브랜치 | `feat/pack-r2-05-extraction-worker` |
| 사람 리뷰 | 선택 |

검증 명령 시퀀스 (전부 green 필수):

```bash
pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build   # workers/ingestion pytest는 CI 별도 job(§0.3-4) — pnpm test 미포함
docker compose -f infra/docker-compose.dev.yml up -d                     # worker 컨테이너 포함
pnpm db:migrate
pnpm test:integration -- extraction          # 특화: 잡 enqueue→처리→결과 저장, 실패 retry, HWPX fixture 5종
pnpm test:integration
```

Codex 투입 프롬프트:

```text
[PACK-R2-05 | 브랜치: feat/pack-r2-05-extraction-worker]

AGENTS.md와 docs/package/codex/00_Master_Brief.md §1(DEC-06·DEC-08·DEC-10)·§2·§4(workers/ingestion)·§7(R2 인벤토리)을 읽고,
다음 TUW를 순서대로 구현하라:
  1) DOC-OCRTEXTEXT-EXTRWORK-TUW-001 — extraction job queue (pg-boss, DEC-08)
  2) DOC-OCRTEXTEXT-EXTRWORK-TUW-002 — PDF extractor (workers/ingestion/parsers/pdf)
  3) DOC-OCRTEXTEXT-EXTRWORK-TUW-003 — DOCX extractor (workers/ingestion/parsers/docx)
  4) DOC-OCRTEXTEXT-EXTRWORK-TUW-004 — OCR pending status (OCR 필요 문서의 상태 처리 — 실제 OCR 엔진 연동은 명세 범위 내에서만)
  5) DOC-OCRTEXTEXT-EXTRWORK-TUW-005 — confidence 저장
  6) DOC-OCRTEXTEXT-EXTRWORK-TUW-006 — 실패 retry (재시도 한도·dead letter 처리)
  7) DOC-HWPX-EXTRACT-TUW-001 — HWPX(XML) 텍스트 추출 어댑터 (DEC-10: HWPX만)
  8) DOC-HWPX-EXTRACT-TUW-002 — HWPX fixture 검증 5종 (tests/fixtures의 비식별 샘플)
상세 명세는 docs/package/codex/42_TUW_Backlog_R2.md의 해당 항목을 따른다.

완료 기준 — 아래 명령이 순서대로 전부 green:
  pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
  docker compose -f infra/docker-compose.dev.yml up -d
  pnpm db:migrate
  pnpm test:integration -- extraction
  pnpm test:integration

금지:
  - HWP 5.0 바이너리 파싱 구현 금지 (R4~R6 별도 트랙 — 본 PACK은 HWPX XML만)
  - 외부 OCR/파싱 API 호출 금지 (사양에 없는 외부 API 금지)
  - 추출 텍스트 원문의 로그·audit 기록 금지 (참조 ID/hash·길이·confidence만)
  - chunking·임베딩·요약 등 AI 전처리 구현 금지 (R6 — workers/ingestion/chunking은 R6에서)
  - fixture에 실제 사건 문서 사용 금지 (비식별 샘플만)

중단 조건(Brief §6.4) 발생 시 즉시 중단하고 docs/ledger/execution.md에 escalation 사유를 기록하라.

완료 후: PR 생성(제목 "[PACK-R2-05] 추출 워커(PDF/DOCX/HWPX)"), docs/ledger/execution.md에 1줄 기록.
```

---

### PACK-R2-06 — 문서 라이프사이클·AI 정책 스키마

목적: soft delete/restore(C)·archived 차단(C)·hold 연동 등 문서 생명주기와, AI 정책 **스키마만**(기본 거부)을 완성한다.

| 항목 | 내용 |
|---|---|
| 포함 TUW (7) | DOC-DOCULIFE-LIFEMANA-TUW-001~006, AI-AIPOLI-SCHEMAONLY-TUW-001 |
| 구현 순서 | LIFEMANA-001→002→003→004→005→006 → AIPOLI-001 |
| 선행 PACK | PACK-R2-03, PACK-R2-04(HOLDIF-001) (병렬 가능: PACK-R2-05) |
| 예상 규모 | 3.0일 |
| Risk | **C: LIFEMANA-002 (restore), LIFEMANA-004 (archived mutation 차단)** + AIPOLI는 절대 금지 경계 항목 |
| 브랜치 | `feat/pack-r2-06-lifecycle-aipolicy` |
| 사람 리뷰 | **필수** (Risk=C 2건 + AI 스키마 경계 확인) |

검증 명령 시퀀스 (전부 green 필수):

```bash
pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
docker compose -f infra/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm db:rollback && pnpm db:migrate
pnpm test:integration -- document-lifecycle  # 특화: soft delete→restore 왕복(C), archived mutation 차단(C), hold 삭제 차단
pnpm test:integration -- document-audit      # 특화: download/view audit 발생
pnpm test:integration -- ai-schema-only      # 특화: ai_allowed 기본 false, 평가 로직 부재 증명
pnpm test:integration
```

Codex 투입 프롬프트:

```text
[PACK-R2-06 | 브랜치: feat/pack-r2-06-lifecycle-aipolicy]

AGENTS.md와 docs/package/codex/00_Master_Brief.md §2(불변 원칙·절대 금지)·§5(1·6항)·§7(R2 인벤토리)을 읽고,
다음 TUW를 순서대로 구현하라:
  1) DOC-DOCULIFE-LIFEMANA-TUW-001 — soft delete (hard delete 아님 — 상태 전환)
  2) DOC-DOCULIFE-LIFEMANA-TUW-002 [Risk=C] — restore (soft delete 복원, 원본·버전·메타데이터 무손실 증명)
  3) DOC-DOCULIFE-LIFEMANA-TUW-003 — legal-hold delete block (RECORD-HOLDIF-INTERFACE-TUW-001의 precondition 사용)
  4) DOC-DOCULIFE-LIFEMANA-TUW-004 [Risk=C] — archived mutation 차단 (보관 문서의 모든 변경 거부 negative test)
  5) DOC-DOCULIFE-LIFEMANA-TUW-005 — download audit
  6) DOC-DOCULIFE-LIFEMANA-TUW-006 — view audit
  7) AI-AIPOLI-SCHEMAONLY-TUW-001 — documents.ai_allowed(기본 false) + matters.ai_policy_id FK + ai_policies 테이블
     (external_model_allowed=false, default_effect='DENY') — **스키마만. 평가 로직·AI 기능 일체 금지**
상세 명세는 docs/package/codex/42_TUW_Backlog_R2.md의 해당 항목을 따른다.

완료 기준 — 아래 명령이 순서대로 전부 green:
  pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
  docker compose -f infra/docker-compose.dev.yml up -d
  pnpm db:migrate
  pnpm db:rollback && pnpm db:migrate
  pnpm test:integration -- document-lifecycle
  pnpm test:integration -- document-audit
  pnpm test:integration -- ai-schema-only      # ai_allowed 기본값 false + ai_policies 평가 코드가 존재하지 않음을 확인
  pnpm test:integration

금지:
  - hard delete 금지 (legal hold 인터페이스(R2) + Records(R12) 전 일체 금지)
  - AI 평가 로직·AI 기능 구현 금지 — AIPOLI는 스키마 컬럼·테이블만 (절대 금지 목록의 유일한 스키마 예외, 기본값 거부)
  - ai_allowed=true를 기본값·일괄 설정하는 코드/seed 금지
  - hold flag 무시 삭제 경로 금지
  - download/view가 audit 없이 완료되는 경로 금지

중단 조건(Brief §6.4) 발생 시 즉시 중단하고 docs/ledger/execution.md에 escalation 사유를 기록하라.

완료 후: PR 생성(제목 "[PACK-R2-06] 문서 라이프사이클·AI 정책 스키마"), docs/ledger/execution.md에 1줄 기록.
본 PACK은 Risk=C 2건 + AI 경계 항목 포함 — 사람 리뷰 승인 전 머지 금지.
```

---

### PACK-R2-07 — 문서 권한 UI·미리보기

목적: 문서 권한 정책(confidentiality·download reason·safe denied)과 권한 검사형 미리보기를 완성한다.

| 항목 | 내용 |
|---|---|
| 포함 TUW (7) | SEC-DOCUPERM-ACCECONT-TUW-003~006, DOC-PREVIEW-VIEWER-TUW-001~003 |
| 구현 순서 | DOCUPERM-003→004→005→006 → PREVIEW-001→002→003 |
| 선행 PACK | PACK-R2-06(LIFEMANA-006), PACK-R2-05(변환 워커 기반) — R1 DOCUPERM-001~002 시그니처의 구현화 포함 |
| 예상 규모 | 2.5일 |
| Risk | **C: DOCUPERM-003 (confidentiality policy — R1 시그니처의 구현화)** + H: PREVIEW-003 (DOCUMENT_VIEWED audit 연동) |
| 브랜치 | `feat/pack-r2-07-docperm-preview` |
| 사람 리뷰 | **필수** (Risk=C 1건 + denied message 정보 누설 검토) |

검증 명령 시퀀스 (전부 green 필수):

```bash
pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
docker compose -f infra/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm test:integration -- document-permission   # 특화: canReadDocument/canDownloadDocument 구현 + 비인가 negative + safe denied
pnpm test:integration -- preview               # 특화: 미리보기 권한 검사, DOCX→PDF 변환, VIEWED audit(H)
pnpm test:integration
```

Codex 투입 프롬프트:

```text
[PACK-R2-07 | 브랜치: feat/pack-r2-07-docperm-preview]

AGENTS.md와 docs/package/codex/00_Master_Brief.md §2(불변 원칙 1·2·4)·§7(R2 인벤토리) 및
docs/package/codex/21_Permission_Model.md를 읽고, 다음 TUW를 순서대로 구현하라
(전제: R1에서 동결된 canReadDocument/canDownloadDocument 시그니처[SEC-DOCUPERM-ACCECONT-TUW-001~002]를 구현화하되 시그니처 변경 금지):
  1) SEC-DOCUPERM-ACCECONT-TUW-003 [Risk=C] — confidentiality policy
  2) SEC-DOCUPERM-ACCECONT-TUW-004 — download reason 요구 (사유 입력 강제 + audit 연계)
  3) SEC-DOCUPERM-ACCECONT-TUW-005 — permission UI
  4) SEC-DOCUPERM-ACCECONT-TUW-006 — safe denied message (자원 존재·메타데이터 비노출 거부 응답)
  5) DOC-PREVIEW-VIEWER-TUW-001 — PDF preview (권한 검사 endpoint 경유만 — 직접 storage 접근 금지)
  6) DOC-PREVIEW-VIEWER-TUW-002 — DOCX→PDF 변환 worker
  7) DOC-PREVIEW-VIEWER-TUW-003 [Risk=H] — DOCUMENT_VIEWED audit 연동 (미리보기도 열람으로 기록)
상세 명세는 docs/package/codex/42_TUW_Backlog_R2.md의 해당 항목을 따른다.

완료 기준 — 아래 명령이 순서대로 전부 green:
  pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
  docker compose -f infra/docker-compose.dev.yml up -d
  pnpm db:migrate
  pnpm test:integration -- document-permission
  pnpm test:integration -- preview
  pnpm test:integration

금지:
  - PermissionService를 우회하는 preview/download endpoint 금지
  - 무권한 서명 URL 발급·storage 직접 접근 경로 금지
  - denied message에 문서 존재 여부·제목·메타데이터 누설 금지 (safe denied)
  - Freeze된 canRead*/canDownload* 시그니처 변경 금지 — 변경 필요 발견 시 중단 후 escalation
  - 미리보기 변환 결과물의 본문 로그 기록 금지

중단 조건(Brief §6.4) 발생 시 즉시 중단하고 docs/ledger/execution.md에 escalation 사유를 기록하라.

완료 후: PR 생성(제목 "[PACK-R2-07] 문서 권한 UI·미리보기"), docs/ledger/execution.md에 1줄 기록.
```

---

### PACK-R2-08 — 문서 감사 이벤트 완성

목적: DOCUMENT_* 감사 이벤트 5종을 표준화·계측 완성하고 audit query API를 제공한다. R2 Gate 직전의 감사 커버리지 마감 PACK.

| 항목 | 내용 |
|---|---|
| 포함 TUW (5) | AUDIT-DOCUAUDI-DOCUEVEN-TUW-001~005 |
| 구현 순서 | 001→002→003→004→005 |
| 선행 PACK | PACK-R2-07 (문서 행위 endpoint 전부 존재 시점) — 근거 dep: R1 AUDILOGG-002 |
| 예상 규모 | 2.0일 |
| Risk | C 없음 (단 R2 Gate의 "DOCUMENT_* audit 5종 누락 0" 조건 담당) |
| 브랜치 | `feat/pack-r2-08-document-audit` |
| 사람 리뷰 | 권장 (Gate 전 감사 커버리지 확인) |

검증 명령 시퀀스 (전부 green 필수):

```bash
pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
docker compose -f infra/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm test:integration -- document-audit      # 특화: UPLOADED/VIEWED/DOWNLOADED/DELETED 누락 0, query API 권한 범위
pnpm test:integration -- audit-immutability  # 특화: append-only 회귀
pnpm test:integration
```

Codex 투입 프롬프트:

```text
[PACK-R2-08 | 브랜치: feat/pack-r2-08-document-audit]

AGENTS.md와 docs/package/codex/00_Master_Brief.md §2(불변 원칙 3·7)·§7(R2 인벤토리·R2 Gate)을 읽고,
다음 TUW를 순서대로 구현하라 (기존 PACK에서 발생시킨 이벤트와의 스키마 정합·누락 0 검증 포함):
  1) AUDIT-DOCUAUDI-DOCUEVEN-TUW-001 — DOCUMENT_UPLOADED audit 표준화
  2) AUDIT-DOCUAUDI-DOCUEVEN-TUW-002 — DOCUMENT_VIEWED audit 표준화
  3) AUDIT-DOCUAUDI-DOCUEVEN-TUW-003 — DOCUMENT_DOWNLOADED audit 표준화
  4) AUDIT-DOCUAUDI-DOCUEVEN-TUW-004 — DOCUMENT_DELETED audit 표준화 (soft delete·restore 추적 포함)
  5) AUDIT-DOCUAUDI-DOCUEVEN-TUW-005 — document audit query API (요청자 권한 범위 내 조회만)
상세 명세는 docs/package/codex/42_TUW_Backlog_R2.md의 해당 항목을 따른다.

완료 기준 — 아래 명령이 순서대로 전부 green:
  pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
  docker compose -f infra/docker-compose.dev.yml up -d
  pnpm db:migrate
  pnpm test:integration -- document-audit      # 문서 행위 경로 전수에서 5종 이벤트 누락 0
  pnpm test:integration -- audit-immutability
  pnpm test:integration

금지:
  - audit query API가 권한 밖 audit·metadata 원문을 노출하는 경로 금지 (Permission-before-search 준용)
  - audit 이벤트의 수정·재기록·삭제 경로 금지 (append-only)
  - metadata_json에 화이트리스트 외 키·본문 기록 금지
  - audit query에 PermissionService 우회 금지

중단 조건(Brief §6.4) 발생 시 즉시 중단하고 docs/ledger/execution.md에 escalation 사유를 기록하라.

완료 후: PR 생성(제목 "[PACK-R2-08] 문서 감사 이벤트 완성"), docs/ledger/execution.md에 1줄 기록.
본 PACK 머지 후 R2 Gate(50번 문서)를 수행한다. Gate 통과 전 R3 PACK 착수 금지.
```

---

## 7. R3 Permission-bound Search v1 — PACK 정의 (5 PACK / 28 TUW)

> R3 전 PACK 공통 전제: **R2 Gate 통과**. R3의 핵심 원칙: **Permission-before-search — 검색은 쿼리 단계에서 권한 필터 주입, 사후 필터링 발견 시 R3 Gate 불통과.** 검색 endpoint·UI는 PACK-R3-04(권한 필터) 머지 전 공개 금지 — 그 전까지 검색 API는 `SearchPermissionScopeProvider` 기본 구현(**deny-all**)에 의해 모든 호출이 `PERMISSION_DENIED`다(43번 TEXTQUER-TUW-001이 canonical).
> PACK 순서는 43번 depends_on 위상정렬을 따른다: SEARCH-METASEAR-FILT(FILT-001이 TEXTQUER-001의 선행)가 SEARCH-FULLSEAR보다 먼저 온다.

### PACK-R3-01 — 검색 인덱스·평가셋 v0

목적: PG FTS(tsvector) 인덱스 파이프라인과 평가셋 v0(DEC-16, AI 기능 아님 — 데이터 준비)를 구축한다.

| 항목 | 내용 |
|---|---|
| 포함 TUW (7) | SEARCH-SEARINDE-INDE-TUW-001~005, DEVOPS-EVALSET-V0-TUW-001~002 |
| 구현 순서 | INDE-001→002→003→004→005 → EVALSET-001→002 |
| 선행 PACK | R2 Gate (직접 의존: PACK-R2-05의 EXTRWORK-002) |
| 예상 규모 | 2.5일 |
| Risk | C 없음 (EVALSET 비식별화 절차는 민감) |
| 브랜치 | `feat/pack-r3-01-index-evalset` |
| 사람 리뷰 | 권장 — EVALSET-001 비식별화 규칙 문서는 보안 담당 확인 후 적재 진행 권장 |

검증 명령 시퀀스 (전부 green 필수):

```bash
pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
docker compose -f infra/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm db:rollback && pnpm db:migrate
pnpm test:integration -- search-index        # 특화: 인덱싱 잡, 메타데이터 변경 갱신, retry, 인덱스 행 tenant 격리
pnpm test:integration -- evalset             # 특화: evaluation_cases 적재 + 식별정보 부재 검사
pnpm test:integration
```

Codex 투입 프롬프트:

```text
[PACK-R3-01 | 브랜치: feat/pack-r3-01-index-evalset]

AGENTS.md와 docs/package/codex/00_Master_Brief.md §1(DEC-05·DEC-16)·§2·§7(R3 인벤토리)을 읽고,
다음 TUW를 순서대로 구현하라:
  1) SEARCH-SEARINDE-INDE-TUW-001 — index schema (PostgreSQL FTS, tsvector — 인덱스 행에도 tenant_id NOT NULL + RLS)
  2) SEARCH-SEARINDE-INDE-TUW-002 — indexing job enqueue (추출 완료 문서 → 인덱싱, pg-boss)
  3) SEARCH-SEARINDE-INDE-TUW-003 — metadata 변경 시 인덱스 갱신
  4) SEARCH-SEARINDE-INDE-TUW-004 — reindex manager
  5) SEARCH-SEARINDE-INDE-TUW-005 — 실패 retry
  6) DEVOPS-EVALSET-V0-TUW-001 — 평가셋 v0 수집 절차 문서 (종결 Matter 비식별화 계약서 20~50건, 비식별화 규칙 명문화)
  7) DEVOPS-EVALSET-V0-TUW-002 — evaluation_cases 테이블 + 적재 스크립트 (AI 기능 아님 — 데이터 준비)
상세 명세는 docs/package/codex/43_TUW_Backlog_R3.md의 해당 항목을 따른다.

완료 기준 — 아래 명령이 순서대로 전부 green:
  pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
  docker compose -f infra/docker-compose.dev.yml up -d
  pnpm db:migrate
  pnpm db:rollback && pnpm db:migrate
  pnpm test:integration -- search-index
  pnpm test:integration -- evalset
  pnpm test:integration

금지:
  - 벡터·임베딩 컬럼/인덱스 생성 금지 (R6 — embeddings는 예약 스키마 문서화만)
  - OpenSearch 등 외부 검색엔진 도입 금지 (R3는 PG FTS, 전환 판단은 PACK-R3-03의 평가 보고서)
  - evaluation_cases에 식별정보(실명·주민번호·사건번호 원문 등) 적재 금지 — 적재 스크립트에 검사 로직 포함
  - 검색 질의 endpoint 구현 금지 (PACK-R3-03 소관)
  - 인덱스에 권한 메타와 무관한 전 tenant 통합 저장 금지 (tenant 격리 유지)

중단 조건(Brief §6.4) 발생 시 즉시 중단하고 docs/ledger/execution.md에 escalation 사유를 기록하라.

완료 후: PR 생성(제목 "[PACK-R3-01] 검색 인덱스·평가셋 v0"), docs/ledger/execution.md에 1줄 기록.
```

---

### PACK-R3-02 — 메타데이터 필터 (SearchFilterBuilder)

목적: 메타데이터 필터 5종(SearchFilterBuilder)을 구현한다. 검색 endpoint(PACK-R3-03)·권한 필터(PACK-R3-04)보다 먼저 완성되는 쿼리 빌더 구성요소다 — TEXTQUER-001이 FILT-001에 의존하므로 본 PACK이 전문검색보다 선행한다(43번 depends_on 위상정렬).

| 항목 | 내용 |
|---|---|
| 포함 TUW (5) | SEARCH-METASEAR-FILT-TUW-001~005 |
| 구현 순서 | FILT-001→002→003→004→005 |
| 선행 PACK | PACK-R3-01(FILT-001←INDE-001) + R2 Gate(FILT-003←METAEXTR-002, FILT-005←VERSRESO-006) |
| 예상 규모 | 1.5일 |
| Risk | C 없음 — 단 필터 파라미터의 권한 우회(IDOR) 방지 설계 필수(end-to-end 검증 완성은 R3-04·R3-05 회귀) |
| 브랜치 | `feat/pack-r3-02-metadata-filter` |
| 사람 리뷰 | 선택 |

검증 명령 시퀀스 (전부 green 필수):

```bash
pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
docker compose -f infra/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm test:integration -- search-filter       # 특화: 필터 5종 조합 — 쿼리 빌더 수준 검증(검색 endpoint는 PACK-R3-03 소관)
pnpm test:integration
```

Codex 투입 프롬프트:

```text
[PACK-R3-02 | 브랜치: feat/pack-r3-02-metadata-filter]

AGENTS.md와 docs/package/codex/00_Master_Brief.md §2(불변 원칙 1·2)·§7(R3 인벤토리)을 읽고,
다음 TUW를 순서대로 구현하라:
  1) SEARCH-METASEAR-FILT-TUW-001 — matterId filter
  2) SEARCH-METASEAR-FILT-TUW-002 — clientId filter
  3) SEARCH-METASEAR-FILT-TUW-003 — documentType filter
  4) SEARCH-METASEAR-FILT-TUW-004 — date range filter
  5) SEARCH-METASEAR-FILT-TUW-005 — version status filter
상세 명세는 docs/package/codex/43_TUW_Backlog_R3.md의 해당 항목을 따른다.
설계 제약: 모든 필터는 SearchFilterBuilder 내부에서 권한 scope(현 단계 기본값: deny-all
SearchPermissionScopeProvider — PACK-R3-04에서 실권한 provider로 교체)와 **AND 결합**되는 구조로 작성한다.
필터 파라미터가 권한 범위를 확장·대체하는 경로가 구조적으로 불가능해야 한다.

완료 기준 — 아래 명령이 순서대로 전부 green:
  pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
  docker compose -f infra/docker-compose.dev.yml up -d
  pnpm db:migrate
  pnpm test:integration -- search-filter
  pnpm test:integration

금지:
  - 검색 질의 endpoint 구현 금지 (PACK-R3-03 소관)
  - 필터 파라미터(matterId·clientId 등)로 권한 밖 자원을 조회·추론하는 경로 금지 (IDOR — negative test 필수)
  - 필터가 권한 scope를 우회·대체하는 구현 금지 (항상 AND 결합)
  - 벡터/의미검색·임베딩 구현 금지 (R6)

중단 조건(Brief §6.4) 발생 시 즉시 중단하고 docs/ledger/execution.md에 escalation 사유를 기록하라.

완료 후: PR 생성(제목 "[PACK-R3-02] 메타데이터 필터"), docs/ledger/execution.md에 1줄 기록.
```

---

### PACK-R3-03 — 전문검색 코어·한국어 평가

목적: full-text query·snippet·highlight·search audit를 구현(deny-all scope provider 뒤 비공개)하고 한국어 토큰화 평가·OpenSearch 전환 판단 보고서를 산출한다.

| 항목 | 내용 |
|---|---|
| 포함 TUW (7) | SEARCH-FULLSEAR-TEXTQUER-TUW-001~005, SEARCH-KOREAN-EVAL-TUW-001~002 |
| 구현 순서 | TEXTQUER-001→002→003→004→005 → KOREAN-001→002 |
| 선행 PACK | PACK-R3-01(INDE-002) + PACK-R3-02(TEXTQUER-001←FILT-001) |
| 예상 규모 | 2.5일 |
| Risk | C 없음 — 단 endpoint는 권한 필터(PACK-R3-04) 전 공개 금지: deny-all SearchPermissionScopeProvider 기본(43번 TEXTQUER-TUW-001 canonical) |
| 브랜치 | `feat/pack-r3-03-fulltext-korean` |
| 사람 리뷰 | 권장 — KOREAN-002의 ADR-006 갱신 보고서는 사람 승인 대상 |

검증 명령 시퀀스 (전부 green 필수):

```bash
pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
docker compose -f infra/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm test:integration -- search-core         # 특화: query/snippet/highlight, deleted·superseded 제외, deny-all scope 기본(전 호출 PERMISSION_DENIED)
pnpm test:integration -- search-audit        # 특화: 검색 행위 audit 100%
pnpm test:integration
```

Codex 투입 프롬프트:

```text
[PACK-R3-03 | 브랜치: feat/pack-r3-03-fulltext-korean]

AGENTS.md와 docs/package/codex/00_Master_Brief.md §1(DEC-05)·§2(불변 원칙 1·3·4)·§7(R3 인벤토리)을 읽고,
다음 TUW를 순서대로 구현하라:
  1) SEARCH-FULLSEAR-TEXTQUER-TUW-001 — full-text query API (POST /v1/search 단일 진입점)
     (중요: endpoint는 deny-all 기본의 SearchPermissionScopeProvider 뒤에 둔다 — 43번 TEXTQUER-TUW-001 canonical.
      실권한 provider[PACK-R3-04] 머지 전에는 모든 호출이 PERMISSION_DENIED여야 한다. feature flag로 대체 금지)
  2) SEARCH-FULLSEAR-TEXTQUER-TUW-002 — snippet 생성
  3) SEARCH-FULLSEAR-TEXTQUER-TUW-003 — highlighting
  4) SEARCH-FULLSEAR-TEXTQUER-TUW-004 — deleted 문서 결과 제외 (superseded 처리 포함)
  5) SEARCH-FULLSEAR-TEXTQUER-TUW-005 — search audit (질의 행위 기록 — 질의문 원문은 정책 범위 내 최소 기록)
  6) SEARCH-KOREAN-EVAL-TUW-001 — 한국어 토큰화 평가 (PG FTS 한계 측정, 법률용어 fixture 30건)
  7) SEARCH-KOREAN-EVAL-TUW-002 — OpenSearch 전환 판단 보고서 (docs/adr/ADR-006 갱신 — 결정은 R3 Gate에서 사람이 승인)
상세 명세는 docs/package/codex/43_TUW_Backlog_R3.md의 해당 항목을 따른다.

완료 기준 — 아래 명령이 순서대로 전부 green:
  pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
  docker compose -f infra/docker-compose.dev.yml up -d
  pnpm db:migrate
  pnpm test:integration -- search-core
  pnpm test:integration -- search-audit
  pnpm test:integration

금지:
  - deny-all SearchPermissionScopeProvider의 제거·완화·우회 금지 (실권한 provider 교체는 PACK-R3-04 소관)
  - 권한 필터 없는 검색 endpoint의 일반 공개·UI 연결 금지
  - 벡터/의미검색·임베딩 구현 금지 (R6)
  - OpenSearch 실제 도입 금지 (본 PACK은 평가·보고서만, ADR-006 갱신)
  - snippet/highlight에 deleted·superseded·권한 외 문서 데이터 포함 금지
  - 검색 audit 누락 금지, audit에 문서 본문 기록 금지

중단 조건(Brief §6.4) 발생 시 즉시 중단하고 docs/ledger/execution.md에 escalation 사유를 기록하라.

완료 후: PR 생성(제목 "[PACK-R3-03] 전문검색 코어·한국어 평가"), docs/ledger/execution.md에 1줄 기록.
```

---

### PACK-R3-04 — 권한 필터 주입

목적: matter/document/ethical wall 권한 필터를 검색 쿼리 단계에 주입(C×4)하고 deny-all scope provider를 실권한 provider로 교체하며, metadata leakage가 없음을 증명한다. **R3의 핵심 보안 PACK.**

| 항목 | 내용 |
|---|---|
| 포함 TUW (6) | SEARCH-PERMSEAR-PERMFILT-TUW-001~005, SEC-ETHIWALL-WALLENFO-TUW-005 |
| 구현 순서 | PERMFILT-001→002→003 → WALLENFO-005(003과 통합 검증) → PERMFILT-004→005 |
| 선행 PACK | PACK-R3-03 + R1 Freeze(MATTPERM-005, WALLENFO-002) |
| 예상 규모 | 3.0일 |
| Risk | **C: PERMFILT-001, 002, 003, 005 + WALLENFO-005 (5건)** |
| 브랜치 | `feat/pack-r3-04-permission-filter` |
| 사람 리뷰 | **필수** (Risk=C 5건 — R3 Gate의 성패 결정) |

검증 명령 시퀀스 (전부 green 필수):

```bash
pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
docker compose -f infra/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm test:integration -- search-permission   # 특화: 필터가 쿼리 단계 주입(생성 SQL 검증 포함), wall 양측 상호 격리
pnpm test:integration -- metadata-leakage    # 특화: title/snippet/metadata/카운트 어디에도 권한 외 문서 미노출(C)
pnpm test:integration -- permission-matrix   # 특화: R1 하네스 회귀 (검색 액션 추가분 포함)
pnpm test:integration
```

Codex 투입 프롬프트:

```text
[PACK-R3-04 | 브랜치: feat/pack-r3-04-permission-filter]

AGENTS.md와 docs/package/codex/00_Master_Brief.md §2(불변 원칙 1·4)·§7(R3 인벤토리·R3 Gate) 및
docs/package/codex/21_Permission_Model.md(Freeze된 filter 주입 지점)를 읽고, 다음 TUW를 순서대로 구현하라:
  1) SEARCH-PERMSEAR-PERMFILT-TUW-001 [Risk=C] — matter permission filter 주입 (검색 쿼리 생성 단계에서 canReadMatter 조건 결합 —
     deny-all SearchPermissionScopeProvider를 실권한 provider로 교체하는 시점)
  2) SEARCH-PERMSEAR-PERMFILT-TUW-002 [Risk=C] — document permission filter 주입 (canReadDocument 조건 결합)
  3) SEARCH-PERMSEAR-PERMFILT-TUW-003 [Risk=C] — ethical wall filter 주입 (excluded subject는 wall 대상 자료 전면 차단)
  4) SEC-ETHIWALL-WALLENFO-TUW-005 [Risk=C] — wall enforcement in search (PERMFILT-003과 통합 검증: wall 양측 상호 격리 증명)
  5) SEARCH-PERMSEAR-PERMFILT-TUW-004 — permission regression test (권한·멤버십·wall 변경 시나리오 회귀)
  6) SEARCH-PERMSEAR-PERMFILT-TUW-005 [Risk=C] — metadata leakage test (title/snippet/metadata/결과 수/페이징 어디에도
     권한 외 문서의 존재가 드러나지 않음을 증명하는 negative suite)
상세 명세는 docs/package/codex/43_TUW_Backlog_R3.md의 해당 항목을 따른다.

완료 기준 — 아래 명령이 순서대로 전부 green:
  pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
  docker compose -f infra/docker-compose.dev.yml up -d
  pnpm db:migrate
  pnpm test:integration -- search-permission
  pnpm test:integration -- metadata-leakage
  pnpm test:integration -- permission-matrix
  pnpm test:integration

금지:
  - **사후 필터링 절대 금지** — 결과 수신 후 권한으로 거르는 구현은 R3 Gate 불통과 사유. 필터는 쿼리 생성 단계에 주입
  - PermissionService를 우회하는 search endpoint·쿼리 경로 금지
  - 권한 판단 불가 시 결과 포함(fail-open) 금지 — 해당 행 제외(fail-closed)
  - Freeze된 filter 주입 지점·시그니처 변경 금지 — 변경 필요 발견 시 중단 후 escalation
  - leakage 테스트 expected의 완화·예외 추가 금지

중단 조건(Brief §6.4) 발생 시 즉시 중단하고 docs/ledger/execution.md에 escalation 사유를 기록하라.

완료 후: PR 생성(제목 "[PACK-R3-04] 권한 필터 주입"), docs/ledger/execution.md에 1줄 기록.
본 PACK은 Risk=C 5건 포함 — 사람 리뷰 승인 전 머지 금지.
```

---

### PACK-R3-05 — 검색 UI·공개

목적: 검색 UI(권한 내 자료만, AI 표시 없음)를 완성하고 검색 v1을 공개한다. 공개는 실권한 provider(PACK-R3-04) 머지 완료가 전제다.

| 항목 | 내용 |
|---|---|
| 포함 TUW (3) | SEARCH-UI-PAGE-TUW-001~003 |
| 구현 순서 | UI-PAGE-001→002→003 |
| 선행 PACK | PACK-R3-04(UI-001←PERMFILT-001 — 공개는 권한 필터 적용 후), PACK-R3-02(UI-002←FILT-005) |
| 예상 규모 | 1.0일 |
| Risk | C 없음 — 단 IDOR·leakage 회귀 필수 |
| 브랜치 | `feat/pack-r3-05-search-ui` |
| 사람 리뷰 | 권장 (UI 노출 범위·leakage 회귀 확인 후 R3 Gate) |

검증 명령 시퀀스 (전부 green 필수):

```bash
pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
docker compose -f infra/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm test:integration -- search-filter       # 특화: 필터 파라미터 권한 우회(IDOR) negative — endpoint 경유 end-to-end
pnpm test:integration -- search-permission   # 특화: 권한 필터 회귀 — UI 경로가 권한 필터를 우회하지 않음 증명
pnpm test:integration -- metadata-leakage    # 특화: leakage 회귀 (facet 카운트 포함)
pnpm test:integration
```

Codex 투입 프롬프트:

```text
[PACK-R3-05 | 브랜치: feat/pack-r3-05-search-ui]

AGENTS.md와 docs/package/codex/00_Master_Brief.md §2(불변 원칙 1·2)·§7(R3 인벤토리·R3 Gate)을 읽고,
다음 TUW를 순서대로 구현하라:
  1) SEARCH-UI-PAGE-TUW-001 — 검색 페이지 (검색 v1 공개는 본 PACK에서 — PACK-R3-04 실권한 provider 머지 완료 전제)
  2) SEARCH-UI-PAGE-TUW-002 — facet UI
  3) SEARCH-UI-PAGE-TUW-003 — result card (권한 내 자료만 표시, AI 관련 표시·기능 일체 없음)
상세 명세는 docs/package/codex/43_TUW_Backlog_R3.md의 해당 항목을 따른다.

완료 기준 — 아래 명령이 순서대로 전부 green:
  pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build
  docker compose -f infra/docker-compose.dev.yml up -d
  pnpm db:migrate
  pnpm test:integration -- search-filter
  pnpm test:integration -- search-permission
  pnpm test:integration -- metadata-leakage
  pnpm test:integration

금지:
  - 필터 파라미터(matterId·clientId 등)로 권한 밖 자원을 조회·추론하는 경로 금지 (IDOR — negative test 필수)
  - UI에 AI 관련 요소(요약·추천·시맨틱 검색 등) 일체 금지 (R6 전 금지)
  - facet 카운트로 권한 외 문서의 존재가 드러나는 집계 금지
  - 외부 공유·링크 생성 UI 금지 (R11 전 금지)
  - deny-all→실권한 provider 교체 이전 상태로의 회귀 금지

중단 조건(Brief §6.4) 발생 시 즉시 중단하고 docs/ledger/execution.md에 escalation 사유를 기록하라.

완료 후: PR 생성(제목 "[PACK-R3-05] 검색 UI·공개"), docs/ledger/execution.md에 1줄 기록.
본 PACK 머지 후 R3 Gate(50번 문서)를 수행한다. Gate 통과 전 R4 PACK 착수 금지.
```

---

## 8. TUW → PACK 매핑 전수 검증표 (누락·중복 0 증명)

Brief §7 표에 열거된 모든 TUW ID가 정확히 1회 배정되었음을 모듈 단위로 검증한다.

| Release | 모듈 (TUW 범위) | 개수 | 배정 PACK |
|---|---|---|---|
| R0 | CORE-REPOBUIL-CICD-TUW-001~005 | 5 | PACK-R0-01 |
| R0 | DEVOPS-DOCSPKG-TRANSFER-TUW-001~002 | 2 | PACK-R0-01 |
| R0 | DEVOPS-BACKLOG-VALIDATE-TUW-001 | 1 | PACK-R0-01 |
| R0 | CORE-DATACORE-MIGR-TUW-001~005 | 5 | PACK-R0-02 |
| R0 | AUDIT-AUDIEVENCO-AUDILOGG-TUW-001, 004 | 2 | PACK-R0-02 |
| R0 | CORE-TENACORE-TENACONT-TUW-001~005 | 5 | PACK-R0-03 |
| R0 | CORE-SECFOUND-FAILCLOSE-TUW-001~002 | 2 | PACK-R0-03 |
| R0 | CORE-AUTHCORE-USERSESS-TUW-001~005 | 5 | PACK-R0-04 |
| R0 | CORE-OBSE-LOGGMETR-TUW-001~005 | 5 | PACK-R0-05 |
| R0 | CORE-FESHELL-APPSHELL-TUW-001~003 | 3 | PACK-R0-05 |
| **R0 소계** | | **35** | 5 PACK |
| R1 | AUDIT-AUDIEVENCO-AUDILOGG-TUW-002~003, 005 | 3 | PACK-R1-01 |
| R1 | MATTER-CLIEMANA-CLIEREGI-TUW-001~005 | 5 | PACK-R1-01 |
| R1 | MATTER-MATTMANA-MATTREGI-TUW-001~007 | 7 | PACK-R1-02 |
| R1 | SEC-RBAC-ROLEMATR-TUW-001~005 | 5 | PACK-R1-03 |
| R1 | SEC-ETHIWALL-WALLENFO-TUW-001~003 | 3 | PACK-R1-03 |
| R1 | MATTER-MATTTEAM-MEMBMANA-TUW-001~006 | 6 | PACK-R1-04 |
| R1 | AUDIT-PERMAUDI-PERMEVEN-TUW-001~002 | 2 | PACK-R1-04 |
| R1 | MATTER-MATTLIFE-STATENGI-TUW-001~005 | 5 | PACK-R1-05 |
| R1 | SEC-MATTPERM-ACCECONT-TUW-001~006 | 6 | PACK-R1-06 |
| R1 | SEC-DOCUPERM-ACCECONT-TUW-001~002 | 2 | PACK-R1-06 |
| R1 | MATTER-PARTMANA-PARTREGI-TUW-001~005 | 5 | PACK-R1-07 |
| R1 | SEC-PERMHARN-MATRIX-TUW-001~002 | 2 | PACK-R1-07 |
| R1 | DEVOPS-FREEZE-PERMMODEL-TUW-001 | 1 | PACK-R1-07 |
| **R1 소계** | | **52** | 7 PACK |
| R2 | DOC-DOCUSTOR-OBJESTORAD-TUW-001~005 | 5 | PACK-R2-01 |
| R2 | DOC-DOCUUPLO-UPLOAPI-TUW-001~003 | 3 | PACK-R2-01 (분할 1/2) |
| R2 | DOC-DOCUUPLO-UPLOAPI-TUW-004~008 | 5 | PACK-R2-02 (분할 2/2) |
| R2 | DOC-DOCUINTE-HASHDUPL-TUW-001~003 | 3 | PACK-R2-02 (분할 1/2) |
| R2 | DOC-DOCUINTE-HASHDUPL-TUW-004~005 | 2 | PACK-R2-03 (분할 2/2) |
| R2 | DOC-DOCUMETA-METAEXTR-TUW-001~006 | 6 | PACK-R2-03 |
| R2 | DOC-DOCUVERS-VERSRESO-TUW-001~007 | 7 | PACK-R2-04 |
| R2 | RECORD-HOLDIF-INTERFACE-TUW-001 | 1 | PACK-R2-04 |
| R2 | DOC-OCRTEXTEXT-EXTRWORK-TUW-001~006 | 6 | PACK-R2-05 |
| R2 | DOC-HWPX-EXTRACT-TUW-001~002 | 2 | PACK-R2-05 |
| R2 | DOC-DOCULIFE-LIFEMANA-TUW-001~006 | 6 | PACK-R2-06 |
| R2 | AI-AIPOLI-SCHEMAONLY-TUW-001 | 1 | PACK-R2-06 |
| R2 | SEC-DOCUPERM-ACCECONT-TUW-003~006 | 4 | PACK-R2-07 |
| R2 | DOC-PREVIEW-VIEWER-TUW-001~003 | 3 | PACK-R2-07 |
| R2 | AUDIT-DOCUAUDI-DOCUEVEN-TUW-001~005 | 5 | PACK-R2-08 |
| **R2 소계** | | **59** | 8 PACK |
| R3 | SEARCH-SEARINDE-INDE-TUW-001~005 | 5 | PACK-R3-01 |
| R3 | DEVOPS-EVALSET-V0-TUW-001~002 | 2 | PACK-R3-01 |
| R3 | SEARCH-METASEAR-FILT-TUW-001~005 | 5 | PACK-R3-02 |
| R3 | SEARCH-FULLSEAR-TEXTQUER-TUW-001~005 | 5 | PACK-R3-03 |
| R3 | SEARCH-KOREAN-EVAL-TUW-001~002 | 2 | PACK-R3-03 |
| R3 | SEARCH-PERMSEAR-PERMFILT-TUW-001~005 | 5 | PACK-R3-04 |
| R3 | SEC-ETHIWALL-WALLENFO-TUW-005 | 1 | PACK-R3-04 |
| R3 | SEARCH-UI-PAGE-TUW-001~003 | 3 | PACK-R3-05 |
| **R3 소계** | | **28** | 5 PACK |
| **총계** | | **174** | **25 PACK** |

Risk=C TUW의 PACK 배정(전수 18건): AUDILOGG-004→R0-02, TENACONT-004→R0-03, ROLEMATR-002·WALLENFO-001·WALLENFO-002→R1-03, MATTPERM-001·MATTPERM-006→R1-06, PERMHARN-001·FREEZE-PERMMODEL-001→R1-07, HASHDUPL-004→R2-03, LIFEMANA-002·LIFEMANA-004→R2-06, DOCUPERM-003→R2-07, PERMFILT-001·002·003·005·WALLENFO-005→R3-04. **해당 9개 PACK(R0-02, R0-03, R1-03, R1-06, R1-07, R2-03, R2-06, R2-07, R3-04)은 전부 "사람 리뷰 필수"로 지정되어 있다.**

---

*문서 끝. 본 문서의 PACK 정의·순서·프롬프트는 Brief §9 실행 모델의 구체화이며, R4 이후 PACK은 R3 Gate 통과 후 44번 문서의 TUW 상세화와 함께 본 문서 v2.0에서 확장한다.*
