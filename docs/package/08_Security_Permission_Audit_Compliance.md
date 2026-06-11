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
