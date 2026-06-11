import { describe, expect, it } from 'vitest';
import { FileObjectService } from './file-object.service';

describe('FileObjectService', () => {
  it('inserts reference-only file object metadata', async () => {
    const queries: Array<{ sql: string; params: readonly unknown[] | undefined }> = [];
    const client = {
      async query(sql: string, params?: readonly unknown[]) {
        queries.push({ sql, params });
        return {
          rowCount: 1,
          rows: [
            {
              file_object_id: '11111111-1111-4111-8111-111111111144',
              tenant_id: '11111111-1111-4111-8111-111111111111',
              storage_uri:
                's3://vault-dev/tenants/11111111-1111-4111-8111-111111111111/matters/11111111-1111-4111-8111-111111111122/documents/11111111-1111-4111-8111-111111111133/11111111-1111-4111-8111-111111111144',
              original_filename: '계약.pdf',
              normalized_filename: '계약.pdf',
              mime_type: 'application/pdf',
              size_bytes: '12',
              sha256: 'a'.repeat(64),
              encryption_key_id: null,
              source_system: 'upload',
              created_by: '11111111-1111-4111-8111-111111111101',
              created_at: new Date('2026-06-12T00:00:00.000Z'),
            },
          ],
        };
      },
    };

    const service = new FileObjectService();
    await expect(
      service.create(
        {
          fileObjectId: '11111111-1111-4111-8111-111111111144',
          tenantId: '11111111-1111-4111-8111-111111111111',
          storageUri:
            's3://vault-dev/tenants/11111111-1111-4111-8111-111111111111/matters/11111111-1111-4111-8111-111111111122/documents/11111111-1111-4111-8111-111111111133/11111111-1111-4111-8111-111111111144',
          originalFilename: '계약.pdf',
          normalizedFilename: '계약.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 12,
          sha256: 'a'.repeat(64),
          encryptionKeyId: null,
          createdBy: '11111111-1111-4111-8111-111111111101',
        },
        client,
      ),
    ).resolves.toMatchObject({
      fileObjectId: '11111111-1111-4111-8111-111111111144',
      normalizedFilename: '계약.pdf',
      sizeBytes: 12,
      sha256: 'a'.repeat(64),
    });
    expect(queries[0]?.params).not.toContain('file body');
  });
});
