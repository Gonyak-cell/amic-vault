import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { allowPermission, denyPermission } from '@amic-vault/shared';
import type { UploadedDiskFile } from '../document/document-upload.service';
import { StorageObjectAlreadyExistsError } from '../storage/storage-adapter.interface';
import { QuarantineIntakeService } from './quarantine-intake.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '11111111-1111-4111-8111-111111111101';
const matterId = '11111111-1111-4111-8111-111111111122';
const boundQuarantineRef = '22222222-2222-5222-8222-222222222222';
const boundPreflightTargetId = '33333333-3333-5333-8333-333333333333';
const boundPreflightAuditEventId = '44444444-4444-4444-8444-444444444444';
const boundScanId = '55555555-5555-4555-8555-555555555555';
const boundAuditEventId = '66666666-6666-4666-8666-666666666666';
const boundContent = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF');
const boundSha256 = createHash('sha256').update(boundContent).digest('hex');
const boundStorageUri = `s3://vault-dev/tenants/${tenantId}/quarantine/${boundQuarantineRef}`;

async function tempUploadFile(): Promise<UploadedDiskFile> {
  const dir = await mkdtemp(join(tmpdir(), 'amic-vault-quarantine-test-'));
  const path = join(dir, 'contract.pdf');
  const content = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF');
  await writeFile(path, content);
  return { path, originalname: 'contract.pdf', mimetype: 'application/pdf', size: content.length };
}

async function boundUploadFile(): Promise<UploadedDiskFile> {
  const dir = await mkdtemp(join(tmpdir(), 'amic-vault-bound-quarantine-test-'));
  const path = join(dir, 'contract.pdf');
  await writeFile(path, boundContent);
  return {
    path,
    originalname: 'contract.pdf',
    mimetype: 'application/pdf',
    size: boundContent.length,
  };
}

function boundBinding(expiresAt = new Date(Date.now() + 60_000).toISOString()) {
  return {
    quarantineRef: boundQuarantineRef,
    expectedSha256: boundSha256,
    preflightAuditEventId: boundPreflightAuditEventId,
    preflightTargetId: boundPreflightTargetId,
    preflightClientBindingHash: 'a'.repeat(64),
    correlationId: `vaultcorr_${'1'.repeat(32)}`,
    requestFingerprint: 'b'.repeat(64),
    idempotencyHash: 'c'.repeat(64),
    expiresAt,
  };
}

function createBoundService(options: {
  existing?: boolean;
  orphan?: boolean;
  orphanMismatch?: boolean;
} = {}) {
  const binding = boundBinding();
  const existingRow = options.existing
    ? {
        scan_id: boundScanId,
        matter_id: matterId,
        quarantine_storage_uri: boundStorageUri,
        expected_sha256: boundSha256,
        size_bytes: String(boundContent.length),
        created_by: actorUserId,
        original_filename: 'contract.pdf',
        normalized_filename: 'contract.pdf',
        mime_type: 'application/pdf',
        source_system: 'upload',
        promotion_created_by: actorUserId,
        fields_json: {},
        audit_event_id: boundAuditEventId,
        audit_correlation_id: binding.correlationId,
        audit_metadata_json: {
          hash: boundSha256,
          request_id: binding.requestFingerprint,
          idempotency_hash: binding.idempotencyHash,
        },
      }
    : null;
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM users')) {
      return { rowCount: 1, rows: [{ user_id: actorUserId }] };
    }
    if (sql.includes('FROM file_security_scans s') && sql.includes('LEFT JOIN LATERAL')) {
      return existingRow
        ? { rowCount: 1, rows: [existingRow] }
        : { rowCount: 0, rows: [] };
    }
    if (sql.includes("target_type = 'amic_os_vault_upload_preflight'")) {
      return { rowCount: 1, rows: [{ created_at: new Date(), metadata_json: {} }] };
    }
    if (sql.includes('INSERT INTO file_security_scans')) {
      return { rowCount: 1, rows: [{ scan_id: boundScanId }] };
    }
    return { rowCount: 1, rows: [] };
  });
  const tx = { query };
  const audit = {
    transaction: vi.fn(async (_tenant: string, run: (client: typeof tx) => Promise<unknown>) => run(tx)),
    log: vi.fn(async () => ({ eventId: boundAuditEventId })),
  };
  const putQuarantineObject = vi.fn(async (input: { body: Readable }) => {
    if (options.orphan) throw new StorageObjectAlreadyExistsError('quarantine-key');
    for await (const _chunk of input.body) void _chunk;
    return {
      key: `tenants/${tenantId}/quarantine/${boundQuarantineRef}`,
      storageUri: boundStorageUri,
      encryptionKeyId: null,
    };
  });
  const headByStorageUri = vi.fn(async () => ({
    contentLength: options.orphanMismatch ? boundContent.length + 1 : boundContent.length,
    contentType: 'application/pdf',
  }));
  const sha256ByStorageUri = vi.fn(async () => boundSha256);
  const deleteByStorageUri = vi.fn(async () => undefined);
  const enqueue = vi.fn(async () => 'scan-job');
  const matterSourcePolicy = {
    assertUploadMutationAllowed: vi.fn(async () => undefined),
  };
  const service = new QuarantineIntakeService(
    audit as never,
    { enqueue } as never,
    matterSourcePolicy as never,
    { canUploadToMatter: vi.fn(async () => allowPermission()) } as never,
    {
      quarantineStorageUri: vi.fn(() => boundStorageUri),
      putQuarantineObject,
      headByStorageUri,
      sha256ByStorageUri,
      deleteByStorageUri,
    } as never,
    { require: () => ({ tenantId, slug: 'tenant-alpha', status: 'active', source: 'amic-os-provider' }) } as never,
  );
  return {
    audit,
    binding,
    deleteByStorageUri,
    enqueue,
    headByStorageUri,
    matterSourcePolicy,
    putQuarantineObject,
    query,
    service,
    sha256ByStorageUri,
  };
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

  it('creates one deterministic bound quarantine authority and audit receipt', async () => {
    const file = await boundUploadFile();
    const { audit, binding, enqueue, putQuarantineObject, service } = createBoundService();

    await expect(service.intakeBound({
      actorUserId,
      matterId,
      fields: {},
      file,
      sourceSystem: 'upload',
      binding,
    })).resolves.toMatchObject({
      quarantineRef: boundQuarantineRef,
      scanId: boundScanId,
      auditEventId: boundAuditEventId,
      expectedSha256: boundSha256,
      replayed: false,
    });

    expect(putQuarantineObject).toHaveBeenCalledOnce();
    expect(enqueue).toHaveBeenCalledOnce();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'FILE_QUARANTINED',
        metadata: expect.objectContaining({
          hash: boundSha256,
          request_id: binding.requestFingerprint,
          idempotency_hash: binding.idempotencyHash,
          correlation_id: binding.correlationId,
        }),
      }),
      expect.anything(),
    );
  });

  it('registers an exact direct-uploaded quarantine object without buffering or re-uploading bytes', async () => {
    const {
      audit,
      binding,
      enqueue,
      headByStorageUri,
      matterSourcePolicy,
      putQuarantineObject,
      service,
      sha256ByStorageUri,
    } = createBoundService();

    const authoritativeMatterSource = {
      mode: 'matter_app_api' as const,
      operationExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      sourceRevision: 'lawos-live-matter-projection-v1',
      sourceUpdatedAt: new Date().toISOString(),
    };

    await expect(service.intakeBoundStored({
      actorUserId,
      authoritativeMatterSource,
      matterId,
      fields: {},
      sourceSystem: 'upload',
      file: {
        originalFilename: 'contract.pdf',
        mimeType: 'application/pdf',
        byteSize: boundContent.length,
      },
      binding,
    })).resolves.toMatchObject({
      quarantineRef: boundQuarantineRef,
      scanId: boundScanId,
      auditEventId: boundAuditEventId,
      expectedSha256: boundSha256,
      byteSize: boundContent.length,
      replayed: false,
    });

    expect(headByStorageUri).toHaveBeenCalledWith(tenantId, boundStorageUri);
    expect(matterSourcePolicy.assertUploadMutationAllowed).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId,
        authoritativeSource: authoritativeMatterSource,
        matterId,
        tenantId,
      }),
    );
    expect(putQuarantineObject).not.toHaveBeenCalled();
    expect(sha256ByStorageUri).not.toHaveBeenCalled();
    expect(enqueue).toHaveBeenCalledOnce();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'FILE_QUARANTINED',
        metadata: expect.objectContaining({
          hash: boundSha256,
          expires_at: binding.expiresAt,
          matter_source_mode: authoritativeMatterSource.mode,
          matter_source_revision: authoritativeMatterSource.sourceRevision,
          matter_source_updated_at: authoritativeMatterSource.sourceUpdatedAt,
        }),
      }),
      expect.anything(),
    );
  });

  it('rejects direct-uploaded quarantine metadata drift before queue authority is created', async () => {
    const { binding, enqueue, query, service } = createBoundService({ orphanMismatch: true });

    await expect(service.intakeBoundStored({
      actorUserId,
      matterId,
      fields: {},
      sourceSystem: 'upload',
      file: {
        originalFilename: 'contract.pdf',
        mimeType: 'application/pdf',
        byteSize: boundContent.length,
      },
      binding,
    })).rejects.toMatchObject({
      response: { reason: 'BOUND_QUARANTINE_ORPHAN_MISMATCH' },
    });
    expect(enqueue).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO file_security_scans'))).toBe(false);
  });

  it('replays the exact bound operation without storing, queueing, or auditing twice', async () => {
    const file = await boundUploadFile();
    const { binding, enqueue, putQuarantineObject, service } = createBoundService({ existing: true });
    binding.expiresAt = '2026-01-01T00:00:00.000Z';

    await expect(service.intakeBound({
      actorUserId,
      matterId,
      fields: {},
      file,
      sourceSystem: 'upload',
      binding,
    })).resolves.toMatchObject({
      quarantineRef: boundQuarantineRef,
      scanId: boundScanId,
      auditEventId: boundAuditEventId,
      replayed: true,
    });

    expect(putQuarantineObject).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('rejects a reused deterministic operation when its idempotency binding changes', async () => {
    const file = await boundUploadFile();
    const { binding, putQuarantineObject, service } = createBoundService({ existing: true });
    binding.idempotencyHash = 'd'.repeat(64);

    await expect(service.intakeBound({
      actorUserId,
      matterId,
      fields: {},
      file,
      sourceSystem: 'upload',
      binding,
    })).rejects.toMatchObject({
      response: { reason: 'BOUND_QUARANTINE_CONFLICT' },
    });
    expect(putQuarantineObject).not.toHaveBeenCalled();
  });

  it('adopts only an exact orphaned quarantine object after independent metadata and hash checks', async () => {
    const file = await boundUploadFile();
    const {
      binding,
      deleteByStorageUri,
      headByStorageUri,
      putQuarantineObject,
      service,
      sha256ByStorageUri,
    } = createBoundService({ orphan: true });

    await expect(service.intakeBound({
      actorUserId,
      matterId,
      fields: {},
      file,
      sourceSystem: 'upload',
      binding,
    })).resolves.toMatchObject({ replayed: false, quarantineRef: boundQuarantineRef });
    expect(headByStorageUri).toHaveBeenCalledWith(tenantId, boundStorageUri);
    expect(sha256ByStorageUri).toHaveBeenCalledWith(tenantId, boundStorageUri);
    expect(putQuarantineObject.mock.calls[0]?.[0].body.destroyed).toBe(true);
    expect(deleteByStorageUri).not.toHaveBeenCalled();
  });

  it('fails closed instead of adopting an orphaned object with different bytes', async () => {
    const file = await boundUploadFile();
    const { binding, query, service } = createBoundService({
      orphan: true,
      orphanMismatch: true,
    });

    await expect(service.intakeBound({
      actorUserId,
      matterId,
      fields: {},
      file,
      sourceSystem: 'upload',
      binding,
    })).rejects.toMatchObject({
      response: { reason: 'BOUND_QUARANTINE_ORPHAN_MISMATCH' },
    });
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO file_security_scans'))).toBe(false);
  });
});
