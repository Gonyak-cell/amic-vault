import type {
  CreateOutlookDocumentInsertionDto,
  CreateOutlookEmailFilingRequestDto,
  CreateOutlookFolderMappingDto,
  CreateOutlookSendFileRequestDto,
  EvaluateOutlookSendPolicyDto,
  MatterSuggestionQueryDto,
  OutlookAttachmentRefDto,
  OutlookItemRefDto,
  OutlookSendWarningReasonCode,
} from '@amic-vault/shared';

export interface OfficeRecipientLike {
  emailAddress?: string | null;
}

export interface OfficeAttachmentLike {
  id?: string | null;
  contentId?: string | null;
  size?: number | null;
  contentType?: string | null;
  isInline?: boolean | null;
}

export interface OfficeAsyncResultLike<T = unknown> {
  status?: 'succeeded' | 'failed' | string;
  value?: T;
  error?: {
    code?: string;
    message?: string;
  };
}

export interface OfficeBodyLike {
  setSelectedDataAsync?: (
    data: string,
    options: { coercionType?: string },
    callback?: (asyncResult: OfficeAsyncResultLike<void>) => void,
  ) => void;
}

export interface OfficeMessageLike {
  itemId?: string | null;
  folderId?: string | null;
  parentFolderId?: string | null;
  folderPath?: string | null;
  internetMessageId?: string | null;
  conversationId?: string | null;
  subject?: string | null;
  dateTimeCreated?: Date | string | null;
  dateTimeModified?: Date | string | null;
  from?: OfficeRecipientLike | null;
  to?: readonly OfficeRecipientLike[] | null;
  cc?: readonly OfficeRecipientLike[] | null;
  attachments?: readonly OfficeAttachmentLike[] | null;
  body?: OfficeBodyLike | null;
}

export interface OfficeMailboxLike {
  userProfile?: {
    emailAddress?: string | null;
  } | null;
  item?: OfficeMessageLike | null;
}

export interface OutlookItemSnapshot {
  message: OutlookItemRefDto;
  attachmentRefs: OutlookAttachmentRefDto[];
  subjectHash?: string;
  folderRefHash?: string;
  folderPathHash?: string;
  mailboxHashPreview: string;
  itemHashPreview: string;
  participantDomainHashCount: number;
  externalParticipantCount: number;
  attachmentSummary: {
    count: number;
    selectedCount: number;
    totalSizeBytes: number;
  };
}

export type HashString = (value: string) => Promise<string>;

export async function sha256Hex(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('HASH_UNAVAILABLE');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function buildOutlookItemSnapshot(
  mailbox: OfficeMailboxLike | null | undefined,
  hashString: HashString = sha256Hex,
): Promise<OutlookItemSnapshot> {
  const mailboxEmail = normalizeEmail(mailbox?.userProfile?.emailAddress);
  const item = mailbox?.item;
  const itemId = cleanToken(item?.itemId);
  if (!mailboxEmail || !item || !itemId) {
    throw new Error('OUTLOOK_ITEM_UNAVAILABLE');
  }

  const mailboxDomain = domainFromEmail(mailboxEmail);
  const mailboxFingerprint = await namespacedHash(hashString, 'mailbox', mailboxEmail);
  const outlookItemIdHash = await namespacedHash(hashString, 'outlook-item-id', itemId);
  const internetMessageIdHash = await optionalHash(
    hashString,
    'internet-message-id',
    item.internetMessageId,
  );
  const conversationIdHash = await optionalHash(hashString, 'conversation-id', item.conversationId);
  const subjectHash = await optionalHash(hashString, 'subject', item.subject, { lower: true });
  const folderRefHash = await optionalHash(
    hashString,
    'outlook-folder-ref',
    item.folderId ?? item.parentFolderId,
  );
  const folderPathHash = await optionalHash(hashString, 'outlook-folder-path', item.folderPath, {
    lower: true,
  });

  const participantDomains = domainsFromRecipients([item.from, ...(item.to ?? []), ...(item.cc ?? [])]);
  const participantDomainHashes = (
    await Promise.all(
      participantDomains.slice(0, 50).map((domain) => namespacedHash(hashString, 'domain', domain)),
    )
  ).sort();
  const externalParticipantCount = participantDomains.filter(
    (domain) => mailboxDomain && domain !== mailboxDomain,
  ).length;
  const attachmentRefs = await buildAttachmentRefs(item.attachments ?? [], hashString);
  const receivedAt = isoDate(item.dateTimeCreated) ?? isoDate(item.dateTimeModified);
  const canonicalMessageSha256 = await hashString(
    JSON.stringify({
      attachmentRefs,
      conversationIdHash,
      internetMessageIdHash,
      mailboxFingerprint,
      outlookItemIdHash,
      participantDomainHashes,
      receivedAt,
    }),
  );

  const selectedCount = attachmentRefs.filter((attachment) => attachment.selectedForFiling).length;
  return {
    message: {
      mailboxFingerprint,
      outlookItemIdHash,
      ...(internetMessageIdHash ? { internetMessageIdHash } : {}),
      ...(conversationIdHash ? { conversationIdHash } : {}),
      canonicalMessageSha256,
      ...(receivedAt ? { receivedAt } : {}),
      hasExternalParticipants: externalParticipantCount > 0,
      participantDomainHashes,
    },
    attachmentRefs,
    ...(subjectHash ? { subjectHash } : {}),
    ...(folderRefHash ? { folderRefHash } : {}),
    ...(folderPathHash ? { folderPathHash } : {}),
    mailboxHashPreview: shortHash(mailboxFingerprint),
    itemHashPreview: shortHash(outlookItemIdHash),
    participantDomainHashCount: participantDomainHashes.length,
    externalParticipantCount,
    attachmentSummary: {
      count: attachmentRefs.length,
      selectedCount,
      totalSizeBytes: attachmentRefs.reduce((total, attachment) => total + attachment.sizeBytes, 0),
    },
  };
}

export function buildMatterSuggestionQuery(
  snapshot: OutlookItemSnapshot,
  limit = 5,
): MatterSuggestionQueryDto {
  return {
    sourceClient: 'outlook-web-addin',
    mailboxFingerprint: snapshot.message.mailboxFingerprint,
    participantDomainHashes: snapshot.message.participantDomainHashes,
    ...(snapshot.subjectHash ? { subjectHash: snapshot.subjectHash } : {}),
    ...(snapshot.message.conversationIdHash
      ? { conversationIdHash: snapshot.message.conversationIdHash }
      : {}),
    limit,
  };
}

export function buildCreateFilingRequest(
  snapshot: OutlookItemSnapshot,
  matterId: string,
  selectedAttachmentHashes: ReadonlySet<string> = new Set(
    snapshot.attachmentRefs
      .filter((attachment) => attachment.selectedForFiling)
      .map((attachment) => attachment.attachmentIdHash),
  ),
): CreateOutlookEmailFilingRequestDto {
  const attachmentSet = snapshot.attachmentRefs
    .filter((attachment) => selectedAttachmentHashes.has(attachment.attachmentIdHash))
    .map((attachment) => ({ ...attachment, selectedForFiling: true }));
  return {
    matterId,
    message: snapshot.message,
    attachments: attachmentSet,
    sourceClient: 'outlook-web-addin',
    clientRequestId: `oa05:${Date.now().toString(36)}:${snapshot.itemHashPreview}`,
    idempotencyKey: `oa05:${snapshot.message.canonicalMessageSha256}:${matterId.replaceAll('-', '')}`,
  };
}

export function buildSendPolicyRequest(
  snapshot: OutlookItemSnapshot,
  matterId?: string,
  selectedAttachmentHashes: ReadonlySet<string> = new Set(
    snapshot.attachmentRefs
      .filter((attachment) => attachment.selectedForFiling)
      .map((attachment) => attachment.attachmentIdHash),
  ),
): EvaluateOutlookSendPolicyDto {
  return {
    sourceClient: 'outlook-web-addin',
    ...(matterId ? { matterId } : {}),
    message: snapshot.message,
    attachments: selectedAttachmentRefs(snapshot, selectedAttachmentHashes),
    ...(snapshot.subjectHash ? { subjectHash: snapshot.subjectHash } : {}),
    clientRequestId: `oa07-policy:${Date.now().toString(36)}:${snapshot.itemHashPreview}`,
  };
}

export function buildCreateSendFileRequest(
  snapshot: OutlookItemSnapshot,
  matterId: string,
  selectedAttachmentHashes: ReadonlySet<string>,
  acknowledgedWarningCodes: readonly OutlookSendWarningReasonCode[] = [],
): CreateOutlookSendFileRequestDto {
  return {
    sourceClient: 'outlook-web-addin',
    matterId,
    message: snapshot.message,
    attachments: selectedAttachmentRefs(snapshot, selectedAttachmentHashes),
    ...(snapshot.subjectHash ? { subjectHash: snapshot.subjectHash } : {}),
    clientRequestId: `oa07-file:${Date.now().toString(36)}:${snapshot.itemHashPreview}`,
    idempotencyKey: `oa07:${snapshot.message.canonicalMessageSha256}:${matterId.replaceAll('-', '')}`,
    acknowledgedWarningCodes: [...acknowledgedWarningCodes],
  };
}

export function buildCreateDocumentInsertionRequest(
  snapshot: OutlookItemSnapshot,
  input: {
    documentId: string;
    versionId?: string;
    insertionMode?: CreateOutlookDocumentInsertionDto['insertionMode'];
  },
): CreateOutlookDocumentInsertionDto {
  return {
    sourceClient: 'outlook-web-addin',
    documentId: input.documentId,
    ...(input.versionId ? { versionId: input.versionId } : {}),
    targetMessage: snapshot.message,
    insertionMode: input.insertionMode ?? 'internal-reference',
    hasExternalRecipients: snapshot.message.hasExternalParticipants,
    clientRequestId: `oa08-insert:${Date.now().toString(36)}:${snapshot.itemHashPreview}`,
    idempotencyKey: `oa08:${snapshot.message.canonicalMessageSha256.slice(0, 48)}:${input.documentId.replaceAll(
      '-',
      '',
    )}:${(input.versionId ?? 'current').replaceAll('-', '')}`,
  };
}

export function buildCreateFolderMappingRequest(
  snapshot: OutlookItemSnapshot,
  matterId: string,
  input: {
    mappingMode?: CreateOutlookFolderMappingDto['mappingMode'];
    autoFileRequested?: boolean;
  } = {},
): CreateOutlookFolderMappingDto {
  if (!snapshot.folderRefHash) {
    throw new Error('OUTLOOK_FOLDER_REF_UNAVAILABLE');
  }
  return {
    sourceClient: 'outlook-web-addin',
    matterId,
    mailboxFingerprint: snapshot.message.mailboxFingerprint,
    folderRefHash: snapshot.folderRefHash,
    ...(snapshot.folderPathHash ? { folderPathHash: snapshot.folderPathHash } : {}),
    mappingMode: input.mappingMode ?? 'manual',
    autoFileRequested: input.autoFileRequested ?? false,
    clientRequestId: `oa09-folder:${Date.now().toString(36)}:${snapshot.itemHashPreview}`,
    idempotencyKey: `oa09:${snapshot.message.mailboxFingerprint.slice(0, 32)}:${snapshot.folderRefHash.slice(
      0,
      32,
    )}:${matterId.replaceAll('-', '')}:${input.mappingMode ?? 'manual'}`,
  };
}

export function shortHash(hash: string): string {
  return hash.length <= 12 ? hash : `${hash.slice(0, 8)}.${hash.slice(-4)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function buildAttachmentRefs(
  attachments: readonly OfficeAttachmentLike[],
  hashString: HashString,
): Promise<OutlookAttachmentRefDto[]> {
  return Promise.all(
    attachments.map(async (attachment, ordinal) => {
      const attachmentToken =
        cleanToken(attachment.id) ??
        `ordinal:${ordinal}:size:${boundedSize(attachment.size)}:mime:${cleanMime(attachment.contentType) ?? ''}`;
      const contentIdHash = await optionalHash(hashString, 'attachment-content-id', attachment.contentId);
      return {
        attachmentIdHash: await namespacedHash(hashString, 'attachment-id', attachmentToken),
        ...(contentIdHash ? { contentIdHash } : {}),
        ordinal,
        sizeBytes: boundedSize(attachment.size),
        ...(cleanMime(attachment.contentType) ? { mimeType: cleanMime(attachment.contentType) } : {}),
        selectedForFiling: attachment.isInline !== true,
      };
    }),
  );
}

function selectedAttachmentRefs(
  snapshot: OutlookItemSnapshot,
  selectedAttachmentHashes: ReadonlySet<string>,
): OutlookAttachmentRefDto[] {
  return snapshot.attachmentRefs
    .filter((attachment) => selectedAttachmentHashes.has(attachment.attachmentIdHash))
    .map((attachment) => ({ ...attachment, selectedForFiling: true }));
}

async function optionalHash(
  hashString: HashString,
  namespace: string,
  value: string | null | undefined,
  options: { lower?: boolean } = {},
): Promise<string | undefined> {
  const token = cleanToken(value);
  if (!token) return undefined;
  return namespacedHash(hashString, namespace, options.lower ? token.toLowerCase() : token);
}

function namespacedHash(hashString: HashString, namespace: string, value: string): Promise<string> {
  return hashString(`${namespace}\0${value}`);
}

function normalizeEmail(value: string | null | undefined): string | undefined {
  const token = cleanToken(value)?.toLowerCase();
  if (!token?.includes('@')) return undefined;
  return token;
}

function cleanToken(value: string | null | undefined): string | undefined {
  const token = value?.trim();
  return token ? token : undefined;
}

function domainFromEmail(value: string): string | undefined {
  const domain = value.split('@')[1]?.trim().toLowerCase();
  return domain || undefined;
}

function domainsFromRecipients(recipients: readonly (OfficeRecipientLike | null | undefined)[]): string[] {
  const domains = new Set<string>();
  for (const recipient of recipients) {
    const email = normalizeEmail(recipient?.emailAddress);
    const domain = email ? domainFromEmail(email) : undefined;
    if (domain) domains.add(domain);
  }
  return [...domains].sort();
}

function boundedSize(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(2_147_483_647, Math.trunc(value ?? 0)));
}

function cleanMime(value: string | null | undefined): string | undefined {
  const token = cleanToken(value);
  if (!token) return undefined;
  return token.slice(0, 255);
}

function isoDate(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}
