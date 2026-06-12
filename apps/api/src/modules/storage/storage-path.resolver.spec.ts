import { describe, expect, it } from 'vitest';
import {
  StoragePathResolver,
  StoragePathViolationError,
  StorageTenantIsolationViolationError,
} from './storage-path.resolver';

const tenantId = '11111111-1111-4111-8111-111111111111';
const matterId = '11111111-1111-4111-8111-111111111122';
const documentId = '11111111-1111-4111-8111-111111111133';
const fileObjectId = '11111111-1111-4111-8111-111111111144';
const emailId = '11111111-1111-4111-8111-111111111155';

describe('StoragePathResolver', () => {
  it('builds and parses tenant-prefixed object paths', () => {
    const resolver = new StoragePathResolver('vault-dev');
    const key = resolver.buildObjectKey({ tenantId, matterId, documentId, fileObjectId });

    expect(key).toBe(
      'tenants/11111111-1111-4111-8111-111111111111/matters/11111111-1111-4111-8111-111111111122/documents/11111111-1111-4111-8111-111111111133/11111111-1111-4111-8111-111111111144',
    );
    expect(resolver.storageUriForKey(key)).toBe(`s3://vault-dev/${key}`);
    expect(resolver.parseStorageUri(`s3://vault-dev/${key}`)).toMatchObject({
      objectType: 'document',
      tenantId,
      matterId,
      documentId,
      fileObjectId,
    });
  });

  it('builds and parses tenant-prefixed raw email object paths', () => {
    const resolver = new StoragePathResolver('vault-dev');
    const key = resolver.buildEmailRawObjectKey({ tenantId, emailId, fileObjectId });

    expect(key).toBe(
      'tenants/11111111-1111-4111-8111-111111111111/emails/11111111-1111-4111-8111-111111111155/raw/11111111-1111-4111-8111-111111111144',
    );
    expect(resolver.storageUriForKey(key)).toBe(`s3://vault-dev/${key}`);
    expect(resolver.parseStorageUri(`s3://vault-dev/${key}`)).toMatchObject({
      objectType: 'email_raw',
      tenantId,
      emailId,
      fileObjectId,
    });
  });

  it('rejects missing tenant prefixes and traversal attempts', () => {
    const resolver = new StoragePathResolver('vault-dev');

    expect(() => resolver.parseObjectKey(`matters/${matterId}/documents/${documentId}/${fileObjectId}`)).toThrow(
      StoragePathViolationError,
    );
    expect(() =>
      resolver.parseObjectKey(
        `tenants/${tenantId}/matters/${matterId}/documents/${documentId}/../${fileObjectId}`,
      ),
    ).toThrow(StoragePathViolationError);
    expect(() =>
      resolver.parseObjectKey(
        `tenants/${tenantId}/matters/${matterId}/documents/${documentId}/%2e%2e/${fileObjectId}`,
      ),
    ).toThrow(StoragePathViolationError);
    expect(() =>
      resolver.parseObjectKey(`tenants/${tenantId}/emails/${emailId}/raw/../${fileObjectId}`),
    ).toThrow(StoragePathViolationError);
  });

  it('fails closed when a key belongs to a different tenant', () => {
    const resolver = new StoragePathResolver('vault-dev');
    const key = resolver.buildObjectKey({ tenantId, matterId, documentId, fileObjectId });

    expect(() =>
      resolver.assertTenantKey('22222222-2222-4222-8222-222222222222', key),
    ).toThrow(StorageTenantIsolationViolationError);
  });
});
