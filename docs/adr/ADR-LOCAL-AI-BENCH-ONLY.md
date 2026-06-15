# ADR: Local AI Bench-Only Candidate Lane

Status: Proposed, bench-only.
Date: 2026-06-15.

## Context

AMIC Vault currently routes product AI through `local_gemma` only. PACK-LAI-06 needs a way to compare newer local models without weakening DEC-11, adding external calls, or writing model outputs into tenant tables.

## Decision

Create a bench-only lane under `tools/bench`:

- `AI_BENCH_HARNESS_ENABLED=false` by default.
- Candidate endpoints must be loopback or private network.
- Candidate names must exist in the checked-in bench catalog.
- Bench inputs come from deidentified eval fixtures.
- Bench outputs are hash-only JSON reports under `tools/bench/output/`, which is ignored by git.
- No production route, shared route key, tenant schema, API endpoint, or UI affordance is added.

## Consequences

This enables local comparison of Gemma 4 12B against Qwen, DeepSeek, Llama, Mistral, and embedding candidates while keeping the product route unchanged. A future route change requires a separate approved gate and legal/license review.
