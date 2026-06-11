# 85. Human Operations Playbook — 사람이 할 일

버전: 1.0 | 2026-06-11 | 독자: PO/관리자(사용자 본인), 검토 변호사

Codex는 PACK 단위로 구현·검증·PR 생성까지 수행한다. 그러나 다음 항목은 **사람만 할 수 있으며, 사람이 하지 않으면 진행이 멈추도록 설계되어 있다** (fail-closed 운영). 이 문서는 그 전체 목록과 시점, 예상 소요를 정의한다.

## 1. 착수 전 — 1회성 셋업 (확정 반영: Codex 데스크톱 앱 + 1인 개발)

> 확정(2026-06-11): OPEN-05 = GitHub private + 로컬 작업, **승인 1명 필수 미적용(1인 개발)**. OPEN-06 = **Codex 데스크톱 앱(로컬 Mac)**.

| # | 할 일 | 구체적 방법 | 소요 |
|---|---|---|---|
| H-01 | **Mac 사전 설치** | Docker Desktop, Node 20 LTS(+corepack으로 pnpm), Python 3.12, git. 전부 무료 — Codex가 검증 명령을 이 Mac에서 실행하므로 필요 | 30분 |
| H-02 | **GitHub private repo 생성** | github.com에서 비공개 저장소 `amic-vault` 생성(백업·이력·PR 기록 목적). 승인 강제 설정은 하지 않음. main 직접 push 금지 규칙만 권장(Settings→Branches→"Require a pull request before merging", 승인 수 0) | 10분 |
| H-03 | **작업 폴더 준비 + Codex 연결** | 로컬에 `amic-vault` clone(또는 빈 폴더 git init 후 remote 연결) → **Codex 데스크톱 앱에서 이 폴더를 열기** | 10분 |
| H-04 | **첫 PACK 투입** | 본 패키지 `60_Execution_Packs.md`의 `[PACK-R0-01 …]` 코드 블록을 통째로 복사해 Codex에 붙여넣기. 단, 첫 PACK 시작 전에 `90_AGENTS_TEMPLATE.md`를 폴더 루트에 `AGENTS.md`로 복사해 둘 것(README 절차 2) | 5분 |

## 2. 상시 — PACK 사이클마다 (R0~R3 동안 25회)

| # | 할 일 | 규칙 | 소요 |
|---|---|---|---|
| H-05 | **PR 리뷰·머지** | **리뷰 필수 PACK 9개**(R0-02, R0-03, R1-03, R1-06, R1-07, R2-03, R2-06, R2-07, R3-04 — Risk=C 18건 포함)는 **§2-A 셀프 리뷰 체크리스트 완료 전 머지 금지**(1인 개발 — GitHub 승인 강제 대신 본인 확인+ledger 기록으로 통제). 나머지 16개도 머지는 항상 사람이 한다 | 필수 PACK 30~60분, 그 외 10~15분 |
| H-06 | **리뷰 시 볼 것** | ① PR 본문의 검증 명령 결과(전부 green인지) ② Risk=C TUW의 negative test가 실제로 차단을 증명하는지 ③ `Files NOT to modify` 위반 여부(diff 범위) ④ 테스트 약화·skip 흔적 | (H-05에 포함) |
| H-07 | **BLOCKED escalation 처리** | Codex가 중단하면 PR에 `BLOCKED` 라벨+사유 코멘트가 남는다. 사람이 결정을 PR 코멘트로 회신해야 재개된다. 24시간 내 응답 권장(전체 일정의 유일한 대기 지점) | 건당 10~30분 |
| H-08 | **다음 PACK 투입** | 선행 PACK 머지 확인 후 60번의 다음 프롬프트 투입 | 5분 |

### §2-A. 셀프 리뷰 체크리스트 (1인 개발 모드 — Risk=C PACK 머지 전 필수)

GitHub 승인 강제를 적용하지 않으므로, 아래 6항목을 **본인이 직접 확인**하는 것이 사람 리뷰를 대신한다. 형식적으로 넘기면 통제가 사라진다 — C 18건은 전부 권한·감사·격리 코드다.

- [ ] **diff 전체를 직접 읽었다** — 특히 `permission/`, `audit/`, `ethical-wall/`, storage 경로의 변경
- [ ] **검증 명령 출력을 확인했다** — negative test(비인가 차단)가 실제 실행·통과했고, 테스트 개수가 직전 대비 줄지 않았다
- [ ] **Files NOT to modify 위반이 없다** — diff 파일 목록을 해당 TUW 명세와 대조
- [ ] **테스트 약화가 없다** — `.skip` / `xit` / `it.todo` / expected 완화 흔적 grep
- [ ] **C TUW의 Verification 항목마다 대응 테스트가 존재한다** — 40~43번 명세의 AND 목록과 1:1 대조
- [ ] **ledger에 기록했다** — `docs/ledger/execution.md`에 `HUMAN-REVIEW: <PACK-ID> <날짜> OK` 1줄 추가 후 머지

## 3. Release Gate마다 — R0~R3에서 4회 (통과 전 다음 release 착수 금지)

| Gate | 사람이 승인할 것 | 근거 문서 |
|---|---|---|
| **R0 Gate** | Foundation 체크리스트(G0-01~30) + **ADR-001~012 승인**(Decision Ledger 등재) | 50번 §2, 01번 |
| **R1 Gate** | 권한 매트릭스 하네스 100%·audit coverage·fail-closed 증명 + **Permission Model Freeze(ADR-013) 승인** — 이후 권한 인터페이스 변경은 사람 승인 필요 | 50번, 41번 §4 |
| **R2 Gate** | hash/원본 불변·hold 차단·storage 격리 체크리스트(G2-1~15) + **Q-003 HWPX 범위 결과 확인** | 50번, 42번 |
| **R3 Gate** | **metadata leakage 0건·사후 필터링 0건 확인**(불통과 사유 명문화됨) + **ADR-006 OpenSearch 전환 여부 결정**(KOREAN-EVAL-002 보고서 기반) + 평가셋 v0 적재 확인 | 50번, 43번 §4 |

Gate 1회당 반나절 정도를 권장한다 (체크리스트가 검증 명령·증빙 단위로 작성되어 있어 따라가면 된다).

## 4. 도메인·법률 입력 — 사람(변호사)만 가능한 일

| # | 할 일 | 시점 | 소요 |
|---|---|---|---|
| H-09 | **평가셋 원료 선별**: 종결 Matter 중 비식별화 가능한 계약서 20~50건 선별, 비식별화 규칙 승인 (DEVOPS-EVALSET-V0-TUW-001) | R3 기간 | 변호사 1~2일 |
| H-10 | **권한 taxonomy 실무 검증**: DEC-15의 role 7종+practice_group이 실제 조직과 맞는지 — 안 맞으면 **R1 착수 전** 피드백 (Freeze 후 변경은 고비용) | R1 전 | 1시간 |
| H-11 | **보존기간 법률검토** (Q-005): 문서유형별 보존·폐기 기간. R12 전까지면 되나, 그 전까지 기본값은 "자동삭제 없음"(DEC-12) | R12 전 | 별도 법률검토 |
| H-12 | **국내 법률DB 연동 협의** (Q-004): 판례 DB 라이선스 등 | R6 전 | 별도 협의 |

## 5. R4 이후 — 확장 시점의 사람 결정

| # | 할 일 | 시점 |
|---|---|---|
| H-13 | **R4~R14 TUW 상세화 지시**: R3 Gate 통과 후 44번 개요를 기준으로 60번 v2.0 확장을 지시한다(본 패키지와 동일한 방식으로 생성 가능). **미상세화 상태에서 R4 착수는 금지되어 있다** | R3 Gate 직후 |
| H-14 | **R6 AI Readiness sign-off**: 31번 체크리스트 8개 영역(권한/provenance/citation/AI audit/model gateway/평가셋/Gemma PoC/외부모델 차단) 각각의 증빙 확인 후 서명 | R6 진입 전 |
| H-15 | **외부모델 정책 결정**: DEC-11은 "차단으로 시작" — 개방하려면 승인 절차(dual approval)·감사이벤트 가동을 확인하고 개방 범위를 결정 | R6 이후 |
| H-16 | **Shadow pilot 운영**(DEC-18): 내부 변호사 소수 그룹 선정, 2~4주 사용, 피드백·지표(citation accuracy, leakage 0건) 확인 후 정식 공개 승인 | R6 Gate 직전 |

## 6. 요약 — 사람의 시간 예산 (R0~R3 기준)

- 착수 셋업: **약 1시간** (H-01~04)
- PACK 리뷰: 필수 9개 × ~45분 + 일반 16개 × ~10분 ≈ **9~10시간** (25 PACK 전체 기간에 분산)
- Gate 4회: **약 2일**
- 변호사 입력: 평가셋 1~2일 + taxonomy 1시간
- 예측 불가 항목: BLOCKED escalation (설계상 Codex가 추측하지 않고 멈추므로, 응답 속도가 전체 일정을 좌우한다)

**원칙: 사람이 병목인 지점은 전부 의도된 것이다.** Risk=C 머지, Gate 통과, Freeze 승인, 법률 값 입력은 자동화 대상이 아니다 — 이를 우회하는 요청(라벨 제거, Gate 생략)은 Codex 수칙(AGENTS.md) 위반이다.
