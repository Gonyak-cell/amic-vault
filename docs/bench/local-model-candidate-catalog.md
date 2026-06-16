# Local Model Candidate Catalog

Status: PACK-LAI-18 refreshed bench-only catalog.
Date: 2026-06-16.

This catalog is documentation and benchmark data only. It does not add product model routes, dependencies, tenant tables, or user-visible AI behavior. `packages/shared/src/types/ai-policy.ts` must continue to expose only `local_gemma`.

## Sources Checked

- Google Gemma 4 12B announcement: `https://blog.google/innovation-and-ai/technology/developers-tools/introducing-gemma-4-12b/`
- Google Gemma 4 overview: `https://ai.google.dev/gemma/docs/core`
- Ollama Gemma 4: `https://ollama.com/library/gemma4`
- Qwen3 official blog/GitHub/Ollama: `https://qwenlm.github.io/blog/qwen3/`, `https://github.com/QwenLM/Qwen3`, `https://ollama.com/library/qwen3`
- Qwen3.5 and Qwen3-Coder Ollama pages: `https://ollama.com/library/qwen3.5`, `https://ollama.com/library/qwen3-coder`
- DeepSeek R1 0528/Ollama: `https://api-docs.deepseek.com/news/news250528`, `https://ollama.com/library/deepseek-r1:8b`
- Meta Llama 4/Ollama: `https://ai.meta.com/blog/llama-4-multimodal-intelligence/`, `https://ollama.com/library/llama4/tags`
- Mistral Small/Ollama: `https://mistral.ai/news/mistral-small-4/`, `https://docs.mistral.ai/models/overview`, `https://ollama.com/library/mistral-small3.2`
- Qwen3 Embedding/BGE-M3: `https://qwenlm.github.io/blog/qwen3-embedding/`, `https://ollama.com/library/qwen3-embedding`, `https://ollama.com/library/bge-m3`

## Generation Candidates

| Candidate | Role | Why Bench | Route Status |
|---|---|---|---|
| `gemma4:12b` | Baseline | Current local route, latest Gemma 4 12B unified release, practical quantized footprint. | Product baseline remains `local_gemma`. |
| `qwen3:8b` | Candidate | Strong multilingual/reasoning family; likely practical laptop comparison. | Bench-only. |
| `qwen3.5:9b` | Candidate | Newer Qwen3.5 local candidate for structured output, Korean language, and latency comparison. | Bench-only. |
| `qwen3:30b` | Candidate | MoE quality comparison for legal summaries if workstation memory allows. | Bench-only. |
| `qwen3.5:35b` | Watchlist | Higher-memory Qwen3.5 quality comparator for difficult prep prompts. | Bench-only. |
| `qwen3-coder:30b` | Watchlist | Agentic/code family useful for JSON/schema-discipline stress tests, not legal prep default. | Bench-only. |
| `deepseek-r1:8b` | Candidate | Reasoning-focused distilled model; useful for unsupported-claim and citation discipline tests. | Bench-only. |
| `mistral-small3.2:24b` | Candidate | Strong instruction following/function-calling comparison at 24B. | Bench-only; license recheck required. |
| `mistral-small4:119b` | Watchlist | Mistral Small 4 hybrid instruct/reasoning/coding model; server-local only if hardware/license permit. | Bench-only; high-resource. |
| `llama4:scout` | Watchlist | Long-context multimodal candidate for very large matters. | Bench-only; high-resource and license review required. |

## Embedding Candidates

| Candidate | Role | Why Bench | Route Status |
|---|---|---|---|
| `qwen3-embedding:0.6b` | Candidate | Multilingual retrieval and reranking baseline candidate for Korean legal search. | Bench-only; no pgvector/search route change. |
| `bge-m3` | Candidate | Multilingual, multifunctional, multigranularity embedding comparator. | Bench-only; no pgvector/search route change. |

## Decision Rule

A candidate can become a product-route proposal only after a separate approved gate proves:

- Local/private endpoint only.
- No external SDK, API key, or cloud route.
- Permission-before-AI and audit-by-default still pass.
- Citation accuracy, unsupported claim rate, latency, and Korean legal language quality beat `gemma4:12b` on an approved deidentified corpus.
- License/legal review accepts enterprise use.
- `aiModelRouteKeys` is changed only by a later approved decision, not by this bench lane.
