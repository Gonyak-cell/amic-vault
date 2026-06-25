# OneDrive Migration Mapping Package

Status: PRE-IMPORT MAPPING PACKAGE
Date: 2026-06-24
Basis: `docs/release/onedrive-migration-validation-tuw-plan.md`
Schema artifact: `docs/release/onedrive-migration-workbook-schemas.json`

## Scope

This package prepares evidence-ref based OneDrive-to-Vault mapping. It does not
perform bulk customer document import, source-of-truth cutover, OneDrive
connected-state claims, Office open/save/sync claims, or any production data
movement.

Repository artifacts are reference-only. Raw source paths, customer document
contents, OCR/text excerpts, screenshots exposing matter data, tokens, cookies,
private tenant identifiers, provider-console metadata, and tenant-private values
must remain outside the repository.

## Source Inventory Summary

This summary is metadata-only and point-in-time. Counts may drift as OneDrive
sync materializes or removes files. The raw manifest is external/local only.

| Field | Value |
|---|---:|
| Scan date | 2026-06-24 |
| Source root | Redacted local OneDrive corpus root |
| Raw path manifest committed | No |
| Document text committed | No |
| Files | 190,129 |
| Directories | 18,672 |
| Bytes | 434,177,329,103 |
| Read/stat errors | 0 |

### Staging Copy Reconciliation Note

The source inventory counts above are the repo-safe local corpus inventory
rollup. They are not identical to the staging object manifest, which is an
object-level copy receipt after provider/system exclusions. The current
sanitized staging receipt records `190,064` objects and `433,977,168,134` bytes;
use that receipt for staging-copy reconciliation and the source inventory rollup
for mapping coverage.

### Lane Totals

| Lane | Files | Dirs | Bytes | Import treatment |
|---|---:|---:|---:|---|
| legacy_archive_only | 147,323 | 12,458 | 327,220,820,461 | Archive inventory only; no Matter code |
| ma_transaction_active_candidate | 21,809 | 3,549 | 37,565,848,942 | Candidate Matter lane after document evidence loop |
| civil_active_candidate | 12,306 | 1,425 | 48,593,055,716 | Candidate Matter lane after document evidence loop |
| administrative_active_candidate | 3,991 | 597 | 8,298,554,010 | Candidate Matter lane after document evidence loop |
| criminal_active_candidate | 2,741 | 322 | 9,473,207,559 | Candidate Matter lane after document evidence loop |
| corporate_advisory_active_candidate | 1,789 | 301 | 2,969,290,026 | Candidate Matter lane after document evidence loop |
| template_reference | 147 | 14 | 25,406,010 | Not a Matter import candidate unless separately approved |
| newsletter_publication | 11 | 3 | 3,390,118 | Not a Matter import candidate unless separately approved |
| attorney_reference | 5 | 1 | 1,685,393 | Reference only |
| meeting_reference | 3 | 1 | 67,108 | Reference only unless manually attached to approved Matter |
| press_reference | 2 | 1 | 25,985,261 | Reference only |
| provider_or_system_artifact | 2 | 0 | 18,499 | Exclude or review |

### Extension Totals

| Extension | Files |
|---|---:|
| `.pdf` | 90,152 |
| `.txt` | 19,908 |
| `.png` | 15,802 |
| `.xls` | 14,925 |
| `.jpg` | 12,524 |
| `.docx` | 11,872 |
| `.xlsx` | 9,539 |
| `.hwp` | 2,706 |
| `.zip` | 1,484 |
| `.m4a` | 1,119 |
| `.doc` | 1,085 |
| `.eml` | 1,083 |
| `.mp4` | 914 |
| `.pptx` | 892 |
| `.html` | 714 |
| `.avi` | 586 |
| `.msg` | 568 |
| `.json` | 521 |
| `.md` | 514 |
| `.jpeg` | 448 |
| `.url` | 274 |
| `.xml` | 222 |
| `.hwpx` | 168 |

## Package Outputs

The workbook schemas for these outputs are defined in the schema artifact.

| Output | Purpose | Approval rule |
|---|---|---|
| source_inventory_summary | Repo-safe inventory rollup and manifest refs | No raw paths; counts reconcile with external raw manifest |
| source_lane_workbook | Classify each source subtree into active, archive, template/reference, or review lane | Archive/reference lanes cannot create Matter code |
| folder_internal_document_census | Check each candidate folder's internal document mix before classification | Required before client/type/detail approval |
| evidence_matrix | Track governing, proceeding, transaction, correspondence, and negative evidence refs | Evidence refs only; no snippets |
| client_candidate_workbook | Propose client candidates and normalized short names | Requires evidence and conflict review |
| matter_type_detail_workbook | Propose `matter_type_english` and `matter_detail_type_korean` | Requires internal-document evidence and primary/secondary resolution |
| matter_code_uniqueness_plan | Generate and validate Matter code candidates | Uses approved client/type/detail only; collisions block |
| evidence_conflict_matrix | Detect hallucination, contradictory signals, and stale assumptions | Any unresolved conflict blocks import readiness |
| human_approval_workbook | Human approval surface for all import-ready values | Only approved rows can enter pilot dry-run |
| pilot_dry_run_readiness_checklist | Pilot-only dry-run gate | No bulk import; no source-of-truth cutover |

## Matter Code Policy

Matter code format:

```text
[client_short_name]/[matter_type_english]/[matter_detail_type_korean]
```

Rules:

- Korean is allowed in Matter code.
- `client_short_name` must be evidence-backed and approved.
- Generic suffixes such as `주식회사`, `(주)`, `회계법인`, `법무법인`,
  `유한회사`, `유한책임회사`, `사단법인`, and `재단법인` are removable only
  when removal does not make the client ambiguous.
- `matter_type_english` must be one of the approved migration matter types:
  `Criminal`, `Civil`, `Advisory`, or `M&A`. If evidence does not fit one of
  these four values, leave the row `needs_review`.
- `matter_detail_type_korean` must be derived from internal-document evidence,
  not from folder name alone.
- If the generated code exceeds the current Vault `matterCode` limit of 120
  characters, the row becomes `needs_review`.
- If two rows produce the same code, do not append an automatic suffix. Block
  for reviewer reconciliation.
- `legacy_archive_only` rows, including `999_이전 자료들`, must not receive
  Matter code.

## Internal-Document Evidence Rules

Folder names are baseline signals only. Every active candidate folder must pass
internal-document review before client, broad type, detail type, or Matter code
approval.

| Evidence class | Used to decide | Examples of allowed evidence refs |
|---|---|---|
| governing_document | Client role, engagement/dispute/transaction anchor, detail type | Contract title hash, engagement category count, governing-doc file hash |
| proceeding_document | Litigation/criminal/admin/arbitration family and detail type | Case-number signal flag, filing category, court/agency signal flag |
| transaction_document | M&A/advisory/finance/contract detail type | SPA/SHA/minutes/DD/closing category counts |
| correspondence_timeline | Corroboration only, not primary approval | Email/thread category counts, meeting-note category count |
| negative_conflict | Blocks overconfident mapping | Counterparty-role conflict, multi-detail conflict, stale evidence flag |

## Validation Loop

Every proposal row must run the same loop:

```text
generate -> verify -> challenge -> reconcile -> approved/needs_review/blocked/archive_only
```

Required independent passes:

1. Folder-position and metadata pass.
2. Internal-document evidence pass.
3. Negative/conflict challenge pass.
4. Reconciliation pass with reviewer state.

Any mismatch between passes lowers confidence and blocks automatic approval.

## Workbook Schema Summary

The schema artifact defines column-level contracts. The most important required
fields are:

- stable hashed source identifiers, never raw paths;
- lane and import eligibility;
- evidence category counts and evidence refs;
- client candidate, normalized short name, and ambiguity flags;
- broad `matter_type_english`;
- Korean `matter_detail_type_korean`;
- primary and secondary detail resolution;
- canonical Matter code candidate and uniqueness state;
- conflict matrix state;
- human approval state;
- pilot dry-run readiness state.

## Matter Mapping Predicate

A row is migration-ready only when all conditions hold:

```text
source_materialized
AND lane_approved
AND NOT archive_only
AND folder_document_census_complete
AND governing_or_proceeding_or_transaction_evidence_reviewed
AND client_approved
AND matter_type_approved
AND matter_detail_type_approved
AND primary_secondary_detail_resolved
AND matter_code_unique
AND permission_wall_hold_review_complete
AND document_tags_reviewed
AND duplicate_version_decision_complete
AND qa_inconsistency_count = 0
AND audit_and_rollback_receipts_defined
```

Rows that fail the predicate remain `needs_review`, `blocked`, or
`archive_only`; they must not be imported.

## Pilot Dry-Run Readiness Checklist

| Check | Required result |
|---|---|
| Scope | Exactly approved pilot rows only |
| Archive exclusion | No `legacy_archive_only` rows |
| Evidence | All pilot rows have internal-document evidence refs |
| Client | Approved `client_id` or approved client-create candidate |
| Matter type/detail | Approved `matter_type_english` and `matter_detail_type_korean` |
| Matter code | Unique, <= 120 characters, canonical format |
| Document tags | `ai_allowed=false`; privilege requires review |
| Duplicates | SHA duplicate and version decisions complete |
| Permissions | Owner/member/wall/hold/retention review complete |
| Audit | Reference-only audit receipt design exists |
| Replay | Idempotency key and replay behavior defined |
| Rollback | No audit mutation, no original overwrite, no hard-delete dependency |
| Claims | No OneDrive connected-state, Office open/save/sync, or source-of-truth cutover claim |

## Blockers

Stop and escalate if any of these occur:

- a row needs customer document text, raw source path, screenshot, secret, or
  tenant-private value in the repo;
- a folder has contradictory client or detail-type evidence;
- a Project/Pjt/codename row lacks internal governing/transaction evidence;
- an archive-only row receives Matter code or import eligibility;
- Matter code collision cannot be resolved by evidence-backed reviewer action;
- source counts, bytes, or hashes drift without explanation;
- pilot import would require hard delete, audit mutation, original overwrite, or
  source-of-truth cutover.
