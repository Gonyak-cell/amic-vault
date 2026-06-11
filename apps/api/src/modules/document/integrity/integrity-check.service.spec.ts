import { describe, expect, it, vi } from 'vitest';
import { IntegrityCheckService } from './integrity-check.service';

const input = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  actorUserId: '11111111-1111-4111-8111-111111111101',
  matterId: '11111111-1111-4111-8111-111111111122',
  documentId: '11111111-1111-4111-8111-111111111133',
  storageUri:
    's3://amic-vault-dev/tenants/11111111-1111-4111-8111-111111111111/matters/11111111-1111-4111-8111-111111111122/documents/11111111-1111-4111-8111-111111111133/11111111-1111-4111-8111-111111111144',
  expectedSha256: 'a'.repeat(64),
};

describe('IntegrityCheckService', () => {
  it('allows matching hashes without audit noise', async () => {
    const auditLog = vi.fn();
    const service = new IntegrityCheckService(
      { log: auditLog } as never,
      { recordDocumentIntegrityAlert: vi.fn() } as never,
      { sha256ByStorageUri: vi.fn(async () => input.expectedSha256) } as never,
    );

    await expect(service.assertObjectMatchesHash(input)).resolves.toBeUndefined();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('blocks mismatches and records reference-only alert metadata', async () => {
    const auditLog = vi.fn(async () => undefined);
    const metrics = { recordDocumentIntegrityAlert: vi.fn() };
    const service = new IntegrityCheckService(
      { log: auditLog } as never,
      metrics as never,
      { sha256ByStorageUri: vi.fn(async () => 'b'.repeat(64)) } as never,
    );

    await expect(service.assertObjectMatchesHash(input)).rejects.toMatchObject({
      response: { code: 'DOCUMENT_LOCKED' },
    });
    expect(metrics.recordDocumentIntegrityAlert).toHaveBeenCalledOnce();
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DOCUMENT_INTEGRITY_ALERT',
        result: 'failure',
        metadata: {
          document_id: input.documentId,
          matter_id: input.matterId,
          before_ref: `sha256:${input.expectedSha256}`,
          after_ref: `sha256:${'b'.repeat(64)}`,
          hash: input.expectedSha256,
        },
      }),
    );
    expect(JSON.stringify(auditLog.mock.calls)).not.toContain('fixture body');
  });
});
