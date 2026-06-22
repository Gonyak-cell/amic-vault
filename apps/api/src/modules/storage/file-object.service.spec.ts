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

  it('accepts document_edit source system for internal subversion saves', async () => {
    const queries: Array<{ sql: string; params: readonly unknown[] | undefined }> = [];
    const client = {
      async query(sql: string, params?: readonly unknown[]) {
        queries.push({ sql, params });
        return {
          rowCount: 1,
          rows: [
            {
              file_object_id: '11111111-1111-4111-8111-111111111155',
              tenant_id: '11111111-1111-4111-8111-111111111111',
              storage_uri:
                's3://vault-dev/tenants/11111111-1111-4111-8111-111111111111/matters/11111111-1111-4111-8111-111111111122/documents/11111111-1111-4111-8111-111111111133/11111111-1111-4111-8111-111111111155',
              original_filename: 'edit-save.docx',
              normalized_filename: 'edit-save.docx',
              mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              size_bytes: '42',
              sha256: 'b'.repeat(64),
              encryption_key_id: null,
              source_system: 'document_edit',
              created_by: '11111111-1111-4111-8111-111111111101',
              created_at: new Date('2026-06-22T00:00:00.000Z'),
            },
          ],
        };
      },
    };

    const service = new FileObjectService();
    await expect(
      service.create(
        {
          fileObjectId: '11111111-1111-4111-8111-111111111155',
          tenantId: '11111111-1111-4111-8111-111111111111',
          storageUri:
            's3://vault-dev/tenants/11111111-1111-4111-8111-111111111111/matters/11111111-1111-4111-8111-111111111122/documents/11111111-1111-4111-8111-111111111133/11111111-1111-4111-8111-111111111155',
          originalFilename: 'edit-save.docx',
          normalizedFilename: 'edit-save.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          sizeBytes: 42,
          sha256: 'b'.repeat(64),
          encryptionKeyId: null,
          sourceSystem: 'document_edit',
          createdBy: '11111111-1111-4111-8111-111111111101',
        },
        client,
      ),
    ).resolves.toMatchObject({
      fileObjectId: '11111111-1111-4111-8111-111111111155',
      sourceSystem: 'document_edit',
      sizeBytes: 42,
      sha256: 'b'.repeat(64),
    });
    expect(queries[0]?.params?.[9]).toBe('document_edit');
  });
});
