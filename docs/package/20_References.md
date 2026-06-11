# 20. References

## Official / Primary Sources Checked

1. Google Cloud, “What is Retrieval-Augmented Generation (RAG)?” — RAG가 검색·데이터베이스와 LLM을 결합하고, hybrid search 및 re-ranking이 검색 품질에 중요하다는 설명을 확인.
   URL: https://cloud.google.com/use-cases/retrieval-augmented-generation

2. Google Cloud, Vertex AI RAG Engine Overview — RAG Engine이 외부 지식소스와 LLM context augmentation을 결합하는 데이터 프레임워크임을 확인.
   URL: https://cloud.google.com/vertex-ai/generative-ai/docs/rag-engine/rag-overview

3. Google AI for Developers, Gemma 4 model overview — Gemma 4의 open weights, 12B 등 모델 패밀리, context 및 deployment 관련 정보를 확인.
   URL: https://ai.google.dev/gemma/docs/core

4. Google AI for Developers, Gemma model fine-tuning — Gemma open weights, fine-tuning, PEFT/LoRA, success/failure/boundary test 원칙을 확인.
   URL: https://ai.google.dev/gemma/docs/tune

5. Google AI for Developers, EmbeddingGemma model overview — EmbeddingGemma의 308M parameter, multilingual embedding, local/offline retrieval use case를 확인.
   URL: https://ai.google.dev/gemma/docs/embeddinggemma

6. LangChain Docs, Build a RAG agent with LangChain — indexing이 load, split, store 단계로 구성되고 document loaders, text splitters, vector stores, embeddings를 사용하는 구조를 확인.
   URL: https://docs.langchain.com/oss/javascript/langchain/rag

7. Neo4j GraphRAG for Python Docs — Neo4j의 first-party GraphRAG package, knowledge graph builder, retrievers, graph/vector retrieval support를 확인.
   URL: https://neo4j.com/docs/neo4j-graphrag-python/current/

## Internal Design Sources

- 사용자 제공 Vault 사양명세서 및 후속 분석 내용.
- 사용자 제공 Gemma용 지식저장소 설계 메모.
- 본 문서 패키지 내 02~19번 문서.
