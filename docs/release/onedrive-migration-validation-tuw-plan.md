# OneDrive Migration Validation TUW Plan

Status: POST-LAUNCH PLANNING ONLY
Date: 2026-06-24
Owner: Operator / Customer-scope owner / Security owner / Migration operator
Related: `docs/release/onedrive-migration-post-launch-plan.md`, `docs/adr/ADR-017-office-onedrive-flow.md`

## Boundary

This document defines the testable-unit plan for preparing a OneDrive corpus
migration into AMIC Vault. It does not approve bulk customer document import,
OneDrive connected-state claims, Office open/save/sync, source-of-truth cutover,
external sharing, secure links, AI analysis, or production data movement.

Repository artifacts must remain reference-only. Do not commit customer file
contents, raw local paths, full source-path manifests, document text excerpts,
screenshots, secrets, cookies, tokens, private tenant identifiers, provider
console metadata, or evidence that exposes matter data. Raw manifests and
document-level evidence stay in the approved local/external evidence store.

## Correction To Prior Plan

The validation loop applies to every source folder candidate, not only folders
named `Project` or `Pjt.`. Project-style folders receive extra client-evidence
rules because their folder names often identify a project instead of a client,
but the same generate/verify/challenge/reconcile loop is mandatory for civil,
criminal, administrative, advisory, M&A, template/reference, and archive lanes.

The legacy archive folder `999_이전 자료들` is not a Matter-code candidate. It
must be marked archive-only and handled through archive inventory and
reconciliation receipts.

## Required Loop Pattern

Every TUW that proposes classification, client, matter, document, duplicate, or
permission values must run this loop:

1. Generate a proposed value from source metadata and approved evidence refs.
2. Verify the proposal with a second independent rule pass.
3. Challenge the proposal with conflict rules and negative checks.
4. Reconcile conflicts into `approved`, `needs_review`, `blocked`, or
   `archive_only`.
5. Record bounded evidence refs, confidence, rule versions, and reviewer state.

No proposed value becomes an import value until it is approved by the matching
TUW gate. Any mismatch between rule passes lowers confidence and blocks import
for that row.

## Matter Code Format

Matter codes may contain Korean. The canonical migration Matter-code format is:

```text
[client_short_name]/[matter_type_english]/[matter_detail_type_korean]
```

`client_short_name` must come from an approved client candidate, with generic
corporate/legal suffixes removed when they are not needed for identification.
Examples of removable suffixes include `주식회사`, `(주)`, `회계법인`,
`법무법인`, `유한회사`, `유한책임회사`, `사단법인`, and `재단법인`.
The normalized client segment must still be human-readable and must not remove
words that distinguish one client from another.

Source taxonomy folders are not clients. Broad folders such as `민사`, `형사`,
`행정`, `기업 자문`, `기업 인수&합병`, template/reference/newsletter roots, and
`Pjt.`/`Project` codename segments cannot be used as
`client_short_name_candidate` by folder name alone. A project codename segment
may receive a client candidate only when a bounded local `.docx` review finds
governing/proceeding/transaction/engagement evidence for that project root or a
human correction explicitly names the client. If a later non-category client
segment, `.docx` override, or human correction is not available, the row remains
`needs_review` and no Matter code candidate is generated.

The same rule applies when a project/reference segment is followed by a document
filename, email/export folder, hidden/tooling folder, or work-product folder
such as `검토`, `AI작업`, `버전관리`, `실사자료`, `송부본`, `체결본`, `회의록`,
`DD`, `LDD`, `RFI`, `Contracts`, or `Checklist`. Those segments are evidence
context, not clients.

Mixed client-and-matter-title labels are not accepted as client short-name
candidates. Labels containing criminal complaint/investigation terms, tax
appeal terms, advisory issue terms, civil case numbers, or `A v. B` captions
remain `needs_review` until the client is separately confirmed.
Project or development captions such as `풍무역세권개발사업` must also remain
without client or Matter code candidates until a separate client is confirmed.

Non-identifying notes and titles must be removed from otherwise valid client
labels. Current cleanup examples include `탈세제보`, `세웅`, `1세대 2주택`,
`세무법인 선율`, and terminal `회장님`, `교수님`, `선생님`, `원장님`, `작가`,
and `PD`.
`창천` is normalized to `회계법인 창천` because removing the professional-entity
qualifier would make identification less clear in this source set.
Combined person labels such as `최원준_이상현` or `황미혜_김성우` use the first
person name as the client candidate unless a later human approval row explicitly
overrides it.
Organization-person labels such as `다스버스_박길홍` remove the trailing person
name and use the organization as the client candidate.

`matter_type_english` must use the approved migration vocabulary exactly:
`Criminal`, `Civil`, `Advisory`, or `M&A`. If the evidence does not fit one of
these four values, the row remains `needs_review`; do not invent another English
type value.

`matter_detail_type_korean` is the reviewed Korean detail label such as
`손해배상`, `형사고소`, `조세불복`, `주식매매계약`, `주주간계약`,
`회의록`, `RCPS상환검토`, or `행정심판`. The detail label is evidence-based;
folder names alone are not sufficient when document evidence conflicts.

Matter-code uniqueness remains mandatory within a tenant. If two approved rows
produce the same code, the system must not silently append a suffix. The row is
blocked for reviewer reconciliation, and the reviewer must approve a
distinguishing detail label or another compliant code value.

## Matter Type Evidence Standard

Folder names are baseline signals only. Every active Matter candidate must be
checked down to its internal document set before the broad Matter type and
Korean detail type can be approved.

The approved type tuple is:

```text
matter_type_english + matter_detail_type_korean
```

`matter_type_english` must align to the approved four-value vocabulary. The Korean detail
type must be derived from internal-document evidence such as governing
contracts, court/proceeding filings, criminal complaints or investigation
materials, administrative filings, board/shareholder minutes, tax appeal
materials, correspondence, or closing/diligence documents. The evidence stored
in the repo must be an evidence ref, category, hash, count, or bounded
non-sensitive label only; do not store excerpts.

| Source family | Internal-document evidence to check | Detail-type examples |
|---|---|---|
| Civil | 소장, 답변서, 준비서면, 신청서, 판결/결정, 합의서, 내용증명, 사건번호-bearing documents | `손해배상`, `대여금`, `용역대금`, `부동산분쟁`, `가처분`, `게시물대응`, `계약분쟁` |
| Criminal | 고소장, 고발장, 의견서, 수사기관 제출서, 진정/탄원, 불송치/송치/처분 documents | `형사고소`, `피고소대응`, `수사대응`, `고발`, `진정`, `처분대응` |
| Administrative evidence | 행정심판청구서, 조세불복, 과세전적부심, 이의신청, 소청/징계, 인허가/제재 filings | `조세불복`, `행정심판`, `행정소송`, `징계`, `인허가`, `제재대응`; broad type needs reviewer mapping to `Civil` or `Advisory` |
| Advisory | 계약검토, 유권해석, 의견서, 이사회/주총 자료, RCPS/CB/BW materials, 회계/세무 검토 | `계약검토`, `유권해석`, `RCPS상환검토`, `회계자문`, `세무자문`, `주주총회` |
| M&A | SPA, SHA, 투자계약, LOI/MOU, DD request list, disclosure schedules, closing docs, 회의록 | `주식매매계약`, `주주간계약`, `투자계약`, `실사`, `클로징`, `회의록` |

When multiple detail types appear in one folder, the primary detail type must
come from the highest-authority evidence category for the source lane. Secondary
detail types are retained in metadata/review workbooks, not silently folded into
the Matter code.

## Tooling Roles

| Tool / method | Use |
|---|---|
| LazyCodex / CodeGraph | Re-check Vault DTOs, DB schema, source-system constraints, Matter-code uniqueness, document/version/file-object/audit contracts, and changed repo assumptions. |
| Loop engineering | Run repeated independent passes over every mapping class; compare outputs, surface contradictions, and keep hallucination/error checks explicit. |
| Metadata inventory tooling | Count files, bytes, extensions, timestamps, hashes, folder graph, and hydration/materialization state without committing raw source paths. |
| Evidence extraction tooling | Extract bounded, local-only evidence refs from filenames, metadata, and approved text/OCR snippets where allowed; never commit snippets or full paths. |
| Human review workbook | Final approval surface for `client_id`, `matter_code`, legal hold, ethical wall, privilege, and ambiguous client/matter mappings. |

## Global Gates

| Gate | Requirement |
|---|---|
| G0 privacy | No customer contents, raw source paths, snippets, secrets, tenant-private values, or screenshots are committed to the repo. |
| G1 archive-only | `999_이전 자료들` and other archive-only lanes produce no `matter_code`, no `matter_id`, and no document import job. |
| G2 source materialized | Inventory proves the source is materialized enough for file stats/hash reads before any mapping claim. |
| G3 schema current | LazyCodex/CodeGraph schema check confirms current Vault required fields and constraints before mapping approval. |
| G4 no silent certainty | Any client/matter value with conflict, single-source evidence, or low confidence remains `needs_review`. |
| G5 AI closed | Every proposed document row has `ai_allowed=false` unless a later approved AI gate explicitly changes the rule. |
| G6 audit ready | Any dry-run/import design includes reference-only audit receipts for every created or denied Vault action. |
| G7 replayable | Re-running the same approved manifest is idempotent or produces a deterministic duplicate/replay receipt. |

## Testable Units Of Work

### MIG-GOV-001 Migration Boundary And Evidence Policy

- Objective: Freeze migration boundaries, data-handling rules, and repository
  evidence policy for this corpus.
- Inputs: ADR-017, OneDrive post-launch plan, Vault constitution, current repo
  schema constraints.
- Outputs: Approved migration boundary checklist and evidence storage contract.
- Validation loop: One pass checks launch/OneDrive boundaries; one pass checks
  sensitive-data repository rules; reconcile any conflict into `blocked`.
- Stop condition: Any planned output requires customer document contents, raw
  paths, screenshots exposing matter data, or production import before approval.

### MIG-INV-001 Metadata-Only Source Inventory

- Objective: Build a complete metadata manifest without committing raw paths or
  document contents.
- Inputs: Approved local source root and filesystem metadata.
- Outputs: Local raw manifest, repo-safe summary with counts, byte totals,
  extension totals, top-level lane totals, and manifest hash refs.
- Validation loop: Run inventory twice from the same root and compare file
  counts, byte totals, directory counts, extension totals, and manifest hash.
- Stop condition: Counts drift without explanation, unreadable files exceed the
  approved threshold, or source looks like a provider placeholder rather than
  materialized files.

### MIG-INV-002 Hydration And Readability Audit

- Objective: Prove which files can be stat/read/hashed before any migration
  classification relies on them.
- Inputs: MIG-INV-001 raw manifest.
- Outputs: Hydration/readability report with skipped, unreadable, zero-byte,
  package/container, and oversized-file buckets.
- Validation loop: One pass samples by folder lane; one pass samples by file
  type and size band; reconcile unreadable or placeholder files as `blocked`.
- Stop condition: A lane cannot provide stable size/hash evidence.

### MIG-LANE-001 Universal Source Lane Classification

- Objective: Classify every source subtree into `active_matter_candidate`,
  `archive_only`, `template_reference`, `newsletter_publication`, or
  `needs_review`.
- Inputs: Top-level and second-level folder graph from MIG-INV-001.
- Outputs: Source-lane workbook with lane, confidence, reason code, and evidence
  refs.
- Validation loop: Classifier A uses folder-position rules; Classifier B uses
  file mix and naming signals; conflicts become `needs_review`.
- Stop condition: Any archive/template/reference lane is accidentally emitted
  as an active Matter candidate.

### MIG-ARCH-001 Legacy Archive Handling

- Objective: Mark legacy archive material as archive-only without Matter-code
  creation.
- Inputs: Archive-only lane rows from MIG-LANE-001, including
  `999_이전 자료들`.
- Outputs: Archive inventory index, archive collection label, and reconciliation
  receipt refs.
- Validation loop: One pass confirms no `matter_code`/`matter_id`; one pass
  confirms the archive is not scheduled for document import; conflicts block.
- Stop condition: Any archive-only row receives Matter code, Matter ID, client
  ID, or import-job eligibility.

### MIG-FOLDER-001 Matter Candidate Folder Graph

- Objective: Convert only approved active lanes into candidate Matter folders.
- Inputs: MIG-LANE-001 active matter rows.
- Outputs: Candidate Matter folder graph with source folder hash, parent lane,
  folder depth, child summary, file counts, byte counts, and confidence.
- Validation loop: One pass builds candidates by folder depth; one pass builds
  candidates by document concentration and file mix; mismatches become
  `needs_review`.
- Stop condition: Source folder hash maps to more than one candidate Matter
  without explicit split approval.

### MIG-EVID-001 Universal Evidence Signal Extraction

- Objective: Extract first-pass bounded evidence refs for every candidate
  folder, not just Project/Pjt. folders.
- Inputs: MIG-FOLDER-001 candidates and readable document metadata.
- Outputs: Evidence signal sheet with document-name signals, metadata signals,
  approved text/OCR signal refs, date signals, party-name candidates, and
  document-category hints.
- Validation loop: One pass extracts from file/folder names and metadata; one
  pass extracts from approved bounded text/OCR refs where allowed; conflicting
  party/client/matter signals remain `needs_review`.
- Stop condition: Evidence extraction would require committing text snippets,
  full raw paths, document bodies, or privilege-sensitive content to the repo.

### MIG-EVID-002 Folder Internal Document Census

- Objective: For every candidate folder, classify its internal documents into
  evidence categories before any client, Matter type, or detail type approval.
- Inputs: MIG-FOLDER-001 candidates, MIG-INV-001 manifest, and MIG-INV-002
  readability results.
- Outputs: Per-folder document census with counts by evidence category, file
  type, date band, size band, likely primary evidence documents, and evidence
  refs.
- Validation loop: Pass A classifies by filename, extension, folder position,
  and modified-date signals; Pass B classifies by metadata and approved bounded
  OCR/text refs where allowed. Disagreements become review flags.
- Stop condition: A folder lacks enough readable/internal-document evidence to
  support type/detail/client proposals.

### MIG-EVID-003 Governing Document Discovery

- Objective: Locate the highest-authority documents that define client,
  transaction, engagement, or dispute context for every candidate folder.
- Inputs: MIG-EVID-002 document census.
- Outputs: Governing-document evidence refs for contracts, engagement letters,
  powers of attorney, SPA/SHA/investment agreements, board/shareholder minutes,
  settlement agreements, court filings, complaints, petitions, administrative
  filings, and tax/appeal submissions.
- Validation loop: Pass A searches governing-document filename/title patterns;
  Pass B checks metadata/OCR refs and adjacent folder context. Conflicts between
  client/counterparty/opponent roles remain `needs_review`.
- Stop condition: The folder is assigned a client or Korean detail type without
  a governing-document ref or reviewer-approved exception.

### MIG-EVID-004 Proceeding Document Discovery

- Objective: Identify litigation, criminal, administrative, arbitration, and
  regulatory proceeding documents that determine concrete case type.
- Inputs: MIG-EVID-002 and MIG-EVID-003.
- Outputs: Proceeding evidence matrix with proceeding family, court/agency
  signal, case-number signal, filing role, disposition/status signal, and
  candidate Korean detail type.
- Validation loop: Pass A detects proceeding-specific document names and case
  number patterns; Pass B checks internal metadata/OCR refs and source lane.
  Family/detail conflicts become `needs_review`.
- Stop condition: A proceeding folder receives only a generic detail type such
  as `분쟁` or `기타` when more specific proceeding evidence is available.

### MIG-EVID-005 Transaction And Corporate Document Discovery

- Objective: Identify transaction and corporate-advisory evidence that
  determines whether the folder is M&A, advisory, contract, finance, or other.
- Inputs: MIG-EVID-002 and MIG-EVID-003.
- Outputs: Transaction/corporate evidence matrix for SPA, SHA, investment
  agreement, LOI/MOU, DD list, disclosure schedule, closing, board/shareholder
  minutes, RCPS/CB/BW, accounting/tax review, and opinion documents.
- Validation loop: Pass A classifies by document title/pattern and source lane;
  Pass B checks metadata/OCR refs and document mix. If transaction and advisory
  evidence both appear, primary/secondary detail types are separated.
- Stop condition: A Project/Pjt/codename or corporate folder is coded from the
  folder name without internal transaction/corporate evidence.

### MIG-EVID-006 Correspondence And Timeline Corroboration

- Objective: Use correspondence, email, meeting notes, and timeline documents to
  corroborate but not replace governing/proceeding evidence.
- Inputs: MIG-EVID-002 through MIG-EVID-005.
- Outputs: Corroboration matrix with sender/recipient role refs, timeline
  signals, meeting-note refs, and conflicts with governing/proceeding evidence.
- Validation loop: Pass A detects correspondence/timeline files; Pass B compares
  parties, dates, and subject signals against governing/proceeding evidence.
- Stop condition: Correspondence alone is used to approve client, Matter type,
  or Korean detail type when higher-authority evidence is missing or conflicting.

### MIG-EVID-007 Evidence Conflict And Negative Check Matrix

- Objective: Block hallucinated or overconfident classification when internal
  documents disagree.
- Inputs: MIG-EVID-001 through MIG-EVID-006.
- Outputs: Conflict matrix covering client-vs-counterparty ambiguity,
  plaintiff/defendant role ambiguity, project-name ambiguity, multi-detail
  folders, stale/duplicate evidence, archive/reference leakage, and missing
  evidence.
- Validation loop: Pass A compares proposed values against positive evidence;
  Pass B searches for negative evidence that would contradict the proposal.
  Any unresolved contradiction blocks approval.
- Stop condition: Any active candidate has open conflict flags but is marked
  approved or import-ready.

### MIG-CLIENT-001 Universal Client Candidate Generation

- Objective: Generate client candidates for every active Matter candidate using
  folder and evidence signals.
- Inputs: MIG-FOLDER-001 and MIG-EVID-001 through MIG-EVID-007.
- Outputs: `client_candidate_key`, `client_name_candidate`,
  `client_type_candidate`, confidence, and conflict flags.
- Validation loop: Rule pass A uses folder names and normalized party patterns;
  rule pass B uses evidence documents such as contracts, shareholder
  agreements, minutes, court filings, correspondence, and administrative
  filings. Conflicts remain `needs_review`.
- Stop condition: A client candidate is promoted from a project name, opponent
  name, counterparty name, or ambiguous `A v. B` pattern without evidence or
  human approval.

### MIG-CLIENT-002 Project-Style Client Evidence Specialization

- Objective: Apply extra evidence checks to `Project`, `Pjt.`, codename, and
  numbered transaction folders.
- Inputs: Project-style rows from MIG-CLIENT-001 and MIG-EVID-002 through
  MIG-EVID-007.
- Outputs: Project client-evidence matrix with contract/minutes/shareholder
  agreement evidence refs and explicit client/counterparty role hypotheses.
- Validation loop: One pass searches for transaction-governing documents; one
  pass searches for meeting/minutes/board/shareholder evidence; any role
  disagreement stays `needs_review`.
- Stop condition: Project/codename folder is assigned a client solely from the
  folder name.

### MIG-MATTER-001 Universal Matter Type Proposal

- Objective: Propose broad Vault `matter_type_english` for every active Matter
  candidate based on internal-document evidence.
- Inputs: MIG-LANE-001, MIG-FOLDER-001, and MIG-EVID-002 through MIG-EVID-007.
- Outputs: `proposed_matter_type_english`, source case family, primary evidence
  family, confidence, and reason codes.
- Validation loop: Classifier A uses source lane and document-census profile;
  Classifier B uses governing/proceeding/transaction evidence refs. Conflicts
  become `needs_review`.
- Stop condition: A low-confidence or conflicting type is approved without
  reviewer action.

### MIG-MATTER-002 Korean Detail Type Proposal

- Objective: Propose `matter_detail_type_korean` for every active Matter
  candidate from concrete internal-document evidence.
- Inputs: MIG-MATTER-001 and MIG-EVID-003 through MIG-EVID-007.
- Outputs: Korean detail-type proposal, primary evidence category, secondary
  detail types, confidence, conflict flags, and evidence refs.
- Validation loop: Pass A proposes detail type from highest-authority documents;
  Pass B challenges with proceeding/transaction/correspondence evidence and
  source-lane expectations. Conflicts remain `needs_review`.
- Stop condition: Detail type is generic when specific internal-document
  evidence exists, or detail type is derived only from folder name.

### MIG-MATTER-003 Primary Vs Secondary Detail Resolution

- Objective: Resolve folders containing multiple plausible detail types into one
  primary Matter-code detail and optional secondary metadata labels.
- Inputs: MIG-MATTER-002 and MIG-EVID-007.
- Outputs: Primary detail type, secondary detail types, split recommendation,
  merge recommendation, or `needs_review`.
- Validation loop: Pass A selects primary detail by evidence authority and file
  concentration; Pass B checks whether the folder should be split into multiple
  Matters or kept as one Matter with secondary metadata.
- Stop condition: Multi-detail folder is approved without primary/secondary
  resolution or split/merge decision.

### MIG-MATTER-004 Matter Name And Metadata Proposal

- Objective: Propose display-safe Matter names and metadata without leaking
  sensitive contents into the repo.
- Inputs: MIG-FOLDER-001, MIG-EVID-001 through MIG-EVID-007, MIG-CLIENT-001,
  MIG-MATTER-001, and MIG-MATTER-002.
- Outputs: `matter_name_candidate`, display label, source folder hash,
  `legacy_case_no` candidate, opened/closed date candidates, primary/secondary
  detail metadata, and review flags.
- Validation loop: One pass derives from folder labels; one pass derives from
  evidence refs and date/detail signals; conflicts stay `needs_review`.
- Stop condition: Display label includes raw path fragments, document snippets,
  secrets, or unapproved sensitive values.

### MIG-CODE-001 Matter Code Policy And Generation

- Objective: Generate Korean-capable Matter codes in
  `[client_short_name]/[matter_type_english]/[matter_detail_type_korean]`
  format only for approved active Matter rows.
- Inputs: Approved rows from MIG-CLIENT-001 and MIG-MATTER-001 through
  MIG-MATTER-004.
- Outputs: Proposed `matter_code` values, client-suffix normalization report,
  Korean detail-label evidence refs, and uniqueness report.
- Validation loop: One pass normalizes the approved client name and proposes the
  English type/Korean detail code; one pass validates removable suffix handling,
  tenant uniqueness, and schema compatibility against current Vault matters via
  LazyCodex/CodeGraph-backed schema assumptions and live export refs.
- Stop condition: Archive-only row receives a code, active row lacks approved
  client, code format does not match the canonical pattern, suffix removal makes
  the client ambiguous, or generated code collides with an existing/proposed
  Matter code.

### MIG-DOC-001 Universal Document Tag Proposal

- Objective: Propose document type, subtype, confidentiality, privilege, and AI
  flags for every file eligible for dry-run/import.
- Inputs: MIG-INV-001, MIG-EVID-001 through MIG-EVID-007, and approved Matter
  mapping rows.
- Outputs: Document-tag proposal sheet with `document_type`, subtype,
  `confidentiality_level`, `privilege_status`, `ai_allowed=false`, and
  evidence refs.
- Validation loop: Classifier A uses filename/extension/folder context;
  Classifier B uses approved metadata/text signal refs; conflicts block
  automatic approval.
- Stop condition: Any row proposes `ai_allowed=true`, privilege is inferred
  without review, or document type is assigned from a single weak signal.

### MIG-DUPE-001 Duplicate And Version Analysis

- Objective: Detect exact duplicates, likely duplicate filenames, and version
  families before import.
- Inputs: Manifest hashes, normalized filenames, mtimes, file sizes, folder
  graph, approved Matter mapping rows.
- Outputs: Duplicate/version report with exact SHA groups, likely-version
  groups, duplicate decision requirements, and review flags.
- Validation loop: One pass groups by SHA; one pass groups by normalized name,
  size/date/version tokens; conflicts become duplicate-decision review items.
- Stop condition: Same source path hash maps to multiple Matter rows, or same
  SHA is imported twice without an explicit duplicate/version decision.

### MIG-PERM-001 Permission, Wall, Hold, And Retention Mapping

- Objective: Identify permission-sensitive rows that require human/legal-data
  review before import.
- Inputs: Approved Matter/client candidates, source folder context, evidence
  refs, Vault user/team export refs.
- Outputs: Permission/wall/hold/retention review workbook.
- Validation loop: One pass derives default owner/member assumptions; one pass
  checks conflict/wall/hold/high-confidentiality signals. Any sensitive signal
  requires review.
- Stop condition: Import row lacks owner/member mapping, ethical wall state is
  unclear, legal hold is unclear for litigation/admin disputes, or retention
  treatment is unresolved.

### MIG-QA-001 Cross-Run Inconsistency And Hallucination Guard

- Objective: Compare every generated mapping across repeated runs and independent
  rule engines.
- Inputs: Outputs from MIG-LANE through MIG-PERM, including MIG-EVID-002 through
  MIG-EVID-007 and MIG-MATTER-001 through MIG-MATTER-004.
- Outputs: Inconsistency report with changed values, missing evidence,
  contradictory signals, orphan candidates, and stale assumptions.
- Validation loop: Run the mapping pipeline at least twice from the same
  manifest and once with an independent challenge profile; no automatic approval
  survives unexplained drift.
- Stop condition: Any approved row changes key fields between runs without
  explicit reconciliation.

### MIG-REVIEW-001 Human Approval Workbook

- Objective: Provide the only approval surface for migration-ready values.
- Inputs: All proposal and QA workbooks.
- Outputs: Approval workbook with `approved`, `needs_review`, `blocked`,
  `deferred`, reviewer, timestamp, and evidence refs.
- Validation loop: One pass checks required columns and status transitions; one
  pass checks that every approved row has required evidence and no open conflict.
- Stop condition: A row is scheduled for dry-run/import without approved client,
  Matter, code, permission, duplicate/version, and document tag decisions.

### MIG-DRYRUN-001 Pilot Dry-Run Package

- Objective: Prepare a pilot-only migration dry-run package from approved rows.
- Inputs: MIG-REVIEW-001 approved pilot rows.
- Outputs: Dry-run manifest, idempotency keys, expected counts/bytes/hashes,
  and rollback plan refs.
- Validation loop: One pass validates against Vault schema and constraints; one
  pass validates expected source counts and hashes; mismatches block execution.
- Stop condition: Scope exceeds approved pilot, includes archive-only material,
  or lacks rollback and audit receipt design.

### MIG-IMPORT-001 Approved Pilot Import Receipt

- Objective: Record the evidence required for a later approved pilot import.
- Inputs: MIG-DRYRUN-001 package and approved migration tool/runbook.
- Outputs: Pilot import receipt with created/reused client, Matter, document,
  file object, version, duplicate, permission, and audit refs.
- Validation loop: Compare source counts/bytes/hashes to Vault-created refs;
  re-check PermissionService-denied cases and audit-by-default receipts.
- Stop condition: Missing audit, hash mismatch, permission leak, non-idempotent
  replay, unapproved source-of-truth cutover, or hard-delete requirement.

### MIG-ROLLBACK-001 Replay And Rollback Drill

- Objective: Prove migration replay and rollback/quarantine behavior without
  mutating audit or original records.
- Inputs: MIG-IMPORT-001 receipt or dry-run simulation receipt.
- Outputs: Replay receipt, rollback/quarantine receipt, orphan-sweep report,
  and no-hard-delete confirmation.
- Validation loop: Replay same manifest; compare deterministic duplicate/reuse
  decisions; run rollback drill against derived/uncommitted artifacts only.
- Stop condition: Rollback requires audit mutation, original overwrite, hard
  delete outside approved Records controls, or source-of-truth ambiguity.

### MIG-BATCH-001 Approved Batch Expansion Plan

- Objective: Define how to expand beyond the pilot only after pilot validation
  and customer/security/legal-data approval.
- Inputs: Pilot validation, approval refs, unresolved-risk report.
- Outputs: Batch grouping plan, per-batch gates, stop conditions, and evidence
  register refs.
- Validation loop: One pass groups by risk/size/lane; one pass checks unresolved
  conflicts and archive/reference exclusions; conflicting batch rows are removed.
- Stop condition: Pilot is not validated, batch includes unapproved rows, or
  source-of-truth cutover is implied without explicit approval.

## Required Output Coverage

The schema artifact defines ten workbook tables. The rows below describe the
required coverage within those tables; they do not create additional schema
tables.

| Schema table / workbook | Must cover |
|---|---|
| `source_inventory_summary` | Manifest ref, count, bytes, extensions, unreadable count, hydration state, source-lane totals. |
| `source_lane_workbook` | Source folder hash, lane, reason code, confidence, archive/import eligibility. |
| `folder_internal_document_census` | Candidate hash, document category counts, governing/proceeding/transaction/correspondence evidence counts, readable/unreadable counts, evidence sufficiency state. |
| `evidence_matrix` | Evidence refs only, signal type, evidence category, extracted role hypothesis, source rule version, no snippets. |
| `client_candidate_workbook` | Candidate key, normalized name, role hypothesis, conflicts, approval state. |
| `matter_type_detail_workbook` | `matter_type_english`, `matter_detail_type_korean`, primary evidence category, secondary detail labels, conflict state, approval state. |
| `matter_code_uniqueness_plan` | Candidate hash, canonical code candidate, client-suffix normalization state, code state, uniqueness state, review state. |
| `evidence_conflict_matrix` | Client/counterparty ambiguity, plaintiff/defendant ambiguity, project-name ambiguity, multi-detail folders, stale evidence, archive leakage, missing evidence, QA inconsistency refs. |
| `human_approval_workbook` | Approval state for client, matter type/detail, Matter code, document tags, duplicate/version decisions, permissions, reviewer, timestamp, evidence refs. |
| `pilot_dry_run_readiness_checklist` | Pilot scope, archive exclusion, approvals, duplicates, permissions, audit/replay/rollback readiness, no connected-state/Office-sync/source-of-truth claims. |

## Mapping Defaults

| Source signal | Default treatment |
|---|---|
| Civil active lane | Active Matter candidate; likely `Civil`; client requires validation loop. |
| Criminal active lane | Active Matter candidate; likely `Criminal`; client requires validation loop. |
| Administrative active lane | Active Matter candidate; remains `needs_review` until reviewer maps it to `Civil` or `Advisory` under the approved taxonomy. |
| Advisory active lane | Active Matter candidate; likely `Advisory`; client requires validation loop. |
| M&A active lane | Active Matter candidate; likely `M&A`; client requires validation loop. |
| Project/Pjt/codename | Active Matter candidate only after evidence; client cannot come from folder name alone. |
| Internal-document inspection | Mandatory for every active candidate; broad type and Korean detail type cannot be approved from folder name alone. |
| Matter code | Use `[client_short_name]/[matter_type_english]/[matter_detail_type_korean]`; Korean is allowed; remove generic suffixes such as `주식회사` or `회계법인` only when non-identifying. |
| Template/reference/newsletter/publication | Not a Matter import candidate unless separately approved. |
| Legacy archive (`999_이전 자료들`) | `archive_only`; no Matter code; archive inventory and reconciliation only. |

## Approval Rule

The migration-ready predicate is:

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

Rows that fail this predicate remain `needs_review`, `blocked`, or
`archive_only`; they must not be imported.
