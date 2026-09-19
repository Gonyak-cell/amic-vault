# T6 generic copy provider contract

Source candidate on the companion worktree, 2026-09-20. This contract is the
provider side of OS T7; it is not a public unauthenticated browser API.
All requests use POST, JSON, the existing AmicOsVaultProviderGuard and the existing
provider token/account-ledger headers. The provider resolves the actual Vault
tenant/user from its guard. Body principal fields never select a Vault role.
All five responses have `Cache-Control: private, no-store`.

Base path: `/v1/integrations/amic-os/vault/edit/document-copy`.
Unknown fields fail validation. No client workspace, corporate scope, storage URI,
scan verdict, Vault Matter ID or permission result is accepted. The existing
source exact tuple and `lawos_matter_id` resolve the target Matter; server-side
preflight selects the existing active workspace. Remote corporate copy is outside
this provider contract.

## Requests

`prepare`: common authority/source binding plus copy/snapshot/title/mode/file.
`file: null` is explicit and means clone the exact source filename/hash/bytes.

```json
{
  "principal": {
    "tenant_id": "synthetic-lawos",
    "user_id": "synthetic-user"
  },
  "lawos_matter_id": "synthetic-matter",
  "requested_exact_version": {
    "document_id": "11111111-1111-4111-8111-111111111111",
    "version_id": "22222222-2222-4222-8222-222222222222",
    "file_object_id": "33333333-3333-4333-8333-333333333333",
    "sha256": "2689367b205c16ce32ed4200942b8b8b1e262dfc70d9bc9fbc77c49699a4f1df",
    "byte_size": 2,
    "mime_type": "text/plain"
  },
  "copy_id": "document-copy:44444444-4444-4444-8444-444444444444",
  "snapshot_id": "document-copy-snapshot:55555555-5555-4555-8555-555555555555",
  "title": "Synthetic copy",
  "mode": "clone",
  "file": null
}
```

For edited bytes, use a new snapshot ID with the same copy ID, original source
tuple and immutable copy title; send `mode: "upload"` and this `file` shape:

```json
{
  "filename": "changed.txt",
  "sha256": "2689367b205c16ce32ed4200942b8b8b1e262dfc70d9bc9fbc77c49699a4f1df",
  "byte_size": 2,
  "mime_type": "text/plain"
}
```

Filename extension must match MIME, MIME must equal the original MIME, and size
must be 1..26,214,400 bytes. The thirteen allowed MIME types are DOC, PDF, XLS,
PPT, DOCX, XLSX, PPTX, GIF, JPEG, PNG, WebP, CSV and plain text. Title changes do
not rename or change the original extension. Existing Office editor routes remain
limited to three OOXML types.

`complete` and `commit` use exactly the following object:

```json
{
  "principal": {
    "tenant_id": "synthetic-lawos",
    "user_id": "synthetic-user"
  },
  "lawos_matter_id": "synthetic-matter",
  "requested_exact_version": {
    "document_id": "11111111-1111-4111-8111-111111111111",
    "version_id": "22222222-2222-4222-8222-222222222222",
    "file_object_id": "33333333-3333-4333-8333-333333333333",
    "sha256": "2689367b205c16ce32ed4200942b8b8b1e262dfc70d9bc9fbc77c49699a4f1df",
    "byte_size": 2,
    "mime_type": "text/plain"
  },
  "copy_id": "document-copy:44444444-4444-4444-8444-444444444444",
  "snapshot_id": "document-copy-snapshot:55555555-5555-4555-8555-555555555555"
}
```

`read` adds integer `offset >= 0` to that binding. Offset must be below file size.
`list` uses the common fields plus integer `limit` in 1..50; it does not accept
copy_id, snapshot_id or offset:

```json
{
  "principal": {
    "tenant_id": "synthetic-lawos",
    "user_id": "synthetic-user"
  },
  "lawos_matter_id": "synthetic-matter",
  "requested_exact_version": {
    "document_id": "11111111-1111-4111-8111-111111111111",
    "version_id": "22222222-2222-4222-8222-222222222222",
    "file_object_id": "33333333-3333-4333-8333-333333333333",
    "sha256": "2689367b205c16ce32ed4200942b8b8b1e262dfc70d9bc9fbc77c49699a4f1df",
    "byte_size": 2,
    "mime_type": "text/plain"
  },
  "limit": 50
}
```

## Responses and recovery

Common retained snapshot response, normalized JSON (synthetic two-byte `ok` file):

```json
{
  "authority_kind": "amic-vault-api",
  "authority_ref": "amic-vault-api:synthetic",
  "provider_revision": "generic-copy-v1",
  "copy_id": "document-copy:44444444-4444-4444-8444-444444444444",
  "snapshot_id": "document-copy-snapshot:55555555-5555-4555-8555-555555555555",
  "title": "Synthetic copy",
  "source": {
    "authority_kind": "amic-vault-api",
    "lawos_matter_id": "synthetic-matter",
    "exact_version": {
      "document_id": "11111111-1111-4111-8111-111111111111",
      "version_id": "22222222-2222-4222-8222-222222222222",
      "file_object_id": "33333333-3333-4333-8333-333333333333",
      "sha256": "2689367b205c16ce32ed4200942b8b8b1e262dfc70d9bc9fbc77c49699a4f1df",
      "byte_size": 2,
      "mime_type": "text/plain"
    }
  },
  "file": {
    "filename": "source.txt",
    "sha256": "2689367b205c16ce32ed4200942b8b8b1e262dfc70d9bc9fbc77c49699a4f1df",
    "byte_size": 2,
    "mime_type": "text/plain"
  },
  "state": "retained",
  "scan_state": "clean",
  "blocked_reason": null,
  "exact_version": null,
  "created_at": "2026-09-20T00:00:00.000Z"
}
```

`prepare` in upload mode returns the common metadata with state `transfer_ready`
and adds `method: "PUT"`, `upload_url`, `required_headers`, `expires_at`. The OS
transfers directly to that returned quarantine URL, then calls `complete`.
Clone prepare returns `quarantined` while scanning. Neither state is a durable
clean receipt. Only state `retained` with scan_state `clean` permits the UI to say
the snapshot is retained; `saved` identifies a committed new document.

`complete` is the idempotent status/stage operation. It validates actual stored
bytes (size, full hash, extension and signature), creates/reuses the bound scan,
and returns current state. An expired unscanned transfer stays blocked. A clean
scan whose signature aged beyond the existing policy is queued again through the
existing scanner; the response becomes `quarantined` until a fresh clean verdict.
Infected/held/error verdicts remain blocked. No background scanner can publish a
generic snapshot.

`read` returns one bounded chunk plus the complete original binding and file hash:

```json
{
  "authority_kind": "amic-vault-api",
  "authority_ref": "amic-vault-api:synthetic",
  "provider_revision": "generic-copy-v1",
  "copy_id": "document-copy:44444444-4444-4444-8444-444444444444",
  "snapshot_id": "document-copy-snapshot:55555555-5555-4555-8555-555555555555",
  "title": "Synthetic copy",
  "source": {
    "authority_kind": "amic-vault-api",
    "lawos_matter_id": "synthetic-matter",
    "exact_version": {
      "document_id": "11111111-1111-4111-8111-111111111111",
      "version_id": "22222222-2222-4222-8222-222222222222",
      "file_object_id": "33333333-3333-4333-8333-333333333333",
      "sha256": "2689367b205c16ce32ed4200942b8b8b1e262dfc70d9bc9fbc77c49699a4f1df",
      "byte_size": 2,
      "mime_type": "text/plain"
    }
  },
  "file": {
    "filename": "source.txt",
    "sha256": "2689367b205c16ce32ed4200942b8b8b1e262dfc70d9bc9fbc77c49699a4f1df",
    "byte_size": 2,
    "mime_type": "text/plain"
  },
  "state": "retained",
  "scan_state": "clean",
  "blocked_reason": null,
  "exact_version": null,
  "created_at": "2026-09-20T00:00:00.000Z",
  "offset": 0,
  "bytes_base64": "b2s=",
  "next_offset": 2,
  "final": true
}
```

Each decoded chunk is <=3 MiB, keeping base64 JSON below the Lambda 6 MiB response
ceiling. The server checks the full stored hash and freshly checks source
permissions before and after storage I/O. The client must verify complete
assembled byte length and full SHA-256. The response never contains a local path
or source storage URL.

`list` returns `{ authority_kind, authority_ref, provider_revision, items,
next_cursor: null }`. Every `items` member has the common receipt shape. Listing
is document-scoped and creator-scoped, so a newly selected current source version
still lists that creator's older snapshots. Older snapshots retain their exact
original source tuple and `blocked_reason: "base_version_stale"`. They remain
readable with permissions; commit is denied. Use each item's source.exact_version
for read/complete/commit, not the newly selected current version tuple.

`commit` publishes via FilePromotionService only after a fresh clean scan and
fresh source/target authorization. It returns common metadata with `saved: true`,
state `saved`, and a non-null exact_version of the new document. Primary storage
SHA-256 is independently re-read before that receipt. Replay of the same final
snapshot returns the same exact_version. A different final snapshot for the same
copy fails; the source document/version stays unchanged. A scan refresh requested
by commit returns validation reason `copy_snapshot_not_clean`; poll complete and
retry commit after retained. Permission failures are 403; contract/binding-state
validation is 400; expired preflight is 409; invalid actual file MIME is 415.

## Isolated rollout and rollback prerequisite

1. Apply migration `0216_retain_amic_os_document_copy_snapshots.sql` once through
   the existing migration ledger after 0215. It adds tenant-RLS protected durable
   snapshots and copy_kind; 0215 and all previous migrations remain unchanged.
2. Deploy this revision of FilePromotionService to **every API and scan-worker
   instance before enabling generic copy traffic**. An old promotion worker does
   not know the deferred-snapshot guard and would publish a clean draft. No mixed
   old/new promotion workers are permitted once generic snapshots exist.
3. Enable the paired OS T7 provider adapter only after that schema/API/worker
   readiness. Preserve existing quarantine objects for retained snapshots; do not
   introduce a bucket lifecycle or cleanup that discards them.
4. Source rollback must disable new generic traffic and retain a worker revision
   containing the deferred-promotion guard. Do not redeploy an old worker against
   outstanding generic scans. Prefer rolling forward while preserving snapshots.
   Empty-schema down/up is tested. Down migration refuses a populated snapshot
   table; production deletion is not a rollback strategy.

No migration, deployment, production credentials, real malware scan or production
bucket check was performed by this source task.
