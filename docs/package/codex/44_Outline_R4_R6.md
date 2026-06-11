# 44. Outline — R4 · R5 · R6 모듈 단위 개요

버전: 1.0 | 작성일: 2026-06-11 | 상태: **Normative(개요 수준)** — R4~R6의 범위·진입조건·Gate 기준·TUW 그룹 구성의 기준 문서. 00_Master_Brief.md와 충돌 시 00번이 우선한다. TUW 단위 상세 명세(목표 1문장, Files, Verification AND 목록, Edge cases, Stop condition)는 본 문서가 아니라 **상세 TUW화 산출물**(§0-3)이 담는다.

독자: PM(범위 합의), Codex(상세 TUW화 수행·release 경계 확인)

## 0. 적용 규칙

1. 본 문서의 TUW ID는 원천 13번 백로그(P4·P5·P6·P7·P8)의 canonical ID를 그대로 승계한다 [보정 C-10]. "신설 후보"로 표기된 그룹은 원천 백로그에 없어 본 패키지가 신설하는 TUW이며, ID는 00번 §6.2 규칙(동일 패턴, 모듈명 신규 정의, 패키지 전체 유일)으로 상세 TUW화 시 확정한다.
2. 모든 TUW에 00번 §2 불변 원칙 7개, §6.1 필수 필드, §6.3 Verification **AND 의미론** [보정 C-8], §6.4 Stop condition이 적용된다.
3. **상세 TUW화 시점: 직전 release Gate 통과 직후.**
   - R4 상세 TUW 백로그: **R3 Permission-bound Search Gate 통과 후** 작성(본 문서 §1을 1:1 확장, 40~43번과 동일 형식).
   - R5 상세 TUW 백로그: **R4 Email Vault Gate 통과 후** 작성(§2 확장).
   - R6 상세 TUW 백로그: **R5 Security & Governance Gate 통과 후** 작성(§3 확장). 단, R6는 추가로 **31번 AI Readiness Checklist 전 항목 통과 전 PACK 착수 금지**.
   - 상세 TUW화는 문서 작업이므로 Gate 통과 직후 즉시 수행 가능하나, 구현 PACK 착수는 진입조건 전체 충족 후에만 가능하다.
4. 상세 TUW화 시 백로그 CSV(`tools/backlog`)에 추가하고 DAG·release 규칙 검증(AI<R6 금지, 벡터<R6 금지, 외부공유<R11 금지 등)을 통과시켜야 한다.
5. 검증 명령은 표준 세트를 사용한다: `pnpm install` / `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` / `docker compose -f infra/docker-compose.dev.yml up -d` / `pnpm db:migrate` / `pnpm db:rollback` / `pnpm test:integration`.

---

## 1. R4 — Email Vault v1 [보정 C-9: 원천 "Email Vault MVP"에서 개칭]

### 1.1 목표

이메일(EML/MSG)을 Matter의 1급 레코드로 수용한다: 파싱·원본 보존·중복 차단, 첨부의 Document 파이프라인 연결, 수동 filing+추천, thread·timeline. 모든 경로는 R1~R3에서 동결된 권한 모델과 R2 문서 파이프라인을 재사용하며 우회 구현을 금지한다.

### 1.2 진입조건

1. R3 Permission-bound Search Gate 통과 (30번 §2 R3).
2. **[보정 C-4] 핵심 DLP rule 선행 완료** — 아래 P4 DLP 선행 그룹 4건이 R4 본 PACK 착수 전에 완료·green이어야 한다. 이 4건은 "R4 진입 선행 PACK"으로 R3 Gate 직후 실행한다:

| TUW ID | 내용 | Risk |
|---|---|---|
| SEC-DLP-SENSDATADE-TUW-001 | 주민등록번호 탐지 rule | C |
| SEC-DLP-SENSDATADE-TUW-002 | 계좌번호 탐지 rule | C |
| SEC-DLP-SENSDATADE-TUW-003 | 이메일/전화번호 탐지 rule | C |
| SEC-DLP-SENSDATADE-TUW-004 | DLP finding schema (`tenant_id NOT NULL`+RLS) | C |

3. Permission Model Freeze 유지(변경 필요 발견 시 stop condition → escalation) [보정 C-1].

### 1.3 모듈·TUW 그룹 (원천 13번 P7 기반, 24 TUW + 신설 후보)

| 모듈 | TUW ID | 내용 | Risk | 핵심 의존 |
|---|---|---|---|---|
| Email Ingestion / Parser | EMAIL-EMAIINGE-PARS-TUW-001~005 | EmailMessage schema(`tenant_id`+RLS) / EML parser adapter(workers/ingestion) / MSG parser skeleton / raw email 원본 보존(immutable, tenant prefix) / messageId 중복 차단 | H | 001→R2 storage adapter, Freeze |
| Email Metadata / Normalizer | EMAIL-EMAIMETA-NORM-TUW-001~005 | header extractor / participant normalize / sent·received date normalize / external participant flag / email metadata audit 연결 | M~H | 001→PARS-001 |
| Attachment Handling / Attachment Linker | EMAIL-ATTAHAND-ATTALINK-TUW-001~005 | attachment metadata extractor / attachment FileObject 생성 / **첨부를 Document로 저장(R2 upload·hash·version 파이프라인 재사용, 우회 금지)** / email–document link / 중복 hash 처리 | H | 003→R2 DOC-DOCUUPLO·HASHDUPL |
| Matter Filing / Filing Engine | EMAIL-MATTFILI-FILIENGI-TUW-001~005 | manual filing API(**canUploadToMatter 권한 검사 필수**) / subject 기반 matter 추천 / participant domain 기반 추천 / email filing audit / email timeline item 생성 | H | 001→SEC-MATTPERM-ACCECONT-TUW-003 |
| Email Security / Email DLP | EMAIL-EMAISECU-EMAIDLP-TUW-001~004 | external recipient 표시·경고(수집된 이메일의 외부 참여자 표시 — **외부 발송·공유 기능 아님**, 불변 원칙 6) / **attachment DLP scan hook(선행 DLP rule 4종 연결)** [보정 C-4] / privilege tag suggestion / wrong matter filing warning skeleton | H | 002→DLP 선행 PACK |

신설 TUW 후보(상세 TUW화 시 ID 확정):
- **Email thread builder** (예: `EMAIL-EMAITHRE-THREAD-TUW-00x`): Message-ID/In-Reply-To/References 기반 thread 구성·thread view. 원천 P7에 명시 TUW가 없으나 00번 §8 R4 범위("thread")에 포함.
- **Email upload endpoint** (`/v1` 규약, DEC-14): EML/MSG 파일 업로드 API + 권한·확장자·크기 검증(R2 upload 검증 패턴 재사용).
- **HWP 5.0 바이너리 추출 트랙 시작** (DEC-10, R4~R6 별도 트랙): HWP 5.0 포맷 조사·추출 spike. 실패해도 R4 Gate를 막지 않는 비차단 트랙.

### 1.4 Gate 기준 — Email Vault Gate (체크리스트 전문은 50번에 통합)

AND 조건 [보정 C-8]:
1. 첨부 분리→Document 연결 무결성: 첨부 hash와 Document hash 일치, email–document link 양방향 조회.
2. 권한: 비멤버의 email·첨부·timeline 접근 차단(negative test), filing은 canUploadToMatter 통과자만.
3. audit: filing·열람·다운로드 100% 기록, 본문 미기록(참조 ID/hash만).
4. messageId 중복 차단 동작, raw 원본 불변(덮어쓰기 불가).
5. 첨부 DLP scan 결과가 DLP finding으로 기록되고 조회 가능 [보정 C-4].
6. 검색 연동: filed email·첨부가 R3 권한 필터를 그대로 통과(권한 밖 미노출 회귀).
7. cross-tenant 차단·기존 회귀 suite 전체 green (`pnpm test:integration`).

### 1.5 상세 TUW화 시점

R3 Gate 통과 직후. 산출물: R4 상세 TUW 백로그 문서(40~43번 형식) + CSV 갱신 + 60번 PACK 순서 갱신.

---

## 2. R5 — Security & Governance

### 2.1 목표

R6 AI 진입이 가능한 수준으로 권한·보안 거버넌스를 완성한다: ABAC 일반화, DLP 전체, break-glass dual approval, 외부공유 **정책 정의**(시행 금지), Audit Console, wall 관리 UI. R5의 산출물 다수가 31번 체크리스트(AIRC-A2·E·H4)의 선행물이다.

### 2.2 진입조건

1. R4 Email Vault Gate 통과.
2. Permission Model Freeze 유지. ABAC 일반화가 Freeze 대상(role matrix·canRead* 시그니처)을 변경하는 경우 **Freeze 개정 절차**(Decision Ledger 등재 + 기존 매트릭스 하네스 결과 불변 증명)를 선행 [보정 C-1].

### 2.3 모듈·TUW 그룹 (원천 13번 P4·P5 기반 + 신설)

| 모듈 | TUW ID | 내용 | Risk | 핵심 의존 |
|---|---|---|---|---|
| DLP / Sensitive Data Detector 잔여 | SEC-DLP-SENSDATADE-TUW-005~006 | external sharing DLP warning(**정책·테이블만 — 외부공유 시행 자체는 R11**) / **AI external model DLP block hook(R6 AIRC-H4의 선행물)** | C | →R4 선행 PACK(001~004) |
| Ethical Wall 잔류분 [보정 C-2] | SEC-ETHIWALL-WALLENFO-TUW-004, 007 | wall enforcement in document access 명시 검증·고도화(R2~R3에서 PermissionService 경유로 충족된 부분의 전용 negative suite 확정) / break-glass workflow — **skeleton이 아니라 dual approval 포함 완성** | C | →R1 WALLENFO-001~003, R3 WALLENFO-005 |
| Break-glass 테이블 신설 | 신설 후보 (예: `SEC-BREAKGLAS-DUALAPPR-TUW-00x`) | break-glass request/approval 테이블(`tenant_id`+RLS, 신청자≠승인자 강제) / 이중 승인 API / 전량 audit(ETHICAL_WALL_APPLIED 계열) / 만료·회수 | C | →WALLENFO-007 |
| ABAC 일반화 (DEC-15) | 신설 후보 (예: `SEC-ABAC-ATTRPOLI-TUW-00x`) | 속성 기반 평가(practice_group 외 속성 확장) / `permissions.condition_json` 평가기(**해석 불가 시 거부** — 00번 §5-4) / 기존 RBAC 매트릭스 회귀 불변 증명 / priority·valid_from·valid_to 적용 | C | →R1 Freeze, 21번 평가 계약 |
| Audit Console | AUDIT-AUDICONS-CONS-TUW-001~005 | audit search API / actor·action·date filter / target resource filter / CSV export / Console UI — **Console 자체 권한 enforcement(Firm Admin·Security Admin만, 00번 §8)** + export 행위 audit | C·H | →R1 AUDILOGG, RBAC |
| 외부공유 정책 (정의만) | 신설 후보 (예: `SEC-EXTPOLICY-DEFIONLY-TUW-00x`) | 외부공유 정책 문서·정책 테이블 정의(DLP warning 연동 지점 포함). **endpoint·link 발급·external user 흐름 일체 금지** — P13 TUW 사용 금지(R11 소관, 불변 원칙 6) | H | →DLP-005 |
| Wall 관리 UI | 신설 후보 (예: `SEC-ETHIWALL-WALLADMIUI-TUW-00x`) | wall 목록·생성·membership 관리 화면(Security Admin 전용) / 변경 전량 audit | H | →WALLENFO-003 |

비고: WALLENFO-004의 배치는 원천 13번이 R5(P4 일괄)로 두었고 00번 §7 R0~R3 인벤토리에 미포함이므로 R5에 배치한다. 상세 TUW화 시 R2~R3 기존 테스트와의 중복 범위를 명시하고 차분(전용 negative suite·고도화)만 TUW로 정의할 것.

### 2.4 Gate 기준 — Security & Governance Gate

AND 조건:
1. ABAC: 속성 조건 케이스 통과 + 기존 role 7종 매트릭스 하네스 결과 **불변**(회귀 0) + condition_json 해석 불가 시 거부(fail-closed 주입 테스트).
2. break-glass: 이중 승인 없는 wall 우회 0(negative), 신청자=승인자 차단, 전량 audit.
3. DLP: rule 전체(주민/계좌/이메일·전화 + finding schema + warning·block hook)가 fixture로 통과, AI external model block hook 동작.
4. Audit Console: 비인가 role의 조회·export 차단, export 행위 자체가 audit됨.
5. 외부공유: **시행 코드 부재 확인**(P13 endpoint·link 발급 경로 없음 — 코드 스캔+테스트), 정책 문서 승인.
6. 전체 회귀 green + cross-tenant 차단 유지.

### 2.5 상세 TUW화 시점

R4 Gate 통과 직후. 신설 그룹(ABAC·break-glass·외부공유 정책·wall UI)의 ID 확정과 CSV 등재 포함.

---

## 3. R6 — AI Knowledge Layer v1 = MVP

### 3.1 목표

권한연동 RAG(Permission-before-AI)와 citation 기반 근거제시를 갖춘 Gemma 로컬 AI v1을 출시하고, AI Governance Gate 통과로 **MVP를 확정**한다(DEC-17). 외부모델은 전면 차단(DEC-11), 정식 공개 전 shadow pilot 2~4주(DEC-18, 31번 §4).

### 3.2 진입조건

1. R5 Security & Governance Gate 통과.
2. **31번 AI Readiness Checklist 전 항목(AIRC-A1~H5) 통과** — 평가셋 서브셋 ~1,000건(DEC-16), Gemma PoC, 외부모델 차단 확정 포함. 1개라도 fail이면 PACK 착수 금지.

### 3.3 모듈·TUW 그룹 (원천 13번 P8 전체 + P6 이관분 [보정 C-5] + P5 AI audit + P4 연계, 48 TUW + 신설)

| 모듈 | TUW ID | 내용 | Risk | 핵심 의존 |
|---|---|---|---|---|
| AI Policy / Policy Evaluator | AI-AIPOLI-POLIEVAL-TUW-001~005 | Matter.aiPolicy enum / Document.aiAllowed field / **AI policy evaluator(평가 로직 — default DENY)** / AI blocked 표준 응답 / model access policy table 평가 연결. ※ 001~002는 R2 AI-AIPOLI-SCHEMAONLY-TUW-001과 중복되므로 상세 TUW화 시 "스키마 재생성 금지, 평가 로직·API 노출"로 재정의 | C | →R2 스키마 [보정 C-7], AIRC-E3 |
| Chunk Store / Chunk Evidence | AI-AICONT-CHUNEVID-TUW-001~002 | parent-child chunk builder(조항·항·호·정의어·이메일 단위, 원천 05번 §7) / chunk provenance schema(AIRC-B1 계약 구현) | C | →R2~R4 추출 파이프라인 |
| Vector / Semantic Search **[보정 C-5: R3에서 이동]** | SEARCH-SEMASEAR-VECT-TUW-001~005 | embedding job(pgvector, DEC-05) / vector index 테이블(`embeddings`, `tenant_id`+RLS) / similarity search API / hybrid score combiner(BM25+vector) / **semantic result permission filter(쿼리 단계 주입 + AIRC-B3 동기화 계약 구현)** | H | →CHUNEVID-001~002, AIRC-B3 |
| Retrieval Orchestrator | AI-AIRETR-RETRORCH-TUW-001~006 | question type classifier(**graph/rule 의존 유형은 "지원 범위 밖"·escalation 분기 — degraded mode**, 31번 §5.2-6) / metadata filter builder / hybrid retrieval orchestrator / **permission-bound retrieval filter(AIRC-A3 5단계 계약 구현)** / redaction preprocessor hook / reranker interface | C | →VECT-004, SEC-ETHIWALL-WALLENFO-TUW-006 |
| Ethical Wall in AI | SEC-ETHIWALL-WALLENFO-TUW-006 | **wall enforcement in AI retrieval** — RETRORCH-004와 통합 검증(R3 PERMFILT-003 패턴 재사용) | C | →R5 wall 고도화 |
| Evidence Pack | AI-AICONT-CHUNEVID-TUW-003~006 | context ranker / context window manager / **Evidence Pack schema(graph_facts·rule_findings 필드 포함하되 R7/R8 전 항상 empty — degraded mode, 31번 §5)** / Evidence Pack builder(leakage 제거 단계 포함) | C | →RETRORCH-004 |
| Citation | AI-CITA-CITAMAPP-TUW-001~005 | citation object schema / chunk-to-source mapper / citedDocumentIds 저장 / source panel API / citation verification warning(무근거 주장 표시·법률판단 escalation — AIRC-C2) | C | →CHUNEVID-005 |
| AI Session | AI-AISESS-SESSLOGG-TUW-001~005 | AISession schema(AIRC-D3) / prompt hash / response hash / retrieved chunk log / session detail API(본인+권한자만) | C | →AUDIT 인프라 |
| AI Audit (P5) | AUDIT-AIAUDI-AIEVEN-TUW-001~005 | AI_QUERY_SUBMITTED / AI_RETRIEVAL / AI_RESPONSE / cited document log / excluded retrieval count — **5종 누락 시 행위 미완료 간주**(불변 원칙 3, AIRC-D1) | C | →SESSLOGG-001, R1 AUDILOGG |
| Model Routing / Gateway | AI-MODEROUT-RISKROUT-TUW-001~005 | model tier enum / task risk classifier / **local Gemma route(R6 유일 유효 route)** / external model approval hook(**항상 거부 + 시도 audit**, AIRC-H2·H5) / escalation flag | C | →AIRC-E 전체, SEC-DLP-SENSDATADE-TUW-006(R5) |
| AI Features / Summaries | AI-AIFEAT-SUMM-TUW-001~005 | document summary / matter summary / email thread summary / clause analysis template / risk extraction template — 전부 Evidence Pack 경유, **graph·rule 부재 전제 템플릿**(degraded mode) | H | →CHUNEVID-006, CITAMAPP-005 |
| Feedback Store | 신설 후보 (예: `AI-FEEDSTOR-FEEDCAPT-TUW-00x`) | feedback_items 적재(평점·수정·오류유형, `tenant_id`+RLS) / shadow pilot 지표 집계 쿼리(31번 §4.2) / 평가 하네스 연동 | H | →SESSLOGG-005 |
| 평가 하네스 연동 | 신설 후보 (예: `DEVOPS-EVALHARN-GATEMEAS-TUW-00x`) | AIRC-F3 하네스를 실 파이프라인에 연결, Gate 지표 리포트(recall·precision·citation·permission 100%·hallucination) 자동 산출 | H | →RETRORCH 전체, 평가셋(AIRC-F2) |

Degraded mode 요약(상세: 31번 §5): `graph_facts`(R7 전)·`rule_findings`(R8 전)는 **항상 empty 허용이 아니라 항상 empty 강제**. 채우기 위한 임시 graph/rule 구현은 절대 금지 목록 위반. builder·템플릿·평가는 empty를 정상 입력으로 처리.

### 3.4 Gate 기준 — AI Governance Gate (= MVP cut line, DEC-17)

AND 조건 (전문은 50번 + 31번):
1. **Permission accuracy 100%**: 권한·wall·aiAllowed 밖 자료가 답변·인용·snippet·메타데이터 어디에도 미노출(negative suite + 평가셋 측정 + pilot 기간 위반 0).
2. Citation accuracy ≥98%, hallucination ≤1%, retrieval recall ≥95%·precision ≥80% — 평가셋 서브셋(~1,000건) 측정, degraded 구성 기준.
3. AI audit 5종 누락 0 (AISession 대사), audit_events append-only 유지, prompt/response 원문 미기록(hash만).
4. 외부모델 호출 0 + 차단 증명(코드·네트워크·DLP hook 3중, AIRC-H 재확인).
5. fail-closed: ai_policy 해석 불가·권한 서비스 오류 주입 시 차단.
6. degraded mode 준수: graph_facts·rule_findings 유래 citation 0건 assert, 임시 구현 부재 코드 리뷰.
7. **Shadow pilot 종료 보고서 승인**(2~4주, 중단 기준 미발동, 31번 §4.4).
8. 전체 회귀 green(`pnpm test:integration` 포함), cross-tenant 차단 유지.

통과 시: PM이 **MVP 선언**을 `docs/ledger/decision.md`에 기록(30번 §3). MVP 제외 항목(외부공유·VDR·Closing Binder·보존자동화·SSO)이 범위에 없음을 함께 확인.

### 3.5 상세 TUW화 시점

R5 Gate 통과 직후 문서 작업 시작 가능. 단 **구현 PACK 착수는 31번 전 항목 통과 후**. 신설 그룹(feedback store·평가 하네스 연동·필요 시 redaction 확장)의 ID 확정과 CSV 등재, 60번 PACK 순서(Risk=C 다수이므로 사람 리뷰 게이트 배치) 갱신 포함.

---

## 4. R4~R6 공통 비고

1. **release 경계 집행**: R4~R5 기간 중 AI·벡터 관련 코드는 `packages/ai` 인터페이스 placeholder 외 일체 금지(절대 금지 목록). backlog validator(`tools/backlog`)가 release 규칙 위반을 CI에서 차단한다.
2. **Risk=C TUW**는 Codex 단독 머지 금지 — 사람(또는 상위 검토 에이전트) 리뷰 게이트 필수(00번 §6.3). R5·R6는 C 비중이 높으므로 PACK 구성 시 리뷰 부하를 고려해 3~5 TUW 단위로 묶는다.
3. **HWP 5.0 트랙**(DEC-10): R4~R6에 걸친 비차단 별도 트랙. 어떤 release Gate의 차단 조건도 아니며, 성과는 R6 Gate 시점에 ADR로 정리한다.
4. 원천 14번(Agent Work Contracts)의 샘플 Work ID는 사용하지 않는다 — 본 문서·상세 백로그의 canonical ID가 기준 [보정 C-10].
