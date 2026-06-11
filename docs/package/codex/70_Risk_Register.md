# 70. Risk Register — AMIC Vault 실행 패키지

버전: 1.0 | 작성일: 2026-06-11 | 상태: Normative 보조 문서 — `00_Master_Brief.md`(규범)와 충돌 시 Master Brief가 우선한다.

원천: `../vault_dev_package/docs/18_Risk_Register_Open_Questions.md` §1·§3을 승계·갱신한다. 원천의 Open Questions(Q-001~008) 중 미결분은 `80_Open_Items.md`로 이관했다(§4 참조).

## 0. 읽는 법

- 모든 리스크는 `ID / 등급 / 영향 / 대응 / 잔여상태` 5필드로 기술한다.
- **등급**: Critical / High / Medium (원천 등급 승계, 신규는 본 패키지에서 부여).
- **잔여상태** 정의:
  - **해소됨** — 본 패키지의 보정(Master Brief §3 C-1~C-10) 또는 확정 결정(§1 DEC-01~18)으로 리스크의 원인이 사양 차원에서 제거됨. 단, 구현·Gate 검증은 해당 release에서 수행한다.
  - **완화됨** — 통제 장치가 사양·백로그에 확정 배치되었으나, 집행 시점이 미래 release이거나 상시 운영 통제가 필요함.
  - **잔존** — 통제가 미래 release에 예정되어 있고 현 단계에서 실질 장치가 없음. 해당 release Gate 전 재평가 필수.
- 대응란의 TUW ID·Gate·원칙 번호는 모두 `00_Master_Brief.md` §2(불변 원칙), §7(R0~R3 인벤토리), §8(R4~R14 개요) 기준이다. Codex는 대응란에 명시된 장치 외의 임의 대응을 추가하지 않는다(스코프 이탈 — EXEC-001 참조).

## 1. 승계 리스크 (원천 RISK-001~010)

| ID | 리스크 | 등급 | 영향 | 대응 (본 패키지 기준 장치) | 잔여상태 |
|---|---|---|---|---|---|
| RISK-001 | 권한필터 누락 | Critical | 검색·AI·VDR에서 타 고객/비인가 사용자에게 고객자료 노출 | 불변 원칙 1·2(Permission-before-search / Permission-before-AI). PermissionService 중앙화: `SEC-MATTPERM-ACCECONT-TUW-001~006`(R1). 검색 쿼리 단계 필터 주입: `SEARCH-PERMSEAR-PERMFILT-TUW-001~005`(R3, 사후 필터링 대체 금지). 권한 매트릭스 하네스 + CI gate: `SEC-PERMHARN-MATRIX-TUW-001~002`(R1). R3 Gate에 metadata leakage 검증(title/snippet/metadata 미노출) 포함. 절대 금지: PermissionService 우회 endpoint | **완화됨** — R1~R3 장치 확정. 단 R6(AI)·R11(VDR)에서 동일 원칙 재집행 필요, 각 Gate에서 재검증 |
| RISK-002 | 초안/최종본 혼동 | Critical | AI·검색이 초안을 최종합의처럼 인용 → 잘못된 법률 판단 | version_status·superseded 표시: `DOC-DOCUVERS-VERSRESO-TUW-001~007`(R2). 검색에서 superseded·deleted 제외: `SEARCH-METASEAR-FILT-TUW-005`, `SEARCH-FULLSEAR-TEXTQUER-TUW-004`(R3) + R3 Gate 항목. final ranking·Evidence Pack rule은 R6 범위 | **완화됨** — R2/R3 장치 확정. AI 인용 단계 통제는 R6 Gate에서 최종 집행 |
| RISK-003 | 벡터검색 단독 의존 | High | 정의어·판례번호·조항번호 등 정확 일치 검색 실패 | 보정 C-5로 semantic search를 R3→R6 이동(R6 전 벡터/의미검색 절대 금지). R6 설계는 hybrid retrieval(BM25+vector) 고정(Master Brief §8). R3는 PG FTS 기반 키워드 검색으로 정확 일치 경로를 먼저 안정화 | **완화됨** — 발생 시점 자체가 R6로 통제됨. R6 Readiness(31번)에서 hybrid 구성 검증 |
| RISK-004 | 원본문서 덮어쓰기 | Critical | 증거성·원본성 훼손 | 불변 원칙 5(Immutable original — 버전은 항상 신규 FileObject). SHA-256 hash: `DOC-DOCUINTE-HASHDUPL-TUW-001~005`(R2, immutable original policy=Risk C). R2 Gate: 동일파일 동일 hash·1바이트 상이 검증, 원본 덮어쓰기 불가 검증 | **완화됨** — R2 장치·Gate 확정. R2 Gate 통과로 집행 확인 |
| RISK-005 | AI hallucination | High | 근거 없는 법률판단 생성 | R6 범위: citation verification, Evidence Pack, AI audit 5종, Gemma 로컬 only(DEC-11), shadow pilot 2~4주(DEC-18), 31번 AI Readiness Checklist 전 항목이 R6 진입조건. R6 전 AI 기능 구현은 절대 금지 | **잔존** — R6 전에는 AI 자체가 없어 발생 불가하나 통제 장치도 미구현. R6 Gate에서 집행 |
| RISK-006 | playbook 부재 | High | "우리 입장" 판단 불안정 | Rule Store는 R8 Contract Intelligence 범위(MVP=R6에서 제외, DEC-17). R6는 Evidence Pack·citation으로 근거 제시에 한정하고 입장 판단을 출력하지 않음. Feedback store(R6)로 개선 루프 선행 구축 | **잔존** — R8에서 해소 예정. R6~R7 기간은 기능 범위 한정으로 노출 통제 |
| RISK-007 | graph 관계 오염 | Medium | 잘못된 관계 기반의 잘못된 답변 | Neo4j/GraphSync R7 전 도입 절대 금지(DEC-05). R7 설계 시 confidence 점수·review queue 의무화(원천 06번 승계) | **잔존** — R7 전 발생 불가. R7 TUW 상세화(R3 Gate 이후) 시 대응 장치를 TUW로 고정 |
| RISK-008 | 외부공유 링크 오작동 | Critical | 고객자료 외부 유출 | 불변 원칙 6(No silent external sharing — R11 전 어떤 형태도 구현 금지, 절대 금지 목록). 보정 C-6: R9의 P13 사용은 내부 전용 data room mapping으로 한정. P13(external_*)은 예약 스키마로 문서화만(데이터 모델 v1.1 §5-7). R11에서 expiration/revocation test 의무 | **완화됨** — R11 전 구조적 봉쇄. R11 Gate 설계 시 본 리스크 재등재·재평가 필수 |
| RISK-009 | legal hold 삭제 우회 | Critical | 보존의무 위반, 소송상 제재 | 보정 C-3: legal hold 인터페이스 계약을 R2 신설 — `RECORD-HOLDIF-INTERFACE-TUW-001`(hold flag + delete precondition check), `DOC-DOCULIFE-LIFEMANA-TUW-003`(hold 시 삭제 차단). hard delete는 R12 전 절대 금지. R2 Gate: hold flag 삭제 차단 검증 | **완화됨** — R2 인터페이스로 우회 경로 차단. 전체 LegalHold/disposal 체계는 R12에서 완성 |
| RISK-010 | 평가셋 부재 | High | AI 품질 측정·개선 불가능 | DEC-16: 종결 Matter 비식별 계약서 20~50건으로 v0 시작 — `DEVOPS-EVALSET-V0-TUW-001~002`(R3, 수집 절차 문서 + `evaluation_cases` 테이블·적재 스크립트, AI 기능 아님). R6 게이트 서브셋 ~1,000건은 31번 체크리스트 진입조건 | **완화됨** — R3에서 v0 착수 확정. ~1,000건 확보 실패 시 R6 진입 불가로 fail-closed |

## 2. 신규 리스크 — 적대적 검증에서 발견된 원천 사양 결함 (NEW-A~E)

본 절의 리스크는 원천 사양(`vault_dev_package`) 자체의 구조 결함으로, Master Brief §3의 보정으로 처리되었다. Codex는 원천 문서와 본 패키지가 충돌하는 지점에서 **항상 본 패키지를 따른다**(충돌 발견 시 escalation, 임의 해석 금지).

| ID | 리스크 | 등급 | 영향 | 대응 | 잔여상태 |
|---|---|---|---|---|---|
| NEW-A | 윤리장벽 의존성 역전 (R3 wall filter가 R5 소속 EthicalWall schema에 의존) | Critical | 원천 백로그 순서대로 실행 시 R3 검색이 wall 미적용 상태로 출시되거나 R3가 R5를 기다리며 정지 | **보정 C-2로 해소**: EthicalWall schema/membership/create API를 R1로 이동(`SEC-ETHIWALL-WALLENFO-TUW-001~003`), search enforcement는 R3(`SEC-ETHIWALL-WALLENFO-TUW-005` + `SEARCH-PERMSEAR-PERMFILT-TUW-003` 통합 검증), break-glass·고도화만 R5 잔류. R1 권한 매트릭스 하네스에 wall 상태 축 포함 | **해소됨** — R1·R3 Gate에서 집행 검증 |
| NEW-B | Audit Console 접근권한 enforcement 누락 | High | 원천 13번 `AUDIT-AUDICONS-CONS-TUW-001~005`는 audit 검색/필터/export/UI만 정의하고 열람 권한 통제 TUW가 없음 → audit log 자체(행위 패턴, matter 존재 사실, 사용자 행동)가 비인가 노출 경로가 됨 | **R5에 Audit Console 권한 enforcement TUW 신설**(Master Brief §8 R5 범위에 명시 확정). Security Admin 등 한정 role만 열람, 열람 행위 자체도 audit 대상. R5 TUW 상세화(44번 → R4 Gate 후) 시 Risk=C로 부여 | **완화됨** — 사양 결함은 제거(R5 범위 확정), enforcement 구현·검증은 R5 Gate에서 완료 |
| NEW-C | audit append-only 메커니즘 부재 | Critical | 원천 08번은 감사 불변성을 선언하나 구현 메커니즘 미정의 → 선언만 있고 변조 가능한 audit trail | **R0에서 DB 계층으로 해소**: `AUDIT-AUDIEVENCO-AUDILOGG-TUW-004`(Risk C) — `audit_events`에 UPDATE·DELETE **REVOKE + trigger 차단**(데이터 모델 v1.1 §5-5). `audit_events`에 UPDATE/DELETE 가능한 경로는 절대 금지 목록. R0 Gate: audit UPDATE·DELETE의 DB 실패 검증 | **해소됨** — R0 Gate에서 집행 검증. DB superuser 위협모델 보강(hash chain·WORM)은 확장 후보(80번 EXT-01, PO 승인 전 구현 금지) |
| NEW-D | `tenant_id` 누락 14개 테이블 | Critical | 원천 07번에서 permissions, clauses, defined_terms, playbook_rules, drafting_patterns, feedback_items, evaluation_cases 등 14개 row-level 테이블에 `tenant_id` 부재 → cross-tenant 격리 파괴, RLS 적용 불가 | **보정 C-7 / 데이터 모델 v1.1로 해소**: 전 row-level 테이블 `tenant_id NOT NULL` + RLS 의무(`authorities`만 scope global\|tenant 허용). 모든 마이그레이션에 RLS 정책 동반 규약(Master Brief §4), convention 템플릿 `CORE-DATACORE-MIGR-TUW-005`, cross-tenant 차단 테스트 `CORE-TENACORE-TENACONT-TUW-004`(Risk C) + R0 Gate | **해소됨** — R0 Gate 및 이후 모든 Gate의 cross-tenant 항목으로 상시 검증 |
| NEW-E | 원천 백로그 placeholder | High | 원천 13번 392건의 Deps가 전건 "상위 schema/API 확정", Verification이 "…중 해당 항목 통과"(OR boilerplate) → 실행 순서 결정 불가·검증 의미 없음. Codex가 이대로 실행 시 임의 순서·임의 검증 | **본 패키지로 해소**: 보정 C-8(Verification AND 의미론), 40~43번 TUW 상세 명세(실 의존성 DAG·Files·Verification·Stop condition), `data/backlog_r0_r3.csv·json` 기계가독 백로그(**생성 완료** — 174행, DAG 무순환 검증 완료), `DEVOPS-BACKLOG-VALIDATE-TUW-001`(CSV 스키마·DAG·release 규칙 CI 검증) | **해소됨** — R0~R3 범위. R4~R14는 44번 개요만 존재하며 R3 Gate 후 동일 기준으로 상세화(미상세화 상태에서 R4 착수 금지) |

## 3. Codex 실행 고유 리스크 (EXEC-001~004)

구현 주체가 코딩 에이전트(Codex)라는 사실 자체에서 발생하는 리스크. 대응의 3대 축은 **AGENTS.md 수칙**(90번 템플릿을 repo에 복사), **사람 리뷰 게이트**(Master Brief §6.3: Risk=C는 Codex 단독 머지 금지), **CI 강제**(표준 검증 명령 세트 + backlog 검증 스크립트)다.

| ID | 리스크 | 등급 | 영향 | 대응 | 잔여상태 |
|---|---|---|---|---|---|
| EXEC-001 | 스코프 이탈 — TUW 범위 밖 기능 구현 (예: R6 전 AI 기능, R11 전 외부공유, 사양에 없는 외부 API 호출) | Critical | 절대 금지 위반, release Gate 무력화, 통제 없는 민감기능 노출 | AGENTS.md 수칙: "TUW의 Objective·Files 범위 밖 구현 금지, 절대 금지 목록 위반 인지 시 작업 즉시 중단". `DEVOPS-BACKLOG-VALIDATE-TUW-001`이 release 규칙(AI<R6 금지 등)을 CI에서 기계 검증. PR 단위 사람 리뷰에서 diff의 스코프 일치 확인. PACK(60번) 프롬프트에 해당 TUW ID만 명시 | **잔존** — 상시 운영 통제. 위반 발견 시 해당 PR 폐기 + `docs/ledger/execution.md` 기록 |
| EXEC-002 | Files NOT-modify 위반 — TUW가 금지한 파일(타 모듈, `vault_dev_package` 이관본, ledger 과거 기록 등) 수정 | High | 모듈 경계 붕괴, normative 문서 오염, 동시 작업 충돌 | TUW 필수 필드 Files NOT-modify(Master Brief §6.1) + Stop condition(§6.4): NOT-modify 변경 필요 발견 시 **작업 중단 후 escalation**(수정 강행 금지). CI에서 보호 경로(`docs/package/`, `docs/ledger/` 기존 행) diff 검사. 사람 리뷰에서 변경 파일 목록 대조 | **잔존** — 상시 운영 통제 |
| EXEC-003 | 검증 우회 머지 — verification 명령 미실행, 실패 무시, 테스트 약화(skip/expected 완화) 후 머지 | Critical | green 신호의 의미 상실, 권한·감사 회귀 미검출 → RISK-001/004/009 재발 경로 | 표준 검증 명령 세트(`pnpm install / lint / typecheck / test / build`, `pnpm test:integration`, 필요 시 `pnpm db:migrate / db:rollback`)를 **CI에서 재실행하여 강제** — Codex의 로컬 보고를 신뢰 근거로 삼지 않음. branch protection: CI green 없이 머지 불가. Risk=C 포함 PACK은 사람 리뷰 필수(§6.3·§9). 기존 테스트의 삭제·skip·expected 완화는 리뷰에서 별도 사유 요구 | **잔존** — 상시 운영 통제 |
| EXEC-004 | 컨텍스트 부족으로 인한 임의 추측 — 사양 불명확 구간을 Codex가 그럴듯하게 메워 구현 | High | 사양과 다른 동작이 green 테스트와 함께 머지되어 장기 잠복 | TUW 자기완결 원칙(40~43번이 schema·권한·정책·edge case를 명세). 공통 Stop condition(§6.4): 스키마·권한·정책 불명확 / fixture 부재 / 동일 실패 3회 → **중단 후 `docs/ledger/execution.md`에 escalation 기록**. AGENTS.md 수칙: "불명확하면 추측하지 말고 멈춰서 기록한다"(fail-closed의 실행 버전). 권한 판단 모호 시 코드도 거부(`PERMISSION_DENIED`)가 기본값 | **잔존** — 상시 운영 통제. escalation 빈발 모듈은 명세 보강 대상으로 PM에 보고 |

## 4. 원천 Open Questions(Q-001~008) 처리 현황

| 원천 ID | 질문 | 처리 |
|---|---|---|
| Q-001 | 배포방식 | **종결** — DEC-01 (국내 리전 클라우드 private, 컨테이너) |
| Q-002 | 외부모델 정책 | **종결(기본값)** — DEC-11 (R6 시점 전면 차단·Gemma 로컬 only). 단계 개방 조건은 미결 → `80_Open_Items.md` OPEN-03 |
| Q-003 | HWP 지원 | **종결** — DEC-10 (R2는 HWPX만, HWP 5.0 바이너리는 R4~R6 별도 트랙) |
| Q-004 | 국내 법률DB 연동 source | **미결** → `80_Open_Items.md` OPEN-02 |
| Q-005 | 보존기간 법률검토 | **미결** → `80_Open_Items.md` OPEN-01 (기본값은 DEC-12: 자동삭제 없음·무기한 보존) |
| Q-006 | 권한 taxonomy | **종결** — DEC-15 (role 7종 + practice_group, ABAC는 R5) |
| Q-007 | 고객포털 MVP 포함 여부 | **종결** — DEC-17 (MVP에서 외부공유·VDR 제외, External Portal은 R11 전 절대 금지) |
| Q-008 | 평가셋 확보 | **종결(절차)** — DEC-16 (R3 v0 20~50건 → R6 ~1,000건) |

## 5. 에스컬레이션 규칙 (원천 18번 §3 승계, Master Brief §6.3과 정합)

1. **Risk=C(Critical) TUW/PACK은 사람(또는 상위 검토 에이전트) 리뷰 게이트 필수. Codex 단독 머지 금지.**
2. 다음 영역은 등급과 무관하게 사람 gate 필수: auth, tenant isolation, Matter/Document permission, ethical wall, AI retrieval, external sharing, retention/legal hold, DB migration.
3. Stop condition 발동(§3 EXEC-002·004 참조) 시 Codex는 `docs/ledger/execution.md`에 사유를 기재하고 다음 PACK으로 진행하지 않는다.
4. 본 레지스터의 갱신 시점: 각 release Gate 통과 시(잔여상태 재평가), 신규 리스크 발견 시(적대적 검증·incident), R3 Gate 후 R4~R14 상세화 시(잔존 리스크의 TUW 고정).
