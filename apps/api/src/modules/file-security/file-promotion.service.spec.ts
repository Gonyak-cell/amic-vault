import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { FilePromotionService } from './file-promotion.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const quarantineRef = '22222222-2222-4222-8222-222222222222';
const scanId = '33333333-3333-4333-8333-333333333333';
const matterId = '44444444-4444-4444-8444-444444444444';
const actorUserId = '55555555-5555-4555-8555-555555555555';
const expectedSha256 = '8b3369944dd2a3fab39e32d1aeb1f763946a458ae3e6368a46432adc8f3a0860';

function row(overrides: Record<string, unknown> = {}) {
  return {
    scan_id: scanId,
    tenant_id: tenantId,
    matter_id: matterId,
    quarantine_storage_uri: `s3://amic-vault-dev/tenants/${tenantId}/quarantine/${quarantineRef}`,
    expected_sha256: expectedSha256,
    observed_sha256: expectedSha256,
    size_bytes: '4',
    state: 'clean',
    result_code: 'clean',
    signature_at: new Date(),
    original_filename: 'contract.pdf',
    normalized_filename: 'contract.pdf',
    mime_type: 'application/pdf',
    source_system: 'upload',
    created_by: actorUserId,
    fields_json: {},
    slug: 'tenant-alpha',
    tenant_status: 'active',
    document_id: null,
    version_id: null,
    file_object_id: null,
    ...overrides,
  };
}

function createService(sourceRow = row()) {
  const lookupQuery = vi.fn(async () => ({ rows: [sourceRow] }));
  const database = {
    tenantTransaction: vi.fn(async (_tenant: string, work: (client: { query: typeof lookupQuery }) => Promise<unknown>) => work({ query: lookupQuery })),
  };
  const promotionQuery = vi.fn(async (sql: string) => {
    if (sql.includes('SELECT state, result_code')) {
      return { rows: [{ state: 'clean', result_code: 'clean', expected_sha256: expectedSha256, observed_sha256: expectedSha256, signature_at: new Date() }], rowCount: 1 };
    }
    if (sql.includes('SELECT storage_uri')) return { rows: [{ storage_uri: `s3://amic-vault-dev/tenants/${tenantId}/matters/${matterId}/documents/a/files/b` }], rowCount: 1 };
    if (sql.includes('UPDATE file_security_scans')) return { rows: [], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  });
  const audit = { log: vi.fn().mockResolvedValue({}) };
  const storage = {
    getByStorageUri: vi.fn().mockResolvedValue({ body: Readable.from([Buffer.from('safe')]) }),
    sha256ByStorageUri: vi.fn().mockResolvedValue(expectedSha256),
  };
  const upload = vi.fn(async (input: { afterUploadAudit?: (tx: { query: typeof promotionQuery }, uploaded: { documentId: string; versionId: string; fileObjectId: string; sha256: string }) => Promise<void> }) => {
    await input.afterUploadAudit?.(
      { query: promotionQuery },
      {
        documentId: '66666666-6666-4666-8666-666666666666',
        versionId: '77777777-7777-4777-8777-777777777777',
        fileObjectId: '88888888-8888-4888-8888-888888888888',
        sha256: expectedSha256,
      },
    );
    return { documentId: '66666666-6666-4666-8666-666666666666', fileObjectId: '88888888-8888-4888-8888-888888888888' };
  });
  const service = new FilePromotionService(
    audit as never,
    database as never,
    { upload } as never,
    storage as never,
    { run: (_context: unknown, callback: () => unknown) => callback() } as never,
  );
  return { audit, lookupQuery, promotionQuery, service, storage, upload };
}

describe('FilePromotionService', () => {
  it('finalizes only a fresh clean hash-equal scan and records promotion in the document audit transaction', async () => {
    const { audit, promotionQuery, service, storage, upload } = createService();

    await expect(service.promote({ tenantId, quarantineRef, expectedSha256 })).resolves.toEqual({
      documentId: '66666666-6666-4666-8666-666666666666',
      versionId: '77777777-7777-4777-8777-777777777777',
      fileObjectId: '88888888-8888-4888-8888-888888888888',
      promoted: true,
    });

    expect(upload).toHaveBeenCalledWith(expect.objectContaining({ actorUserId, matterId, sourceSystem: 'upload' }));
    expect(storage.getByStorageUri).toHaveBeenCalledWith(tenantId, expect.stringContaining(`/quarantine/${quarantineRef}`));
    expect(storage.sha256ByStorageUri).toHaveBeenCalledWith(tenantId, expect.stringContaining(`/documents/`));
    expect(promotionQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO file_security_promotions'), expect.any(Array));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'FILE_PROMOTED', metadata: { hash: expectedSha256 } }), expect.anything());
  });

  it('fails closed when the immutable promotion input receipt is missing', async () => {
    const { service, storage, upload } = createService(row({ original_filename: null }));

    await expect(service.promote({ tenantId, quarantineRef, expectedSha256 })).rejects.toThrow('FILE_SECURITY_PROMOTION_INPUT_MISSING');
    expect(storage.getByStorageUri).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('fails closed for an expired scanner signature before reading quarantine bytes', async () => {
    const { service, storage, upload } = createService(row({ signature_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) }));

    await expect(service.promote({ tenantId, quarantineRef, expectedSha256 })).rejects.toThrow('FILE_SECURITY_PROMOTION_DENIED');
    expect(storage.getByStorageUri).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });
});
