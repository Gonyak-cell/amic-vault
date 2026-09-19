# AMIC OS web preservation: companion implementation

Approved work: T6 of the AMIC OS web preservation plan, tracked by
https://github.com/Gonyak-cell/amic-os/issues/377. The user explicitly requested
implementation of that plan. This is a source candidate with local synthetic
verification, not a production release or a historical PACK rollout.

- Base: `ccc1e9d83774fbd61c53c68aa605b767af9c5114` (fresh `origin/main` readback).
- Branch: `codex/web-preservation-companion-20260920`.
- Worktree: `/Users/jws/.codex/worktrees/amic-vault-web-preservation-20260920`.
- Initial writer: `/root`. Test runner is shared serially with the OS candidate.
- OS candidate: `codex/issue-377-web-preservation`, base `6206ec2041bfe646b9331a7e9e529e5481ca52ed`.
- Scope: remote Matter generic copies, the original 13 MIME types, maximum 25 MiB.
  Existing Office editing remains three OOXML types and 25 MiB.
- No production access, credentials, real client files, external providers,
  deployment, manual CI, or merge is included.

## Reuse and remaining implementation

1. Extend the existing extension and MIME validators for GIF and WebP. Preserve
   configured allow-lists and the existing migration-only JPEG/PNG exception.
   Validate signatures, declared MIME, container bounds and damaged headers.
   WebP container reference: https://developers.google.com/speed/webp/docs/riff_container.
2. Reuse the existing editor copy authority, PermissionService checks, upload
   prepare/complete, quarantine scan and transactional `afterUploadAudit` binding.
   Do not treat a generic ordinary upload as a source-bound copy.
3. Bind source exact version, creator, copy/snapshot IDs, target Matter, operation
   and file fingerprint on the server before accepting changed bytes. Existing
   `0215_create_amic_os_office_copies.sql` remains immutable; any schema extension
   uses the next unused migration with tenant RLS and rollback.
4. Retained generic drafts must survive a new session and remain absent from
   ordinary document search until explicit commit. Existing Office `createCopy`
   immediately uses `uploadBuffer` to create a working document, so merely
   broadening its MIME allow-list would not satisfy this generic draft contract.
5. Recheck current source read/download and target write permission on retain and
   commit. Publish once, preserve the original, retain prior snapshots, and return
   a receipt tied to independently verified primary storage bytes.
6. Actual companion HTTP, disposable PostgreSQL and synthetic storage/scan tests
   are required in addition to contract mocks. Record skips as incomplete.

## Execution status

- Validator changes: locally verified; 13 tests across the two existing validator
  suites pass, and ESLint passes on the four changed validator files. See
  `docs/evidence/web-preservation-20260920/T6-validators.md`.
- Generic copy binding / retained storage / commit: pending.
- OS provider integration: pending, owned by the OS integrator.
- Full T6 acceptance and companion PR: pending.

Only a corresponding local test result permits an item to become verified.
Deployment must apply both compatible API revisions and the new schema later;
this source work does not perform that gate.
