# 30. Release Roadmap — R0~R14 보정판

버전: 1.0 | 작성일: 2026-06-11 | 상태: **Normative** — 원천 `../vault_dev_package/docs/16_Roadmap_Release_Plan.md`를 대체한다. 본 문서와 `00_Master_Brief.md`가 충돌하면 00번이 우선한다.

독자: PM(Gate 운영·release 판정), Codex(release 경계·착수 조건 확인)

## 0. 적용 규칙

1. release 구분·명칭·Gate 명칭·진입조건의 기준은 **본 문서**다. 원천 16번 및 원천 DOCX(`Law_Firm_Vault_System_장기개발_사양명세서.docx`)의 Phase 0~8 구분과 충돌하면 본 문서가 우선한다. Phase 매핑은 부록 A.
2. Gate는 PACK 단위가 아니라 **release 단위 체크리스트**로 운영한다(체크리스트 전문: 50번). **Gate 통과 전 다음 release의 PACK 착수 금지**(00번 §9-4). 단, "상세 TUW화(문서 작업)"는 직전 Gate 통과 직후 수행한다(44번 §0).
3. R0~R3 TUW 인벤토리는 00번 §7이 normative이고 40~43번이 1:1 확장한다. R4~R6 모듈 개요는 44번, R6 진입조건 전문은 31번이 정의한다. R7~R14의 TUW 상세화는 각 직전 Gate 통과 후 수행한다.
4. 모든 release에 00번 §2 **불변 원칙 7개**와 **절대 금지 목록**이 적용된다. 특히 release 경계와 직결되는 금지: AI 기능 R6 전 금지, 벡터/의미검색 R6 전 금지, Neo4j/GraphSync R7 전 금지, 외부 공유 일체 R11 전 금지, hard delete는 legal hold 인터페이스(R2)+Records(R12) 전 금지.
5. Gate 검증은 표준 명령 세트를 사용한다: `pnpm install` / `pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm build` / `docker compose -f infra/docker-compose.dev.yml up -d` / `pnpm db:migrate` / `pnpm db:rollback` / `pnpm test:integration`.
6. 보정사항 [보정 C-1]~[보정 C-10]의 근거는 00번 §3. 본 문서에서는 반영 지점에 표기만 한다.

## 1. Release Train (보정판)

| Release | 명칭 (보정판) | 목적 | Pillars | 주요 보정 |
|---|---|---|---|---|
| R0 | Foundation | repo·CI/CD·DB·tenant 격리·fail-closed·audit append-only 골격 | P0, P1 | — |
| R1 | Matter Core + Permission + Audit | Client/Matter/Party/팀, role 7종, 권한 함수, wall schema, **Permission Model Freeze** | P2, P4, P5 | [보정 C-1] [보정 C-2] |
| R2 | **Document Vault Core** | upload·version·hash·metadata·추출·preview·document audit·legal hold 인터페이스 | P3, P4, P5 | [보정 C-3] [보정 C-7] [보정 C-9] |
| R3 | **Permission-bound Search v1** | PG FTS 기반 권한연동 검색, wall filter, 평가셋 v0 | P6, P4, P5 | [보정 C-5] [보정 C-9] |
| R4 | **Email Vault v1** | EML/MSG 파싱, 첨부→Document, filing+추천, thread, timeline | P7, P3, P5 (+P4 DLP 선행) | [보정 C-4] [보정 C-9] |
| R5 | Security & Governance | ABAC, DLP 전체, break-glass dual approval, 외부공유 **정책만**, Audit Console, wall 관리 UI | P4, P5 | [보정 C-2 잔류분] |
| R6 | AI Knowledge Layer v1 **= MVP** | chunk store, hybrid retrieval(BM25+vector), Evidence Pack, citation, AI audit 5종, Gemma 로컬, feedback store, shadow pilot | P8, P6, P4, P5 | [보정 C-5] (DEC-17, DEC-18) |
| R7 | Knowledge Graph v1 | graph schema·mapping·sync·query (Neo4j 도입 허용 시점) | P9, P3, P8 | — |
| R8 | Contract Intelligence | clause extraction, redline parser, playbook, rule store | P10, P9, P8 | — |
| R9 | DD Vault | RFI, **내부 전용** data room mapping, DD issue, risk register | P11 (+P13 내부 한정) | [보정 C-6] |
| R10 | Litigation Vault | evidence, fact ledger, issue tree, pleading 관리 | P12 | — |
| R11 | External Portal / VDR | external workspace, secure link, watermark, Q&A — 외부 공유 **최초 시행 시점** | P13, P4, P5 | — |
| R12 | Records Management | retention, legal hold 전체, archive, disposal workflow | P14, P5 | — |
| R13 | Enterprise Hardening | SSO/SAML, BYOK, SIEM, backup/DR, compliance readiness | P16, P15 | — |
| R14 | Scale & Optimization | performance, cost, eval 고도화, advanced AI(외부모델 단계 개방 재평가), migration tooling | P15, P16 | — |

Gate 명칭 전체 목록:

| Release | Gate 명칭 | 비고 |
|---|---|---|
| R0 | Foundation Completion Gate | |
| R1 | Matter Core Gate | Gate 산출물에 Permission Model Freeze 포함 [보정 C-1] |
| R2 | **Document Vault Gate** | 원천 "Document Vault MVP Gate"에서 개칭 [보정 C-9] |
| R3 | Permission-bound Search Gate | |
| R4 | **Email Vault Gate** | release 명칭만 개칭(Email Vault v1) [보정 C-9] |
| R5 | Security & Governance Gate | |
| R6 | **AI Governance Gate** | **= MVP cut line (DEC-17)** |
| R7 | Knowledge Graph Gate | |
| R8 | Contract Intelligence Gate | |
| R9 | DD Vault Gate | |
| R10 | Litigation Vault Gate | |
| R11 | External Sharing Critical Gate | 불변 원칙 6 해제 게이트 |
| R12 | Records Governance Gate | hard delete 금지 해제 게이트 |
| R13 | Enterprise SaaS Readiness Gate | |
| R14 | Scale & Learning Gate | |

## 2. Release별 상세

각 항목: 목표 / 범위 / Gate 명칭·기준 요약 / 진입조건 / 산출물. R0~R3의 TUW 단위 상세는 40~43번, R4~R6 모듈 개요는 44번.

### R0 — Foundation (35 TUW)

- **목표**: 신규 repo `amic-vault`에서 재현 가능한 빌드·테스트 골격과 보안 기반 3종(tenant 격리, fail-closed, audit append-only)을 완성한다.
- **범위**: pnpm 모노레포(turborepo) skeleton, CI(lint·typecheck·test·build), 초기 schema(`tenants`,`users`,`audit_events`)+seed, tenant context middleware+RLS convention, auth skeleton(세션+MFA flag, DEC-09), fail-closed guard+표준 error code 9종, audit_events **append-only constraint**(UPDATE·DELETE REVOKE+trigger), observability(logger·correlation id·health·metrics), Next.js app shell, vault_dev_package→`docs/package` 이관+ADR-001~012, 백로그 검증 스크립트(`tools/backlog`, AI<R6 금지 등 release 규칙 검증).
- **Gate**: Foundation Completion Gate — 신규 클론 재현(install→build→test green) / cross-tenant 전 endpoint 차단 / audit UPDATE·DELETE DB 계층 실패 / fail-closed 오류 주입 동작 증명 / ADR 승인.
- **진입조건**: 없음(PACK-R0-01이 시작점). 선행: repo 신규 생성, 본 패키지 인수.
- **산출물**: 동작하는 skeleton 일식, `docs/package` normative 이관본, ADR-001~012, backlog validator CI job, RLS convention 문서·마이그레이션 템플릿.

### R1 — Matter Core + Permission + Audit (52 TUW)

- **목표**: Matter 중심 도메인(Client/Matter/Party/팀/상태머신)과 권한 모델(role 7종, canRead* 함수군, ethical wall schema)을 완성하고 **권한 모델을 동결(Freeze)** 한다.
- **범위**: audit logger service+metadata normalizer, Client/Matter/Party/Matter team CRUD, Matter 8상태 상태머신(`packages/domain`), role 7종+permission matrix(DEC-15), canReadMatter/canEditMatter/canUploadToMatter+fail-closed wrapper, 권한 매트릭스 테스트 하네스(role 7 × action × wall 상태), PERMISSION_CHANGED/ACCESS_DENIED audit.
- **[보정 C-2]** EthicalWall schema·wall membership schema·wall create API를 R1에 배치한다(원천은 R5). search enforcement는 R3, break-glass·고도화만 R5 잔류.
- **[보정 C-1]** **Permission Model Freeze 마일스톤을 R1 종료에 신설**: role matrix·canRead* 시그니처·wall schema·검색 filter 주입 지점을 동결하고 Decision Ledger에 등재. **Freeze 승인 전 R2·R3 착수 금지.**
- **Gate**: Matter Core Gate — 권한 매트릭스 하네스 100% / cross-tenant 차단 / matter·member·permission 행위 audit coverage 100% / fail-closed 오류 주입 통과 / **Freeze 문서 승인**.
- **진입조건**: R0 Foundation Completion Gate 통과.
- **산출물**: Freeze 문서(`docs/ledger/decision.md` 등재), 권한 매트릭스 하네스+CI gate, wall schema·membership·create API.

### R2 — Document Vault Core (59 TUW) [보정 C-9]

- **명칭**: 원천 "Document Vault MVP" → **Document Vault Core**. MVP 정의는 DEC-17에 따라 R6 단일 기준으로 통일한다. [보정 C-9]
- **목표**: 원본 불변(Immutable original) 원칙 위에서 업로드→버전→추출→미리보기→감사까지의 문서 수명주기를 완성한다.
- **범위**: storage adapter(S3/MinIO, tenant prefix, DEC-07), upload API+검증, SHA-256 hash·중복 탐지·immutable original policy, metadata·document type·11상태 enum, DocumentVersion(family_id·version_no), 추출 worker(pg-boss, PDF/DOCX/OCR pending), **HWPX(XML) 텍스트 추출만**(HWP 5.0 바이너리는 R4~R6 별도 트랙, DEC-10), soft delete/restore/archived mutation 차단, PDF preview+DOCX→PDF 변환, DOCUMENT_* audit 5종, document permission 구현화(confidentiality policy, download reason).
- **[보정 C-3]** **legal hold 인터페이스 계약 신설**: `documents.legal_hold`·`matters.legal_hold` flag + 삭제 경로 precondition check만. 전체 LegalHold/disposal 테이블은 R12.
- **[보정 C-7]** 스키마 보강 반영 지점: `ai_policies` 테이블+`documents.ai_allowed=false`+`matters.ai_policy_id` — **스키마 컬럼만, 기본 거부, 평가 로직 금지**(절대 금지 목록의 명시적 예외). P13(external_*)·embeddings·disposal 계열은 예약 스키마로 **문서화만**.
- **Gate**: Document Vault Gate [보정 C-9] — 동일파일 동일 hash·1바이트 상이 검증 / 원본 덮어쓰기 불가 / 권한 없는 업로드·다운로드·미리보기 차단 / hold flag 삭제 차단 / DOCUMENT_* audit 5종 누락 0 / storage cross-tenant(서명 URL 포함) 차단 / 파일 본문 로그 미기록.
- **진입조건**: R1 Matter Core Gate 통과 + **Permission Model Freeze 승인** [보정 C-1].
- **산출물**: 문서 파이프라인 일식, legal hold 인터페이스 계약 문서, HWPX fixture 5종 검증 리포트.

### R3 — Permission-bound Search v1 (28 TUW) [보정 C-9]

- **명칭**: 원천 "Search MVP" → **Permission-bound Search v1**. [보정 C-9]
- **목표**: 쿼리 단계 권한 필터 주입(Permission-before-search)이 증명된 전문·메타데이터 검색을 제공한다.
- **범위**: PG FTS(tsvector) index schema·indexing job·reindex, metadata filter 5종, full-text query·snippet·highlighting, **matter/document/ethical wall permission filter 주입**(사후 필터링 금지), metadata leakage test, 검색 UI, 한국어 토큰화 평가(법률용어 fixture 30건)+OpenSearch 전환 판단 보고서(ADR-006 갱신, DEC-05), 평가셋 v0 수집 절차+`evaluation_cases` 적재(DEC-16 — **AI 기능 아님, 데이터 준비**).
- **[보정 C-5]** **Semantic search(SEARCH-SEMASEAR-VECT-001~005)는 R3에서 제외하고 R6로 이동.** 벡터 인덱스의 권한 메타 동기화 계약(31번 §2-B)이 선행되어야 하기 때문. R6 전 벡터/의미검색 구현은 절대 금지 목록 위반.
- **Gate**: Permission-bound Search Gate — 권한 없는 문서가 title/snippet/metadata 어디에도 미노출 / wall 양측 상호 격리 / deleted·superseded 제외 / 인덱스 cross-tenant 차단 / 권한 변경→인덱스 반영 SLA 정의·측정 / 검색 audit 100%. **사후 필터링 우회 발견 시 Gate 불통과.**
- **진입조건**: R2 Document Vault Gate 통과 + Freeze 유지(권한 모델 변경 발생 시 Freeze 재승인 전 착수 금지).
- **산출물**: 검색 일식, 한국어 검색 평가 보고서+ADR-006 갱신, 평가셋 v0(비식별 계약서 20~50건) 적재.

### R4 — Email Vault v1 (TUW 상세화: R3 Gate 후, 44번 §1) [보정 C-9]

- **명칭**: 원천 "Email Vault MVP" → **Email Vault v1**. [보정 C-9]
- **목표**: 이메일을 Matter의 1급 레코드로 수용한다 — 파싱·중복 차단·첨부의 Document 연결·수동 filing+추천·thread·timeline.
- **범위**: EML parser·MSG parser skeleton·raw 원본 보존·messageId 중복 차단, header/participant/date normalizer·external participant flag, attachment→FileObject→Document 연결·중복 hash 처리, manual filing API+subject/participant domain 기반 추천, email timeline·thread 구성, email DLP scan hook(첨부 업로드 경로에 DLP rule 적용), privilege tag suggestion. HWP 5.0 바이너리 추출 별도 트랙 시작(DEC-10, R4~R6).
- **[보정 C-4]** **진입조건에 핵심 DLP rule 완료를 포함**: 주민등록번호·계좌번호·이메일/전화번호 탐지 rule + DLP finding schema(SEC-DLP-SENSDATADE-TUW-001~004, 4건)를 R4 착수 전 선행 PACK으로 완료한다. 원천은 DLP 전체를 R5에 두어 R4 이메일 첨부가 무검사로 유입되는 결함이 있었다.
- **Gate**: Email Vault Gate — 첨부 분리·Document 연결 무결성(hash 일치) / 권한 없는 사용자의 email·첨부 접근 차단 / filing·열람 audit 100% / messageId 중복 차단 / 첨부 DLP scan 결과 기록 / raw 원본 불변.
- **진입조건**: R3 Permission-bound Search Gate 통과 **+ 핵심 DLP 선행 TUW 4건(SEC-DLP-SENSDATADE-TUW-001~004) 완료** [보정 C-4].
- **산출물**: 이메일 파이프라인 일식, DLP finding 기록, R4 상세 TUW 백로그(44번 §1을 확장한 신규 문서).

### R5 — Security & Governance (TUW 상세화: R4 Gate 후, 44번 §2)

- **목표**: 권한·보안 거버넌스를 R6 AI 진입이 가능한 수준으로 완성한다.
- **범위**: ABAC 일반화(DEC-15 — role 7종+practice_group에서 속성 기반 평가로 확장), DLP 전체(DEC-13 식별자 잔여분: 여권·외국인등록·카드번호 + external sharing DLP warning **정책**, AI external model DLP block hook), break-glass dual approval(테이블 신설 — wall 우회는 이중 승인+전량 audit) [보정 C-2 잔류분], 외부공유 **정책 정의만**(테이블·정책 문서 — **시행·링크 발급은 R11 전 절대 금지**, 불변 원칙 6), Audit Console(검색·필터·CSV export — Console 자체에 권한 enforcement), wall 관리 UI.
- **Gate**: Security & Governance Gate — ABAC 평가 회귀(기존 RBAC 매트릭스 결과 불변 + 속성 조건 케이스) / break-glass 이중 승인 없는 우회 0 / DLP rule 전체 fixture 통과 / Audit Console 비인가 조회 차단 / 외부공유 시행 코드 부재 확인 / 권한·tenant·audit 회귀 전체 green.
- **진입조건**: R4 Email Vault Gate 통과.
- **산출물**: ABAC 평가 규칙 문서(21번 갱신), break-glass 운영 절차, 외부공유 정책 문서(R11 시행 전제), R5 상세 TUW 백로그.

### R6 — AI Knowledge Layer v1 = MVP (TUW 상세화: R5 Gate 후, 44번 §3)

- **목표**: 권한연동 RAG(Permission-before-AI)와 근거제시(citation) 기반의 Gemma 로컬 AI v1을 출시하고 **MVP를 확정**한다.
- **범위**: chunk store(parent-child, provenance), embeddings(pgvector, DEC-05) — [보정 C-5]로 R3에서 이동한 SEARCH-SEMASEAR-VECT-001~005 포함, hybrid retrieval(BM25+vector) orchestrator, AI policy evaluator(`ai_policies` 평가 로직 — R2 스키마의 기능화), Evidence Pack builder, citation mapper+verification warning, AISession+AI audit 5종, model gateway·risk router·**Gemma 로컬 only**(DEC-11, 외부모델 전면 차단), feedback store, summary/template 5종, **shadow pilot 2~4주**(DEC-18, 내부 변호사 한정).
- **Degraded mode**: Evidence Pack의 `graph_facts`는 R7 전, `rule_findings`는 R8 전까지 **empty 허용**. 빈 필드를 채우기 위한 임시 graph/rule 구현은 금지(절대 금지 목록). 상세 규칙은 31번 §5.
- **Gate**: **AI Governance Gate** — permission accuracy 100%(권한 밖 자료가 답변·인용·snippet·메타 어디에도 미노출) / citation accuracy ≥98% / hallucination ≤1% / AI audit 5종 누락 0 / 외부모델 호출 시도 0(차단 증명 포함) / 평가셋 서브셋(~1,000건) 측정 통과 / shadow pilot 중단 기준 미발동 종료. 상세 기준은 31번·50번.
- **진입조건**: R5 Security & Governance Gate 통과 + **31번 AI Readiness Checklist 전 항목 통과**(평가셋 서브셋, Gemma PoC, 외부모델 차단 확정 포함).
- **산출물**: AI v1 일식, shadow pilot 운영 보고서, 평가 리포트, **MVP 선언**(아래 §3).

### R7 — Knowledge Graph v1

- **목표**: Client–Matter–Document–Clause–Issue–Risk 관계 그래프를 도입한다. **Neo4j/GraphSync 도입 허용 시점**(DEC-05 — R7 전 도입 금지 해제).
- **범위**: graph node/edge taxonomy, **graph permission model**(wall·matter 권한이 graph query에도 적용), node mapper(Client/Matter/Document/Clause/Issue), edge builder, event 기반 graph sync+retry+consistency checker, deleted document graph filter, graph sync audit.
- **Gate**: Knowledge Graph Gate — graph query 권한·wall 격리 / RDB↔graph 일관성 / deleted 반영 / sync audit. 통과 시 Evidence Pack `graph_facts` 활성화(degraded mode 1단계 해제, 31번 §5).
- **진입조건**: R6 AI Governance Gate 통과.

### R8 — Contract Intelligence

- **목표**: 조항 단위 지능 — clause extraction, redline parser, playbook/rule store.
- **범위**: contract type 분류, clause extraction(조항·항·호·정의어), redline/markup 파싱, playbook rule store(`playbook_rules`)·rule engine, clause bank.
- **Gate**: Contract Intelligence Gate — 조항 추출 정확도(평가셋 기준) / parser 실패 시 원본 무손상 / rule engine 결과 재현성. 통과 시 Evidence Pack `rule_findings` 활성화(degraded mode 2단계 해제, 31번 §5).
- **진입조건**: R7 Knowledge Graph Gate 통과.

### R9 — DD Vault [보정 C-6]

- **목표**: 실사(DD) 업무 구조화 — RFI, DD issue, risk register.
- **범위**: RFI 관리, DD issue·risk register, data room mapping. **[보정 C-6] P13 사용은 내부 전용 data room mapping으로 한정한다** — `external_*` 테이블 생성·외부 사용자 노출·링크 발급은 일절 금지(불변 원칙 6, R11 External Sharing Critical Gate 전). Closing Binder는 MVP 제외(DEC-17)이며 배치는 R9 상세화 시 재확정(80번 Open Items).
- **Gate**: DD Vault Gate — RFI–Document–Issue 추적성 / 내부 한정 확인(외부 노출 경로 부재) / 권한·audit 회귀.
- **진입조건**: R8 Contract Intelligence Gate 통과. R10과 병렬 가능(§4).

### R10 — Litigation Vault

- **목표**: 송무 자료 구조화 — evidence, fact ledger, issue tree, pleading 관리.
- **범위**: 증거 관리, fact ledger, 쟁점트리, 서면 관리. 전자소송 패키징 등 외부 전송 성격 요소는 R11 이후로 분리.
- **Gate**: Litigation Vault Gate.
- **진입조건**: R8 Gate 통과. R9와 병렬 가능(§4).

### R11 — External Portal / VDR

- **목표**: **외부 공유 최초 시행**(불변 원칙 6 "No silent external sharing"의 통제된 해제). external workspace, secure link, watermark, Q&A.
- **범위**: P13 전면(external users/workspace/secure link), R5에서 정의한 외부공유 정책의 시행, NDA gate, link 만료/revoke, watermark, external audit, External User role(DEC-15) 활성화.
- **Gate**: **External Sharing Critical Gate** — 만료/revoked link 차단 / watermark / external audit 100% / DLP external warning 동작 / NDA gate / 권한·tenant 회귀 전체.
- **진입조건**: R9·R10 Gate 통과 + R5 외부공유 정책 승인 유지.

### R12 — Records Management

- **목표**: 보존·폐기 거버넌스 완성. **hard delete 금지 해제 시점**(절대 금지 목록).
- **범위**: retention policy(DEC-12 — 법률검토 전까지 자동삭제 없음·무기한 보존 기본값 유지), LegalHold 전체 테이블·워크플로(R2 인터페이스 [보정 C-3]의 구현 완성), archive, disposal workflow+certificate.
- **Gate**: Records Governance Gate — hold 자료 hard/soft delete 모두 차단 / disposal workflow 우회 불가 / DISPOSAL_EXECUTED audit.
- **진입조건**: R11 Gate 통과.

### R13 — Enterprise Hardening

- **목표**: 엔터프라이즈 도입 요건 충족.
- **범위**: SSO/SAML(DEC-09 — R13 배치), BYOK, SIEM 연동, backup/DR, compliance readiness(SOC 2/ISO 대응 준비). 멀티테넌시는 R0부터 내재(DEC-02)이므로 여기서는 강화만.
- **Gate**: Enterprise SaaS Readiness Gate.
- **진입조건**: R12 Gate 통과.

### R14 — Scale & Optimization

- **목표**: 성능·비용·평가 고도화, 마이그레이션 도구.
- **범위**: performance/cost 최적화, 평가 파이프라인 고도화(15번 §5 전체 평가셋 규모), advanced AI — **외부모델 단계 개방은 DEC-11의 승인 게이트 구축·검증 후에만 재평가**, migration tooling.
- **Gate**: Scale & Learning Gate.
- **진입조건**: R13 Gate 통과.

## 3. MVP Cut Line (DEC-17)

**MVP = R6 AI Governance Gate 통과 시점.** 단일 정의이며 다른 MVP 정의(원천 16번 §4, 원천 DOCX Phase 1 "Core Vault MVP")는 모두 폐기한다. [보정 C-9]

- **MVP 포함**: R0~R6 전체 — Matter 중심 문서·이메일 저장, 권한연동 검색(PG FTS), 권한연동 Gemma RAG(근거제시·citation·AI audit), DLP 핵심+전체, audit console, ethical wall.
- **MVP 제외(명시)**: 외부공유 일체·VDR(R11), Closing Binder, 보존 자동화(R12 — retention 필드만 R2에 준비), SSO(R13). Knowledge Graph(R7)·Contract Intelligence(R8)도 MVP 범위 밖이다(Evidence Pack은 degraded mode로 출시).
- MVP 선언은 PM이 `docs/ledger/decision.md`에 기록하고, shadow pilot 종료 보고서(31번 §4)를 첨부한다.

## 4. 순서·병렬 규칙

1. 직렬 순서: **R0 → R1 → R2 → R3 → (DLP 선행 PACK [보정 C-4]) → R4 → R5 → R6 → R7 → R8 → R9/R10 → R11 → R12 → R13 → R14.**
2. 병렬 허용: R9와 R10만 명시적 병렬 허용. 그 외 release 간 병렬 금지(Gate 직렬).
3. release 내부 병렬은 40~43·44번의 Deps와 60번 PACK 순서를 따른다.
4. 권한 모델(Freeze 대상) 변경이 필요해지면: 해당 PACK 중단 → escalation(`docs/ledger/execution.md`) → Freeze 개정 승인 후 재개. [보정 C-1]
5. 원천 12번 §6의 병렬화 금지(권한 모델 확정 전 search/AI/VDR 금지, AI policy 확정 전 Gemma 연결 금지, retention/legal hold 확정 전 hard delete 금지)는 본 로드맵의 Gate·진입조건으로 집행된다.

## 5. 보정사항 반영 지점 요약 (C-1~C-10)

| 보정 | 본 로드맵 반영 지점 |
|---|---|
| C-1 | R1 종료 Permission Model Freeze 마일스톤, R2·R3 진입조건, §4-4 |
| C-2 | wall schema/membership/create → R1, search enforcement → R3, break-glass·고도화 → R5 |
| C-3 | R2 legal hold 인터페이스 계약, R12에서 전체 구현 완성 |
| C-4 | R4 진입조건의 핵심 DLP rule 선행 PACK |
| C-5 | semantic search R3 제외 → R6 배치 |
| C-6 | R9 P13 사용을 내부 전용 data room mapping으로 한정 |
| C-7 | R2의 ai_policies·legal hold flag·예약 스키마 문서화 (상세는 20번) |
| C-8 | 모든 Gate 기준이 AND 의미론으로 기술됨 (상세는 50번) |
| C-9 | R2/R3/R4 명칭에서 "MVP" 제거, R2 Gate 개칭, MVP 단일 정의(§3) |
| C-10 | 본 문서·44번의 모든 TUW ID는 13번 canonical ID 체계를 따름 (원천 14번 샘플 ID 불사용) |

## 부록 A. 원천 DOCX Phase 0~8 매핑 (참고용 — normative는 본 로드맵)

원천 `Law_Firm_Vault_System_장기개발_사양명세서.docx`의 Phase 구분은 기간 기반 9단계다. 본 로드맵의 R0~R14와 1:1 대응하지 않으며, **충돌 시 본 로드맵이 우선한다.** DOCX는 수정하지 않는다.

| DOCX Phase | DOCX 명칭 (기간) | 본 로드맵 매핑 | 차이·보정 |
|---|---|---|---|
| Phase 0 | Discovery & Architecture (2~3개월) | 사양 패키지(본 codex_dev_package) + R0 일부(ADR·문서 이관) | PRD/ERD/권한모델/스택 확정은 본 패키지 00~21번으로 완료됨 |
| Phase 1 | Core Vault MVP (4~6개월) | R0 + R1 + R2 | "MVP" 명칭은 DEC-17에 따라 R6로 이동 [보정 C-9]. 권한·audit가 Phase 1 내 후순위가 아니라 R0~R1 선행으로 격상 |
| Phase 2 | Email & Search Expansion (4~6개월) | R3(전문검색) + R4(이메일) + R2(문서 미리보기) | **외부공유 링크는 R11로 이동**(불변 원칙 6). Outlook add-in은 P15 Integration Layer로 분리(R13 전후 재평가, 80번). 검색이 이메일보다 선행(R3<R4) + DLP 선행 [보정 C-4] |
| Phase 3 | Security & Governance (4~6개월) | R5 (+ R1 wall schema [보정 C-2], R3 전 Freeze [보정 C-1]) | MFA는 R0~R1(TOTP, DEC-09), **SSO는 R13**(DEC-09). 보존정책 자동화는 R12(DEC-12 — retention 필드만 R2). 핵심 DLP는 R4 진입 전 선행 [보정 C-4] |
| Phase 4 | AI-Ready Knowledge Layer (6~9개월) | R6 (+ R3 평가셋 v0 데이터 준비, DEC-16) | Vector search는 R6에서만(R3 금지 [보정 C-5]). **조항 추출은 R8로 이동.** 외부모델 차단·shadow pilot은 DEC-11·DEC-18 |
| Phase 5 | Contract & DD Intelligence (6~9개월) | R8 + R9 | R7 Knowledge Graph가 사이에 삽입됨(DOCX에 없는 단계). Closing Binder는 MVP 제외(DEC-17), 배치 재확정은 80번. R9 P13은 내부 한정 [보정 C-6] |
| Phase 6 | Litigation Vault (6~9개월) | R10 | 전자소송 패키징의 외부 전송 요소는 R11 이후 |
| Phase 7 | External Portal / VDR (6개월) | R11 | 외부 공유 최초 시행 시점 — 그 전 어떤 Phase/release에서도 구현 금지(불변 원칙 6) |
| Phase 8 | Enterprise SaaS Hardening (9~12개월) | R13 + R14 | 멀티테넌시(shared DB+RLS, DEC-02)는 R0부터 내재 — DOCX처럼 후순위가 아님. BYOK/SIEM/DR은 R13 유지 |

매핑 해석 규칙: (1) DOCX Phase의 기간 추정치는 참고용이며 본 로드맵은 기간이 아니라 **Gate 통과**로 진행을 판정한다. (2) DOCX에서 이른 Phase에 있던 기능이 본 로드맵에서 늦은 release로 이동한 경우(외부공유, SSO, 조항 추출, 보존 자동화)는 모두 불변 원칙 또는 보정 C-1~C-10에 근거한 의도된 이동이다.
