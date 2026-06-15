# Local Model Bench Lane Report

Date: 2026-06-15.
PACK: PACK-LAI-06.

## Summary

PACK-LAI-06 adds a bench-only lane for comparing Gemma 4 12B against newer local candidates. The product route remains `local_gemma`; no candidate is user-visible, persisted to tenant tables, or accepted as a product route by this report.

## Local Runtime Check

`ollama list` showed `gemma4:12b` installed locally:

- Model id: `4eb23ef187e2`
- Size: 7.6 GB
- Ollama details: `family=gemma4`, `parameter_size=11.9B`, `quantization_level=Q4_K_M`, `context_length=262144`

Runtime smoke:

- `curl http://127.0.0.1:11434/api/tags`: PASS
- `curl http://127.0.0.1:11434/api/generate` with `gemma4:12b`, JSON mode, `num_predict=16`: PASS, returned `{"status": "ok"}`

## Bench Harness

Command:

```bash
AI_BENCH_HARNESS_ENABLED=true \
PATH=/opt/homebrew/opt/node@22/bin:$PATH \
pnpm bench:local-models -- --models gemma4-12b-baseline
```

Result file:

```text
tools/bench/output/local-model-bench-2026-06-15T05-55-45-808Z.json
```

The output directory is gitignored. The committed report surface contains only model/case identifiers, latency, token counts, prompt hashes, response hashes, response character counts, statuses, and reason codes. It does not store raw prompts, raw responses, source text, or tenant table rows.

## Baseline Result

| Candidate | Cases | Completed | Max Latency |
|---|---:|---:|---:|
| `gemma4:12b` | 2 | 2 | 16999 ms |

Current warning: the committed synthetic eval fixture has 2 deidentified cases and remains below the operational 20-50 case local bench target.

## Candidate Decision

No replacement candidate is proposed yet.

Reasons:

- Only `gemma4:12b` is installed and smoke-tested locally in this PACK.
- The current fixture is a technical subset, not an operational legal-quality corpus.
- Product route schemas and policy still allow only `local_gemma`.
- Qwen, DeepSeek, Llama, Mistral, and embedding candidates require local install, benchmark output comparison, license review, and a later route-approval gate before any product use.

## Verification

- `pnpm exec vitest run tools/bench/local-model-bench.spec.ts`: PASS, 4 tests.
- `pnpm bench:local-models -- --models gemma4-12b-baseline,qwen3-8b`: PASS disabled/default-off; no model calls.
- `AI_BENCH_HARNESS_ENABLED=true pnpm bench:local-models -- --models gemma4-12b-baseline`: PASS with loopback endpoint.
- Hash-only output scan for raw prompt/response markers: PASS.
- Candidate catalog source review: PASS.
