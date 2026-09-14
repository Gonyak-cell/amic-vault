import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { UploadedDiskFile } from '../../document/document-upload.service';
import type {
  AmicOsVaultUploadPreflightInput,
  AmicOsVaultUploadReadbackInput,
} from './amic-os-vault-upload.contract';
import type { AmicOsVaultProviderPrincipal } from './amic-os-vault-provider.guard';
import {
  AmicOsVaultUploadService,
  amicOsVaultUploadDeterministicRefs,
} from './amic-os-vault-upload.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '22222222-2222-4222-8222-222222222222';
const matterId = '33333333-3333-4333-8333-333333333333';
const workspaceId = '44444444-4444-4444-8444-444444444444';
const preflightAuditEventId = '55555555-5555-4555-8555-555555555555';
const quarantineAuditEventId = '66666666-6666-4666-8666-666666666666';
const promotionAuditEventId = '77777777-7777-4777-8777-777777777777';
const scanId = '88888888-8888-4888-8888-888888888888';
const documentId = '99999999-9999-4999-8999-999999999999';
const versionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const fileObjectId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const liveClientId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const accountLedgerId = 'user_amic_jwsuh';
const operationId = `vaultop_${'1'.repeat(32)}`;
const correlationId = `vaultcorr_${'2'.repeat(32)}`;
const content = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF');
const fileSha256 = createHash('sha256').update(content).digest('hex');
const storageUri = `s3://vault-dev/tenants/${tenantId}/matters/${matterId}/documents/${documentId}/files/${fileObjectId}`;

const principal: AmicOsVaultProviderPrincipal = {
  accountLedgerId,
  tenantId,
  actorUserId,
};

function preflightInput(): AmicOsVaultUploadPreflightInput {
  return {
    principal: { tenant_id: 'lawos-tenant', user_id: accountLedgerId },
    lawos_matter_id: 'lawos-matter-1',
    requested_workspace_id: null,
    requested_folder_id: null,
    operation_id: operationId,
    correlation_id: correlationId,
    request_id: 'request-preflight-1',
  };
}

async function uploadedFile(): Promise<UploadedDiskFile> {
  const directory = await mkdtemp(join(tmpdir(), 'amic-os-vault-upload-service-'));
  const path = join(directory, 'contract.pdf');
  await writeFile(path, content);
  return {
    path,
    originalname: 'contract.pdf',
    mimetype: 'application/pdf',
    size: content.length,
  };
}

function createHarness({ existingMatter = true } = {}) {
  let preflightAudit: {
    event_id: string;
    created_at: Date;
    correlation_id: string;
    metadata_json: Record<string, unknown>;
  } | null = null;
  let operationFingerprint: string | null = null;
  let idempotencyHash: string | null = null;
  let uploadState: 'quarantined' | 'scanning' | 'infected' | 'security_hold' | 'error' | 'promoted' = 'quarantined';
  let matterProjected = existingMatter;
  let clientProjected = existingMatter;

  const query = vi.fn(async (sql: string, parameters: unknown[] = []) => {
    if (sql.includes('pg_advisory_xact_lock')) return { rowCount: 1, rows: [{}] };
    if (sql.includes('FROM matters') && sql.includes('metadata_json')) {
      return matterProjected ? {
        rowCount: 1,
        rows: [{ matter_id: matterId, client_id: liveClientId, status: 'active', legal_hold: false, metadata_json: {} }],
      } : { rowCount: 0, rows: [] };
    }
    if (sql.includes('FROM clients') && sql.includes('metadata_json')) {
      return clientProjected
        ? { rowCount: 1, rows: [{ client_id: liveClientId }] }
        : { rowCount: 0, rows: [] };
    }
    if (sql.includes('INSERT INTO clients')) {
      clientProjected = true;
      return { rowCount: 1, rows: [{ client_id: liveClientId }] };
    }
    if (sql.includes('INSERT INTO matters')) {
      matterProjected = true;
      return {
        rowCount: 1,
        rows: [{ matter_id: matterId, client_id: liveClientId, status: 'active', legal_hold: false }],
      };
    }
    if (sql.includes('INSERT INTO matter_members')) {
      return { rowCount: 1, rows: [{ matter_id: matterId }] };
    }
    if (sql.includes('FROM workspaces')) {
      return { rowCount: 1, rows: [{ workspace_id: workspaceId }] };
    }
    if (sql.includes('SELECT event_id, created_at, correlation_id, metadata_json')) {
      return preflightAudit
        ? { rowCount: 1, rows: [preflightAudit] }
        : { rowCount: 0, rows: [] };
    }
    if (
      sql.includes("target_type = 'amic_os_vault_upload_preflight'") &&
      sql.includes('SELECT correlation_id, metadata_json')
    ) {
      return preflightAudit
        ? {
            rowCount: 1,
            rows: [{
              correlation_id: preflightAudit.correlation_id,
              metadata_json: preflightAudit.metadata_json,
            }],
          }
        : { rowCount: 0, rows: [] };
    }
    if (sql.includes('FROM file_security_scans s') && sql.includes('file_security_promotions')) {
      return {
        rowCount: 1,
        rows: [{
          scan_id: scanId,
          matter_id: matterId,
          expected_sha256: fileSha256,
          size_bytes: String(content.length),
          state: uploadState,
          result_code: uploadState === 'promoted' ? 'clean' : uploadState,
          created_by: actorUserId,
          original_filename: 'contract.pdf',
          normalized_filename: 'contract.pdf',
          mime_type: 'application/pdf',
          source_system: 'upload',
          fields_json: {},
          document_id: uploadState === 'promoted' ? documentId : null,
          version_id: uploadState === 'promoted' ? versionId : null,
          file_object_id: uploadState === 'promoted' ? fileObjectId : null,
          primary_sha256: uploadState === 'promoted' ? fileSha256 : null,
          storage_uri: uploadState === 'promoted' ? storageUri : null,
          file_sha256: uploadState === 'promoted' ? fileSha256 : null,
          file_size_bytes: uploadState === 'promoted' ? String(content.length) : null,
          file_mime_type: uploadState === 'promoted' ? 'application/pdf' : null,
          document_matter_id: uploadState === 'promoted' ? matterId : null,
          matter_status: 'active',
          matter_legal_hold: false,
        }],
      };
    }
    if (sql.includes('AND action = $3') && sql.includes("target_type = 'file_security_scan'")) {
      const action = parameters[2];
      const eventId = action === 'FILE_PROMOTED'
        ? promotionAuditEventId
        : quarantineAuditEventId;
      return {
        rowCount: 1,
        rows: [{
          event_id: eventId,
          correlation_id: correlationId,
          metadata_json: {
            hash: fileSha256,
            request_id: operationFingerprint,
            idempotency_hash: idempotencyHash,
          },
        }],
      };
    }
    return { rowCount: 0, rows: [] };
  });
  const tx = { query };
  const auditService = {
    transaction: vi.fn(async (_tenant: string, work: (client: typeof tx) => Promise<unknown>) => work(tx)),
    log: vi.fn(async (entry: { action: string; targetType: string; metadata: Record<string, unknown> }) => {
      if (entry.targetType === 'amic_os_vault_upload_preflight') {
        preflightAudit = {
          event_id: preflightAuditEventId,
          created_at: new Date(),
          correlation_id: String(entry.metadata.correlation_id),
          metadata_json: entry.metadata,
        };
      }
      return { eventId: preflightAuditEventId };
    }),
  };
  const matterSourcePolicy = {
    assertUploadMutationAllowed: vi.fn(async () => ({
      permissionDecisionRef: 'matter-source-policy:allow',
    })),
  };
  const quarantineIntake = {
    intakeBound: vi.fn(async (input: {
      file: UploadedDiskFile;
      binding: { requestFingerprint: string; idempotencyHash: string };
    }) => {
      operationFingerprint = input.binding.requestFingerprint;
      idempotencyHash = input.binding.idempotencyHash;
      return {
        status: 'quarantined',
        matterId,
        quarantineRef: amicOsVaultUploadDeterministicRefs.quarantineRef(tenantId, operationId),
        scanId,
        auditEventId: quarantineAuditEventId,
        expectedSha256: fileSha256,
        byteSize: input.file.size,
        mimeType: input.file.mimetype,
        replayed: false,
      };
    }),
    intakeBoundStored: vi.fn(async (input: {
      file: { byteSize: number; mimeType: string };
      binding: { expectedSha256: string; requestFingerprint: string; idempotencyHash: string };
    }) => {
      operationFingerprint = input.binding.requestFingerprint;
      idempotencyHash = input.binding.idempotencyHash;
      return {
        status: 'quarantined',
        matterId,
        quarantineRef: amicOsVaultUploadDeterministicRefs.quarantineRef(tenantId, operationId),
        scanId,
        auditEventId: quarantineAuditEventId,
        expectedSha256: input.binding.expectedSha256,
        byteSize: input.file.byteSize,
        mimeType: input.file.mimeType,
        replayed: false,
      };
    }),
  };
  const storageService = {
    createQuarantineWriteUrl: vi.fn(async (input: {
      contentLength: number;
      contentType: string;
    }) => ({
      url: `https://vault-bucket.s3.ap-northeast-2.amazonaws.com/quarantine/test?X-Amz-Signature=${'a'.repeat(64)}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      headers: {
        'content-length': String(input.contentLength),
        'content-type': input.contentType,
        'if-none-match': '*',
      },
    })),
    headByStorageUri: vi.fn(async () => ({
      contentLength: content.length,
      contentType: 'application/pdf',
    })),
    sha256ByStorageUri: vi.fn(async () => fileSha256),
  };
  const config = {
    uploadAuthorityRef: () => 'amic-vault-api:single-install',
    uploadProviderRevision: () => 'single-install-upload-v1',
  };
  const service = new AmicOsVaultUploadService(
    auditService as never,
    matterSourcePolicy as never,
    quarantineIntake as never,
    storageService as never,
    {
      require: () => ({
        tenantId,
        slug: 'tenant-alpha',
        status: 'active',
        source: 'amic-os-provider',
      }),
    } as never,
    config as never,
  );

  return {
    auditService,
    config,
    matterSourcePolicy,
    quarantineIntake,
    query,
    service,
    setUploadState: (state: typeof uploadState) => { uploadState = state; },
    storageService,
  };
}

describe('AmicOsVaultUploadService', () => {
  it('resolves server authority once and replays only the exact preflight binding', async () => {
    const { auditService, service } = createHarness();
    const input = preflightInput();
    const first = await service.preflight(principal, input);
    const replay = await service.preflight(principal, input);

    expect(first).toEqual(replay);
    expect(first).toMatchObject({
      authority_kind: 'amic-vault-api',
      authority_ref: 'amic-vault-api:single-install',
      provider_revision: 'single-install-upload-v1',
      resolved: {
        vault_tenant_id: tenantId,
        vault_actor_id: actorUserId,
        vault_matter_id: matterId,
        vault_workspace_id: workspaceId,
        vault_folder_id: null,
      },
      audit: { event_id: preflightAuditEventId, correlation_id: correlationId },
    });
    expect(auditService.log).toHaveBeenCalledOnce();
    expect(first.preflight_ref).toBe(
      `vault-preflight:${amicOsVaultUploadDeterministicRefs.preflightTargetId(tenantId, operationId)}`,
    );

    await expect(service.preflight(principal, {
      ...input,
      lawos_matter_id: 'lawos-matter-confused-deputy',
    })).rejects.toMatchObject({
      response: { reason: 'VAULT_UPLOAD_PREFLIGHT_CONFLICT' },
    });
  });

  it('reflects one authenticated live LawOS Matter and grants only its current actor edit access', async () => {
    const { auditService, matterSourcePolicy, query, service } = createHarness({ existingMatter: false });
    const input: AmicOsVaultUploadPreflightInput = {
      ...preflightInput(),
      matter_projection: {
        lawos_client_id: 'lawos-client-live-1',
        client_display_name: 'AMIC Web QA',
        matter_code: null,
        matter_name: 'Web upload verification',
        matter_status: 'open',
        source_revision: 'lawos-live-matter-projection-v1',
        source_updated_at: new Date().toISOString(),
      },
    };

    await expect(service.preflight(principal, input)).resolves.toMatchObject({
      resolved: {
        vault_matter_id: matterId,
        vault_actor_id: actorUserId,
      },
    });
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO clients'))).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO matters'))).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO matter_members'))).toBe(true);
    expect(auditService.log.mock.calls.map(([entry]) => entry.action)).toEqual([
      'CLIENT_CREATED',
      'MATTER_CREATED',
      'MATTER_MEMBER_ADDED',
      'PERMISSION_CHANGED',
      'OUTLOOK_DOCUMENT_INSERT_REQUESTED',
    ]);
    expect(matterSourcePolicy.assertUploadMutationAllowed).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId,
        matterId,
        authoritativeSource: {
          mode: 'matter_app_api',
          sourceRevision: 'lawos-live-matter-projection-v1',
          sourceUpdatedAt: input.matter_projection?.source_updated_at,
        },
      }),
    );
  });

  it('binds one multipart commit to the preflight, account, operation, bytes, and idempotency key', async () => {
    const { quarantineIntake, service } = createHarness();
    const sourceUpdatedAt = new Date().toISOString();
    const preflight = await service.preflight(principal, {
      ...preflightInput(),
      matter_projection: {
        lawos_client_id: 'lawos-client-live-1',
        client_display_name: 'AMIC Web QA',
        matter_code: null,
        matter_name: 'Web upload verification',
        matter_status: 'open',
        source_revision: 'lawos-live-matter-projection-v1',
        source_updated_at: sourceUpdatedAt,
      },
    });
    const file = await uploadedFile();
    const commit = await service.commit(principal, {
      principal: { tenant_id: 'lawos-tenant', user_id: accountLedgerId },
      preflight,
      operation: {
        operation_id: operationId,
        correlation_id: correlationId,
        idempotency_key: 'vaultidem:commit-1',
        operation_kind: 'save_local_file',
      },
      file: {
        filename: 'contract.pdf',
        sha256: fileSha256,
        byte_size: content.length,
        mime_type: 'application/pdf',
      },
      request_id: 'request-commit-1',
    }, file);

    expect(commit).toMatchObject({
      state: 'quarantined',
      provider_operation_ref: `vault-upload:${amicOsVaultUploadDeterministicRefs.quarantineRef(tenantId, operationId)}`,
      accepted: {
        sha256: fileSha256,
        byte_size: content.length,
        mime_type: 'application/pdf',
      },
      exact_version: null,
      audit: { event_id: quarantineAuditEventId, correlation_id: correlationId },
    });
    expect(quarantineIntake.intakeBound).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId,
        authoritativeMatterSource: {
          mode: 'matter_app_api',
          operationExpiresAt: preflight.expires_at,
          sourceRevision: 'lawos-live-matter-projection-v1',
          sourceUpdatedAt,
        },
        matterId,
        binding: expect.objectContaining({
          quarantineRef: amicOsVaultUploadDeterministicRefs.quarantineRef(tenantId, operationId),
          expectedSha256: fileSha256,
          correlationId,
          requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/u),
          idempotencyHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
        }),
      }),
    );
  });

  it('prepares direct quarantine ingress and completes from metadata without API file bytes', async () => {
    const { quarantineIntake, service, storageService } = createHarness();
    const sourceUpdatedAt = new Date().toISOString();
    const preflight = await service.preflight(principal, {
      ...preflightInput(),
      matter_projection: {
        lawos_client_id: 'lawos-client-live-1',
        client_display_name: 'AMIC Web QA',
        matter_code: null,
        matter_name: 'Web upload verification',
        matter_status: 'open',
        source_revision: 'lawos-live-matter-projection-v1',
        source_updated_at: sourceUpdatedAt,
      },
    });
    const operation = {
      operation_id: operationId,
      correlation_id: correlationId,
      idempotency_key: 'vaultidem:direct-1',
      operation_kind: 'save_local_file' as const,
    };
    const file = {
      filename: 'contract.pdf',
      byte_size: content.length,
      mime_type: 'application/pdf',
    };
    const prepared = await service.prepare(principal, {
      principal: { tenant_id: 'lawos-tenant', user_id: accountLedgerId },
      preflight,
      operation,
      file,
      request_id: 'request-prepare-1',
    });

    expect(prepared).toMatchObject({
      state: 'transfer_ready',
      method: 'PUT',
      transfer_ref: `vault-transfer:${amicOsVaultUploadDeterministicRefs.quarantineRef(tenantId, operationId)}`,
      required_headers: {
        'content-length': String(content.length),
        'content-type': 'application/pdf',
        'if-none-match': '*',
      },
      file,
      max_upload_bytes: 1024 * 1024 * 1024,
    });
    expect(storageService.createQuarantineWriteUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        quarantineRef: amicOsVaultUploadDeterministicRefs.quarantineRef(tenantId, operationId),
        contentLength: content.length,
        contentType: 'application/pdf',
      }),
    );

    const committed = await service.complete(principal, {
      principal: { tenant_id: 'lawos-tenant', user_id: accountLedgerId },
      preflight,
      operation,
      transfer: { transfer_ref: prepared.transfer_ref },
      file: { ...file, sha256: fileSha256 },
      request_id: 'request-complete-1',
    });
    expect(committed).toMatchObject({
      state: 'quarantined',
      accepted: { sha256: fileSha256, byte_size: content.length, mime_type: 'application/pdf' },
      exact_version: null,
    });
    expect(quarantineIntake.intakeBoundStored).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId,
        authoritativeMatterSource: {
          mode: 'matter_app_api',
          operationExpiresAt: preflight.expires_at,
          sourceRevision: 'lawos-live-matter-projection-v1',
          sourceUpdatedAt,
        },
        matterId,
        file: {
          originalFilename: 'contract.pdf',
          mimeType: 'application/pdf',
          byteSize: content.length,
        },
        binding: expect.objectContaining({
          expectedSha256: fileSha256,
          quarantineRef: amicOsVaultUploadDeterministicRefs.quarantineRef(tenantId, operationId),
        }),
      }),
    );
    expect(JSON.stringify(quarantineIntake.intakeBoundStored.mock.calls)).not.toContain('bytes');
  });

  it('returns exact document/version/file authority only after primary-object readback', async () => {
    const { service, setUploadState, storageService } = createHarness();
    const preflight = await service.preflight(principal, preflightInput());
    const commitFile = await uploadedFile();
    const commit = await service.commit(principal, {
      principal: { tenant_id: 'lawos-tenant', user_id: accountLedgerId },
      preflight,
      operation: {
        operation_id: operationId,
        correlation_id: correlationId,
        idempotency_key: 'vaultidem:commit-1',
        operation_kind: 'save_local_file',
      },
      file: {
        filename: 'contract.pdf',
        sha256: fileSha256,
        byte_size: content.length,
        mime_type: 'application/pdf',
      },
      request_id: 'request-commit-1',
    }, commitFile);
    setUploadState('promoted');

    const readbackInput: AmicOsVaultUploadReadbackInput = {
      principal: { tenant_id: 'lawos-tenant', user_id: accountLedgerId },
      preflight,
      commit,
      operation: {
        operation_id: operationId,
        correlation_id: correlationId,
        operation_kind: 'save_local_file',
      },
      expected: commit.accepted,
      request_id: 'request-readback-1',
    };
    await expect(service.readback(principal, readbackInput)).resolves.toMatchObject({
      state: 'readback_verified',
      exact_version: {
        document_id: documentId,
        version_id: versionId,
        file_object_id: fileObjectId,
        sha256: fileSha256,
        byte_size: content.length,
        mime_type: 'application/pdf',
      },
      retry_after_ms: null,
      audit: { event_id: promotionAuditEventId, correlation_id: correlationId },
    });
    expect(storageService.headByStorageUri).toHaveBeenCalledWith(tenantId, storageUri);
    expect(storageService.sha256ByStorageUri).toHaveBeenCalledWith(tenantId, storageUri);
  });

  it('returns a terminal negative state without exposing document/version authority', async () => {
    const { service, setUploadState, storageService } = createHarness();
    const preflight = await service.preflight(principal, preflightInput());
    const commitFile = await uploadedFile();
    const commit = await service.commit(principal, {
      principal: { tenant_id: 'lawos-tenant', user_id: accountLedgerId },
      preflight,
      operation: {
        operation_id: operationId,
        correlation_id: correlationId,
        idempotency_key: 'vaultidem:commit-1',
        operation_kind: 'save_local_file',
      },
      file: {
        filename: 'contract.pdf',
        sha256: fileSha256,
        byte_size: content.length,
        mime_type: 'application/pdf',
      },
      request_id: 'request-commit-1',
    }, commitFile);
    setUploadState('infected');

    await expect(service.readback(principal, {
      principal: { tenant_id: 'lawos-tenant', user_id: accountLedgerId },
      preflight,
      commit,
      operation: {
        operation_id: operationId,
        correlation_id: correlationId,
        operation_kind: 'save_local_file',
      },
      expected: commit.accepted,
      request_id: 'request-readback-1',
    })).resolves.toMatchObject({
      state: 'infected',
      exact_version: null,
      retry_after_ms: null,
      decisions: null,
    });
    expect(storageService.headByStorageUri).not.toHaveBeenCalled();
  });
});
