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
