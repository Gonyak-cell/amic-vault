

---

<!-- 00_README.md -->

# Vault Development Documentation Package

작성일: 2026-06-11

이 패키지는 로펌용 통합 데이터베이스 시스템인 Vault를 개발팀이 구현 가능한 수준으로 분해하기 위한 문서 세트입니다. 제품 사양, 피라미드식 구조, Gemma용 고도 지식저장소, 아키텍처, 데이터 모델, 보안·권한, 검색·RAG·GraphRAG, 개발 운영체계, TUW 백로그, 검증계약, 릴리스 로드맵, 리스크 레지스터를 포함합니다.

## 사용 순서

1. 01_Document_Register.md로 전체 문서 구성을 확인합니다.
2. 02_Product_Requirements_Specification.md와 03_Pyramid_PBS_DBS_Structure.md로 제품 범위와 분해 구조를 확정합니다.
3. 04_System_Architecture_Blueprint.md, 05_Gemma_Knowledge_Store_Specification.md, 06_Retrieval_RAG_GraphRAG_Design.md를 기준으로 기술 아키텍처를 확정합니다.
4. 07_Data_Model_and_Schema_Draft.md, 08_Security_Permission_Audit_Compliance.md, 09_API_Service_Contract.md를 구현 기준으로 삼습니다.
5. 11_Development_Operating_System.md, 12_Execution_Dependency_Graph.md, 13_TUW_Master_Backlog.md, 14_Agent_Work_Contracts.md, 15_Verification_Contracts_Test_Plan.md를 이용해 실제 개발 티켓을 생성합니다.
6. 16_Roadmap_Release_Plan.md에 따라 R0부터 순차 구현합니다.

## 중요 전제

- 개별 TUW의 실제 파일 경로는 repository 구조 확정 후 보정해야 합니다.
- 법령·판례·개인정보·보존기간 등 법률적 수치와 기간은 별도 법률검토 후 확정해야 합니다.
- Gemma는 로컬 1차 처리·추출·요약·초안에 우선 사용하고, 고위험 법률판단은 상위 모델 또는 변호사 검토로 에스컬레이션합니다.


---

<!-- 01_Document_Register.md -->

# 01. Document Register

| 문서 | 목적 | 주 사용대상 |
| --- | --- | --- |
| 00_README.md | 패키지 사용법과 문서 순서 | 개발팀/PM/PO |
| 01_Document_Register.md | 전체 문서목록 및 산출물 설명 | PM/개발리드 |
| 02_Product_Requirements_Specification.md | Vault 제품 요구사항 명세서 | PO/개발팀 |
| 03_Pyramid_PBS_DBS_Structure.md | 피라미드식 제품·전달·실행 구조 | PM/Planner |
| 04_System_Architecture_Blueprint.md | 시스템 아키텍처 및 구조도 | Architect |
| 05_Gemma_Knowledge_Store_Specification.md | Gemma용 고도 지식저장소 사양 | AI/검색팀 |
| 06_Retrieval_RAG_GraphRAG_Design.md | 검색·RAG·GraphRAG·Evidence Pack 설계 | AI/검색팀 |
| 07_Data_Model_and_Schema_Draft.md | 핵심 데이터 모델 및 스키마 초안 | Backend/Data |
| 08_Security_Permission_Audit_Compliance.md | 권한·보안·감사·컴플라이언스 사양 | Security/Backend |
| 09_API_Service_Contract.md | 서비스 경계 및 API 계약 초안 | Backend/Frontend |
| 10_UI_UX_Workflow_Specification.md | 화면·사용자 흐름·운영 흐름 | UX/Frontend |
| 11_Development_Operating_System.md | 위험도 기반·검증 중심·루프형 개발 운영체계 | PM/Agent팀 |
| 12_Execution_Dependency_Graph.md | 실행 의존성 그래프 및 선후관계 | Planner/개발리드 |
| 13_TUW_Master_Backlog.md | 전체 Testable Unit of Work 백로그 | 개발팀/Agent |
| 14_Agent_Work_Contracts.md | Agent Work Contract 템플릿 및 중요 샘플 | Agent/개발팀 |
| 15_Verification_Contracts_Test_Plan.md | 검증계약·검증케이스·테스트 전략 | QA/Security |
| 16_Roadmap_Release_Plan.md | 릴리스 로드맵 및 Gate | PM/개발리드 |
| 17_Implementation_Guide.md | 구현 착수 가이드와 운영 규칙 | 개발팀 |
| 18_Risk_Register_Open_Questions.md | 리스크 레지스터와 추가 확인사항 | PO/PM/Security |
| 19_Prompt_Library.md | Planner/Executor/Verifier/Governor 프롬프트 | Agent팀 |
| 20_References.md | 공식 문서 및 참고자료 | 전체 |

## 문서 간 의존관계

- 02 PRS는 제품 요구사항의 기준문서입니다.
- 03 PBS/DBS는 TUW를 생성하기 위한 상위 구조입니다.
- 04~10은 제품 구현 사양입니다.
- 11~16은 개발 운영 및 실행 사양입니다.
- 17~19는 개발팀 실행 가이드, 리스크, 프롬프트 운용 문서입니다.
- 20은 외부 공식문서 및 참고자료입니다.


---

<!-- 02_Product_Requirements_Specification.md -->

# 02. Vault Product Requirements Specification

## 1. 제품명

가칭: Law Firm Vault System 또는 Matter by amic Vault.

## 2. Product North Star

Vault는 로펌의 고객, Matter, 문서, 이메일, 계약조항, 법률쟁점, 판례·법령·문헌, 실사자료, 송무자료, 업무기록, 권한, 감사로그, AI 활용기록을 Matter 중심으로 연결·통제·검색·재사용하는 보안 지식 데이터 플랫폼입니다.

## 3. 제품의 본질

Vault는 단순 DMS가 아닙니다. Vault는 원본문서 저장소, 정규화 문서 저장소, 메타데이터 DB, 청크 저장소, 벡터 인덱스, 키워드/전문검색 인덱스, 지식그래프, 플레이북/룰 저장소, Retrieval Orchestrator, Evidence Pack Builder, 피드백·평가 저장소가 결합된 법률업무 기억 시스템입니다.

## 4. 핵심 사용자

| 사용자 | 주요 목적 | 핵심 기능 |
|---|---|---|
| 파트너 변호사 | Matter 전체 현황과 리스크 파악 | Matter dashboard, AI summary, key document, risk panel |
| 어쏘 변호사 | 문서·이메일 검토와 초안 작성 | Document Vault, clause analysis, RAG search, redline |
| 스태프/비서 | 문서 정리와 closing 자료 관리 | upload, metadata, binder, email filing |
| 지식관리 담당자 | 샘플·조항·플레이북 관리 | Clause bank, playbook, feedback curation |
| 보안관리자 | 권한·감사·외부공유 통제 | Permission, ethical wall, audit, DLP |
| 고객/외부사용자 | 자료 업로드·다운로드·Q&A | External portal, VDR, secure link |

## 5. 주요 Product Pillar

| Pillar ID | 명칭 | 설명 | Prefix | 위험도 |
| --- | --- | --- | --- | --- |
| P0 | Development Operating System | 개발 운영체계, Constitution, Ledger, Work Contract, Verification Contract | DEVOPS | Critical |
| P1 | Foundation & SaaS Core | 인증, tenant, workspace, 공통 인프라, CI/CD, 관측성 | CORE | High |
| P2 | Matter-Centric Core | Client, Matter, Party, Matter lifecycle, Matter dashboard | MATTER | High |
| P3 | Document Vault | 문서 업로드, 버전관리, 원본성, OCR, preview, metadata | DOC | Critical |
| P4 | Permission & Security Governance | RBAC, ABAC, Matter 권한, 문서권한, 윤리장벽, DLP | SEC | Critical |
| P5 | Audit & Compliance Ledger | 감사로그, 접근기록, 다운로드기록, AI 사용기록, 보안 이벤트 | AUDIT | Critical |
| P6 | Search & Retrieval | 전문검색, 메타데이터 검색, 의미검색, 권한연동 검색 | SEARCH | High |
| P7 | Email Vault | 이메일 filing, 첨부파일 분리, thread, Outlook/Gmail 연동 | EMAIL | High |
| P8 | AI Knowledge Layer | 권한연동 RAG, 문서요약, Matter 요약, citation, AI audit | AI | Critical |
| P9 | Legal Knowledge Graph | Client–Matter–Document–Clause–Issue 관계망 | GRAPH | High |
| P10 | Contract Intelligence | 계약서 분석, 조항 추출, redline, clause bank, playbook | CONTRACT | High |
| P11 | Due Diligence Vault | RFI, 제출자료, DD issue, risk register, DD report support | DD | Medium |
| P12 | Litigation Vault | 증거, fact ledger, issue tree, pleading, court deadline | LIT | Medium |
| P13 | External Portal / VDR | 고객포털, 외부공유, secure link, Q&A, watermark | VDR | Critical |
| P14 | Records Management | retention, legal hold, archive, disposal, destruction certificate | RECORD | Critical |
| P15 | Integration Layer | Microsoft 365, Google Workspace, ERP/CRM, e-signature, migration | INT | High |
| P16 | Admin, Analytics & Enterprise Operations | 관리자 콘솔, usage analytics, billing, monitoring, enterprise hardening | ADMIN | High |


## 6. 핵심 업무흐름

### 6.1 Matter 중심 문서 관리

Client 생성 → Matter 생성 → 팀원 및 권한 설정 → 문서 업로드 → 원본 hash 생성 → metadata/OCR/text extraction → versioning → audit event 기록 → 검색·AI 대상 등록.

### 6.2 이메일 filing

Outlook/Gmail에서 이메일 선택 → Matter 추천 → 사용자 확인 또는 자동 filing → 원문 저장 → 첨부파일 분리 → Document Vault 연결 → thread/timeline 등록 → audit 기록.

### 6.3 계약서 검토

계약서 업로드 → 문서유형 분류 → 조항·정의어·당사자·날짜·금액 추출 → 플레이북 매칭 → 유사조항 검색 → redline 분석 → 리스크 플래그 → AI 검토표 초안 → 변호사 피드백 저장.

### 6.4 Gemma 기반 지식질의

사용자 질문 → 질문 유형 분류 → Matter/권한 범위 확정 → hybrid retrieval → graph retrieval → playbook/rule lookup → Evidence Pack 생성 → Gemma 로컬 응답 → citation verification → 필요 시 상위 모델/변호사 에스컬레이션 → AI audit 및 feedback 저장.

### 6.5 외부공유/VDR

External Workspace 생성 → 외부사용자 초대 → NDA gate → 권한별 폴더·문서 접근 → watermark → 열람/다운로드 audit → Q&A → archive/export.

## 7. Non-goals for MVP

- 완전 자동 법률판단.
- 전체 판례·법령 DB의 완전 통합.
- 모든 계약유형과 모든 문서 포맷의 100% 지원.
- 사람 검토 없는 대외 법률의견 자동발송.
- 권한·감사로그 없는 AI 검색.

## 8. MVP 범위

1. Tenant/User/Auth skeleton.
2. Client/Matter/Party core.
3. Matter permission 및 basic audit.
4. Document upload, hash, version, metadata.
5. Basic OCR/text extraction.
6. Permission-bound full-text and metadata search.
7. Email filing v1.
8. Gemma knowledge store v1: Source Vault, Metadata Store, Chunk Store, Hybrid Search, Evidence Pack Builder.
9. AI summary v1 with citation and audit.
10. Feedback/evaluation store v1.

## 9. 성공지표

| 지표 | 목표 |
|---|---|
| Permission Accuracy | 100% |
| AI forbidden-document leakage | 0건 |
| Citation Accuracy | 98% 이상 목표 |
| Version Accuracy | 99% 이상 목표 |
| Document upload audit coverage | 100% |
| Retrieval Recall for curated eval set | 95% 이상 목표 |
| Clause classification accuracy | 95% 이상 목표 |
| Hallucination rate on evidence-bound tasks | 1% 이하 목표 |

## 10. 추가 확인 필요사항

- 실제 사용 cloud/on-prem 배포정책.
- 고객자료 외부모델 전송 허용 범위.
- HWP/HWPX 지원 우선순위.
- 국내 법률DB 연동 방식.
- 보존기간 및 폐기정책의 법률 검토값.
- 로펌 내부 업무그룹별 권한 taxonomy.


---

<!-- 03_Pyramid_PBS_DBS_Structure.md -->

# 03. Pyramid Product & Delivery Breakdown Structure

## 1. 개발 계층

| Level | 명칭 | Vault 적용 의미 | 핵심 산출물 |
|---:|---|---|---|
| L0 | Product North Star | Vault의 최상위 목적 | North Star Statement |
| L1 | Product Constitution | 제품·데이터·보안·AI 원칙 | Constitution |
| L2 | Product Pillar | 제품의 큰 축 | Product Breakdown Structure |
| L3 | Domain | 업무·기능 영역 | Domain Map |
| L4 | Core Object / Policy / State Model | 핵심 객체·정책·상태 모델 | Object/Policy/State Model |
| L5 | Module | 기능 묶음 또는 서비스 단위 | Module Map |
| L6 | Capability | 시스템이 제공해야 하는 능력 | Capability Spec |
| L7 | Feature | 사용자에게 보이는 기능 | Feature Spec |
| L8 | Epic | 여러 Story를 묶는 개발 단위 | Epic Brief |
| L9 | User Story / System Story | 사용자 행위 또는 시스템 요구 | Story Spec |
| L10 | Technical Task | 개발자가 수행할 기술 작업 | Task Spec |
| L11 | Testable Unit of Work | 독립 구현·검증 가능한 최소 실행 단위 | Agent Work Contract |
| L12 | Verification Case | TUW 완료 검증 항목 | Verification Contract |
| L13 | Ledger Record | 결정·실행·학습 기록 | Ledger |

## 2. 텍스트 구조도

L0 Product North Star → L1 Product Constitution → L2 Product Pillars → L3 Domains → L4 Core Object / Policy / State Models → L5 Modules → L6 Capabilities → L7 Features → L8 Epics → L9 Stories → L10 Technical Tasks → L11 TUW → L12 Verification Cases → L13 Ledgers.

## 3. Product Pillars

| Pillar ID | Product Pillar | 설명 | 주요 Domain | TUW 우선순위 | 위험도 | 선행 Pillar |
| --- | --- | --- | --- | --- | --- | --- |
| P0 | Development Operating System | 개발 운영체계, Constitution, Ledger, Work Contract, Verification Contract | Development Constitution, Work Decomposition, Work Contracting, Verification 등 | 1 | Critical | 없음 |
| P1 | Foundation & SaaS Core | 인증, tenant, workspace, 공통 인프라, CI/CD, 관측성 | Repository & Build, Environment, Database Core, Backend Core 등 | 2 | High | P0 |
| P2 | Matter-Centric Core | Client, Matter, Party, Matter lifecycle, Matter dashboard | Client Management, Matter Management, Matter Lifecycle, Matter Team 등 | 3 | High | P0,P1 |
| P3 | Document Vault | 문서 업로드, 버전관리, 원본성, OCR, preview, metadata | Document Upload, Document Storage, Document Integrity, Document Metadata 등 | 4 | Critical | P1,P2,P4,P5 |
| P4 | Permission & Security Governance | RBAC, ABAC, Matter 권한, 문서권한, 윤리장벽, DLP | RBAC, ABAC, Matter Permission, Document Permission 등 | 5 | Critical | P0,P1 |
| P5 | Audit & Compliance Ledger | 감사로그, 접근기록, 다운로드기록, AI 사용기록, 보안 이벤트 | Audit Event Core, Document Audit, Permission Audit, External Audit 등 | 6 | Critical | P0,P1 |
| P6 | Search & Retrieval | 전문검색, 메타데이터 검색, 의미검색, 권한연동 검색 | Search Indexing, Metadata Search, Full-text Search, Permission-bound Search 등 | 7 | High | P1,P2,P4,P5 |
| P7 | Email Vault | 이메일 filing, 첨부파일 분리, thread, Outlook/Gmail 연동 | Email Ingestion, Email Metadata, Threading, Attachment Handling 등 | 8 | High | P1,P2,P4,P5 |
| P8 | AI Knowledge Layer | 권한연동 RAG, 문서요약, Matter 요약, citation, AI audit | AI Policy, AI Retrieval, AI Context, AI Session 등 | 9 | Critical | P1,P2,P4,P5 |
| P9 | Legal Knowledge Graph | Client–Matter–Document–Clause–Issue 관계망 | Graph Schema, Node Mapping, Edge Building, Graph Sync 등 | 10 | High | P1,P2,P4,P5 |
| P10 | Contract Intelligence | 계약서 분석, 조항 추출, redline, clause bank, playbook | Contract Classification, Contract Structure, Clause Extraction, Redline Analysis 등 | 11 | High | P1,P2,P4,P5 |
| P11 | Due Diligence Vault | RFI, 제출자료, DD issue, risk register, DD report support | RFI Management, Data Room Mapping, DD Review, Issue Management 등 | 12 | Medium | P1,P2,P4,P5 |
| P12 | Litigation Vault | 증거, fact ledger, issue tree, pleading, court deadline | Evidence Management, Fact Ledger, Issue Tree, Pleading Management 등 | 13 | Medium | P1,P2,P4,P5 |
| P13 | External Portal / VDR | 고객포털, 외부공유, secure link, Q&A, watermark | External Workspace, External User, Secure Link, VDR Folder 등 | 14 | Critical | P1,P2,P4,P5 |
| P14 | Records Management | retention, legal hold, archive, disposal, destruction certificate | Retention Policy, Legal Hold, Archive, Disposal Workflow 등 | 15 | Critical | P1,P2,P4,P5 |
| P15 | Integration Layer | Microsoft 365, Google Workspace, ERP/CRM, e-signature, migration | Microsoft 365, Google Workspace, Calendar, ERP/CRM 등 | 16 | High | P1,P2,P4,P5 |
| P16 | Admin, Analytics & Enterprise Operations | 관리자 콘솔, usage analytics, billing, monitoring, enterprise hardening | Tenant Admin, Policy Admin, Usage Analytics, Billing 등 | 17 | High | P1,P2,P4,P5 |


## 4. Pillar별 상세 구조

## P0. Development Operating System

| L3 Domain | L5 Module | L6 Capability |
| --- | --- | --- |
| Development Constitution | Product/Data/Security/AI/Agent/Verification/Release/Ledger Constitution | 원칙 정의 및 gate 기준화 |
| Work Decomposition | PBS/DBS/Execution Graph Manager | 제품·전달·실행 구조 분해 |
| Work Contracting | TUW Generator / Agent Work Contract Builder | TUW와 실행계약 생성 |
| Verification | Verification Contract Builder / Case Registry | 검증계약 및 검증항목 관리 |
| Model Routing | Risk Classifier / Model Router | 위험도 기반 모델 배정 |
| Ledger | Decision/Execution/Learning Ledger | 결정·실행·학습 기록 |

## P1. Foundation & SaaS Core

| L3 Domain | L5 Module | L6 Capability |
| --- | --- | --- |
| Repository & Build | Monorepo / CI / CD | 빌드와 배포 기반 |
| Environment | Config / Secret Management | 환경 및 비밀값 관리 |
| Database Core | Migration / Seed Data | DB 기반 |
| Backend Core | API Server / Error / Validation | API 공통 기능 |
| Frontend Core | App Shell / Design System / Routing | 프론트 기반 |
| Auth Core | User / Session / MFA Skeleton | 인증 기반 |
| Tenant Core | Tenant / Workspace Model | 멀티테넌시 기반 |
| Observability | Logging / Metrics / Health | 운영 관측성 |
| Testing Core | Unit / Integration / E2E | 검증 기반 |

## P2. Matter-Centric Core

| L3 Domain | L5 Module | L6 Capability |
| --- | --- | --- |
| Client Management | Client Registry / Metadata | 고객 정보 관리 |
| Matter Management | Matter Registry / Type Taxonomy / Metadata | Matter 생성·조회·분류 |
| Matter Lifecycle | State Engine / Closing / Archive | Matter 상태전이 |
| Matter Team | Member Manager / Role Assignment | 사건팀 관리 |
| Party Management | Party Registry / Role Model | 당사자 관리 |
| Matter Dashboard | Overview / Activity Feed / Key Documents | Matter 화면 |
| Matter Timeline | Timeline Builder | 활동 타임라인 |
| Related Matters | Linker / Similar Suggestion | 관련 사건 연결 |
| Conflict Support | Conflict Metadata / Restricted Party | 이해상충 보조 |

## P3. Document Vault

| L3 Domain | L5 Module | L6 Capability |
| --- | --- | --- |
| Document Upload | Upload API / File Validation / Bulk Upload | 문서 업로드 |
| Document Storage | Object Storage Adapter / Path Resolver / Encryption Hook | 파일 저장 |
| Document Integrity | Hash Generator / Duplicate Detector / Immutable Original | 원본성·중복관리 |
| Document Metadata | Schema / Auto Extractor / Manual Editor | 메타데이터 |
| Document Versioning | Version Model / Version Resolver / Version List | 버전관리 |
| Document Viewer | PDF/DOCX/Image Preview | 미리보기 |
| OCR & Text Extraction | OCR Worker / Text Extractor / Status | 본문 추출 |
| Document Lifecycle | Status / Soft Delete / Restore / Lock | 생명주기 |
| Closing Binder | Candidate / Index / Export | 체결본 패키지 |

## P4. Permission & Security Governance

| L3 Domain | L5 Module | L6 Capability |
| --- | --- | --- |
| RBAC | Role Model / Assignment / Permission Matrix | 역할권한 |
| ABAC | Attribute Policy / Policy Evaluator | 속성기반 정책 |
| Matter Permission | Matter Access / Team / Status Permission | Matter 권한 |
| Document Permission | Document Access / Confidentiality / Download Policy | 문서 권한 |
| Ethical Wall | Wall Registry / Membership / Enforcement | 윤리장벽 |
| External Sharing Security | Share Policy / Link Permission / Expiration | 외부공유 통제 |
| DLP | Sensitive Data Detector / Rule Engine / Alert | 민감정보 탐지 |
| Session Security | Session / Device / IP Policy | 세션 보안 |
| Admin Security | Privileged Action / Break-glass | 관리자 보안 |

## P5. Audit & Compliance Ledger

| L3 Domain | L5 Module | L6 Capability |
| --- | --- | --- |
| Audit Event Core | AuditEvent Model / Logger / Metadata Normalizer | 감사로그 코어 |
| Document Audit | View / Download / Upload / Delete Audit | 문서 행위 기록 |
| Permission Audit | Permission Change / Access Denied | 권한 기록 |
| External Audit | External View / Download / Share Link | 외부접근 기록 |
| AI Audit | AI Query / Retrieval / Response Audit | AI 사용 기록 |
| Security Event | Suspicious Activity / Bulk Download / Alert | 보안 이벤트 |
| Audit Console | Audit Search / Filter / Export | 감사 콘솔 |
| Compliance Report | Access / Sharing / AI Usage Report | 컴플라이언스 보고 |

## P6. Search & Retrieval

| L3 Domain | L5 Module | L6 Capability |
| --- | --- | --- |
| Search Indexing | Index Schema / Indexer / Reindex | 색인 |
| Metadata Search | Matter/Client/DocumentType Filter | 메타검색 |
| Full-text Search | Text Query / Snippet / Highlighting | 전문검색 |
| Permission-bound Search | Permission/EthicalWall/Deleted Filter | 권한연동 검색 |
| Semantic Search | Embedding / Vector Index / Similarity | 의미검색 |
| Clause Search | Clause Index / Clause Type Filter | 조항검색 |
| Email Search | Email Index / Participant Search | 이메일 검색 |
| Search UI | Page / Facet / Result Card | 검색 UI |
| Search Analytics | Log / Zero Result / Click Tracking | 검색 품질분석 |

## P7. Email Vault

| L3 Domain | L5 Module | L6 Capability |
| --- | --- | --- |
| Email Ingestion | EML / MSG Parser / Raw Storage | 이메일 원문 수집 |
| Email Metadata | Header / Participant / Date Normalizer | 메타데이터 |
| Threading | Thread ID / Conversation / Duplicate Detector | 쓰레드 |
| Attachment Handling | Extractor / Document Linker / Metadata | 첨부파일 |
| Matter Filing | Manual / Recommendation / Auto Rule | Matter filing |
| Outlook Integration | Add-in / Filing UI | Outlook 연동 |
| Gmail Integration | Add-on / Filing UI | Gmail 연동 |
| Email Timeline | Timeline Item / Activity Feed | 타임라인 |
| Email Security | Email DLP / Wrong Recipient Warning | 보안 |
| Email Audit | Filing / View Audit | 감사 |

## P8. AI Knowledge Layer

| L3 Domain | L5 Module | L6 Capability |
| --- | --- | --- |
| AI Policy | Matter/Document/Model Policy | AI 정책 |
| AI Retrieval | Retrieval Orchestrator / Permission-bound Retrieval / Redaction | RAG 검색 |
| AI Context | Chunk Builder / Ranker / Window Manager | 컨텍스트 구성 |
| AI Session | AISession / Prompt / Response Logger | AI 세션 |
| Citation | Citation Mapper / Cited Document Tracker / Source Panel | 출처 |
| AI Features | Document/Matter/Email Summary / Clause Analysis / Risk Extraction | AI 기능 |
| AI Verification | Citation Verification / Hallucination Warning / Policy Check | AI 검증 |
| Model Routing | Risk-based Model Router / Local Handler | 모델 라우팅 |
| AI Audit | Query / Retrieval / Output Audit | AI 감사 |

## P9. Legal Knowledge Graph

| L3 Domain | L5 Module | L6 Capability |
| --- | --- | --- |
| Graph Schema | Node / Edge Taxonomy / Permission Model | 그래프 스키마 |
| Node Mapping | Client/Matter/Document/Clause/Issue Node | 노드 매핑 |
| Edge Building | HAS_MATTER / CONTAINS_DOCUMENT / HAS_CLAUSE / RELATES_TO | 엣지 구축 |
| Graph Sync | Event Sync / Retry / Consistency Checker | 그래프 동기화 |
| Graph Query | Related Document / Similar Matter / Clause Pattern | 그래프 질의 |
| Graph Recommendation | Similar Clause / Related Issue | 추천 |
| Graph UI | Explorer / Matter Knowledge Panel | 그래프 UI |

## P10. Contract Intelligence

| L3 Domain | L5 Module | L6 Capability |
| --- | --- | --- |
| Contract Classification | Type Classifier / Language Detector | 계약유형 분류 |
| Contract Structure | Section Parser / Defined Term / Cross-reference Checker | 계약구조 파싱 |
| Clause Extraction | Segmenter / Type Classifier / Metadata Extractor | 조항 추출 |
| Redline Analysis | DOCX Track Changes / Change Mapper / Summary | 마크업 분석 |
| Risk Scoring | Rule Engine / Market Standard / Missing Clause | 리스크 평가 |
| Clause Bank | Repository / Approval / Fallback Manager | 조항은행 |
| Playbook | Client Playbook / Position Clause Set | 플레이북 |
| Negotiation Tracker | Issue Table / Counterparty Position | 협상쟁점 추적 |

## P11. Due Diligence Vault

| L3 Domain | L5 Module | L6 Capability |
| --- | --- | --- |
| RFI Management | Template / Item / Status Tracker | 자료요청 |
| Data Room Mapping | RFI–Document Linker / Missing Detector / Supplement Request | 자료 매핑 |
| DD Review | Reviewer Assignment / Review Status / Comment | 검토 |
| Issue Management | DD Issue / Risk Level / Citation | 이슈 |
| Q&A | Question Thread / Answer Tracker / Follow-up | 질의응답 |
| DD Report | Issue Selector / Section Builder / Footnote Mapper | 보고서 |
| Transaction Linkage | Disclosure / Indemnity / CP Candidate | 거래문서 반영 |

## P12. Litigation Vault

| L3 Domain | L5 Module | L6 Capability |
| --- | --- | --- |
| Evidence Management | Registry / Numbering / Metadata | 증거관리 |
| Fact Ledger | Fact Item / Source Linker / Dispute Marker | 사실관계 |
| Issue Tree | Issue Node / Hierarchy / Evidence Link | 쟁점트리 |
| Pleading Management | Document Type / Versioning / Submission Status | 서면관리 |
| Court Deadline | Deadline / Hearing / Reminder | 기한 |
| Authority Mapping | Case Law / Statute / Argument Support | 근거 연결 |
| Timeline | Chronology / Event–Evidence Link | 타임라인 |

## P13. External Portal / VDR

| L3 Domain | L5 Module | L6 Capability |
| --- | --- | --- |
| External Workspace | Creator / Permission / Expiration | 외부공간 |
| External User | Registry / Invitation / MFA | 외부사용자 |
| Secure Link | Generator / Expiration / Revocation | 보안링크 |
| VDR Folder | Index / Permission / Export | VDR 폴더 |
| Watermark | PDF / Viewer Watermark | 워터마크 |
| Download Control | Disable / Audit | 다운로드 통제 |
| Q&A | Question / Answer / Export | Q&A |
| NDA Gate | Acceptance / Pre-access Block | NDA gate |
| External Audit | View Log / Access Report | 외부감사 |

## P14. Records Management

| L3 Domain | L5 Module | L6 Capability |
| --- | --- | --- |
| Retention Policy | Registry / Assignment / Calculator | 보존정책 |
| Legal Hold | Registry / Enforcement / Release | 법적보존 |
| Archive | Matter / Document / Cold Storage Hook | 보관 |
| Disposal Workflow | Candidate / Request / Approval | 폐기워크플로우 |
| Destruction | Secure Delete / Certificate / Audit | 폐기 |
| Records Audit | Retention / Hold / Disposal Report | 기록관리 보고 |

## P15. Integration Layer

| L3 Domain | L5 Module | L6 Capability |
| --- | --- | --- |
| Microsoft 365 | Outlook / Word / Teams / SharePoint Connector | M365 연동 |
| Google Workspace | Gmail / Drive / Calendar Connector | Google 연동 |
| Calendar | Deadline / Meeting Sync | 일정 |
| ERP/CRM | Client / Billing Code Sync | ERP/CRM |
| Time/Billing | Time Entry / Invoice Link | 청구 |
| E-signature | Signature Packet / Executed Copy Import | 전자서명 |
| Legal Data | Statute / Case Law Connector | 법률자료 |
| Migration | File Server / DMS / PST Import | 이관 |

## P16. Admin, Analytics & Enterprise Operations

| L3 Domain | L5 Module | L6 Capability |
| --- | --- | --- |
| Tenant Admin | Settings / User / Group Management | tenant 관리 |
| Policy Admin | Permission / AI / Sharing Policy Admin | 정책관리 |
| Usage Analytics | Matter / Document / Search / AI Usage | 사용량 분석 |
| Billing | Plan / Usage-based / Invoice | 과금 |
| Enterprise Security | SSO/SAML / BYOK / Data Residency | 엔터프라이즈 보안 |
| Monitoring | Metrics / Error / Alerting | 모니터링 |
| Backup/DR | Backup / Restore Drill / DR | 백업·재해복구 |
| Compliance Ops | Audit Export / Access Review / Compliance Dashboard | 컴플라이언스 운영 |


## 5. Delivery Breakdown Structure 요약

| Release | 목적 | 핵심 범위 | 포함 Pillar |
| --- | --- | --- | --- |
| R0 | Foundation | repo, CI/CD, auth skeleton, DB, design system, logging, test framework | P0,P1 |
| R1 | Matter Core | Client, Matter, Party, Matter team, basic permission | P2,P4,P5 |
| R2 | Document Vault MVP | upload, version, metadata, hash, preview skeleton, audit | P3,P4,P5 |
| R3 | Search MVP | metadata/full-text/permission-bound search, indexing, snippets | P6,P4,P5 |
| R4 | Email Vault MVP | email filing, attachment extraction, threading, timeline | P7,P3,P5 |
| R5 | Security & Governance | RBAC/ABAC, ethical wall, DLP, external sharing controls | P4,P5 |
| R6 | AI Knowledge Layer v1 | permission-bound RAG, summaries, citations, AI sessions | P8,P6,P4,P5 |
| R7 | Knowledge Graph v1 | graph schema, mapping, sync, graph query | P9,P3,P8 |
| R8 | Contract Intelligence | clause extraction, redline parser, playbook, rule store | P10,P9,P8 |
| R9 | DD Vault | RFI, data room mapping, DD issue, risk register | P11,P13 |
| R10 | Litigation Vault | evidence, fact ledger, issue tree, pleading management | P12 |
| R11 | External Portal / VDR | external workspace, secure link, watermark, Q&A | P13,P4,P5 |
| R12 | Records Management | retention, legal hold, archive, disposal workflow | P14,P5 |
| R13 | Enterprise Hardening | SSO/SAML, BYOK, SIEM, backup/DR, compliance readiness | P16,P15 |
| R14 | Scale & Optimization | performance, cost, eval, advanced AI, migration tooling | P15,P16 |


---

<!-- 04_System_Architecture_Blueprint.md -->

# 04. System Architecture Blueprint

## 1. 아키텍처 목표

Vault 아키텍처는 Matter 중심 데이터 모델, 원본문서 불변성, 권한 우선 검색, AI 접근통제, 감사로그, 지식그래프, 플레이북/룰 엔진, 피드백 루프를 모두 결합해야 합니다.

## 2. 논리 계층

| Layer | 명칭 | 역할 |
|---:|---|---|
| 0 | Client/UI Layer | Web app, Outlook/Gmail add-in, external portal |
| 1 | API Gateway | 인증, tenant context, rate limit, request validation |
| 2 | Domain Services | Matter, Document, Email, Permission, Audit, Search, AI, Graph, Contract, DD, Litigation |
| 3 | Policy Services | RBAC, ABAC, Ethical Wall, AI Policy, External Sharing, Retention |
| 4 | Data Processing | OCR, parser, chunker, indexer, graph sync, rule engine |
| 5 | Storage | Object storage, PostgreSQL, OpenSearch, Vector DB, Neo4j, Audit Store |
| 6 | AI Orchestration | Retrieval Orchestrator, Evidence Pack Builder, Model Gateway, Feedback Store |
| 7 | Observability & Governance | metrics, logs, traces, ledgers, release gates |

## 3. 구조도 설명

Vault의 핵심 데이터 흐름은 다음과 같습니다.

1. Source Vault에 원본문서를 저장합니다.
2. Canonical Document Store에서 문서를 정규화합니다.
3. Metadata Store에 Matter, Document, Clause, Permission, Version 정보를 저장합니다.
4. Chunk Store에서 문서·조항·이메일을 검색 단위로 분해합니다.
5. Vector Index, Keyword/BM25 Index, Knowledge Graph, Playbook/Rule Store를 구축합니다.
6. Retrieval Orchestrator가 질문 유형에 따라 검색전략을 선택합니다.
7. Evidence Pack Builder가 Gemma 또는 상위모델에 넣을 근거 패키지를 만듭니다.
8. Model Gateway가 risk-based model routing을 수행합니다.
9. Feedback & Evaluation Store가 변호사 수정, 정답셋, 평가결과를 저장합니다.

## 4. 권장 기술 스택

| 영역 | MVP 권장 | 장기 권장 |
|---|---|---|
| Backend | NestJS/FastAPI | 모듈화된 service architecture |
| Frontend | React/Next.js | Design system + app shell |
| DB | PostgreSQL | tenant-aware PostgreSQL cluster |
| Object Storage | S3-compatible/MinIO | S3 + KMS/BYOK |
| Vector | pgvector | Qdrant/Milvus/Weaviate/Vespa 검토 |
| Full-text | OpenSearch 또는 PostgreSQL FTS | OpenSearch/Elasticsearch |
| Graph | Neo4j | Neo4j Aura/cluster |
| Workflow | Queue 기반 worker | Temporal/Kafka/Redpanda |
| Local Model | Gemma 4 12B 또는 적정 로컬 모델 | Model Gateway 기반 교체 가능 구조 |
| Embedding | EmbeddingGemma/bge/e5 비교평가 | 로컬·외부 embedding 다중 라우팅 |
| Observability | OpenTelemetry, Prometheus, Grafana | SIEM 연동 |

## 5. 핵심 컴포넌트

| 컴포넌트 | 책임 |
|---|---|
| TenantContextService | 모든 요청에 tenant/workspace context 부여 |
| PermissionService | Matter/document/clause/AI 접근권한 판정 |
| AuditService | append-only audit event 기록 |
| DocumentIngestionService | 업로드, hash, storage, versioning |
| CanonicalizationWorker | 문서 정규화, OCR, parser |
| ChunkingService | parent-child chunking과 provenance 부여 |
| SearchIndexer | keyword/full-text/vector indexing |
| GraphSyncService | core object를 Neo4j graph로 동기화 |
| PlaybookRuleEngine | 계약유형별 검토 rule 실행 |
| RetrievalOrchestrator | 질문 유형별 검색전략 선택 |
| EvidencePackBuilder | Gemma 입력 근거 패키지 구성 |
| ModelGateway | Gemma/local/external model routing |
| FeedbackService | 변호사 피드백, 평가셋, 학습자료 저장 |

## 6. 배포 원칙

- 초기에는 tenant_id 기반 shared DB로 시작할 수 있으나, 권한필터와 row-level isolation test를 필수로 둡니다.
- 엔터프라이즈 고객은 schema-per-tenant 또는 DB-per-tenant 확장을 준비합니다.
- 고객 기밀자료는 기본적으로 로컬모델 또는 승인된 private endpoint에서 처리합니다.
- 권한·AI 정책 판단 실패 시 fail closed로 차단합니다.


---

<!-- 05_Gemma_Knowledge_Store_Specification.md -->

# 05. Gemma Knowledge Store Specification

## 1. 목표

Gemma용 지식저장소의 목표는 문서를 많이 넣는 것이 아니라, Gemma가 답변에 필요한 사실, 문구, 조항, 선례, 협상 이력, 내부 기준, 리스크 분류표를 정확히 검색·조합·검증할 수 있도록 원천자료를 구조화된 지식 단위로 변환하는 것입니다.

Gemma는 로컬 실행 가능한 법률업무 프로세서로 위치시킵니다. 핵심 경쟁력은 Gemma 자체의 파라미터가 아니라 Source Vault, Metadata Store, Chunk Store, Hybrid Search, Knowledge Graph, Playbook/Rule Store, Evidence Pack, Feedback Store의 품질에 둡니다.

## 2. 전체 계층

| Layer | 명칭 | 역할 |
| --- | --- | --- |
| Layer 0 | Source Vault | 원본문서, 이메일, 회의록, 첨부파일 원본 보관 |
| Layer 1 | Canonical Document Store | PDF/DOCX/HWP/XLSX/PPTX/MSG/EML을 공통 문서 구조로 정규화 |
| Layer 2 | Metadata Store | Matter, Client, Document, Clause, 권한, 상태, 버전 관리 |
| Layer 3 | Chunk Store | 계약서 조항·항·호·정의어·이메일·판례 단위 청킹 |
| Layer 4 | Vector Index | 의미검색 |
| Layer 5 | Keyword / BM25 Index | 정의어·조항번호·판례번호·고유명사 정확검색 |
| Layer 6 | Knowledge Graph | Client–Matter–Document–Clause–Issue–Risk 관계 저장 |
| Layer 7 | Playbook / Rule Store | 내부 검토기준, 필수조항, red flag, fallback clause 저장 |
| Layer 8 | Retrieval Orchestrator | 질문 유형별 검색전략 선택 |
| Layer 9 | Evidence Pack Builder | Gemma 또는 상위모델에 제공할 근거 패키지 구성 |
| Layer 10 | Feedback & Evaluation Store | 변호사 수정결과, 정답셋, 평가셋 저장 |


## 3. Layer 0 Source Vault

### 3.1 저장 대상

| 자료유형 | 예시 |
|---|---|
| 계약서 | SPA, SSA, SHA, BTA, 투자계약서, 공급계약서, 라이선스계약서 |
| 마크업 | 상대방 수정본, 내부 수정본, 최종본 |
| 이메일 | 협상 이메일, 고객 지시, 상대방 의견 |
| 회의자료 | 회의록, 녹취록, Teams transcript |
| 법률자료 | 법령, 판례, 행정해석, 논문, 자문메모 |
| 실사자료 | DD request list, disclosure schedule, Q&A |
| 내부 기준 | 검토 체크리스트, 플레이북, 선호 문구집 |
| 결과물 | 검토의견서, 이메일 회신문, 협상 메모 |
| 개발자료 | SaaS 사양명세서, TUW, 프롬프트, QA 결과 |

### 3.2 원본 필수 식별자

| 필드 | 설명 |
| --- | --- |
| source_id | 원본 고유 ID |
| file_hash | 파일 해시값 |
| original_filename | 원래 파일명 |
| normalized_filename | 정규화 파일명 |
| uploaded_by | 업로드자 |
| uploaded_at | 업로드시각 |
| source_system | Outlook, SharePoint, OneDrive, Local, Gmail 등 |
| confidentiality_level | 일반, 기밀, 극비, 외부공유금지 |
| matter_id | 연결 사건/거래 |
| client_id | 고객 |
| document_family_id | 같은 문서 계열 |
| version_id | 버전 |
| privilege_status | 변호사-의뢰인 비밀, 업무상 작성물, 일반자료 등 |
| retention_policy | 보존정책 |
| access_policy | 접근권한 |


## 4. Layer 1 Canonical Document Store

문서는 PDF, DOCX, HWP, XLSX, PPTX, MSG, EML, HTML 등 포맷이 다르므로 Gemma가 직접 다루기 전에 공통 구조로 정규화해야 합니다.

| 요소 | 설명 |
| --- | --- |
| document_id | 정규화 문서 ID |
| title | 문서 제목 |
| document_type | 계약서, 이메일, 회의록, 판례, 법령 등 |
| body_text | 추출 본문 |
| sections | 조항/섹션 구조 |
| tables | 표 구조 |
| footnotes | 각주 |
| comments | Word comment |
| redlines | 마크업 변경사항 |
| attachments | 첨부파일 |
| signatures | 서명란 |
| exhibits | 별지 |
| defined_terms | 정의어 |
| cross_references | 조항 참조 |
| extracted_entities | 당사자, 날짜, 금액 등 |
| provenance | 원본 위치 정보 |


## 5. 계약서 정규화 필수 요소

| 항목 | 예시 |
|---|---|
| 전문 | 당사자, 체결 배경, 거래 목적 |
| 정의조항 | 본건 주식, 거래종결일, 중대한 부정적 영향 |
| 본문 조항 | 매매대금, 거래종결, 진술보장, 확약, 손해배상 |
| 별지 | 대상회사 정보, 주식목록, 인허가, 부동산 목록 |
| 서명란 | 당사자명, 대표자명, 주소 |
| 조항 참조 | 제○조 제○항 |
| 기간·금액·비율 | 거래종결기한, 매매대금, 지분율 |
| 권리·의무·조건 | 동의권, 우선매수권, 비밀유지, 선행조건 |
| 예외 | carve-out, knowledge qualifier, materiality qualifier |

## 6. Layer 2 Metadata Store

메타데이터는 벡터DB보다 중요할 수 있습니다. 질문이 “Delta 협상에서 상대방이 IPR 조항에 대해 뭐라고 했지?”라면 Matter, document_type, issue, party_position, date_range, version_status, 권한을 모두 필터링해야 합니다.

### 6.1 Matter Metadata

| 필드 | 설명 |
|---|---|
| matter_id | 사건/거래 ID |
| matter_name | 사건명 |
| client_id | 고객 ID |
| counterparty | 상대방 |
| matter_type | M&A, 투자, 분쟁, 주주간계약, 실사 등 |
| jurisdiction | 대한민국, 미국 등 |
| governing_law | 준거법 |
| status | 진행중, 종결, 보류 |
| responsible_lawyer | 담당 변호사 |
| team_members | 참여자 |
| deal_value | 거래금액 |
| risk_level | 위험도 |
| confidentiality_level | 보안등급 |

### 6.2 Document Metadata

| 필드 | 설명 |
|---|---|
| document_id | 문서 ID |
| matter_id | 연결 사건 |
| document_type | 계약서, 이메일, 회의록, 판례 등 |
| subtype | SPA, SHA, BTA, 투자계약서 등 |
| version_status | 초안, 상대방 수정본, 내부 수정본, 최종본 |
| author/sender/recipient | 작성자·발신자·수신자 |
| created_at/received_at | 생성·수신일 |
| effective_date/execution_date | 효력발생일·체결일 |
| language | 한국어, 영어 등 |
| privilege_status | 비닉특권/비밀보호 상태 |
| citation_allowed | 외부 인용 가능 여부 |
| source_confidence | 원본 신뢰도 |

### 6.3 Clause Metadata

| 필드 | 설명 |
|---|---|
| clause_id | 조항 ID |
| document_id | 문서 ID |
| clause_number | 제○조 |
| clause_title | 조항 제목 |
| clause_type | 진술보장, 손해배상, 해제, 비밀유지 등 |
| legal_function | 권리부여, 의무부과, 책임제한, 조건설정 등 |
| party_favorable_to | 매도인, 매수인, 투자자, 회사 등 |
| risk_category | 책임확대, 조건불명확, 절차누락 등 |
| importance | low, medium, high, critical |
| negotiation_status | 수용, 거절, 보류, 추가검토 |
| final_outcome | 최종 반영 여부 |
| fallback_clause_id | 대체문구 |
| playbook_rule_id | 관련 내부 기준 |
| authority_ids | 관련 법령/판례/문헌 |

## 7. Layer 3 Chunk Store

법률문서는 일반 문서처럼 일정 글자 수로만 자르면 안 됩니다. 조항·항·호·정의어·별지·마크업·코멘트 단위의 parent-child chunking이 필요합니다.

| 자료유형 | 권장 청킹 |
| --- | --- |
| 계약서 | 문서 전체 요약, 전문, 정의조항 전체, 개별 정의어, 조항, 항/호/목, 별지, 표, 서명란, 마크업 변경, 코멘트 |
| 이메일 | 이메일 1통, thread 요약, 문단, 첨부파일 관계 |
| 회의록 | 발언 주제, 결정사항, action item |
| 판례 | 사실관계, 쟁점, 판단, 결론, 판시사항 |
| 법령 | 조문, 항, 호, 부칙 |
| 실사자료 | RFI 항목, 답변, 제출문서, 보완요청 |
| 개발문서 | 기능, 요구사항, TUW, verification case |


각 chunk에는 document_id, clause_id, page_number, paragraph_number, clause_number, char_start, char_end, source_filename, version_id, extracted_at, extraction_method, confidence가 붙어야 합니다.

## 8. Layer 4 Vector Index

벡터DB에는 clause_text, clause_summary, issue_summary, party_position, lawyer_comment, negotiation_history, final_clause, authority_summary, playbook_rule을 저장합니다. 다만 벡터 검색은 의미상 유사문장에 강하고, 정의어·조항번호·판례번호·고유명사는 키워드 검색이 더 정확할 수 있으므로 반드시 hybrid search를 사용합니다.

## 9. Layer 5 Keyword / BM25 Index

정의어, 조항번호, 판례번호, 법령조문, 고유명사, 금액, 이메일 제목, 버전명, 마크업 코멘트를 정확히 찾기 위해 OpenSearch/Elasticsearch 또는 PostgreSQL full-text를 사용합니다.

## 10. Layer 6 Knowledge Graph

그래프 노드는 Client, Matter, Party, Person, Company, Document, Version, Clause, DefinedTerm, Obligation, Right, Condition, Risk, Issue, Authority, Email, Meeting, Decision, PlaybookRule, DraftingPattern, NegotiationPosition, FinalOutcome으로 구성합니다.

주요 엣지는 HAS_MATTER, HAS_DOCUMENT, HAS_VERSION, HAS_CLAUSE, DEFINES, REFERENCES, CREATES_RIGHT, IMPOSES_OBLIGATION, SUBJECT_TO, HAS_RISK, SUPPORTED_BY, DISCUSSES, TAKES_POSITION, RESOLVED_BY, MATCHES_PLAYBOOK, HAS_FALLBACK, SUPERSEDES, RELATED_TO입니다.

## 11. Layer 7 Playbook / Rule Store

플레이북은 판단기준 저장소입니다. 예를 들어 SPA 손해배상 rule은 rule_id, clause_type, transaction_type, client_side, preferred_position, fallback_position, red_flag, required_elements, optional_elements, negotiation_note, sample_clause_ids, authority_ids, escalation_required를 가져야 합니다.

룰엔진은 정의어 사용 여부, 당사자와 서명란 일치, 선행조건과 종결의무 연결, 손해배상 cap/basket/survival, SHA 동의권/ROFR/Tag/Drag/Deadlock 정합성, 투자계약 MFN/상환권/전환권 충돌, IP 소유권 구분 등을 검사합니다.

## 12. Layer 8 Retrieval Orchestrator

질문 유형에 따라 metadata search, keyword search, vector search, graph query, rule lookup을 조합합니다. 법률판단 또는 최신 법령·판례 확인은 상위모델 또는 사람 검토로 에스컬레이션합니다.

## 13. Layer 9 Evidence Pack Builder

Evidence Pack에는 user_question, task_type, matter_context, relevant_documents, authoritative_sources, retrieved_chunks, graph_facts, rule_findings, conflicts, uncertainty, prohibited_assumptions, output_format, citation_requirements를 포함합니다.

## 14. Layer 10 Feedback & Evaluation Store

Gemma 초안, 상위모델 보정 결과, 변호사 최종안, 발송본, 협상결과, 오류유형, 수정이유, 재사용 가능성, 평가점수를 저장합니다. 이 데이터는 SFT/LoRA 후보, 플레이북 rule, checklist rule, retrieval 개선, version ranking 개선, drafting pattern 등록에 사용합니다.

## 15. Gemma 역할

Gemma는 Extractor, Classifier, Query Rewriter, Summarizer, Drafting Assistant, Checklist Runner, Local Triage Agent, Feedback Formatter로 사용합니다. 고위험 법률판단, 최종 대외문안 검토, 복잡한 계약장치 설계, 판례·법령 종합은 상위모델 또는 변호사 검토로 보냅니다.


---

<!-- 06_Retrieval_RAG_GraphRAG_Design.md -->

# 06. Retrieval, RAG, GraphRAG and Evidence Pack Design

## 1. 원칙

Vault의 RAG는 벡터DB 단독 검색이 아니라 Metadata + Keyword/BM25 + Vector + Graph + Rule Store를 결합한 hybrid, permission-bound, evidence-pack 기반 검색입니다.

## 2. 질문 유형별 검색 전략

| 사용자 질문 | 검색 전략 |
|---|---|
| 이 계약서에서 거래종결일이 언제야? | 정확검색 + 메타데이터 + 정의어 검색 |
| 이 조항이 우리에게 불리해? | 조항검색 + 플레이북 + 유사사례 + 룰엔진 |
| 비슷한 SHA 샘플 찾아줘 | 메타데이터 필터 + 벡터검색 + clause bank |
| Delta가 IPR에 대해 뭐라고 했어? | Matter 필터 + 이메일/마크업 검색 + timeline 정렬 |
| MFN 때문에 어떤 문제가 생겨? | 그래프검색 + 관련 계약·권리·증권종류 연결 |
| 이 문구를 최소수정해줘 | 조항검색 + 샘플문구 + 플레이북 + style bible |
| 법리적으로 맞아? | 법령/판례 authority search + 상위모델/변호사 escalation |
| 자료 전부 종합해줘 | 문서군 요약 + 쟁점그래프 + Evidence Pack |
| 이전 샘플 문체에 맞춰줘 | style sample + drafting pattern 검색 |

## 3. Retrieval Orchestrator 단계

1. 사용자 질문 수신.
2. tenant/user/matter context 확인.
3. 질문 유형 분류.
4. permission 및 ethical wall 확인.
5. metadata filter 생성.
6. keyword query 생성.
7. vector query 생성.
8. graph query 생성.
9. playbook/rule lookup 실행.
10. 검색결과를 provenance 기준으로 병합.
11. 최신본·최종본·권한·신뢰도 기준 reranking.
12. 중복·superseded version 제거.
13. Evidence Pack 생성.
14. Gemma 또는 상위모델 호출.
15. citation verification.
16. AI audit 및 feedback 저장.

## 4. 권한 필터링 순서

권한필터는 검색 후 사후처리가 아니라 검색 전·중·후 모든 단계에서 적용합니다.

| 단계 | 필터 |
|---|---|
| Pre-retrieval | tenant, matter, ethical wall, AI policy |
| Retrieval | metadata permission filter, document aiAllowed |
| Post-retrieval | document-level permission, version status, deleted/legal hold 상태 |
| Evidence Pack | title/snippet/meta leakage 제거 |
| Response | cited source가 권한 내 자료인지 재검증 |

## 5. Evidence Pack Schema

| 필드 | 설명 |
|---|---|
| pack_id | Evidence Pack ID |
| user_question | 원질문 |
| rewritten_queries | 검색용 질문분해 |
| task_type | 요약, 검토, 수정, 비교, 리서치 등 |
| matter_context | Matter 개요 |
| retrieval_scope | 검색 범위 |
| relevant_documents | 관련 문서 목록 |
| authoritative_sources | 최종본, 법령, 판례, 플레이북 |
| retrieved_chunks | 검색 chunk 및 provenance |
| graph_facts | 그래프 관계 사실 |
| rule_findings | 룰엔진 결과 |
| conflicts | 자료 간 충돌 |
| uncertainty | 불확실한 부분 |
| prohibited_assumptions | 추정 금지사항 |
| citation_requirements | 출처표시 방식 |
| output_format | 요구 답변형식 |
| escalation_flags | 상위검토 필요 여부 |

## 6. Query Rewriting

예: 사용자가 “이 조항 우리한테 불리한가?”라고 물으면 내부적으로 다음 검색질문으로 분해합니다.

- 현재 조항의 clause_type은 무엇인가.
- 해당 matter의 client_side는 누구인가.
- 같은 clause_type의 preferred clause는 무엇인가.
- 유사 거래에서 수용된 fallback은 무엇인가.
- 관련 playbook rule은 무엇인가.
- rule engine상 누락된 요소는 무엇인가.
- 관련 authority가 있는가.
- 상대방이 과거 유사 문구를 요구한 이력이 있는가.

## 7. Citation Verification

AI 답변의 각 주장에는 document_id, version_id, clause_id, chunk_id 또는 authority_id가 연결되어야 합니다. citation이 없는 주장은 warning으로 표시하고, 법률판단에 해당하면 escalation합니다.

## 8. GraphRAG 사용 기준

GraphRAG는 다음 유형의 질문에 우선 적용합니다.

| 질문 유형 | 이유 |
|---|---|
| 계약 간 권리 전이 | 조항·증권종류·당사자·권리 관계 필요 |
| 조항 충돌 검토 | 정의어·cross-reference·권리·의무 연결 필요 |
| 과거 협상패턴 | 상대방·문구·최종결과 관계 필요 |
| DD issue 근거 추적 | RFI–Document–Issue–Risk 관계 필요 |
| 송무 사실관계 | Fact–Evidence–Issue–Authority 관계 필요 |

## 9. Evaluation Metrics

| 지표 | 목표 |
|---|---|
| Retrieval Recall | 95% 이상 목표 |
| Precision | 80% 이상 목표 |
| Citation Accuracy | 98% 이상 목표 |
| Version Accuracy | 99% 이상 목표 |
| Permission Accuracy | 100% |
| Clause Classification Accuracy | 95% 이상 목표 |
| Entity Extraction Accuracy | 99% 이상 목표 |
| Risk Detection Recall | 95% 이상 목표 |
| Hallucination Rate | 1% 이하 목표 |
| Escalation Accuracy | 95% 이상 목표 |


---

<!-- 07_Data_Model_and_Schema_Draft.md -->

# 07. Data Model and Schema Draft

## 1. Core Object Model

Vault의 핵심 객체는 Tenant, User, Client, Matter, Party, Document, DocumentVersion, FileObject, CanonicalDocument, Clause, Chunk, DefinedTerm, Right, Obligation, Condition, Risk, Issue, Authority, Email, AuditEvent, AISession, PlaybookRule, Feedback, EvaluationCase입니다.

## 2. Relationship Model

| 관계 | 설명 |
|---|---|
| Tenant HAS User/Client/Matter | 모든 데이터는 tenant 범위 내에 존재 |
| Client HAS Matter | 고객은 복수 Matter를 가짐 |
| Matter HAS Parties/Documents/Emails/Issues/Risks | Matter가 업무 단위 |
| Document HAS DocumentVersion | 문서는 버전들을 가짐 |
| DocumentVersion HAS FileObject/CanonicalDocument/Clauses | 버전이 원본과 정규화 데이터를 연결 |
| Clause HAS Chunks/DefinedTerms/Rights/Obligations/Risks | 조항은 법률 지식 단위 |
| Email HAS Attachments, Attachment LINKS Document | 이메일 첨부가 문서로 연결 |
| AISession HAS RetrievalLogs | AI 답변 근거 추적 |
| PlaybookRule MATCHES Clause | 내부 기준과 조항 연결 |

## 3. Draft Tables

| 테이블 | 주요 필드 |
| --- | --- |
| tenants | tenant_id, name, region, data_residency, status, created_at |
| users | user_id, tenant_id, email, name, role, status, mfa_enabled, created_at |
| clients | client_id, tenant_id, name, client_type, confidentiality_level, status |
| matters | matter_id, tenant_id, client_id, matter_name, matter_type, status, opened_at, closed_at, lead_lawyer_id, ai_policy_id |
| matter_members | matter_id, user_id, matter_role, access_level, added_by, added_at |
| parties | party_id, tenant_id, matter_id, name, party_type, party_role, related_client_id |
| documents | document_id, tenant_id, matter_id, document_family_id, title, document_type, subtype, status, confidentiality_level, privilege_status, ai_allowed, created_at |
| document_versions | version_id, document_id, version_no, version_status, file_object_id, file_hash, created_by, created_at, supersedes_version_id |
| file_objects | file_object_id, storage_uri, original_filename, normalized_filename, mime_type, size_bytes, encryption_key_id, source_system |
| canonical_documents | canonical_id, version_id, body_text, extraction_status, extraction_method, confidence, extracted_at |
| clauses | clause_id, version_id, matter_id, clause_number, clause_title, clause_type, text, summary, risk_level, party_favorable_to |
| clause_chunks | chunk_id, clause_id, version_id, parent_chunk_id, chunk_type, text, page_number, paragraph_number, char_start, char_end |
| defined_terms | term_id, version_id, term, definition_text, first_clause_id, normalized_term |
| rights | right_id, clause_id, right_type, holder_party_id, target_party_id |
| obligations | obligation_id, clause_id, obligor_party_id, obligee_party_id, obligation_type, trigger_condition |
| conditions | condition_id, clause_id, condition_type, deadline, responsible_party_id |
| risks | risk_id, matter_id, source_type, source_id, risk_category, risk_level, description, status |
| issues | issue_id, matter_id, issue_type, title, description, risk_level, status |
| authorities | authority_id, authority_type, citation, title, court_or_agency, decision_date, current_status, source_url, last_verified_at |
| emails | email_id, tenant_id, matter_id, message_id, thread_id, subject, sender, sent_at, received_at, raw_file_id |
| email_participants | email_id, role, email_address, display_name, party_id |
| attachments | attachment_id, email_id, document_id, filename, mime_type, size_bytes |
| audit_events | event_id, tenant_id, actor_id, action, target_type, target_id, matter_id, metadata_json, created_at, ip_address |
| ai_sessions | ai_session_id, tenant_id, user_id, matter_id, task_type, model_route, prompt_hash, response_hash, status, created_at |
| ai_retrieval_logs | retrieval_id, ai_session_id, document_id, version_id, chunk_id, score, retrieval_source, included, exclusion_reason |
| playbook_rules | rule_id, transaction_type, clause_type, client_side, preferred_position, fallback_position, red_flags, required_elements, escalation_required |
| drafting_patterns | pattern_id, clause_type, position, language, text, source_clause_id, approved_by, reusable |
| feedback_items | feedback_id, ai_session_id, reviewer_id, original_output, revised_output, error_type, score, reusable, created_at |
| evaluation_cases | eval_case_id, task_type, input_ref, expected_output, success_criteria, risk_level |
| permissions | permission_id, subject_type, subject_id, resource_type, resource_id, action, effect, condition_json |
| ethical_walls | wall_id, tenant_id, matter_id, wall_name, reason, status, created_by, created_at |
| retention_policies | policy_id, tenant_id, name, retention_period, trigger_event, disposition_action |
| legal_holds | hold_id, tenant_id, matter_id, document_id, reason, status, created_by, released_at |


## 4. State Model

### Matter State

Proposed → Open → Active → Closing → Closed → Archived → Disposal Review → Disposed.

### Document State

Draft → Internal Review → Client Sent → Counterparty Sent → Markup Received → Negotiation → Final → Executed → Archived → Disposal Locked → Deleted.

### AI Session State

Requested → Retrieval Running → Policy Blocked 또는 Generated → Citation Verified 또는 Warning → Saved 또는 Discarded.

### RFI State

Requested → Submitted → Reviewing → Supplement Requested → Complete → Reported.

### External Sharing State

Draft → Pending Approval → Active → Expired → Revoked → Archived.

## 5. Data Lifecycle Model

1. 생성: upload/import/ingestion.
2. 정규화: canonicalization, OCR, metadata extraction.
3. 색인: keyword/vector/graph indexing.
4. 사용: view/search/AI retrieval/share.
5. 보존: retention label, archive, legal hold.
6. 폐기: disposal request, approval, destruction certificate.

## 6. 추가 확인 필요

- 실제 DB 격리방식: shared DB + tenant_id, schema-per-tenant, DB-per-tenant 중 선택.
- HWP/HWPX parser 저장필드 확정.
- authority store의 국내 법률DB source_url 정책.
- 개인정보 컬럼 암호화/토큰화 범위.


---

<!-- 08_Security_Permission_Audit_Compliance.md -->

# 08. Security, Permission, Audit and Compliance Specification

## 1. 원칙

- Permission-before-search.
- Permission-before-AI.
- Audit-by-default.
- Fail closed.
- No silent external sharing.
- Immutable original.
- Sensitive data is not logged.

## 2. 권한 계층

| 계층 | 설명 |
|---|---|
| Tenant-level | 로펌/조직 단위 접근권한 |
| Client-level | 고객 단위 접근권한 |
| Matter-level | 사건·거래 단위 접근권한 |
| Document-level | 문서 단위 열람·수정·다운로드·공유 권한 |
| Clause-level restriction | 특정 조항·별지·민감정보 제한 |
| External workspace-level | VDR/고객포털 권한 |
| AI access policy | 모델별 자료 접근 가능 여부 |
| Retention/delete permission | 보존·폐기·legal hold 관련 권한 |

## 3. Role Model

| Role | 주요 권한 |
|---|---|
| Firm Admin | tenant 설정, 사용자, 정책, audit 조회 |
| Security Admin | 권한, 윤리장벽, DLP, 외부공유, 보안이벤트 |
| Matter Owner | Matter 설정, 팀원, 문서, 외부공유 승인 |
| Matter Member | 권한 범위 내 문서·이메일·AI 사용 |
| Limited Reviewer | 특정 문서/폴더 검토만 가능 |
| Knowledge Manager | 조항은행, 플레이북, 샘플 승인 |
| External User | 허용된 VDR 자료만 접근 |

## 4. Permission Enforcement Points

| 위치 | 적용 항목 |
|---|---|
| API Gateway | tenant, auth, session |
| Service Layer | matter/document/action 권한 |
| Query Builder | search/retrieval permission filter |
| AI Retrieval | aiAllowed, userReadAllowed, ethical wall |
| File Download | download permission, watermark, audit |
| External Portal | secure link, expiry, NDA, external role |

## 5. Ethical Wall

윤리장벽은 document search, email search, graph query, AI retrieval, external share, admin bulk export에 모두 적용합니다. 우회 접근은 break-glass policy와 dual approval을 요구합니다.

## 6. Audit Events

| 이벤트 | 필수 metadata |
|---|---|
| LOGIN_SUCCESS / LOGIN_FAILURE | user_id, ip, device, time |
| MATTER_CREATED / UPDATED | matter_id, actor_id, diff |
| DOCUMENT_UPLOADED | document_id, version_id, hash, matter_id |
| DOCUMENT_VIEWED | document_id, version_id, actor_id |
| DOCUMENT_DOWNLOADED | document_id, reason, ip |
| DOCUMENT_SHARED_EXTERNALLY | document_id, external_user/link_id, expiry |
| PERMISSION_CHANGED | before/after, approver |
| ETHICAL_WALL_APPLIED | wall_id, reason, scope |
| AI_QUERY_SUBMITTED | ai_session_id, model_route, matter_id |
| AI_DOCUMENT_RETRIEVED | document_id, chunk_id, included/excluded |
| RETENTION_POLICY_CHANGED | policy_id, before/after |
| LEGAL_HOLD_APPLIED | hold_id, document/matter |
| DISPOSAL_EXECUTED | certificate_id, approver |

## 7. DLP

민감정보 탐지 대상은 주민등록번호, 여권번호, 외국인등록번호, 계좌번호, 카드번호, 건강정보, 인사평가, 범죄경력, 영업비밀, 소스코드, 미공개중요정보, NDA상 비밀정보입니다.

## 8. 모델별 전송 정책

| 자료 유형 | Gemma 로컬 | 외부 상위모델 | 조건 |
|---|---|---|---|
| 공개자료 | 가능 | 가능 | 제한 낮음 |
| 내부 샘플 | 가능 | 제한적 가능 | 익명화 필요 |
| 고객 기밀자료 | 가능 | 원칙적 제한 | 승인 또는 익명화 |
| 미공개 M&A 자료 | 가능 | 매우 제한 | 고위험 gate |
| 분쟁 전략 메모 | 가능 | 원칙 금지 | 별도 승인 |
| 개인정보 포함자료 | 가능 | 제한 | 마스킹 필요 |
| 영업비밀 | 가능 | 제한 | need-to-know |

## 9. Release Security Gate

Critical release는 권한 regression, tenant isolation test, AI retrieval permission test, audit coverage, DLP test, rollback plan을 통과해야 합니다.


---

<!-- 09_API_Service_Contract.md -->

# 09. API and Service Contract Draft

## 1. 서비스 경계

| Service | 책임 |
|---|---|
| AuthService | 로그인, 세션, MFA, SSO |
| TenantService | tenant 설정과 context |
| MatterService | Client/Matter/Party/lifecycle |
| DocumentService | upload, storage, version, metadata |
| EmailService | ingestion, filing, attachment |
| PermissionService | RBAC/ABAC/Matter/document/action 권한 |
| AuditService | append-only audit event |
| SearchService | metadata/full-text/vector search |
| AIService | RAG, model gateway, AI session |
| GraphService | graph sync/query |
| PlaybookService | rule/playbook/clause pattern |
| ExternalPortalService | VDR, secure link, external user |
| RecordsService | retention, legal hold, disposal |
| AdminService | tenant admin, policy admin, analytics |

## 2. API Endpoints 초안

| Group | Endpoint | 설명 |
| --- | --- | --- |
| Auth | POST /auth/login | 로그인 |
| Auth | POST /auth/logout | 로그아웃 |
| Tenant | GET /tenant/settings | tenant 설정 조회 |
| Users | GET /users | 사용자 목록 |
| Clients | POST /clients | 고객 생성 |
| Clients | GET /clients/{clientId} | 고객 조회 |
| Matters | POST /matters | Matter 생성 |
| Matters | GET /matters/{matterId} | Matter 조회 |
| Matters | POST /matters/{matterId}/members | Matter member 추가 |
| Documents | POST /matters/{matterId}/documents | 문서 업로드 |
| Documents | GET /documents/{documentId} | 문서 조회 |
| Documents | GET /documents/{documentId}/versions | 버전 목록 |
| Documents | POST /documents/{documentId}/versions | 신규 버전 업로드 |
| Documents | GET /documents/{documentId}/download | 다운로드 |
| Documents | DELETE /documents/{documentId} | soft delete |
| Email | POST /matters/{matterId}/emails/file | 이메일 filing |
| Email | GET /emails/{emailId} | 이메일 조회 |
| Search | POST /search | 통합검색 |
| Search | POST /search/clauses | 조항검색 |
| AI | POST /ai/query | AI 질의 |
| AI | GET /ai/sessions/{sessionId} | AI 세션 조회 |
| Graph | GET /graph/matters/{matterId} | Matter graph 조회 |
| Playbook | POST /playbook/rules | 룰 생성 |
| External | POST /external-workspaces | 외부공간 생성 |
| External | POST /secure-links | 보안링크 생성 |
| Audit | GET /audit-events | 감사로그 검색 |
| Retention | POST /retention-policies | 보존정책 생성 |
| LegalHold | POST /legal-holds | legal hold 생성 |


## 3. 공통 API 원칙

- 모든 요청은 tenant context를 가져야 합니다.
- 모든 Matter/document/email/AI API는 permission check를 service layer에서 수행합니다.
- 검색 API는 permission-bound query builder를 사용해야 합니다.
- 파일 다운로드와 외부공유 API는 audit event가 필수입니다.
- AI API는 AI policy, aiAllowed, userReadAllowed, ethical wall을 모두 확인해야 합니다.
- 오류는 표준 error code로 반환합니다.

## 4. 표준 Error Code

| Code | 의미 |
|---|---|
| AUTH_REQUIRED | 인증 필요 |
| PERMISSION_DENIED | 권한 없음 |
| ETHICAL_WALL_BLOCKED | 윤리장벽 차단 |
| AI_POLICY_BLOCKED | AI 정책상 차단 |
| DOCUMENT_LOCKED | legal hold 또는 retention lock |
| VALIDATION_FAILED | 입력값 오류 |
| UNSUPPORTED_FILE_TYPE | 지원하지 않는 파일형식 |
| EXTERNAL_LINK_EXPIRED | 외부링크 만료 |
| TENANT_ISOLATION_VIOLATION | tenant 격리 위반 가능성 |

## 5. 추가 확인 필요

- API versioning 방식.
- gRPC/event contract 사용 여부.
- Webhook 및 external connector 인증 방식.


---

<!-- 10_UI_UX_Workflow_Specification.md -->

# 10. UI/UX and Workflow Specification

## 1. 핵심 화면

| 화면 | 기능 |
|---|---|
| Home Dashboard | 내 Matter, 최근 문서, 기한, 보안알림, AI 추천 |
| Matter Dashboard | 사건 개요, 담당자, key documents, issues, timeline, AI panel |
| Document List | 폴더/태그/필터, version status, confidentiality, search |
| Document Detail | preview, metadata, versions, clause panel, audit, AI summary |
| Search Page | 통합검색, facet, result card, snippet, source filter |
| Email Timeline | filed emails, thread summary, attachments |
| AI Panel | 질문, scope, evidence sources, citation, warning, save |
| Clause Bank | 조항 검색, approved reusable clause, fallback |
| Playbook Admin | rule, red flag, preferred/fallback position |
| DD Workspace | RFI, submitted docs, issue register, report inclusion |
| Litigation Workspace | evidence, fact ledger, issue tree, pleading |
| External Portal | NDA, folder, document viewer, Q&A, watermark |
| Audit Console | actor/action/target/time filter, export |
| Admin Console | user, role, policy, tenant settings, model policy |

## 2. Matter Workflow

Client 생성 → Matter 생성 → 이해상충 metadata 입력 → 팀원/권한 배정 → 문서/이메일 업로드 → 검색/검토/AI 사용 → 외부공유 → 종결 → archive/retention.

## 3. Document Workflow

파일 선택 → validation → Matter permission check → storage → hash → document/version 생성 → metadata extraction → OCR/text extraction → indexing → graph sync → audit.

## 4. AI Workflow

AI 질문 → scope 선택 → AI policy 표시 → retrieval 수행 → evidence pack 표시 → 답변 생성 → citation panel → warning/escalation → save feedback.

## 5. UX 원칙

- 권한 차단 사유는 보안을 해치지 않는 범위에서 명확히 표시합니다.
- AI 답변에는 근거와 불확실성을 표시합니다.
- 최종본, 상대방 수정본, 내부 초안은 시각적으로 구분합니다.
- 외부공유 전에는 만료일, 대상자, 다운로드 제한, watermark를 반드시 확인시킵니다.
- 법률문서 수정은 원문 표현을 최대한 보존하는 최소수정 모드를 기본으로 둡니다.


---

<!-- 11_Development_Operating_System.md -->

# 11. Risk-based, Verification-driven, Loop-based Vault Development Operating System

## 1. 정의

Vault 개발 운영체계는 제품 목표를 Product North Star와 Product Constitution으로 고정하고, 제품 구조를 PBS로 분해한 다음, DBS와 Execution Dependency Graph로 변환하며, 각 실행 node를 Testable Unit of Work로 정의하고, Agent Work Contract를 통해 모델 또는 개발자에게 배정한 뒤, Risk-based Model Routing에 따라 구현·검증·리뷰·통합·배포·학습 루프를 운영하는 체계입니다.

## 2. 핵심 용어

| 기존 표현 | 권장 표현 |
|---|---|
| Atomic Work Item | Testable Unit of Work |
| WBS 단일구조 | PBS + DBS + WBS |
| Task Graph | Execution Dependency Graph |
| Handoff Packet | Agent Work Contract |
| Acceptance Criteria | Verification Contract |
| Test Case | Verification Case |
| Definition of Ready/Done | Readiness Gate / Completion Gate |
| Planner–Executor | Planner–Executor–Verifier–Governor |
| High/Low model | Risk-based Model Routing |

## 3. 역할

| 역할 | 기능 |
|---|---|
| Planner | 제품·도메인·작업 분해 |
| Executor | TUW 구현 |
| Verifier | 테스트·검증·리뷰 수행 |
| Governor | 위험 판단, 중단, 승인, 에스컬레이션, release gate |

## 4. Loop

| Loop | 사용 위치 |
|---|---|
| Exploration Loop | 제품 방향, 아키텍처 후보, 기술후보 탐색 |
| Convergence Loop | 구현·검증·수정 반복 |
| Orchestrated Integration Loop | 여러 TUW/agent 산출물 통합 |
| Learning Loop | 운영 피드백을 상위 계획에 반영 |
| Governance Loop | 위험판단, 승인, 중단, 에스컬레이션 |

## 5. Gate

| Gate | 통과 기준 |
|---|---|
| Development Constitution Gate | 제품·데이터·보안·AI·검증 원칙 확정 |
| Product Direction Gate | North Star, core workflow, non-goals 확정 |
| Domain Model Gate | core object, state, permission model 확정 |
| Architecture Decision Gate | blueprint와 ADR 확정 |
| Readiness Gate | TUW의 입력·범위·검증·의존관계 명확 |
| Completion Gate | Verification Contract 통과 |
| Review Gate | specialist review 통과 |
| Integration Gate | 통합검증 통과 |
| Release Gate | 위험도별 배포승인 |
| Learning Gate | ledger 반영 |

## 6. Model Routing

| Risk | 예시 | 배정 |
|---|---|---|
| Low | UI badge, mock data, 문서화 | 저비용/로컬 모델 가능 |
| Medium | CRUD API, 일반 form, 기본 test | 저비용 모델 + 자동검증 |
| High | DB migration, 외부 API, parser | 코드 전문 모델 + 상위 리뷰 |
| Critical | auth, permission, ethical wall, tenant isolation, AI retrieval, VDR | 상위모델 + 보안리뷰 + 사람 Gate |

## 7. Ledger

Decision Ledger는 아키텍처·제품·보안·AI 정책 결정을 기록합니다. Execution Ledger는 각 TUW 실행과 검증 결과를 기록합니다. Learning Ledger는 반복 실패와 해결 패턴을 기록합니다.


---

<!-- 12_Execution_Dependency_Graph.md -->

# 12. Execution Dependency Graph

## 1. 목적

Execution Dependency Graph는 TUW 사이의 선후관계, 차단관계, 병렬 가능성, 충돌 가능성, 회귀위험, 검증 연결, 피드백 연결을 관리합니다.

## 2. Edge Types

| Edge | 의미 |
| --- | --- |
| Dependency Edge | 선행 작업 |
| Blocking Edge | 완료 전까지 후행 불가 |
| Parallel Edge | 병렬 가능 |
| Conflict Edge | 동시 진행 금지 또는 충돌 가능 |
| Verification Edge | 검증해야 할 연결 |
| Regression Edge | 회귀위험 연결 |
| Escalation Edge | 실패 시 상위로 올리는 경로 |
| Feedback Edge | 운영 피드백을 상위 설계로 반영 |
| Loop Edge | 실패·검수·수정 반복 |


## 3. 핵심 선후관계

| 선행 Node | 후행 Node |
| --- | --- |
| User/Auth | Matter permission |
| Tenant model | 모든 core object |
| Matter schema | Document upload, Email filing, AI retrieval |
| Document schema | Search indexing, AI chunking, graph sync |
| Permission service | Search, Document access, AI retrieval, VDR |
| AuditEvent schema | Document/Email/AI/External audit |
| Text extraction | Full-text search, vector indexing |
| Chunk store | RAG, clause search |
| Playbook store | Contract intelligence, AI risk analysis |
| Graph schema | GraphRAG, related matter, negotiation pattern |
| External sharing policy | VDR, secure link, watermark |
| Retention policy | delete, archive, legal hold |


## 4. R0~R6 Critical Path

1. Tenant/User/Auth.
2. Client/Matter schema.
3. Matter member와 permission service.
4. AuditEvent schema.
5. Document upload/version/hash.
6. Text extraction.
7. Search indexing.
8. Permission-bound search.
9. Chunk store.
10. AI policy.
11. Permission-bound retrieval.
12. Evidence Pack.
13. AI session/audit.

## 5. 병렬화 가능 영역

- UI skeleton과 backend skeleton은 API contract 확정 후 병렬 가능합니다.
- Document preview와 OCR worker는 upload pipeline 이후 병렬 가능합니다.
- Email ingestion과 Document Vault는 attachment linker 경계만 확정하면 병렬 가능합니다.
- Clause extraction과 playbook rule store는 clause taxonomy 확정 후 병렬 가능합니다.

## 6. 병렬화 금지 또는 주의 영역

- Permission model 확정 전 search/AI/VDR을 구현하면 재작업 위험이 큽니다.
- DocumentVersion model 확정 전 redline/contract intelligence 구현은 위험합니다.
- AI policy 확정 전 Gemma 연결은 금지합니다.
- Retention/legal hold 확정 전 hard delete 구현은 금지합니다.


---

<!-- 13_TUW_Master_Backlog.md -->

# 13. TUW Master Backlog

## 1. 목적

이 문서는 Vault 개발팀이 실제 티켓으로 변환할 수 있는 Testable Unit of Work 목록입니다. 각 TUW는 독립 구현·검증 가능한 최소 실행 단위를 목표로 합니다. 실제 repository 파일경로는 R0에서 repo 구조가 확정된 후 Agent Work Contract에 보정해야 합니다.

## 2. TUW 표준 필드

| 필드 | 설명 |
|---|---|
| Work ID | 고유 작업번호 |
| Pillar / Domain / Module | 상위 구조 |
| Objective | 작업 목적 |
| Outputs | 산출물 |
| Dependencies | 선행 작업 |
| Risk | Low / Medium / High / Critical |
| Model Routing | Risk-based 모델 배정 |
| Verification | Verification Contract 요약 |
| Escalation | 중단·상위검토 조건 |

## 3. 전체 TUW 목록

## P0. Development Operating System

| Work ID | Domain | Module | Title | Risk | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| DEVOPS-DEVECONS-CONSMANA-TUW-001 | Development Constitution | Constitution Manager | Product Constitution 초안 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DEVOPS-DEVECONS-CONSMANA-TUW-002 | Development Constitution | Constitution Manager | Data Constitution 초안 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DEVOPS-DEVECONS-CONSMANA-TUW-003 | Development Constitution | Constitution Manager | Security Constitution 초안 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DEVOPS-DEVECONS-CONSMANA-TUW-004 | Development Constitution | Constitution Manager | AI Constitution 초안 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DEVOPS-DEVECONS-CONSMANA-TUW-005 | Development Constitution | Constitution Manager | Verification Constitution 초안 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DEVOPS-DEVECONS-CONSMANA-TUW-006 | Development Constitution | Constitution Manager | Release Constitution 초안 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DEVOPS-DEVECONS-CONSMANA-TUW-007 | Development Constitution | Constitution Manager | Ledger Constitution 초안 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DEVOPS-WORKCONT-AGENWORKCO-TUW-001 | Work Contracting | Agent Work Contract Builder | Agent Work Contract 표준 필드 정의 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DEVOPS-WORKCONT-AGENWORKCO-TUW-002 | Work Contracting | Agent Work Contract Builder | Readiness Gate checklist 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DEVOPS-WORKCONT-AGENWORKCO-TUW-003 | Work Contracting | Agent Work Contract Builder | Completion Gate checklist 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DEVOPS-WORKCONT-AGENWORKCO-TUW-004 | Work Contracting | Agent Work Contract Builder | TUW risk level classifier 정의 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DEVOPS-WORKCONT-AGENWORKCO-TUW-005 | Work Contracting | Agent Work Contract Builder | Work Contract validation rule 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DEVOPS-WORKCONT-AGENWORKCO-TUW-006 | Work Contracting | Agent Work Contract Builder | Work Contract sample 10건 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DEVOPS-LEDG-LEDGSYST-TUW-001 | Ledger | Ledger System | Decision Ledger schema 작성 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DEVOPS-LEDG-LEDGSYST-TUW-002 | Ledger | Ledger System | Execution Ledger schema 작성 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DEVOPS-LEDG-LEDGSYST-TUW-003 | Ledger | Ledger System | Learning Ledger schema 작성 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DEVOPS-LEDG-LEDGSYST-TUW-004 | Ledger | Ledger System | Ledger record search 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DEVOPS-LEDG-LEDGSYST-TUW-005 | Ledger | Ledger System | Ledger update workflow 정의 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |

## P1. Foundation & SaaS Core

| Work ID | Domain | Module | Title | Risk | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CORE-REPOBUIL-CICD-TUW-001 | Repository & Build | CI/CD | monorepo skeleton 구성 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-REPOBUIL-CICD-TUW-002 | Repository & Build | CI/CD | backend/frontend/shared package 분리 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-REPOBUIL-CICD-TUW-003 | Repository & Build | CI/CD | lint/test/build CI 구성 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-REPOBUIL-CICD-TUW-004 | Repository & Build | CI/CD | staging deployment pipeline 구성 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-REPOBUIL-CICD-TUW-005 | Repository & Build | CI/CD | production deployment gate skeleton 구성 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-DATACORE-MIGR-TUW-001 | Database Core | Migration | PostgreSQL migration tool 설정 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-DATACORE-MIGR-TUW-002 | Database Core | Migration | initial schema migration 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-DATACORE-MIGR-TUW-003 | Database Core | Migration | seed data loader 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-DATACORE-MIGR-TUW-004 | Database Core | Migration | migration rollback 절차 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-DATACORE-MIGR-TUW-005 | Database Core | Migration | tenant_id 포함 migration convention 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-AUTHCORE-USERSESS-TUW-001 | Auth Core | User Session | User schema 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-AUTHCORE-USERSESS-TUW-002 | Auth Core | User Session | login API skeleton 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-AUTHCORE-USERSESS-TUW-003 | Auth Core | User Session | session middleware 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-AUTHCORE-USERSESS-TUW-004 | Auth Core | User Session | MFA flag field 추가 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-AUTHCORE-USERSESS-TUW-005 | Auth Core | User Session | password reset flow skeleton 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-TENACORE-TENACONT-TUW-001 | Tenant Core | Tenant Context | Tenant schema 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-TENACORE-TENACONT-TUW-002 | Tenant Core | Tenant Context | tenant context middleware 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-TENACORE-TENACONT-TUW-003 | Tenant Core | Tenant Context | workspace model 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-TENACORE-TENACONT-TUW-004 | Tenant Core | Tenant Context | cross-tenant access test 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-TENACORE-TENACONT-TUW-005 | Tenant Core | Tenant Context | tenant settings API 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-OBSE-LOGGMETR-TUW-001 | Observability | Logging Metrics | structured logger 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-OBSE-LOGGMETR-TUW-002 | Observability | Logging Metrics | request correlation id 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-OBSE-LOGGMETR-TUW-003 | Observability | Logging Metrics | health check endpoint 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-OBSE-LOGGMETR-TUW-004 | Observability | Logging Metrics | metrics endpoint 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CORE-OBSE-LOGGMETR-TUW-005 | Observability | Logging Metrics | error tracking hook 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |

## P2. Matter-Centric Core

| Work ID | Domain | Module | Title | Risk | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| MATTER-CLIEMANA-CLIEREGI-TUW-001 | Client Management | Client Registry | Client schema 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-CLIEMANA-CLIEREGI-TUW-002 | Client Management | Client Registry | client create API 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-CLIEMANA-CLIEREGI-TUW-003 | Client Management | Client Registry | client detail API 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-CLIEMANA-CLIEREGI-TUW-004 | Client Management | Client Registry | client list filtering 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-CLIEMANA-CLIEREGI-TUW-005 | Client Management | Client Registry | client metadata editor 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-MATTMANA-MATTREGI-TUW-001 | Matter Management | Matter Registry | Matter schema 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-MATTMANA-MATTREGI-TUW-002 | Matter Management | Matter Registry | Matter create API 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-MATTMANA-MATTREGI-TUW-003 | Matter Management | Matter Registry | Matter type taxonomy enum 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-MATTMANA-MATTREGI-TUW-004 | Matter Management | Matter Registry | Matter metadata validation 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-MATTMANA-MATTREGI-TUW-005 | Matter Management | Matter Registry | Matter detail API 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-MATTMANA-MATTREGI-TUW-006 | Matter Management | Matter Registry | Matter list pagination 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-MATTMANA-MATTREGI-TUW-007 | Matter Management | Matter Registry | Matter status badge UI 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-MATTTEAM-MEMBMANA-TUW-001 | Matter Team | Member Manager | Matter member schema 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-MATTTEAM-MEMBMANA-TUW-002 | Matter Team | Member Manager | member add API 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-MATTTEAM-MEMBMANA-TUW-003 | Matter Team | Member Manager | member remove API 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-MATTTEAM-MEMBMANA-TUW-004 | Matter Team | Member Manager | matter role assignment 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-MATTTEAM-MEMBMANA-TUW-005 | Matter Team | Member Manager | matter team UI 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-MATTTEAM-MEMBMANA-TUW-006 | Matter Team | Member Manager | member change audit hook 연결 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-MATTLIFE-STATENGI-TUW-001 | Matter Lifecycle | State Engine | Matter state enum 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-MATTLIFE-STATENGI-TUW-002 | Matter Lifecycle | State Engine | state transition validation 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-MATTLIFE-STATENGI-TUW-003 | Matter Lifecycle | State Engine | closing state action 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-MATTLIFE-STATENGI-TUW-004 | Matter Lifecycle | State Engine | archive state action 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-MATTLIFE-STATENGI-TUW-005 | Matter Lifecycle | State Engine | closed matter mutation 제한 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-PARTMANA-PARTREGI-TUW-001 | Party Management | Party Registry | Party schema 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-PARTMANA-PARTREGI-TUW-002 | Party Management | Party Registry | party role taxonomy 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-PARTMANA-PARTREGI-TUW-003 | Party Management | Party Registry | party create API 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-PARTMANA-PARTREGI-TUW-004 | Party Management | Party Registry | party-to-matter link 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| MATTER-PARTMANA-PARTREGI-TUW-005 | Party Management | Party Registry | restricted party marker 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |

## P3. Document Vault

| Work ID | Domain | Module | Title | Risk | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| DOC-DOCUUPLO-UPLOAPI-TUW-001 | Document Upload | Upload API | document upload API 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUUPLO-UPLOAPI-TUW-002 | Document Upload | Upload API | multipart parser 설정 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUUPLO-UPLOAPI-TUW-003 | Document Upload | Upload API | file extension validation 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUUPLO-UPLOAPI-TUW-004 | Document Upload | Upload API | MIME type validation 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUUPLO-UPLOAPI-TUW-005 | Document Upload | Upload API | file size validation 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUUPLO-UPLOAPI-TUW-006 | Document Upload | Upload API | upload permission check 연결 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUUPLO-UPLOAPI-TUW-007 | Document Upload | Upload API | upload error response 표준화 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUUPLO-UPLOAPI-TUW-008 | Document Upload | Upload API | bulk upload job skeleton 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUSTOR-OBJESTORAD-TUW-001 | Document Storage | Object Storage Adapter | object storage adapter 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUSTOR-OBJESTORAD-TUW-002 | Document Storage | Object Storage Adapter | storage path resolver 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUSTOR-OBJESTORAD-TUW-003 | Document Storage | Object Storage Adapter | file object record 생성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUSTOR-OBJESTORAD-TUW-004 | Document Storage | Object Storage Adapter | storage failure rollback 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUSTOR-OBJESTORAD-TUW-005 | Document Storage | Object Storage Adapter | encrypted storage hook interface 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUINTE-HASHDUPL-TUW-001 | Document Integrity | Hash Duplicate | SHA-256 hash 생성 함수 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUINTE-HASHDUPL-TUW-002 | Document Integrity | Hash Duplicate | DocumentVersion.hash 저장 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUINTE-HASHDUPL-TUW-003 | Document Integrity | Hash Duplicate | 동일 hash 중복 후보 탐지 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUINTE-HASHDUPL-TUW-004 | Document Integrity | Hash Duplicate | immutable original policy 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUINTE-HASHDUPL-TUW-005 | Document Integrity | Hash Duplicate | hash mismatch alert 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUMETA-METAEXTR-TUW-001 | Document Metadata | Metadata Extractor | Document metadata schema 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUMETA-METAEXTR-TUW-002 | Document Metadata | Metadata Extractor | document type enum 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUMETA-METAEXTR-TUW-003 | Document Metadata | Metadata Extractor | filename metadata parser 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUMETA-METAEXTR-TUW-004 | Document Metadata | Metadata Extractor | manual metadata editor API 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUMETA-METAEXTR-TUW-005 | Document Metadata | Metadata Extractor | metadata change audit 연결 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUMETA-METAEXTR-TUW-006 | Document Metadata | Metadata Extractor | document status enum 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUVERS-VERSRESO-TUW-001 | Document Versioning | Version Resolver | DocumentVersion schema 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUVERS-VERSRESO-TUW-002 | Document Versioning | Version Resolver | document_family_id 생성 규칙 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUVERS-VERSRESO-TUW-003 | Document Versioning | Version Resolver | version_no 계산 함수 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUVERS-VERSRESO-TUW-004 | Document Versioning | Version Resolver | new version upload API 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUVERS-VERSRESO-TUW-005 | Document Versioning | Version Resolver | version list API 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUVERS-VERSRESO-TUW-006 | Document Versioning | Version Resolver | superseded version 표시 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCUVERS-VERSRESO-TUW-007 | Document Versioning | Version Resolver | version status filter 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-OCRTEXTEXT-EXTRWORK-TUW-001 | OCR Text Extraction | Extraction Worker | extraction job queue 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-OCRTEXTEXT-EXTRWORK-TUW-002 | OCR Text Extraction | Extraction Worker | PDF text extractor adapter 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-OCRTEXTEXT-EXTRWORK-TUW-003 | OCR Text Extraction | Extraction Worker | DOCX text extractor adapter 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-OCRTEXTEXT-EXTRWORK-TUW-004 | OCR Text Extraction | Extraction Worker | OCR pending status 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-OCRTEXTEXT-EXTRWORK-TUW-005 | OCR Text Extraction | Extraction Worker | extraction confidence 저장 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-OCRTEXTEXT-EXTRWORK-TUW-006 | OCR Text Extraction | Extraction Worker | extraction failure retry 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCULIFE-LIFEMANA-TUW-001 | Document Lifecycle | Lifecycle Manager | soft delete 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCULIFE-LIFEMANA-TUW-002 | Document Lifecycle | Lifecycle Manager | restore 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCULIFE-LIFEMANA-TUW-003 | Document Lifecycle | Lifecycle Manager | legal hold delete block hook 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCULIFE-LIFEMANA-TUW-004 | Document Lifecycle | Lifecycle Manager | archived document mutation 제한 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCULIFE-LIFEMANA-TUW-005 | Document Lifecycle | Lifecycle Manager | download audit 연결 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DOC-DOCULIFE-LIFEMANA-TUW-006 | Document Lifecycle | Lifecycle Manager | view audit 연결 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |

## P4. Permission & Security Governance

| Work ID | Domain | Module | Title | Risk | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| SEC-RBAC-ROLEMATR-TUW-001 | RBAC | Role Matrix | role enum 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-RBAC-ROLEMATR-TUW-002 | RBAC | Role Matrix | role permission matrix 작성 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-RBAC-ROLEMATR-TUW-003 | RBAC | Role Matrix | role assignment API 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-RBAC-ROLEMATR-TUW-004 | RBAC | Role Matrix | role change audit 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-RBAC-ROLEMATR-TUW-005 | RBAC | Role Matrix | admin-only route guard 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-MATTPERM-ACCECONT-TUW-001 | Matter Permission | Access Control | canReadMatter 함수 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-MATTPERM-ACCECONT-TUW-002 | Matter Permission | Access Control | canEditMatter 함수 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-MATTPERM-ACCECONT-TUW-003 | Matter Permission | Access Control | canUploadToMatter 함수 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-MATTPERM-ACCECONT-TUW-004 | Matter Permission | Access Control | Matter member 아닌 사용자 접근 차단 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-MATTPERM-ACCECONT-TUW-005 | Matter Permission | Access Control | Matter search permission filter 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-MATTPERM-ACCECONT-TUW-006 | Matter Permission | Access Control | fail closed permission wrapper 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-DOCUPERM-ACCECONT-TUW-001 | Document Permission | Access Control | canReadDocument 함수 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-DOCUPERM-ACCECONT-TUW-002 | Document Permission | Access Control | canDownloadDocument 함수 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-DOCUPERM-ACCECONT-TUW-003 | Document Permission | Access Control | document confidentiality policy 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-DOCUPERM-ACCECONT-TUW-004 | Document Permission | Access Control | download reason requirement 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-DOCUPERM-ACCECONT-TUW-005 | Document Permission | Access Control | document permission UI 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-DOCUPERM-ACCECONT-TUW-006 | Document Permission | Access Control | permission denied safe message 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-ETHIWALL-WALLENFO-TUW-001 | Ethical Wall | Wall Enforcement | EthicalWall schema 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-ETHIWALL-WALLENFO-TUW-002 | Ethical Wall | Wall Enforcement | wall membership schema 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-ETHIWALL-WALLENFO-TUW-003 | Ethical Wall | Wall Enforcement | wall create API 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-ETHIWALL-WALLENFO-TUW-004 | Ethical Wall | Wall Enforcement | wall enforcement in document access | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-ETHIWALL-WALLENFO-TUW-005 | Ethical Wall | Wall Enforcement | wall enforcement in search | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-ETHIWALL-WALLENFO-TUW-006 | Ethical Wall | Wall Enforcement | wall enforcement in AI retrieval | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-ETHIWALL-WALLENFO-TUW-007 | Ethical Wall | Wall Enforcement | wall bypass break-glass workflow skeleton 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-DLP-SENSDATADE-TUW-001 | DLP | Sensitive Data Detector | 주민등록번호 탐지 rule 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-DLP-SENSDATADE-TUW-002 | DLP | Sensitive Data Detector | 계좌번호 탐지 rule 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-DLP-SENSDATADE-TUW-003 | DLP | Sensitive Data Detector | 이메일/전화번호 탐지 rule 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-DLP-SENSDATADE-TUW-004 | DLP | Sensitive Data Detector | DLP finding schema 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-DLP-SENSDATADE-TUW-005 | DLP | Sensitive Data Detector | external sharing DLP warning 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEC-DLP-SENSDATADE-TUW-006 | DLP | Sensitive Data Detector | AI external model DLP block hook 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |

## P5. Audit & Compliance Ledger

| Work ID | Domain | Module | Title | Risk | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| AUDIT-AUDIEVENCO-AUDILOGG-TUW-001 | Audit Event Core | Audit Logger | AuditEvent schema 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-AUDIEVENCO-AUDILOGG-TUW-002 | Audit Event Core | Audit Logger | audit logger service 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-AUDIEVENCO-AUDILOGG-TUW-003 | Audit Event Core | Audit Logger | audit metadata normalizer 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-AUDIEVENCO-AUDILOGG-TUW-004 | Audit Event Core | Audit Logger | append-only constraint 설계 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-AUDIEVENCO-AUDILOGG-TUW-005 | Audit Event Core | Audit Logger | audit event retention label 연결 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-DOCUAUDI-DOCUEVEN-TUW-001 | Document Audit | Document Events | DOCUMENT_UPLOADED audit 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-DOCUAUDI-DOCUEVEN-TUW-002 | Document Audit | Document Events | DOCUMENT_VIEWED audit 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-DOCUAUDI-DOCUEVEN-TUW-003 | Document Audit | Document Events | DOCUMENT_DOWNLOADED audit 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-DOCUAUDI-DOCUEVEN-TUW-004 | Document Audit | Document Events | DOCUMENT_DELETED audit 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-DOCUAUDI-DOCUEVEN-TUW-005 | Document Audit | Document Events | document audit query API 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-AIAUDI-AIEVEN-TUW-001 | AI Audit | AI Events | AI_QUERY_SUBMITTED audit 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-AIAUDI-AIEVEN-TUW-002 | AI Audit | AI Events | AI_RETRIEVAL audit 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-AIAUDI-AIEVEN-TUW-003 | AI Audit | AI Events | AI_RESPONSE audit 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-AIAUDI-AIEVEN-TUW-004 | AI Audit | AI Events | cited document log 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-AIAUDI-AIEVEN-TUW-005 | AI Audit | AI Events | excluded retrieval count metadata 저장 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-AUDICONS-CONS-TUW-001 | Audit Console | Console | audit search API 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-AUDICONS-CONS-TUW-002 | Audit Console | Console | actor/action/date filter 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-AUDICONS-CONS-TUW-003 | Audit Console | Console | target resource filter 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-AUDICONS-CONS-TUW-004 | Audit Console | Console | audit export CSV 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AUDIT-AUDICONS-CONS-TUW-005 | Audit Console | Console | audit console UI 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |

## P6. Search & Retrieval

| Work ID | Domain | Module | Title | Risk | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| SEARCH-SEARINDE-INDE-TUW-001 | Search Indexing | Indexer | search index schema 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-SEARINDE-INDE-TUW-002 | Search Indexing | Indexer | document indexing job enqueue | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-SEARINDE-INDE-TUW-003 | Search Indexing | Indexer | index update on metadata change | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-SEARINDE-INDE-TUW-004 | Search Indexing | Indexer | reindex manager skeleton | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-SEARINDE-INDE-TUW-005 | Search Indexing | Indexer | index failure retry 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-METASEAR-FILT-TUW-001 | Metadata Search | Filters | matterId filter 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-METASEAR-FILT-TUW-002 | Metadata Search | Filters | clientId filter 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-METASEAR-FILT-TUW-003 | Metadata Search | Filters | documentType filter 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-METASEAR-FILT-TUW-004 | Metadata Search | Filters | date range filter 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-METASEAR-FILT-TUW-005 | Metadata Search | Filters | version status filter 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-FULLSEAR-TEXTQUER-TUW-001 | Full-text Search | Text Query | full-text query API 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-FULLSEAR-TEXTQUER-TUW-002 | Full-text Search | Text Query | snippet generator 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-FULLSEAR-TEXTQUER-TUW-003 | Full-text Search | Text Query | highlighting 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-FULLSEAR-TEXTQUER-TUW-004 | Full-text Search | Text Query | deleted document exclusion 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-FULLSEAR-TEXTQUER-TUW-005 | Full-text Search | Text Query | search audit event 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-PERMSEAR-PERMFILT-TUW-001 | Permission-bound Search | Permission Filter | search query에 matter permission filter 주입 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-PERMSEAR-PERMFILT-TUW-002 | Permission-bound Search | Permission Filter | document permission filter 주입 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-PERMSEAR-PERMFILT-TUW-003 | Permission-bound Search | Permission Filter | ethical wall filter 주입 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-PERMSEAR-PERMFILT-TUW-004 | Permission-bound Search | Permission Filter | permission filter regression test 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-PERMSEAR-PERMFILT-TUW-005 | Permission-bound Search | Permission Filter | metadata leakage test 작성 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-SEMASEAR-VECT-TUW-001 | Semantic Search | Vector | embedding job skeleton 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-SEMASEAR-VECT-TUW-002 | Semantic Search | Vector | vector index table/collection 설계 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-SEMASEAR-VECT-TUW-003 | Semantic Search | Vector | similarity search API 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-SEMASEAR-VECT-TUW-004 | Semantic Search | Vector | hybrid score combiner 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| SEARCH-SEMASEAR-VECT-TUW-005 | Semantic Search | Vector | semantic result permission filter 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |

## P7. Email Vault

| Work ID | Domain | Module | Title | Risk | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| EMAIL-EMAIINGE-PARS-TUW-001 | Email Ingestion | Parser | EmailMessage schema 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-EMAIINGE-PARS-TUW-002 | Email Ingestion | Parser | EML parser adapter 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-EMAIINGE-PARS-TUW-003 | Email Ingestion | Parser | MSG parser adapter skeleton 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-EMAIINGE-PARS-TUW-004 | Email Ingestion | Parser | raw email file storage 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-EMAIINGE-PARS-TUW-005 | Email Ingestion | Parser | messageId duplicate block 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-EMAIMETA-NORM-TUW-001 | Email Metadata | Normalizer | header extractor 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-EMAIMETA-NORM-TUW-002 | Email Metadata | Normalizer | participant normalize 함수 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-EMAIMETA-NORM-TUW-003 | Email Metadata | Normalizer | sent/received date normalize 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-EMAIMETA-NORM-TUW-004 | Email Metadata | Normalizer | external participant flag 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-EMAIMETA-NORM-TUW-005 | Email Metadata | Normalizer | email metadata audit 연결 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-ATTAHAND-ATTALINK-TUW-001 | Attachment Handling | Attachment Linker | attachment metadata extractor 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-ATTAHAND-ATTALINK-TUW-002 | Attachment Handling | Attachment Linker | attachment file object 생성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-ATTAHAND-ATTALINK-TUW-003 | Attachment Handling | Attachment Linker | attachment를 Document로 저장 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-ATTAHAND-ATTALINK-TUW-004 | Attachment Handling | Attachment Linker | email attachment-document link 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-ATTAHAND-ATTALINK-TUW-005 | Attachment Handling | Attachment Linker | attachment duplicate hash 처리 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-MATTFILI-FILIENGI-TUW-001 | Matter Filing | Filing Engine | manual filing API 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-MATTFILI-FILIENGI-TUW-002 | Matter Filing | Filing Engine | matter recommendation by subject 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-MATTFILI-FILIENGI-TUW-003 | Matter Filing | Filing Engine | matter recommendation by participant domain 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-MATTFILI-FILIENGI-TUW-004 | Matter Filing | Filing Engine | email filing audit 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-MATTFILI-FILIENGI-TUW-005 | Matter Filing | Filing Engine | email timeline item 생성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-EMAISECU-EMAIDLP-TUW-001 | Email Security | Email DLP | external recipient warning 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-EMAISECU-EMAIDLP-TUW-002 | Email Security | Email DLP | attachment DLP scan hook 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-EMAISECU-EMAIDLP-TUW-003 | Email Security | Email DLP | privilege tag suggestion 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| EMAIL-EMAISECU-EMAIDLP-TUW-004 | Email Security | Email DLP | wrong matter filing warning skeleton 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |

## P8. AI Knowledge Layer

| Work ID | Domain | Module | Title | Risk | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| AI-AIPOLI-POLIEVAL-TUW-001 | AI Policy | Policy Evaluator | Matter.aiPolicy enum 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AIPOLI-POLIEVAL-TUW-002 | AI Policy | Policy Evaluator | Document.aiAllowed field 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AIPOLI-POLIEVAL-TUW-003 | AI Policy | Policy Evaluator | AI policy evaluator 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AIPOLI-POLIEVAL-TUW-004 | AI Policy | Policy Evaluator | AI blocked response 표준화 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AIPOLI-POLIEVAL-TUW-005 | AI Policy | Policy Evaluator | model access policy table 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AIRETR-RETRORCH-TUW-001 | AI Retrieval | Retrieval Orchestrator | question type classifier 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AIRETR-RETRORCH-TUW-002 | AI Retrieval | Retrieval Orchestrator | metadata filter builder 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AIRETR-RETRORCH-TUW-003 | AI Retrieval | Retrieval Orchestrator | hybrid retrieval orchestrator skeleton | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AIRETR-RETRORCH-TUW-004 | AI Retrieval | Retrieval Orchestrator | permission-bound retrieval filter 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AIRETR-RETRORCH-TUW-005 | AI Retrieval | Retrieval Orchestrator | redaction preprocessor hook 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AIRETR-RETRORCH-TUW-006 | AI Retrieval | Retrieval Orchestrator | retrieval reranker interface 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AICONT-CHUNEVID-TUW-001 | AI Context | Chunk Evidence | parent-child chunk builder 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AICONT-CHUNEVID-TUW-002 | AI Context | Chunk Evidence | chunk provenance schema 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AICONT-CHUNEVID-TUW-003 | AI Context | Chunk Evidence | context ranker 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AICONT-CHUNEVID-TUW-004 | AI Context | Chunk Evidence | context window manager 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AICONT-CHUNEVID-TUW-005 | AI Context | Chunk Evidence | Evidence Pack schema 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AICONT-CHUNEVID-TUW-006 | AI Context | Chunk Evidence | Evidence Pack builder 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AISESS-SESSLOGG-TUW-001 | AI Session | Session Logger | AISession schema 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AISESS-SESSLOGG-TUW-002 | AI Session | Session Logger | prompt hash 저장 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AISESS-SESSLOGG-TUW-003 | AI Session | Session Logger | response hash 저장 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AISESS-SESSLOGG-TUW-004 | AI Session | Session Logger | retrieved chunk log 저장 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AISESS-SESSLOGG-TUW-005 | AI Session | Session Logger | AI session detail API 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-CITA-CITAMAPP-TUW-001 | Citation | Citation Mapper | citation object schema 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-CITA-CITAMAPP-TUW-002 | Citation | Citation Mapper | chunk-to-source mapper 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-CITA-CITAMAPP-TUW-003 | Citation | Citation Mapper | citedDocumentIds 저장 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-CITA-CITAMAPP-TUW-004 | Citation | Citation Mapper | source panel API 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-CITA-CITAMAPP-TUW-005 | Citation | Citation Mapper | citation verification warning 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AIFEAT-SUMM-TUW-001 | AI Features | Summaries | document summary prompt template 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AIFEAT-SUMM-TUW-002 | AI Features | Summaries | matter summary prompt template 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AIFEAT-SUMM-TUW-003 | AI Features | Summaries | email thread summary template 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AIFEAT-SUMM-TUW-004 | AI Features | Summaries | clause analysis template 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-AIFEAT-SUMM-TUW-005 | AI Features | Summaries | risk extraction template 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-MODEROUT-RISKROUT-TUW-001 | Model Routing | Risk Router | model tier enum 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-MODEROUT-RISKROUT-TUW-002 | Model Routing | Risk Router | task risk classifier 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-MODEROUT-RISKROUT-TUW-003 | Model Routing | Risk Router | local Gemma route 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-MODEROUT-RISKROUT-TUW-004 | Model Routing | Risk Router | external model approval hook 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| AI-MODEROUT-RISKROUT-TUW-005 | Model Routing | Risk Router | escalation flag 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |

## P9. Legal Knowledge Graph

| Work ID | Domain | Module | Title | Risk | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| GRAPH-GRAPSCHE-NODEEDGETA-TUW-001 | Graph Schema | Node Edge Taxonomy | graph node taxonomy 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| GRAPH-GRAPSCHE-NODEEDGETA-TUW-002 | Graph Schema | Node Edge Taxonomy | graph edge taxonomy 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| GRAPH-GRAPSCHE-NODEEDGETA-TUW-003 | Graph Schema | Node Edge Taxonomy | graph permission model 설계 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| GRAPH-GRAPSCHE-NODEEDGETA-TUW-004 | Graph Schema | Node Edge Taxonomy | graph schema migration 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| GRAPH-NODEMAPP-NODEMAPP-TUW-001 | Node Mapping | Node Mapper | Client node mapper 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| GRAPH-NODEMAPP-NODEMAPP-TUW-002 | Node Mapping | Node Mapper | Matter node mapper 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| GRAPH-NODEMAPP-NODEMAPP-TUW-003 | Node Mapping | Node Mapper | Document node mapper 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| GRAPH-NODEMAPP-NODEMAPP-TUW-004 | Node Mapping | Node Mapper | Clause node mapper 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| GRAPH-NODEMAPP-NODEMAPP-TUW-005 | Node Mapping | Node Mapper | Issue node mapper 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| GRAPH-EDGEBUIL-EDGEBUIL-TUW-001 | Edge Building | Edge Builder | Client-HAS_MATTER edge 생성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| GRAPH-EDGEBUIL-EDGEBUIL-TUW-002 | Edge Building | Edge Builder | Matter-CONTAINS_DOCUMENT edge 생성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| GRAPH-EDGEBUIL-EDGEBUIL-TUW-003 | Edge Building | Edge Builder | Document-HAS_CLAUSE edge 생성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| GRAPH-EDGEBUIL-EDGEBUIL-TUW-004 | Edge Building | Edge Builder | Clause-RELATES_TO-Issue edge 생성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| GRAPH-EDGEBUIL-EDGEBUIL-TUW-005 | Edge Building | Edge Builder | Clause-REFERENCES-Clause edge 생성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| GRAPH-GRAPSYNC-SYNCWORK-TUW-001 | Graph Sync | Sync Worker | event-based graph sync 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| GRAPH-GRAPSYNC-SYNCWORK-TUW-002 | Graph Sync | Sync Worker | graph sync retry queue 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| GRAPH-GRAPSYNC-SYNCWORK-TUW-003 | Graph Sync | Sync Worker | graph consistency checker 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| GRAPH-GRAPSYNC-SYNCWORK-TUW-004 | Graph Sync | Sync Worker | deleted document graph filter 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| GRAPH-GRAPSYNC-SYNCWORK-TUW-005 | Graph Sync | Sync Worker | graph sync audit event 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |

## P10. Contract Intelligence

| Work ID | Domain | Module | Title | Risk | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| CONTRACT-CONTCLAS-CLAS-TUW-001 | Contract Classification | Classifier | contract type enum 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CONTCLAS-CLAS-TUW-002 | Contract Classification | Classifier | language detector 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CONTCLAS-CLAS-TUW-003 | Contract Classification | Classifier | contract type classifier v1 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CONTCLAS-CLAS-TUW-004 | Contract Classification | Classifier | document subtype metadata update 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CONTCLAS-CLAS-TUW-005 | Contract Classification | Classifier | classification confidence 저장 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CONTSTRU-PARS-TUW-001 | Contract Structure | Parser | section heading parser 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CONTSTRU-PARS-TUW-002 | Contract Structure | Parser | clause number regex 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CONTSTRU-PARS-TUW-003 | Contract Structure | Parser | defined term extractor 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CONTSTRU-PARS-TUW-004 | Contract Structure | Parser | cross-reference extractor 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CONTSTRU-PARS-TUW-005 | Contract Structure | Parser | signature block detector 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CLAUEXTR-SEGM-TUW-001 | Clause Extraction | Segmenter | clause segmenter 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CLAUEXTR-SEGM-TUW-002 | Clause Extraction | Segmenter | clause type classifier v1 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CLAUEXTR-SEGM-TUW-003 | Clause Extraction | Segmenter | clause metadata extractor 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CLAUEXTR-SEGM-TUW-004 | Clause Extraction | Segmenter | Clause record create worker 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CLAUEXTR-SEGM-TUW-005 | Clause Extraction | Segmenter | clause extraction verification fixtures 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-REDLANAL-DOCXPARS-TUW-001 | Redline Analysis | DOCX Parser | DOCX w:ins 추출 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-REDLANAL-DOCXPARS-TUW-002 | Redline Analysis | DOCX Parser | DOCX w:del 추출 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-REDLANAL-DOCXPARS-TUW-003 | Redline Analysis | DOCX Parser | DOCX comment 추출 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-REDLANAL-DOCXPARS-TUW-004 | Redline Analysis | DOCX Parser | Change object mapper 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-REDLANAL-DOCXPARS-TUW-005 | Redline Analysis | DOCX Parser | markup summary generator 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-RISKSCOR-RULEENGI-TUW-001 | Risk Scoring | Rule Engine | SPA indemnity rule v1 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-RISKSCOR-RULEENGI-TUW-002 | Risk Scoring | Rule Engine | SHA governance rule v1 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-RISKSCOR-RULEENGI-TUW-003 | Risk Scoring | Rule Engine | investment MFN rule v1 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-RISKSCOR-RULEENGI-TUW-004 | Risk Scoring | Rule Engine | supply IP rule v1 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-RISKSCOR-RULEENGI-TUW-005 | Risk Scoring | Rule Engine | missing clause detector 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CLAUBANK-REPO-TUW-001 | Clause Bank | Repository | clause bank schema 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CLAUBANK-REPO-TUW-002 | Clause Bank | Repository | reusable approval workflow 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CLAUBANK-REPO-TUW-003 | Clause Bank | Repository | fallback clause link 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CLAUBANK-REPO-TUW-004 | Clause Bank | Repository | source matter permission check 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| CONTRACT-CLAUBANK-REPO-TUW-005 | Clause Bank | Repository | clause bank search UI 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |

## P11. Due Diligence Vault

| Work ID | Domain | Module | Title | Risk | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| DD-RFIMANA-RFICORE-TUW-001 | RFI Management | RFI Core | RFI schema 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DD-RFIMANA-RFICORE-TUW-002 | RFI Management | RFI Core | RFI category enum 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DD-RFIMANA-RFICORE-TUW-003 | RFI Management | RFI Core | RFI status enum 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DD-RFIMANA-RFICORE-TUW-004 | RFI Management | RFI Core | RFI template import 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DD-RFIMANA-RFICORE-TUW-005 | RFI Management | RFI Core | RFI list UI 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DD-DATAROOMMA-RFIDOCULIN-TUW-001 | Data Room Mapping | RFI Document Linker | RFI-document link 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DD-DATAROOMMA-RFIDOCULIN-TUW-002 | Data Room Mapping | RFI Document Linker | missing document detector 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DD-DATAROOMMA-RFIDOCULIN-TUW-003 | Data Room Mapping | RFI Document Linker | supplement request status 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DD-DATAROOMMA-RFIDOCULIN-TUW-004 | Data Room Mapping | RFI Document Linker | RFI overdue flag 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DD-DATAROOMMA-RFIDOCULIN-TUW-005 | Data Room Mapping | RFI Document Linker | RFI audit event 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DD-ISSUMANA-DDISSU-TUW-001 | Issue Management | DD Issue | DD issue schema 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DD-ISSUMANA-DDISSU-TUW-002 | Issue Management | DD Issue | risk level enum 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DD-ISSUMANA-DDISSU-TUW-003 | Issue Management | DD Issue | source document citation link 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DD-ISSUMANA-DDISSU-TUW-004 | Issue Management | DD Issue | report inclusion flag 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| DD-ISSUMANA-DDISSU-TUW-005 | Issue Management | DD Issue | DD issue table UI 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |

## P12. Litigation Vault

| Work ID | Domain | Module | Title | Risk | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| LIT-EVIDMANA-EVIDCORE-TUW-001 | Evidence Management | Evidence Core | Evidence schema 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| LIT-EVIDMANA-EVIDCORE-TUW-002 | Evidence Management | Evidence Core | evidence number format 설정 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| LIT-EVIDMANA-EVIDCORE-TUW-003 | Evidence Management | Evidence Core | evidence number duplicate validation | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| LIT-EVIDMANA-EVIDCORE-TUW-004 | Evidence Management | Evidence Core | evidence metadata editor 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| LIT-EVIDMANA-EVIDCORE-TUW-005 | Evidence Management | Evidence Core | evidence audit event 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| LIT-FACTLEDG-FACTSOUR-TUW-001 | Fact Ledger | Fact Source | FactLedgerItem schema 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| LIT-FACTLEDG-FACTSOUR-TUW-002 | Fact Ledger | Fact Source | fact-evidence link 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| LIT-FACTLEDG-FACTSOUR-TUW-003 | Fact Ledger | Fact Source | disputed flag 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| LIT-FACTLEDG-FACTSOUR-TUW-004 | Fact Ledger | Fact Source | fact timeline sort API 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| LIT-FACTLEDG-FACTSOUR-TUW-005 | Fact Ledger | Fact Source | fact ledger UI table 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| LIT-ISSUTREE-ISSUEVID-TUW-001 | Issue Tree | Issue Evidence | IssueTree node schema 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| LIT-ISSUTREE-ISSUEVID-TUW-002 | Issue Tree | Issue Evidence | issue hierarchy API 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| LIT-ISSUTREE-ISSUEVID-TUW-003 | Issue Tree | Issue Evidence | issue-evidence link 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| LIT-ISSUTREE-ISSUEVID-TUW-004 | Issue Tree | Issue Evidence | issue tree UI 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| LIT-ISSUTREE-ISSUEVID-TUW-005 | Issue Tree | Issue Evidence | authority support link 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |

## P13. External Portal / VDR

| Work ID | Domain | Module | Title | Risk | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| VDR-EXTEWORK-WORK-TUW-001 | External Workspace | Workspace | ExternalWorkspace schema 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-EXTEWORK-WORK-TUW-002 | External Workspace | Workspace | external workspace create API 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-EXTEWORK-WORK-TUW-003 | External Workspace | Workspace | workspace permission model 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-EXTEWORK-WORK-TUW-004 | External Workspace | Workspace | workspace expiration 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-EXTEWORK-WORK-TUW-005 | External Workspace | Workspace | workspace audit event 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-EXTEUSER-INVI-TUW-001 | External User | Invitation | ExternalUser schema 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-EXTEUSER-INVI-TUW-002 | External User | Invitation | external invitation token 생성 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-EXTEUSER-INVI-TUW-003 | External User | Invitation | external MFA requirement flag 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-EXTEUSER-INVI-TUW-004 | External User | Invitation | external user access status 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-EXTEUSER-INVI-TUW-005 | External User | Invitation | invitation audit event 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-SECULINK-LINKSECU-TUW-001 | Secure Link | Link Security | secure link schema 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-SECULINK-LINKSECU-TUW-002 | Secure Link | Link Security | expiresAt validation 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-SECULINK-LINKSECU-TUW-003 | Secure Link | Link Security | revocation 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-SECULINK-LINKSECU-TUW-004 | Secure Link | Link Security | expired link access block 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-SECULINK-LINKSECU-TUW-005 | Secure Link | Link Security | secure link audit event 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-WATE-VIEWWATE-TUW-001 | Watermark | Viewer Watermark | PDF watermark overlay 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-WATE-VIEWWATE-TUW-002 | Watermark | Viewer Watermark | viewer watermark 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-WATE-VIEWWATE-TUW-003 | Watermark | Viewer Watermark | download-disabled viewer mode 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-WATE-VIEWWATE-TUW-004 | Watermark | Viewer Watermark | watermark audit metadata 저장 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-QA-QAWORK-TUW-001 | Q&A | Q&A Workflow | Q&A thread schema 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-QA-QAWORK-TUW-002 | Q&A | Q&A Workflow | question create API 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-QA-QAWORK-TUW-003 | Q&A | Q&A Workflow | answer workflow 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-QA-QAWORK-TUW-004 | Q&A | Q&A Workflow | Q&A export 구현 | Medium | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| VDR-QA-QAWORK-TUW-005 | Q&A | Q&A Workflow | external Q&A audit 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |

## P14. Records Management

| Work ID | Domain | Module | Title | Risk | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| RECORD-RETEPOLI-POLIENGI-TUW-001 | Retention Policy | Policy Engine | RetentionPolicy schema 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| RECORD-RETEPOLI-POLIENGI-TUW-002 | Retention Policy | Policy Engine | policy assignment to Matter 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| RECORD-RETEPOLI-POLIENGI-TUW-003 | Retention Policy | Policy Engine | retention calculator 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| RECORD-RETEPOLI-POLIENGI-TUW-004 | Retention Policy | Policy Engine | expired candidate query 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| RECORD-RETEPOLI-POLIENGI-TUW-005 | Retention Policy | Policy Engine | retention report API 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| RECORD-LEGAHOLD-HOLDENFO-TUW-001 | Legal Hold | Hold Enforcement | LegalHold schema 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| RECORD-LEGAHOLD-HOLDENFO-TUW-002 | Legal Hold | Hold Enforcement | legal hold apply API 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| RECORD-LEGAHOLD-HOLDENFO-TUW-003 | Legal Hold | Hold Enforcement | legal hold delete block 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| RECORD-LEGAHOLD-HOLDENFO-TUW-004 | Legal Hold | Hold Enforcement | hold release workflow 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| RECORD-LEGAHOLD-HOLDENFO-TUW-005 | Legal Hold | Hold Enforcement | legal hold audit event 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| RECORD-DISPWORK-DISPAPPR-TUW-001 | Disposal Workflow | Disposal Approval | DisposalRequest schema 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| RECORD-DISPWORK-DISPAPPR-TUW-002 | Disposal Workflow | Disposal Approval | disposal approval status 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| RECORD-DISPWORK-DISPAPPR-TUW-003 | Disposal Workflow | Disposal Approval | hard delete precondition check 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| RECORD-DISPWORK-DISPAPPR-TUW-004 | Disposal Workflow | Disposal Approval | destruction certificate generator 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| RECORD-DISPWORK-DISPAPPR-TUW-005 | Disposal Workflow | Disposal Approval | disposal audit event 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |

## P15. Integration Layer

| Work ID | Domain | Module | Title | Risk | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| INT-MICR365-OUTLWORD-TUW-001 | Microsoft 365 | Outlook Word | Outlook add-in filing API contract 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| INT-MICR365-OUTLWORD-TUW-002 | Microsoft 365 | Outlook Word | Word add-in save version API contract 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| INT-MICR365-OUTLWORD-TUW-003 | Microsoft 365 | Outlook Word | SharePoint import connector skeleton | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| INT-MICR365-OUTLWORD-TUW-004 | Microsoft 365 | Outlook Word | Teams meeting transcript import skeleton | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| INT-MIGR-IMPO-TUW-001 | Migration | Import | file server import manifest schema 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| INT-MIGR-IMPO-TUW-002 | Migration | Import | DMS import mapping table 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| INT-MIGR-IMPO-TUW-003 | Migration | Import | PST import pipeline skeleton | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| INT-MIGR-IMPO-TUW-004 | Migration | Import | migration validation report generator | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| INT-MIGR-IMPO-TUW-005 | Migration | Import | permission mapping verification 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |

## P16. Admin, Analytics & Enterprise Operations

| Work ID | Domain | Module | Title | Risk | Dependencies | Verification |
| --- | --- | --- | --- | --- | --- | --- |
| ADMIN-TENAADMI-ADMICONS-TUW-001 | Tenant Admin | Admin Console | tenant settings UI 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| ADMIN-TENAADMI-ADMICONS-TUW-002 | Tenant Admin | Admin Console | user management UI 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| ADMIN-TENAADMI-ADMICONS-TUW-003 | Tenant Admin | Admin Console | group management UI 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| ADMIN-TENAADMI-ADMICONS-TUW-004 | Tenant Admin | Admin Console | policy admin route guard 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| ADMIN-TENAADMI-ADMICONS-TUW-005 | Tenant Admin | Admin Console | tenant audit report 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| ADMIN-ENTESECU-ENTECONT-TUW-001 | Enterprise Security | Enterprise Controls | SSO/SAML config schema 작성 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| ADMIN-ENTESECU-ENTECONT-TUW-002 | Enterprise Security | Enterprise Controls | BYOK key metadata schema 작성 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| ADMIN-ENTESECU-ENTECONT-TUW-003 | Enterprise Security | Enterprise Controls | data residency setting 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| ADMIN-ENTESECU-ENTECONT-TUW-004 | Enterprise Security | Enterprise Controls | SIEM export interface 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| ADMIN-ENTESECU-ENTECONT-TUW-005 | Enterprise Security | Enterprise Controls | access review workflow 구현 | Critical | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| ADMIN-MONI-OPS-TUW-001 | Monitoring | Ops | system metrics dashboard 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| ADMIN-MONI-OPS-TUW-002 | Monitoring | Ops | error tracking dashboard 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| ADMIN-MONI-OPS-TUW-003 | Monitoring | Ops | alert rule config 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| ADMIN-MONI-OPS-TUW-004 | Monitoring | Ops | backup status monitor 구현 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |
| ADMIN-MONI-OPS-TUW-005 | Monitoring | Ops | DR drill checklist 작성 | High | 상위 schema/API 확정 | 기능검증, 권한검증, 감사로그 또는 회귀검증 중 해당 항목 통과 |


## 4. CSV 버전

동일 목록은 data/tuw_master_backlog.csv에도 포함되어 있습니다.


---

<!-- 14_Agent_Work_Contracts.md -->

# 14. Agent Work Contracts

## 1. Agent Work Contract 표준 필드

| 필드 | 설명 |
|---|---|
| Work ID | 작업 식별자 |
| Parent Release / Epic / Feature | 상위 연결 |
| Objective | 작업 목적 |
| User/System Value | 사용자 또는 시스템 가치 |
| Scope / Non-scope | 수행범위와 제외범위 |
| Inputs / Outputs | 입력과 산출물 |
| Files to Read / Modify / Not Modify | 읽을 파일, 수정 가능 파일, 수정 금지 파일 |
| Dependencies | 선행 작업 |
| Verification Contract | 검증기준 |
| Edge Cases | 예외 |
| Security / Permission / Audit / AI Impact | 영향도 |
| Loop Budget | 반복 한도 |
| Stop Condition | 중단조건 |
| Escalation Rule | 상위로 올릴 조건 |
| Completion Gate | 완료 인정 기준 |

## 2. 중요 샘플


## DOC-INTE-HASH-TUW-001. SHA-256 hash 생성 및 DocumentVersion 저장

| 항목 | 내용 |
|---|---|
| Work ID | DOC-INTE-HASH-TUW-001 |
| Domain | Document Integrity |
| Objective | 업로드 파일의 원본성 검증과 중복 탐지를 위해 hash를 생성한다. |
| Risk Level | High |
| Inputs | upload file buffer, document_id, version_id |
| Outputs | hash string, DocumentVersion.hash |
| Files to Read | document service, file object model |
| Files to Modify | hash.service, document-version.service, tests |
| Files Not to Modify | permission service, db auth middleware |
| Dependencies | document upload API skeleton |
| Verification Contract | 동일 파일은 동일 hash, 1바이트 변경 파일은 다른 hash, hash가 audit metadata에 포함 |
| Security Constraints | 파일 본문을 로그에 남기지 말 것 |
| Loop Budget | 3회 |
| Stop Condition | 권한·schema·정책이 불명확하거나 verification fixture가 없으면 중단 |
| Escalation Rule | hash 생성 또는 저장 실패 시 DocumentService owner로 escalate |
| Completion Gate | 구현, unit/integration/security verification, audit impact 검토 통과 |


## SEC-PERM-MATT-TUW-001. canReadMatter 권한판정 함수

| 항목 | 내용 |
|---|---|
| Work ID | SEC-PERM-MATT-TUW-001 |
| Domain | Matter Permission |
| Objective | userId와 matterId 기준 read 권한 여부를 fail closed 방식으로 판정한다. |
| Risk Level | Critical |
| Inputs | userId, matterId, tenantId |
| Outputs | boolean 또는 PermissionDeniedError |
| Files to Read | matter member schema, role matrix |
| Files to Modify | permission.service, tests |
| Files Not to Modify | document service business logic |
| Dependencies | Matter member schema 완료 |
| Verification Contract | member면 true, 아니면 false/denied, tenant mismatch는 denied |
| Security Constraints | 권한 판단 실패 시 허용하지 말 것 |
| Loop Budget | 3회 |
| Stop Condition | 권한·schema·정책이 불명확하거나 verification fixture가 없으면 중단 |
| Escalation Rule | 권한 matrix 충돌 시 Security Governor로 escalate |
| Completion Gate | 구현, unit/integration/security verification, audit impact 검토 통과 |


## SEARCH-PERM-FILT-TUW-001. 검색 permission filter 주입

| 항목 | 내용 |
|---|---|
| Work ID | SEARCH-PERM-FILT-TUW-001 |
| Domain | Permission-bound Search |
| Objective | 검색결과에서 권한 없는 문서와 윤리장벽 문서를 제거한다. |
| Risk Level | Critical |
| Inputs | user context, search query, filters |
| Outputs | permission-filtered query/result |
| Files to Read | permission service, search index schema |
| Files to Modify | search query builder, tests |
| Files Not to Modify | index schema migration |
| Dependencies | canReadDocument 완료 |
| Verification Contract | 권한 없는 문서가 title/snippet/meta에도 노출되지 않음 |
| Security Constraints | metadata leakage 금지 |
| Loop Budget | 3회 |
| Stop Condition | 권한·schema·정책이 불명확하거나 verification fixture가 없으면 중단 |
| Escalation Rule | query-level 필터 불가능 시 Architect로 escalate |
| Completion Gate | 구현, unit/integration/security verification, audit impact 검토 통과 |


## AI-RAG-PERM-TUW-001. AI retrieval candidate 권한필터

| 항목 | 내용 |
|---|---|
| Work ID | AI-RAG-PERM-TUW-001 |
| Domain | AI Retrieval |
| Objective | retrieval 후보 중 aiAllowed=false 또는 userReadAllowed=false 문서를 제외한다. |
| Risk Level | Critical |
| Inputs | userId, matterId, RetrievalCandidate[] |
| Outputs | filtered candidates, excluded count |
| Files to Read | ai policy, permission service, retrieval service |
| Files to Modify | ai/retrieval/permission-filter, tests |
| Files Not to Modify | vector indexer, db schema |
| Dependencies | aiAllowed 필드 및 canReadDocument 완료 |
| Verification Contract | 제외 문서가 context/citation/title/snippet에 포함되지 않음 |
| Security Constraints | fail closed, 제외문서 본문 로그 금지 |
| Loop Budget | 3회 |
| Stop Condition | 권한·schema·정책이 불명확하거나 verification fixture가 없으면 중단 |
| Escalation Rule | 권한서비스 오류 처리 불명확 시 Security Reviewer로 escalate |
| Completion Gate | 구현, unit/integration/security verification, audit impact 검토 통과 |


## AI-EVID-PACK-TUW-001. Evidence Pack Builder v1

| 항목 | 내용 |
|---|---|
| Work ID | AI-EVID-PACK-TUW-001 |
| Domain | AI Context |
| Objective | 검색결과, 그래프사실, 룰결과를 Gemma 입력 근거 패키지로 구성한다. |
| Risk Level | Critical |
| Inputs | question, retrieval results, graph facts, rule findings |
| Outputs | EvidencePack object |
| Files to Read | retrieval logs, chunk schema, playbook rule schema |
| Files to Modify | evidence-pack.builder, tests |
| Files Not to Modify | model gateway |
| Dependencies | chunk provenance, AI session schema |
| Verification Contract | pack에 provenance/citation/uncertainty/conflict가 포함됨 |
| Security Constraints | 권한 없는 자료 포함 금지 |
| Loop Budget | 3회 |
| Stop Condition | 권한·schema·정책이 불명확하거나 verification fixture가 없으면 중단 |
| Escalation Rule | 근거 누락 또는 충돌시 AI Governor로 escalate |
| Completion Gate | 구현, unit/integration/security verification, audit impact 검토 통과 |


## CONTRACT-REDLINE-DOCX-TUW-001. DOCX w:ins/w:del 변경객체 추출

| 항목 | 내용 |
|---|---|
| Work ID | CONTRACT-REDLINE-DOCX-TUW-001 |
| Domain | Redline Analysis |
| Objective | DOCX track changes에서 삽입·삭제를 Change 객체로 변환한다. |
| Risk Level | High |
| Inputs | DOCX document.xml |
| Outputs | Change[] |
| Files to Read | docx parser fixtures |
| Files to Modify | docx-redline-parser, tests |
| Files Not to Modify | document schema |
| Dependencies | canonical doc parser skeleton |
| Verification Contract | fixture 5개에서 Word 변경수와 일치 |
| Security Constraints | 원본문서 수정 금지 |
| Loop Budget | 3회 |
| Stop Condition | 권한·schema·정책이 불명확하거나 verification fixture가 없으면 중단 |
| Escalation Rule | 복잡한 nested change 실패 시 Contract Intelligence Lead로 escalate |
| Completion Gate | 구현, unit/integration/security verification, audit impact 검토 통과 |


## GRAPH-SYNC-EDGE-TUW-001. Matter–Document graph edge sync

| 항목 | 내용 |
|---|---|
| Work ID | GRAPH-SYNC-EDGE-TUW-001 |
| Domain | Graph Sync |
| Objective | Document 생성/삭제/권한변경 이벤트를 graph edge에 반영한다. |
| Risk Level | High |
| Inputs | domain event, matter_id, document_id |
| Outputs | Neo4j edge update |
| Files to Read | graph schema, document events |
| Files to Modify | graph-sync worker, tests |
| Files Not to Modify | core document service |
| Dependencies | graph node mapper 완료 |
| Verification Contract | edge 생성·삭제·retry가 일관됨 |
| Security Constraints | 권한 없는 graph query 노출 금지 |
| Loop Budget | 3회 |
| Stop Condition | 권한·schema·정책이 불명확하거나 verification fixture가 없으면 중단 |
| Escalation Rule | graph transaction failure 반복 시 Architect로 escalate |
| Completion Gate | 구현, unit/integration/security verification, audit impact 검토 통과 |


## VDR-LINK-EXP-TUW-001. Secure link 만료·폐기 검증

| 항목 | 내용 |
|---|---|
| Work ID | VDR-LINK-EXP-TUW-001 |
| Domain | External Portal/VDR |
| Objective | 외부공유 링크의 만료와 revoke 상태를 검증하여 접근을 차단한다. |
| Risk Level | Critical |
| Inputs | link token, external user context |
| Outputs | access allowed/denied |
| Files to Read | secure link schema, external user schema |
| Files to Modify | secure-link.service, tests |
| Files Not to Modify | document permission service |
| Dependencies | external workspace schema 완료 |
| Verification Contract | 만료/revoked 링크는 접근 불가 및 audit 기록 |
| Security Constraints | 링크 존재 여부를 과도하게 노출하지 말 것 |
| Loop Budget | 3회 |
| Stop Condition | 권한·schema·정책이 불명확하거나 verification fixture가 없으면 중단 |
| Escalation Rule | edge case 불명확 시 Security Governor로 escalate |
| Completion Gate | 구현, unit/integration/security verification, audit impact 검토 통과 |


## RECORD-HOLD-DEL-TUW-001. Legal Hold 문서 삭제 차단

| 항목 | 내용 |
|---|---|
| Work ID | RECORD-HOLD-DEL-TUW-001 |
| Domain | Records Management |
| Objective | legalHold=true 문서 또는 Matter의 hard/soft delete를 차단한다. |
| Risk Level | Critical |
| Inputs | document_id, delete request |
| Outputs | denied response 또는 deletion allowed |
| Files to Read | legal hold schema, document lifecycle |
| Files to Modify | document deletion guard, tests |
| Files Not to Modify | storage adapter |
| Dependencies | legal hold schema 완료 |
| Verification Contract | hold 문서는 soft/hard delete 모두 차단 |
| Security Constraints | 보존대상 원본 훼손 금지 |
| Loop Budget | 3회 |
| Stop Condition | 권한·schema·정책이 불명확하거나 verification fixture가 없으면 중단 |
| Escalation Rule | 정책충돌 시 Records Governor로 escalate |
| Completion Gate | 구현, unit/integration/security verification, audit impact 검토 통과 |


## PLAYBOOK-RULE-SPA-TUW-001. SPA 손해배상 rule v1

| 항목 | 내용 |
|---|---|
| Work ID | PLAYBOOK-RULE-SPA-TUW-001 |
| Domain | Playbook/Rule Store |
| Objective | SPA 손해배상 조항의 cap, basket, survival, fundamental reps carve-out 누락을 탐지한다. |
| Risk Level | High |
| Inputs | Clause object, transaction context |
| Outputs | RuleFinding[] |
| Files to Read | clause schema, playbook rule schema |
| Files to Modify | spa-indemnity-rule, tests |
| Files Not to Modify | AI prompt templates |
| Dependencies | clause extraction 완료 |
| Verification Contract | 샘플 계약 20개에서 기대 rule finding과 일치 |
| Security Constraints | 법률판단 단정 금지, 검토 필요 표시 |
| Loop Budget | 3회 |
| Stop Condition | 권한·schema·정책이 불명확하거나 verification fixture가 없으면 중단 |
| Escalation Rule | rule 의미 불명확 시 Legal Domain Reviewer로 escalate |
| Completion Gate | 구현, unit/integration/security verification, audit impact 검토 통과 |


---

<!-- 15_Verification_Contracts_Test_Plan.md -->

# 15. Verification Contracts and Test Plan

## 1. Verification Contract 구성

| 검증 영역 | 내용 |
| --- | --- |
| Functional Verification | 기능 요구 충족 |
| Unit Verification | 단위 함수/컴포넌트 검증 |
| Integration Verification | API/DB/service 연결 |
| Contract Verification | API 요청·응답 명세 |
| Security Verification | 인증·권한·tenant isolation |
| Permission Verification | Matter/document/AI 권한 |
| AI Verification | retrieval filtering, citation, hallucination warning |
| Audit Verification | 필수 audit event 생성 |
| Regression Verification | 기존 기능 훼손 여부 |
| Performance Verification | 응답속도·쿼리 |
| UX Verification | 사용자 flow |
| Observability Verification | 로그·metric·trace |
| Documentation Verification | 문서 업데이트 |


## 2. 대표 Verification Case

| 대상 | Verification Case |
| --- | --- |
| 문서 업로드 | 권한 있는 사용자만 업로드, hash 생성, DocumentVersion 생성, audit 기록, unsupported file 차단 |
| 검색 | 권한 없는 문서 미노출, deleted/superseded filter, snippet 정확성, search audit |
| AI Matter Summary | aiAllowed=false 및 권한 없는 문서 제외, citation 저장, AI audit, warning 표시 |
| 외부공유 | 만료/revoked link 차단, watermark, external audit, NDA gate |
| Legal Hold | hold 자료 삭제 차단, disposal workflow 우회 불가, audit 기록 |
| 계약서 조항추출 | 조항번호/제목/본문/정의어 추출 정확성, parser 실패시 원본 무손상 |


## 3. Critical Verification Requirements

- Permission Accuracy는 100%를 목표로 합니다.
- 권한 서비스 오류는 fail closed이어야 합니다.
- AI context에는 권한 없는 문서의 본문, 제목, snippet, metadata도 포함되면 안 됩니다.
- 외부공유 링크는 만료일과 revoke 상태를 반드시 검증해야 합니다.
- legal hold 또는 retention lock 자료는 hard delete 및 soft delete 모두 차단되어야 합니다.
- AI 답변의 근거는 document_id, version_id, chunk_id 또는 authority_id로 추적되어야 합니다.

## 4. Regression Map

| 변경 영역 | 회귀위험 영역 |
|---|---|
| PermissionService | Document access, Search, AI, VDR, Graph query |
| DocumentVersion | Search index, clause extraction, redline, citation |
| AI Policy | RAG, summary, model routing, external model approval |
| AuditEvent schema | Document, Email, AI, External, Records reports |
| Retention/LegalHold | Delete, archive, external share, migration |

## 5. Evaluation Dataset

초기 평가셋은 정의어 추출 500건, 당사자 추출 300건, 조항분류 1,000건, 리스크 분류 500건, 유사조항 검색 300건, 누락조항 탐지 200건, 이메일 쟁점 추출 300건, 최종본 판별 200건, 법률근거 매칭 200건, 수정안 품질평가 200건을 목표로 합니다.


---

<!-- 16_Roadmap_Release_Plan.md -->

# 16. Roadmap and Release Plan

## 1. Release Train

| Release | 목적 | 핵심 범위 | Pillars |
| --- | --- | --- | --- |
| R0 | Foundation | repo, CI/CD, auth skeleton, DB, design system, logging, test framework | P0,P1 |
| R1 | Matter Core | Client, Matter, Party, Matter team, basic permission | P2,P4,P5 |
| R2 | Document Vault MVP | upload, version, metadata, hash, preview skeleton, audit | P3,P4,P5 |
| R3 | Search MVP | metadata/full-text/permission-bound search, indexing, snippets | P6,P4,P5 |
| R4 | Email Vault MVP | email filing, attachment extraction, threading, timeline | P7,P3,P5 |
| R5 | Security & Governance | RBAC/ABAC, ethical wall, DLP, external sharing controls | P4,P5 |
| R6 | AI Knowledge Layer v1 | permission-bound RAG, summaries, citations, AI sessions | P8,P6,P4,P5 |
| R7 | Knowledge Graph v1 | graph schema, mapping, sync, graph query | P9,P3,P8 |
| R8 | Contract Intelligence | clause extraction, redline parser, playbook, rule store | P10,P9,P8 |
| R9 | DD Vault | RFI, data room mapping, DD issue, risk register | P11,P13 |
| R10 | Litigation Vault | evidence, fact ledger, issue tree, pleading management | P12 |
| R11 | External Portal / VDR | external workspace, secure link, watermark, Q&A | P13,P4,P5 |
| R12 | Records Management | retention, legal hold, archive, disposal workflow | P14,P5 |
| R13 | Enterprise Hardening | SSO/SAML, BYOK, SIEM, backup/DR, compliance readiness | P16,P15 |
| R14 | Scale & Optimization | performance, cost, eval, advanced AI, migration tooling | P15,P16 |


## 2. Gate 기준

| Release | Gate |
|---|---|
| R0 | Foundation Completion Gate |
| R1 | Matter Core Gate |
| R2 | Document Vault MVP Gate |
| R3 | Permission-bound Search Gate |
| R4 | Email Vault Gate |
| R5 | Security & Governance Gate |
| R6 | AI Governance Gate |
| R7 | Knowledge Graph Gate |
| R8 | Contract Intelligence Gate |
| R9 | DD Vault Gate |
| R10 | Litigation Vault Gate |
| R11 | External Sharing Critical Gate |
| R12 | Records Governance Gate |
| R13 | Enterprise SaaS Readiness Gate |
| R14 | Scale & Learning Gate |

## 3. 권장 순서

R0 → R1 → R2 → R3 → R4 → R5 → R6 → R7 → R8 → R9/R10 → R11 → R12 → R13 → R14.

AI는 R6부터 본격 적용합니다. 그 전에는 문서, 권한, 검색, 감사로그 기반을 먼저 완성해야 합니다.

## 4. MVP Definition

MVP는 Matter 중심으로 문서와 이메일을 저장하고, 권한연동 검색 및 Gemma 기반 근거제시 요약을 제공하는 수준으로 정의합니다. 조항은행, DD, 송무, VDR 전체 자동화는 후속 release로 둡니다.


---

<!-- 17_Implementation_Guide.md -->

# 17. Implementation Guide for Development Team

## 1. 구현 착수 원칙

1. R0에서 repository, CI/CD, DB migration, test framework를 먼저 확정합니다.
2. 실제 파일경로가 확정되면 13_TUW_Master_Backlog의 각 TUW를 Agent Work Contract로 확장합니다.
3. 모든 Matter/document/email/search/AI API는 PermissionService와 AuditService를 통과해야 합니다.
4. 권한 판단이 불확실하면 차단합니다.
5. AI 기능은 반드시 Evidence Pack과 citation을 사용합니다.

## 2. 개발팀 작업 방식

| 단계 | 작업 |
|---|---|
| 1 | Release별 scope lock |
| 2 | Execution Dependency Graph 확인 |
| 3 | TUW를 Sprint ticket으로 변환 |
| 4 | Agent Work Contract 작성 |
| 5 | Readiness Gate 통과 확인 |
| 6 | 구현 |
| 7 | Verification Contract 실행 |
| 8 | Specialist Review |
| 9 | Integration Gate |
| 10 | Ledger update |

## 3. Repository 구조 예시

- apps/web: frontend.
- apps/api: backend API.
- packages/shared: shared types, DTO.
- packages/domain: core domain model.
- packages/ai: retrieval, evidence pack, model gateway.
- workers/ingestion: parsing, OCR, indexing.
- workers/graph-sync: graph synchronization.
- infra: terraform/k8s/docker.
- docs: architecture, API, verification.
- tests/fixtures: sample documents and emails.

## 4. 개발 금지사항

- PermissionService 없이 document/search/AI/VDR endpoint를 구현하지 말 것.
- 원본문서를 덮어쓰지 말 것.
- AI prompt나 로그에 고객 기밀 원문을 불필요하게 남기지 말 것.
- legal hold 또는 retention lock 자료를 삭제하지 말 것.
- 사양에 없는 외부모델 전송을 구현하지 말 것.

## 5. 우선 구현 추천

첫 스프린트는 P0/P1/P2/P4/P5의 최소 단위로 시작합니다. 문서 업로드는 P2 Matter와 P4 Permission, P5 Audit이 동작한 뒤 진행합니다.


---

<!-- 18_Risk_Register_Open_Questions.md -->

# 18. Risk Register and Open Questions

## 1. Risk Register

| ID | 리스크 | 등급 | 영향 | 대응 |
| --- | --- | --- | --- | --- |
| RISK-001 | 권한필터 누락 | Critical | 검색·AI·VDR에서 고객자료 노출 | Permission service centralization, regression test |
| RISK-002 | 초안/최종본 혼동 | Critical | AI가 초안을 최종합의처럼 인용 | version_status, final ranking, Evidence Pack rule |
| RISK-003 | 벡터검색 단독 의존 | High | 정의어·판례번호·조항번호 검색 실패 | Hybrid search |
| RISK-004 | 원본문서 덮어쓰기 | Critical | 증거성·원본성 훼손 | immutable original, hash |
| RISK-005 | AI hallucination | High | 근거 없는 법률판단 | citation verification, warning, escalation |
| RISK-006 | playbook 부재 | High | 우리 입장 판단 불안정 | Rule Store 구축 |
| RISK-007 | graph 관계 오염 | Medium | 잘못된 관계로 잘못된 답변 | confidence, review queue |
| RISK-008 | 외부공유 링크 오작동 | Critical | 외부유출 | expiration/revocation test |
| RISK-009 | legal hold 삭제 우회 | Critical | 보존의무 위반 | delete guard |
| RISK-010 | 평가셋 부재 | High | 개선 불가능 | Evaluation Store 구축 |


## 2. TUW 생성 전 추가 확인사항

| ID | 영역 | 질문 |
| --- | --- | --- |
| Q-001 | 배포방식 | Cloud, private cloud, on-prem 중 무엇인가 |
| Q-002 | 외부모델 정책 | 고객 기밀자료의 외부모델 전송 허용 여부 |
| Q-003 | HWP 지원 | HWP/HWPX 지원이 MVP 필수인지 |
| Q-004 | 법률DB | 국내 판례·법령 DB의 연동 source |
| Q-005 | 보존기간 | 문서유형별 법률검토된 보존기간 |
| Q-006 | 권한 taxonomy | 로펌 내부 practice/team/role 구조 |
| Q-007 | 고객포털 | 외부 고객 사용을 MVP에 포함할지 |
| Q-008 | 평가셋 | 초기 golden dataset 확보 가능 여부 |


## 3. 위험도 기반 에스컬레이션

Critical 위험은 Product Governor, Architecture Governor, Security Reviewer, Human Owner 중 최소 1인의 승인을 요구합니다. 특히 auth, tenant isolation, Matter/document permission, ethical wall, AI retrieval, external sharing, retention/legal hold, DB migration은 사람 gate가 필요합니다.


---

<!-- 19_Prompt_Library.md -->

# 19. Prompt Library

## 1. Planner Prompt

목적: 사양명세서와 PBS/DBS를 기준으로 Domain, Module, Feature, Epic, Story, Technical Task, TUW를 생성한다. 사양에 없는 기능은 확정하지 말고 확장 제안으로 분리한다.

## 2. Executor Prompt

목적: Agent Work Contract에 명시된 파일과 범위만 수정한다. Files Not to Modify를 변경하지 않는다. Verification Contract를 기준으로 자체 점검하고, loop budget 초과 또는 scope ambiguity 발생 시 중단한다.

## 3. Verifier Prompt

목적: 기능검증, unit/integration/security/permission/AI/audit/regression verification을 수행한다. 테스트 통과만으로 완료 처리하지 말고 Completion Gate를 확인한다.

## 4. Governor Prompt

목적: 위험도, 권한, 보안, 아키텍처, AI 정책, 릴리스 여부를 판단한다. 불명확한 경우 fail closed 또는 hold 결정을 내린다.

## 5. Gemma Legal Work Prompt 원칙

- 제공된 Evidence Pack에 없는 사실을 단정하지 않는다.
- 각 판단에는 가능한 한 document_id, version_id, clause_id, chunk_id 또는 authority_id를 표시한다.
- 불확실한 부분은 확인 필요로 표시한다.
- 최종본 > 내부 수정본 > 상대방 수정본 > 초안 순으로 우선한다.
- 수정 요청 시 원문 표현을 최대한 유지한다.
- 고위험 법률판단은 escalation flag를 표시한다.
- 자료 간 충돌을 발견하면 단정하지 말고 병기한다.


---

<!-- 20_References.md -->

# 20. References

## Official / Primary Sources Checked

1. Google Cloud, “What is Retrieval-Augmented Generation (RAG)?” — RAG가 검색·데이터베이스와 LLM을 결합하고, hybrid search 및 re-ranking이 검색 품질에 중요하다는 설명을 확인.
   URL: https://cloud.google.com/use-cases/retrieval-augmented-generation

2. Google Cloud, Vertex AI RAG Engine Overview — RAG Engine이 외부 지식소스와 LLM context augmentation을 결합하는 데이터 프레임워크임을 확인.
   URL: https://cloud.google.com/vertex-ai/generative-ai/docs/rag-engine/rag-overview

3. Google AI for Developers, Gemma 4 model overview — Gemma 4의 open weights, 12B 등 모델 패밀리, context 및 deployment 관련 정보를 확인.
   URL: https://ai.google.dev/gemma/docs/core

4. Google AI for Developers, Gemma model fine-tuning — Gemma open weights, fine-tuning, PEFT/LoRA, success/failure/boundary test 원칙을 확인.
   URL: https://ai.google.dev/gemma/docs/tune

5. Google AI for Developers, EmbeddingGemma model overview — EmbeddingGemma의 308M parameter, multilingual embedding, local/offline retrieval use case를 확인.
   URL: https://ai.google.dev/gemma/docs/embeddinggemma

6. LangChain Docs, Build a RAG agent with LangChain — indexing이 load, split, store 단계로 구성되고 document loaders, text splitters, vector stores, embeddings를 사용하는 구조를 확인.
   URL: https://docs.langchain.com/oss/javascript/langchain/rag

7. Neo4j GraphRAG for Python Docs — Neo4j의 first-party GraphRAG package, knowledge graph builder, retrievers, graph/vector retrieval support를 확인.
   URL: https://neo4j.com/docs/neo4j-graphrag-python/current/

## Internal Design Sources

- 사용자 제공 Vault 사양명세서 및 후속 분석 내용.
- 사용자 제공 Gemma용 지식저장소 설계 메모.
- 본 문서 패키지 내 02~19번 문서.
