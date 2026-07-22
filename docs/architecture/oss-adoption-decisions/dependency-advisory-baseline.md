# Dependency advisory baseline — 2026-07-21

**TUW:** `DEVOPS-OSSDEP-TRIAGE-TUW-001`

**Truth state:** `LOCAL_AUDIT_TRIAGED_BLOCKED_REMEDIATION`

## Exact input identity

| Field | Value |
|---|---|
| Audit command | `pnpm audit --prod --json` |
| Command exit | `1` — expected because findings are present; not a passing release result |
| Audit result hash | `sha256:7dae03da656b3663de072279d7e0ab1c061fe9b5e12a6017fc4817c88671ba5a` |
| Lockfile SHA-256 | `7dabea4825205840497ff2bfcc0581226a8aa7a04ee484a33bc92e1a17725104` |
| Source SHA | `9570e0a42a57d5e98bcc81f1b80d89ff595944c3` |
| Source tree | `f8fae3757346320b35e989a5a2280a764bba8f84` |
| Raw audit retention | local ephemeral file only; no raw registry response is committed |

The raw audit contained 20 unique advisory IDs: 5 High, 12 Moderate, 3 Low,
and 0 Critical. The 20 IDs below are the normalized unique set; therefore a
group may contain multiple advisories but none is omitted or deduplicated away.
The existing VEX policy evaluates all High/Critical results fail-closed as
production candidates; it produces 5 `BLOCKED`, 0 unclassified High/Critical,
and `releaseSafe=false`. No VEX decision is asserted by this report.

## Reachability and remediation classification

| Component / current resolved version | Advisory IDs (count) | Directness and evidence path | Runtime/build classification | Minimum reported fix | Decision |
|---|---|---|---|---|---|
| `next@14.2.35` | `GHSA-9g9p-9gw9-jx7f`, `GHSA-h25m-26qc-wcjf`, `GHSA-ggv3-7p47-pfv8`, `GHSA-3x4c-7xq6-9pq8`, `GHSA-q4gf-8mx6-v5v3`, `GHSA-8h8q-6873-q5fj`, `GHSA-3g8h-86w9-wvmq`, `GHSA-ffhc-5mcf-pf4q`, `GHSA-vfv6-92ff-j949`, `GHSA-gx5p-jg67-6x7h`, `GHSA-h64f-5h5j-jqjh`, `GHSA-c4j6-fc7j-m34r`, `GHSA-wfc6-r584-vfw7`, `GHSA-36qx-fr4f-26g5` (14) | direct `apps/web/package.json`; server/app-router imports such as `apps/web/src/middleware.ts`, `apps/web/src/app/layout.tsx`, and `apps/web/src/app/**` | production runtime and build reachable | `>=15.5.16` covers the highest reported floor; major line change from 14 | 4 High findings `BLOCKED`; a Next compatibility/remediation TUW must be separately authorized |
| `multer@2.2.0` | none in the current 20-member audit set | transitive from direct `@nestjs/platform-express` in `apps/api/package.json`; live interceptors in `document.controller.ts`, `document-editing.controller.ts`, `bulk-upload-batch.controller.ts`, and `email.controller.ts` | production runtime reachable, untrusted multipart boundary | `2.2.0` exact root override | `SEC-UPLOAD-MULTIPART-TUW-001` completed its scoped compatible pin and parser-limit regressions; no current Multer advisory remains |
| `file-type@20.4.1` | `GHSA-5v7r-6r5c-r473`, `GHSA-j47w-4g3g-c36v` (2) | transitive through direct `@nestjs/common` / `@nestjs/platform-express`; API bootstrap and controllers use Nest, but this audit alone does not prove the affected `file-type` code path | production dependency; affected-code reachability unproven, not asserted as not affected | `>=21.3.2` | Moderate; retain in remediation queue pending source-map test/reproduction |
| `postcss@8.4.31` | `GHSA-qx2v-qp2m-jg93` (1) | transitive `apps/web > next`; production web build consumes it | production build reachable; no direct server-runtime assertion | `>=8.5.10` | Moderate; likely moves with the Next remediation, no override added |
| `@nestjs/core@10.4.22` | `GHSA-36xv-jgw5-4q75` (1) | direct root and API dependency; `apps/api/src/main.ts`, `app.module.ts`, and integration bootstrap import it | production runtime reachable | `>=11.1.18` (major line change) | Moderate; separate Nest compatibility/remediation TUW required |
| `qs@6.14.2` | `GHSA-q8mj-m7cp-5q26` (1) | transitive through direct `@nestjs/platform-express > express > qs`; document/email HTTP endpoints are active | production HTTP parsing path; precise vulnerable branch needs regression reproduction | `>=6.15.2` | Moderate; retain with Express/Nest remediation; no override added |
| `body-parser@1.20.4` | `GHSA-v422-hmwv-36x6` (1) | transitive through direct `@nestjs/platform-express > express`; API endpoints parse requests through that stack | production HTTP parsing path | `>=1.20.6` | Low; retain with Express/Nest remediation; no override added |

## Bounded remediation queue

1. A future canonical Next remediation TUW must prove Next 15 app-router,
   middleware, and deployment build compatibility before moving from
   `14.2.35` to `>=15.5.16`.
2. A future canonical Nest/Express remediation TUW must establish the smallest
   compatible route to `@nestjs/core>=11.1.18`, `qs>=6.15.2`, and
   `body-parser>=1.20.6`, including API permission and audit regressions.
3. `file-type` requires an upstream source-map/reproduction decision before a
   non-reachability conclusion; it is not a VEX candidate merely because its
   direct import was not found.

Only the canonical `multer@2.2.0` root override and its lockfile resolution
changed in this PACK. The remaining remediation queue stays blocked pending a
separately scoped compatibility decision.

## Verification record

- `pnpm audit --prod --json` produced the hash and 20-member unique set above;
  its exit `1` is evidence of unresolved findings, not a test failure hidden by
  this document.
- `node tools/security/check-vulnerability-policy.mjs --audit <ephemeral-audit>`
  must report `total=20`, `blockedProductionHighCritical=5`,
  `unclassifiedProductionHighCritical=0`, and `releaseSafe=false`.
- `node --test tools/security/check-vulnerability-policy.spec.mjs`,
  `pnpm backlog:validate`, `pnpm docs:frozen`, and `git diff --check` are the
  repository-local regression checks for this triage artifact.
