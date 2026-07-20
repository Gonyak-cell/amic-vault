# 01. 배경, 현재 상태, 운영 전제·완화 정책

## 1. 프로젝트 배경

AMIC Vault는 로펌 내부용 Matter 중심 문서관리·지식관리 플랫폼이다. 최초 컨셉은 두 문서로 정의되었다(`reference/` 수록):

1. **장기개발 사양명세서** (`concept-spec-vault-system.txt`): Matter 중심 DMS + Email Vault + Knowledge Graph + AI Governance + VDR + Workflow + Records를 갖춘 "Legal Data OS". Level 1(내부 문서관리)~Level 5(Enterprise Governance Platform) 로드맵.
2. **Obsidian+LLM+Neo4j 컨셉** (`concept-obsidian-llm-neo4j.txt`): 로컬 AI(Gemma) = 입력자료 구조화, 그래프 = 관계 저장·탐색(Matter Graph, Citation Ledger, Fact Ledger), Strong LLM = 고난도 판단·작성이라는 3계층 역할분담. 핵심 통제: AI 생성 노드와 변호사 확정 노드 분리, Citation 없는 Fact 금지.

2026-07-02에 컨셉 대비 구현 갭 전수 분석(130건, `02_gap-analysis-full.md`)을 수행했고, 그 결과를 9인 로펌 내부용 전제에 맞게 조정한 작업계획(`03_workplan-TUW-snapshot.md`)으로 분해했다.

## 2. 현재 시스템 상태 (분석 시점 실측)

### 2.1 성숙도 매트릭스

| 차원 | 성숙도 | 요지 |
|---|---|---|
| Matter Core | OPERATIONAL | RLS·상태기계·감사 견고. 이해상충 검사 부재(→A1·A2) |
| Document Vault | OPERATIONAL | 업로드·해시·버전·중복탐지 실물. OCR·워터마크 미실장(→B1·B3) |
| 문서 편집 | OPERATIONAL | 체크아웃/서브버전/리뷰게이트/승격 실물(0092). Office 통합·비교 부재(→B10~B12, B17~B19) |
| Email Vault | NOT_OPERATIONAL | 수동 EML 경로만 실물. Outlook add-in 삼중 봉인(→C계열) |
| 검색 | OPERATIONAL | 권한내 검색 최상급. 의미검색은 해시 벡터 가짜(→D1~D4) |
| 보안·거버넌스 | OPERATIONAL | fail-closed 권한·break-glass 실물. MFA/SSO 스텁(→H1·H2) |
| AI 거버넌스 | NOT_OPERATIONAL | RAG 파이프라인·감사 실물, 질의 UI 부재(→E계열) |
| Knowledge Graph | NOT_OPERATIONAL | Postgres 파생 그래프 실물이나 택소노미 5종뿐, 화면 봉인(→F계열) |
| 워크플로·외부협업 | NOT_OPERATIONAL | 백엔드 실물, 화면 전부 봉인, 외부포털 바이트 미전달(→G계열) |
| 플랫폼 | NOT_OPERATIONAL | RLS 멀티테넌시·AWS 프로덕션(문서 22,286건) 실재. 백업 자동화·IaC 부재(→H계열) |

### 2.2 재사용해야 할 기존 자산 (재구현 금지)

- **권한 체계**: FailClosedPermissionWrapper, matter 단위 ethical wall, break-glass 2인 승인, 검색 SQL 권한 스코프 — 모든 신규 기능은 이 체계를 통과해야 한다.
- **문서 무결성**: SHA-256 해시 체인, 불변 버전(supersedes), 다운로드 시 해시 재검증, append-only 감사.
- **편집 라이프사이클**(0092): checkout 잠금 → subversion(vN.M) 저장 → check-in → 리뷰게이트 → promote. B12·B16·B17은 이 위에 얹는다.
- **비동기 파이프라인**: pg-boss 큐(retry/backoff/dead-letter) — 추출·인덱싱·AI-prep에서 실사용 중. 신규 잡(OCR, redline, send_and_file)은 같은 패턴으로.
- **AI 거버넌스**: 권한연동 RAG(retrieval-orchestrator), 인용 강제(citation-verifier), 외부모델 차단 정책(ai-policy), Ollama 로컬 Gemma 연동.
- **감사**: 모든 변이는 AuditService 트랜잭션 패턴으로 감사 이벤트와 함께 커밋.

### 2.3 분석 이후 진전분 — 기구현 증거표 (W0 전수 감사의 출발점)

워킹트리는 분석 시점보다 크게 진전되어, **계획 유닛의 산출물이 이미 대량 실재한다**. 마이그레이션 0098~0120이 계획 유닛과 다음과 같이 일치한다(서비스·UI·acceptance까지 완결됐는지는 유닛별 확인 필요 — 상태는 W0 감사에서 확정):

| 마이그레이션 | 대응 유닛 | 비고 |
|---|---|---|
| 0098 conflict_checks | A1 | 이해상충 스키마 실재 |
| 0099 client_aliases | A4 | /clients UI도 구현 확인됨 |
| 0100 matter_access_scope | A6 | 기본개방 권한 모델 |
| 0101 matter_intake_templates | A7 | 생성 템플릿 |
| 0102 party audit action | A5 | |
| 0103 mfa_runtime | 유닛 H1 (MFA) | |
| 0104 user_lifecycle audit | 유닛 H2 (비활성화) | |
| 0105 backup_drill_evidence | 유닛 H3 (백업) | |
| 0106·0107 OCR extraction/confidence | B1, D7 | |
| 0108 email_body_search | D8 | |
| 0109 korean_ngram_search | D1 | |
| 0110 fact/issue citations 강제 | F5 | |
| 0111 ai_claims_ledger | F4 | Citation Ledger |
| 0112 audit_daily_anchors | 유닛 H9 | |
| 0113 retention 바인딩 | 유닛 H8/A7 | |
| 0114 graph transport reason codes | C5 | |
| 0115 matter_app_sync_state | A14 | |
| 0116~0118 추출 포맷 확대 | B2 | |
| 0119 source·version labels | B4 | 구현 완료 확인됨 |
| 0120 lock expired notification | B6 | |

미커밋 신규 파일: C4(Entra 신원검증기), C5(Graph 트랜스포트), C6(outlook-fulfillment 워커) 계열 — **커밋·태그(00 README의 인계 전 필수 조치) 없이는 개발팀에 전달되지 않는다.**

**규칙: 각 유닛 착수 전 code_anchors를 현재 코드로 재검증하고, 이미 충족된 항목은 acceptance tests 실행으로 확인 후 닫는다(W0 감사).**

## 3. 운영 전제

- **단일 로펌 내부용. 단일 테넌트. 전체 사용자 9명**(변호사+스태프). 외부 판매 SaaS가 아니다.
- 인프라: AWS Seoul(ap-northeast-2), ECS Fargate + RDS + ALB + S3 (기 배포·운영 중).
- 사용자 규모 전제에 따라 성능 목표는 "수십만 문서·동시 수십 세션"이며, 그 이상의 확장(샤딩, 10,000 동시사용자)은 범위 외.

## 4. 완화 정책 (범위 통제 — 위반 금지)

### 4.1 만들지 않는다 (요청받아도 발주자 서면 승인 없이 착수 금지)

SAML SSO 런타임 / BYOK·테넌트별 암호화 키(RDS·S3 기본 at-rest 암호화로 대체) / SIEM 커넥터 / SOC 2·ISO 자동화 / 멀티테넌시 격리 티어 상향 / Ethical Wall 고도화(clean team, 고객별·상대방별 축 — 기존 matter 단위 wall 유지) / 99.99% HA·오토스케일·멀티리전 / 검색 인덱스 샤딩 / 과금·미터링 / 외부 개발자용 Public API / VDR 고급(bidder 그룹 권한, 외부 2FA, IP 제한, redaction 자동화) / 인쇄·복사 뷰어 차단 / Gmail add-on / 권한 정기검토 자동화

### 4.2 간소화한다

- 비밀등급: 현행 3단계(standard/high/restricted) + privilege/legal hold 플래그 유지. 9종 확장 안 함.
- 권한 기본값: "펌 전원 접근, 제한 매터만 명시적 제한"(A6 access_scope 모델).
- DLP: 현행 한국형 검출기 + 대량 다운로드 임계 알림 1건(유닛 H7) + 발송 전 검사 1종(유닛 C14 — Horizon 3).
- Analytics: 기본 사용 통계(H13).
- AI Audit: 내부용이므로 프롬프트/출력 **원문 저장으로 강화**(E5) — 외부 규제 부담 없음.

### 4.3 반드시 유지한다 (실 운영 기능 — 삭제·우회 금지)

이해상충 검사(A1·A2) / 감사로그(전 변이) / 백업·PITR(H3) / MFA TOTP(H1) / 사용자 비활성화(H2) / records·보존·legal hold / matter 단위 ethical wall / 무결성 해시 체계

## 5. 목표 수준

작업계획 완주 시 도달점: 사양명세서 기준 **Level 3~4** (Legal Knowledge Vault + AI-Ready Legal OS의 내부용 구성) — Matter 중심 DMS 완결, Outlook 이메일 볼트, 한국어 검색+실임베딩 의미검색, 권한연동 AI 어시스턴트, Knowledge Graph·Citation Ledger·조항은행, 계약·DD·송무 워크플로, redline PDF 내장, 외부 공유 포털. Level 5(엔터프라이즈 거버넌스 플랫폼) 요소는 완화 정책으로 의도적으로 제외되었다.
