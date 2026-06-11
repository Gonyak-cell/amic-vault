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
