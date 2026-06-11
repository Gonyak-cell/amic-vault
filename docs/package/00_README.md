# Vault Development Documentation Package

작성일: 2026-06-11

이 패키지는 로펌용 통합 데이터베이스 시스템인 Vault를 개발팀이 구현 가능한 수준으로 분해하기 위한 문서 세트입니다. 제품 사양, 피라미드식 구조, Gemma용 고도 지식저장소, 아키텍처, 데이터 모델, 보안·권한, 검색·RAG·GraphRAG, 개발 운영체계, TUW 백로그, 검증계약, 릴리스 로드맵, 리스크 레지스터를 포함합니다.

## 사용 순서

1. 01_Document_Register.md로 전체 문서 구성을 확인합니다.
2. 02_Product_Requirements_Specification.md와 03_Pyramid_PBS_DBS_Structure.md로 제품 범위와 분해 구조를 확정합니다.
3. 04_System_Architecture_Blueprint.md, 05_Gemma_Knowledge_Store_Specification.md, 06_Retrieval_RAG_GraphRAG_Design.md를 기준으로 기술 아키텍처를 확정합니다.
4. 07_Data_Model_and_Schema_Draft.md, 08_Security_Permission_Audit_Compliance.md, 09_API_Service_Contract.md를 구현 기준으로 삼습니다.
5. 11_Development_Operating_System.md, 12_Execution_Dependency_Graph.md, 13_TUW_Master_Backlog.md, 14_Agent_Work_Contracts.md, 15_Verification_Contracts_Test_Plan.md를 이용해 실제 개발 티켓을 생성합니다.
6. 16_Roadmap_Release_Plan.md에 따라 R0부터 순차 구현합니다.

## 중요 전제

- 개별 TUW의 실제 파일 경로는 repository 구조 확정 후 보정해야 합니다.
- 법령·판례·개인정보·보존기간 등 법률적 수치와 기간은 별도 법률검토 후 확정해야 합니다.
- Gemma는 로컬 1차 처리·추출·요약·초안에 우선 사용하고, 고위험 법률판단은 상위 모델 또는 변호사 검토로 에스컬레이션합니다.
