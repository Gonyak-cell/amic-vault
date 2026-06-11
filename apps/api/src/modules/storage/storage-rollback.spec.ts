import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { allowPermission } from '@amic-vault/shared';
import { DocumentUploadService, type UploadedDiskFile } from '../document/document-upload.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '11111111-1111-4111-8111-111111111101';
const matterId = '11111111-1111-4111-8111-111111111122';

async function tempUploadFile(): Promise<UploadedDiskFile> {
  const dir = await mkdtemp(join(tmpdir(), 'amic-vault-rollback-test-'));
  const path = join(dir, 'Rollback.pdf');
  const bytes = '%PDF-1.7 rollback';
  await writeFile(path, bytes);
  return {
    path,
    originalname: 'Rollback.pdf',
    mimetype: 'application/pdf',
    size: Buffer.byteLength(bytes),
  };
}

async function drainBody(body: Buffer | Readable): Promise<void> {
  if (Buffer.isBuffer(body)) return;
  let bytes = 0;
  for await (const chunk of body) {
    bytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk));
    // Consume the test stream so unlink happens after the read completes.
  }
  expect(bytes).toBeGreaterThanOrEqual(0);
}

describe('storage rollback', () => {
  it('deletes the uploaded object when the DB transaction fails', async () => {
    const storageUri = `s3://vault-dev/tenants/${tenantId}/matters/${matterId}/documents/11111111-1111-4111-8111-111111111133/11111111-1111-4111-8111-111111111144`;
    const deleteByStorageUri = vi.fn(async () => undefined);
    const service = new DocumentUploadService(
      {
        async transaction(_tenantId: string, run: (tx: never) => Promise<void>) {
          await run({} as never);
        },
      } as never,
      {
        async createDraft() {
          throw new Error('injected db failure');
        },
      } as never,
      { findCandidates: vi.fn(async () => []) } as never,
      { create: vi.fn(async () => undefined) } as never,
      { canUploadToMatter: vi.fn(async () => allowPermission()) } as never,
      {
        putTenantObject: vi.fn(async (input: { body: Buffer | Readable }) => {
          await drainBody(input.body);
          return {
            key: 'key',
            storageUri,
            encryptionKeyId: null,
          };
        }),
        deleteByStorageUri,
      } as never,
      {
        require: () => ({ tenantId, slug: 'tenant-alpha', status: 'active', source: 'session' }),
      } as never,
    );

    await expect(
      service.upload({
        actorUserId,
        matterId,
        fields: {},
        file: await tempUploadFile(),
      }),
    ).rejects.toThrow(/injected db failure/);

    expect(deleteByStorageUri).toHaveBeenCalledWith(tenantId, storageUri);
  });
});
