import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import type {
  StorageAdapter,
  StorageGetObjectResult,
  StorageObjectMetadata,
  StoragePutObjectInput,
} from './storage-adapter.interface';
import { StorageObjectAlreadyExistsError } from './storage-adapter.interface';
import { NoopEncryptionHook } from './noop-encryption.hook';
import { StorageService } from './storage.service';
import { StoragePathResolver } from './storage-path.resolver';

const tenantId = '11111111-1111-4111-8111-111111111111';
const matterId = '11111111-1111-4111-8111-111111111122';
const documentId = '11111111-1111-4111-8111-111111111133';
const fileObjectId = '11111111-1111-4111-8111-111111111144';

class MemoryStorageAdapter implements StorageAdapter {
  private readonly objects = new Map<string, { body: Buffer; contentType: string }>();

  async putIfAbsent(input: StoragePutObjectInput): Promise<void> {
    if (this.objects.has(input.key)) throw new StorageObjectAlreadyExistsError(input.key);
    this.objects.set(input.key, {
      body: Buffer.isBuffer(input.body) ? input.body : Buffer.from([]),
      contentType: input.contentType,
    });
  }

  async get(key: string): Promise<StorageGetObjectResult> {
    const found = this.objects.get(key);
    if (!found) throw new Error('missing object');
    return {
      key,
      contentLength: found.body.length,
      contentType: found.contentType,
      etag: '"local"',
      body: Readable.from(found.body),
    };
  }

  async head(key: string): Promise<StorageObjectMetadata | null> {
    const found = this.objects.get(key);
    return found
      ? { key, contentLength: found.body.length, contentType: found.contentType, etag: '"local"' }
      : null;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

describe('StorageService', () => {
  it('creates tenant-prefixed object keys through the resolver', async () => {
    const service = new StorageService(
      new MemoryStorageAdapter(),
      new StoragePathResolver('vault-dev'),
      new NoopEncryptionHook(),
    );

    const result = await service.putTenantObject({
      tenantId,
      matterId,
      documentId,
      fileObjectId,
      body: Buffer.from('contract'),
      contentLength: 8,
      contentType: 'application/pdf',
    });

    expect(result).toEqual({
      key: `tenants/${tenantId}/matters/${matterId}/documents/${documentId}/${fileObjectId}`,
      storageUri: `s3://vault-dev/tenants/${tenantId}/matters/${matterId}/documents/${documentId}/${fileObjectId}`,
      encryptionKeyId: null,
    });
    await expect(service.headByStorageUri(tenantId, result.storageUri)).resolves.toMatchObject({
      contentLength: 8,
    });
  });

  it('rejects cross-tenant storage URI access before adapter calls', async () => {
    const service = new StorageService(
      new MemoryStorageAdapter(),
      new StoragePathResolver('vault-dev'),
      new NoopEncryptionHook(),
    );
    const storageUri = `s3://vault-dev/tenants/${tenantId}/matters/${matterId}/documents/${documentId}/${fileObjectId}`;

    await expect(
      service.deleteByStorageUri('22222222-2222-4222-8222-222222222222', storageUri),
    ).rejects.toMatchObject({
      response: { code: 'TENANT_ISOLATION_VIOLATION' },
    });
  });

  it('recomputes object SHA-256 from the stored tenant object stream', async () => {
    const service = new StorageService(
      new MemoryStorageAdapter(),
      new StoragePathResolver('vault-dev'),
      new NoopEncryptionHook(),
    );
    const result = await service.putTenantObject({
      tenantId,
      matterId,
      documentId,
      fileObjectId,
      body: Buffer.from('contract'),
      contentLength: 8,
      contentType: 'application/pdf',
    });

    await expect(service.sha256ByStorageUri(tenantId, result.storageUri)).resolves.toBe(
      'cc8321d6375c494d043fdd0260f21bc0ec51dacc9f6abb7f909cdcd3041b78bf',
    );
  });
});
