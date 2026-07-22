import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { AuditService, QueryClient } from '../audit/audit.service';
import type { StorageService } from '../storage/storage.service';
import { EmailReparseService } from './email-reparse.service';
import type { EmailWorkerParserClient } from './email-worker-parser.client';

const tenantId = '11111111-1111-4111-8111-111111111111';
const emailId = '11111111-1111-4111-8111-1111111111e0';
const rawFileObjectId = '11111111-1111-4111-8111-1111111111f0';
const matterId = '11111111-1111-4111-8111-1111111111a0';
const messageIdHash = 'a'.repeat(64);
const rawSha256 = 'b'.repeat(64);
const storageUri = `s3://vault-dev/tenants/${tenantId}/emails/${emailId}/raw/${rawFileObjectId}`;

function createService() {
  const query = vi.fn(async (sql: string, params?: readonly unknown[]) => {
    void params;
    if (sql.includes('f.storage_uri')) {
      return {
        rows: [
          {
            email_id: emailId,
            tenant_id: tenantId,
            raw_file_object_id: rawFileObjectId,
            message_id_hash: messageIdHash,
            parser_version: 'email-api-legacy-v1',
            raw_sha256: rawSha256,
            storage_uri: storageUri,
            normalized_filename: 'legacy.eml',
            mime_type: 'message/rfc822',
            matter_id: matterId,
          },
        ],
        rowCount: 1,
      };
    }
    if (sql.includes('FROM tenant_email_domains')) {
      return { rows: [{ domain_ref: 'amic.test' }], rowCount: 1 };
    }
    if (sql.includes("nullif(lower(c.metadata_json->>'domain'")) {
      return { rows: [{ client_domain: 'client.example', matter_domain: null }], rowCount: 1 };
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
    return { rows: [], rowCount: 1 };
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
  const storageService = {
    getByStorageUri: vi.fn(async () => ({
      key: 'raw-key',
      contentLength: 128,
      contentType: 'message/rfc822',
      etag: null,
      body: Readable.from(['Message-ID: <legacy@example.test>\r\n\r\nbody']),
    })),
  } as unknown as StorageService;
  const parseRawEmail = vi.fn(async () => ({
    parser: 'eml' as const,
    parserVersion: 'email-worker-v1',
    parseStatus: 'parsed' as const,
    failureReasonCode: null,
    normalizedMessageId: 'legacy@example.test',
    subject: '복구된 제목',
    sentAt: '2026-06-12T01:15:30.000Z',
    receivedAt: null,
    metadataWarningCode: null,
    references: ['thread@example.test'],
    participants: [
      {
        role: 'from' as const,
        normalizedAddress: 'sender@client.example',
        domainRef: 'client.example',
        displayName: 'Sender',
      },
      {
        role: 'to' as const,
        normalizedAddress: 'internal@amic.test',
        domainRef: 'amic.test',
        displayName: 'Internal',
      },
      {
        role: 'cc' as const,
        normalizedAddress: 'lawyer@opposing.example',
        domainRef: 'opposing.example',
        displayName: 'Opposing Counsel',
      },
    ],
  }));
  const parserClient = { parseRawEmail } as unknown as EmailWorkerParserClient;
  const queueRegistry = {
    register: vi.fn(),
    producer: vi.fn(),
    consumer: vi.fn(),
  };
  const service = new EmailReparseService(auditService, storageService, parserClient, queueRegistry as never);
  return { auditLog, parseRawEmail, query, service, storageService };
}

describe('EmailReparseService', () => {
  it('reparses worker metadata without changing message hash or email document links', async () => {
    const { auditLog, parseRawEmail, query, service, storageService } = createService();

    await expect(service.reparseEmail({ tenantId, emailId })).resolves.toMatchObject({
      status: 'reparsed',
      parserVersionBefore: 'email-api-legacy-v1',
      parserVersionAfter: 'email-worker-v1',
    });

    expect(storageService.getByStorageUri).toHaveBeenCalledWith(tenantId, storageUri);
    expect(parseRawEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        filename: 'legacy.eml',
        mimeType: 'message/rfc822',
        body: expect.any(Buffer),
      }),
    );
    const updateCall = query.mock.calls.find(([sql]) => String(sql).includes('UPDATE email_messages'));
    expect(updateCall).toBeDefined();
    const updateSql = String(updateCall?.[0] ?? '');
    expect(updateSql).not.toMatch(/SET\s+message_id_hash/i);
    expect(updateSql).toContain('AND message_id_hash = $14');
    expect(updateCall?.[1]).toEqual(
      expect.arrayContaining([
        tenantId,
        emailId,
        'eml',
        'email-worker-v1',
        'parsed',
        null,
        '복구된 제목',
        rawFileObjectId,
        messageIdHash,
      ]),
    );
    expect(
      query.mock.calls.some(([sql]) => String(sql).toLowerCase().includes('email_document_links')),
    ).toBe(false);
    const participantInserts = query.mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO email_participants'),
    );
    expect(participantInserts.map(([, params]) => (params as readonly unknown[])[7])).toEqual(
      expect.arrayContaining(['client', 'internal']),
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'EMAIL_METADATA_UPDATED',
        metadata: expect.objectContaining({
          before_ref: 'parser_version:email-api-legacy-v1',
          after_ref: 'parser_version:email-worker-v1',
          result_count: 3,
        }),
      }),
      expect.anything(),
    );
    expect(JSON.stringify(auditLog.mock.calls)).not.toContain('sender@client.example');
  });
});
