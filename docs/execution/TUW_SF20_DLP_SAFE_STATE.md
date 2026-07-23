# PACK-SF20-05 — DLP safe-state and bounded manual review

Status: canonical post-R14 extension under
`USER-UMBRELLA-AUTONOMY-20260721` and the owner's all-immediate-track execution
direction. This is the canonical form of `PROPOSED-PACK-SF20-05`, based on
merged `origin/main`
`e2958d7f8c3b7ba51377479c93771d81c3dc7271`.

## Objective and authority

Prevent a maximum-20-user law-firm deployment from confusing “the detector
found nothing” with “the detector could not inspect the content”:

```text
immutable source
  -> malware/quarantine authority remains unchanged
  -> bounded canonical-text readiness inspection
  -> clean | findings | unscannable
  -> ordinary permission and ethical-wall decision
  -> policy threshold and exact-assessment manual review
  -> download/export/external-delivery allow or fail-closed deny
  -> same-transaction bounded audit
```

Vault owns the DLP policy, assessment and review state, tenant/RLS boundary,
Matter permission and ethical-wall decision, audit record, and every egress
decision. The existing immutable file and malware-promotion lifecycle remains
authoritative. Physical promotion into private Vault storage is not called DLP
approval: content whose text is pending, failed, missing, truncated, or beyond
the approved limits remains internal and its covered egress routes fail closed.

No customer data, external DLP service, dependency, runtime service, provider
resource, deployment, release, or go-live action is authorized. `docs/package/**`
remains read-only.

## OSS reuse boundary

Microsoft Presidio `2.2.364` is cloned outside the product tree at the exact
commit `779dbd286d5ef4d1fbe2514275fb1bce358f2417`, tree
`faa34e3cfd7b00ab1e99b570ac16333488b4f9a8`, under the research-only
`OSS_RESEARCH_ROOT`. The MIT license hash is
`sha256:f3e86ee59a49bcfb0d9a9547484d55224ea7b2d04f95b1947b4d18d17f6de535`.

The following exact source/test pairs are L0 behavioral references:

| Behavior | Source path / blob | Test path / blob |
|---|---|---|
| Korean RRN format, checksum and hard negatives | `presidio-analyzer/presidio_analyzer/predefined_recognizers/country_specific/korea/kr_rrn_recognizer.py` / `77ebab08d16bd6314a72cc49caeb88eb492c70f5` | `presidio-analyzer/tests/test_kr_rrn_recognizer.py` / `3a1719e0793275553fd2e84fd4c34041af92d423` |
| Korean passport positive/context/invalid cases | `presidio-analyzer/presidio_analyzer/predefined_recognizers/country_specific/korea/kr_passport_recognizer.py` / `93606722c83465c09120069aa1d6b0d7ec09d199` | `presidio-analyzer/tests/test_kr_passport_recognizer.py` / `b6d7d93f35a9334dd5d9cb621e58c6e9c8056e27` |

Upstream source, tests, fixtures, models, dependencies, containers, and service
configuration are not copied into the product tree. Vault independently
implements its bounded detector and synthetic fixtures. Presidio remains
`DEFERRED_BY_PROFILE` if the Vault corpus gate passes. A later activation
requires a separately approved measured-gap PACK and may not delegate
permission, ethical-wall, audit, tenant, immutable-original, or egress
authority.

## Pack-wide invariants

1. `clean` means a bounded detector completed over eligible canonical text and
   did not hit its cap. Zero findings without this proof is never `clean`.
2. `unscannable` is a first-class state, not an empty findings array. Reasons
   are a closed vocabulary: `assessment_missing`, `text_pending`,
   `ocr_pending`, `no_text`, `parser_failed`, `password_protected`,
   `input_oversize`, and `scan_limit_reached`.
3. The detector result is bound to the exact source identity, policy version,
   and deterministic result hash. A decision for an older version, policy, or
   hash cannot authorize a newer assessment.
4. The SF20 v1 review threshold is:
   - one or more `korean_resident_id`,
     `korean_alien_registration_number`, `passport_number`, or
     `payment_card_number` findings; or
   - twenty or more total findings; or
   - any `unscannable` assessment.
5. Email address, telephone, and bank-account findings below the total-count
   threshold remain visible findings but do not force administrator review for
   ordinary internal download. Existing external-link DLP warning acceptance
   remains an additional requirement and cannot replace the new high-risk
   review.
6. A reviewer is an active `firm_admin` or `security_admin` in the same tenant.
   Role alone is never enough: the reviewer must still pass the existing
   document/Matter permission and ethical-wall checks.
7. Review decisions are append-only `allow` or `deny`, contain a bounded reason
   code rather than free-form sensitive text, and expire. Only the latest
   unexpired decision for the exact assessment can apply; deny overrides allow.
8. A blocked attempt records `DLP_EGRESS_BLOCKED` before the caller returns the
   safe standard error. Audit failure blocks the action. An applied exception
   records `DLP_REVIEW_APPLIED` in the same transaction as the covered
   authorization decision.
9. Assessment/review/audit metadata contains references, closed status/reason
   codes, counts, policy versions, and hashes only. Raw findings, matched
   values, content, filenames, paths, URLs, tokens, and credentials are
   forbidden.
10. New tables have `tenant_id NOT NULL`, `ENABLE/FORCE ROW LEVEL SECURITY`,
    same-tenant policies, append-only runtime grants, indexes for exact source
    and current-review lookup, and reversible DDL.
11. PermissionService, ethical-wall rules, immutable originals, file-security
    promotion, storage keys, canonical-text content, and existing audit rows
    are not weakened or rewritten.
12. No dependency or lockfile change is authorized. The implementation uses
    existing NestJS/PostgreSQL/shared code and Node standard libraries.

## Ordered TUWs

| Order | ID | Risk / size | Depends on | Result |
| ----: | -- | ----------- | ---------- | ------ |
| 1 | `DEVOPS-SF20-DLP-TUW-001` | C / L | `DEVOPS-SF20-OPS-TUW-005` | explicit persisted clean/findings/unscannable assessment |
| 2 | `DEVOPS-SF20-DLP-TUW-002` | H / L | DLP-001 | deterministic Korean synthetic corpus and regression gate |
| 3 | `DEVOPS-SF20-DLP-TUW-003` | C / M | DLP-001, DLP-002 | exact-assessment manual review and covered egress gates |
| 4 | `DEVOPS-SF20-DLP-TUW-004` | H / M | DLP-002, DLP-003 | exact Presidio pin and measured activation decision |

## Durable data contract

Migration `0208_create_dlp_assessments_and_reviews.sql` adds:

- `dlp_scan_assessments`: append-only exact source assessment with
  `tenant_id`, source type/id, optional Matter/document/version references,
  `scan_state`, closed `reason_code`, finding and restricted-finding counts,
  `requires_review`, `policy_version`, `result_hash`, and timestamp.
- `dlp_review_decisions`: append-only reviewer decision bound to one
  assessment, with tenant, reviewer, `allow|deny`, bounded reason code,
  review timestamp, and expiry.

The tables do not store raw text or matched values. Runtime receives
`SELECT, INSERT` only. A current decision is selected deterministically by
`reviewed_at DESC, review_id DESC`, must be unexpired, and must reference the
exact assessment. Rollback drops only the two new tables and removes new audit
actions only when no immutable audit row uses them.

## Covered egress inventory

| Surface | Required DLP action |
|---|---|
| `GET /v1/documents/:documentId/download` | assess exact current version, then enforce review before storage read |
| `POST /v1/external/links` | assess every linked exact current version before link creation; existing warning acceptance remains |
| `GET /v1/external/access/:token/download-ticket` | re-assess/revalidate exact linked version and review at ticket issue |
| `GET /v1/emails/:emailId/raw` | enforce stable email-message assessment before raw object read |
| `POST /v1/outlook/document-insertions` | enforce exact document assessment before an insertion/reference is issued |
| bulk download behavior | ordinary document downloads are gated individually; monitoring never authorizes an item |
| DD report/negotiation exports | generated output remains a new internal document; eventual byte download uses the document gate |

Reviewed exclusions, which must be asserted by the route-inventory checker:

- preview derivatives and preview sessions retain their existing
  permission/audit/token boundary and are not an external-delivery authority;
- active edit-session base files and unpublished subversions retain their
  existing edit/reviewer ACL and audit boundary; when promoted to a current
  document version they become subject to the ordinary document gate;
- ingestion worker object reads, extraction, malware scanning, backup,
  restore, and private storage promotion are internal processing, not user
  egress;
- DD export creation returns internal document references, not source bytes.

Every route that opens immutable document/email bytes or issues an external
byte ticket must either call the central DLP egress evaluator or appear in the
closed reviewed-exclusion list. Unknown/unclassified routes fail the static
inventory check.

## `DEVOPS-SF20-DLP-TUW-001`

**Title:** Explicit unscannable assessment  
**Release/module:** R14 / DEVOPS-SF20-DLP  
**Risk/size:** C / L  
**Objective:** Make scan completeness part of the result so missing or
uninspectable text cannot silently become a clean result.

### Files

- **Create:** `db/migrations/0208_create_dlp_assessments_and_reviews.sql`;
  assessment-focused integration coverage under the existing
  `tests/integration/audit-coverage/` and `tests/integration/cross-tenant/`
  canonical suites if unit coverage cannot prove RLS/append-only behavior.
- **Modify:** `packages/shared/src/dlp/dlp-types.ts`,
  `packages/shared/src/dlp/sensitive-data-rules.ts` and colocated specs;
  `apps/api/src/modules/dlp/dlp.service.ts` and colocated spec;
  audit action/metadata allow-lists and specs.
- **May modify:** canonical-document lookup code only through a narrow
  DlpService query; root migration manifests if required by existing tooling.
- **NOT modify:** PermissionService decisions, ethical-wall policy, file
  promotion/quarantine rules, immutable file rows/storage keys, canonical text
  bodies, dependencies/lockfiles, external provider state, `docs/package/**`.

### Implementation

- Extend the detector result with `completed` and `limitReached`; do not infer
  completion from array length.
- Map canonical-text status and bounded failure codes into the closed
  unscannable reasons. Unknown status/failure is `parser_failed`, never clean.
- Persist a deterministic exact-source assessment. Concurrent identical
  assessment attempts converge without changing an existing row.
- Keep existing `scanText`/`scanAndRecord` compatibility where callers need
  findings, but make every egress path consume the explicit assessment API.
- Record `DLP_SCAN_COMPLETED` with state, reason, counts, policy, and result
  hash. Unscannable attempts also record `DLP_EGRESS_BLOCKED` when evaluated
  for egress.

### Verification (AND)

- Unit matrix distinguishes clean zero, finding zero/nonzero, every
  unscannable reason, exactly-at-limit, beyond-limit, unknown status, stable
  hash, and concurrent identical requests.
- Migration round trip proves RLS, FORCE RLS, tenant isolation, append-only
  grants, constraints, indexes, and no raw-text column.
- Negative tests prove no-text/parser/password/oversize/limit cases cannot be
  authorized as clean and audit failure cannot yield an allow.
- Existing DLP, email ingestion, document lifecycle, external portal, worker,
  permission, and audit regressions remain green.

### Done / stop

Done when every assessment is explicitly complete or unscannable and no zero
finding count alone can produce `clean`. Stop on any raw content persistence,
unknown-to-clean fallback, mutable assessment, permission/audit bypass,
dependency change, or migration without rollback.

## `DEVOPS-SF20-DLP-TUW-002`

**Title:** Korean synthetic PII corpus and regression gate  
**Release/module:** R14 / DEVOPS-SF20-DLP  
**Risk/size:** H / L  
**Objective:** Measure all seven shipped detectors on deterministic positive,
negative, and hard-negative Korean legal-work examples without real PII.

### Files

- **Create:** `tests/fixtures/dlp/korean-pii-eval.json`,
  `tools/dlp/run-korean-pii-eval.mjs`,
  `tools/dlp/run-korean-pii-eval.spec.mjs`,
  `security/dlp-korean-pii-baseline.json`, and fixture documentation.
- **Modify:** root scripts and CI only to add deterministic
  `dlp:corpus:check`; shared detector rules/specs only for corpus-proven defects.
- **NOT modify:** customer fixtures, production logs/evidence with matches,
  external services, dependencies/lockfiles, `docs/package/**`.

### Implementation

- Cover resident registration, alien registration, bank account, passport,
  payment card, Korean telephone, and email types. Each class has positive,
  format-invalid negative, context-like hard-negative, punctuation, boundary,
  and adjacent-value cases.
- Use reserved/generated values only: impossible/reserved Korean identity
  prefixes, `example.test` addresses, payment-network test numbers, and
  deterministic fictional context. Mark every row `synthetic=true`.
- Keep one expected entity set per case. Compute per-class TP/FP/FN, precision,
  recall and F1 plus micro/macro totals in stable order.
- Commit only aggregate metrics, corpus hash, policy version, and hashes of
  misclassified case IDs. Never emit the matched value or full fixture text in
  evidence.
- Gate against the committed baseline and absolute minimums:
  micro precision `>= 0.98`, micro recall `>= 0.90`, micro F1 `>= 0.94`, and
  per-class recall `>= 0.80`. A rule change must not reduce any committed
  baseline metric without an explicit canonical decision.

### Verification (AND)

- The runner produces byte-identical JSON twice and changing row order does
  not change metrics or corpus hash.
- Mutation tests fail for a real-PII marker, missing class, missing
  positive/negative/hard-negative family, unknown label, non-synthetic row,
  duplicate ID, value leakage, or metric regression.
- Every false-positive/false-negative evidence item is a hash only.
- Shared unit and full API/package tests remain green after any rule fix.

### Done / stop

Done when all seven classes meet both absolute and committed-baseline gates
with zero real/customer PII. Stop if a fixture cannot be proven synthetic,
evidence contains content/matches, output is nondeterministic, or thresholds
are weakened to pass.

## `DEVOPS-SF20-DLP-TUW-003`

**Title:** Exact-assessment manual review and zero-silent-bypass gate  
**Release/module:** R14 / DEVOPS-SF20-DLP  
**Risk/size:** C / M  
**Objective:** Require a bounded, attributable, unexpired reviewer decision
before covered high-risk or unscannable content can leave its ordinary
internal boundary.

### Files

- **Create:** `tools/dlp/check-egress-route-inventory.mjs` and its spec;
  focused integration coverage under existing `document-access`,
  `external-portal-gate`, `audit-coverage`, and `cross-tenant` suites.
- **Modify:** DLP controller/module/service and specs; document lifecycle,
  external, email, and Outlook document-insertion services/modules and
  colocated specs; shared review DTOs; audit actions/metadata.
- **May create:** a narrow `POST /v1/dlp/assessments/:assessmentId/reviews`
  endpoint. It accepts only `allow|deny`, one approved reason code, and a
  bounded expiry; no free-form note or raw finding is accepted.
- **NOT modify:** existing permission/ethical-wall decisions, public external
  portal features, raw finding logging, silent override headers/flags,
  dependencies/lockfiles, `docs/package/**`.

### Implementation

- Centralize an `evaluateEgress` decision that takes tenant, actor, exact source
  and purpose. It first requires ordinary permission/wall authorization, then
  obtains the current assessment and applies the SF20 threshold.
- Do not throw from inside the audit transaction before the blocked audit can
  commit. Return a bounded deny decision, commit its audit, then map to the
  standard safe `VALIDATION_FAILED` response outside the transaction.
- Review creation verifies active reviewer role and ordinary access/wall
  permission, inserts the decision, and writes `DLP_REVIEW_RECORDED` in the
  same transaction. Audit failure rolls back the decision.
- A valid allow permits only the exact assessment until expiry and writes
  `DLP_REVIEW_APPLIED`. A deny, missing/expired decision, newer source version,
  changed policy/hash, or evaluation error remains denied.
- Re-evaluate external links when a download ticket is issued so a stale link
  cannot carry an older allow. Existing external warning acceptance remains
  required for its own lower-risk policy.
- Email assessment is keyed by stable email ID. Existing rows with no
  assessment are `assessment_missing`; parse failure/unsupported format is
  unscannable. No random attachment scan ID can authorize raw-message egress.
- The route-inventory checker parses the covered modules and fails when a byte
  read/ticket route is neither gated nor explicitly classified.

### Verification (AND)

- Reviewer matrix covers firm/security admin, ordinary user, inactive reviewer,
  same/cross tenant, permitted/denied Matter, ethical wall, exact/stale/new
  version, allow/deny, expiry boundary, concurrent decisions, and audit failure.
- Egress matrix covers current document, external-link issue, external-ticket
  recheck, raw email, Outlook insertion, bulk individual download, and
  generated DD-document download. Every unscannable and threshold case denies
  before storage/ticket/reference access.
- Audit assertions prove blocked, recorded, and applied actions contain only
  reference IDs, reason/status, counts, policy, expiry, and hashes. Failure to
  write audit never returns an allow.
- Route inventory reports zero unknown byte/ticket routes and every reviewed
  exclusion has a named existing permission/audit control.
- Full migration, unit, integration, permission, audit, external, email, and
  Outlook regressions pass.

### Done / stop

Done when covered egress has zero silent bypass and every override is exact,
expiring, permission/wall-bound, and audited. Stop on role-only wall bypass,
cross-tenant visibility, mutable decision, free-form/raw PII, stale-version
allow, audit-after-stream, or a newly discovered unclassified route.

## `DEVOPS-SF20-DLP-TUW-004`

**Title:** Presidio measured activation decision  
**Release/module:** R14 / DEVOPS-SF20-DLP  
**Risk/size:** H / M  
**Objective:** Convert Presidio from an unpinned idea into an exact local
source reference and activate nothing unless the measured Vault corpus proves
a named gap worth another service/dependency.

### Files

- **Create:** `docs/architecture/oss-adoption-decisions/presidio.md`.
- **Modify:** `security/oss-source-map.yml`,
  `security/oss-test-reuse.yml`, `security/oss-adoption-decisions.yml` and
  their existing deterministic validators/fixtures only when required.
- **NOT modify:** runtime dependency manifests/locks, Docker/production
  topology, DLP runtime code, upstream source/tests/fixtures in product tree,
  `docs/package/**`.

### Implementation

- Record official URL, release, commit, tree, license path/hash, clone path,
  exact Korean source/test blobs, L0 `NO_COPY` use, and forbidden authority.
- Compare DLP-002 absolute and baseline metrics. The default result is
  `DEFERRED_BY_PROFILE` when all gates pass.
- Activation trigger requires at least one: micro precision below `0.98`,
  micro recall below `0.90`, micro F1 below `0.94`, any class recall below
  `0.80`, or a separately approved required entity class absent from the
  detector. A trigger opens a new PACK; it does not activate Presidio here.
- Decision records resource envelope, Python/model/image patch burden,
  expected metric improvement, license obligations, data boundary, authority
  vetoes, shadow-evaluation plan, rollback, and the 20-user operating cost.

### Verification (AND)

- `oss:source-map:check`, `oss:test-reuse:check`, adoption-decision checks,
  source-lab boundary/reproducibility checks, and product-tree no-copy checks
  pass against the exact pin.
- A missing/wrong commit, tree, license hash, blob, clone path, or NO_COPY
  policy fails validation.
- DLP corpus evidence selects exactly one result:
  `DEFERRED_BY_PROFILE` when thresholds pass or
  `FOLLOW_ON_PACK_REQUIRED` when a trigger is present. It never modifies
  runtime/dependencies.
- Product tree contains zero Presidio upstream source/test/fixture/model copy
  and no Presidio runtime/service reference.

### Done / stop

Done when the exact source is locally reproducible, its useful behavior is
traceable to the Vault corpus, and the measured decision is explicit. Stop on
floating source, missing license, product-tree copy, runtime activation,
authority delegation, or threshold-free adoption.

## Validation and evidence

Use Node `22.22.3`, pnpm `9.15.9`, PostgreSQL 16, and existing pinned local
services. Run, at minimum:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm dlp:corpus:check
pnpm dlp:egress-inventory:check
pnpm oss:source-map:check
pnpm oss:test-reuse:check
pnpm backlog:validate
pnpm docs:frozen
docker compose -f infra/docker-compose.dev.yml up -d
pnpm db:migrate
pnpm db:rollback
pnpm db:migrate
pnpm db:seed
pnpm test:integration
```

Each TUW seals a bounded manifest under
`artifacts/enterprise-dms-oss/<HEAD>/PACK-SF20-05/<TUW-ID>/`. Evidence may
contain hashes, aggregate metrics, counts, closed states/reasons, durations,
test names, and command outcomes only. It must not contain fixture text,
matched values, raw PII, customer data, file content, paths, tokens, or
credentials.

## Pack completion

PACK-SF20-05 is complete only when all four TUWs, migration round trip, full
unit/integration regressions, corpus gate, route inventory, OSS provenance
checks, bounded evidence, exact-head CI, and merge are green. Deployment,
release, go-live, customer-data migration, and a Presidio runtime remain
separate truth lines and are not implied by merge.
