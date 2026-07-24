import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { allowPermission, denyPermission } from '@amic-vault/shared';
import type { UploadedDiskFile } from '../document/document-upload.service';
import { QuarantineIntakeService } from './quarantine-intake.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '11111111-1111-4111-8111-111111111101';
const matterId = '11111111-1111-4111-8111-111111111122';

async function tempUploadFile(): Promise<UploadedDiskFile> {
  const dir = await mkdtemp(join(tmpdir(), 'amic-vault-quarantine-test-'));
  const path = join(dir, 'contract.pdf');
  const content = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF');
  await writeFile(path, content);
  return { path, originalname: 'contract.pdf', mimetype: 'application/pdf', size: content.length };
}

function createService(options: {
  permission?: 'allow' | 'deny' | 'wall';
  queueFails?: boolean;
  auditFails?: boolean;
  activeActor?: boolean;
} = {}) {
  const permission =
    options.permission === 'deny'
      ? denyPermission('PERMISSION_DENIED')
      : options.permission === 'wall'
        ? denyPermission('ETHICAL_WALL_BLOCKED')
        : allowPermission();
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM users')) {
      return options.activeActor === false
        ? { rowCount: 0, rows: [] }
        : { rowCount: 1, rows: [{ user_id: actorUserId }] };
    }
    return sql.includes('INSERT INTO file_security_scans')
      ? { rowCount: 1, rows: [{ scan_id: '11111111-1111-4111-8111-111111111199' }] }
      : { rowCount: 1, rows: [] };
  });
  const tx = { query };
  const audit = {
    transaction: vi.fn(async (_tenant: string, run: (client: typeof tx) => Promise<unknown>) => run(tx)),
    log: options.auditFails ? vi.fn(async () => { throw new Error('AUDIT_FAILURE'); }) : vi.fn(async () => undefined),
  };
  const putQuarantineObject = vi.fn(async (input: { body: Readable }) => {
    for await (const _chunk of input.body) {
      void _chunk;
      // Consume the stream so the temp file can be removed deterministically.
    }
    return {
      key: `tenants/${tenantId}/quarantine/11111111-1111-4111-8111-111111111188`,
      storageUri: `s3://vault-dev/tenants/${tenantId}/quarantine/11111111-1111-4111-8111-111111111188`,
      encryptionKeyId: null,
    };
  });
  const deleteByStorageUri = vi.fn(async () => undefined);
  const enqueue = options.queueFails
    ? vi.fn(async () => { throw new Error('QUEUE_FAILURE'); })
    : vi.fn(async () => 'scan-job');
  const service = new QuarantineIntakeService(
    audit as never,
    { enqueue } as never,
    { assertUploadMutationAllowed: vi.fn(async () => undefined) } as never,
    { canUploadToMatter: vi.fn(async () => permission) } as never,
    { putQuarantineObject, deleteByStorageUri } as never,
    { require: () => ({ tenantId, slug: 'tenant-alpha', status: 'active', source: 'session' }) } as never,
  );
  return { audit, deleteByStorageUri, enqueue, putQuarantineObject, query, service };
}

describe('QuarantineIntakeService', () => {
  it('writes only the quarantine prefix, then records registry, queue and audit atomically', async () => {
    const file = await tempUploadFile();
    const { audit, enqueue, putQuarantineObject, query, service } = createService();

    const response = await service.intake({ actorUserId, matterId, fields: {}, file });

    expect(response).toMatchObject({ status: 'quarantined', matterId, quarantineRef: expect.any(String) });
    expect(putQuarantineObject).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId, contentType: 'application/pdf' }),
    );
    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId, quarantineRef: response.quarantineRef, expectedSha256: expect.stringMatching(/^[a-f0-9]{64}$/) }),
      expect.anything(),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'FILE_QUARANTINED', targetType: 'file_security_scan' }),
      expect.anything(),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO file_security_promotion_inputs'),
      expect.arrayContaining([
        'contract.pdf',
        'application/pdf',
        'upload',
        actorUserId,
        '{}',
      ]),
    );
  });

  it.each([
    ['non-member', 'deny', 'PERMISSION_DENIED'],
    ['ethical wall', 'wall', 'ETHICAL_WALL_BLOCKED'],
  ] as const)('fails closed for %s before quarantine storage', async (_label, permission, code) => {
    const file = await tempUploadFile();
    const { putQuarantineObject, service } = createService({ permission });

    await expect(service.intake({ actorUserId, matterId, fields: {}, file })).rejects.toMatchObject({
      response: { code },
    });
    expect(putQuarantineObject).not.toHaveBeenCalled();
  });

  it.each([{ queueFails: true }, { auditFails: true }])(
    'deletes stored quarantine bytes when registry transaction cannot complete',
    async (options) => {
      const file = await tempUploadFile();
      const { deleteByStorageUri, service } = createService(options);

      await expect(service.intake({ actorUserId, matterId, fields: {}, file })).rejects.toThrow();
      expect(deleteByStorageUri).toHaveBeenCalledWith(
        tenantId,
        `s3://vault-dev/tenants/${tenantId}/quarantine/11111111-1111-4111-8111-111111111188`,
      );
    },
  );

  it('compensates quarantine bytes and creates no authority when the lifecycle fence sees an inactive actor', async () => {
    const file = await tempUploadFile();
    const { deleteByStorageUri, enqueue, putQuarantineObject, query, service } = createService({
      activeActor: false,
    });

    await expect(service.intake({ actorUserId, matterId, fields: {}, file })).rejects.toMatchObject({
      response: { code: 'PERMISSION_DENIED' },
    });
    expect(putQuarantineObject).toHaveBeenCalledOnce();
    expect(enqueue).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'active'\n      FOR UPDATE"),
      [tenantId, actorUserId],
    );
    expect(deleteByStorageUri).toHaveBeenCalledOnce();
  });
});
