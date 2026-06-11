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
