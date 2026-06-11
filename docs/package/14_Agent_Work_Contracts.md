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
