import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { afterAll, describe, expect, it } from 'vitest';
import { NoopEncryptionHook } from '../../apps/api/src/modules/storage/noop-encryption.hook';
import { S3StorageAdapter } from '../../apps/api/src/modules/storage/s3-storage.adapter';
import { StorageService } from '../../apps/api/src/modules/storage/storage.service';
import { StoragePathResolver } from '../../apps/api/src/modules/storage/storage-path.resolver';
import { tenantAlphaId, tenantBetaId } from './helpers/db';

const matterId = '11111111-1111-4111-8111-111111111122';

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks);
}

function createStorageService(): StorageService {
  return new StorageService(
    S3StorageAdapter.fromEnv(),
    new StoragePathResolver(),
    new NoopEncryptionHook(),
  );
}

describe('storage tenant integration', () => {
  const createdUris: string[] = [];

  afterAll(async () => {
    const service = createStorageService();
    for (const uri of createdUris) {
      await service.deleteByStorageUri(tenantAlphaId, uri);
    }
  });

  it('puts, heads, and gets tenant-prefixed MinIO objects without public URLs', async () => {
    const service = createStorageService();
    const documentId = randomUUID();
    const fileObjectId = randomUUID();
    const body = Buffer.from(`vault-object-${randomUUID()}`);

    const stored = await service.putTenantObject({
      tenantId: tenantAlphaId,
      matterId,
      documentId,
      fileObjectId,
      body,
      contentLength: body.length,
      contentType: 'application/pdf',
    });
    createdUris.push(stored.storageUri);

    expect(stored.key).toBe(`tenants/${tenantAlphaId}/matters/${matterId}/documents/${documentId}/${fileObjectId}`);
    expect(stored.storageUri).toBe(`s3://amic-vault-dev/${stored.key}`);

    await expect(service.headByStorageUri(tenantAlphaId, stored.storageUri)).resolves.toMatchObject({
      contentLength: body.length,
      contentType: 'application/pdf',
    });

    const object = await service.getByStorageUri(tenantAlphaId, stored.storageUri);
    await expect(readAll(object.body)).resolves.toEqual(body);
  });

  it('fails closed for duplicate puts and cross-tenant storage URI reads', async () => {
    const service = createStorageService();
    const documentId = randomUUID();
    const fileObjectId = randomUUID();
    const first = await service.putTenantObject({
      tenantId: tenantAlphaId,
      matterId,
      documentId,
      fileObjectId,
      body: Buffer.from('first'),
      contentLength: 5,
      contentType: 'application/pdf',
    });
    createdUris.push(first.storageUri);

    await expect(
      service.putTenantObject({
        tenantId: tenantAlphaId,
        matterId,
        documentId,
        fileObjectId,
        body: Buffer.from('second'),
        contentLength: 6,
        contentType: 'application/pdf',
      }),
    ).rejects.toThrow(/already exists/);

    await expect(service.headByStorageUri(tenantBetaId, first.storageUri)).rejects.toMatchObject({
      response: { code: 'TENANT_ISOLATION_VIOLATION' },
    });
  });
});
