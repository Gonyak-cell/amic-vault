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
  const auditLog = vi.fn(async () => undefined);
  const auditService = {
    log: auditLog,
    transaction: vi.fn(async (_tenantId: string, run: (client: QueryClient) => Promise<unknown>) =>
      run(tx as unknown as QueryClient),
    ),
  };
  const service = new RecordsService(
    auditService as never,
    { canEditMatter: vi.fn(async () => allowPermission()) } as never,
    { deleteByStorageUri: vi.fn(async () => undefined) } as never,
    {
      require: vi.fn(() => ({
        tenantId,
        slug: 'tenant-alpha',
        source: 'session',
        status: 'active',
      })),
    } as never,
    { findByTenantAndId: vi.fn(async () => ({ status: 'active', role: 'security_admin' })) } as never,
  );
  return { auditLog, service };
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
});
