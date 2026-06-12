# Learning Ledger - append-only

| Date | Scope | Pattern | Evidence | Resolution |
|---|---|---|---|---|
| 2026-06-12 | PACK-R14-01 | R14 technical completion keeps advanced AI external routes closed by schema while recording gate re-evaluation evidence. | `scale_ai_gate_reviews.external_model_allowed=false`; `tests/integration/scale-learning.spec.ts` | Re-evaluate external models only through a future explicit gate; no SDK, endpoint, key, or model call added in R14. |
| 2026-06-12 | R14 Gate | Final Scale & Learning evidence should preserve operational learning as refs and hashes, not raw incident or source text. | `docs/reports/R14_scale_learning.md`; `docs/ledger/gates/R14_gate.md` | Keep future learning additions append-only and reference-only; external AI remains closed unless a future explicit gate changes the schema and service contract. |
