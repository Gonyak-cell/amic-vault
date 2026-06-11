# 05. Gemma Knowledge Store Specification

## 1. 목표

Gemma용 지식저장소의 목표는 문서를 많이 넣는 것이 아니라, Gemma가 답변에 필요한 사실, 문구, 조항, 선례, 협상 이력, 내부 기준, 리스크 분류표를 정확히 검색·조합·검증할 수 있도록 원천자료를 구조화된 지식 단위로 변환하는 것입니다.

Gemma는 로컬 실행 가능한 법률업무 프로세서로 위치시킵니다. 핵심 경쟁력은 Gemma 자체의 파라미터가 아니라 Source Vault, Metadata Store, Chunk Store, Hybrid Search, Knowledge Graph, Playbook/Rule Store, Evidence Pack, Feedback Store의 품질에 둡니다.

## 2. 전체 계층

| Layer | 명칭 | 역할 |
| --- | --- | --- |
| Layer 0 | Source Vault | 원본문서, 이메일, 회의록, 첨부파일 원본 보관 |
| Layer 1 | Canonical Document Store | PDF/DOCX/HWP/XLSX/PPTX/MSG/EML을 공통 문서 구조로 정규화 |
| Layer 2 | Metadata Store | Matter, Client, Document, Clause, 권한, 상태, 버전 관리 |
| Layer 3 | Chunk Store | 계약서 조항·항·호·정의어·이메일·판례 단위 청킹 |
| Layer 4 | Vector Index | 의미검색 |
| Layer 5 | Keyword / BM25 Index | 정의어·조항번호·판례번호·고유명사 정확검색 |
| Layer 6 | Knowledge Graph | Client–Matter–Document–Clause–Issue–Risk 관계 저장 |
| Layer 7 | Playbook / Rule Store | 내부 검토기준, 필수조항, red flag, fallback clause 저장 |
| Layer 8 | Retrieval Orchestrator | 질문 유형별 검색전략 선택 |
| Layer 9 | Evidence Pack Builder | Gemma 또는 상위모델에 제공할 근거 패키지 구성 |
| Layer 10 | Feedback & Evaluation Store | 변호사 수정결과, 정답셋, 평가셋 저장 |


## 3. Layer 0 Source Vault

### 3.1 저장 대상

| 자료유형 | 예시 |
|---|---|
| 계약서 | SPA, SSA, SHA, BTA, 투자계약서, 공급계약서, 라이선스계약서 |
| 마크업 | 상대방 수정본, 내부 수정본, 최종본 |
| 이메일 | 협상 이메일, 고객 지시, 상대방 의견 |
| 회의자료 | 회의록, 녹취록, Teams transcript |
| 법률자료 | 법령, 판례, 행정해석, 논문, 자문메모 |
| 실사자료 | DD request list, disclosure schedule, Q&A |
| 내부 기준 | 검토 체크리스트, 플레이북, 선호 문구집 |
| 결과물 | 검토의견서, 이메일 회신문, 협상 메모 |
| 개발자료 | SaaS 사양명세서, TUW, 프롬프트, QA 결과 |

### 3.2 원본 필수 식별자

| 필드 | 설명 |
| --- | --- |
| source_id | 원본 고유 ID |
| file_hash | 파일 해시값 |
| original_filename | 원래 파일명 |
| normalized_filename | 정규화 파일명 |
| uploaded_by | 업로드자 |
| uploaded_at | 업로드시각 |
| source_system | Outlook, SharePoint, OneDrive, Local, Gmail 등 |
| confidentiality_level | 일반, 기밀, 극비, 외부공유금지 |
| matter_id | 연결 사건/거래 |
| client_id | 고객 |
| document_family_id | 같은 문서 계열 |
| version_id | 버전 |
| privilege_status | 변호사-의뢰인 비밀, 업무상 작성물, 일반자료 등 |
| retention_policy | 보존정책 |
| access_policy | 접근권한 |


## 4. Layer 1 Canonical Document Store

문서는 PDF, DOCX, HWP, XLSX, PPTX, MSG, EML, HTML 등 포맷이 다르므로 Gemma가 직접 다루기 전에 공통 구조로 정규화해야 합니다.

| 요소 | 설명 |
| --- | --- |
| document_id | 정규화 문서 ID |
| title | 문서 제목 |
| document_type | 계약서, 이메일, 회의록, 판례, 법령 등 |
| body_text | 추출 본문 |
| sections | 조항/섹션 구조 |
| tables | 표 구조 |
| footnotes | 각주 |
| comments | Word comment |
| redlines | 마크업 변경사항 |
| attachments | 첨부파일 |
| signatures | 서명란 |
| exhibits | 별지 |
| defined_terms | 정의어 |
| cross_references | 조항 참조 |
| extracted_entities | 당사자, 날짜, 금액 등 |
| provenance | 원본 위치 정보 |


## 5. 계약서 정규화 필수 요소

| 항목 | 예시 |
|---|---|
| 전문 | 당사자, 체결 배경, 거래 목적 |
| 정의조항 | 본건 주식, 거래종결일, 중대한 부정적 영향 |
| 본문 조항 | 매매대금, 거래종결, 진술보장, 확약, 손해배상 |
| 별지 | 대상회사 정보, 주식목록, 인허가, 부동산 목록 |
| 서명란 | 당사자명, 대표자명, 주소 |
| 조항 참조 | 제○조 제○항 |
| 기간·금액·비율 | 거래종결기한, 매매대금, 지분율 |
| 권리·의무·조건 | 동의권, 우선매수권, 비밀유지, 선행조건 |
| 예외 | carve-out, knowledge qualifier, materiality qualifier |

## 6. Layer 2 Metadata Store

메타데이터는 벡터DB보다 중요할 수 있습니다. 질문이 “Delta 협상에서 상대방이 IPR 조항에 대해 뭐라고 했지?”라면 Matter, document_type, issue, party_position, date_range, version_status, 권한을 모두 필터링해야 합니다.

### 6.1 Matter Metadata

| 필드 | 설명 |
|---|---|
| matter_id | 사건/거래 ID |
| matter_name | 사건명 |
| client_id | 고객 ID |
| counterparty | 상대방 |
| matter_type | M&A, 투자, 분쟁, 주주간계약, 실사 등 |
| jurisdiction | 대한민국, 미국 등 |
| governing_law | 준거법 |
| status | 진행중, 종결, 보류 |
| responsible_lawyer | 담당 변호사 |
| team_members | 참여자 |
| deal_value | 거래금액 |
| risk_level | 위험도 |
| confidentiality_level | 보안등급 |

### 6.2 Document Metadata

| 필드 | 설명 |
|---|---|
| document_id | 문서 ID |
| matter_id | 연결 사건 |
| document_type | 계약서, 이메일, 회의록, 판례 등 |
| subtype | SPA, SHA, BTA, 투자계약서 등 |
| version_status | 초안, 상대방 수정본, 내부 수정본, 최종본 |
| author/sender/recipient | 작성자·발신자·수신자 |
| created_at/received_at | 생성·수신일 |
| effective_date/execution_date | 효력발생일·체결일 |
| language | 한국어, 영어 등 |
| privilege_status | 비닉특권/비밀보호 상태 |
| citation_allowed | 외부 인용 가능 여부 |
| source_confidence | 원본 신뢰도 |

### 6.3 Clause Metadata

| 필드 | 설명 |
|---|---|
| clause_id | 조항 ID |
| document_id | 문서 ID |
| clause_number | 제○조 |
| clause_title | 조항 제목 |
| clause_type | 진술보장, 손해배상, 해제, 비밀유지 등 |
| legal_function | 권리부여, 의무부과, 책임제한, 조건설정 등 |
| party_favorable_to | 매도인, 매수인, 투자자, 회사 등 |
| risk_category | 책임확대, 조건불명확, 절차누락 등 |
| importance | low, medium, high, critical |
| negotiation_status | 수용, 거절, 보류, 추가검토 |
| final_outcome | 최종 반영 여부 |
| fallback_clause_id | 대체문구 |
| playbook_rule_id | 관련 내부 기준 |
| authority_ids | 관련 법령/판례/문헌 |

## 7. Layer 3 Chunk Store

법률문서는 일반 문서처럼 일정 글자 수로만 자르면 안 됩니다. 조항·항·호·정의어·별지·마크업·코멘트 단위의 parent-child chunking이 필요합니다.

| 자료유형 | 권장 청킹 |
| --- | --- |
| 계약서 | 문서 전체 요약, 전문, 정의조항 전체, 개별 정의어, 조항, 항/호/목, 별지, 표, 서명란, 마크업 변경, 코멘트 |
| 이메일 | 이메일 1통, thread 요약, 문단, 첨부파일 관계 |
| 회의록 | 발언 주제, 결정사항, action item |
| 판례 | 사실관계, 쟁점, 판단, 결론, 판시사항 |
| 법령 | 조문, 항, 호, 부칙 |
| 실사자료 | RFI 항목, 답변, 제출문서, 보완요청 |
| 개발문서 | 기능, 요구사항, TUW, verification case |


각 chunk에는 document_id, clause_id, page_number, paragraph_number, clause_number, char_start, char_end, source_filename, version_id, extracted_at, extraction_method, confidence가 붙어야 합니다.

## 8. Layer 4 Vector Index

벡터DB에는 clause_text, clause_summary, issue_summary, party_position, lawyer_comment, negotiation_history, final_clause, authority_summary, playbook_rule을 저장합니다. 다만 벡터 검색은 의미상 유사문장에 강하고, 정의어·조항번호·판례번호·고유명사는 키워드 검색이 더 정확할 수 있으므로 반드시 hybrid search를 사용합니다.

## 9. Layer 5 Keyword / BM25 Index

정의어, 조항번호, 판례번호, 법령조문, 고유명사, 금액, 이메일 제목, 버전명, 마크업 코멘트를 정확히 찾기 위해 OpenSearch/Elasticsearch 또는 PostgreSQL full-text를 사용합니다.

## 10. Layer 6 Knowledge Graph

그래프 노드는 Client, Matter, Party, Person, Company, Document, Version, Clause, DefinedTerm, Obligation, Right, Condition, Risk, Issue, Authority, Email, Meeting, Decision, PlaybookRule, DraftingPattern, NegotiationPosition, FinalOutcome으로 구성합니다.

주요 엣지는 HAS_MATTER, HAS_DOCUMENT, HAS_VERSION, HAS_CLAUSE, DEFINES, REFERENCES, CREATES_RIGHT, IMPOSES_OBLIGATION, SUBJECT_TO, HAS_RISK, SUPPORTED_BY, DISCUSSES, TAKES_POSITION, RESOLVED_BY, MATCHES_PLAYBOOK, HAS_FALLBACK, SUPERSEDES, RELATED_TO입니다.

## 11. Layer 7 Playbook / Rule Store

플레이북은 판단기준 저장소입니다. 예를 들어 SPA 손해배상 rule은 rule_id, clause_type, transaction_type, client_side, preferred_position, fallback_position, red_flag, required_elements, optional_elements, negotiation_note, sample_clause_ids, authority_ids, escalation_required를 가져야 합니다.

룰엔진은 정의어 사용 여부, 당사자와 서명란 일치, 선행조건과 종결의무 연결, 손해배상 cap/basket/survival, SHA 동의권/ROFR/Tag/Drag/Deadlock 정합성, 투자계약 MFN/상환권/전환권 충돌, IP 소유권 구분 등을 검사합니다.

## 12. Layer 8 Retrieval Orchestrator

질문 유형에 따라 metadata search, keyword search, vector search, graph query, rule lookup을 조합합니다. 법률판단 또는 최신 법령·판례 확인은 상위모델 또는 사람 검토로 에스컬레이션합니다.

## 13. Layer 9 Evidence Pack Builder

Evidence Pack에는 user_question, task_type, matter_context, relevant_documents, authoritative_sources, retrieved_chunks, graph_facts, rule_findings, conflicts, uncertainty, prohibited_assumptions, output_format, citation_requirements를 포함합니다.

## 14. Layer 10 Feedback & Evaluation Store

Gemma 초안, 상위모델 보정 결과, 변호사 최종안, 발송본, 협상결과, 오류유형, 수정이유, 재사용 가능성, 평가점수를 저장합니다. 이 데이터는 SFT/LoRA 후보, 플레이북 rule, checklist rule, retrieval 개선, version ranking 개선, drafting pattern 등록에 사용합니다.

## 15. Gemma 역할

Gemma는 Extractor, Classifier, Query Rewriter, Summarizer, Drafting Assistant, Checklist Runner, Local Triage Agent, Feedback Formatter로 사용합니다. 고위험 법률판단, 최종 대외문안 검토, 복잡한 계약장치 설계, 판례·법령 종합은 상위모델 또는 변호사 검토로 보냅니다.
