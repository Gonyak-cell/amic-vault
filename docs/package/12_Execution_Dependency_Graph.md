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
