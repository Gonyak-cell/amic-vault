# 06. Retrieval, RAG, GraphRAG and Evidence Pack Design

## 1. 원칙

Vault의 RAG는 벡터DB 단독 검색이 아니라 Metadata + Keyword/BM25 + Vector + Graph + Rule Store를 결합한 hybrid, permission-bound, evidence-pack 기반 검색입니다.

## 2. 질문 유형별 검색 전략

| 사용자 질문 | 검색 전략 |
|---|---|
| 이 계약서에서 거래종결일이 언제야? | 정확검색 + 메타데이터 + 정의어 검색 |
| 이 조항이 우리에게 불리해? | 조항검색 + 플레이북 + 유사사례 + 룰엔진 |
| 비슷한 SHA 샘플 찾아줘 | 메타데이터 필터 + 벡터검색 + clause bank |
| Delta가 IPR에 대해 뭐라고 했어? | Matter 필터 + 이메일/마크업 검색 + timeline 정렬 |
| MFN 때문에 어떤 문제가 생겨? | 그래프검색 + 관련 계약·권리·증권종류 연결 |
| 이 문구를 최소수정해줘 | 조항검색 + 샘플문구 + 플레이북 + style bible |
| 법리적으로 맞아? | 법령/판례 authority search + 상위모델/변호사 escalation |
| 자료 전부 종합해줘 | 문서군 요약 + 쟁점그래프 + Evidence Pack |
| 이전 샘플 문체에 맞춰줘 | style sample + drafting pattern 검색 |

## 3. Retrieval Orchestrator 단계

1. 사용자 질문 수신.
2. tenant/user/matter context 확인.
3. 질문 유형 분류.
4. permission 및 ethical wall 확인.
5. metadata filter 생성.
6. keyword query 생성.
7. vector query 생성.
8. graph query 생성.
9. playbook/rule lookup 실행.
10. 검색결과를 provenance 기준으로 병합.
11. 최신본·최종본·권한·신뢰도 기준 reranking.
12. 중복·superseded version 제거.
13. Evidence Pack 생성.
14. Gemma 또는 상위모델 호출.
15. citation verification.
16. AI audit 및 feedback 저장.

## 4. 권한 필터링 순서

권한필터는 검색 후 사후처리가 아니라 검색 전·중·후 모든 단계에서 적용합니다.

| 단계 | 필터 |
|---|---|
| Pre-retrieval | tenant, matter, ethical wall, AI policy |
| Retrieval | metadata permission filter, document aiAllowed |
| Post-retrieval | document-level permission, version status, deleted/legal hold 상태 |
| Evidence Pack | title/snippet/meta leakage 제거 |
| Response | cited source가 권한 내 자료인지 재검증 |

## 5. Evidence Pack Schema

| 필드 | 설명 |
|---|---|
| pack_id | Evidence Pack ID |
| user_question | 원질문 |
| rewritten_queries | 검색용 질문분해 |
| task_type | 요약, 검토, 수정, 비교, 리서치 등 |
| matter_context | Matter 개요 |
| retrieval_scope | 검색 범위 |
| relevant_documents | 관련 문서 목록 |
| authoritative_sources | 최종본, 법령, 판례, 플레이북 |
| retrieved_chunks | 검색 chunk 및 provenance |
| graph_facts | 그래프 관계 사실 |
| rule_findings | 룰엔진 결과 |
| conflicts | 자료 간 충돌 |
| uncertainty | 불확실한 부분 |
| prohibited_assumptions | 추정 금지사항 |
| citation_requirements | 출처표시 방식 |
| output_format | 요구 답변형식 |
| escalation_flags | 상위검토 필요 여부 |

## 6. Query Rewriting

예: 사용자가 “이 조항 우리한테 불리한가?”라고 물으면 내부적으로 다음 검색질문으로 분해합니다.

- 현재 조항의 clause_type은 무엇인가.
- 해당 matter의 client_side는 누구인가.
- 같은 clause_type의 preferred clause는 무엇인가.
- 유사 거래에서 수용된 fallback은 무엇인가.
- 관련 playbook rule은 무엇인가.
- rule engine상 누락된 요소는 무엇인가.
- 관련 authority가 있는가.
- 상대방이 과거 유사 문구를 요구한 이력이 있는가.

## 7. Citation Verification

AI 답변의 각 주장에는 document_id, version_id, clause_id, chunk_id 또는 authority_id가 연결되어야 합니다. citation이 없는 주장은 warning으로 표시하고, 법률판단에 해당하면 escalation합니다.

## 8. GraphRAG 사용 기준

GraphRAG는 다음 유형의 질문에 우선 적용합니다.

| 질문 유형 | 이유 |
|---|---|
| 계약 간 권리 전이 | 조항·증권종류·당사자·권리 관계 필요 |
| 조항 충돌 검토 | 정의어·cross-reference·권리·의무 연결 필요 |
| 과거 협상패턴 | 상대방·문구·최종결과 관계 필요 |
| DD issue 근거 추적 | RFI–Document–Issue–Risk 관계 필요 |
| 송무 사실관계 | Fact–Evidence–Issue–Authority 관계 필요 |

## 9. Evaluation Metrics

| 지표 | 목표 |
|---|---|
| Retrieval Recall | 95% 이상 목표 |
| Precision | 80% 이상 목표 |
| Citation Accuracy | 98% 이상 목표 |
| Version Accuracy | 99% 이상 목표 |
| Permission Accuracy | 100% |
| Clause Classification Accuracy | 95% 이상 목표 |
| Entity Extraction Accuracy | 99% 이상 목표 |
| Risk Detection Recall | 95% 이상 목표 |
| Hallucination Rate | 1% 이하 목표 |
| Escalation Accuracy | 95% 이상 목표 |
