import { describe, expect, it, vi } from 'vitest';
import type { AuditService, QueryClient } from '../audit/audit.service';
import type { FileObjectService } from '../storage/file-object.service';
import type { StorageService } from '../storage/storage.service';
import type { TenantContextService } from '../tenant/tenant-context';
import { EmailDuplicateMessageError, EmailService } from './email.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '11111111-1111-4111-8111-111111111101';
const existingEmailId = '11111111-1111-4111-8111-1111111111ee';

function createService(selectRows: unknown[][] = [[], []]) {
  const query = vi.fn(async (sql: string, params?: readonly unknown[]) => {
    if (sql.includes('SELECT email_id')) {
      const rows = selectRows.shift() ?? [];
      return { rows, rowCount: rows.length };
    }
    if (sql.includes('INSERT INTO email_messages')) {
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
            raw_sha256: params?.[7],
            raw_size_bytes: String(params?.[8]),
            created_by: params?.[9],
            created_at: new Date('2026-06-12T00:00:00.000Z'),
          },
        ],
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

  return {
    auditLog,
    client,
    fileObjectCreate,
    query,
    service: new EmailService(auditService, fileObjectService, storageService, tenantContext),
    storageService,
  };
}

describe('EmailService', () => {
  it('imports a parsed EML using raw storage and reference-only audit metadata', async () => {
    const { auditLog, fileObjectCreate, service, storageService } = createService();
    const result = await service.importRawEmail({
      tenantId,
      actorUserId,
      originalFilename: 'fixture.eml',
      body: Buffer.from(
        [
          'From: Sender <sender@example.test>',
          'Message-ID: <case-001@example.test>',
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
    expect(JSON.stringify(auditLog.mock.calls)).not.toContain('case-001@example.test');
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
