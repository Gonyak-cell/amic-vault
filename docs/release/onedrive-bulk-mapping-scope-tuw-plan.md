# OneDrive Bulk Mapping Scope TUW Plan

Status: execution started

Run boundary:

- Source of truth: original raw source object manifest for `onedrive-staging-20260623-155501`.
- Raw manifest handling: local-only. Do not commit or upload raw object keys, paths, filenames, bucket names, OCR/text excerpts, screenshots, tokens, account IDs, ARNs, or tenant-private values.
- Import boundary: no customer document import or Vault storage write in this plan. This plan produces mapping scope inputs and dry-run receipts only.
- Matter code format: `[client_short_name]/[matter_type_english]/[matter_detail_type_korean]`.
- `matter_type_english` is limited to the approved migration taxonomy:
  `Criminal`, `Civil`, `Advisory`, or `M&A`. Korean labels belong only in
  `matter_detail_type_korean`.
- Client short names remove non-identifying suffixes such as `주식회사`, `회계법인`, `법무법인` only when the remaining name is still unambiguous.
- `999_이전 자료들` is always `archive_only`; no Matter code is generated for archive-only rows.

## Global Validation Loop

Every non-archive classification must pass:

`generate -> verify -> challenge -> reconcile -> approved / needs_review / blocked / archive_only`

Evidence-free client, matter type, matter detail, or Matter code approval is forbidden. Folder names may generate candidates, but cannot approve them without internal document census evidence.

## Completion Definition

Bulk mapping scope is complete when:

- all original manifest rows are assigned exactly one lane;
- archive rows have no Matter code and are excluded from import scope;
- approved rows have evidence-backed client, matter type, detail type, and Matter code;
- approved Matter codes pass format and length validation; repeated approved
  group rows with the same Matter code are allowed only when they resolve to one
  tenant-level Matter by Matter code;
- approved rows resolve target tenant, client, matter, and actor in dry-run;
- `needs_review`, `blocked`, `archive_only`, `unsupported`, and `deferred` rows are excluded from import execution;
- sanitized repo artifacts contain no raw source material.

## Phase 0: Baseline Lock

| TUW | Objective | Outputs | Verification |
|---|---|---|---|
| `BULK-SCOPE-000` | Lock the run boundary, source manifest ref, and no-import policy. | baseline section in sanitized receipt | original manifest exists, mode is local-only, expected row count is declared |
| `BULK-SCOPE-001` | Re-profile the original manifest. | sanitized profile summary | row count, bytes, bucket count, extension counts, and depth counts are deterministic |
| `BULK-SCOPE-002` | Enforce leakage guard policy. | sanitized receipt plus scanner result | no raw key/path/filename/bucket/token pattern in repo-safe output |

## Phase 1: Source Grouping

| TUW | Objective | Outputs | Verification |
|---|---|---|---|
| `BULK-SCOPE-010` | Extract relative source segments from object keys. | local-only row lane manifest | raw segments remain local-only |
| `BULK-SCOPE-011` | Generate depth 1, 2, and 3 group candidates. | local-only group index plus sanitized group counts | every valid raw row is represented in grouping statistics |
| `BULK-SCOPE-012` | Generate stable group IDs. | group hash index | same input produces same IDs across reruns |
| `BULK-SCOPE-013` | Assign group size and risk classes. | sanitized risk summary | group counts and bytes reconcile to manifest totals |

## Phase 2: Archive Lane

| TUW | Objective | Outputs | Verification |
|---|---|---|---|
| `BULK-SCOPE-020` | Detect `999_이전 자료들` and normalized equivalent archive segments. | archive rule section | NFC/NFD variants are detected |
| `BULK-SCOPE-021` | Split archive-only rows. | local-only lane manifest and sanitized archive count | archive rows have lane `archive_only` and no Matter code |
| `BULK-SCOPE-022` | Challenge archive/import mixing. | archive conflict report | any archive row in import candidate lane fails the gate |
| `BULK-SCOPE-023` | Reconcile initial lane accounting. | initial accounting receipt | valid rows equal `archive_only + unsupported + mapping_required` |

## Phase 3: Folder Census

| TUW | Objective | Outputs | Verification |
|---|---|---|---|
| `BULK-SCOPE-030` | Build group-level folder metadata census. | folder census workbook schema | raw paths are local-only; sanitized output stores counts and hashes only |
| `BULK-SCOPE-031` | Extract folder naming hints. | client/matter hint table | hints cannot set approved state by themselves |
| `BULK-SCOPE-032` | Challenge `pjt` and `project` folders. | project-folder challenge set | internal document census is required before approval |
| `BULK-SCOPE-033` | Check group coverage. | group coverage matrix | every group has a lane and next action |

## Phase 4: Internal Document Census

| TUW | Objective | Outputs | Verification |
|---|---|---|---|
| `BULK-SCOPE-040` | Build group-level representative document metadata census. | local-only document census | no body, OCR excerpt, or screenshot is saved |
| `BULK-SCOPE-041` | Assign document evidence classes. | evidence class matrix | criminal, civil/proceeding, M&A transaction, advisory, contract, meeting, registry, tax, and admin classes are bounded |
| `BULK-SCOPE-042` | Identify governing evidence. | governing evidence matrix | SPA, SHA, articles, board/shareholder minutes are classified |
| `BULK-SCOPE-043` | Identify proceeding evidence. | proceeding matrix | complaint, answer, brief, order, judgment, and evidence filing classes are classified |
| `BULK-SCOPE-044` | Identify transaction evidence. | transaction matrix | SPA, investment agreement, share transfer, DD, and closing materials are classified |
| `BULK-SCOPE-045` | Split correspondence/admin evidence. | correspondence/admin matrix | correspondence alone cannot approve client or matter detail |

## Phase 5: Client Resolution

| TUW | Objective | Outputs | Verification |
|---|---|---|---|
| `BULK-SCOPE-050` | Generate client candidates from evidence. | client candidate workbook | every candidate has evidence refs |
| `BULK-SCOPE-051` | Normalize client suffixes. | client short-name table | ambiguous short names become `needs_review` |
| `BULK-SCOPE-052` | Match existing Vault/Matter clients in dry-run. | client target match report | exact, fuzzy, new, and blocked outcomes are separated |
| `BULK-SCOPE-053` | Challenge client ambiguity. | client conflict matrix | multiple viable clients cannot be approved |

## Phase 6: Matter Type And Detail Resolution

| TUW | Objective | Outputs | Verification |
|---|---|---|---|
| `BULK-SCOPE-060` | Lock `matter_type_english` controlled list. | matter type enum map | enum-outside values are blocked or `needs_review` |
| `BULK-SCOPE-061` | Generate Korean detail type candidates. | detail type workbook | detail comes from internal document evidence |
| `BULK-SCOPE-062` | Challenge detail conflicts. | detail conflict matrix | mixed contract/advisory/dispute evidence requires reconciliation |
| `BULK-SCOPE-063` | Confirm group-level matter candidates. | matter candidate workbook | client, type, and detail all require evidence |

## Phase 7: Matter Code Proposal

| TUW | Objective | Outputs | Verification |
|---|---|---|---|
| `BULK-SCOPE-070` | Generate Matter code candidates. | matter code proposal table | format is `[client]/[type]/[detail]` |
| `BULK-SCOPE-071` | Validate format and length. | code validation report | 120-character limit, empty segment, and forbidden character checks pass |
| `BULK-SCOPE-072` | Validate uniqueness. | duplicate matrix | tenant-level Matter codes remain unique at write time; repeated approval groups with the same code resolve to one Matter |
| `BULK-SCOPE-073` | Reconcile collisions. | collision resolution workbook | automatic suffixing is forbidden without approval |

## Phase 8: Validation Loop Engine

| TUW | Objective | Outputs | Verification |
|---|---|---|---|
| `BULK-SCOPE-080` | Run generate pass. | generated candidate rows | every non-archive group has candidates or a reason |
| `BULK-SCOPE-081` | Run verify pass. | evidence-backed candidate rows | evidence gaps become `needs_review` |
| `BULK-SCOPE-082` | Run challenge pass. | challenge report | alternative client/matter possibilities are tested |
| `BULK-SCOPE-083` | Run reconcile pass. | final lane draft | conflicts cannot remain approved |
| `BULK-SCOPE-084` | Check loop completeness. | validation loop receipt | every row has loop state |

## Phase 9: Human Approval Workbook

| TUW | Objective | Outputs | Verification |
|---|---|---|---|
| `BULK-SCOPE-090` | Build approval workbook schema. | human approval workbook schema | no raw path/content fields |
| `BULK-SCOPE-091` | Populate approval-ready rows. | approval-ready workbook | reviewer can approve, reject, review, or defer |
| `BULK-SCOPE-092` | Validate approval state. | approval validation report | only approved rows advance |
| `BULK-SCOPE-093` | Record approval receipt. | approval receipt schema | approval refs only; no document content |

## Phase 10: Target Resolution Dry-Run

| TUW | Objective | Outputs | Verification |
|---|---|---|---|
| `BULK-SCOPE-100` | Dry-run approved client upserts. | client upsert plan | reuse, new, and blocked outcomes are separated |
| `BULK-SCOPE-101` | Dry-run approved matter upserts. | matter upsert plan | Matter app and Vault projection targets are separated |
| `BULK-SCOPE-102` | Resolve target IDs. | target resolution receipt | tenant, client, matter, and actor are resolved |
| `BULK-SCOPE-103` | Gate archive exclusion. | archive import block report | archive write target count is zero |

## Phase 11: Bulk Import Scope Build

| TUW | Objective | Outputs | Verification |
|---|---|---|---|
| `BULK-SCOPE-110` | Join approved mapping rows to source objects. | approved bulk import scope local manifest | non-approved lanes are excluded |
| `BULK-SCOPE-111` | Split unsupported extensions. | unsupported report | unsupported rows are excluded from import scope |
| `BULK-SCOPE-112` | Generate idempotency keys. | idempotency map | reruns cannot duplicate created documents |
| `BULK-SCOPE-113` | Create sanitized bulk scope summary. | repo-safe summary | leakage scan passes |

## Phase 12: Final Readiness

| TUW | Objective | Outputs | Verification |
|---|---|---|---|
| `BULK-SCOPE-120` | Check full accounting. | row accounting receipt | all lanes sum to original manifest rows |
| `BULK-SCOPE-121` | Run bulk target dry-run. | bulk target dry-run receipt | approved scope has no blockers or failures |
| `BULK-SCOPE-122` | Build import readiness checklist. | pilot/bulk readiness checklist | write approval gate is explicit |
| `BULK-SCOPE-123` | Run final leakage scan. | leakage scan receipt | repo leakage count is zero |

## Execution Status

Initial execution reached `BULK-SCOPE-123` using `tools/migration/onedrive-bulk-scope.mjs`.

Current final readiness is `blocked_pending_human_approval`, not import-ready. This is intentional: the run produced complete row accounting, folder census, evidence hint matrices, approval workbook rows, and an empty approved import scope. Actual approved import scope creation requires a human-approved workbook that confirms client, matter type, matter detail, and Matter code values.

The follow-on approval pipeline has also been started end-to-end. The tool now emits local-only reviewer packet, representative document census, candidate hint, Matter code proposal, target-resolution plan, write-readiness checklist, and empty approved import scope artifacts. These artifacts intentionally keep all generated candidates in `needs_review`; they are not authoritative client or Matter assignments.

Reviewer workbook generation is handled by `tools/migration/onedrive-approval-workbook.py`. The generated workbook is local-only and not repo-safe because it may include group labels and representative document names needed for human review.

Approval workbook ingest is handled by `tools/migration/onedrive-approval-ingest.py`. It reads the local workbook, accepts only `reviewer_decision=approve` rows with valid approved client, matter type, matter detail, and Matter code values, and writes local-only approved group, approved import scope, target-resolution plan, and write-readiness outputs.

Review batching is handled by `tools/migration/onedrive-approval-batch.py`. It creates local-only priority workbooks for focused human review without auto-approving any row.

Batch application is handled by `tools/migration/onedrive-approval-batch-apply.py`. It merges reviewed batch decisions into a new local-only approval workbook, preserving the original workbook.

Current started-pipeline counts:

- reviewer packet groups: `1,757`
- representative document census rows: `6,800`
- candidate hint rows: `1,757`
- client hints present after category/project/work-product/title filtering and
  bounded `.docx` project overrides: `1,136`
- draft Matter code candidates: `900`
- approved import scope rows: `0`

Current generated matter-type candidate distribution:

- `Advisory`: `326`
- `Civil`: `291`
- `Criminal`: `258`
- `M&A`: `481`
- missing matter-type hint: `401`

Matter code candidates must start with a client hint, not a source taxonomy
folder. Source category roots such as `민사`, `형사`, `행정`, `기업 자문`,
`기업 인수&합병`, template/reference/newsletter roots, and `Pjt.`/`Project`
codename segments are excluded from `client_short_name_candidate` unless a
bounded local `.docx` review or human correction produces an explicit
project-client override. If no later non-category client segment, `.docx`
override, or human correction is available, the row remains `needs_review` and
no Matter code candidate is generated.

Current project-root client candidates are Washington ->
`더블유더블유지미래혁신사모투자`, London -> `더블유더블유지미래혁신사모투자`,
Fausta -> `봉경환 이익중`, El Paso -> `이엠엘`, Equity -> `이은주`,
Kingston -> `이로투자조합1호`, Horizon -> `유진이엔티`, Next -> `최재헌 외 2인`,
Switch -> `성진종합전기`, 명의신탁 환원 프로젝트 -> `진형건설`, Lion ->
`롯데에코월`. Spicy had no `.docx` evidence or human correction in the bounded
review and remains `needs_review`.

The client detector also stops before file-like, system, email, and work-product
segments. Examples include document filenames, hidden/tooling folders, `검토`,
`AI작업`, `버전관리`, `실사자료`, `송부본`, `체결본`, `회의록`, `DD`, `LDD`,
`RFI`, `Contracts`, `Checklist`, and similar review/output folders.
Mixed client-and-matter-title labels such as criminal complaint labels, tax
appeal labels, advisory issue labels, civil case numbers, or `A v. B` captions
are also held as `needs_review` without a Matter code candidate. Project or
development captions such as `풍무역세권개발사업` are treated the same way and
must not become client or Matter code candidates.
Non-identifying notes and titles are removed from otherwise valid client labels:
`탈세제보`, `세웅`, `1세대 2주택`, `세무법인 선율`, and terminal `회장님`,
`교수님`, `선생님`, `원장님`, `작가`, and `PD`. `창천` is normalized to
`회계법인 창천` because the professional-entity suffix is needed for
identification in this source set. Combined person labels such as
`최원준_이상현` or `황미혜_김성우` use the first person name as the client
candidate unless a later human approval row explicitly overrides it.
Organization-person labels such as `다스버스_박길홍` remove the trailing person
name and use the organization as the client candidate.

Current approval ingest status:

- workbook decisions: `needs_review=1,757`
- approved groups: `0`
- approved source rows: `0`
- status: `blocked_pending_approval`

Current first review batch:

- batch: `first-review-p2-draft-code`
- rows: `300`
- included priority: `P2_draft_code_ready`
- auto-approved rows: `0`

Current first review batch apply:

- matched batch rows: `300`
- output approval decisions: `needs_review=1,757`
- approved groups after ingest: `0`
- approved source rows after ingest: `0`
