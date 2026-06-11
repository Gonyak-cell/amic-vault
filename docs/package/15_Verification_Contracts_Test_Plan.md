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
