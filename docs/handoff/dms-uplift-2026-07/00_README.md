# AMIC Vault — Internal DMS Uplift 개발 핸드오프 패키지

Date: 2026-07-03
Package owner: 서지원 (jwsuh@amic.kr)
대상 리포지토리: `amic-vault` (pnpm/turborepo — apps/api NestJS, apps/web Next.js, apps/desktop Tauri, packages/*, workers/ingestion, db/migrations)
분석 기준 체크아웃: `codex/matter-identity-staging-execute-gate` (origin/main 이후 미커밋 변경 포함)

현재 실행 기준(2026-07-06): 이 핸드오프는 2026-07-03 발주 패키지 원본이다. 실제 strict-completion 진행 상태는 `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.md` / `.json`(생성 시각 `2026-07-05T09:03:31.603Z`)을 기준으로 읽는다. 현재 장부는 110행 중 `COMPLETE_CANDIDATE` 19, `LOCAL_IMPLEMENTED_NEEDS_EVIDENCE` 80, `EXTERNAL_BLOCKED` 11이다. 이 패키지의 "117 유닛" 표현은 원 발주 범위/기준선이며, 그 자체를 현재 완료 증거로 승격하지 않는다.

## 이 패키지의 목적

9인 로펌 **내부용** DMS(AMIC Vault)를 컨셉 문서가 정의한 목표 수준까지 끌어올리기 위한 **완결된 개발 발주 패키지**다.
이 패키지만으로 개발팀이 배경 이해 → 유닛 착수 → 완료 판정 → 최종 인수까지 외부 질의 없이 진행할 수 있도록 작성되었다.

**규범(normative) 문서는 두 개다:**
1. **작업계획**: `03_workplan-TUW-snapshot.md` — 발주 시점 117개 Testable Units of Work 고정본. 라이브 계획 원본은 `docs/execution/TUW_INTERNAL_DMS_UPLIFT_H1_H3.md`이며, strict-completion 운영 상태는 `docs/execution/TUW_INTERNAL_DMS_UPLIFT_110_STATUS_LEDGER.md` / `.json`을 우선한다.
2. **최종 인수 기준**: `04_baseline8-requirements.md`의 E2E 인수 시나리오 8종 + `06_execution-guide.md`의 Definition of Done.

나머지 문서(01, 02, 05, 07, reference/)는 배경·근거·이식 명세다.

## 문서 맵 및 읽는 순서

| 순서 | 문서 | 내용 | 대상 |
|---|---|---|---|
| 1 | `00_README.md` (이 문서) | 패키지 개요, 100% 완료의 정의 | 전원 |
| 2 | `01_context-and-goals.md` | 배경, 현재 시스템 성숙도, 운영 전제·완화 정책 | 전원 (착수 전 필독) |
| 3 | `04_baseline8-requirements.md` | 발주자 필수 요구 8종 명세 + 요구→유닛 추적 매트릭스 + E2E 인수 시나리오 | 전원 (착수 전 필독) |
| 4 | `06_execution-guide.md` | 실행 순서·의존성 그래프·마일스톤·검증 계약·DoD | PM·전 개발자 |
| 5 | `03_workplan-TUW-snapshot.md` | 유닛 117개 전체 명세 (Goal/Scope/앵커/완료판정/의존성) | 담당 유닛 착수 시 |
| 6 | `02_gap-analysis-full.md` | 갭 분석 130건 전문 (파일:줄 증거) — 유닛의 "왜"가 필요할 때 | 참고 |
| 7 | `05_contract-desk-redline-port.md` | Contract Desk redline 엔진 이식 명세 (B18/B19/B20 전용) | 해당 유닛 담당자 |
| 8 | `07_risks-and-decisions.md` | 리스크 레지스터 + 착수 전/중 확정할 결정 사항 | PM·리드 |
| 9 | `reference/` | 최초 컨셉 문서 2건 텍스트 추출본 | 참고 |

## "100% 개발 완료"의 정의

아래 4개 조건이 모두 충족되면 완료다. 어느 하나라도 미충족이면 완료가 아니다.

1. **유닛 완결**: 작업계획의 117개 유닛(H1 38, H2 61, H3 18)이 각자의 acceptance tests를 통과하고 머지됨. 조건부 유닛 집합은 `06_execution-guide.md` §4가 **단일 원장**이다({D9, B20, H14} — 트리거 미발생 시 발주자 서면 확인으로 제외 처리; B14는 D-06 결정에 따름).
2. **표준 게이트**: 모든 PR이 `06_execution-guide.md` §5의 Verification Contract(lint/typecheck/test/build + UI 게이트)를 통과함.
3. **Baseline-8 E2E 인수**: `04_baseline8-requirements.md` §3의 시나리오 8종을 발주자(변호사 1인 이상)가 §3.0의 사전 준비물·환경 조건에서 직접 수행하여 전건 통과 서명. **수행 시점은 프로젝트 완료 판정 직전 — DMS 표면에 영향을 주는 마지막 머지 이후 4주 이내의 재수행이어야 유효**(중간 마일스톤 수행 기록으로 갈음 불가).
4. **회귀 무결**: 기존 통합테스트 스위트(tests/integration/**) 전건 green — 기존 기능(권한·감사·무결성)의 파괴 없음.

표기 주의: 유닛 ID(H1~H14 등)와 Horizon(H1~H3)이 혼동될 수 있다. 이 패키지에서 "유닛 H1"처럼 '유닛'이 붙으면 워크스트림 H의 1번 유닛이고, "H1/H2/H3"가 단독으로 기간을 지칭하면 Horizon이다. 모호한 곳은 각 문서에서 "(유닛 …)" 표기로 구분했다.

## 인계 전 발주자 필수 조치 (이것 없이는 패키지가 성립하지 않음)

- [ ] **기준선 커밋·태그**: 현재 워킹트리 미커밋 변경(~440건 — C16의 규범 앵커인 outlook-fulfillment 계열 신규 파일 포함)을 전부 커밋하고 `handoff-2026-07` 태그로 푸시. 개발팀 체크아웃 지시는 이 태그다. 이것이 안 되면 이 패키지의 code_anchors 다수가 개발팀 환경에 존재하지 않는다.
- [ ] Contract Desk 원본 git 접근 제공 (`05_contract-desk-redline-port.md` §0, `07` §5)
- [ ] `07_risks-and-decisions.md` §5 발주자 제공 의무 목록의 담당자·기한 기입

## 착수 전 개발팀 체크리스트

- [ ] `AGENTS.md`(리포 루트)와 `docs/current-code-state.md` 정독 — 리포 규약·보호 경로(`docs/package/**` 수정 금지) 숙지
- [ ] 로컬 환경 기동(커맨드 순서): `pnpm install` → `docker compose -f infra/docker-compose.dev.yml up -d` → (필요 시) `cp .env.example .env` → `pnpm db:migrate && pnpm db:seed` → `pnpm test`로 기준선 green 확인
- [ ] `01_context-and-goals.md`의 완화 정책 숙지 — **완화 정책에서 제외된 기능을 임의로 만들지 말 것** (범위 증가 금지)
- [ ] `07_risks-and-decisions.md` §2.1의 킥오프 확정 결정 7건을 발주자와 확정하고, §2.2 예정 결정 2건의 결정 시점을 합의
- [ ] **W0 (첫 작업 유닛): 117유닛 전수 초기 상태 감사** — `01_context-and-goals.md` §2.3의 기구현 증거표를 출발점으로 각 유닛을 todo/partial/done으로 분류해 라이브 작업계획에 기록. 마이그레이션 0093~0120이 H1 유닛 다수와 일치하므로 이 감사 없이 배정하면 일정이 전면 왜곡된다
- [ ] 각 유닛 착수 시: 유닛 명세의 code_anchors를 현재 코드로 재검증. 이미 구현된 것은 acceptance tests로 확인만 하고 닫을 것

## 진행 관리 규칙

- 유닛 단위 브랜치·PR: `codex/<unit-id>-<slug>` (예: `codex/b16-lock-copy-prompt`). 1 유닛 = 1 PR 원칙(L 유닛은 스택 PR 허용).
- PR 본문에 유닛 ID·acceptance tests 결과·표준 게이트 결과를 기록.
- 진행 현황은 라이브 작업계획 문서에 유닛별 상태(`todo/in-progress/done(PR#)`)를 표기해 단일 원장으로 관리.
- 완화 정책 변경·범위 추가는 발주자 서면 승인 후 라이브 작업계획에 반영.
