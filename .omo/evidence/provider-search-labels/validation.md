# AMIC Vault provider A04 label-response slice

- Recorded: 2026-09-25T09:29:10Z
- Worktree: `/Users/jws/.codex/worktrees/amic-vault-issue-470-provider-20260925`
- Branch: `codex/issue-470-vault-provider-complete`
- Verified base and `origin/main`: `465fe0f277f9e5f83d741c3665a3c2b6acd8fb93`
- Product files changed: `amic-os-vault-read.service.ts` and its dedicated service spec only.
- No commit, push, pull request, deployment, database write, or production operation was performed.

## Verified scenarios

| Scenario | Invocation | Binary observable | Captured artifact |
|---|---|---|---|
| Permission-scoped list/search emits only an exact committed current version and rejects a Matter-placement race | `PATH=/opt/homebrew/Cellar/node@22/22.22.3/bin:$PATH pnpm --filter @amic-vault/api exec vitest run src/modules/integrations/amic-os-vault-provider/amic-os-vault-read.service.spec.ts src/modules/integrations/amic-os-vault-provider/amic-os-vault-read.controller.spec.ts --reporter=verbose --reporter=junit --outputFile.junit=.../focused-tests.junit.xml` | 2 files passed; 42/42 tests passed, including `uses permission-scoped search and returns only mapped exact current versions` and `omits a document when its current Matter changes after the permission-scoped search` | `focused-tests.junit.xml` (11,894 bytes, SHA-256 `d87b1fb7259aa481fd1feadd86398b51cc2855adff8d7e16c24bbf6fed80f9af`) and `focused-tests.log` |
| A directly allowed document does not expose Matter/Client fields when current Matter read is denied or the evaluator throws | Same focused Vitest invocation | `keeps related labels null when document access does not grant Matter label access` and `keeps related labels null when the Matter permission evaluator fails closed` passed; all five related fields stayed `null` while the document remained readable | `focused-tests.junit.xml` and `focused-tests.log` |
| An unmapped Client never leaks the Vault-internal UUID | Same focused Vitest invocation | `returns null instead of a Vault-internal UUID when a Client has no external mapping` passed; `client_id` was `null`, the allowed display name remained present, and the executed exact SQL contained no `c.client_id::text` fallback | `focused-tests.junit.xml` and `focused-tests.log` |
| Canonical labels are normalized and malformed wire values are nulled | Same focused Vitest invocation | `normalizes valid labels and nulls malformed canonical label fields` passed; decomposed NFC text was normalized, while the over-1,000 Matter name, unsafe external ID, and C0-containing Client name became `null` | `focused-tests.junit.xml` and `focused-tests.log` |
| Exact projection storage/query failure cannot return a partial list | Same focused Vitest invocation | `fails the request when the exact current-version projection query fails` passed with the injected `exact projection unavailable` rejection | `focused-tests.junit.xml` and `focused-tests.log` |
| Canonical current relation wins over permission-scoped search DTO identifiers | Same focused Vitest invocation | Search fixture carries a Vault UUID client and `LAWOS-LIVE-*` Matter code; response asserts mapped `lawosClientId` and `lawosMatterCode`, current Matter/Client names, and legacy `metadata_code: null` | `focused-tests.junit.xml` |
| Provider response retains exact-version/hash/file invariants and the AMIC OS legacy companion fields | Same focused Vitest invocation | Response equality asserts current/version IDs, current/file IDs, both hashes, both sizes, both MIME fields, canonical ISO timestamps, current author, first uploader, and no storage locator/raw bytes | `focused-tests.junit.xml` |
| Type safety | `pnpm --filter @amic-vault/api typecheck` | exit 0 | `api-typecheck.log` |
| Compiled API output | `pnpm --filter @amic-vault/api build` | exit 0 | `api-build.log` |
| Changed-file lint | `pnpm --filter @amic-vault/api exec eslint src/modules/integrations/amic-os-vault-provider/amic-os-vault-read.service.ts src/modules/integrations/amic-os-vault-provider/amic-os-vault-read.service.spec.ts` | exit 0 | `changed-files-lint.log` |
| Patch whitespace | `git diff --check -- <owned service> <owned spec>` | exit 0 and explicit PASS marker | `diff-check.log` |

Final owned-source hashes are recorded in `source-sha256.txt`: service `9e8c55dd1b0b509aebf6afdfd9d2f754316976fd1df4c7745a42b7ee708130ce`, spec `24df48e47f8ce4a9d7f9b6e74689bd2fbe1c0b559a841f45915f70a314eabb05`.

## Frozen list/search item contract

The response item has exactly these keys:

`document_id`, `matter_id`, `title`, `matter_code`, `matter_name`, `client_id`, `client_name`, `client_display_name`, `metadata_code`, `current_version_id`, `version_id`, `current_file_object_id`, `file_object_id`, `latest_sha256`, `content_sha256`, `current_byte_size`, `byte_size`, `current_mime_type`, `mime_type`, `filename`, `created_at`, `edited_at`, `author_name`, `creator_name`, `indexed_at`, `match_fields`.

Null and authority rules:

- `matter_code`, `matter_name`, `client_id`, `client_name`, and `client_display_name` are all `null` unless `PermissionService.canReadMatter` returns `ALLOW` for the current actor and current Vault Matter.
- On allow, Matter/Client names come from the current relational rows. `matter_code` prefers `matters.metadata_json.lawosMatterCode`, then the current Matter code. `client_id` is only the mapped external `clients.metadata_json.lawosClientId` or `matterAppClientId`; it is `null` when both mappings are absent and never falls back to the internal Vault Client UUID.
- `client_name` is the existing at-most-200-character compatibility field; `client_display_name` carries the current name up to the 1,000-character Client limit.
- `matter_code` is at most 120 characters; `matter_name` and `client_display_name` are at most 1,000. Display strings are trimmed, NFC-normalized, and nulled when empty, over limit, or containing C0/DEL control characters. External Client IDs use the existing safe identifier grammar and are otherwise `null`.
- `metadata_code` is a required key and is always `null` in this repository revision because the provider has no authoritative legacy metadata-code source.
- `author_name` is the current search-version author directory name or `null`; `creator_name` is the directory name for immutable `documents.created_by` or `null`.
- `created_at` and `edited_at` are canonical ISO instants and an invalid or reversed pair suppresses the item.
- The current exact row must still match the permission-scoped search row's `matterId` and `versionId`; otherwise the item is suppressed.

## Remaining gaps, deliberately not claimed complete

- A02 remains open for explicit created-versus-modified date basis, MIME/file-type filters, legacy and Matter-code filters, tags, caller-selected sort, and parity tests. The current provider reuses `SearchService`; it supports bounded query, current-version, Matter, folder, updated-at range, page, and page-size only.
- A04 remains open for an authoritative legacy `metadata_code` list/search source and for searching by the canonical Matter/Client labels. This slice freezes their response projection and ACL only.
- Email sender and recipient address projection is absent. Email subject continues to be represented only through the document title path; F08 email-specific response fields remain separate work.
- Cross-repository AMIC OS adapter validation remains a separate artifact owned by its adapter slice; this provider artifact freezes the producer keys, limits, and null semantics only.
- No PostgreSQL integration scenario, production credential, deployment, real account, or device validation was run in this slice.
