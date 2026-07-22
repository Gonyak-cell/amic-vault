# DMS, pipeline, security, and identity source-test map

Every row below is a pinned source-lab input, never copied source or a license
approval. `L0` is independent behavioral/reference research only. `L1` means a
future supported-component integration can be evaluated only under its own
authority, security, license, operations, and rollback gate. Every fixture is
`NO_COPY`.

| Component | Portfolio | Source and test path (locked blob) | Reuse | Prohibited Vault authority |
|---|---|---|---|---|
| Paperless-ngx | OSS-03 | `views.py` / `test_api_search.py` | L0 | permission, audit, tenant, immutable original |
| Mayan EDMS | OSS-05 | `ocr/tasks.py` / `test_tasks.py` | L0 | permission, audit, tenant, FileObject |
| Alfresco Community | OSS-11 | `PermissionedResults.java` / `CannedQueryTest.java` | L0 | search permission, ethical wall, audit |
| Docspell | OSS-05 | `ProcessItemArgs.scala` / `ItemQueryGeneratorTest.scala` | L0 | permission, audit, tenant, storage |
| Teedy | OSS-02 | `FileSizeService.java` / `TestFileSizeService.java` | L0 | preview permission, audit, storage |
| ClamAV | OSS-04 | `clamscan.c` / `ex_scan_callbacks_test.py` | L1 | quarantine promotion, permission, audit, tenant |
| Gotenberg | OSS-05 | `pdfengines.go` / `fallback_test.go` | L1 | storage, permission, audit, network trust |
| tusd | OSS-06 | `hooks.go` / `hooks_test.go` | L1 | upload intent, finalize permission, audit, storage |

The complete, 40-character blob identities and official commit-bound URLs are
in `security/oss-source-map.yml#sourceTestTargets`; each was re-read from its
detached source-lab clone at the locked commit. The mapped tests are evidence
of behavior and failure modes only—none is an authority model to port.

## Explicit no-candidate records

`openid-client` (OSS-07) and `Presidio` (OSS-08) remain `L0_NO_CANDIDATE`.
Neither has the exact source/license pin required for a reuse decision. This
preserves Vault's local session/deprovision and DLP authority instead of
treating a popular upstream repository as authorization.

## Boundary for downstream work

The next TUW may create a parity classification for a mapped test only when it
keeps `NO_COPY`, names an existing canonical Vault integration suite, and
retains an appropriate negative or fault assertion. It may not copy upstream
source, fixture content, wording, binaries, or test code into the product tree.
The machine-readable parity skeleton is `security/oss-test-reuse.yml` and is
fail-closed validated by `tools/oss/verify-test-reuse.mjs`.
