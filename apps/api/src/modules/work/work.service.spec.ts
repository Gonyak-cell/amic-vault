import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { TenantId } from '@amic-vault/shared';
import { PermissionQueryBuilder } from '../permission/permission-query.builder';
import { TenantContextService } from '../tenant/tenant-context';
import { WorkService } from './work.service';

const tenantId = '11111111-1111-4111-8111-111111111111' as TenantId;
const actorUserId = '11111111-1111-4111-8111-111111111102';

function createService(rowsFor: (sql: string, params: unknown[] | undefined) => unknown[]) {
  const queries: string[] = [];
  const queryParams: Array<unknown[] | undefined> = [];
  const auditService = {
    async transaction<T>(_tenantId: string, run: (client: { query: typeof query }) => Promise<T>) {
      return run({ query });
    },
  };

  async function query(sql: string, params?: unknown[]) {
    queries.push(sql);
    queryParams.push(params);
    return { rows: rowsFor(sql, params), rowCount: null };
  }

  const context = new TenantContextService();
  return {
    context,
    queryParams,
    queries,
    service: new WorkService(
      auditService as never,
      context,
      new PermissionQueryBuilder(),
    ),
  };
}

describe('WorkService', () => {
  it('lists permission-scoped persisted records disposal tasks without raw ids', async () => {
    const { context, queries, service } = createService((sql) => {
      if (sql.includes('FROM users')) return [{ role: 'security_admin', status: 'active' }];
      if (sql.includes('FROM work_items wi')) {
        return [
          {
            work_item_id: '11111111-1111-4111-8111-1111111111aa',
            source: 'records',
            kind: 'records_disposal_approval',
            status: 'open',
            due_at: new Date('2026-06-24T00:00:00.000Z'),
            updated_at: new Date('2026-06-20T00:00:00.000Z'),
            matter_label: 'AMIC-2026-0001 · Governance',
            disposal_status: 'requested',
            reason_code: 'CLIENT_RECORDS',
            document_title: null,
            document_status: null,
            document_type: null,
            extraction_status: null,
          },
        ];
      }
      return [];
    });

    const response = await context.run(
      { tenantId, slug: 'amic', status: 'active', source: 'session' },
      () => service.listWorkItems(actorUserId, new Date('2026-06-21T00:00:00.000Z')),
    );

    expect(response).toMatchObject({
      source: 'persisted_work_items',
      items: [
        {
          source: 'records',
          sourceLabel: '기록 보존',
          title: '삭제 승인 요청',
          href: '/records?tab=disposal',
          status: 'open',
          dueAt: '2026-06-24T00:00:00.000Z',
        },
      ],
    });
    expect(queries.some((sql) => sql.includes('FROM matter_members mm'))).toBe(true);
    expect(queries.some((sql) => sql.includes('INSERT INTO work_items'))).toBe(true);
    expect(JSON.stringify(response)).not.toMatch(
      /workItemId|documentId|matterId|targetId|11111111-1111-4111-8111-1111111111aa/u,
    );
  });

  it('materializes and lists real document operational work items for assigned users', async () => {
    const { context, queries, queryParams, service } = createService((sql) => {
      if (sql.includes('FROM users')) return [{ role: 'matter_member', status: 'active' }];
      if (sql.includes('FROM work_items wi')) {
        return [
          {
            work_item_id: '11111111-1111-4111-8111-1111111111bb',
            source: 'operational_data',
            kind: 'document_extraction_failed',
            status: 'open',
            due_at: new Date('2026-06-22T00:00:00.000Z'),
            updated_at: new Date('2026-06-20T00:00:00.000Z'),
            matter_label: 'AMIC-2026-0002 · Evidence',
            disposal_status: null,
            reason_code: null,
            document_title: '계약 증거 파일',
            document_status: 'draft',
            document_type: 'contract',
            extraction_status: 'failed',
          },
        ];
      }
      return [];
    });

    const response = await context.run(
      { tenantId, slug: 'amic', status: 'active', source: 'session' },
      () => service.listWorkItems(actorUserId, new Date('2026-06-21T00:00:00.000Z')),
    );

    expect(response.items).toEqual([
      expect.objectContaining({
        source: 'operational_data',
        sourceLabel: '문서 운영',
        title: '추출 실패 확인',
        description: 'AMIC-2026-0002 · Evidence · 계약 증거 파일 · 추출 실패',
        href: '/files?extractionStatus=failed',
        tone: 'blocked',
        status: 'open',
      }),
    ]);
    expect(queries.some((sql) => sql.includes('canonical_documents'))).toBe(true);
    expect(queries.some((sql) => sql.includes("source = 'operational_data'"))).toBe(true);
    expect(queryParams.some((params) => params?.includes(false))).toBe(true);
    expect(JSON.stringify(response)).not.toMatch(
      /workItemId|documentId|matterId|targetId|11111111-1111-4111-8111-1111111111bb/u,
    );
  });

  it('returns no assigned admin work for non-admin actors', async () => {
    const { context, service } = createService((sql) =>
      sql.includes('FROM users') ? [{ role: 'matter_member', status: 'active' }] : [],
    );

    const response = await context.run(
      { tenantId, slug: 'amic', status: 'active', source: 'session' },
      () => service.listWorkItems(actorUserId, new Date('2026-06-21T00:00:00.000Z')),
    );

    expect(response.items).toEqual([]);
  });

  it('fails closed when actor lookup is inactive', async () => {
    const { context, service } = createService((sql) =>
      sql.includes('FROM users') ? [{ role: 'security_admin', status: 'locked' }] : [],
    );

    await context.run(
      { tenantId, slug: 'amic', status: 'active', source: 'session' },
      async () => {
        await expect(service.listWorkItems(actorUserId)).rejects.toBeInstanceOf(ForbiddenException);
      },
    );
  });

  it('persists open and completed disposal work item transitions', async () => {
    const tx = {
      query: vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            {
              work_item_id: '11111111-1111-4111-8111-1111111111aa',
              due_at: new Date('2026-06-27T00:00:00.000Z'),
            },
          ],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }),
    };
    const { service } = createService(() => []);

    await expect(
      service.openRecordsDisposalWork(tx, {
        tenantId,
        disposalRequestId: '22222222-2222-4222-8222-222222222222',
        matterId: '33333333-3333-4333-8333-333333333333',
        documentId: '44444444-4444-4444-8444-444444444444',
        actorUserId,
        auditEventId: '55555555-5555-4555-8555-555555555555',
        kind: 'records_disposal_approval',
      }),
    ).resolves.toMatchObject({
      workItemId: '11111111-1111-4111-8111-1111111111aa',
    });

    await service.completeRecordsDisposalWork(tx, {
      tenantId,
      disposalRequestId: '22222222-2222-4222-8222-222222222222',
      actorUserId,
      auditEventId: '66666666-6666-4666-8666-666666666666',
      kind: 'records_disposal_approval',
    });

    expect(tx.query).toHaveBeenCalledTimes(2);
    expect(tx.query.mock.calls[0]?.[0]).toContain('INSERT INTO work_items');
    expect(tx.query.mock.calls[1]?.[0]).toContain("SET status = 'completed'");
  });
});
