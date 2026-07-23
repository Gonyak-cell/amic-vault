import { afterEach, describe, expect, it, vi } from 'vitest';
import { StoragePathResolver } from '../../storage/storage-path.resolver';
import { createIngestionWorkerRequest } from './ingestion-request.factory';
import type { ExtractionTarget } from './extraction.types';

const target: ExtractionTarget = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  documentId: '11111111-1111-4111-8111-111111111122',
  matterId: '11111111-1111-4111-8111-111111111133',
  versionId: '11111111-1111-4111-8111-111111111144',
  fileObjectId: '11111111-1111-4111-8111-111111111155',
  storageUri:
    's3://amic-vault-dev/tenants/11111111-1111-4111-8111-111111111111/matters/11111111-1111-4111-8111-111111111133/documents/11111111-1111-4111-8111-111111111122/11111111-1111-4111-8111-111111111155',
  normalizedFilename: 'fixture.pdf',
  mimeType: 'application/pdf',
  sha256: 'a'.repeat(64),
  sizeBytes: 1024,
};

describe('createIngestionWorkerRequest', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('derives only the canonical storage reference and one-use request headers', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('INGESTION_WORKER_IDENTITY_PROFILE', 'loopback-dev');
    const latestVersionFingerprintByStorageUri = vi.fn(async () => 'b'.repeat(64));

    const request = await createIngestionWorkerRequest({
      target,
      parserProfile: 'extract',
      storageService: { latestVersionFingerprintByStorageUri },
      storagePathResolver: new StoragePathResolver('amic-vault-dev'),
      now: new Date('2030-01-01T00:00:00Z'),
    });

    expect(request.job).toMatchObject({
      tenantId: target.tenantId,
      documentId: target.documentId,
      versionId: target.versionId,
      fileObjectId: target.fileObjectId,
      storageAlias: 'primary',
      objectKey: 'tenants/11111111-1111-4111-8111-111111111111/matters/11111111-1111-4111-8111-111111111133/documents/11111111-1111-4111-8111-111111111122/11111111-1111-4111-8111-111111111155',
      objectVersion: 'b'.repeat(64),
      sha256: 'a'.repeat(64),
      sizeBytes: 1024,
      parserProfile: 'extract',
      expiresAt: '2030-01-01T00:05:00Z',
    });
    expect(request.headers).toEqual({
      'content-type': 'application/json',
      'x-amic-request-id': request.job.requestId,
      'x-amic-ingestion-nonce': expect.stringMatching(/^[0-9a-f-]{36}$/),
      'x-amic-ingestion-expires-at': request.job.expiresAt,
      'x-amic-dev-loopback-identity': 'true',
    });
    expect(latestVersionFingerprintByStorageUri).toHaveBeenCalledWith(target.tenantId, target.storageUri);
    expect(JSON.stringify(request)).not.toContain('storage_url');
  });

  it('fails closed for a storage URI that is not the selected document target', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('INGESTION_WORKER_IDENTITY_PROFILE', 'loopback-dev');

    await expect(
      createIngestionWorkerRequest({
        target: { ...target, storageUri: target.storageUri.replace(target.fileObjectId, target.versionId) },
        parserProfile: 'extract',
        storageService: { latestVersionFingerprintByStorageUri: vi.fn(async () => 'b'.repeat(64)) },
        storagePathResolver: new StoragePathResolver('amic-vault-dev'),
      }),
    ).rejects.toThrow('WORKER_INGESTION_REQUEST_INVALID');
  });

  it('uses only the private HTTPS gateway profile outside development', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('INGESTION_WORKER_IDENTITY_PROFILE', 'private-gateway-mtls');
    vi.stubEnv('INGESTION_GATEWAY_MTLS_ENABLED', 'true');
    vi.stubEnv('INGESTION_GATEWAY_SANITIZES_IDENTITY_HEADERS', 'true');
    vi.stubEnv('INGESTION_GATEWAY_DIRECT_WORKER_ACCESS', 'blocked');
    vi.stubEnv('INGESTION_GATEWAY_WORKLOAD_SUBJECT', 'amic-vault-api');
    vi.stubEnv('INGESTION_GATEWAY_AUDIENCE', 'amic-vault-ingestion');
    vi.stubEnv('INGESTION_WORKER_URL', 'https://ingestion-gateway.internal');

    const request = await createIngestionWorkerRequest({
      target,
      parserProfile: 'extract',
      storageService: { latestVersionFingerprintByStorageUri: vi.fn(async () => 'b'.repeat(64)) },
      storagePathResolver: new StoragePathResolver('amic-vault-dev'),
      now: new Date('2030-01-01T00:00:00Z'),
    });

    expect(request.headers).not.toHaveProperty('x-amic-dev-loopback-identity');
  });
});
