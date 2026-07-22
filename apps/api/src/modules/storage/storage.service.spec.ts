import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import type {
  StorageAdapter,
  StorageCreateReadUrlInput,
  StorageGetRangeInput,
  StorageGetObjectResult,
  StorageObjectMetadata,
  StorageObjectVersion,
  StoragePutObjectInput,
  StorageReadUrlResult,
  StorageVersionedObjectMetadata,
  VersionedStorageAdapter,
} from './storage-adapter.interface';
import { StorageObjectAlreadyExistsError } from './storage-adapter.interface';
import { NoopEncryptionHook } from './noop-encryption.hook';
import { StorageService } from './storage.service';
import { StoragePathResolver } from './storage-path.resolver';

const tenantId = '11111111-1111-4111-8111-111111111111';
const matterId = '11111111-1111-4111-8111-111111111122';
const documentId = '11111111-1111-4111-8111-111111111133';
const fileObjectId = '11111111-1111-4111-8111-111111111144';
const emailId = '11111111-1111-4111-8111-111111111155';
const anchorDate = '2026-07-02';
const quarantineRef = '11111111-1111-4111-8111-111111111166';

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

  async getRange(input: StorageGetRangeInput): Promise<StorageGetObjectResult> {
    const found = this.objects.get(input.key);
    if (!found) throw new Error('missing object');
    const body = found.body.subarray(input.start, input.end + 1);
    return {
      key: input.key,
      contentLength: body.length,
      contentType: found.contentType,
      etag: '"local"',
      body: Readable.from(body),
    };
  }

  async createReadUrl(input: StorageCreateReadUrlInput): Promise<StorageReadUrlResult> {
    return {
      url: `https://storage.local/${input.key}?expires=${input.expiresInSeconds ?? 300}`,
      expiresAt: new Date(Date.now() + (input.expiresInSeconds ?? 300) * 1000),
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

class VersionedMemoryStorageAdapter extends MemoryStorageAdapter implements VersionedStorageAdapter {
  async listObjectVersions(key: string): Promise<readonly StorageVersionedObjectMetadata[]> {
    return [
      {
        key,
        contentLength: 8,
        contentType: 'application/pdf',
        etag: null,
        version: {} as StorageObjectVersion,
        versionFingerprint: 'a'.repeat(64),
        isDeleteMarker: false,
        isLatest: true,
      },
    ];
  }

  async headObjectVersion(): Promise<StorageObjectMetadata | null> {
    return {
      key: 'opaque',
      contentLength: 8,
      contentType: 'application/pdf',
      etag: null,
      objectLock: { legalHold: false, retentionMode: null, retainUntil: null },
    };
  }

  async deleteObjectVersion(): Promise<void> {
    throw new Error('not used');
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

  it('stores raw email bytes under the tenant email prefix', async () => {
    const service = new StorageService(
      new MemoryStorageAdapter(),
      new StoragePathResolver('vault-dev'),
      new NoopEncryptionHook(),
    );

    const result = await service.putEmailRawObject({
      tenantId,
      emailId,
      fileObjectId,
      body: Buffer.from('raw email'),
      contentLength: 9,
      contentType: 'message/rfc822',
    });

    expect(result).toEqual({
      key: `tenants/${tenantId}/emails/${emailId}/raw/${fileObjectId}`,
      storageUri: `s3://vault-dev/tenants/${tenantId}/emails/${emailId}/raw/${fileObjectId}`,
      encryptionKeyId: null,
    });
    await expect(service.headByStorageUri(tenantId, result.storageUri)).resolves.toMatchObject({
      contentLength: 9,
    });
  });

  it('stores audit anchor receipts under the tenant audit anchor prefix', async () => {
    const service = new StorageService(
      new MemoryStorageAdapter(),
      new StoragePathResolver('vault-dev'),
      new NoopEncryptionHook(),
    );

    const result = await service.putAuditAnchorObject({
      tenantId,
      anchorDate,
      body: Buffer.from('{"anchorHash":"abc"}'),
      contentLength: 20,
      contentType: 'application/json',
    });

    expect(result).toEqual({
      key: `tenants/${tenantId}/audit-anchors/${anchorDate}.json`,
      storageUri: `s3://vault-dev/tenants/${tenantId}/audit-anchors/${anchorDate}.json`,
      encryptionKeyId: null,
    });
    await expect(service.headByStorageUri(tenantId, result.storageUri)).resolves.toMatchObject({
      contentLength: 20,
    });
  });

  it('stores quarantine bytes under a server-derived tenant quarantine prefix', async () => {
    const service = new StorageService(
      new MemoryStorageAdapter(),
      new StoragePathResolver('vault-dev'),
      new NoopEncryptionHook(),
    );

    const result = await service.putQuarantineObject({
      tenantId,
      quarantineRef,
      body: Buffer.from('unscanned'),
      contentLength: 9,
      contentType: 'application/pdf',
    });

    expect(result).toEqual({
      key: `tenants/${tenantId}/quarantine/${quarantineRef}`,
      storageUri: `s3://vault-dev/tenants/${tenantId}/quarantine/${quarantineRef}`,
      encryptionKeyId: null,
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

  it('returns only a tenant-validated latest version fingerprint', async () => {
    const adapter = new VersionedMemoryStorageAdapter();
    const service = new StorageService(adapter, new StoragePathResolver('vault-dev'), new NoopEncryptionHook());
    const storageUri = `s3://vault-dev/tenants/${tenantId}/matters/${matterId}/documents/${documentId}/${fileObjectId}`;

    await expect(service.latestVersionFingerprintByStorageUri(tenantId, storageUri)).resolves.toBe(
      'a'.repeat(64),
    );
    await expect(
      service.latestVersionFingerprintByStorageUri('22222222-2222-4222-8222-222222222222', storageUri),
    ).rejects.toMatchObject({ response: { code: 'TENANT_ISOLATION_VIOLATION' } });
  });

  it('keeps exact version handles opaque while exposing only HEAD and Object Lock facts', async () => {
    const adapter = new VersionedMemoryStorageAdapter();
    const service = new StorageService(adapter, new StoragePathResolver('vault-dev'), new NoopEncryptionHook());
    const storageUri = `s3://vault-dev/tenants/${tenantId}/matters/${matterId}/documents/${documentId}/${fileObjectId}`;

    const inspection = await service.inspectSealedVersionByStorageUri(
      tenantId,
      storageUri,
      'a'.repeat(64),
    );
    expect(JSON.stringify(inspection.version)).toBe('{}');
    expect(inspection).toMatchObject({ present: true, objectLockProtected: false });
    await expect(service.sealedVersionIsPresent(inspection.version)).resolves.toBe(true);
    await expect(
      service.inspectSealedVersionByStorageUri('22222222-2222-4222-8222-222222222222', storageUri, 'a'.repeat(64)),
    ).rejects.toMatchObject({ response: { code: 'TENANT_ISOLATION_VIOLATION' } });
  });

  it('range-reads tenant objects only after storage URI isolation validation', async () => {
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
      body: Buffer.from('0123456789'),
      contentLength: 10,
      contentType: 'application/pdf',
    });

    const object = await service.getRangeByStorageUri(tenantId, result.storageUri, 2, 5);
    await expect(new Response(Readable.toWeb(object.body) as BodyInit).text()).resolves.toBe(
      '2345',
    );
    await expect(
      service.getRangeByStorageUri('22222222-2222-4222-8222-222222222222', result.storageUri, 0, 1),
    ).rejects.toMatchObject({
      response: { code: 'TENANT_ISOLATION_VIOLATION' },
    });
  });

  it('creates presigned read URLs only for tenant-owned storage URIs', async () => {
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

    await expect(
      service.createReadUrlByStorageUri(tenantId, result.storageUri, 60),
    ).resolves.toEqual(
      expect.objectContaining({
        url: expect.stringContaining(`tenants/${tenantId}/matters/${matterId}`),
      }),
    );
    await expect(
      service.createReadUrlByStorageUri('22222222-2222-4222-8222-222222222222', result.storageUri),
    ).rejects.toMatchObject({
      response: { code: 'TENANT_ISOLATION_VIOLATION' },
    });
  });
});
