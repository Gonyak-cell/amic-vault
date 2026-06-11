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
