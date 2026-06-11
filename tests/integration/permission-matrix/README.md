# Permission Matrix Harness

`matrix-expected.csv` is the committed R1 permission freeze candidate for:

- DEC-15 roles
- R1 role/action cells in `tests/fixtures/permission-matrix.json`
- membership states: none, member_read, member_edit, owner
- wall states: none, excluded, insider_nonmember, insider, released

Do not generate expected values from production permission code. The harness compares the committed CSV to `reference-evaluator.ts`, a small direct translation of the normative permission contract. Any future cell change requires ADR-013 update and decision-ledger approval.
