# Gemma4 Hardening L0 Evidence Register

Date: 2026-06-15
Status: L0 baseline captured for continuation work
Worktree: `/Users/jws/Projects/amic-vault-lai-02`
Continuation branch: `feat/pack-lai-13-hardening-plan`

## Baseline Snapshot

| Item | Evidence |
|---|---|
| Worktree branch before continuation | `codex/prod-patch-42e7b29` |
| Continuation branch | `feat/pack-lai-13-hardening-plan` |
| Baseline HEAD | `87c65c0f7af27d161e24ed0a3d2f0f67c9cb2c72` |
| Worktree cleanliness before edits | clean |
| Normative brief checked | `docs/package/codex/00_Master_Brief.md` |
| Existing Local AI plan | `docs/execution/TUW_LOCAL_AI_OPERATING_LAYER.md` |
| Existing Local AI gate | `docs/ledger/gates/LOCAL_AI_gate.md` |
| Existing Local AI report | `docs/reports/local_ai_operating_layer.md` |
| Existing upload prep smoke | `docs/reports/local_ai_upload_prep_smoke.md` |
| Existing negative matrix | `docs/reports/local_ai_negative_case_matrix.md` |
| Production preflight | `docs/release/production-execution-preflight.md` |
| Production evidence register | `docs/release/evidence-register.md` |

## Implemented Baseline

The repo already implements and records evidence for:

- Local-only model route: product route remains `local_gemma`.
- Post-upload async prep: upload/search indexing can enqueue `ai.prep`.
- File-organization prep scope: document profile, key fields, date facts,
  people/organizations, keyword tags, filing suggestions, source outline, and
  retrieval hints.
- No upload-prep legal analysis: risk, issue, clause, and legal-conclusion
  shaped claims are rejected/fallback at shared/API/DB/scan layers.
- Bounded artifact persistence: prep artifacts store source refs, hashes,
  bounded claims/sections, statuses, and warning codes; no raw prompt/source or
  raw model response.
- Fallback behavior: invalid Gemma output is discarded and deterministic
  file-organization fallback may be persisted with bounded fallback metadata.
- PACK-LAI-14 decision: new invalid Gemma output is represented as first-class
  `rejected` prep state rather than completed fallback, with only bounded
  deterministic payload retained for ops and no user-visible rejected payload.
- Eval and scan gates: `pnpm eval:local-ai` and `pnpm ai-prep:scan` are part of
  the Local AI gate.
- Bench-only local candidate lane: non-Gemma candidate comparison remains
  default-off and does not add product routes.

## Latest Recorded Quality Evidence

From `docs/ledger/gates/LOCAL_AI_gate.md` and
`docs/reports/local_ai_operating_layer.md`:

| Metric | Latest recorded value |
|---|---:|
| completedOutputCount | 25 |
| fallbackArtifactCount | 1 |
| generatedOutputCount | 24 |
| fallbackRate | 4.0% |
| prepSchemaViolationCount | 0 |
| permission leakage | 0 |
| generated-only citation accuracy | 100.0% |
| unsupported claim rate | 0.0% |
| raw payload/audit key count | 0 |
| legal claim count | 0 |
| missing/mismatched source ref count | 0 |
| external model route count | 0 |

## Production Boundary

The latest production patch applied migrations `0064` through `0068`, but
runtime execution remains disabled in production until separate operator
approval.

Production task env recorded in the ledger:

- `LOCAL_GEMMA_ENABLED=false`
- `AI_PREP_ENABLED=false`
- `AI_PREP_QUEUE_WORKER_ENABLED=false`
- `AI_SUMMARY_GEMMA_ENABLED=false`

This L0 register is not production authorization.

## Review Inputs

Agbrowse ChatGPT Pro review was obtained using the operator-provided
`agbrowse web-ai query --vendor chatgpt --model pro` path. Material accepted
findings:

- Main risk is contract drift, not missing broad AI ambition.
- Schema decision must precede adapter, UI, and production readiness work.
- EvidencePack v2 should be an adapter/builder contract before broad rewrite.
- Graph/relation enrichment should happen only after retrieval orchestration.
- UI/ops polish should follow quality and evidence gates.
- Production readiness must split technical readiness from governance
  authorization.

Read-only reviewer/explorer findings accepted into the continuation plan:

- Make upload-prep no-legal-analysis a hard product contract.
- Add L0 verification/evidence before new implementation.
- Split prep output contracts from non-prep summaries/Q&A.
- Decide how to represent `rejected` before changing code.
- Expand eval corpus before claiming operational production readiness.
- Keep production flags disabled until explicit operator approval.

## Gap Register

| Gap | Impact | Continuation pack |
|---|---|---|
| No explicit `rejected` prep status or equivalent terminal contract | Addressed by ADR-GEMMA4-PREP-STATUS and migration `0069_add_ai_prep_rejected_status.sql` | PACK-LAI-14 |
| Prep output schema and Evidence Pack source-ref shapes are only implicitly bridged | Addressed by PACK-LAI-15 v2 prep adapter and scan gate | PACK-LAI-15 |
| EvidencePack v2 not versioned as a stable adapter contract | Addressed by `evidence_pack.v2.prep_adapter` compatible with Evidence Pack v1 | PACK-LAI-15 |
| Stale/rebuild semantics are not fully covered for permission/policy/metadata/source changes | Addressed by PACK-LAI-16 bounded stale reason contract, permission/wall/metadata/source invalidation hooks, and stale/rejected/fallback rebuild tool path | PACK-LAI-16 |
| Retrieval plans are not artifact-specific enough for quality growth | File-organization quality can plateau despite safety pass | PACK-LAI-17 |
| Eval corpus is still technical and small | Safety pass is not equivalent to operational quality proof | PACK-LAI-18 |
| UI/ops wording and metrics need terminal-state clarity | Users/admins may misread fallback/rejected/stale states | PACK-LAI-19 |
| Production readiness and production authorization are not separate gates | Technical pass could be mistaken for enablement approval | PACK-LAI-20 |

## L0 Conclusion

Gemma4 is implemented enough to run local file-organization prep in controlled
local/staging-style environments, and the current synthetic evidence passes the
recorded Local AI gate. It is not yet authorized for production runtime
execution, and the continuation should start with schema/status decision rather
than UI or production enablement.

Immediate next pack: PACK-LAI-14, after PACK-LAI-13 documentation verification
passes.
