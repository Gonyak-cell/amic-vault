# 18. Risk Register and Open Questions

## 1. Risk Register

| ID | 리스크 | 등급 | 영향 | 대응 |
| --- | --- | --- | --- | --- |
| RISK-001 | 권한필터 누락 | Critical | 검색·AI·VDR에서 고객자료 노출 | Permission service centralization, regression test |
| RISK-002 | 초안/최종본 혼동 | Critical | AI가 초안을 최종합의처럼 인용 | version_status, final ranking, Evidence Pack rule |
| RISK-003 | 벡터검색 단독 의존 | High | 정의어·판례번호·조항번호 검색 실패 | Hybrid search |
| RISK-004 | 원본문서 덮어쓰기 | Critical | 증거성·원본성 훼손 | immutable original, hash |
| RISK-005 | AI hallucination | High | 근거 없는 법률판단 | citation verification, warning, escalation |
| RISK-006 | playbook 부재 | High | 우리 입장 판단 불안정 | Rule Store 구축 |
| RISK-007 | graph 관계 오염 | Medium | 잘못된 관계로 잘못된 답변 | confidence, review queue |
| RISK-008 | 외부공유 링크 오작동 | Critical | 외부유출 | expiration/revocation test |
| RISK-009 | legal hold 삭제 우회 | Critical | 보존의무 위반 | delete guard |
| RISK-010 | 평가셋 부재 | High | 개선 불가능 | Evaluation Store 구축 |


## 2. TUW 생성 전 추가 확인사항

| ID | 영역 | 질문 |
| --- | --- | --- |
| Q-001 | 배포방식 | Cloud, private cloud, on-prem 중 무엇인가 |
| Q-002 | 외부모델 정책 | 고객 기밀자료의 외부모델 전송 허용 여부 |
| Q-003 | HWP 지원 | HWP/HWPX 지원이 MVP 필수인지 |
| Q-004 | 법률DB | 국내 판례·법령 DB의 연동 source |
| Q-005 | 보존기간 | 문서유형별 법률검토된 보존기간 |
| Q-006 | 권한 taxonomy | 로펌 내부 practice/team/role 구조 |
| Q-007 | 고객포털 | 외부 고객 사용을 MVP에 포함할지 |
| Q-008 | 평가셋 | 초기 golden dataset 확보 가능 여부 |


## 3. 위험도 기반 에스컬레이션

Critical 위험은 Product Governor, Architecture Governor, Security Reviewer, Human Owner 중 최소 1인의 승인을 요구합니다. 특히 auth, tenant isolation, Matter/document permission, ethical wall, AI retrieval, external sharing, retention/legal hold, DB migration은 사람 gate가 필요합니다.
