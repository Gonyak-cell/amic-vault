# Provider A02 filter slice — frozen for latest-endpoint security handoff

- Worktree: `/Users/jws/.codex/worktrees/amic-vault-issue-470-provider-20260925`
- Branch: `codex/issue-470-vault-provider-complete`
- Status at handoff: `git status --short` contains the pre-existing latest endpoint changes plus this uncommitted A02 slice; no commit or push was performed.
- Parent instruction: stop editing `amic-os-vault-read.controller.ts` and `amic-os-vault-read.service.ts` while the latest endpoint security fix has exclusive ownership. The controller/service A02 hunks below were already present before this handoff; subsequent work was limited to search builder/tests/evidence until parent staging.

## A02 changes currently present

- `amic-os-vault-read.controller.ts`: parses optional `date_basis`, `body_q`, `mime_type`, Matter/Client code/name, `tags`, `sort_by`, and `code_basis`; rejects non-Matter code basis and non-empty metadata-code filters; maps body query and date/search constraints into `AmicOsVaultReadInput`.
- `amic-os-vault-read.service.ts`: adds optional filter fields to `AmicOsVaultReadInput`; maps body-only query, date basis, MIME, Matter/Client labels, client code, tags, and explicit sort into the existing permission-scoped `SearchService.search` call.
- `apps/api/src/modules/search/query/search-filter.builder.ts`: adds permission-query-stage MIME, document-tag, Client external-code, and created/modified date-basis fragments.
- `packages/shared/src/search/search-query.dto.ts`: adds `clientCode`, MIME, tag, and date-basis filter schema fields.
- `packages/shared/src/index.ts`: exports the date-basis schema/value/type.
- Date ranges with `created_or_modified` use one bounded range for either the indexed modified timestamp or the document creation timestamp, preventing the lower and upper bounds from being satisfied by different fields.
- `apps/api/src/modules/search/search.service.ts`: audit `filter_refs` now records `client_code_filter`, `mime_type_filter`, `tags_filter`, and the effective requested `date_basis`; the new refs are placed before longer existing refs so the bounded 256-character audit field does not truncate these A02 markers.

## Validation

- `PATH=/opt/homebrew/Cellar/node@22/22.22.3/bin:$PATH pnpm --filter @amic-vault/api exec vitest run src/modules/integrations/amic-os-vault-provider/amic-os-vault-read.controller.spec.ts src/modules/integrations/amic-os-vault-provider/amic-os-vault-read.service.spec.ts src/modules/search/query/search-filter.builder.spec.ts`: passed 3 files / 66 tests (2026-09-25 20:11 KST).
- `PATH=/opt/homebrew/Cellar/node@22/22.22.3/bin:$PATH pnpm --filter @amic-vault/shared exec vitest run src/search/search-query.dto.spec.ts`: passed 1 file / 10 tests (2026-09-25 20:10 KST).
- Captured API test output: `.omo/evidence/provider-search-filter-vitest-api-20260925.txt` (743 bytes; exit code 0; controller 30, service 22, builder 14 tests passed).
- Captured shared DTO test output: `.omo/evidence/provider-search-filter-vitest-shared-20260925.txt` (521 bytes; exit code 0; 10 tests passed).
- `PATH=/opt/homebrew/Cellar/node@22/22.22.3/bin:$PATH pnpm --filter @amic-vault/api exec vitest run src/modules/search/search.service.spec.ts`: passed 1 file / 14 tests (2026-09-25 20:13 KST); captured at `.omo/evidence/provider-search-filter-audit-vitest-20260925.txt` (exit code 0).
- Combined focused run after the audit change: `pnpm --filter @amic-vault/api exec vitest run` over the provider controller/service, filter builder, and SearchService specs; passed 4 files / 80 tests (2026-09-25 20:14 KST); captured at `.omo/evidence/provider-search-filter-combined-vitest-20260925.txt` (809 bytes; exit code 0).
- Earlier typecheck attempt with Node `v26.0.0` did not start because the repository requires Node `>=22 <23` (`ERR_PNPM_UNSUPPORTED_ENGINE`); no post-handoff typecheck was run to avoid stepping on parent latest-endpoint staging.
- No commit, push, revert, deployment, or latest-endpoint edit was performed by this slice after the handoff.

## Success-criterion evidence map

- Supported filter mapping: controller invocation `search({ body_q, mime_type, matter_code, matter_name, client_code, client_name, tags, date_basis, sort_by, page, page_size })`; binary observable is the exact `SearchService.search` argument assertion in `amic-os-vault-read.controller.spec.ts` (`maps supported body, MIME, label, tag, date-basis and sort filters without ignoring them`); artifact `.omo/evidence/provider-search-filter-vitest-api-20260925.txt`.
- Unsupported filters fail closed: controller invocations with non-empty `metadata_codes`, non-Matter `code_basis`, duplicate MIME/tags, unsupported sort/date basis, and simultaneous query/body query; binary observable is thrown `VALIDATION_FAILED` before the mocked service call; artifact `.omo/evidence/provider-search-filter-vitest-api-20260925.txt`.
- ACL/current-version/page behavior: service invocation goes through the existing permission-scoped SearchService with `versionStatus: 'current'`, Matter scope, exact-version projection, and page 2/page size 10; binary observables are the service exact-argument assertion and the pre-existing mapped-current-version/permission tests; artifact `.omo/evidence/provider-search-filter-vitest-api-20260925.txt`.
- SQL filter construction: SearchFilterBuilder invocation with MIME, tags, client code, and a created-or-modified date range; binary observable is bound SQL containing the current-version MIME/tag/client predicates and one complete created-or-modified range; artifact `.omo/evidence/provider-search-filter-vitest-api-20260925.txt`.
- Audit filter references: SearchService invocation with the four new filters; binary observable is `filter_refs` containing `client_code_filter:present`, `mime_type_filter:present`, `tags_filter:present`, and `date_basis:created_or_modified` within the bounded audit string; artifact `.omo/evidence/provider-search-filter-audit-vitest-20260925.txt`.

## Planned contract decision, not yet validated

The validated provider search surface uses the existing permission-scoped SearchService: body/OCR-indexed query via `target: 'body'`, MIME via current version/file object, canonical Matter/Client labels, document tags from migration 0140, created/modified date basis, existing SearchSort values, bounded page/page_size, and current-version filtering. Metadata-code filtering remains an explicit 400 because this provider revision has no authoritative metadata-code source.
