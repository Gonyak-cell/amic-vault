# T6 generic retained copy: local source evidence

2026-09-20. Companion base `ccc1e9d83774fbd61c53c68aa605b767af9c5114`,
prepared validator HEAD `ec071fca3f2644406c15b33ba28e943aca256c7e`,
branch `codex/web-preservation-companion-20260920`. T6 generic implementation is
uncommitted at this handoff. `T6-source-manifest.json` identifies the exact source
and test files by SHA-256. No OS source was edited by this worker.

## Result

- Generic same-byte clone and edited snapshot workflows cover the 13 preserved
  MIME types at <=25 MiB, using the existing exact-version authority, upload
  preflight/quarantine/scan and FilePromotionService owners.
- Server-owned snapshots bind creator, original source tuple, Matter, copy ID,
  snapshot ID, deterministic operation, file fingerprint and upload preflight.
  New snapshot IDs permit retained revisions; same-ID conflicting content fails.
- Retained snapshots have no ordinary document/file/version rows. Explicit commit
  creates one new document, retains source provenance, preserves the original,
  and independently checks the primary storage hash before returning a receipt.
- Fresh reads and writes recheck actual source and target permissions; bounded
  <=3 MiB read responses recheck after storage I/O. Current-source changes retain
  readable older snapshots with base_version_stale but deny unsafe publication.
- Aged clean scan signatures trigger the existing transactional scan queue on
  complete/commit. Retained bytes survive; publication waits for a fresh verdict.
- Existing Office copy actions retain their three-OOXML boundary and now filter
  Office rows from generic rows; the pre-existing retain/commit permission fix
  and its 12 negative tests are included and preserved.
- No new dependency, alternative storage platform or corporate Vault authority
  was introduced. This provider resolves remote Matter scope only.

## Verification

Node 22.22.3, pnpm 9.15.9, Vitest 2.1.9. One coordinated heavy runner at a time.
Commands used `PATH=/opt/homebrew/opt/node@22/bin:$PATH` from the companion tree.
The three existing workspace packages domain/shared/ai were built serially to
satisfy API typecheck imports. No dependency download or lockfile change occurred.

| Check | Result | Durable artifact |
| --- | --- | --- |
| Seven focused API suites | 59 passed, 0 failed, 0 skipped; 7.08 s | T6-api-tests.log |
| Actual HTTP + disposable PostgreSQL suite | 21 passed within the 59 | same log |
| Existing upload service | 6 passed | same log |
| Existing promotion service | 5 passed | same log |
| Existing Office permission boundary | 12 passed | same log |
| Generic strict DTO | 2 passed | same log |
| MIME/extension validators | 13 passed | same log |
| Full API TypeScript noEmit | exit 0 | T6-typecheck.log |
| Nine changed API TS files ESLint | exit 0 | T6-lint.log |
| Egress inventory suite | 8 passed, 0 failed, 0 skipped; 1.77 s | T6-egress-tests.log |
| Reuse-first evaluator including untracked additions | PASS, no violations | registered exact paths in security/oss-adoption-decisions.yml |
| git diff --check | exit 0 | source handoff |

Focused command:

```sh
pnpm --dir apps/api exec vitest run \
  src/modules/integrations/amic-os-vault-provider/amic-os-vault-editor.controller.spec.ts \
  src/modules/integrations/amic-os-vault-provider/amic-os-vault-editor.contract.spec.ts \
  src/modules/integrations/amic-os-vault-provider/amic-os-vault-editor.service.spec.ts \
  src/modules/integrations/amic-os-vault-provider/amic-os-vault-upload.service.spec.ts \
  src/modules/file-security/file-promotion.service.spec.ts \
  src/modules/document/validators/file-extension.validator.spec.ts \
  src/modules/document/validators/mime-type.validator.spec.ts --maxWorkers=1 --minWorkers=1
pnpm --dir apps/api exec tsc --noEmit -p tsconfig.json
node --test tools/dlp/check-egress-route-inventory.spec.mjs
```

The HTTP suite runs a real Nest server/guard and disposable loopback PostgreSQL
with the vault_app role, actual 0215/0216 migrations, RLS, real AuditService,
PermissionService/DocumentPermissionService and MatterSourcePolicyService,
DocumentUploadService, FileObjectService, DocumentVersionService, QuarantineIntake,
FileSecurityService and FilePromotionService. Source-runtime readiness and account
lookup are synthetic local fixtures. Storage persists synthetic bytes on disk;
HTTP PUT stages bytes, production scanner logic consumes and hashes them, and the
external scanner verdict is synthetic. The queue boundary inserts a test job
transactionally; a real pg-boss worker or malware engine is not exercised.
Base schema DDL is a minimal relevant production-column fixture, not the complete
historical migration suite. PostgreSQL and all owned data directories are stopped
and removed by afterAll.

Cases include same-byte clone and changed-byte copy for all 13 MIME values,
reselect/list/read from persisted DB state, no ordinary documents before commit,
commit replay and concurrent publication, original hash/provenance preservation,
actual membership revocation, creator/tenant/source mismatch, missing provider
token, late read/primary-hash permission loss, current-source change recovery,
malware rejection, expired transfer, invalid declared/actual MIME, changed
fingerprint, storage promotion failure and recovery, exact 25 MiB chunked read,
25 MiB+1 rejection, aged scan refresh, source readiness loss, empty down/up and
populated rollback refusal.

The Office/image fixtures are minimal signature/container fixtures sufficient for
existing MIME validators and byte-copy checks. They are not full renderable Word,
Excel, PowerPoint or image-quality examples. No browser render, editor opening,
real malware engine, production login, process restart or live storage was tested.
No skipped case is counted as passing.

The egress inventory additionally exposed a pre-existing omission for the
unchanged readExactRange helper. Its existing grant-scoped export semantics were
registered without changing runtime; the new retained-copy read record enforces
binding, clean verdict, bounded bytes, post-I/O permission and download audit.

## Paired deployment gate remains unperformed

See `T6-generic-copy-contract.md` for exact normalized DTO and response examples.
Migration 0216 must be applied before this API/worker code. Every promotion worker
must contain the deferred-copy guard before generic copy traffic is enabled;
old workers would auto-publish clean generic snapshots. Rollback must preserve
snapshots and the guarded worker revision. The tested down migration refuses
populated snapshots. No migration/deployment/credentials/manual CI/push/merge was
performed. OS provider integration and actual paired runtime acceptance remain
with the OS integrator; these local results are not production completion.

## Independent review correction

Read-only review found a final promotion boundary after the primary-object hash I/O. Added fresh copy authorization immediately after that hash and before promotion metadata. The HTTP test now revokes actual Matter membership during the FIRST primary hash and independently verifies no new document and retained recovery, then retries successfully. Affected realHTTP suite21/21 passed,0 skips; T6-review-fix.log. Earlier59-suite and8-inventory results remain the unchanged regression evidence. No deployment occurred.
