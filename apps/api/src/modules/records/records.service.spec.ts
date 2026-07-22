import { describe, expect, it, vi } from 'vitest';
import { allowPermission } from '@amic-vault/shared';
import type { QueryClient } from '../audit/audit.service';
import { RecordsService } from './records.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const matterId = '11111111-1111-4111-8111-111111111122';
const documentId = '11111111-1111-4111-8111-111111111133';
const actorUserId = '11111111-1111-4111-8111-111111111110';
const legalHoldId = '11111111-1111-4111-8111-111111111144';
const sessionId = '11111111-1111-4111-8111-111111111155';
const disposalRequestId = '11111111-1111-4111-8111-111111111166';
const workItemId = '11111111-1111-4111-8111-111111111177';
const auditEventId = '11111111-1111-4111-8111-111111111188';

const ctx = { tenantId, userId: actorUserId, sessionId };

function documentTarget(overrides: Record<string, unknown> = {}) {
  return {
    document_id: documentId,
    matter_id: matterId,
    status: 'final',
    matter_status: 'active',
    document_legal_hold: false,
    matter_legal_hold: false,
    ...overrides,
  };
}

function legalHoldRow(overrides: Record<string, unknown> = {}) {
  return {
    legal_hold_id: legalHoldId,
    matter_id: matterId,
    document_id: documentId,
    hold_scope: 'document',
    status: 'active',
    reason_code: 'CLIENT_RECORDS',
    created_by: actorUserId,
    released_by: null,
    created_at: new Date('2026-06-20T00:00:00.000Z'),
    released_at: null,
    ...overrides,
  };
}

function serviceWith(tx: { query: ReturnType<typeof vi.fn> }) {
  const auditLog = vi.fn(async () => ({
    eventId: auditEventId,
    createdAt: new Date('2026-06-20T00:00:00.000Z'),
  }));
  const workService = {
    openRecordsDisposalWork: vi.fn(async () => ({
      workItemId,
      dueAt: new Date('2026-06-27T00:00:00.000Z'),
    })),
    completeRecordsDisposalWork: vi.fn(async () => undefined),
  };
  const storageService = {
    deleteByStorageUri: vi.fn(async () => undefined),
    latestVersionFingerprintByStorageUri: vi.fn(async () => 'a'.repeat(64)),
  };
  const auditTransaction = vi.fn(
    async (_tenantId: string, run: (client: QueryClient) => Promise<unknown>) =>
      run(tx as unknown as QueryClient),
  );
  const auditService = {
    log: auditLog,
    transaction: auditTransaction,
  };
  const service = new RecordsService(
    auditService as never,
    { canEditMatter: vi.fn(async () => allowPermission()) } as never,
    storageService as never,
    { findByTenantAndId: vi.fn(async () => ({ status: 'active', role: 'security_admin' })) } as never,
    workService as never,
  );
  return { auditLog, auditTransaction, service, storageService, workService };
}

describe('RecordsService legal hold lifecycle', () => {
  it('returns actor refs when applying a document legal hold', async () => {
    const tx = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 1, rows: [documentTarget()] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [legalHoldRow()] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }),
    };
    const { auditLog, service } = serviceWith(tx);

    const hold = await service.createLegalHold(ctx, {
      matterId,
      documentId,
      holdScope: 'document',
      reasonCode: 'CLIENT_RECORDS',
    });

    expect(hold).toMatchObject({
      createdBy: actorUserId,
      documentId,
      legalHoldId,
      matterId,
      releasedBy: null,
      status: 'active',
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'LEGAL_HOLD_APPLIED',
        actorId: actorUserId,
        targetId: documentId,
      }),
      tx,
    );
  });

  it('blocks archive before mutating a held document', async () => {
    const tx = {
      query: vi.fn().mockResolvedValueOnce({
        rowCount: 1,
        rows: [documentTarget({ document_legal_hold: true })],
      }),
    };
    const { auditLog, service } = serviceWith(tx);

    await expect(
      service.archiveDocument(ctx, { documentId, reasonCode: 'CLIENT_RECORDS' }),
    ).rejects.toMatchObject({
      response: { code: 'DOCUMENT_LOCKED' },
    });
    expect(tx.query).toHaveBeenCalledTimes(1);
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('opens an audited records approval work item when disposal is requested', async () => {
    const tx = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 1, rows: [documentTarget()] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [{ count: '0' }] })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [
            {
              disposal_request_id: disposalRequestId,
              matter_id: matterId,
              document_id: documentId,
              status: 'requested',
              reason_code: 'CLIENT_RECORDS',
              requested_by: actorUserId,
              approved_by: null,
              executed_by: null,
              assigned_to_user_id: null,
              assigned_role: 'records_admin',
              due_at: new Date('2026-06-27T00:00:00.000Z'),
              workflow_item_id: null,
              workflow_audit_event_id: null,
              created_at: new Date('2026-06-20T00:00:00.000Z'),
              approved_at: null,
              executed_at: null,
              certificate_id: null,
            },
          ],
        })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }),
    };
    const { auditLog, service, workService } = serviceWith(tx);

    const request = await service.createDisposalRequest(ctx, {
      documentId,
      reasonCode: 'CLIENT_RECORDS',
    });

    expect(request).toMatchObject({
      assignedRole: 'records_admin',
      disposalRequestId,
      dueAt: '2026-06-27T00:00:00.000Z',
      status: 'requested',
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DISPOSAL_REQUESTED', targetId: documentId }),
      tx,
    );
    expect(workService.openRecordsDisposalWork).toHaveBeenCalledWith(tx, {
      tenantId,
      disposalRequestId,
      matterId,
      documentId,
      actorUserId,
      auditEventId,
      kind: 'records_disposal_approval',
    });
  });

  it('lists active disposal reviews with display labels for the records console', async () => {
    const tx = {
      query: vi.fn().mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            disposal_request_id: disposalRequestId,
            matter_id: matterId,
            document_id: documentId,
            status: 'requested',
            reason_code: 'RETENTION_EXPIRED',
            requested_by: actorUserId,
            approved_by: null,
            executed_by: null,
            assigned_to_user_id: null,
            assigned_role: 'records_admin',
            due_at: new Date('2026-06-27T00:00:00.000Z'),
            workflow_item_id: workItemId,
            workflow_audit_event_id: auditEventId,
            created_at: new Date('2026-06-20T00:00:00.000Z'),
            approved_at: null,
            executed_at: null,
            certificate_id: null,
            matter_code: 'REC-2026-0001',
            matter_name: 'Records Governance Review',
            document_title: 'Retention Review Candidate',
          },
        ],
      }),
    };
    const { service } = serviceWith(tx);

    const response = await service.listDisposalRequests(ctx);

    expect(response.disposals).toEqual([
      expect.objectContaining({
        disposalRequestId,
        documentTitle: 'Retention Review Candidate',
        matterCode: 'REC-2026-0001',
        matterName: 'Records Governance Review',
        reviewSource: 'retention_scheduler',
        status: 'requested',
      }),
    ]);
    expect(tx.query).toHaveBeenCalledWith(expect.stringContaining('dr.status IN'), [tenantId]);
  });

  it('seals one repeatable-read disposal inventory and returns the same pending reference on retry', async () => {
    const approvedRow = {
      disposal_request_id: disposalRequestId,
      matter_id: matterId,
      document_id: documentId,
      status: 'approved',
      reason_code: 'CLIENT_RECORDS',
      requested_by: '11111111-1111-4111-8111-111111111199',
      approved_by: actorUserId,
      executed_by: null,
      assigned_to_user_id: null,
      assigned_role: 'records_admin',
      due_at: new Date('2026-06-27T00:00:00.000Z'),
      workflow_item_id: null,
      workflow_audit_event_id: null,
      created_at: new Date('2026-06-20T00:00:00.000Z'),
      approved_at: new Date('2026-06-20T00:01:00.000Z'),
      executed_at: null,
      certificate_id: null,
      pending_execution_ref: null,
    };
    const tx = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('FROM disposal_requests dr')) {
          return { rowCount: 1, rows: [{ ...approvedRow, status: 'requested', approved_by: null, approved_at: null }] };
        }
        if (sql.includes('FROM documents d')) return { rowCount: 1, rows: [documentTarget()] };
        if (sql.includes('SELECT count(*)::text AS count')) return { rowCount: 1, rows: [{ count: '0' }] };
        if (sql.includes('FROM document_versions')) {
          return {
            rowCount: 1,
            rows: [
              {
                version_id: '11111111-1111-4111-8111-111111111177',
                file_object_id: '11111111-1111-4111-8111-111111111188',
                file_hash: 'b'.repeat(64),
                storage_uri: `s3://amic-vault-dev/tenants/${tenantId}/matters/${matterId}/documents/${documentId}/11111111-1111-4111-8111-111111111188`,
                sha256: 'b'.repeat(64),
              },
            ],
          };
        }
        if (sql.includes('FROM document_preview_artifacts')) return { rowCount: 0, rows: [] };
        if (sql.includes('UPDATE disposal_requests')) return { rowCount: 1, rows: [approvedRow] };
        if (sql.includes('INSERT INTO records_disposal_outbox')) {
          return { rowCount: 1, rows: [{ disposal_outbox_id: workItemId }] };
        }
        if (sql.includes('INSERT INTO records_disposal_inventory')) return { rowCount: 1, rows: [] };
        if (sql.includes('UPDATE disposal_requests\n        SET workflow_item_id')) return { rowCount: 1, rows: [] };
        throw new Error(`unexpected query: ${sql}`);
      }),
    };
    const { auditLog, auditTransaction, service, storageService } = serviceWith(tx);

    const approved = await service.approveDisposalRequest(ctx, disposalRequestId);

    expect(approved).toMatchObject({
      status: 'approved',
      pendingExecutionRef: workItemId,
    });
    expect(auditTransaction).toHaveBeenCalledWith(tenantId, expect.any(Function), {
      isolationLevel: 'repeatable read',
    });
    expect(storageService.latestVersionFingerprintByStorageUri).toHaveBeenCalledTimes(1);
    expect(storageService.deleteByStorageUri).not.toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DISPOSAL_APPROVED',
        metadata: expect.objectContaining({ evidence_id: workItemId, item_count: 1 }),
      }),
      tx,
    );

    const retryTx = {
      query: vi.fn(async () => ({
        rowCount: 1,
        rows: [{ ...approvedRow, pending_execution_ref: workItemId }],
      })),
    };
    const { service: retryService, storageService: retryStorage } = serviceWith(retryTx);
    await expect(retryService.approveDisposalRequest(ctx, disposalRequestId)).resolves.toMatchObject({
      pendingExecutionRef: workItemId,
      status: 'approved',
    });
    expect(retryTx.query).toHaveBeenCalledTimes(1);
    expect(retryStorage.latestVersionFingerprintByStorageUri).not.toHaveBeenCalled();
  });

  it('requires a records-admin audit receipt before returning a terminal disposal to pending', async () => {
    const terminalOutbox = {
      disposal_outbox_id: workItemId,
      disposal_request_id: disposalRequestId,
      state: 'dead_letter' as const,
      last_error_code: 'storage_timeout',
      terminal_at: new Date('2026-06-20T00:05:00.000Z'),
      matter_id: matterId,
      document_id: documentId,
      document_legal_hold: false,
      matter_legal_hold: false,
    };
    const tx = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rowCount: 1, rows: [terminalOutbox] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }),
    };
    const { auditLog, service } = serviceWith(tx);

    await expect(
      service.authorizeDisposalRetry(ctx, disposalRequestId, { reasonCode: 'OPERATOR_REVIEW' }),
    ).resolves.toBeUndefined();

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DISPOSAL_RETRY_AUTHORIZED',
        targetId: workItemId,
        metadata: expect.objectContaining({ reason_code: 'OPERATOR_REVIEW', status_before: 'dead_letter' }),
      }),
      tx,
    );
    expect(tx.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO records_disposal_retry_authorizations'),
      expect.arrayContaining([tenantId, workItemId, 'dead_letter', 'storage_timeout', 'OPERATOR_REVIEW']),
    );
    expect(tx.query).toHaveBeenNthCalledWith(3, expect.stringContaining("SET state = 'pending'"), [
      tenantId,
      workItemId,
      'dead_letter',
    ]);
  });

  it('does not write a retry authorization when its audit receipt fails', async () => {
    const tx = {
      query: vi.fn().mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          disposal_outbox_id: workItemId,
          disposal_request_id: disposalRequestId,
          state: 'blocked',
          last_error_code: 'storage_access_denied',
          terminal_at: new Date('2026-06-20T00:05:00.000Z'),
          matter_id: matterId,
          document_id: documentId,
          document_legal_hold: false,
          matter_legal_hold: false,
        }],
      }),
    };
    const { auditLog, service } = serviceWith(tx);
    auditLog.mockRejectedValueOnce(new Error('audit unavailable'));

    await expect(
      service.authorizeDisposalRetry(ctx, disposalRequestId, { reasonCode: 'OPERATOR_REVIEW' }),
    ).rejects.toThrow('audit unavailable');
    expect(tx.query).toHaveBeenCalledTimes(1);
  });

  it('certifies only a completed sealed disposal with every immutable receipt', async () => {
    const approvedRow = {
      disposal_request_id: disposalRequestId,
      matter_id: matterId,
      document_id: documentId,
      status: 'approved',
      reason_code: 'CLIENT_RECORDS',
      requested_by: '11111111-1111-4111-8111-111111111199',
      approved_by: actorUserId,
      executed_by: null,
      assigned_to_user_id: null,
      assigned_role: 'records_admin',
      due_at: new Date('2026-06-27T00:00:00.000Z'),
      workflow_item_id: workItemId,
      workflow_audit_event_id: auditEventId,
      created_at: new Date('2026-06-20T00:00:00.000Z'),
      approved_at: new Date('2026-06-20T00:01:00.000Z'),
      executed_at: null,
      certificate_id: null,
      pending_execution_ref: workItemId,
    };
    const certificate = {
      certificate_id: auditEventId,
      disposal_request_id: disposalRequestId,
      matter_id: matterId,
      document_id: documentId,
      document_hash: 'a'.repeat(64),
      certificate_hash: 'b'.repeat(64),
      approved_by: actorUserId,
      executed_by: actorUserId,
      executed_at: new Date('2026-06-20T00:06:00.000Z'),
    };
    const tx = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('FROM disposal_requests dr')) return { rowCount: 1, rows: [approvedRow] };
        if (sql.includes('FROM documents d')) return { rowCount: 1, rows: [documentTarget()] };
        if (sql.includes('FROM legal_holds') || sql.includes('SELECT count(*)::text AS count')) {
          return { rowCount: 1, rows: [{ count: '0' }] };
        }
        if (sql.includes('FROM records_disposal_outbox')) {
          return { rowCount: 1, rows: [{
            disposal_outbox_id: workItemId,
            inventory_hash: 'a'.repeat(64),
            state: 'completed',
          }] };
        }
        if (sql.includes('FROM records_disposal_inventory inventory')) {
          return { rowCount: 1, rows: [{
            disposal_inventory_id: '11111111-1111-4111-8111-111111111155',
            canonical_ordinal: 1,
            outcome: 'deleted',
            receipt_hash: 'c'.repeat(64),
          }] };
        }
        if (sql.includes("UPDATE disposal_requests\n        SET status = 'executed'")) {
          return { rowCount: 1, rows: [{
            disposal_request_id: disposalRequestId,
            matter_id: matterId,
            document_id: documentId,
            approved_by: actorUserId,
            executed_by: actorUserId,
            executed_at: certificate.executed_at,
          }] };
        }
        if (sql.includes('INSERT INTO disposal_certificates')) return { rowCount: 1, rows: [certificate] };
        throw new Error(`unexpected query: ${sql}`);
      }),
    };
    const { auditLog, service, workService } = serviceWith(tx);

    await expect(service.executeDisposalRequest(ctx, disposalRequestId)).resolves.toMatchObject({
      certificateId: auditEventId,
      certificateHash: 'b'.repeat(64),
      disposalRequestId,
    });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DISPOSAL_CERTIFICATE_CREATED',
        metadata: expect.objectContaining({ evidence_id: workItemId, item_count: 1 }),
      }),
      tx,
    );
    expect(workService.completeRecordsDisposalWork).toHaveBeenCalledWith(tx, expect.objectContaining({
      kind: 'records_disposal_execution',
    }));
  });

  it('blocks certification before any state mutation when a sealed receipt is missing', async () => {
    const tx = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes('FROM disposal_requests dr')) {
          return { rowCount: 1, rows: [{
            disposal_request_id: disposalRequestId,
            matter_id: matterId,
            document_id: documentId,
            status: 'approved',
            reason_code: 'CLIENT_RECORDS',
            requested_by: '11111111-1111-4111-8111-111111111199',
            approved_by: actorUserId,
            executed_by: null,
            assigned_to_user_id: null,
            assigned_role: 'records_admin',
            due_at: new Date('2026-06-27T00:00:00.000Z'),
            workflow_item_id: workItemId,
            workflow_audit_event_id: auditEventId,
            created_at: new Date('2026-06-20T00:00:00.000Z'),
            approved_at: new Date('2026-06-20T00:01:00.000Z'),
            executed_at: null,
            certificate_id: null,
            pending_execution_ref: workItemId,
          }] };
        }
        if (sql.includes('FROM documents d')) return { rowCount: 1, rows: [documentTarget()] };
        if (sql.includes('FROM legal_holds') || sql.includes('SELECT count(*)::text AS count')) {
          return { rowCount: 1, rows: [{ count: '0' }] };
        }
        if (sql.includes('FROM records_disposal_outbox')) {
          return { rowCount: 1, rows: [{
            disposal_outbox_id: workItemId,
            inventory_hash: 'a'.repeat(64),
            state: 'completed',
          }] };
        }
        if (sql.includes('FROM records_disposal_inventory inventory')) {
          return { rowCount: 1, rows: [{
            disposal_inventory_id: '11111111-1111-4111-8111-111111111155',
            canonical_ordinal: 1,
            outcome: null,
            receipt_hash: null,
          }] };
        }
        throw new Error(`unexpected query: ${sql}`);
      }),
    };
    const { auditLog, service } = serviceWith(tx);

    await expect(service.executeDisposalRequest(ctx, disposalRequestId)).rejects.toMatchObject({
      response: { reason: 'DISPOSAL_RECEIPTS_INCOMPLETE' },
    });
    expect(tx.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE disposal_requests'))).toBe(false);
    expect(auditLog).not.toHaveBeenCalled();
  });
});
