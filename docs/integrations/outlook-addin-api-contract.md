# Outlook Add-in API Contract

Status: planning contract for OA02. No live Microsoft 365 implementation is
authorized by this document.

## Principles

1. Outlook is a thin client. The Vault server owns permission, audit, storage,
   filing, search, dedupe, and policy.
2. The add-in shares identity with Vault after a server exchange. It does not
   share the PWA/browser session cookie.
3. All endpoints use `/v1` and fail closed with standard AMIC error codes.
4. Audit metadata is reference-only: IDs, hashes, counts, status codes, and
   bounded reason codes only.
5. Matter suggestions are search-like and must use query-stage permission
   filters before result construction.
6. Idempotency is mandatory for filing and send-and-file actions.

## Endpoint Summary

| Endpoint                                      | Method | DTO                                  | Gate                |
| --------------------------------------------- | ------ | ------------------------------------ | ------------------- |
| `/v1/m365/outlook/filing-requests`            | POST   | `CreateOutlookEmailFilingRequestDto` | OA04                |
| `/v1/m365/outlook/filing-requests/:id`        | GET    | `OutlookFilingRequestStatusDto`      | OA04                |
| `/v1/m365/outlook/filing-requests/:id/cancel` | POST   | `CancelOutlookFilingRequestDto`      | OA04                |
| `/v1/search/matter-suggestions`               | POST   | `MatterSuggestionQueryDto`           | OA04, Search Gate   |
| `/v1/m365/outlook/session-exchanges`          | POST   | `OutlookAddinSessionExchangeDto`     | OA06, auth gate     |
| `/v1/m365/outlook/attachment-acquisitions`    | POST   | `AcquireOutlookGraphAttachmentDto`   | OA06, Graph gate    |
| `/v1/m365/outlook/send-policy-decisions`      | POST   | `EvaluateOutlookSendPolicyDto`       | OA07, Smart Alert   |
| `/v1/m365/outlook/send-file-requests`         | POST   | `CreateOutlookSendFileRequestDto`    | OA07                |
| `/v1/m365/outlook/document-insertions`        | POST   | `CreateOutlookDocumentInsertionDto`  | OA08, copy/link gates |
| `/v1/m365/outlook/folder-mappings`            | POST   | `CreateOutlookFolderMappingDto`      | OA09                |
| `/v1/m365/outlook/folder-mappings/:id`        | PATCH  | `UpdateOutlookFolderMappingDto`      | OA09                |
| `/v1/m365/outlook/deployment-readiness`       | GET    | `OutlookDeploymentReadinessDto`      | OA10                |

## Core DTOs

### `OutlookItemRefDto`

```ts
type OutlookItemRefDto = {
  mailboxFingerprint: string;
  outlookItemIdHash: string;
  internetMessageIdHash?: string;
  conversationIdHash?: string;
  canonicalMessageSha256: string;
  sentAt?: string;
  receivedAt?: string;
  hasExternalParticipants: boolean;
  participantDomainHashes: string[];
};
```

Do not include raw mailbox address, raw Outlook/Graph item id, subject, body,
raw headers, raw participant addresses, raw Internet Message-ID, or attachment
filenames in the DTO.

### `OutlookAttachmentRefDto`

```ts
type OutlookAttachmentRefDto = {
  attachmentIdHash: string;
  contentIdHash?: string;
  ordinal: number;
  sizeBytes: number;
  sha256?: string;
  mimeType?: string;
  selectedForFiling: boolean;
};
```

Attachment bytes are not transported in this DTO. The approved acquisition path
is defined by the later live Microsoft 365 gate.

### `CreateOutlookEmailFilingRequestDto`

```ts
type CreateOutlookEmailFilingRequestDto = {
  matterId: string;
  message: OutlookItemRefDto;
  attachments: OutlookAttachmentRefDto[];
  sourceClient: 'outlook-web-addin';
  clientRequestId: string;
  idempotencyKey: string;
};
```

Server behavior:

- default gate: when `OUTLOOK_ADDIN_ENABLED` is not `true`, deny fail-closed
  and record `OUTLOOK_EMAIL_FILE_DENIED` with reference-only metadata;
- validate tenant, user, mailbox mapping, and `matterId`;
- call PermissionService for upload/file-to-matter permission;
- create a filing request and pg-boss job in one transaction;
- record `OUTLOOK_EMAIL_FILE_REQUESTED`;
- return a request id and safe status only.

### `OutlookFilingRequestStatusDto`

```ts
type OutlookFilingRequestStatusDto = {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'denied' | 'failed' | 'cancelled';
  matterId: string;
  createdAt: string;
  updatedAt: string;
  emailRecordId?: string;
  filedAttachmentCount?: number;
  deniedReasonCode?: 'permission_denied' | 'policy_denied' | 'stale_mailbox' | 'duplicate';
};
```

No message subject, body, participant address, filename, or raw Graph/Office id
is returned.

### `MatterSuggestionQueryDto`

```ts
type MatterSuggestionQueryDto = {
  sourceClient: 'outlook-web-addin';
  mailboxFingerprint: string;
  participantDomainHashes: string[];
  subjectHash?: string;
  conversationIdHash?: string;
  limit: number;
};
```

```ts
type MatterSuggestionListDto = {
  items: Array<{
    matterId: string;
    matterCode: string;
    matterName: string;
    clientId: string;
    reasonCodes: Array<'subject_hash' | 'participant_domain_hash'>;
    score: number;
  }>;
};
```

Server behavior:

- build search/matter candidate query with PermissionService and
  SearchPermissionScopeProvider before result construction;
- never return unauthorized IDs for client-side filtering;
- match Outlook signals only by bounded hashes. Subject matching is exact hash
  comparison against matter code, matter name, or client name; participant domain
  matching is exact hash comparison against stored matter/client domain metadata;
- audit `OUTLOOK_MATTER_SUGGESTIONS_VIEWED` with query hash and result count.

### `OutlookAddinSessionExchangeDto`

```ts
type OutlookAddinSessionExchangeDto = {
  sourceClient: 'outlook-web-addin';
  mailboxFingerprint: string;
  identityAssertion: string;
  clientRequestId: string;
};
```

The `identityAssertion` is transient request input for a server-side verifier.
The server hashes it before persistence, never stores token/assertion values,
and never records it in audit metadata or repo evidence.

Server behavior:

- default gate: when `OUTLOOK_AUTH_EXCHANGE_ENABLED` is not `true`, deny
  fail-closed and record `OUTLOOK_ADDIN_SESSION_DENIED`;
- require an active Vault session, but issue a separate `outlook_addin_session`
  instead of reusing the PWA/browser cookie;
- require the identity verifier to allow the assertion;
- require an active `(tenant, user, mailbox_fingerprint_hash)` binding;
- record `OUTLOOK_ADDIN_SESSION_EXCHANGED` with session id, binding id,
  mailbox hash, client request hash, and expiry only.

### `AcquireOutlookGraphAttachmentDto`

```ts
type AcquireOutlookGraphAttachmentDto = {
  sourceClient: 'outlook-web-addin';
  addinSessionId: string;
  filingRequestId: string;
  message: OutlookItemRefDto;
  attachment: OutlookAttachmentRefDto;
  clientRequestId: string;
};
```

Server behavior:

- default gate: when `OUTLOOK_GRAPH_ATTACHMENT_ACQUISITION_ENABLED` is not
  `true`, deny fail-closed and record
  `OUTLOOK_GRAPH_ATTACHMENT_ACQUIRE_DENIED`;
- require active add-in session + active mailbox binding + same-user filing
  request + current `PermissionService.canUploadToMatter`;
- accept only hash/ref DTOs from the add-in. Raw Graph message ids, attachment
  ids, tokens, filenames, provider payloads, and attachment bytes are not DTO
  fields;
- call only the approved server-side acquisition adapter after all checks pass;
- record acquisition requested/acquired/denied audit with refs, hashes, counts,
  scope-set hash, and safe status only.

### `EvaluateOutlookSendPolicyDto`

```ts
type EvaluateOutlookSendPolicyDto = {
  matterId?: string;
  sourceClient: 'outlook-web-addin';
  message: OutlookItemRefDto;
  attachments: OutlookAttachmentRefDto[];
  subjectHash?: string;
  clientRequestId: string;
};
```

```ts
type OutlookSendPolicyDecisionDto = {
  decisionId: string;
  decision: 'allow' | 'warn' | 'block';
  sourceClient: 'outlook-web-addin';
  matterId?: string;
  warningReasonCodes: Array<'no_matter' | 'wrong_matter' | 'external_recipient'>;
  deniedReasonCode?: 'permission_denied' | 'policy_denied' | 'integration_gate_closed';
  selectedAttachmentCount: number;
};
```

Server behavior:

- default gate: when `OUTLOOK_SMART_ALERTS_ENABLED` is not `true`, deny
  fail-closed and record `OUTLOOK_SEND_POLICY_EVALUATED`;
- evaluate no-matter, wrong-matter, external-recipient, and permission-denied
  paths on the server from hash-only context;
- use server-side matter suggestions for wrong-matter detection. The add-in does
  not receive unauthorized matter ids for local filtering;
- return only a bounded decision, reason codes, and counts. No subject, body,
  recipient, domain, filename, raw Outlook id, token, or Graph payload is
  returned.

### `CreateOutlookSendFileRequestDto`

```ts
type CreateOutlookSendFileRequestDto = {
  matterId: string;
  sourceClient: 'outlook-web-addin';
  message: OutlookItemRefDto;
  attachments: OutlookAttachmentRefDto[];
  subjectHash?: string;
  clientRequestId: string;
  idempotencyKey: string;
  acknowledgedWarningCodes: Array<'no_matter' | 'wrong_matter' | 'external_recipient'>;
};
```

```ts
type OutlookSendFileRequestStatusDto = OutlookFilingRequestStatusDto & {
  requestKind: 'send_and_file';
  sendPolicyDecision: 'allow' | 'warn';
  warningReasonCodes: Array<'no_matter' | 'wrong_matter' | 'external_recipient'>;
};
```

Server behavior:

- default gate: when `OUTLOOK_SEND_FILE_ENABLED` is not `true`, deny fail-closed
  and record `OUTLOOK_SEND_FILE_DENIED`;
- call the same server policy evaluator before queueing a send-and-file request;
- block decisions and unacknowledged warnings deny with safe
  `PERMISSION_DENIED`;
- accepted requests store `request_kind='send_and_file'`, `send_policy_decision`,
  bounded warning codes, idempotency hashes, and selected attachment refs only;
- record `OUTLOOK_SEND_FILE_REQUESTED` with reference-only metadata.

Smart Alerts are a client event surface only. The server policy and audit trail
remain authoritative. If the event runtime is offline or unavailable, the client
must show unavailable/pending state and must not perform local filing.

### `CreateOutlookDocumentInsertionDto`

```ts
type CreateOutlookDocumentInsertionDto = {
  documentId: string;
  versionId?: string;
  sourceClient: 'outlook-web-addin';
  targetMessage: OutlookItemRefDto;
  insertionMode: 'attach-copy' | 'internal-reference';
  hasExternalRecipients: boolean;
  clientRequestId: string;
  idempotencyKey: string;
};
```

```ts
type OutlookDocumentInsertionDto = {
  insertionId: string;
  status: 'ready' | 'denied';
  documentId: string;
  versionId: string;
  insertionMode: 'attach-copy' | 'internal-reference';
  sourceClient: 'outlook-web-addin';
  createdAt: string;
  updatedAt: string;
  internalReference?: string;
  deniedReasonCode?:
    | 'permission_denied'
    | 'policy_denied'
    | 'integration_gate_closed'
    | 'document_locked';
};
```

Server behavior:

- default gate: when `OUTLOOK_DOCUMENT_INSERTION_ENABLED` is not `true`, deny
  fail-closed and record `OUTLOOK_DOCUMENT_INSERT_DENIED`;
- use existing `/v1/search` for task-pane document lookup so
  SearchPermissionScopeProvider/PermissionService scopes are injected before
  result construction;
- resolve the requested current or explicit version server-side and require
  `PermissionService.canReadDocument`;
- deny external-recipient and `targetMessage.hasExternalParticipants` requests
  before any ready insertion is created;
- accept `attach-copy` only as a forward-compatible DTO value and deny it at
  runtime until a reviewed document-copy transport gate exists;
- block document/matter legal hold, disposal-locked state, and active
  requested/approved disposal requests with safe `DOCUMENT_LOCKED`;
- create only `internalReference` values such as
  `amic-vault://documents/{documentId}/versions/{versionId}`. These are not
  public, guest, secure, VDR, or externally usable links;
- store only tenant/user/document/version refs, Outlook hashes, bounded
  mode/status/reason values, and request/idempotency hashes;
- record `OUTLOOK_DOCUMENT_INSERT_REQUESTED` or
  `OUTLOOK_DOCUMENT_INSERT_DENIED` with reference-only metadata.

## Idempotency And Dedupe

Use both an `Idempotency-Key` header and server-side unique constraints.

Recommended dedupe fields:

- `tenant_id`,
- `user_id`,
- `mailbox_fingerprint`,
- `matter_id`,
- `internet_message_id` when present,
- `canonical_message_sha256`,
- `attachment_sha256`,
- attachment `ordinal` and `content_id_hash` for duplicate in-message files.

Server retries must be safe. A duplicate request returns the existing safe status
instead of creating another email or attachment record.

## Audit Events

Initial event catalog:

- `OUTLOOK_ADDIN_SESSION_EXCHANGED`
- `OUTLOOK_ADDIN_SESSION_DENIED`
- `OUTLOOK_EMAIL_FILE_REQUESTED`
- `OUTLOOK_EMAIL_FILE_COMPLETED`
- `OUTLOOK_EMAIL_FILE_DENIED`
- `OUTLOOK_EMAIL_FILE_FAILED`
- `OUTLOOK_EMAIL_FILE_CANCELLED`
- `OUTLOOK_ATTACHMENT_FILED`
- `OUTLOOK_MATTER_SUGGESTIONS_VIEWED`
- `OUTLOOK_SEND_POLICY_EVALUATED`
- `OUTLOOK_SEND_FILE_REQUESTED`
- `OUTLOOK_SEND_FILE_DENIED`
- `OUTLOOK_DOCUMENT_INSERT_REQUESTED`
- `OUTLOOK_DOCUMENT_INSERT_DENIED`
- `OUTLOOK_FOLDER_MAPPING_CHANGED`
- `OUTLOOK_AUTOFILE_JOB_RECORDED`
- `OUTLOOK_GRAPH_ATTACHMENT_ACQUIRE_REQUESTED`
- `OUTLOOK_GRAPH_ATTACHMENT_ACQUIRED`
- `OUTLOOK_GRAPH_ATTACHMENT_ACQUIRE_DENIED`

Audit metadata allow-list:

- `request_id`,
- `job_id`,
- `matter_id`,
- `document_id`,
- `version_id`,
- `email_record_id`,
- `attachment_count`,
- `attachment_id_hash`,
- `acquisition_id`,
- `addin_session_id`,
- `filed_attachment_count`,
- `message_hash`,
- `mailbox_fingerprint_hash`,
- `mailbox_binding_id`,
- `policy_mode`,
- `policy_decision`,
- `reason_code`,
- `request_kind`,
- `warning_count`,
- `warning_codes`,
- `idempotency_hash`,
- `client_request_hash`,
- `scope_count`,
- `scope_set_hash`,
- `outlook_status`.

## Error Handling

Use existing standard error codes only:

- `AUTH_REQUIRED`
- `PERMISSION_DENIED`
- `ETHICAL_WALL_BLOCKED`
- `AI_POLICY_BLOCKED`
- `DOCUMENT_LOCKED`
- `VALIDATION_FAILED`
- `UNSUPPORTED_FILE_TYPE`
- `EXTERNAL_LINK_EXPIRED`
- `TENANT_ISOLATION_VIOLATION`

Denied responses must be safe. They must not reveal whether a matter, document,
email, folder mapping, or attachment exists.
