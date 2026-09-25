import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import {
  StorageObjectAlreadyExistsError,
  StorageUnavailableError,
} from '../../storage/storage-adapter.interface';
import type {
  AmicOsVaultNativeCopyPrepareInput,
} from './amic-os-vault-document-copy.contract';
import { AmicOsVaultDocumentCopyService } from './amic-os-vault-document-copy.service';
import type { AmicOsVaultProviderPrincipal } from './amic-os-vault-provider.guard';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '22222222-2222-4222-8222-222222222222';
const matterId = '33333333-3333-4333-8333-333333333333';
const sourceDocumentId = '44444444-4444-4444-8444-444444444444';
const sourceVersionId = '55555555-5555-4555-8555-555555555555';
const sourceFileObjectId = '66666666-6666-4666-8666-666666666666';
const reassignedMatterId = 'aaaaaaaa-1111-4111-8111-111111111111';
const savedDocumentId = '77777777-7777-4777-8777-777777777777';
const savedVersionId = '88888888-8888-4888-8888-888888888888';
const savedFileObjectId = '99999999-9999-4999-8999-999999999999';
const lawosMatterId = 'MATTER-2026-0042';
const copyId = 'document-copy:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const snapshotId = 'document-copy-snapshot:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const principal: AmicOsVaultProviderPrincipal = {
  accountLedgerId: 'user_amic_jwsuh',
  tenantId,
  actorUserId,
};

function digest(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function harness(mimeType: 'application/pdf' | 'message/rfc822') {
  const bytes = mimeType === 'application/pdf'
    ? Buffer.from('%PDF-1.7\nimmutable copy\n%%EOF\n')
    : Buffer.from('From: sender@example.test\r\nTo: receiver@example.test\r\nSubject: exact\r\n\r\nbody\r\n');
  const filename = mimeType === 'application/pdf' ? 'original.pdf' : 'original.eml';
  const exactVersion = {
    document_id: sourceDocumentId,
    version_id: sourceVersionId,
    file_object_id: sourceFileObjectId,
    sha256: digest(bytes),
    byte_size: bytes.byteLength,
    mime_type: mimeType,
  };
  const input: AmicOsVaultNativeCopyPrepareInput = {
    principal: { tenant_id: 'lawos-tenant', user_id: principal.accountLedgerId },
    lawos_matter_id: lawosMatterId,
    requested_exact_version: exactVersion,
    copy_id: copyId,
    snapshot_id: snapshotId,
    title: '원본 보관 사본',
    mode: 'clone',
    file: null,
  };
  let row: Record<string, unknown> | null = null;
  let currentVersionId = sourceVersionId;
  let currentMatterId = matterId;
  let currentLawosMatterId = lawosMatterId;
  let accessAllowed = true;
  let failRetainUpdate = false;
  let snapshotReadError: Error | undefined;
  let downloadGate: Promise<void> | undefined;
  let transactionTail = Promise.resolve();
  const objects = new Map<string, Buffer>();
  const events: string[] = [];

  const makePreparedRow = (parameters: readonly unknown[] = []) => ({
    copy_id: parameters[1] ?? copyId,
    snapshot_id: parameters[2] ?? snapshotId,
    source_document_id: parameters[3] ?? sourceDocumentId,
    source_version_id: parameters[4] ?? sourceVersionId,
    source_file_object_id: parameters[5] ?? sourceFileObjectId,
    source_matter_id: parameters[6] ?? matterId,
    lawos_matter_id: parameters[7] ?? lawosMatterId,
    quarantine_ref: parameters[8] ?? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab',
    title: parameters[9] ?? input.title,
    filename: parameters[10] ?? filename,
    sha256: parameters[11] ?? exactVersion.sha256,
    byte_size: String(parameters[12] ?? bytes.byteLength),
    mime_type: parameters[13] ?? mimeType,
    mode: parameters[14] ?? input.mode,
    state: 'prepared',
    blocked_reason: null,
    saved_document_id: null,
    saved_version_id: null,
    saved_file_object_id: null,
    created_by: parameters[15] ?? actorUserId,
    created_at: new Date('2026-09-25T01:00:00.000Z'),
    updated_at: new Date('2026-09-25T01:00:00.000Z'),
  });

  const visibleRow = (): Record<string, unknown> | null => row ? {
    ...row,
    source_current_version_id: currentVersionId,
    saved_sha256: row.state === 'saved' ? exactVersion.sha256 : null,
    saved_byte_size: row.state === 'saved' ? String(bytes.byteLength) : null,
    saved_mime_type: row.state === 'saved' ? mimeType : null,
  } : null;

  const query = vi.fn(async (sql: string, parameters: readonly unknown[] = []) => {
    if (sql.includes('pg_advisory_xact_lock')) return { rowCount: 1, rows: [{}] };
    if (sql.includes('FROM documents d') && sql.includes('JOIN document_versions selected')) {
      return {
        rowCount: 1,
        rows: [{
          document_id: sourceDocumentId,
          matter_id: currentMatterId,
          document_status: 'draft',
          matter_status: 'active',
          lawos_matter_id: currentLawosMatterId,
          version_id: sourceVersionId,
          file_object_id: sourceFileObjectId,
          sha256: exactVersion.sha256,
          byte_size: String(bytes.byteLength),
          mime_type: mimeType,
          filename,
          current_version_id: currentVersionId,
        }],
      };
    }
    if (sql.includes('INSERT INTO amic_os_native_document_copies')) {
      if (!row) row = makePreparedRow(parameters);
      return { rowCount: 1, rows: [] };
    }
    if (sql.includes('SET state = \'retained\'')) {
      if (failRetainUpdate) throw new Error('retention transaction failed');
      if (row?.state === 'prepared') {
        row.state = 'retained';
        row.blocked_reason = null;
      }
      return { rowCount: 1, rows: [] };
    }
    if (sql.includes("SET state = 'blocked'")) {
      if (row?.state === 'prepared') {
        row.state = 'blocked';
        row.blocked_reason = 'snapshot_unavailable';
      }
      return { rowCount: 1, rows: [] };
    }
    if (sql.includes('SELECT snapshot_id') && sql.includes("state = 'saved'")) {
      return row?.state === 'saved'
        ? { rowCount: 1, rows: [{ snapshot_id: row.snapshot_id }] }
        : { rowCount: 0, rows: [] };
    }
    if (sql.includes("SET state = 'saved'")) {
      if (row?.state !== 'retained') return { rowCount: 0, rows: [] };
      row.state = 'saved';
      row.blocked_reason = null;
      row.saved_document_id = parameters[3];
      row.saved_version_id = parameters[4];
      row.saved_file_object_id = parameters[5];
      return { rowCount: 1, rows: [] };
    }
    if (sql.includes('FROM amic_os_native_document_copies c')) {
      const visible = visibleRow();
      if (sql.includes('ORDER BY c.created_at DESC') && visible &&
          sql.includes('c.source_matter_id = $4::uuid') &&
          (visible['source_matter_id'] !== parameters[3] ||
            visible['lawos_matter_id'] !== parameters[4])) {
        return { rowCount: 0, rows: [] };
      }
      return visible ? { rowCount: 1, rows: [visible] } : { rowCount: 0, rows: [] };
    }
    throw new Error(`unexpected query: ${sql}`);
  });
  const tx = { query };
  const auditService = {
    transaction: vi.fn(async (_tenant: string, work: (client: typeof tx) => Promise<unknown>) => {
      let release!: () => void;
      const waitForTurn = transactionTail;
      transactionTail = new Promise<void>((resolve) => { release = resolve; });
      await waitForTurn;
      const rowBefore = row ? { ...row } : null;
      events.push('transaction:begin');
      try {
        const result = await work(tx);
        events.push('transaction:commit');
        return result;
      } catch (error) {
        row = rowBefore;
        events.push('transaction:rollback');
        throw error;
      } finally {
        release();
      }
    }),
    log: vi.fn(async () => ({ eventId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' })),
  };
  const lifecycleService = {
    download: vi.fn(async () => {
      await downloadGate;
      return {
        body: Readable.from(bytes),
        contentType: mimeType,
        contentLength: bytes.byteLength,
        filename,
        sha256: exactVersion.sha256,
      };
    }),
  };
  const permissionDecision = () => Promise.resolve({ effect: accessAllowed ? 'ALLOW' : 'DENY' });
  const permissionService = {
    canReadDocument: vi.fn(permissionDecision),
    canDownloadDocument: vi.fn(permissionDecision),
    canUploadToMatter: vi.fn(permissionDecision),
  };
  const storageService = {
    quarantineStorageUri: vi.fn((_tenant: string, quarantineRef: string) => `vault://quarantine/${quarantineRef}`),
    putQuarantineObject: vi.fn(async (request: {
      quarantineRef: string;
      body: Buffer;
    }) => {
      const uri = `vault://quarantine/${request.quarantineRef}`;
      if (objects.has(uri)) throw new StorageObjectAlreadyExistsError(uri);
      objects.set(uri, Buffer.from(request.body));
      return { key: request.quarantineRef, storageUri: uri, encryptionKeyId: null };
    }),
    getByStorageUri: vi.fn(async (_tenant: string, uri: string) => {
      if (snapshotReadError) throw snapshotReadError;
      const body = objects.get(uri);
      if (!body) throw new Error('snapshot missing');
      return { body: Readable.from(body), contentLength: body.byteLength, contentType: mimeType };
    }),
    deleteByStorageUri: vi.fn(async (_tenant: string, uri: string) => {
      events.push('storage:delete');
      objects.delete(uri);
    }),
  };
  const uploadService = {
    uploadBuffer: vi.fn(async (request: {
      body: Buffer;
      afterUploadAudit?: (
        client: typeof tx,
        uploaded: {
          documentId: string;
          versionId: string;
          fileObjectId: string;
          sha256: string;
          matterId: string;
          title: string;
        },
      ) => Promise<void>;
    }) => {
      expect(request.body).toEqual(bytes);
      await request.afterUploadAudit?.(tx, {
        documentId: savedDocumentId,
        versionId: savedVersionId,
        fileObjectId: savedFileObjectId,
        sha256: exactVersion.sha256,
        matterId,
        title: input.title,
      });
      return { documentId: savedDocumentId };
    }),
  };
  const service = new AmicOsVaultDocumentCopyService(
    auditService as never,
    lifecycleService as never,
    uploadService as never,
    permissionService as never,
    storageService as never,
    {
      require: () => ({
        tenantId,
        slug: 'tenant-alpha',
        status: 'active',
        source: 'amic-os-provider',
      }),
    } as never,
    { uploadAuthorityRef: () => 'amic-vault-api:single-install' } as never,
  );

  return {
    auditService,
    bytes,
    events,
    exactVersion,
    input,
    lifecycleService,
    objects,
    permissionService,
    query,
    service,
    storageService,
    uploadService,
    setAccessAllowed(value: boolean) { accessAllowed = value; },
    setCurrentVersion(value: string) { currentVersionId = value; },
    setCurrentPlacement(nextMatterId: string, nextLawosMatterId: string) {
      currentMatterId = nextMatterId;
      currentLawosMatterId = nextLawosMatterId;
    },
    setDownloadGate(value: Promise<void> | undefined) { downloadGate = value; },
    setFailRetainUpdate(value: boolean) { failRetainUpdate = value; },
    setSnapshotReadError(value: Error | undefined) { snapshotReadError = value; },
    seedPreparedSnapshot(includeObject = true) {
      row = makePreparedRow();
      if (includeObject) {
        objects.set(
          `vault://quarantine/${String(row.quarantine_ref)}`,
          Buffer.from(bytes),
        );
      }
    },
    state: () => visibleRow(),
  };
}

describe('AmicOsVaultDocumentCopyService', () => {
  it.each(['application/pdf', 'message/rfc822'] as const)(
    'retains, reads, publishes, and replays an exact immutable %s copy',
    async (mimeType) => {
      const f = harness(mimeType);
      const retained = await f.service.prepare(principal, f.input);
      expect(retained).toMatchObject({
        authority_kind: 'amic-vault-api',
        provider_revision: 'generic-copy-v1',
        copy_id: copyId,
        snapshot_id: snapshotId,
        state: 'retained',
        scan_state: 'clean',
        blocked_reason: null,
        exact_version: null,
        file: {
          sha256: f.exactVersion.sha256,
          byte_size: f.bytes.byteLength,
          mime_type: mimeType,
        },
      });
      expect(JSON.stringify(retained)).not.toContain('storage');
      await expect(f.service.complete(principal, f.input)).resolves.toMatchObject({
        state: 'retained',
      });

      const read = await f.service.read(principal, { ...f.input, offset: 0 });
      expect(Buffer.from(read.bytes_base64, 'base64')).toEqual(f.bytes);
      expect(read).toMatchObject({ offset: 0, next_offset: f.bytes.byteLength, final: true });
      expect(f.auditService.log).toHaveBeenCalledWith(expect.objectContaining({
        action: 'DOCUMENT_DOWNLOADED',
        metadata: expect.objectContaining({ reason_code: 'AMIC_OS_NATIVE_COPY' }),
      }));

      const saved = await f.service.commit(principal, f.input);
      expect(saved).toMatchObject({
        state: 'saved',
        scan_state: 'promoted',
        saved: true,
        exact_version: {
          document_id: savedDocumentId,
          version_id: savedVersionId,
          file_object_id: savedFileObjectId,
          sha256: f.exactVersion.sha256,
          byte_size: f.bytes.byteLength,
          mime_type: mimeType,
        },
      });
      await expect(f.service.commit(principal, f.input)).resolves.toMatchObject({
        saved: true,
        exact_version: { document_id: savedDocumentId },
      });
      expect(f.uploadService.uploadBuffer).toHaveBeenCalledTimes(1);

      const listed = await f.service.list(principal, {
        principal: f.input.principal,
        lawos_matter_id: f.input.lawos_matter_id,
        requested_exact_version: f.input.requested_exact_version,
        limit: 50,
      });
      expect(listed).toMatchObject({
        provider_revision: 'generic-copy-v1',
        next_cursor: null,
        items: [{ state: 'saved', saved: true }],
      });
    },
  );

  it('rejects changed immutable bytes before creating a retained snapshot', async () => {
    const f = harness('application/pdf');
    await expect(f.service.prepare(principal, {
      ...f.input,
      mode: 'upload',
      file: {
        filename: 'changed.pdf',
        sha256: 'f'.repeat(64),
        byte_size: f.bytes.byteLength,
        mime_type: 'application/pdf',
      },
    })).rejects.toMatchObject({ response: expect.objectContaining({
      reason: 'native_copy_immutable_source_required',
    }) });
    expect(f.lifecycleService.download).not.toHaveBeenCalled();
    expect(f.storageService.putQuarantineObject).not.toHaveBeenCalled();
  });

  it('fails closed after ACL revocation and never publishes or returns retained bytes', async () => {
    const f = harness('message/rfc822');
    await f.service.prepare(principal, f.input);
    f.setAccessAllowed(false);
    await expect(f.service.read(principal, { ...f.input, offset: 0 }))
      .rejects.toMatchObject({ status: 403 });
    await expect(f.service.commit(principal, f.input)).rejects.toMatchObject({ status: 403 });
    expect(f.storageService.getByStorageUri).not.toHaveBeenCalled();
    expect(f.uploadService.uploadBuffer).not.toHaveBeenCalled();
  });

  it('keeps the retained exact snapshot readable but blocks publication after the source changes', async () => {
    const f = harness('application/pdf');
    await f.service.prepare(principal, f.input);
    f.setCurrentVersion('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
    await expect(f.service.complete(principal, f.input)).resolves.toMatchObject({
      state: 'retained',
      blocked_reason: 'base_version_stale',
    });
    await expect(f.service.read(principal, { ...f.input, offset: 0 })).resolves.toMatchObject({
      blocked_reason: 'base_version_stale',
    });
    await expect(f.service.commit(principal, f.input)).rejects.toMatchObject({
      response: expect.objectContaining({ reason: 'base_version_stale' }),
    });
    expect(f.uploadService.uploadBuffer).not.toHaveBeenCalled();
  });

  it('does not list a historic copy after its source document is reassigned', async () => {
    const f = harness('application/pdf');
    await f.service.prepare(principal, f.input);
    f.setCurrentPlacement(reassignedMatterId, 'MATTER-2026-REASSIGNED');

    await expect(f.service.list(principal, {
      principal: f.input.principal,
      lawos_matter_id: 'MATTER-2026-REASSIGNED',
      requested_exact_version: f.input.requested_exact_version,
      limit: 50,
    })).resolves.toMatchObject({ items: [], next_cursor: null });
    expect(f.query.mock.calls.some(([sql]) =>
      String(sql).includes('c.source_matter_id = $4::uuid AND c.lawos_matter_id = $5')))
      .toBe(true);
  });

  it('rolls back a newly written snapshot when the retained checkpoint fails', async () => {
    const f = harness('application/pdf');
    f.setFailRetainUpdate(true);
    await expect(f.service.prepare(principal, f.input)).rejects.toThrow('retention transaction failed');
    expect(f.storageService.deleteByStorageUri).toHaveBeenCalledTimes(1);
    expect(f.objects.size).toBe(0);
    expect(f.state()).toBeNull();
    expect(f.events.indexOf('storage:delete')).toBeLessThan(
      f.events.lastIndexOf('transaction:rollback'),
    );
  });

  it('serializes concurrent prepares for the same attempt and retains one snapshot', async () => {
    const f = harness('application/pdf');
    let releaseDownload!: () => void;
    f.setDownloadGate(new Promise<void>((resolve) => { releaseDownload = resolve; }));

    const first = f.service.prepare(principal, f.input);
    await vi.waitFor(() => expect(f.lifecycleService.download).toHaveBeenCalledTimes(1));
    const second = f.service.prepare(principal, f.input);
    await vi.waitFor(() => expect(f.auditService.transaction.mock.calls.length).toBeGreaterThan(2));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(f.lifecycleService.download).toHaveBeenCalledTimes(1);

    releaseDownload();
    const results = await Promise.all([first, second]);
    expect(results).toEqual([
      expect.objectContaining({ state: 'retained', snapshot_id: snapshotId }),
      expect.objectContaining({ state: 'retained', snapshot_id: snapshotId }),
    ]);
    expect(f.storageService.putQuarantineObject).toHaveBeenCalledTimes(1);
  });

  it('does not classify a retained-state database failure as a missing snapshot', async () => {
    const f = harness('application/pdf');
    f.seedPreparedSnapshot();
    f.setFailRetainUpdate(true);

    await expect(f.service.complete(principal, f.input))
      .rejects.toThrow('retention transaction failed');
    expect(f.state()).toMatchObject({ state: 'prepared', blocked_reason: null });
    expect(f.query.mock.calls.some(([sql]) => String(sql).includes("SET state = 'blocked'")))
      .toBe(false);
  });

  it('blocks a prepared copy only when its retained snapshot cannot be verified', async () => {
    const f = harness('message/rfc822');
    f.seedPreparedSnapshot();
    const [uri] = f.objects.keys();
    if (!uri) throw new Error('snapshot fixture missing');
    f.objects.set(uri, Buffer.from('corrupt immutable snapshot'));

    await expect(f.service.complete(principal, f.input)).resolves.toMatchObject({
      state: 'blocked',
      blocked_reason: 'snapshot_unavailable',
    });
  });

  it('leaves a prepared copy retryable when snapshot storage is temporarily unavailable', async () => {
    const f = harness('application/pdf');
    f.seedPreparedSnapshot();
    f.setSnapshotReadError(new StorageUnavailableError('temporary test outage'));

    await expect(f.service.complete(principal, f.input))
      .rejects.toThrow('temporary test outage');
    expect(f.state()).toMatchObject({ state: 'prepared', blocked_reason: null });
    expect(f.query.mock.calls.some(([sql]) => String(sql).includes("SET state = 'blocked'")))
      .toBe(false);
  });

  it('rejects a replay whose title changes without replacing the original binding', async () => {
    const f = harness('application/pdf');
    await f.service.prepare(principal, f.input);
    await expect(f.service.prepare(principal, { ...f.input, title: '다른 이름' }))
      .rejects.toMatchObject({ response: expect.objectContaining({
        reason: 'native_copy_idempotency_conflict',
      }) });
    expect(f.lifecycleService.download).toHaveBeenCalledTimes(1);
  });
});
