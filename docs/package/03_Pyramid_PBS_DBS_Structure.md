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
