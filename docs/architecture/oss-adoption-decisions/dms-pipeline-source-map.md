# DMS, pipeline, security, and identity source-test map

Each row is an exact source-lab input, not copied code or a license approval.
`L0` means independent behavioral/reference research only; `L1` permits a
future supported component integration only after its own authority, security,
license and rollback gate. All fixtures are `NO_COPY`.

| Component | Portfolio | Exact source / test evidence | Reuse | Prohibited Vault authority |
| --- | --- | --- | --- | --- |
| Paperless-ngx | OSS-03 | `views.py` `1591d0b`; `test_api_search.py` `c25e83e` | L0 | permission, audit, tenant, immutable original |
| Mayan EDMS | OSS-05 | `ocr/tasks.py` `026eb5e`; `test_tasks.py` `0681149` | L0 | permission, audit, tenant, FileObject |
| Alfresco Community | OSS-11 | `PermissionedResults.java` `84bf177`; `CannedQueryTest.java` `287f3a1` | L0 | search permission, ethical wall, audit |
| Docspell | OSS-05 | `ProcessItemArgs.scala` `991adaa`; `ItemQueryGeneratorTest.scala` `fb8f491` | L0 | permission, audit, tenant, storage |
| Teedy | OSS-02 | `FileSizeService.java` `21cafc6`; `TestFileSizeService.java` `f70ba75` | L0 | preview permission, audit, storage |
| ClamAV | OSS-04 | `clamscan.c` `ea4378c`; `ex_scan_callbacks_test.py` `3b60a6f` | L1 | quarantine promotion, permission, audit, tenant |
| Gotenberg | OSS-05 | `pdfengines.go` `b2e97e4`; `fallback_test.go` `40fbd70` | L1 | storage, permission, audit, network trust |
| tusd | OSS-06 | `hooks.go` `6d569d2`; `hooks_test.go` `410924a` | L1 | upload intent, finalize permission, audit, storage |

The machine-readable map holds full 40-character blob hashes and official
commit URLs. OSS-07 (`openid-client`) and OSS-08 (`Presidio`) are explicit
`L0_NO_CANDIDATE`: neither has the exact source/license lock needed to enter a
reuse decision. This preserves the local identity and DLP boundaries rather
than treating a popular repository as evidence of authorization.

## Reuse classification

`security/oss-test-reuse.yml` turns these inputs into existing canonical
integration-suite parity scenarios. It rejects the five full-DMS inputs for
code/fixture reuse, and uses ClamAV, Gotenberg and tusd only as no-copy
behavioral scenarios. The verifier requires source/test blob and license
provenance, an existing `tests/integration/**` target, and a negative or fault
assertion for OSS-04, OSS-05 and OSS-06. No row authorizes copied source.

The full-DMS rows are `REJECTED`; ClamAV, Gotenberg and tusd are only L1
component candidates and remain blocked until their separately scoped OSS-04,
OSS-05 or OSS-06 TUW proves Vault authority parity.
