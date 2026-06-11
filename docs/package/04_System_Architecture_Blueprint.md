# 04. System Architecture Blueprint

## 1. 아키텍처 목표

Vault 아키텍처는 Matter 중심 데이터 모델, 원본문서 불변성, 권한 우선 검색, AI 접근통제, 감사로그, 지식그래프, 플레이북/룰 엔진, 피드백 루프를 모두 결합해야 합니다.

## 2. 논리 계층

| Layer | 명칭 | 역할 |
|---:|---|---|
| 0 | Client/UI Layer | Web app, Outlook/Gmail add-in, external portal |
| 1 | API Gateway | 인증, tenant context, rate limit, request validation |
| 2 | Domain Services | Matter, Document, Email, Permission, Audit, Search, AI, Graph, Contract, DD, Litigation |
| 3 | Policy Services | RBAC, ABAC, Ethical Wall, AI Policy, External Sharing, Retention |
| 4 | Data Processing | OCR, parser, chunker, indexer, graph sync, rule engine |
| 5 | Storage | Object storage, PostgreSQL, OpenSearch, Vector DB, Neo4j, Audit Store |
| 6 | AI Orchestration | Retrieval Orchestrator, Evidence Pack Builder, Model Gateway, Feedback Store |
| 7 | Observability & Governance | metrics, logs, traces, ledgers, release gates |

## 3. 구조도 설명

Vault의 핵심 데이터 흐름은 다음과 같습니다.

1. Source Vault에 원본문서를 저장합니다.
2. Canonical Document Store에서 문서를 정규화합니다.
3. Metadata Store에 Matter, Document, Clause, Permission, Version 정보를 저장합니다.
4. Chunk Store에서 문서·조항·이메일을 검색 단위로 분해합니다.
5. Vector Index, Keyword/BM25 Index, Knowledge Graph, Playbook/Rule Store를 구축합니다.
6. Retrieval Orchestrator가 질문 유형에 따라 검색전략을 선택합니다.
7. Evidence Pack Builder가 Gemma 또는 상위모델에 넣을 근거 패키지를 만듭니다.
8. Model Gateway가 risk-based model routing을 수행합니다.
9. Feedback & Evaluation Store가 변호사 수정, 정답셋, 평가결과를 저장합니다.

## 4. 권장 기술 스택

| 영역 | MVP 권장 | 장기 권장 |
|---|---|---|
| Backend | NestJS/FastAPI | 모듈화된 service architecture |
| Frontend | React/Next.js | Design system + app shell |
| DB | PostgreSQL | tenant-aware PostgreSQL cluster |
| Object Storage | S3-compatible/MinIO | S3 + KMS/BYOK |
| Vector | pgvector | Qdrant/Milvus/Weaviate/Vespa 검토 |
| Full-text | OpenSearch 또는 PostgreSQL FTS | OpenSearch/Elasticsearch |
| Graph | Neo4j | Neo4j Aura/cluster |
| Workflow | Queue 기반 worker | Temporal/Kafka/Redpanda |
| Local Model | Gemma 4 12B 또는 적정 로컬 모델 | Model Gateway 기반 교체 가능 구조 |
| Embedding | EmbeddingGemma/bge/e5 비교평가 | 로컬·외부 embedding 다중 라우팅 |
| Observability | OpenTelemetry, Prometheus, Grafana | SIEM 연동 |

## 5. 핵심 컴포넌트

| 컴포넌트 | 책임 |
|---|---|
| TenantContextService | 모든 요청에 tenant/workspace context 부여 |
| PermissionService | Matter/document/clause/AI 접근권한 판정 |
| AuditService | append-only audit event 기록 |
| DocumentIngestionService | 업로드, hash, storage, versioning |
| CanonicalizationWorker | 문서 정규화, OCR, parser |
| ChunkingService | parent-child chunking과 provenance 부여 |
| SearchIndexer | keyword/full-text/vector indexing |
| GraphSyncService | core object를 Neo4j graph로 동기화 |
| PlaybookRuleEngine | 계약유형별 검토 rule 실행 |
| RetrievalOrchestrator | 질문 유형별 검색전략 선택 |
| EvidencePackBuilder | Gemma 입력 근거 패키지 구성 |
| ModelGateway | Gemma/local/external model routing |
| FeedbackService | 변호사 피드백, 평가셋, 학습자료 저장 |

## 6. 배포 원칙

- 초기에는 tenant_id 기반 shared DB로 시작할 수 있으나, 권한필터와 row-level isolation test를 필수로 둡니다.
- 엔터프라이즈 고객은 schema-per-tenant 또는 DB-per-tenant 확장을 준비합니다.
- 고객 기밀자료는 기본적으로 로컬모델 또는 승인된 private endpoint에서 처리합니다.
- 권한·AI 정책 판단 실패 시 fail closed로 차단합니다.
