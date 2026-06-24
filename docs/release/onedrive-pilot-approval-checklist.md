# OneDrive Pilot Approval Checklist

Status: POST-LAUNCH PILOT APPROVAL TEMPLATE
Owner: Operator / Customer-scope owner / Security owner / Legal-data owner / Rollback owner
Related template: `docs/release/onedrive-pilot-mapping-template.md`

## Purpose

This checklist defines the approval gates required before the OneDrive pilot
candidate can move from sanitized planning evidence to dry-run validation and
then to one approved pilot Matter import.

This checklist does not approve customer-wide import, OneDrive connected state,
Office open/save/sync, Gemma indexing, or source-of-truth cutover.

## Approval States

| State | Meaning |
|---|---|
| `draft` | Information is incomplete. No dry-run or write-mode import. |
| `ready_for_dryrun` | Mapping refs are complete enough for no-write validation. |
| `dryrun_passed` | LC-ONEDRIVE-04 produced a sanitized PASS report. |
| `ready_for_write_mode` | Required owners approved one pilot Matter import. |
| `write_mode_complete` | LC-ONEDRIVE-06 completed with sanitized receipt. |
| `reconciled` | LC-ONEDRIVE-07 reconciliation and rollback rehearsal passed. |
| `blocked` | Stop condition present. No further execution. |

## Required Approval Refs

| Approval Ref | Required Before Dry-Run | Required Before Write Mode | Owner |
|---|---:|---:|---|
| `ONEDRIVE-PILOT-MATTER-REF` | yes | yes | Customer-scope owner |
| `ONEDRIVE-MAPPING-REF` | yes | yes | Operator |
| `ONEDRIVE-PERMISSION-REF` | yes | yes | Security owner |
| `ONEDRIVE-RETENTION-REF` | yes | yes | Legal-data owner |
| `ONEDRIVE-ROLLBACK-REF` | yes | yes | Rollback owner |
| `ONEDRIVE-DRYRUN-PASS-REF` | no | yes | Operator |
| `ONEDRIVE-WRITE-WINDOW-REF` | no | yes | Operator |
| `ONEDRIVE-EXCLUSION-WAIVER-REF` | conditional | conditional | Customer-scope owner / Security owner |

## Pre-Dry-Run Checklist

All items must be `PASS` or `WAIVED` before LC-ONEDRIVE-04:

| Check | PASS / WAIVED / BLOCKED | Evidence Ref |
|---|---|---|
| Candidate id exists in sanitized LC-ONEDRIVE-01 output. |  |  |
| Candidate maps to exactly one pilot Matter. |  |  |
| Candidate does not represent a customer-wide corpus. |  |  |
| Tenant, Client, and Matter refs resolve to active Vault records. |  |  |
| Permission source evidence is reviewed. |  |  |
| Ethical wall implication is reviewed. |  |  |
| Retention class is reviewed. |  |  |
| Legal-hold implication is reviewed. |  |  |
| Rollback owner is assigned. |  |  |
| Duplicate policy is explicit. |  |  |
| Unsupported type policy is explicit. |  |  |
| Zero-byte policy is explicit. |  |  |
| Large-object policy is explicit and does not use browser upload. |  |  |
| Default AI allowance is `false` unless an approval ref says otherwise. |  |  |
| No customer-sensitive labels or document contents are placed in repo evidence. |  |  |

## Pre-Write-Mode Checklist

All items must be `PASS` or `WAIVED` before LC-ONEDRIVE-06:

| Check | PASS / WAIVED / BLOCKED | Evidence Ref |
|---|---|---|
| LC-ONEDRIVE-04 dry-run report is PASS. |  |  |
| LC-ONEDRIVE-05 synthetic write-mode test is PASS. |  |  |
| Import lock procedure is defined. |  |  |
| Pre-import DB snapshot ref is recorded. |  |  |
| Pre-import storage snapshot or containment ref is recorded. |  |  |
| Write window is approved. |  |  |
| Retry limit and stop conditions are accepted. |  |  |
| Sanitized receipt destination is approved. |  |  |
| Local-only detailed receipt handling is approved. |  |  |
| Rollback owner accepts no-hard-delete rollback constraints. |  |  |

## Post-Write Checklist

All items must pass before any pilot validation or cutover discussion:

| Check | PASS / WAIVED / BLOCKED | Evidence Ref |
|---|---|---|
| Succeeded plus failed equals dry-run target count. |  |  |
| Failed items are zero or explicitly excluded. |  |  |
| Vault document count reconciles to imported target count. |  |  |
| Vault file object count reconciles to imported target count. |  |  |
| Initial version count reconciles to imported target count. |  |  |
| Audit event count reconciles to imported target count. |  |  |
| Permission negative tests pass. |  |  |
| Ethical wall negative tests pass. |  |  |
| Rollback rehearsal passes without hard delete. |  |  |
| User validation sample is accepted. |  |  |

## Stop Conditions

Mark the pilot `blocked` if any condition appears:

- the scope is broader than one approved pilot Matter;
- an owner approval ref is missing;
- permission, ethical wall, retention, or legal-hold mapping is ambiguous;
- dry-run cannot be completed without writing to Vault;
- write-mode import is requested before dry-run PASS;
- the process would require hard delete of documents, versions, audit events, or
  storage objects;
- a UI, release note, runbook, or operator message would claim OneDrive live
  connection or Office open/save/sync before ADR-017 approval.

