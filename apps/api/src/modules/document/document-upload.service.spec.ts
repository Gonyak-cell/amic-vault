import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { allowPermission, denyPermission } from '@amic-vault/shared';
import { DocumentUploadService, type UploadedDiskFile } from './document-upload.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '11111111-1111-4111-8111-111111111101';
const matterId = '11111111-1111-4111-8111-111111111122';

async function tempUploadFile(name: string, content = '%PDF-1.7 content'): Promise<UploadedDiskFile> {
  const dir = await mkdtemp(join(tmpdir(), 'amic-vault-upload-test-'));
  const path = join(dir, name);
  await writeFile(path, content);
  return {
    path,
    originalname: name,
    mimetype: 'application/pdf',
    size: Buffer.byteLength(content),
  };
}

async function drainBody(body: Buffer | Readable): Promise<void> {
  if (Buffer.isBuffer(body)) return;
  let bytes = 0;
  for await (const chunk of body) {
    bytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk));
    // Consume the test stream so the service can safely unlink the temp file.
  }
  expect(bytes).toBeGreaterThanOrEqual(0);
}

function createService(options: { permission?: 'allow' | 'deny' | 'wall' } = {}) {
  const permission =
    options.permission === 'deny'
      ? denyPermission('PERMISSION_DENIED')
      : options.permission === 'wall'
        ? denyPermission('ETHICAL_WALL_BLOCKED')
        : allowPermission();
  const transaction = vi.fn(async (_tenantId: string, run: (tx: never) => Promise<void>) =>
    run({} as never),
  );
  const createDraft = vi.fn(async () => ({
    documentId: 'generated-document-id',
    tenantId,
    matterId,
    documentFamilyId: 'generated-document-id',
    title: 'Contract',
    status: 'draft' as const,
    createdBy: actorUserId,
    createdAt: new Date().toISOString(),
  }));
  const createFileObject = vi.fn(async () => ({
    fileObjectId: 'generated-file-object-id',
    tenantId,
    storageUri: `s3://vault-dev/tenants/${tenantId}/matters/${matterId}/documents/generated-document-id/generated-file-object-id`,
    originalFilename: 'Contract.pdf',
    normalizedFilename: 'Contract.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 7,
    sha256: 'd'.repeat(64),
    encryptionKeyId: null,
    sourceSystem: 'upload' as const,
    createdBy: actorUserId,
    createdAt: new Date().toISOString(),
  }));
  const putTenantObject = vi.fn(
    async (input: { fileObjectId: string; documentId: string; body: Buffer | Readable }) => {
      await drainBody(input.body);
      return {
        key: `tenants/${tenantId}/matters/${matterId}/documents/${input.documentId}/${input.fileObjectId}`,
        storageUri: `s3://vault-dev/tenants/${tenantId}/matters/${matterId}/documents/${input.documentId}/${input.fileObjectId}`,
        encryptionKeyId: null,
      };
    },
  );
  const service = new DocumentUploadService(
    { transaction } as never,
    { createDraft } as never,
    { findCandidates: vi.fn(async () => []) } as never,
    { create: createFileObject } as never,
    { canUploadToMatter: vi.fn(async () => permission) } as never,
    { putTenantObject, deleteByStorageUri: vi.fn(async () => undefined) } as never,
    { require: () => ({ tenantId, slug: 'tenant-alpha', status: 'active', source: 'session' }) } as never,
  );
  return { createDraft, createFileObject, putTenantObject, service };
}

describe('DocumentUploadService', () => {
  it('creates storage object, document row, and file object row for allowed members', async () => {
    const file = await tempUploadFile('Contract.PDF');
    const { createDraft, createFileObject, putTenantObject, service } = createService();

    const response = await service.upload({
      actorUserId,
      matterId,
      fields: {},
      file,
    });

    expect(response.status).toBe('draft');
    expect(response.title).toBe('Contract');
    expect(response.duplicates).toEqual([]);
    expect(putTenantObject).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId, matterId, contentType: 'application/pdf' }),
    );
    expect(createDraft).toHaveBeenCalledOnce();
    expect(createFileObject).toHaveBeenCalledWith(
      expect.objectContaining({
        mimeType: 'application/pdf',
        sha256: 'd274f10f823f4da5c383bedc6bf03b4aed26b05f8306cf082b8402ae78a456a5',
      }),
      expect.anything(),
    );
  });

  it('fails closed before storage when upload permission denies', async () => {
    const file = await tempUploadFile('Contract.pdf');
    const { putTenantObject, service } = createService({ permission: 'deny' });

    await expect(
      service.upload({ actorUserId, matterId, fields: {}, file }),
    ).rejects.toMatchObject({
      response: { code: 'PERMISSION_DENIED' },
    });
    expect(putTenantObject).not.toHaveBeenCalled();
  });

  it('preserves ethical wall error codes without disclosing document details', async () => {
    const file = await tempUploadFile('Contract.pdf');
    const { service } = createService({ permission: 'wall' });

    await expect(
      service.upload({ actorUserId, matterId, fields: {}, file }),
    ).rejects.toMatchObject({
      response: { code: 'ETHICAL_WALL_BLOCKED' },
    });
  });
});
