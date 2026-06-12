import { describe, expect, it, vi } from 'vitest';
import type { AuditService, QueryClient } from '../audit/audit.service';
import type { DlpService } from '../dlp/dlp.service';
import type { DocumentUploadService } from '../document/document-upload.service';
import type { PermissionQueryBuilder } from '../permission/permission-query.builder';
import type { PermissionService } from '../permission/permission.service';
import type { FileObjectService } from '../storage/file-object.service';
import type { StorageService } from '../storage/storage.service';
import type { TenantContextService } from '../tenant/tenant-context';
import type { UserService } from '../user/user.service';
import { EmailDuplicateMessageError, EmailService } from './email.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '11111111-1111-4111-8111-111111111101';
const existingEmailId = '11111111-1111-4111-8111-1111111111ee';

function createService(
  selectRows: unknown[][] = [[], []],
  permissionEffect: 'ALLOW' | 'DENY' = 'ALLOW',
) {
  const query = vi.fn(async (sql: string, params?: readonly unknown[]) => {
    if (/SELECT\s+email_id\s+FROM email_messages\s+WHERE/u.test(sql)) {
      const rows = selectRows.shift() ?? [];
      return { rows, rowCount: rows.length };
    }
    if (/SELECT\s+1\s+FROM email_messages\s+WHERE/u.test(sql)) {
      return { rows: [{ '?column?': 1 }], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO email_messages')) {
      const referencesJson = typeof params?.[11] === 'string' ? JSON.parse(params[11]) : [];
      return {
        rowCount: 1,
        rows: [
          {
            email_id: params?.[0],
            tenant_id: params?.[1],
            raw_file_object_id: params?.[2],
            message_id_hash: params?.[3],
            parser: params?.[4],
            parse_status: params?.[5],
            failure_reason_code: params?.[6],
            subject: params?.[7],
            sent_at: params?.[8] ? new Date(String(params[8])) : null,
            received_at: params?.[9] ? new Date(String(params[9])) : null,
            metadata_warning_code: params?.[10],
            references_json: referencesJson,
            has_outside_participants: params?.[12],
            raw_sha256: params?.[13],
            raw_size_bytes: String(params?.[14]),
            created_by: params?.[15],
            created_at: new Date('2026-06-12T00:00:00.000Z'),
          },
        ],
      };
    }
    if (sql.includes('INSERT INTO email_participants')) {
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO email_document_links')) {
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO email_matter_filings')) {
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
  const auditLog = vi.fn(async () => ({
    eventId: '11111111-1111-4111-8111-1111111111aa',
    createdAt: new Date('2026-06-12T00:00:00.000Z'),
  }));
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

  return {
    auditLog,
    canUploadToMatter,
    canReadDocument,
    client,
    documentUploadService,
    fileObjectCreate,
    query,
    scanAndRecord,
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
    ),
    storageService,
    uploadBuffer,
  };
}

describe('EmailService', () => {
  it('imports a parsed EML using raw storage and reference-only audit metadata', async () => {
    const { auditLog, fileObjectCreate, service, storageService } = createService();
    const result = await service.importRawEmail({
      tenantId,
      actorUserId,
      originalFilename: 'fixture.eml',
      tenantDomains: ['amic.test'],
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
    expect(JSON.stringify(auditLog.mock.calls)).not.toContain('case-001@example.test');
    expect(JSON.stringify(auditLog.mock.calls)).not.toContain('outside@example.test');
    expect(JSON.stringify(auditLog.mock.calls)).not.toContain('raw body must not appear');
    expect(storageService.deleteByStorageUri).not.toHaveBeenCalled();
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

  it('accepts MSG as a pending unsupported skeleton without lossy parse claims', async () => {
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
      privilegeTagSuggestion: {
        tag: 'attorney_client_privilege',
        reasonCodes: ['subject_keyword'],
        requiresUserConfirmation: true,
      },
      thread: {
        rootMessageHash: 'a'.repeat(64),
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
