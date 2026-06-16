# Outlook Add-in Threat Model Delta

Date: 2026-06-16
Scope: AMIC Vault Outlook Web Add-in strategy and OA00-OA11 planning.
Related ADRs: `docs/adr/ADR-014-desktop-client-strategy.md`,
`docs/adr/ADR-015-outlook-addin-strategy.md`.

## Boundary

The Outlook add-in is a thin Office.js client. It is not the AMIC Vault desktop
client, not a local runtime, not a mailbox crawler, not an audit authority, and
not a document repository.

Server-owned controls remain authoritative:

- authentication and add-in session validation,
- tenant and mailbox-to-user mapping,
- PermissionService and ethical wall decisions,
- AuditService event creation,
- PostgreSQL RLS,
- Email Vault filing and attachment-to-Document lifecycle,
- SearchPermissionScopeProvider and matter suggestion filtering,
- records/legal hold policy,
- external sharing policy,
- AI policy.

## Assets To Protect

| Asset | Outlook Add-in Risk | Required Control |
|---|---|---|
| Vault session | Add-in tries to reuse PWA/browser cookies | Shared identity only; separate add-in session exchange with default-off verifier. |
| Mailbox identity | Tenant/user mismatch or stale mailbox mapping | Server-side mailbox fingerprint, tenant binding, add-in session TTL, and fail-closed mapping. |
| Matter metadata | Recent/suggested matters leak unauthorized matters | Server-side query-stage permission filters; no client post-filtering. |
| Email body and headers | Subject/body/raw headers appear in logs or evidence | Store only approved email records; audit metadata uses refs/hashes/counts. |
| Attachments | Add-in or browser cache holds document bytes | Fetch through approved server-side Graph adapter only after gate; no local Vault cache or raw payload evidence. |
| Filing jobs | Duplicate retries create duplicate filed emails | Idempotency key and canonical message hash. |
| Inserted documents | Insert action becomes silent external sharing | R11+ policy gate; no public/guest/secure links before allowed. |
| Folder mappings | Folder names expose client/matter information | Tenant RLS, reference-only audit, admin/user approval, no repo evidence values. |
| Graph scopes | Excessive consent grants mailbox or file access | Least-privilege scope registry and deployment evidence. |
| Smart Alerts | Client event failure bypasses filing policy | Treat as UX layer; server policy and audit remain source of truth; offline/unavailable never becomes local filing. |
| Send-and-file warnings | User files to wrong matter or skips filing context | Server policy returns bounded allow/warn/block decisions; warnings must be acknowledged before queueing send-and-file. |

## Threats And Mitigations

| Threat | Mitigation | Evidence |
|---|---|---|
| Add-in shares PWA session cookies | Dedicated add-in session exchange; no cookie reuse assumption; `outlook_addin_sessions` uses separate ids and TTL | OA06 auth contract tests |
| Unauthorized matter suggestion | Search gateway injects PermissionService scope before result construction | OA11 permission negative tests |
| Client post-filters search results | Server returns only authorized results; client never receives denied IDs | OA11 metadata leakage tests |
| Duplicate filing from retry or resend | `Idempotency-Key`, mailbox fingerprint, `internetMessageId`, canonical hash | OA05 idempotency tests |
| Raw mail content enters audit/logs | Metadata allow-list; unsafe key scan; audit refs/hashes only | OA11 audit coverage |
| Smart Alert failure treated as compliance pass | Send-and-file policy stored server-side; event handler only prompts/blocks UX and falls open for send availability without local filing | OA07 Smart Alert fallback tests |
| Smart Alert runtime leaks raw Outlook data | Runtime sends hash-only mailbox, subject, participant domain, message, and attachment refs to Vault APIs | OA07 manifest/runtime static tests |
| Unacknowledged send-and-file warnings | Server denies send-and-file request until warning reason codes are acknowledged | OA07 send-and-file policy tests |
| Insert creates external link before R11 | OA08 creates only internal Vault references; public/guest/secure/VDR links are not generated and external-recipient insertions are policy-denied | OA08 external-recipient and link-column tests |
| Insert transports Vault bytes into Outlook before copy gate | `attach-copy` is policy-denied; no document bytes, filenames, URLs, or provider payloads are stored in insertion rows | OA08 attach-copy denial and schema leakage tests |
| Insert ignores legal hold or records policy | Document/matter legal hold, disposal-locked state, and active requested/approved disposal requests return safe `DOCUMENT_LOCKED` | OA08 records policy tests |
| Folder mapping leaks matter metadata | Folder mapping is tenant-scoped, permission-checked, and audited | OA09 folder mapping tests |
| Graph scope overreach | Minimum-scope matrix, default-off Graph transport, and deployment approval | OA06 scope matrix + OA10 admin deployment evidence |
| Local/offline cache stores Vault data | No local queue/cache for Vault copies; offline state is pending/unavailable only | OA11 offline negative tests |

## Stop Conditions

Stop Outlook add-in implementation if any change:

- stores document bytes, email body, matter records, search results, AI context,
  prompt/response, or audit rows locally;
- logs or commits email subjects, bodies, filenames, raw headers, private
  endpoints, account identifiers, cookies, tokens, or customer data;
- performs matter suggestion, filing, insert, folder mapping, or status lookup
  without PermissionService and tenant validation;
- treats Smart Alerts as the only compliance control;
- introduces live Graph/NAA/Outlook event behavior without an approved
  integration gate;
- treats Smart Alert network failure as a completed Vault filing event;
- creates public/guest/secure/external links before R11+ policy gates;
- transports Vault document bytes to Outlook before a reviewed copy/transport
  gate;
- changes `docs/package/**`.

## Test Hooks Required Before Live Implementation

- Permission negative tests for suggestion, recent matter, filing, insert,
  folder mapping, and job status.
- Metadata leakage tests for denied responses, job status payloads, UI error
  copy, logs, and audit metadata.
- Tenant isolation tests for mailbox mapping and message/attachment dedupe.
- Audit coverage tests for requested, completed, denied, failed, retried, and
  cancelled transitions.
- Idempotency tests for retry, resend, forward, migrated messages, and duplicate
  attachments.
- Offline/network failure tests proving no local Vault queue/cache.
- Graph scope and deployment tests before tenant rollout.
