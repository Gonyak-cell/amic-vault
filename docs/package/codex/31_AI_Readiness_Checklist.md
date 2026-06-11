# 31. AI Readiness Checklist — R6 진입 게이트 전문

버전: 1.0 | 작성일: 2026-06-11 | 상태: **Normative** — 00번 §8 "R6 진입조건: 31번 AI Readiness Checklist 전 항목"의 전문이다. 00_Master_Brief.md와 충돌 시 00번이 우선한다.

독자: PM(판정), AI Lead, Security Reviewer, Codex(자동 검증 실행·증빙 생성)

## 0. 적용 규칙

1. **R6의 어떤 PACK도 본 체크리스트 전 항목(AIRC-A1~H5) 통과 전에는 착수할 수 없다.** R5 Security & Governance Gate 통과는 별도 선행조건이다(30번 §2).
2. 각 항목은 세 유형 중 하나다.
   - **[기구현 검증]**: R3~R5에서 이미 구현된 것이 green 상태인지 재확인.
   - **[준비물 검증]**: R6 구현이 사용할 데이터·fixture·인프라가 준비되었는지 확인.
   - **[정책/설계 확정]**: R6 구현이 따를 계약·설계가 문서로 승인되었는지 확인. 설계 승인은 사람 리뷰 필수(Risk=C 의미론, 00번 §6.3).
3. 판정은 항목별 pass/fail **AND 의미론**이다 [보정 C-8]. 1개라도 fail이면 R6 진입 불가. 부분 통과·조건부 통과 없음(fail-closed).
4. 자동 검증은 표준 명령 세트를 사용한다: `pnpm install` / `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` / `docker compose -f infra/docker-compose.dev.yml up -d` / `pnpm db:migrate` / `pnpm db:rollback` / `pnpm test:integration`.
5. 담당 역할 정의 (개인이 아니라 역할 — 한 사람이 복수 역할 겸임 가능, 단 **판정자(PM)와 구현자(Codex)는 분리**):

| 역할 | 책임 |
|---|---|
| PM | 체크리스트 최종 판정, `docs/ledger/decision.md` 기록 |
| Security Reviewer | A·D·E·H 영역 사람 리뷰, 권한·차단·audit 증빙 승인 |
| AI Lead | B·C·F·G 영역 사람 리뷰, 평가셋·PoC·pilot 운영 책임 |
| Codex | 자동 검증 실행, 테스트·스크립트·리포트 등 증빙 생성 |

6. 증빙 보관: 테스트는 repo(`tests/`), 리포트·측정치는 `docs/ledger/` 하위에 append-only로, 판정 기록은 `docs/ledger/decision.md`. 증빙에 문서 본문·기밀 원문 포함 금지(불변 원칙 7 — 참조 ID/hash만).

## 1. 체크리스트 개요

| 영역 | ID | 항목 수 | 핵심 질문 |
|---|---|---|---|
| A. 권한 (Permission-before-AI) | AIRC-A1~A5 | 5 | AI가 권한·wall·aiAllowed 밖 자료를 절대 못 보는가 |
| B. Provenance | AIRC-B1~B3 | 3 | 모든 chunk가 원본 문서·버전·위치로 추적되는가 |
| C. Citation | AIRC-C1~C4 | 4 | 모든 주장이 근거에 연결되고, 근거 없는 주장이 표시되는가 |
| D. AI Audit | AIRC-D1~D3 | 3 | AI 행위 5종이 누락·변조 없이 기록되는가 |
| E. Model Gateway | AIRC-E1~E4 | 4 | 모델 호출이 단일 통제 지점을 거치고 기본 거부인가 |
| F. 평가셋 | AIRC-F1~F4 | 4 | R6 Gate를 측정할 ~1,000건 평가셋이 준비됐는가 |
| G. Gemma PoC | AIRC-G1~G4 | 4 | Gemma가 로컬에서 요구 역할·성능을 내는가 |
| H. 외부모델 차단 | AIRC-H1~H5 | 5 | 외부모델 호출이 정책·코드·네트워크 3중으로 차단되는가 |

## 2. 영역별 상세

### A. 권한 — Permission-before-AI (불변 원칙 2)

| ID | 유형 | 통과 기준 | 검증 방법 | 담당 | 증빙 산출물 |
|---|---|---|---|---|---|
| AIRC-A1 | 기구현 검증 | R3 Permission-bound Search Gate 항목 전체가 현 시점에도 green: matter/document/wall filter 주입, metadata leakage 0 | `pnpm test:integration` (permission-matrix, search-permission, metadata-leakage suite) 전체 green | Codex + Security Reviewer | CI 실행 리포트 (`docs/ledger/` 링크) |
| AIRC-A2 | 기구현 검증 | R5 Gate 항목 전체 green 유지: ABAC 평가 회귀, break-glass 이중 승인, wall document access enforcement | `pnpm test:integration` (abac, break-glass, wall suite) green | Codex + Security Reviewer | CI 실행 리포트 |
| AIRC-A3 | 정책/설계 확정 | AI retrieval 5단계 권한 필터 계약이 21번 권한 모델 문서에 명시·승인됨: ① pre-retrieval(tenant/matter/wall/ai_policy) ② retrieval(`documents.ai_allowed`) ③ post-retrieval(document permission, version status, deleted/legal hold) ④ Evidence Pack(title/snippet/metadata leakage 제거) ⑤ response(cited source 권한 재검증). **사후 필터링 단독 의존 금지** | 21번 문서 해당 절 존재 + Security Reviewer 서면 승인 | Security Reviewer | 21번 갱신본 + `docs/ledger/decision.md` 승인 기록 |
| AIRC-A4 | 준비물 검증 | AI 권한 negative fixture 완비: 권한 밖 문서 / wall 배제 사용자 / `ai_allowed=false` 문서 / closed·deleted·superseded 문서가 포함된 retrieval 시나리오 fixture가 `tests/fixtures/`에 존재하고 비식별 상태 | fixture 디렉토리 검수 + DLP rule 스캔(식별자 잔존 0) | AI Lead | fixture 목록 + 스캔 리포트 |
| AIRC-A5 | 정책/설계 확정 | fail-closed 적용 설계: `ai_policy` 해석 불가·permission service 오류·wall 판단 불가 시 retrieval 전체를 `PERMISSION_DENIED`로 차단(불변 원칙 4)하는 오류 주입 테스트 설계가 승인됨 | 테스트 설계 문서 리뷰 (R0 fail-closed guard 골격의 AI 경로 확장안) | Security Reviewer | 테스트 설계서 + 승인 기록 |

### B. Provenance

| ID | 유형 | 통과 기준 | 검증 방법 | 담당 | 증빙 산출물 |
|---|---|---|---|---|---|
| AIRC-B1 | 정책/설계 확정 | chunk provenance 필수 필드 계약 확정(원천 05번 §7 승계): `document_id`, `version_id`, `clause_id`(미상 시 null), `page_number`, `paragraph_number`, `char_start`, `char_end`, `source_filename`, `extraction_method`, `confidence`, `extracted_at` + `tenant_id NOT NULL`. 20번 데이터 모델에 chunks·embeddings 스키마로 등재(R2에서는 예약 문서화 [보정 C-7], 테이블 생성은 R6) | 20번 문서 해당 절 + AI Lead 리뷰 | AI Lead | 20번 갱신본 |
| AIRC-B2 | 기구현 검증 | R2~R4 추출 파이프라인이 provenance 원천을 보존: extraction 결과에 version_id·file hash·문자 offset이 남아 chunk 생성 시 역추적 가능. PDF/DOCX/HWPX/EML 각 1건 이상 fixture로 확인 | `pnpm test` (extraction provenance suite) + fixture 샘플 추적 확인 | Codex + AI Lead | 테스트 리포트 + 추적 샘플(참조 ID 수준) |
| AIRC-B3 | 정책/설계 확정 | **벡터 인덱스 권한 메타 동기화 계약**([보정 C-5]의 이동 사유) 확정: 문서 권한 변경·deleted·superseded·legal hold·wall 변경 시 chunk/embedding의 검색 노출이 갱신되는 경로와 SLA 정의. 동기화 실패 시 해당 chunk는 fail-closed(검색 제외) | 설계 문서 리뷰 + SLA 수치 합의 | Security Reviewer + AI Lead | 동기화 계약 문서 + 승인 기록 |

### C. Citation

| ID | 유형 | 통과 기준 | 검증 방법 | 담당 | 증빙 산출물 |
|---|---|---|---|---|---|
| AIRC-C1 | 정책/설계 확정 | citation object 계약 확정(원천 06번 §7 승계): 답변의 모든 주장 단위에 `document_id`+`version_id`+`chunk_id`(또는 `authority_id`) 연결, `cited_document_ids` 저장 | 스키마 설계 리뷰 (AI-CITA-CITAMAPP TUW 그룹의 입력 계약) | AI Lead | citation 계약 문서 |
| AIRC-C2 | 정책/설계 확정 | citation 없는 주장 처리 규칙 확정: warning 표시 필수, 법률판단에 해당하면 escalation flag. 무근거 주장의 silent 노출 금지 | 규칙 문서 리뷰 | AI Lead | 규칙 문서 |
| AIRC-C3 | 정책/설계 확정 | 인용 시점 권한 재검증 설계: response 단계에서 cited source가 **질의 사용자의 권한 내**인지 재검증, 실패 시 해당 인용·주장 제거(fail-closed) — AIRC-A3 ⑤단계의 구체화 | 설계 문서 리뷰 | Security Reviewer | 설계서 + 승인 기록 |
| AIRC-C4 | 준비물 검증 | citation accuracy ≥98%(원천 06번 §9 목표)를 평가셋으로 측정할 하네스 설계와 정답 라벨 스키마가 준비됨(`evaluation_cases` 확장) | 하네스 설계 리뷰 + 라벨 샘플 10건 검수 | AI Lead | 하네스 설계서 + 라벨 샘플 |

### D. AI Audit (불변 원칙 3)

| ID | 유형 | 통과 기준 | 검증 방법 | 담당 | 증빙 산출물 |
|---|---|---|---|---|---|
| AIRC-D1 | 정책/설계 확정 | AI audit event **5종** 계약 확정(P5 AUDIT-AIAUDI-AIEVEN-TUW-001~005): `AI_QUERY_SUBMITTED`(ai_session_id, model_route, matter_id) / `AI_RETRIEVAL`(document_id, chunk_id, included·excluded) / `AI_RESPONSE` / cited document log / excluded retrieval count. 누락 시 해당 AI 행위는 미완료로 간주 | 이벤트 계약 문서 리뷰 (09번 audit 계약 확장) | Security Reviewer | 이벤트 계약 문서 |
| AIRC-D2 | 기구현 검증 | `audit_events` append-only(UPDATE·DELETE REVOKE+trigger)가 유지되고, AI 이벤트용 metadata_json 화이트리스트 키 확장안이 승인됨. **prompt·response는 원문 금지, hash만**(불변 원칙 7) | `pnpm test:integration` (audit-immutability suite) green + 화이트리스트 diff 리뷰 | Codex + Security Reviewer | 테스트 리포트 + 화이트리스트 승인 기록 |
| AIRC-D3 | 정책/설계 확정 | AISession 스키마 설계 승인: prompt hash, response hash, retrieved chunk log, 모델 route, escalation flag, `tenant_id NOT NULL`+RLS | 스키마 설계 리뷰 (20번 등재) | Security Reviewer | 20번 갱신본 |

### E. Model Gateway

| ID | 유형 | 통과 기준 | 검증 방법 | 담당 | 증빙 산출물 |
|---|---|---|---|---|---|
| AIRC-E1 | 정책/설계 확정 | **단일 gateway 경로 확정**: 모든 모델 호출은 `packages/ai`의 gateway 인터페이스만 경유. 다른 패키지에서의 직접 모델 호출(HTTP/SDK)은 구조 규칙으로 금지하고 lint/CI로 탐지 | 구조 규칙 문서 + `pnpm lint` 규칙(import 경계) 동작 확인 | Security Reviewer + Codex | 구조 규칙 문서 + lint 규칙 |
| AIRC-E2 | 정책/설계 확정 | model tier enum + task risk classifier + 라우팅 규칙 설계 승인(AI-MODEROUT-RISKROUT TUW 그룹 입력 계약): 고위험(법률판단·최종 대외문안 등)은 escalation flag → 사람 검토. R6에서 유효 route는 **local Gemma 단일** | 설계 문서 리뷰 | AI Lead + Security Reviewer | 라우팅 설계서 |
| AIRC-E3 | 기구현 검증 | `ai_policies` 테이블(R2 [보정 C-7])이 존재하고 기본값이 안전: `default_effect='DENY'`, `external_model_allowed=false`. 평가 로직 설계(matter→ai_policy→model tier 판정, 해석 불가 시 거부)가 승인됨 | `pnpm db:migrate` 후 스키마·기본값 assert 테스트 + 설계 리뷰 | Codex + Security Reviewer | 테스트 리포트 + 평가 로직 설계서 |
| AIRC-E4 | 정책/설계 확정 | **kill switch 설계**: tenant 단위·전역 단위로 AI 기능을 즉시 차단하는 설정 스위치. shadow pilot 중단 기준(§4) 발동 시 사용. 스위치 on 시 모든 AI endpoint가 표준 차단 응답 | 설계 문서 리뷰 | Security Reviewer | kill switch 설계서 |

### F. 평가셋 (DEC-16)

| ID | 유형 | 통과 기준 | 검증 방법 | 담당 | 증빙 산출물 |
|---|---|---|---|---|---|
| AIRC-F1 | 기구현 검증 | 평가셋 v0(R3 산출물) 건재: 종결 Matter 비식별 계약서 20~50건이 `evaluation_cases`에 적재되어 있고 적재 스크립트 재실행 가능 | 적재 스크립트 실행 + 건수 assert | Codex + AI Lead | 적재 리포트 |
| AIRC-F2 | 준비물 검증 | **R6 Gate 서브셋 ~1,000건 적재 완료**: 카테고리 구성은 원천 15번 §5에서 발췌·합의(예시 배분 — 조항분류 400, 정의어 추출 150, 당사자 추출 100, 유사조항 검색 100, 최종본 판별 100, 이메일 쟁점 추출 100, 리스크 분류 50 — 합의로 조정 가능, 합계 ≥1,000) + 각 건에 기대 정답 라벨 | `evaluation_cases` 건수·카테고리 분포 assert 스크립트 | AI Lead | 분포 리포트 + 합의 기록 |
| AIRC-F3 | 준비물 검증 | 측정 하네스 동작: 평가셋을 소비해 retrieval recall(≥95%)·precision(≥80%)·citation accuracy(≥98%)·**permission accuracy(=100%)**·hallucination rate(≤1%)·escalation accuracy(≥95%)를 리포트로 출력(목표치는 원천 06번 §9). R6 진입 시점에는 하네스가 mock pipeline에서 end-to-end 실행됨을 확인(실측은 R6 Gate에서) | 하네스 dry-run 실행 (`pnpm test` eval-harness suite) | Codex + AI Lead | dry-run 리포트 |
| AIRC-F4 | 준비물 검증 | 비식별화 검수: 평가셋 전건을 핵심 DLP rule(주민등록번호·계좌번호·이메일/전화)로 스캔하여 실식별자 잔존 0건, 고객·상대방 실명 잔존 여부 표본 검수(≥10%) 통과 | DLP 스캔 스크립트 + 표본 수기 검수 | AI Lead + Security Reviewer | 스캔 리포트 + 검수 기록 |

### G. Gemma PoC

| ID | 유형 | 통과 기준 | 검증 방법 | 담당 | 증빙 산출물 |
|---|---|---|---|---|---|
| AIRC-G1 | 준비물 검증 | 지정 인프라(국내 리전 private 구성, DEC-01)에서 Gemma 로컬 서빙이 기동되고 헬스체크 통과. **외부 네트워크 접근 없이** 동작(모델 가중치 사전 반입) | egress 차단 환경에서 기동 + 헬스체크 + 추론 1회 | AI Lead | 기동 절차서 + 헬스체크 로그 |
| AIRC-G2 | 준비물 검증 | 역할 적합성 측정 완료: R6가 Gemma에 맡길 역할(원천 05번 §15 — Extractor, Classifier, Query Rewriter, Summarizer) 각각에 대해 평가셋 표본으로 측정치 산출·보고. 절대 기준이 아니라 **측정치 존재와 AI Lead의 "R6 진행 가능" 판단**이 통과 조건(미달 영역은 R6 범위 축소 또는 escalation 설계로 보완) | 평가 하네스 표본 실행 + 보고서 | AI Lead | PoC 평가 보고서 |
| AIRC-G3 | 준비물 검증 | 성능·용량: 대표 태스크 p95 지연, 동시 요청 처리, 메모리/GPU 사용량 측정치와 R6 운영 용량 계획(동시 사용자 가정 포함) 승인 | 부하 측정 스크립트 + 용량 계획 리뷰 | AI Lead | 성능 측정 리포트 + 용량 계획서 |
| AIRC-G4 | 준비물 검증 | 한국어 법률 텍스트 처리 점검: 국문 계약서·HWPX 추출 텍스트 fixture에서 토큰 한도·요약 품질·정의어/조항번호 보존을 점검한 보고 존재 | fixture 기반 수기+자동 점검 | AI Lead | 한국어 처리 점검 보고서 |

### H. 외부모델 차단 (DEC-11)

| ID | 유형 | 통과 기준 | 검증 방법 | 담당 | 증빙 산출물 |
|---|---|---|---|---|---|
| AIRC-H1 | 정책/설계 확정 | DEC-11 재확인 기록: R6 출시 시점 **외부모델 전면 차단(Gemma 로컬 only)**, 외부모델 개방은 승인 게이트 구축 후 R14 이후 재평가 — Decision Ledger에 R6 진입 시점 일자로 재기록 | `docs/ledger/decision.md` 기재 확인 | PM | decision ledger 항목 |
| AIRC-H2 | 정책/설계 확정 | 코드 수준 차단: external model route는 approval hook(AI-MODEROUT-RISKROUT-TUW-004) 뒤에만 존재하며 R6 구성에서 **항상 거부**. 외부 모델 API 키·엔드포인트 설정 항목 자체가 R6 배포 구성에 부재. 사양에 없는 외부 API 호출 추가는 절대 금지 목록 위반으로 즉시 중단 | 구성 파일·설정 스키마 검수 + 거부 경로 단위 테스트 설계 | Security Reviewer + Codex | 구성 검수 기록 + 테스트 설계 |
| AIRC-H3 | 준비물 검증 | 네트워크 수준 차단: AI gateway·Gemma 서빙·ingestion worker 컨테이너의 외부 egress가 차단(또는 내부 allowlist만 허용)된 인프라 구성이 존재하고, 차단 환경에서 외부 호출 시도가 실패함을 확인 | `docker compose -f infra/docker-compose.dev.yml up -d` 기반 egress 차단 구성 + 호출 시도 테스트(운영 환경 구성은 별도 검증) | Security Reviewer | egress 구성 문서 + 차단 테스트 로그 |
| AIRC-H4 | 기구현 검증 | AI external model DLP block hook(SEC-DLP-SENSDATADE-TUW-006, R5 구현) green: 외부 전송 경로에 DLP 차단이 걸려 있어 향후 개방 시에도 민감자료가 기본 차단됨(원천 08번 §8 모델별 전송 정책의 집행 지점) | `pnpm test:integration` (dlp-ai-block suite) green | Codex + Security Reviewer | 테스트 리포트 |
| AIRC-H5 | 정책/설계 확정 | 차단 시도 가시성: 외부모델 호출 시도(코드 경로 도달)가 차단과 동시에 audit event로 기록되는 설계 — shadow pilot 중단 기준(§4) "외부모델 호출 시도 탐지"의 탐지 수단 | 설계 문서 리뷰 | Security Reviewer | 설계서 |

## 3. 판정 절차

1. Codex가 자동 검증 항목을 일괄 실행하고 증빙을 생성한다(명령: §0-4 표준 세트).
2. Security Reviewer·AI Lead가 각 담당 영역의 사람 리뷰 항목을 승인한다(서면, ledger 기록).
3. PM이 27개 항목 전체 pass를 확인하고 `docs/ledger/decision.md`에 판정을 기록한다 — 기록 양식: 일자 / 판정(PASS·FAIL) / 항목별 증빙 링크 / fail 시 사유와 재판정 조건.
4. FAIL 항목이 있으면 R6 PACK 착수 금지. 보완 후 **전 항목 재판정**(변경 영향 항목만의 부분 재판정은 Security Reviewer 승인 시 허용).

## 4. Shadow Pilot 운영 계획 (DEC-18)

R6 기능 구현·AI Governance Gate 사전 점검 통과 후, **정식 공개 전** shadow pilot을 운영한다. pilot 종료 보고서는 R6 Gate 판정과 MVP 선언(30번 §3)의 필수 첨부물이다.

### 4.1 기간·대상

| 항목 | 값 |
|---|---|
| 기간 | **2~4주**: 최소 2주 운영, 중단 기준 미발동 + 측정 지표 충족 시 4주 이내 종료 판정 가능. 중대 결함 수정 시 수정일로부터 최소 1주 재관찰 |
| 대상 사용자 | **내부 변호사 한정**(External User 금지, 고객 노출 금지). 권장 5~15명, Matter Owner·Matter Member·Limited Reviewer role이 모두 포함되도록 구성 |
| 대상 자료 | Matter Owner가 pilot 사용을 승인한 matter만. `ai_allowed=false` 문서·wall 격리 matter를 **의도적으로 포함**시켜 차단 동작을 실사용 중 관찰 |
| 운영 모드 | shadow: AI 결과는 pilot 참가자 화면에만 노출, 정식 워크플로(문서 발송·대외 결과물)에 사용 금지 안내. 참가자는 결과물 검증 의무를 고지받음 |

### 4.2 측정 지표 (주 1회 집계, feedback store + audit 기반)

| 지표 | 기준 | 출처 |
|---|---|---|
| Permission accuracy | **100% (위반 0건)** — 권한 밖 자료가 답변·인용·snippet·메타데이터 어디에도 노출되지 않음 | audit + 참가자 신고 + 주간 표본 점검 |
| Citation accuracy | ≥98% (표본 검수) | 평가 하네스 + 수기 표본 |
| Hallucination rate | ≤1% (citation 불가 주장 비율로 근사 측정) | citation warning 집계 |
| AI audit coverage | 5종 이벤트 누락 0 | audit 대사(對査): AISession 수 vs audit event 수 |
| 외부모델 호출 시도 | 0건 | gateway·egress 로그 (AIRC-H5) |
| 응답 지연 | p95 목표치(AIRC-G3 용량 계획 수치) 이내 | metrics |
| 사용자 평가 | 태스크별 유용성 평점·수정률 (feedback store) | feedback store |
| Escalation 동작 | 고위험 질의의 escalation flag 정상 발동 표본 확인 | audit + 표본 |

### 4.3 중단 기준 (하나라도 발생 시 **즉시 전면 중단** — kill switch AIRC-E4)

1. **권한 위반 1건**: 권한·wall·aiAllowed 밖 자료의 본문·제목·snippet·메타데이터가 AI 경로로 노출.
2. **외부모델 호출 시도 1건** 탐지(차단 성공 여부 무관).
3. AI audit 누락 발견(AISession 대비 이벤트 결손).
4. 로그·audit에 문서 본문·프롬프트 원문 등 민감 원문 기록 발견(불변 원칙 7 위반).
5. citation 불가 주장 비율이 주간 10%를 초과(품질 붕괴 신호).
6. 참가자에 의한 중대 오답의 대외 사용 사고.

중단 절차: kill switch on → 24시간 내 사고 기록(`docs/ledger/execution.md`, 참조 ID 수준) → 원인 분석·수정 → Security Reviewer 승인 후 재개. 사유 1·2·4로 중단된 경우 재개 전 본 체크리스트 해당 영역(A·D·H) **재판정 필수**, 재개 후 pilot 시계는 리셋(최소 2주 재관찰).

### 4.4 종료 판정

PM·AI Lead·Security Reviewer가 종료 보고서(기간, 참가자 수, 지표 집계, 사고 0건 확인, 개선 backlog)를 승인하면 pilot 종료. 이 보고서가 AI Governance Gate 체크리스트(50번)의 입력이 된다.

## 5. Degraded Mode 규칙 — graph_facts / rule_findings

R6의 Evidence Pack은 원천 06번 §5 스키마를 승계하되, 의존 계층이 미구축인 두 필드를 **degraded mode**로 출시한다. 이는 결함이 아니라 의도된 단계 출시다(30번 §2 R6).

### 5.1 규칙

| 필드 | 상태 | 해제 시점 |
|---|---|---|
| `graph_facts` | R7 Knowledge Graph Gate 전까지 **항상 empty(`[]`)** | R7 Gate 통과 후 활성화 + AI 회귀 재실행 |
| `rule_findings` | R8 Contract Intelligence Gate 전까지 **항상 empty(`[]`)** | R8 Gate 통과 후 활성화 + AI 회귀 재실행 |

### 5.2 집행 요건 (R6 구현·검증에 반영)

1. **스키마는 R6부터 두 필드를 포함**한다(추후 스키마 변경 없이 활성화만 하도록). 기본값 empty array, null 금지.
2. **빈 필드를 채우기 위한 임시 구현 금지**: RDB 조인으로 graph 흉내, 하드코딩 규칙으로 rule_findings 생성 등은 금지. Neo4j/GraphSync는 R7 전 절대 금지 목록, playbook/rule store는 R8 소관.
3. Evidence Pack builder와 프롬프트 템플릿은 두 필드가 empty인 상태를 **정상 입력**으로 처리해야 한다(오류·재시도·환각 유도 금지). 템플릿은 "그래프 관계·룰엔진 검증은 본 버전에서 제공되지 않음"을 전제로 작성한다.
4. AI 답변·citation은 두 필드를 근거로 인용할 수 없다(empty이므로 자연 충족 — 회귀 테스트로 고정: `graph_facts`/`rule_findings` 유래 citation 0건 assert).
5. 평가셋 측정(AIRC-F3)과 shadow pilot 지표(§4.2)는 **degraded 구성 기준**으로 측정한다. R7·R8 활성화 시 동일 하네스로 재측정하여 회귀를 확인한다.
6. 질문 유형 중 graph/rule 의존 유형(원천 06번 §8 — 권리 전이, 조항 충돌, 협상패턴 등)은 R6에서 "지원 범위 밖" 표준 응답 또는 escalation으로 처리하는 분기를 question type classifier에 포함한다.

### 5.3 해제 절차

R7(또는 R8) Gate 통과 → 필드 활성화 PR(Risk=C, 사람 리뷰 필수) → AI 회귀 suite + 평가셋 재측정 green → `docs/ledger/decision.md`에 활성화 기록. 활성화 후에도 해당 필드의 내용은 권한 필터(AIRC-A3)와 provenance 요건(AIRC-B1)을 동일하게 충족해야 한다.
