import { describe, expect, it, vi } from 'vitest';
import { LawDataService } from './law-data.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const authorityId = '11111111-1111-4111-8111-111111111222';
const graphNodeId = '11111111-1111-4111-8111-111111111333';

const refreshedLaw = {
  externalRef: '001570',
  title: '상법',
  citation: '상법 (20260701 시행)',
  sourceUrl: 'https://www.law.go.kr/법령/상법',
  effectiveDate: '20260701',
  promulgationDate: '20260101',
  ministry: '법무부',
  payload: {
    법령ID: '001570',
    법령명한글: '상법',
    시행일자: '20260701',
  },
};

describe('LawDataService refreshStaleLawAuthoritiesForTenant', () => {
  it('refreshes stale authority rows and records a bounded audit event', async () => {
    const tx = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [{ external_ref: '001570', title: '상법' }],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [{ authority_id: authorityId }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [{ node_id: graphNodeId }], rowCount: 1 }),
    };
    const auditLog = vi.fn(async () => ({
      eventId: '11111111-1111-4111-8111-111111111444',
      createdAt: new Date('2026-07-05T00:00:00.000Z'),
    }));
    const auditService = {
      log: auditLog,
      transaction: vi.fn(async (_tenantId: string, run: (client: typeof tx) => Promise<unknown>) =>
        run(tx),
      ),
    };
    const lawApi = {
      isConfigured: vi.fn(() => true),
      searchLaws: vi.fn(async () => [refreshedLaw]),
    };
    const service = new LawDataService(
      auditService as never,
      lawApi as never,
      { isConfigured: vi.fn(() => true) } as never,
    );

    const result = await service.refreshStaleLawAuthoritiesForTenant(tenantId, {
      limit: 1,
      staleBefore: new Date('2026-07-05T00:00:00.000Z'),
    });

    expect(result).toEqual({
      selectedCount: 1,
      refreshedCount: 1,
      skippedCount: 0,
      notConfigured: false,
    });
    expect(lawApi.searchLaws).toHaveBeenCalledWith({ query: '상법', display: 5, page: 1 });
    expect(String(tx.query.mock.calls[0]?.[0])).toContain('FROM external_authorities');
    expect(String(tx.query.mock.calls[1]?.[0])).toContain('INSERT INTO external_authorities');
    expect(String(tx.query.mock.calls[2]?.[0])).toContain('INSERT INTO graph_nodes');
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: 'system',
        actorId: null,
        action: 'GRAPH_SYNCED',
        targetType: 'external_authority',
        metadata: expect.objectContaining({
          provider_key: 'law.go.kr',
          batch_size: 1,
          result_count: 1,
          stale_count: 0,
          scope_type: 'law_amendment_refresh',
        }),
      }),
      tx,
    );
  });

  it('does not query when law.go.kr credentials are unavailable', async () => {
    const auditService = {
      log: vi.fn(),
      transaction: vi.fn(),
    };
    const service = new LawDataService(
      auditService as never,
      { isConfigured: vi.fn(() => false), searchLaws: vi.fn() } as never,
      { isConfigured: vi.fn(() => true) } as never,
    );

    await expect(service.refreshStaleLawAuthoritiesForTenant(tenantId)).resolves.toEqual({
      selectedCount: 0,
      refreshedCount: 0,
      skippedCount: 0,
      notConfigured: true,
    });
    expect(auditService.transaction).not.toHaveBeenCalled();
  });
});
