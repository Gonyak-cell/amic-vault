# SF-B368 final source code-quality review — `26987720`

> **검토 시점 경계:** 이 보고서는 제품 소스 승인 직후, 최종 G11 자동·DB·브라우저
> 재실행 전에 작성한 독립 소스 검토 원문이다. 아래의 “G11 pending”과 G35 계획 경로
> 지적은 이후 exact-SHA 증거 재생성과 계획 수정으로 해소됐다. 소스 결정
> `WATCH / APPROVE`, blocker 0은 그대로 유지한다.

- Review date: 2026-07-31 (Asia/Seoul)
- Repository: `/Users/jws/Projects/amic-vault`
- Goal: review the small-firm OSS SaaS source closure against
  `origin/main@b3681493970714fa2d1f583a2a16f7c5d4a26582`, including
  `SF-B368-001~020`, `C01~C03`, and `G01~G35`.
- Reviewed source SHA: `269877204c75a43c47f193fdb96fa52e1ad6a0b0`
- Previous review SHA: `3762ac4bf5b980bc1e73811a95a2e638a6447a97`
- Exact source diff: `171 files changed, 14,370 insertions, 3,944 deletions`
- G35 delta: four files, 235 insertions, 11 deletions
- ULW status: no `ulw-loop` plan is installed, so this report uses the fallback
  `.omo/evidence/` location.
- Notepad path: none was supplied.
- Working-tree rule: pre-existing modified/untracked planning and evidence files
  were preserved and were not treated as committed source at the reviewed SHA.

## Decision

- `codeQualityStatus`: **WATCH**
- `recommendation`: **APPROVE**
- `blockers`: **None for source approval**

The production source is suitable to advance to final verification. The HIGH
Client create/list race found at `3762ac4b` is closed at `26987720`: a successful
create invalidates the pending list generation before publishing the created
row. The new behavior test executes the real `ClientsPage` initial effect and
submit closure, and it would fail if that invalidation were removed.

This approval is deliberately limited to source quality. It does **not** certify
`SF-B368-G11` or the repository's “100% local implementation verified” claim at
`26987720`, because the comprehensive DB/browser receipts remain bound to
`3762ac4b` and the tracked plan itself says final-SHA revalidation is pending.

## Success-criteria review

- Permission-before-search/listing: maintained. Matter, Work, notification, and
  saved-search visibility remains query-scoped and fail-closed.
- Permission-before-AI: no new external model/AI call was introduced.
- Audit-by-default: Work and notification mutations write audit and state in the
  same transaction; audit failure rolls back the mutation.
- Fail-closed mutation behavior: Work candidate/mutation SQL rechecks current
  actor, membership, DENY/Wall, target state, assignee eligibility, and affected
  row count.
- Immutable original / external sharing: no relevant contract was weakened.
- G35 race closure: satisfied in production code and behavior-backed test.
- Dependency/scope control: no package, lockfile, API contract, permission
  contract, or responsive-layout change is in the G35 delta.
- Exact-SHA final evidence: pending; not part of this source approval.

## Required skill-perspective check

The `remove-ai-slops` and `programming` skills, including the TypeScript
reference, were loaded before judging tests and maintainability. The
repository's AI-slop taxonomy was also consulted, and `sloplint --changed` was
run.

- `remove-ai-slops`: **partially violated** by implementation-mirroring tests.
  The G35 behavior test is not tautological and catches the actual regression,
  but its hand-built hook runtime remains coupled to React hook ordering. Other
  diff tests mirror SQL and Tailwind tokens. These are MEDIUM/WATCH because
  independent PostgreSQL and real-browser evidence backs the production
  behavior.
- `programming`: **partially violated** by the same test coupling and by very
  large touched service/spec modules. No production `any`, `@ts-ignore`,
  double assertion, dependency, needless parser/normalizer, or security-boundary
  shortcut was introduced by G35.
- AI slop taxonomy: no auto-detectable changed-source signal was found. Existing
  fixed-viewport browser evidence materially backs the G34 layout; it is not
  exact-SHA G35 completion evidence.

## Findings

### CRITICAL

None.

### HIGH

None.

The prior HIGH finding is resolved:

- `apps/web/src/app/(app)/clients/page.tsx:132` now calls
  `cancelPendingClientListRequest` immediately after `createClient` succeeds and
  before either resetting the active search or prepending the created row.
- `apps/web/src/app/(app)/clients/client-load-state.ts:34-41` centralizes
  invalidation without aborting or changing the API contract.
- `apps/web/src/app/(app)/clients/page.effects.test.tsx:81-106` executes the
  actual page effect and submit closure with a deferred stale list response and
  verifies that the created row remains.

### MEDIUM

1. **The component test manually substitutes React state and effect hooks.**

   - `apps/web/src/app/(app)/clients/page.effects.test.tsx:8-55`
   - `apps/web/src/app/(app)/clients/page.effects.test.tsx:81-106`

   The test replaces `useState`, `useRef`, `useEffect`, and `useCallback`, finds
   the form state by object shape, and asserts `hookHarness.states[0]`. This is
   materially better than the removed helper-only reenactment because it runs
   the production submit closure and detects deletion of the fix. It can still
   fail on harmless hook reordering or miss lifecycle behavior supplied by a
   real renderer. No DOM renderer dependency is installed, so keeping this as
   WATCH is proportionate; do not describe it as a full mounted-browser test.

2. **Several retained regression tests mirror implementation strings rather
   than observable behavior.**

   - `apps/api/src/modules/permission/permission-query.builder.spec.ts:17-34`
   - `apps/api/src/modules/work/work.service.spec.ts:678-688`
   - `apps/web/src/app/(app)/clients/page.test.tsx:38-41`
   - `apps/web/src/components/ui/layout-primitives.test.tsx:48-50`

   SQL fragments and Tailwind tokens can remain unchanged while authorization
   or clipping behavior regresses. These checks are not the sole proof:
   PostgreSQL integration tests cover Work, notification, break-glass, and
   saved-search behavior, while the 50-combination browser matrix covers G34.
   Therefore this is maintenance/false-confidence risk, not a source blocker.

3. **Final G11 evidence is not exact-SHA evidence for `26987720`.**

   - `docs/ui/2026-07-31-small-firm-oss-saas-gap-closure-plan-b3681493.md:788-803`
   - `docs/ui/2026-07-31-small-firm-oss-saas-gap-closure-verification-b3681493.md:3-5`
   - `docs/ui/evidence/sf-b368-gap-closure/browser-matrix.json:2`
   - `docs/ui/evidence/sf-b368-gap-closure/automated-gates.md:3-6`

   The tracked plan correctly says the final source SHA and G01~G35
   revalidation are pending, but the following lines still list the old unit,
   integration, migration, browser, and “blocker 0” results without an explicit
   historical-SHA label. The untracked completion report and comprehensive
   artifacts identify `3762ac4b`, not `26987720`. In addition, G11 requires a
   reproducible 200% reflow and role/state artifact; the inspected fixed-viewport
   matrix does not by itself prove browser zoom/reflow. This does not invalidate
   the source fix, but it prevents a current 100% completion claim until the
   receipt is regenerated or honestly scoped as historical/partial.

### LOW

1. **The G35 ownership list names the wrong test file.**

   - `docs/ui/2026-07-31-small-firm-oss-saas-gap-closure-plan-b3681493.md:719-723`

   It lists `page.test.tsx`, while the actual behavior regression is in
   `page.effects.test.tsx`. Update the path during final receipt cleanup so the
   TUW remains traceable.

## Critical-flow verification

### Work authorization and concurrency

- Candidate lookup is one permission-scoped statement with current actor state,
  current Work state, membership, limited-reviewer exclusion, DENY/Wall scope,
  target liveness, assignee eligibility, and `FOR SHARE OF wi`.
- Reassignment and due-date mutation lock the target, audit and update in one
  transaction, and reject an affected-row count other than one.
- The inspected PostgreSQL race test holds a concurrent Work update, observes
  the candidate request wait, and receives a safe denial after the update.

### Notifications and saved searches

- Notification read/dismiss updates are recipient-, target-, and
  permission-scoped and share a transaction with their audit event.
- Integration coverage includes other-recipient denial, audit rollback, and the
  20-plus-one pagination contract.
- Saved-search list/open/revoke/save reapply current Matter membership and
  Ethical Wall scope; malformed and mismatched Matter references fail closed.
- Search break-glass scope records every materialized override before returning
  the permitted scope. Audit failure denies the search.

### Login and responsive behavior

- Login recovery revalidates `/auth/me`, uses `location.replace`, and handles
  BFCache `pageshow`; the `next` route remains same-origin and allowlisted.
- G34 mobile action layout keeps create/search controls within the card at the
  measured target widths. The G35 delta does not touch layout.

### Client create/list race

The relevant interleavings are safe:

- stale list resolves before create: the create success prepends the new row;
- stale list resolves after create: the generation is invalidated, so neither
  its success nor error callback publishes;
- create while filtered: the old generation is invalidated, the active filter
  is cleared, and only the new unfiltered request may publish;
- create failure: the pending list is not invalidated and can finish normally.

## Independent verification

Run at `269877204c75a43c47f193fdb96fa52e1ad6a0b0`:

- `git diff --check b3681493..26987720`: PASS
- focused Client Vitest: PASS, 3 files / 16 tests
- full Web Vitest: PASS, 137 files / 511 tests
- Web ESLint: PASS
- Web TypeScript typecheck: PASS before and after build
- Web production build: PASS, 31 static pages generated
- changed-source AI-slop scan: PASS, no auto-detectable signals

At `3762ac4b`, before the G35-only Web/docs delta, the review independently ran:

- focused API: 5 files / 51 tests
- focused shared contracts: 3 files / 20 tests
- focused Web: 6 files / 55 tests

`git diff 3762ac4b..26987720` confirms that API, shared, database, migration, and
integration-test source did not change in G35.

## Evidence inspected

- `docs/ui/evidence/sf-b368-gap-closure/SHA256SUMS`
- `docs/ui/evidence/sf-b368-gap-closure/automated-gates.md`
- `docs/ui/evidence/sf-b368-gap-closure/automated-gates-3762ac4b.log`
- `docs/ui/evidence/sf-b368-gap-closure/final-fresh-db-integration-3762ac4b.log.gz`
- `docs/ui/evidence/sf-b368-gap-closure/browser-matrix.json`
- `docs/ui/evidence/sf-b368-gap-closure/browser-console.json`
- `docs/ui/evidence/sf-b368-gap-closure/browser-interactions.md`
- `docs/ui/evidence/sf-b368-gap-closure/clients-390x844.png`

The hash manifest validated for the inspected old-SHA artifacts. The integration
log reports 141 files / 458 tests, and the browser matrix contains 50 unique
route/viewport rows with zero recorded overflow or out-of-bounds interactive
controls. These remain useful historical and unchanged-surface evidence, but
they are not mislabeled here as final-SHA G11 proof.

## Recommendation

Approve the source at `26987720` and proceed to G11 final verification. Keep the
two test-quality findings on WATCH. Before declaring 100% completion, regenerate
or explicitly qualify the exact-SHA automated/browser receipts, add the missing
200% reflow evidence, correct the G35 test ownership path, and replace the
receipt's premature “blocker 0” line with this review's actual status.

## Post-review closure

- Final-SHA automated evidence was regenerated at `26987720`: 411 files /
  1,804 tests, lint/build/typecheck and UI gates PASS.
- A fresh DB and private/versioned bucket passed migration roundtrip and the
  full 141-file / 458-test integration suite.
- The final production browser artifact contains 10 routes × 5 viewports,
  explicit 200%-equivalent CSS reflow wording, seven interaction PASS results,
  and zero console entries.
- The G35 ownership path now names
  `apps/web/src/app/(app)/clients/page.effects.test.tsx`.
- These later receipts close the evidence items that were pending when this
  source-only review was issued; they do not alter its WATCH findings.
