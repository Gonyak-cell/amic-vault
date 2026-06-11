# 80. Open Items — 잔여 미결사항 및 확장 후보

버전: 1.0 | 작성일: 2026-06-11 | 관리 주체: PO | `00_Master_Brief.md`(규범)와 충돌 시 Master Brief가 우선한다.

이 문서는 **아직 결정되지 않은 사항만** 담는다. 이미 확정된 사항은 Master Brief §1(DEC-01~18)에 있고, 원천 Open Questions의 처리 현황은 `70_Risk_Register.md` §4에 있다. **여기 등재된 항목은 결정 전까지 "현행 기본값" 열의 동작이 유일한 유효 동작이며, Codex는 미결을 이유로 임의 구현하지 않는다.**

## 1. 잔여 미결사항

| ID | 항목 | 현행 기본값 (결정 전 동작) | 결정 필요 시점 | 결정 주체 | 비고 |
|---|---|---|---|---|---|
| OPEN-01 | **보존기간 법률검토값** (원천 Q-005) — 문서유형별 법정 보존기간·삭제 가능 시점 | DEC-12: **자동삭제 없음·무기한 보존**. retention 필드만 R2에 준비, disposal 계열 테이블은 예약 스키마로 문서화만 | 늦어도 **R12(Records) 착수 전**. 법률검토 완료 전 R12 보존자동화 TUW 상세화 금지 | 법무 책임자 + 외부 법률검토, PO 승인 | hard delete는 어떤 경우에도 R12 전 금지(절대 금지 목록) |
| OPEN-02 | **국내 법률DB 연동 source** (원천 Q-004) — 판례·법령 DB 공급자, 라이선스, 연동 방식 | 연동 없음. `authorities` 테이블(scope global\|tenant)은 스키마만 존재. **사양에 없는 외부 API 호출은 절대 금지** | **R6 Readiness 검토 시 1차 판단**(retrieval 인용 대상 포함 여부), 늦어도 **R8(Contract Intelligence) 착수 전** 확정 | PO + 변호사 대표 사용자 | 후보 평가 기준: 라이선스의 사내 시스템 인용 허용 범위, API 안정성, 비용 |
| OPEN-03 | **외부모델 단계 개방 조건** (DEC-11 후속) — 어떤 조건·어떤 데이터 등급·어떤 모델 tier부터 개방하는지, 승인 절차 | DEC-11: **외부모델 전면 차단, Gemma 로컬 only**. `ai_policies.external_model_allowed=false`, default_effect='DENY' | **R6 출시 전** 결정 — 31번 AI Readiness Checklist 항목("외부모델 차단 확정 포함")과 함께 확정. 미결정 시 차단 상태로 R6 출시(출시 차단 사유 아님) | PO + Security Reviewer + 법무 | 개방하더라도 ai_policy 승인 게이트 경유 필수. "개방 조건 미정 = 영구 차단"이 fail-closed 해석 |
| OPEN-04 | **OpenSearch 전환 여부** | DEC-05: R3까지 PG FTS | **R3 Gate에서 판단** — `SEARCH-KOREAN-EVAL-TUW-001~002`의 한국어 토큰화 평가(법률용어 fixture 30건)와 전환 판단 보고서(ADR-006 갱신)가 판단 입력 | Architecture Governor + PO | 전환하더라도 permission filter 주입·cross-tenant 차단 등 R3 Gate 기준은 동일하게 재충족해야 함 |
| OPEN-05 | **repo 호스팅 위치** | **확정(2026-06-11)**: GitHub **private repo + 로컬 작업** (계정: `Gonyak-cell`). branch protection의 "승인 1명 필수"는 **1인 개발 사유로 미적용** — 대체 통제는 85번 §2-A 셀프 리뷰 체크리스트(Risk=C PACK은 체크리스트 완료·ledger 기록 전 머지 금지) | 해소됨 | PO | CI는 GitHub Actions. 사양 문서의 private repo 반입은 허용(사외 공개 금지) |
| OPEN-06 | **Codex 실행 환경** | **확정(2026-06-11)**: **Codex 데스크톱 앱(로컬 Mac)**. 사전 설치 필요: Docker Desktop, Node 20 LTS+pnpm(corepack), Python 3.12, git | 해소됨 | PO | 표준 검증 명령 전부 로컬 실행. 프로덕션 자격증명 접근 불가·비식별 fixture 외 실데이터 반입 금지 원칙은 유지 |

## 2. 확장 후보 (사양 외 — PO 승인 시에만 백로그 편입)

아래 항목은 **현행 사양·백로그에 없으며**, PO가 승인하여 정식 TUW로 등재하기 전까지 구현 금지다(절대 금지: "사양·본 패키지에 없는" 기능 추가). 승인 시 해당 release 문서(44번 이후)에 TUW 표준(§6.1)으로 편입한다.

| ID | 후보 | 내용 | 적합 시점 | 동기 |
|---|---|---|---|---|
| EXT-01 | **audit hash chain + WORM 이중화** | `audit_events`에 직전 이벤트 hash를 연결하는 hash chain 컬럼 추가 + WORM 스토리지(S3 Object Lock 등)에 주기적 export 이중 기록 | R5 (Security & Governance) 검토 | 현행 REVOKE+trigger(70번 NEW-C)는 DB superuser·백업 변조 위협모델을 커버하지 못함. 감사 증적의 외부 검증 가능성 확보 |
| EXT-02 | **LLM-judge 평가 보조** | 평가셋(R3 v0 → R6 ~1,000건) 채점에 로컬 LLM 보조 채점 도입. 사람 최종 판정은 유지, judge는 1차 스크리닝·불일치 표시만 | R6 평가 파이프라인 구축 시 | 평가셋 확대 시 사람 채점 병목 완화. 단 DEC-11과 정합하도록 **로컬 모델 한정**, judge 결과를 게이트 통과 근거로 단독 사용 금지 |
| EXT-03 | **R6 shadow pilot 확대안** | DEC-18 기본(내부 변호사 한정 2~4주) 대비: 기간 연장, 대상 practice group 확대, 정량 종료 기준(citation 정확도·hallucination 신고율 임계치) 추가 | R6 shadow pilot 설계 시 | 파일럿 표본이 작을 경우 R6 Gate 판단 신뢰도 부족. 비용은 R6 정식 공개 지연 |

## 3. 운영 규칙

1. 미결사항이 결정되면: Decision Ledger(`docs/ledger/`)에 등재 → 영향받는 패키지 문서 갱신 → 본 문서에서 해당 행 삭제(이력은 ledger가 보존).
2. "결정 필요 시점"을 넘긴 미결사항은 해당 release Gate의 **차단 항목**이다 (OPEN-05·06은 2026-06-11 확정·해소됨. 예: OPEN-03 미결은 차단 유지로 R6 진행 가능).
3. 본 문서에 없는 신규 아이디어는 먼저 여기(§2)에 후보로 등재한 뒤 PO 판단을 받는다. Codex가 구현 중 발견한 개선 아이디어도 동일 — 직접 구현하지 않고 `docs/ledger/execution.md`에 제안으로 기록한다.
