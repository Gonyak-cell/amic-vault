import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { AuditService, QueryClient } from '../audit/audit.service';
import type { DlpService } from '../dlp/dlp.service';
import type { DocumentService } from '../document/document.service';
import type { DocumentVersionService } from '../document/document-version.service';
import type { DocumentUploadService } from '../document/document-upload.service';
import type { PermissionQueryBuilder } from '../permission/permission-query.builder';
import type { PermissionService } from '../permission/permission.service';
import type { SearchIndexRepository } from '../search/index/search-index.repository';
import type { FileObjectService } from '../storage/file-object.service';
import type { StorageService } from '../storage/storage.service';
import type { TenantContextService } from '../tenant/tenant-context';
import type { UserService } from '../user/user.service';
import { EmailDuplicateMessageError, EmailService } from './email.service';
import { EmailThreadService } from './email-thread.service';
import type { EmailWorkerParserClient } from './email-worker-parser.client';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '11111111-1111-4111-8111-111111111101';
const existingEmailId = '11111111-1111-4111-8111-1111111111ee';

function sha256Hex(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function emailMessageIdHash(value: string): string {
  return createHash('sha256').update('email-message-id').update('\0').update(value).digest('hex');
}

function createService(
  selectRows: unknown[][] = [[], []],
  permissionEffect: 'ALLOW' | 'DENY' = 'ALLOW',
  options: {
    emailBodySearch?: 'enabled' | 'disabled' | 'linked';
    workerParser?: EmailWorkerParserClient;
  } = {},
) {
  let insertedEmailMessageRow:
    | {
        email_id: unknown;
        message_id_hash: unknown;
        references_json: unknown;
        thread_id: null;
        thread_created_at: null;
      }
    | null = null;
  const query = vi.fn(async (sql: string, params?: readonly unknown[]) => {
    if (sql.includes("settings_json->>'emailBodySearchEnabled'")) {
      return {
        rows: [{ enabled: options.emailBodySearch === 'disabled' ? 'false' : null }],
        rowCount: 1,
      };
    }
    if (sql.includes('FROM tenant_email_domains')) {
      return { rows: [{ domain_ref: 'amic.test' }], rowCount: 1 };
    }
    if (sql.includes("nullif(lower(c.metadata_json->>'domain'")) {
      return {
        rows: [{ client_domain: 'sender.example', matter_domain: 'sender.example' }],
        rowCount: 1,
      };
    }
    if (sql.includes('FROM parties p')) {
      return {
        rows: [
          {
            name: 'Opposing Counsel <lawyer@opposing.example>',
            party_role: 'opposing_counsel',
            related_client_domain: null,
          },
        ],
        rowCount: 1,
      };
    }
    if (sql.includes('body_document_id IS NOT NULL')) {
      const rows = options.emailBodySearch === 'linked' ? [{ '?column?': 1 }] : [];
      return { rows, rowCount: rows.length };
    }
    if (sql.includes('fo.storage_uri AS raw_storage_uri')) {
      const rows =
        options.emailBodySearch === 'enabled'
          ? [
              {
                email_id: existingEmailId,
                parser: 'eml',
                parse_status: 'parsed',
                subject: 'Searchable Korean body',
                raw_storage_uri: 's3://vault-dev/tenants/body/raw/email.eml',
              },
            ]
          : [];
      return { rows, rowCount: rows.length };
    }
    if (sql.includes('SELECT participant_id, domain_ref')) {
      return {
        rows: [
          { participant_id: '11111111-1111-4111-8111-1111111111c0', domain_ref: 'sender.example' },
          { participant_id: '11111111-1111-4111-8111-1111111111c1', domain_ref: 'amic.test' },
        ],
        rowCount: 2,
      };
    }
    if (sql.includes('FROM email_participants') && sql.includes('ORDER BY role ASC')) {
      return {
        rows: [
          { role: 'from', domain_ref: 'sender.example', display_name: 'Sender' },
          { role: 'to', domain_ref: 'amic.test', display_name: 'Internal' },
        ],
        rowCount: 2,
      };
    }
    if (sql.includes('SELECT subject, thread_id') && sql.includes('FROM email_messages')) {
      return {
        rows: [
          {
            subject: 'Privileged filed subject',
            thread_id: '11111111-1111-4111-8111-1111111111c2',
          },
        ],
        rowCount: 1,
      };
    }
    if (sql.includes('SELECT DISTINCT role, address_hash, domain_ref, participant_class')) {
      return {
        rows: [
          {
            role: 'from',
            address_hash: 'sender-hash',
            domain_ref: 'sender.example',
            participant_class: 'client',
          },
          {
            role: 'to',
            address_hash: 'internal-hash',
            domain_ref: 'amic.test',
            participant_class: 'internal',
          },
        ],
        rowCount: 2,
      };
    }
    if (sql.includes('WITH candidates AS')) {
      return {
        rows: [
          {
            matter_id: '11111111-1111-4111-8111-1111111111a0',
            matter_code: 'MAT-FILED',
            matter_name: 'Filed matter',
            client_id: '11111111-1111-4111-8111-1111111111a1',
            subject_match: false,
            domain_match: false,
            client_participant_match: false,
            opposing_domain_conflict: false,
            thread_filed_count: '1',
            sender_matter_filing_count: '0',
            sender_total_filing_count: '0',
          },
        ],
        rowCount: 1,
      };
    }
    if (/SELECT\s+email_id\s+FROM email_messages\s+WHERE/u.test(sql)) {
      const rows = selectRows.shift() ?? [];
      return { rows, rowCount: rows.length };
    }
    if (/SELECT\s+1\s+FROM email_messages\s+WHERE/u.test(sql)) {
      return { rows: [{ '?column?': 1 }], rowCount: 1 };
    }
    if (
      sql.includes('FROM email_messages e') &&
      sql.includes('jsonb_array_elements_text(e.references_json)')
    ) {
      const rows = insertedEmailMessageRow ? [insertedEmailMessageRow] : [];
      return { rows, rowCount: rows.length };
    }
    if (sql.includes('INSERT INTO email_messages')) {
      const referencesJson = typeof params?.[12] === 'string' ? JSON.parse(params[12]) : [];
      insertedEmailMessageRow = {
        email_id: params?.[0],
        message_id_hash: params?.[3],
        references_json: referencesJson,
        thread_id: null,
        thread_created_at: null,
      };
      return {
        rowCount: 1,
        rows: [
          {
            email_id: params?.[0],
            tenant_id: params?.[1],
            raw_file_object_id: params?.[2],
            message_id_hash: params?.[3],
            parser: params?.[4],
            parser_version: params?.[5],
            parse_status: params?.[6],
            failure_reason_code: params?.[7],
            subject: params?.[8],
            sent_at: params?.[9] ? new Date(String(params[9])) : null,
            received_at: params?.[10] ? new Date(String(params[10])) : null,
            metadata_warning_code: params?.[11],
            references_json: referencesJson,
            has_outside_participants: params?.[13],
            raw_sha256: params?.[14],
            raw_size_bytes: String(params?.[15]),
            created_by: params?.[16],
            created_at: new Date('2026-06-12T00:00:00.000Z'),
          },
        ],
      };
    }
    if (sql.includes('INSERT INTO email_threads')) {
      return {
        rows: [{ thread_id: '11111111-1111-4111-8111-1111111111c2' }],
        rowCount: 1,
      };
    }
    if (sql.includes('UPDATE email_threads')) {
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO email_participants')) {
      return { rows: [], rowCount: 1 };
    }
    if (
      sql.includes('UPDATE email_participants') ||
      sql.includes('UPDATE email_messages') ||
      sql.includes('participant_class = $3')
    ) {
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO email_document_links')) {
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO email_matter_filings')) {
      return { rows: [], rowCount: 1 };
    }
    if (/SELECT\s+1\s+FROM email_matter_filings\s+WHERE/u.test(sql)) {
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes('INSERT INTO email_suggestion_feedback')) {
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO notifications')) {
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('DELETE FROM email_matter_filings')) {
      return {
        rows: [{ filing_id: '11111111-1111-4111-8111-1111111111fa' }],
        rowCount: 1,
      };
    }
    if (sql.includes('INSERT INTO documents')) {
      return {
        rows: [
          {
            document_id: params?.[0],
            tenant_id: params?.[1],
            matter_id: params?.[2],
            document_family_id: params?.[3],
            title: params?.[4],
            status: 'draft',
            document_type: params?.[5],
            subtype: params?.[6],
            confidentiality_level: params?.[7],
            privilege_status: params?.[8],
            ai_allowed: params?.[9],
            legal_hold: false,
            created_by: params?.[10],
            created_at: new Date('2026-06-12T00:00:00.000Z'),
            updated_at: new Date('2026-06-12T00:00:00.000Z'),
          },
        ],
        rowCount: 1,
      };
    }
    if (sql.includes('INSERT INTO document_versions')) {
      return {
        rows: [
          {
            version_id: '11111111-1111-4111-8111-1111111111v0',
            document_id: params?.[1],
            version_no: 1,
            version_status: 'current',
            file_object_id: params?.[2],
            file_hash: params?.[3],
            created_by: params?.[4],
            created_at: new Date('2026-06-12T00:00:00.000Z'),
            supersedes_version_id: null,
            promoted_from_subversion_id: null,
          },
        ],
        rowCount: 1,
      };
    }
    if (
      sql.includes('INSERT INTO canonical_documents') ||
      sql.includes('UPDATE email_matter_filings')
    ) {
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('FROM email_matter_filings f')) {
      return {
        rows: [
          {
            filing_id: '11111111-1111-4111-8111-1111111111fa',
            tenant_id: tenantId,
            email_id: existingEmailId,
            matter_id: '11111111-1111-4111-8111-1111111111a0',
            subject: 'Privileged filed subject',
            sent_at: new Date('2026-06-12T00:00:00.000Z'),
            has_outside_participants: false,
            matter_code: 'MAT-FILED',
            matter_name: 'Filed matter',
            matter_domain: 'sender.example',
            client_domain: 'sender.example',
            participant_domains: ['sender.example'],
            participant_class_counts: [
              { class: 'internal', count: 1 },
              { class: 'client', count: 1 },
            ],
            thread_id: '11111111-1111-4111-8111-1111111111c2',
            conversation_id_hash: null,
            root_message_id_hash: 'a'.repeat(64),
            message_id_hash: 'c'.repeat(64),
            references_json: ['a'.repeat(64), 'b'.repeat(64)],
            thread_related_count: '2',
            document_ids: ['11111111-1111-4111-8111-1111111111d0'],
            created_by: actorUserId,
            created_at: new Date('2026-06-12T00:00:00.000Z'),
          },
        ],
        rowCount: 1,
      };
    }
    if (sql.includes('FROM email_document_links')) {
      return {
        rows: [
          {
            link_id: '11111111-1111-4111-8111-1111111111ad',
            tenant_id: tenantId,
            email_id: existingEmailId,
            document_id: '11111111-1111-4111-8111-1111111111d0',
            file_object_id: '11111111-1111-4111-8111-1111111111f0',
            attachment_index: 0,
            attachment_filename: 'linked.pdf',
            media_type: 'application/pdf',
            size_bytes: '30',
            sha256: 'b'.repeat(64),
            created_at: new Date('2026-06-12T00:00:00.000Z'),
          },
        ],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  });
  const client = { query } satisfies QueryClient;
  const auditLog = vi.fn(async (...args: [unknown, QueryClient?]) => {
    void args;
    return {
      eventId: '11111111-1111-4111-8111-1111111111aa',
      createdAt: new Date('2026-06-12T00:00:00.000Z'),
    };
  });
  const auditService = {
    transaction: vi.fn(async (_tenantId: string, run: (tx: QueryClient) => Promise<unknown>) =>
      run(client),
    ),
    log: auditLog,
  } as unknown as AuditService;
  const fileObjectCreate = vi.fn(async () => undefined);
  const fileObjectService = {
    create: fileObjectCreate,
  } as unknown as FileObjectService;
  const storageUri = `s3://vault-dev/tenants/${tenantId}/emails/11111111-1111-4111-8111-1111111111ee/raw/11111111-1111-4111-8111-1111111111ff`;
  const storageService = {
    putEmailRawObject: vi.fn(async () => ({
      key: 'key',
      storageUri,
      encryptionKeyId: null,
    })),
    putTenantObject: vi.fn(async () => ({
      key: 'body-key',
      storageUri: 's3://vault-dev/tenants/body/documents/email-body',
      encryptionKeyId: null,
    })),
    getByStorageUri: vi.fn(async () => ({
      key: 'raw-key',
      contentLength: 128,
      contentType: 'message/rfc822',
      etag: null,
      body: Readable.from([
        [
          'Message-ID: <body-search@example.test>',
          'Subject: Searchable Korean body',
          'Content-Type: multipart/mixed; boundary="body-boundary"',
          '',
          '--body-boundary',
          'Content-Type: text/plain; charset=utf-8',
          '',
          'd8 unique searchable email body token',
          '--body-boundary--',
          '',
        ].join('\r\n'),
      ]),
    })),
    deleteByStorageUri: vi.fn(async () => undefined),
  } as unknown as StorageService;
  const tenantContext = {
    require: () => ({ tenantId, slug: 'tenant-alpha', status: 'active', source: 'session' }),
  } as unknown as TenantContextService;
  const uploadBuffer = vi.fn(async () => ({
    documentId: '11111111-1111-4111-8111-1111111111d0',
    matterId: '11111111-1111-4111-8111-1111111111a0',
    fileObjectId: '11111111-1111-4111-8111-1111111111f0',
    status: 'draft' as const,
    title: 'attachment.pdf',
    documentType: 'correspondence' as const,
    subtype: null,
    confidentialityLevel: 'standard' as const,
    privilegeStatus: 'none' as const,
    metadataSuggestion: {},
    duplicates: [{ documentId: 'dupe-doc', fileObjectId: 'dupe-file', sha256: 'b'.repeat(64) }],
  }));
  const documentUploadService = { uploadBuffer } as unknown as DocumentUploadService;
  const canReadDocument = vi.fn(async () => ({ effect: permissionEffect, appliedRules: [] }));
  const canUploadToMatter = vi.fn(async () => ({ effect: permissionEffect, appliedRules: [] }));
  const permissionService = { canReadDocument, canUploadToMatter } as unknown as PermissionService;
  const permissionQueryBuilder = {
    buildMatterFilter: vi.fn(() => ({ sql: 'TRUE', params: [], appliedRules: [] })),
  } as unknown as PermissionQueryBuilder;
  const userService = {
    findByTenantAndId: vi.fn(async () => ({ role: 'matter_owner', status: 'active' })),
  } as unknown as UserService;
  const scanAndRecord = vi.fn(async () => ({ findings: [] }));
  const dlpService = { scanAndRecord } as unknown as DlpService;
  const createDraft = vi.fn(async () => undefined);
  const createInitialVersion = vi.fn(async () => ({
    documentId: '11111111-1111-4111-8111-1111111111bd',
    versionId: '11111111-1111-4111-8111-1111111111v0',
    versionNo: 1,
    versionStatus: 'current',
    fileObjectId: '11111111-1111-4111-8111-1111111111bf',
    fileHash: 'd'.repeat(64),
    createdBy: actorUserId,
    createdAt: '2026-06-12T00:00:00.000Z',
    supersedesVersionId: null,
    promotedFromSubversionId: null,
  }));
  const upsertVersion = vi.fn(async () => undefined);
  const documentService = { createDraft } as unknown as DocumentService;
  const documentVersionService = { createInitialVersion } as unknown as DocumentVersionService;
  const searchIndexRepository = { upsertVersion } as unknown as SearchIndexRepository;

  return {
    auditLog,
    canUploadToMatter,
    canReadDocument,
    client,
    documentUploadService,
    fileObjectCreate,
    createDraft,
    createInitialVersion,
    query,
    scanAndRecord,
    upsertVersion,
    service: new EmailService(
      auditService,
      fileObjectService,
      storageService,
      tenantContext,
      documentUploadService,
      permissionService,
      permissionQueryBuilder,
      userService,
      dlpService,
      documentService,
      documentVersionService,
	      searchIndexRepository,
	      options.workerParser,
	      new EmailThreadService(),
	    ),
    storageService,
    uploadBuffer,
  };
}

describe('EmailService', () => {
  it('imports a parsed EML using raw storage and reference-only audit metadata', async () => {
    const { auditLog, fileObjectCreate, query, service, storageService } = createService();
    const result = await service.importRawEmail({
      tenantId,
      actorUserId,
      originalFilename: 'fixture.eml',
      body: Buffer.from(
        [
          'From: Sender <sender@example.test>',
          'To: Internal <internal@amic.test>, Outside <outside@example.test>',
          'Message-ID: <case-001@example.test>',
          'References: <thread-001@example.test>',
          'Date: Fri, 12 Jun 2026 10:15:30 +0900',
          'Subject: Privileged fixture',
          '',
          'raw body must not appear in audit',
        ].join('\r\n'),
      ),
    });

    expect(result).toMatchObject({
      tenantId,
      parser: 'eml',
      parserVersion: 'email-api-v2',
      parseStatus: 'parsed',
      failureReasonCode: null,
      subject: 'Privileged fixture',
      sentAt: '2026-06-12T01:15:30.000Z',
      receivedAt: null,
      hasOutsideParticipants: true,
      references: [expect.stringMatching(/^[0-9a-f]{64}$/)],
      createdBy: actorUserId,
    });
    expect(fileObjectCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        sourceSystem: 'email_ingest',
        originalFilename: 'fixture.eml',
        mimeType: 'message/rfc822',
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
      expect.anything(),
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EMAIL_IMPORTED',
        metadata: expect.objectContaining({
          scope_type: 'email',
          hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      }),
      expect.anything(),
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EMAIL_METADATA_UPDATED',
        metadata: expect.objectContaining({
          scope_type: 'email_metadata',
          result_count: 3,
        }),
      }),
      expect.anything(),
    );
    const participantInserts = query.mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO email_participants'),
    );
    expect(participantInserts.map(([, params]) => (params as readonly unknown[])[7])).toEqual([
      'other_external',
      'internal',
      'other_external',
    ]);
    expect(JSON.stringify(auditLog.mock.calls)).not.toContain('case-001@example.test');
    expect(JSON.stringify(auditLog.mock.calls)).not.toContain('outside@example.test');
    expect(JSON.stringify(auditLog.mock.calls)).not.toContain('raw body must not appear');
    const emailInsert = query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO email_messages'));
    const emailInsertParams = emailInsert?.[1] as readonly unknown[] | undefined;
    expect(emailInsertParams?.[3]).toBe(emailMessageIdHash('case-001@example.test'));
    expect(JSON.parse(String(emailInsertParams?.[12]))).toEqual([
      emailMessageIdHash('thread-001@example.test'),
    ]);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO email_threads'))).toBe(
      true,
    );
    const threadAssignment = query.mock.calls.find(([sql]) =>
      String(sql).includes('SET thread_id = $3'),
    );
    expect(threadAssignment?.[1]).toEqual([
      tenantId,
      [result.emailId],
      '11111111-1111-4111-8111-1111111111c2',
      null,
    ]);
    expect(storageService.deleteByStorageUri).not.toHaveBeenCalled();
  });

  it('delegates import metadata parsing to the worker parser client when injected', async () => {
    const parseRawEmail = vi.fn(async () => ({
      parser: 'eml' as const,
      parserVersion: 'email-worker-v1',
      parseStatus: 'parsed' as const,
      failureReasonCode: null,
      normalizedMessageId: 'worker-import@example.test',
      subject: '검토 요청',
      sentAt: null,
      receivedAt: null,
      metadataWarningCode: null,
      references: ['worker-thread@example.test'],
      participants: [
        {
          role: 'from' as const,
          normalizedAddress: 'sender@example.test',
          domainRef: 'example.test',
          displayName: 'Sender',
        },
        {
          role: 'to' as const,
          normalizedAddress: 'internal@amic.test',
          domainRef: 'amic.test',
          displayName: 'Internal',
        },
      ],
    }));
    const workerParser = { parseRawEmail } as unknown as EmailWorkerParserClient;
    const { auditLog, query, service } = createService([[], []], 'ALLOW', { workerParser });

    const result = await service.importRawEmail({
      tenantId,
      actorUserId,
      originalFilename: 'worker-import.eml',
      body: Buffer.from(
        [
          'From: Legacy <legacy@example.test>',
          'To: Internal <internal@amic.test>',
          'Message-ID: <legacy-api@example.test>',
          'Subject: API parser should not win',
          '',
          'body',
        ].join('\r\n'),
      ),
    });

    expect(parseRawEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        filename: 'worker-import.eml',
        mimeType: 'message/rfc822',
        body: expect.any(Buffer),
      }),
    );
    expect(result).toMatchObject({
      parser: 'eml',
      parserVersion: 'email-worker-v1',
      parseStatus: 'parsed',
      subject: '검토 요청',
      hasOutsideParticipants: true,
    });
    const insertCall = query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO email_messages'));
    expect((insertCall?.[1] as readonly unknown[])[5]).toBe('email-worker-v1');
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EMAIL_METADATA_UPDATED',
        metadata: expect.objectContaining({
          after_ref: 'parser_version:email-worker-v1',
          result_count: 2,
        }),
      }),
      expect.anything(),
    );
  });

  it('imports MSG worker attachments through the existing attachment document flow', async () => {
    const attachmentBody = Buffer.from('%PDF-1.7\nmsg attachment\n%%EOF\n');
    const parseRawEmail = vi.fn(async () => ({
      parser: 'msg' as const,
      parserVersion: 'email-worker-v1',
      parseStatus: 'parsed' as const,
      failureReasonCode: null,
      normalizedMessageId: 'worker-msg@example.test',
      subject: 'MSG 검토 요청',
      sentAt: null,
      receivedAt: null,
      metadataWarningCode: null,
      references: [],
      participants: [
        {
          role: 'from' as const,
          normalizedAddress: 'sender@example.test',
          domainRef: 'example.test',
          displayName: 'Sender',
        },
      ],
      attachments: [
        {
          attachmentIndex: 0,
          normalizedFilename: 'attachment.pdf',
          mediaType: 'application/pdf',
          sizeBytes: attachmentBody.length,
          sha256: sha256Hex(attachmentBody),
          body: attachmentBody,
        },
      ],
    }));
    const workerParser = { parseRawEmail } as unknown as EmailWorkerParserClient;
    const { scanAndRecord, service, uploadBuffer } = createService([[], []], 'ALLOW', {
      workerParser,
    });

    const result = await service.importRawEmail({
      tenantId,
      actorUserId,
      matterId: '11111111-1111-4111-8111-1111111111a0',
      originalFilename: 'worker-msg.msg',
      mimeType: 'application/vnd.ms-outlook',
      body: Buffer.from([0xd0, 0xcf, 0x11, 0xe0]),
    });

    expect(result).toMatchObject({
      parser: 'msg',
      parserVersion: 'email-worker-v1',
      parseStatus: 'parsed',
      subject: 'MSG 검토 요청',
    });
    expect(parseRawEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'worker-msg.msg',
        mimeType: 'application/vnd.ms-outlook',
      }),
    );
    expect(scanAndRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sourceType: 'attachment',
        text: '%PDF-1.7\nmsg attachment\n%%EOF\n',
      }),
    );
    expect(uploadBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        originalFilename: 'attachment.pdf',
        mimeType: 'application/pdf',
        body: attachmentBody,
      }),
    );
  });

  it('preserves raw EML when parsing fails without claiming parsed status', async () => {
    const { service } = createService();
    const result = await service.importRawEmail({
      tenantId,
      actorUserId,
      originalFilename: 'broken.eml',
      body: Buffer.from('Subject: Missing message id\r\n\r\nbody'),
    });

    expect(result).toMatchObject({
      parser: 'eml',
      parseStatus: 'failed',
      failureReasonCode: 'MISSING_MESSAGE_ID',
      rawSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it('decodes RFC2047 Korean subjects and charset text attachments during import', async () => {
    const { scanAndRecord, service } = createService();
    const result = await service.importRawEmail({
      tenantId,
      actorUserId,
      matterId: '11111111-1111-4111-8111-1111111111a0',
      originalFilename: 'encoded-korean.eml',
      body: Buffer.from(
        [
          'From: =?EUC-KR?B?x9G6+8D8wNo=?= <sender@amic.test>',
          'To: Internal <internal@amic.test>',
          'Message-ID: <encoded-korean@example.test>',
          'Subject: =?EUC-KR?B?sMvF5CC/5MO7?=',
          'Content-Type: multipart/mixed; boundary="amic-boundary"',
          '',
          '--amic-boundary',
          'Content-Type: text/plain; charset=euc-kr',
          'Content-Disposition: attachment; filename="notes.txt"',
          'Content-Transfer-Encoding: quoted-printable',
          '',
          '=C7=D1=B1=DB',
          '--amic-boundary--',
          '',
        ].join('\r\n'),
        'latin1',
      ),
    });

    expect(result).toMatchObject({
      parser: 'eml',
      parseStatus: 'parsed',
      subject: '검토 요청',
    });
    expect(scanAndRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        text: '한글',
      }),
    );
  });

  it('preserves raw MSG as pending unsupported when the worker parser is unavailable', async () => {
    const { service } = createService();
    const result = await service.importRawEmail({
      tenantId,
      actorUserId,
      originalFilename: 'legacy.msg',
      body: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0x00]),
    });

    expect(result).toMatchObject({
      parser: 'msg',
      parseStatus: 'pending_unsupported',
      failureReasonCode: 'UNSUPPORTED_MSG',
    });
  });

  it('imports supported EML attachments only after DLP scan and stores email links', async () => {
    const { query, scanAndRecord, service, uploadBuffer } = createService();
    const pdf = Buffer.from('%PDF-1.7\nattachment\n%%EOF\n');

    await service.importRawEmail({
      tenantId,
      actorUserId,
      matterId: '11111111-1111-4111-8111-1111111111a0',
      originalFilename: 'with-attachment.eml',
      body: Buffer.from(
        [
          'Message-ID: <case-attachment@example.test>',
          'Content-Type: multipart/mixed; boundary="amic-boundary"',
          '',
          '--amic-boundary',
          'Content-Type: text/plain',
          '',
          'raw email body',
          '--amic-boundary',
          'Content-Type: application/pdf; name="../attachment?.pdf"',
          'Content-Disposition: attachment; filename="../attachment?.pdf"',
          'Content-Transfer-Encoding: base64',
          '',
          pdf.toString('base64'),
          '--amic-boundary--',
          '',
        ].join('\r\n'),
      ),
    });

    expect(scanAndRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId,
        sourceType: 'attachment',
        matterId: '11111111-1111-4111-8111-1111111111a0',
        text: expect.stringContaining('attachment'),
      }),
    );
    const scanOrder = scanAndRecord.mock.invocationCallOrder[0];
    const uploadOrder = uploadBuffer.mock.invocationCallOrder[0];
    if (scanOrder === undefined || uploadOrder === undefined) {
      throw new Error('missing DLP or upload invocation');
    }
    expect(scanOrder).toBeLessThan(uploadOrder);
    expect(uploadBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId,
        originalFilename: 'attachment_.pdf',
        mimeType: 'application/pdf',
        sourceSystem: 'email_ingest',
        fields: expect.objectContaining({
          title: 'attachment_.pdf',
          documentType: 'correspondence',
        }),
      }),
    );
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO email_document_links')),
    ).toBe(true);
    expect(JSON.stringify(query.mock.calls)).not.toContain('raw email body');
  });

  it('fails closed before document upload when attachment DLP scan fails', async () => {
    const { query, scanAndRecord, service, uploadBuffer } = createService();
    scanAndRecord.mockRejectedValueOnce(new Error('dlp unavailable'));

    await expect(
      service.importRawEmail({
        tenantId,
        actorUserId,
        matterId: '11111111-1111-4111-8111-1111111111a0',
        originalFilename: 'with-attachment.eml',
        body: Buffer.from(
          [
            'Message-ID: <case-attachment-fail@example.test>',
            'Content-Type: multipart/mixed; boundary="amic-boundary"',
            '',
            '--amic-boundary',
            'Content-Type: text/plain',
            '',
            'raw email body',
            '--amic-boundary',
            'Content-Type: text/plain; name="notes.txt"',
            'Content-Disposition: attachment; filename="notes.txt"',
            '',
            'attachment with person@example.test',
            '--amic-boundary--',
            '',
          ].join('\r\n'),
        ),
      }),
    ).rejects.toThrow('dlp unavailable');

    expect(uploadBuffer).not.toHaveBeenCalled();
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO email_document_links')),
    ).toBe(false);
  });

  it('returns only permission-allowed email document links', async () => {
    const { canReadDocument, service } = createService();

    const links = await service.listDocumentLinksForEmail(actorUserId, existingEmailId);

    expect(canReadDocument).toHaveBeenCalledWith(
      { tenantId, userId: actorUserId },
      '11111111-1111-4111-8111-1111111111d0',
    );
    expect(links).toEqual([
      expect.objectContaining({
        emailId: existingEmailId,
        attachmentFilename: 'linked.pdf',
        mediaType: 'application/pdf',
      }),
    ]);
  });

  it('returns document email links only after document read permission allows', async () => {
    const { canReadDocument, service } = createService();

    const links = await service.listEmailLinksForDocument(
      actorUserId,
      '11111111-1111-4111-8111-1111111111d0',
    );

    expect(canReadDocument).toHaveBeenCalledWith(
      { tenantId, userId: actorUserId },
      '11111111-1111-4111-8111-1111111111d0',
    );
    expect(links).toEqual([
      expect.objectContaining({
        emailId: existingEmailId,
        documentId: '11111111-1111-4111-8111-1111111111d0',
      }),
    ]);
  });

  it('fails closed for document email links when permission denies', async () => {
    const { service } = createService(undefined, 'DENY');

    await expect(
      service.listEmailLinksForDocument(actorUserId, '11111111-1111-4111-8111-1111111111d0'),
    ).rejects.toMatchObject({
      response: { code: 'PERMISSION_DENIED' },
    });
  });

  it('files an email to a matter through upload permission and records reference-only audit', async () => {
    const { auditLog, canUploadToMatter, query, service } = createService();

    const filed = await service.fileEmailToMatter(actorUserId, existingEmailId, {
      matterId: '11111111-1111-4111-8111-1111111111a0',
    });

    expect(canUploadToMatter).toHaveBeenCalledWith(
      { tenantId, userId: actorUserId },
      '11111111-1111-4111-8111-1111111111a0',
    );
    expect(query.mock.calls.some(([sql]) => String(sql).includes('email_matter_filings'))).toBe(
      true,
    );
    expect(filed).toMatchObject({
      emailId: existingEmailId,
      documentIds: ['11111111-1111-4111-8111-1111111111d0'],
      participantClasses: [
        { class: 'internal', count: 1 },
        { class: 'client', count: 1 },
      ],
      privilegeTagSuggestion: {
        tag: 'attorney_client_privilege',
        reasonCodes: ['subject_keyword'],
        requiresUserConfirmation: true,
      },
      thread: {
        threadId: '11111111-1111-4111-8111-1111111111c2',
        rootMessageHash: 'a'.repeat(64),
        conversationIdHash: null,
        directReferenceCount: 2,
        relatedEmailCount: 2,
      },
      warningCodes: [],
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EMAIL_FILED',
        targetType: 'email',
        targetId: existingEmailId,
        metadata: expect.objectContaining({
          scope_type: 'email_filing',
          scope_id: existingEmailId,
          result_count: 1,
        }),
      }),
      expect.anything(),
    );
    expect(JSON.stringify(auditLog.mock.calls)).not.toContain('Privileged filed subject');
    expect(JSON.stringify(auditLog.mock.calls)).not.toContain('person@example.test');
  });

  it('auto-files high-confidence matter suggestions and records feedback plus notification evidence', async () => {
    const { auditLog, canUploadToMatter, query, service } = createService();

    const response = await service.suggestMattersForEmail(actorUserId, existingEmailId, {
      limit: 5,
    });

    expect(response.items).toEqual([
      expect.objectContaining({
        matterId: '11111111-1111-4111-8111-1111111111a0',
        reasonCodes: ['thread'],
        confidenceBand: 'auto_file',
      }),
    ]);
    expect(canUploadToMatter).toHaveBeenCalledWith(
      { tenantId, userId: actorUserId },
      '11111111-1111-4111-8111-1111111111a0',
    );
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO email_matter_filings')),
    ).toBe(true);
    expect(
      query.mock.calls.some(([sql, params]) => {
        const values = params as readonly unknown[] | undefined;
        return (
          String(sql).includes('INSERT INTO email_suggestion_feedback') &&
          values?.[4] === 'accepted' &&
          values?.[5] === 'auto_file'
        );
      }),
    ).toBe(true);
    expect(
      query.mock.calls.some(
        ([sql]) =>
          String(sql).includes('INSERT INTO notifications') &&
          String(sql).includes('email_autofile_completed'),
      ),
    ).toBe(true);
    expect(auditLog.mock.calls.map(([event]) => (event as { action?: string }).action)).toEqual(
      expect.arrayContaining([
        'EMAIL_FILED',
        'EMAIL_SUGGESTION_AUTOFILED',
        'EMAIL_SUGGESTION_FEEDBACK_RECORDED',
      ]),
    );
    expect(JSON.stringify(auditLog.mock.calls)).not.toContain('Privileged filed subject');
  });

  it('undoes an auto-filed suggestion with revert and feedback audits', async () => {
    const { auditLog, query, service } = createService();

    const timeline = await service.undoEmailAutofile(actorUserId, existingEmailId, {
      matterId: '11111111-1111-4111-8111-1111111111a0',
    });

    expect(timeline.items).toEqual([expect.objectContaining({ emailId: existingEmailId })]);
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM email_matter_filings')),
    ).toBe(true);
    expect(
      query.mock.calls.some(([sql, params]) => {
        const values = params as readonly unknown[] | undefined;
        return (
          String(sql).includes('INSERT INTO email_suggestion_feedback') &&
          values?.[4] === 'undone'
        );
      }),
    ).toBe(true);
    expect(auditLog.mock.calls.map(([event]) => (event as { action?: string }).action)).toEqual(
      expect.arrayContaining(['EMAIL_FILING_REVERTED', 'EMAIL_SUGGESTION_FEEDBACK_RECORDED']),
    );
  });

  it('returns matter email timeline rows grouped by stored thread', async () => {
    const { service } = createService();

    const timeline = await service.listMatterEmailTimeline(
      actorUserId,
      '11111111-1111-4111-8111-1111111111a0',
    );

    expect(timeline.items).toHaveLength(1);
    expect(timeline.threads).toEqual([
      expect.objectContaining({
        threadId: '11111111-1111-4111-8111-1111111111c2',
        rootMessageHash: 'a'.repeat(64),
        relatedEmailCount: 3,
        filedEmailCount: 1,
        documentIds: ['11111111-1111-4111-8111-1111111111d0'],
        items: [expect.objectContaining({ emailId: existingEmailId })],
      }),
    ]);
  });

  it('creates a searchable email body document when a parsed EML is filed', async () => {
    const {
      createDraft,
      createInitialVersion,
      fileObjectCreate,
      service,
      storageService,
      upsertVersion,
    } = createService(undefined, 'ALLOW', { emailBodySearch: 'enabled' });

    await service.fileEmailToMatter(actorUserId, existingEmailId, {
      matterId: '11111111-1111-4111-8111-1111111111a0',
    });

    expect(storageService.getByStorageUri).toHaveBeenCalled();
    expect(storageService.putTenantObject).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        matterId: '11111111-1111-4111-8111-1111111111a0',
        contentType: 'text/plain',
      }),
    );
    expect(createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        documentType: 'email',
        subtype: 'email_body',
        aiAllowed: false,
        title: 'Email: Searchable Korean body',
      }),
      expect.anything(),
    );
    expect(fileObjectCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceSystem: 'email_ingest',
        mimeType: 'text/plain',
        originalFilename: `email-body-${existingEmailId}.txt`,
      }),
      expect.anything(),
    );
    expect(createInitialVersion).toHaveBeenCalled();
    expect(upsertVersion).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tenantId,
        versionId: '11111111-1111-4111-8111-1111111111v0',
      }),
    );
    expect(JSON.stringify(fileObjectCreate.mock.calls)).not.toContain('d8 unique searchable');
  });

  it('blocks same-tenant duplicate Message-ID and records a denied audit event', async () => {
    const { auditLog, service, storageService } = createService([[{ email_id: existingEmailId }]]);

    await expect(
      service.importRawEmail({
        tenantId,
        actorUserId,
        originalFilename: 'duplicate.eml',
        body: Buffer.from('Message-ID: <dupe@example.test>\r\n\r\nbody'),
      }),
    ).rejects.toThrow(EmailDuplicateMessageError);

    expect(storageService.putEmailRawObject).not.toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EMAIL_DUPLICATE_BLOCKED',
        targetId: existingEmailId,
        result: 'denied',
        metadata: expect.objectContaining({
          hash: expect.stringMatching(/^[0-9a-f]{64}$/),
          reason_code: 'DUPLICATE_MESSAGE_ID',
        }),
      }),
      expect.anything(),
    );
    expect(JSON.stringify(auditLog.mock.calls)).not.toContain('dupe@example.test');
  });
});
