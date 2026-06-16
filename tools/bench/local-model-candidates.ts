export type LocalBenchWorkload = 'generation' | 'embedding';
export type LocalBenchRole = 'baseline' | 'candidate' | 'watchlist';

export interface LocalModelBenchCandidate {
  id: string;
  ollamaModel: string;
  workload: LocalBenchWorkload;
  role: LocalBenchRole;
  parameterClass: string;
  licenseNote: string;
  resourceNote: string;
  strengths: readonly string[];
  risks: readonly string[];
  sourceUrls: readonly string[];
}

export const localModelBenchCatalogDate = '2026-06-16';

export const localModelBenchCandidates = [
  {
    id: 'gemma4-12b-baseline',
    ollamaModel: 'gemma4:12b',
    workload: 'generation',
    role: 'baseline',
    parameterClass: '12B',
    licenseNote: 'Gemma terms/open-weight terms require legal review before redistribution.',
    resourceNote: 'Google lists Gemma 4 12B around 6.7GB at Q4_0 plus runtime overhead.',
    strengths: [
      'Current Vault product route baseline.',
      'Multimodal and multilingual reasoning family with Ollama availability.',
      'Fits laptop-class quantized local evaluation better than larger MoE candidates.',
    ],
    risks: [
      'Live quality sampling is still required before production authorization.',
      'Not replaced by this bench lane; DEC-11 still keeps product route local_gemma only.',
    ],
    sourceUrls: ['https://ai.google.dev/gemma/docs/releases', 'https://ollama.com/library/gemma4'],
  },
  {
    id: 'qwen3-8b',
    ollamaModel: 'qwen3:8b',
    workload: 'generation',
    role: 'candidate',
    parameterClass: '8B dense',
    licenseNote: 'Qwen3 open-weight licensing is generally Apache 2.0 for listed open models; verify exact tag.',
    resourceNote: 'Practical laptop/desktop candidate before testing larger Qwen3 MoE variants.',
    strengths: [
      'Strong multilingual and reasoning family.',
      'Good candidate for Korean legal language and structured-output comparisons.',
    ],
    risks: [
      'Thinking-mode templates can affect latency and formatting.',
      'Must remain bench-only until a later approved route gate.',
    ],
    sourceUrls: ['https://qwenlm.github.io/blog/qwen3/', 'https://ollama.com/library/qwen3'],
  },
  {
    id: 'qwen3-5-9b',
    ollamaModel: 'qwen3.5:9b',
    workload: 'generation',
    role: 'candidate',
    parameterClass: '9B multimodal',
    licenseNote: 'Verify exact Qwen3.5 tag license before any non-bench use.',
    resourceNote: 'Practical local candidate for structured output and Korean prep comparisons.',
    strengths: [
      'Ollama lists Qwen3.5 as a newer multimodal Qwen family with tools/thinking support.',
      'Smaller local option for comparing against Gemma 4 12B latency and JSON discipline.',
    ],
    risks: [
      'Newer family requires prompt-template and license recheck before product discussion.',
      'Must remain bench-only until a later approved route gate.',
    ],
    sourceUrls: ['https://ollama.com/library/qwen3.5'],
  },
  {
    id: 'qwen3-5-35b',
    ollamaModel: 'qwen3.5:35b',
    workload: 'generation',
    role: 'watchlist',
    parameterClass: '35B multimodal',
    licenseNote: 'Verify exact Qwen3.5 tag license before any non-bench use.',
    resourceNote: 'Higher-memory workstation candidate; not a laptop default.',
    strengths: [
      'Potential quality comparator for difficult Korean file-organization prompts.',
      'Useful for measuring whether larger local models reduce rejected/fallback rates.',
    ],
    risks: [
      'May exceed current local runtime memory and latency budget.',
      'Not eligible for product route without separate governance and sizing proof.',
    ],
    sourceUrls: ['https://ollama.com/library/qwen3.5'],
  },
  {
    id: 'qwen3-30b-a3b',
    ollamaModel: 'qwen3:30b',
    workload: 'generation',
    role: 'candidate',
    parameterClass: '30B MoE / about 3B active',
    licenseNote: 'Verify exact Ollama/Hugging Face tag license before any non-bench use.',
    resourceNote: 'Medium local workstation candidate; higher memory and latency than 8B.',
    strengths: [
      'MoE candidate with stronger reasoning potential than small dense models.',
      'Useful for legal summary quality comparison if hardware allows.',
    ],
    risks: [
      'May exceed laptop memory budget depending on quantization.',
      'Must not be added to product route schema by this PACK.',
    ],
    sourceUrls: ['https://github.com/QwenLM/Qwen3', 'https://ollama.com/library/qwen3'],
  },
  {
    id: 'qwen3-coder-30b',
    ollamaModel: 'qwen3-coder:30b',
    workload: 'generation',
    role: 'watchlist',
    parameterClass: '30B code/agentic',
    licenseNote: 'Verify exact Qwen3-Coder tag license before any non-bench use.',
    resourceNote: 'Structured-output and tool-use comparator; not a legal prep default.',
    strengths: [
      'Ollama lists Qwen3-Coder 30B as a local agentic/code model.',
      'Can stress JSON/schema discipline in the bench harness without product exposure.',
    ],
    risks: [
      'Domain fit is coding/agentic rather than legal file organization.',
      'Must not be proposed as product route from this PACK.',
    ],
    sourceUrls: ['https://ollama.com/library/qwen3-coder'],
  },
  {
    id: 'deepseek-r1-8b-0528',
    ollamaModel: 'deepseek-r1:8b',
    workload: 'generation',
    role: 'candidate',
    parameterClass: '8B distilled reasoning',
    licenseNote: 'DeepSeek R1 family was released with permissive open-source terms; verify exact distilled tag.',
    resourceNote: 'Reasoning-oriented 8B candidate for local structured legal analysis tests.',
    strengths: [
      'Reasoning upgrade line includes JSON/function-call improvements in official 0528 release notes.',
      'Small enough for practical local comparison.',
    ],
    risks: [
      'Ollama tag/version must be checked to ensure it maps to the intended 0528 variant.',
      'Reasoning verbosity may increase latency and output-guard rejection rate.',
    ],
    sourceUrls: [
      'https://api-docs.deepseek.com/news/news250528',
      'https://ollama.com/library/deepseek-r1:8b',
    ],
  },
  {
    id: 'mistral-small3-2-24b',
    ollamaModel: 'mistral-small3.2:24b',
    workload: 'generation',
    role: 'candidate',
    parameterClass: '24B',
    licenseNote: 'License must be checked per exact model card before enterprise use.',
    resourceNote: 'Ollama Q4_K_M tag is around 15GB; better for 32GB+ RAM or GPU hosts.',
    strengths: [
      'Instruction-following and function-calling update makes it relevant for structured outputs.',
      'Good balance candidate for all-around local legal drafting and summarization.',
    ],
    risks: [
      'License signals vary across public summaries and tags; legal review required.',
      'Larger than Gemma 4 12B baseline in common local setups.',
    ],
    sourceUrls: ['https://ollama.com/library/mistral-small3.2', 'https://mistral.ai/news/mistral-small-3-1/'],
  },
  {
    id: 'mistral-small4-open',
    ollamaModel: 'mistral-small4:119b',
    workload: 'generation',
    role: 'watchlist',
    parameterClass: '119B MoE',
    licenseNote: 'Open-weight Mistral terms and exact serving artifact require legal review.',
    resourceNote: 'High-resource server candidate; not suitable for laptop Gemma replacement.',
    strengths: [
      'Mistral describes Small 4 as a hybrid instruct/reasoning/coding model.',
      'Useful future server-local comparator if hardware and license review are available.',
    ],
    risks: [
      'No product route or tenant-table output is allowed by this bench lane.',
      'Likely requires GPU/server-local deployment rather than current desktop Ollama smoke.',
    ],
    sourceUrls: ['https://mistral.ai/news/mistral-small-4/', 'https://docs.mistral.ai/models/overview'],
  },
  {
    id: 'llama4-scout',
    ollamaModel: 'llama4:scout',
    workload: 'generation',
    role: 'watchlist',
    parameterClass: '17B active / 16 experts',
    licenseNote: 'Meta Llama license; enterprise restrictions require legal review.',
    resourceNote: 'Ollama lists large local footprint, around 67GB for Scout Q4 variants.',
    strengths: [
      'Very long context and multimodal capabilities are attractive for large matters.',
      'Useful as a high-resource comparison point.',
    ],
    risks: [
      'Likely above current laptop comfort zone.',
      'Not suitable as default Vault route without separate approval and infrastructure sizing.',
    ],
    sourceUrls: ['https://ai.meta.com/blog/llama-4-multimodal-intelligence/', 'https://ollama.com/library/llama4/tags'],
  },
  {
    id: 'qwen3-embedding-0-6b',
    ollamaModel: 'qwen3-embedding:0.6b',
    workload: 'embedding',
    role: 'candidate',
    parameterClass: '0.6B embedding',
    licenseNote: 'Qwen3 Embedding is reported as Apache 2.0; verify exact tag.',
    resourceNote: 'Small multilingual embedding candidate for future retrieval evals.',
    strengths: [
      'Purpose-built for multilingual retrieval and ranking tasks.',
      'Potentially better legal Korean retrieval than deterministic placeholder embeddings.',
    ],
    risks: [
      'This PACK does not enable product embeddings or pgvector route changes.',
      'Embedding dimensionality and index migration require a later approved gate.',
    ],
    sourceUrls: ['https://qwenlm.github.io/blog/qwen3-embedding/', 'https://ollama.com/library/qwen3-embedding'],
  },
  {
    id: 'bge-m3',
    ollamaModel: 'bge-m3',
    workload: 'embedding',
    role: 'candidate',
    parameterClass: '567M embedding',
    licenseNote: 'Verify BAAI/Hugging Face license for exact tag.',
    resourceNote: 'Small multilingual embedding/reranking comparison candidate.',
    strengths: [
      'Designed for multilingual, multifunctional, multigranularity retrieval.',
      'Useful benchmark comparator for future Korean retrieval quality.',
    ],
    risks: [
      'No product embedding route change in this PACK.',
      'Hybrid sparse/dense behavior needs separate search architecture approval.',
    ],
    sourceUrls: ['https://ollama.com/library/bge-m3'],
  },
] as const satisfies readonly LocalModelBenchCandidate[];

export function findBenchCandidate(idOrModel: string): LocalModelBenchCandidate | undefined {
  return localModelBenchCandidates.find(
    (candidate) => candidate.id === idOrModel || candidate.ollamaModel === idOrModel,
  );
}
