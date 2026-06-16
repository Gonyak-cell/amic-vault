import { ForbiddenException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateOutlookFolderMappingDto } from '@amic-vault/shared';
import {
  type RecordOutlookAutofileJobInput,
  OutlookFolderMappingService,
} from './outlook-folder-mapping.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const userId = '11111111-1111-4111-8111-111111111101';
const adminId = '11111111-1111-4111-8111-111111111102';
const matterId = '11111111-1111-4111-8111-111111111201';
const otherMatterId = '11111111-1111-4111-8111-111111111202';
const mappingId = '11111111-1111-4111-8111-111111111301';
const jobId = '11111111-1111-4111-8111-111111111401';
const hash = 'a'.repeat(64);
const secondHash = 'b'.repeat(64);
const thirdHash = 'c'.repeat(64);
const now = new Date('2026-06-16T00:00:00.000Z');

function mappingInput(
  overrides: Partial<CreateOutlookFolderMappingDto> = {},
): CreateOutlookFolderMappingDto {
  return {
    sourceClient: 'outlook-web-addin',
    matterId,
    mailboxFingerprint: hash,
    folderRefHash: secondHash,
    folderPathHash: thirdHash,
    mappingMode: 'manual',
    autoFileRequested: false,
    clientRequestId: 'folder-client-1',
    idempotencyKey: 'folder-idem-1',
    ...overrides,
  };
}

function mappingRow(overrides: Record<string, unknown> = {}) {
  return {
    mapping_id: mappingId,
    tenant_id: tenantId,
    user_id: userId,
    matter_id: matterId,
    mailbox_fingerprint_hash: hash,
    folder_ref_hash: secondHash,
    folder_path_hash: thirdHash,
    mapping_mode: 'manual',
    approval_status: 'pending_user',
    requested_auto_file: false,
    auto_file_enabled: false,
    denied_reason_code: null,
    source_client: 'outlook-web-addin',
    client_request_id_hash: hash,
    idempotency_key_hash: secondHash,
    approval_actor_id: null,
    approved_at: null,
    revoked_at: null,
    created_at: now,
    updated_at: now,
    duplicate: false,
    ...overrides,
  };
}

function autofileInput(overrides: Partial<RecordOutlookAutofileJobInput> = {}) {
  return {
    mappingId,
    message: {
      mailboxFingerprint: hash,
      outlookItemIdHash: secondHash,
      canonicalMessageSha256: thirdHash,
      hasExternalParticipants: false,
      participantDomainHashes: [],
    },
    clientRequestId: 'autofile-client-1',
    idempotencyKey: 'autofile-idem-1',
    ...overrides,
  } satisfies RecordOutlookAutofileJobInput;
}

function autofileRow(overrides: Record<string, unknown> = {}) {
  return {
    job_id: jobId,
    tenant_id: tenantId,
    mapping_id: mappingId,
    user_id: userId,
    matter_id: matterId,
    mailbox_fingerprint_hash: hash,
    folder_ref_hash: secondHash,
    canonical_message_sha256: thirdHash,
    dedupe_hash: hash,
    expected_matter_id: null,
    status: 'disabled',
    denied_reason_code: 'integration_gate_closed',
    retry_count: 0,
    next_retry_at: null,
    client_request_id_hash: hash,
    idempotency_key_hash: secondHash,
    created_at: now,
    updated_at: now,
    duplicate: false,
    ...overrides,
  };
}

describe('OutlookFolderMappingService', () => {
  const previousFolderGate = process.env.OUTLOOK_FOLDER_MAPPING_ENABLED;
  const previousAutofileGate = process.env.OUTLOOK_AUTOFILE_ENABLED;
  const query = vi.fn();
  const auditService = {
    log: vi.fn(),
    transaction: vi.fn(
      async (_tenantId: string, run: (client: { query: typeof query }) => unknown) =>
        run({ query }),
    ),
  };
  const permissionService = {
    canUploadToMatter: vi.fn(),
  };
  const tenantContext = {
    require: vi.fn(() => ({ tenantId })),
  };
  const service = new OutlookFolderMappingService(
    auditService as never,
    permissionService as never,
    tenantContext as never,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OUTLOOK_FOLDER_MAPPING_ENABLED;
    delete process.env.OUTLOOK_AUTOFILE_ENABLED;
  });

  afterEach(() => {
    if (previousFolderGate === undefined) {
      delete process.env.OUTLOOK_FOLDER_MAPPING_ENABLED;
    } else {
      process.env.OUTLOOK_FOLDER_MAPPING_ENABLED = previousFolderGate;
    }
    if (previousAutofileGate === undefined) {
      delete process.env.OUTLOOK_AUTOFILE_ENABLED;
    } else {
      process.env.OUTLOOK_AUTOFILE_ENABLED = previousAutofileGate;
    }
  });

  it('fails closed and audits when the folder mapping gate is disabled', async () => {
    await expect(service.createFolderMapping(userId, mappingInput())).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(permissionService.canUploadToMatter).not.toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OUTLOOK_FOLDER_MAPPING_CHANGED',
        result: 'denied',
        metadata: expect.objectContaining({
          reason_code: 'integration_gate_closed',
          folder_ref_hash: secondHash,
          folder_path_hash: thirdHash,
          auto_file_enabled: false,
        }),
      }),
    );
  });

  it('creates a pending user-approved mapping through PermissionService and audit', async () => {
    process.env.OUTLOOK_FOLDER_MAPPING_ENABLED = 'true';
    permissionService.canUploadToMatter.mockResolvedValue({ effect: 'ALLOW' });
    query.mockResolvedValueOnce({ rows: [mappingRow()], rowCount: 1 });

    await expect(service.createFolderMapping(userId, mappingInput())).resolves.toMatchObject({
      mappingId,
      matterId,
      folderRefHash: secondHash,
      approvalStatus: 'pending_user',
      autoFileEnabled: false,
    });

    expect(permissionService.canUploadToMatter).toHaveBeenCalledWith(
      { tenantId, userId },
      matterId,
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OUTLOOK_FOLDER_MAPPING_CHANGED',
        metadata: expect.objectContaining({
          mapping_status: 'pending_user',
          folder_ref_hash: secondHash,
          auto_file_enabled: false,
          approval_scope: 'user',
        }),
      }),
      expect.anything(),
    );
  });

  it('denies mapping creation for unauthorized matters', async () => {
    process.env.OUTLOOK_FOLDER_MAPPING_ENABLED = 'true';
    permissionService.canUploadToMatter.mockResolvedValue({ effect: 'DENY' });

    await expect(service.createFolderMapping(userId, mappingInput())).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(query).not.toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OUTLOOK_FOLDER_MAPPING_CHANGED',
        result: 'denied',
        metadata: expect.objectContaining({
          reason_code: 'permission_denied',
          matter_id: matterId,
        }),
      }),
    );
  });

  it('approves a same-user mapping while keeping auto-file disabled by default', async () => {
    process.env.OUTLOOK_FOLDER_MAPPING_ENABLED = 'true';
    permissionService.canUploadToMatter.mockResolvedValue({ effect: 'ALLOW' });
    query
      .mockResolvedValueOnce({ rows: [mappingRow()], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ role: 'matter_owner' }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          mappingRow({
            approval_status: 'active',
            approval_actor_id: userId,
            approved_at: now,
          }),
        ],
        rowCount: 1,
      });

    await expect(
      service.updateFolderMapping(userId, mappingId, {
        approvalDecision: 'approve',
        autoFileEnabled: false,
        clientRequestId: 'folder-approve-1',
      }),
    ).resolves.toMatchObject({
      approvalStatus: 'active',
      autoFileEnabled: false,
      approvedAt: now.toISOString(),
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OUTLOOK_FOLDER_MAPPING_CHANGED',
        metadata: expect.objectContaining({
          status_before: 'pending_user',
          status_after: 'active',
          auto_file_enabled: false,
          approval_scope: 'user',
        }),
      }),
      expect.anything(),
    );
  });

  it('requires admin approval before approving pending-admin mappings', async () => {
    process.env.OUTLOOK_FOLDER_MAPPING_ENABLED = 'true';
    permissionService.canUploadToMatter.mockResolvedValue({ effect: 'ALLOW' });
    query
      .mockResolvedValueOnce({
        rows: [mappingRow({ approval_status: 'pending_admin', requested_auto_file: true })],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ role: 'matter_owner' }], rowCount: 1 });

    await expect(
      service.updateFolderMapping(userId, mappingId, {
        approvalDecision: 'approve',
        autoFileEnabled: false,
        clientRequestId: 'folder-approve-admin-required-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OUTLOOK_FOLDER_MAPPING_CHANGED',
        result: 'denied',
        metadata: expect.objectContaining({
          reason_code: 'approval_required',
          auto_file_enabled: false,
        }),
      }),
    );
  });

  it('requires the auto-file gate before an admin can enable auto-file', async () => {
    process.env.OUTLOOK_FOLDER_MAPPING_ENABLED = 'true';
    permissionService.canUploadToMatter.mockResolvedValue({ effect: 'ALLOW' });
    query
      .mockResolvedValueOnce({
        rows: [mappingRow({ approval_status: 'pending_admin', requested_auto_file: true })],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ role: 'firm_admin' }], rowCount: 1 });

    await expect(
      service.updateFolderMapping(adminId, mappingId, {
        approvalDecision: 'approve',
        autoFileEnabled: true,
        clientRequestId: 'folder-approve-autofile-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OUTLOOK_FOLDER_MAPPING_CHANGED',
        result: 'denied',
        metadata: expect.objectContaining({
          reason_code: 'integration_gate_closed',
          auto_file_enabled: false,
        }),
      }),
    );
  });

  it('fails closed on approve when folder mapping update gate is disabled', async () => {
    permissionService.canUploadToMatter.mockResolvedValue({ effect: 'ALLOW' });
    query
      .mockResolvedValueOnce({
        rows: [mappingRow()],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ role: 'matter_owner' }], rowCount: 1 });

    await expect(
      service.updateFolderMapping(userId, mappingId, {
        approvalDecision: 'approve',
        autoFileEnabled: false,
        clientRequestId: 'folder-gate-disabled-approve-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(permissionService.canUploadToMatter).not.toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'denied',
        metadata: expect.objectContaining({
          reason_code: 'integration_gate_closed',
          status_before: 'pending_user',
        }),
      }),
    );
  });

  it('does not reactivate revoked mappings', async () => {
    process.env.OUTLOOK_FOLDER_MAPPING_ENABLED = 'true';
    permissionService.canUploadToMatter.mockResolvedValue({ effect: 'ALLOW' });
    query
      .mockResolvedValueOnce({
        rows: [mappingRow({ approval_status: 'revoked', revoked_at: now })],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ role: 'matter_owner' }], rowCount: 1 });

    await expect(
      service.updateFolderMapping(userId, mappingId, {
        approvalDecision: 'approve',
        autoFileEnabled: false,
        clientRequestId: 'folder-revoked-reactivate-1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(permissionService.canUploadToMatter).not.toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'denied',
        metadata: expect.objectContaining({
          reason_code: 'policy_denied',
          status_before: 'revoked',
        }),
      }),
    );
  });

  it('records auto-file attempts as disabled until the tenant gate and approval are active', async () => {
    query.mockResolvedValueOnce({
      rows: [mappingRow({ approval_status: 'active', auto_file_enabled: true })],
      rowCount: 1,
    });
    permissionService.canUploadToMatter.mockResolvedValue({ effect: 'ALLOW' });
    query.mockResolvedValueOnce({ rows: [autofileRow()], rowCount: 1 });

    await expect(service.recordAutofileJob(userId, autofileInput())).resolves.toMatchObject({
      jobId,
      mappingId,
      status: 'disabled',
      deniedReasonCode: 'integration_gate_closed',
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OUTLOOK_AUTOFILE_JOB_RECORDED',
        result: 'denied',
        metadata: expect.objectContaining({
          outlook_status: 'disabled',
          reason_code: 'integration_gate_closed',
          folder_ref_hash: secondHash,
        }),
      }),
      expect.anything(),
    );
  });

  it('records wrong-matter auto-file warnings with hash-only job metadata', async () => {
    process.env.OUTLOOK_AUTOFILE_ENABLED = 'true';
    query.mockResolvedValueOnce({
      rows: [mappingRow({ approval_status: 'active', auto_file_enabled: true })],
      rowCount: 1,
    });
    permissionService.canUploadToMatter.mockResolvedValue({ effect: 'ALLOW' });
    query.mockResolvedValueOnce({
      rows: [
        autofileRow({
          status: 'denied',
          denied_reason_code: 'wrong_matter',
          expected_matter_id: otherMatterId,
        }),
      ],
      rowCount: 1,
    });

    await expect(
      service.recordAutofileJob(
        userId,
        autofileInput({
          expectedMatterId: otherMatterId,
        }),
      ),
    ).resolves.toMatchObject({
      status: 'denied',
      deniedReasonCode: 'wrong_matter',
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'OUTLOOK_AUTOFILE_JOB_RECORDED',
        result: 'denied',
        metadata: expect.objectContaining({
          reason_code: 'wrong_matter',
          dedupe_hash: hash,
          folder_ref_hash: secondHash,
        }),
      }),
      expect.anything(),
    );
  });

  it('allows an admin approval path without skipping matter upload permission', async () => {
    process.env.OUTLOOK_FOLDER_MAPPING_ENABLED = 'true';
    process.env.OUTLOOK_AUTOFILE_ENABLED = 'true';
    permissionService.canUploadToMatter.mockResolvedValue({ effect: 'ALLOW' });
    query
      .mockResolvedValueOnce({
        rows: [mappingRow({ approval_status: 'pending_admin', requested_auto_file: true })],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [{ role: 'firm_admin' }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          mappingRow({
            approval_status: 'active',
            auto_file_enabled: true,
            approval_actor_id: adminId,
            approved_at: now,
          }),
        ],
        rowCount: 1,
      });

    await expect(
      service.updateFolderMapping(adminId, mappingId, {
        approvalDecision: 'approve',
        autoFileEnabled: true,
        clientRequestId: 'folder-admin-approve-1',
      }),
    ).resolves.toMatchObject({
      approvalStatus: 'active',
      autoFileEnabled: true,
    });

    expect(permissionService.canUploadToMatter).toHaveBeenCalledWith(
      { tenantId, userId: adminId },
      matterId,
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          auto_file_enabled: true,
          approval_scope: 'admin',
        }),
      }),
      expect.anything(),
    );
  });
});
