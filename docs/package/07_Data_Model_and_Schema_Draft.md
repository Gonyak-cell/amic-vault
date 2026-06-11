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
