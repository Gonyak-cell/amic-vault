import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { MANAGED_AT_REST_ENCRYPTION_MARKER, NoopEncryptionHook } from './noop-encryption.hook';

describe('NoopEncryptionHook', () => {
  it('passes object bytes and metadata through without assigning a key id', async () => {
    const hook = new NoopEncryptionHook();
    const body = Buffer.from('vault-bytes');

    await expect(
      hook.beforePut({
        tenantId: '11111111-1111-4111-8111-111111111111',
        matterId: '11111111-1111-4111-8111-111111111122',
        documentId: '11111111-1111-4111-8111-111111111133',
        fileObjectId: '11111111-1111-4111-8111-111111111144',
        body,
        contentLength: body.length,
        contentType: 'application/pdf',
      }),
    ).resolves.toEqual({
      body,
      contentLength: body.length,
      contentType: 'application/pdf',
      encryptionKeyId: null,
    });
  });

  it('marks managed S3/RDS at-rest encryption without assigning an envelope key id', () => {
    expect(MANAGED_AT_REST_ENCRYPTION_MARKER).toBe('managed-at-rest:S3-SSE/RDS');
  });

  it('returns downloaded streams unchanged', async () => {
    const hook = new NoopEncryptionHook();
    const body = Readable.from(['bytes']);

    await expect(
      hook.afterGet({
        tenantId: '11111111-1111-4111-8111-111111111111',
        key: 'tenants/11111111-1111-4111-8111-111111111111/object',
        body,
        contentLength: 5,
        contentType: 'text/plain',
      }),
    ).resolves.toEqual({ body });
  });
});
