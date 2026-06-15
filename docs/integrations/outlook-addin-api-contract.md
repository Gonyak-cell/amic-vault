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
| `/v1/m365/outlook/send-file-requests`         | POST   | `CreateOutlookSendFileRequestDto`    | OA07                |
| `/v1/m365/outlook/document-insertions`        | POST   | `CreateOutlookDocumentInsertionDto`  | OA08, R11/R13 gates |
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

Server behavior:

- build search/matter candidate query with PermissionService and
  SearchPermissionScopeProvider before result construction;
- never return unauthorized IDs for client-side filtering;
- audit `OUTLOOK_MATTER_SUGGESTIONS_VIEWED` with query hash and result count.

### `CreateOutlookSendFileRequestDto`

```ts
type CreateOutlookSendFileRequestDto = {
  matterId?: string;
  message: OutlookItemRefDto;
  selectedPolicyMode: 'allow' | 'warn' | 'block';
  clientRequestId: string;
  idempotencyKey: string;
};
```

Smart Alerts are a client event surface only. The server returns policy decisions
and records audit transitions.

### `CreateOutlookDocumentInsertionDto`

```ts
type CreateOutlookDocumentInsertionDto = {
  documentId: string;
  versionId?: string;
  targetMessage: OutlookItemRefDto;
  insertionMode: 'attach-copy' | 'internal-reference';
  hasExternalRecipients: boolean;
  clientRequestId: string;
  idempotencyKey: string;
};
```

Before the R11+ external-sharing policy permits it, this endpoint must deny any
action that would create public, guest, secure, VDR, or externally usable links.

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

- `OUTLOOK_EMAIL_FILE_REQUESTED`
- `OUTLOOK_EMAIL_FILE_COMPLETED`
- `OUTLOOK_EMAIL_FILE_DENIED`
- `OUTLOOK_EMAIL_FILE_FAILED`
- `OUTLOOK_EMAIL_FILE_CANCELLED`
- `OUTLOOK_ATTACHMENT_FILED`
- `OUTLOOK_MATTER_SUGGESTIONS_VIEWED`
- `OUTLOOK_SEND_FILE_REQUESTED`
- `OUTLOOK_SEND_FILE_DENIED`
- `OUTLOOK_DOCUMENT_INSERT_REQUESTED`
- `OUTLOOK_DOCUMENT_INSERT_DENIED`
- `OUTLOOK_FOLDER_MAPPING_CHANGED`
- `OUTLOOK_AUTOFILE_JOB_RECORDED`

Audit metadata allow-list:

- `request_id`,
- `job_id`,
- `matter_id`,
- `document_id`,
- `version_id`,
- `email_record_id`,
- `attachment_count`,
- `filed_attachment_count`,
- `message_hash`,
- `mailbox_fingerprint_hash`,
- `policy_mode`,
- `reason_code`,
- `idempotency_hash`.
- `client_request_hash`,
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
