# Architecture Decision Records

ADR-001 through ADR-012 are repo-local renderings of `docs/package/codex/01_Adopted_Decisions_ADR.md`. ADR-013 and later are repo-native decision records that must name their trace sources directly and be backed by the Decision Ledger when accepted.

Status note: ADR-001 through ADR-012 inherit their accepted status from `docs/package/codex/01_Adopted_Decisions_ADR.md` and the 2026-06-12 operator waiver recorded in `docs/ledger/decision.md`. Repo-native ADRs state `Accepted` or `Proposed` in the file; proposed ADRs remain non-binding until operator/human acceptance is recorded. The underlying DEC decisions remain binding through `docs/package/codex/00_Master_Brief.md` and `docs/package/codex/01_Adopted_Decisions_ADR.md`.

| ADR | Topic | DEC / Correction Trace |
|---|---|---|
| ADR-001 | Deployment model | DEC-01 |
| ADR-002 | Database isolation | DEC-02, C-7 |
| ADR-003 | Runtime split and monorepo | DEC-03, DEC-04, DEC-06 |
| ADR-004 | Permission model | DEC-09, DEC-15, C-1, C-2, C-7 |
| ADR-005 | Audit immutability | DEC-12, Brief Constitution |
| ADR-006 | Search engine phasing | DEC-05, C-5 |
| ADR-007 | Storage and encryption | DEC-07, DEC-13 |
| ADR-008 | Queue and worker strategy | DEC-06, DEC-08 |
| ADR-009 | HWP/HWPX strategy | DEC-10 |
| ADR-010 | API versioning | DEC-14 |
| ADR-011 | Model gateway policy | DEC-11, DEC-17, DEC-18 |
| ADR-012 | Evaluation dataset strategy | DEC-16, DEC-18 |
| ADR-013 | Permission model freeze | DEC-15, C-1, PACK-R1-07, DEVOPS-FREEZE-PERMMODEL-TUW-001, `docs/package/codex/21_Permission_Model.md` |
| ADR-014 | Desktop client strategy | DEC-01, DEC-03, DEC-04, DEC-09, DEC-11, DEC-14, DEC-17, DEC-18 |

ADR changes require human approval and a Decision Ledger append.
