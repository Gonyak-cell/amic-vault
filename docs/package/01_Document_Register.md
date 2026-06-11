# 01. Document Register

| 문서 | 목적 | 주 사용대상 |
| --- | --- | --- |
| 00_README.md | 패키지 사용법과 문서 순서 | 개발팀/PM/PO |
| 01_Document_Register.md | 전체 문서목록 및 산출물 설명 | PM/개발리드 |
| 02_Product_Requirements_Specification.md | Vault 제품 요구사항 명세서 | PO/개발팀 |
| 03_Pyramid_PBS_DBS_Structure.md | 피라미드식 제품·전달·실행 구조 | PM/Planner |
| 04_System_Architecture_Blueprint.md | 시스템 아키텍처 및 구조도 | Architect |
| 05_Gemma_Knowledge_Store_Specification.md | Gemma용 고도 지식저장소 사양 | AI/검색팀 |
| 06_Retrieval_RAG_GraphRAG_Design.md | 검색·RAG·GraphRAG·Evidence Pack 설계 | AI/검색팀 |
| 07_Data_Model_and_Schema_Draft.md | 핵심 데이터 모델 및 스키마 초안 | Backend/Data |
| 08_Security_Permission_Audit_Compliance.md | 권한·보안·감사·컴플라이언스 사양 | Security/Backend |
| 09_API_Service_Contract.md | 서비스 경계 및 API 계약 초안 | Backend/Frontend |
| 10_UI_UX_Workflow_Specification.md | 화면·사용자 흐름·운영 흐름 | UX/Frontend |
| 11_Development_Operating_System.md | 위험도 기반·검증 중심·루프형 개발 운영체계 | PM/Agent팀 |
| 12_Execution_Dependency_Graph.md | 실행 의존성 그래프 및 선후관계 | Planner/개발리드 |
| 13_TUW_Master_Backlog.md | 전체 Testable Unit of Work 백로그 | 개발팀/Agent |
| 14_Agent_Work_Contracts.md | Agent Work Contract 템플릿 및 중요 샘플 | Agent/개발팀 |
| 15_Verification_Contracts_Test_Plan.md | 검증계약·검증케이스·테스트 전략 | QA/Security |
| 16_Roadmap_Release_Plan.md | 릴리스 로드맵 및 Gate | PM/개발리드 |
| 17_Implementation_Guide.md | 구현 착수 가이드와 운영 규칙 | 개발팀 |
| 18_Risk_Register_Open_Questions.md | 리스크 레지스터와 추가 확인사항 | PO/PM/Security |
| 19_Prompt_Library.md | Planner/Executor/Verifier/Governor 프롬프트 | Agent팀 |
| 20_References.md | 공식 문서 및 참고자료 | 전체 |

## 문서 간 의존관계

- 02 PRS는 제품 요구사항의 기준문서입니다.
- 03 PBS/DBS는 TUW를 생성하기 위한 상위 구조입니다.
- 04~10은 제품 구현 사양입니다.
- 11~16은 개발 운영 및 실행 사양입니다.
- 17~19는 개발팀 실행 가이드, 리스크, 프롬프트 운용 문서입니다.
- 20은 외부 공식문서 및 참고자료입니다.
