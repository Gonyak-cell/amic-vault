import { BadRequestException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../audit/audit.service';
import type { PermissionQueryBuilder } from '../permission/permission-query.builder';
import type { SearchPermissionScopeProvider } from '../search/permission/search-permission-scope.provider';
import { SavedItemService } from './saved-item.service';

const tenantId = '11111111-1111-4111-8111-111111111100';
const userId = '11111111-1111-4111-8111-111111111101';
const sessionId = '11111111-1111-4111-8111-111111111102';
const documentId = '11111111-1111-4111-8111-111111111114';
const matterId = '11111111-1111-4111-8111-111111111115';
const savedItemId = '11111111-1111-4111-8111-111111111914';
const now = new Date('2026-07-28T00:00:00.000Z');
const ctx = { tenantId, userId, sessionId };

interface QueryReply {
  rows: unknown[];
  rowCount?: number;
}

function setup(replies: QueryReply[]) {
  const query = vi.fn(async (sql: string, params?: readonly unknown[]) => {
    void sql;
    void params;
    const reply = replies.shift();
    if (!reply) return { rows: [], rowCount: 0 };
    return { rows: reply.rows, rowCount: reply.rowCount ?? reply.rows.length };
  });
  const client = { query } as unknown as PoolClient;
  const log = vi.fn(async () => ({ eventId: savedItemId, createdAt: now }));
  const transaction = vi.fn(
    async (_tenantId: string, run: (tx: PoolClient) => Promise<unknown>) => run(client),
  );
  const audit = { log, transaction } as unknown as AuditService;
  const buildMatterFilter = vi.fn(
    (_ctx: unknown, firstParamIndex: number) => ({
      sql: `m.matter_id IS NOT NULL AND $${firstParamIndex}::uuid = $${firstParamIndex + 1}::uuid`,
      params: [userId, userId],
      appliedRules: ['matter_members:required_for_read'],
    }),
  );
  const permissionQuery = { buildMatterFilter } as unknown as PermissionQueryBuilder;
  const scopeForSearch = vi.fn(async () => ({
    effect: 'ALLOW' as const,
    scope: {
      sql: 'idx.tenant_id = ? AND idx.document_id = ANY(?::uuid[])',
      params: [tenantId, [documentId]],
    },
  }));
  const scope = { scopeForSearch } as SearchPermissionScopeProvider;
  return {
    service: new SavedItemService(audit, permissionQuery, scope),
    query,
    log,
    transaction,
    buildMatterFilter,
    scopeForSearch,
  };
}

describe('SavedItemService', () => {
  it('lists only targets materialized inside existing permission SQL', async () => {
    const fixture = setup([
      { rows: [{ role: 'matter_member', status: 'active' }] },
      {
        rows: [
          {
            saved_item_id: savedItemId,
            target_type: 'document',
            target_id: documentId,
            label: '투자계약서',
            context_label: 'AMIC-2026-0001 · Investment Advisory',
            href: `/documents/${documentId}`,
            position: 0,
            created_at: now,
            updated_at: now,
          },
        ],
      },
    ]);

    const result = await fixture.service.list(ctx);
    const listSql = String(fixture.query.mock.calls[1]?.[0]);
    const listParams = fixture.query.mock.calls[1]?.[1];

    expect(result.items).toHaveLength(1);
    expect(String(fixture.query.mock.calls[0]?.[0])).toContain('FOR UPDATE');
    expect(listSql).toContain('idx.tenant_id = $3');
    expect(listSql).toContain('idx.document_id = ANY($4::uuid[])');
    expect(listSql).toContain("ss.scope_type = 'personal'");
    expect(listSql).toContain('ss.revoked_at IS NULL');
    expect(listParams).toEqual([tenantId, userId, tenantId, [documentId], userId, userId]);
    expect(fixture.buildMatterFilter).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId, userId, role: 'matter_member' }),
      5,
      'm',
    );
  });

  it('treats duplicate creation as idempotent without a second audit event', async () => {
    const fixture = setup([
      { rows: [{ role: 'matter_member', status: 'active' }] },
      {
        rows: [
          {
            document_id: documentId,
            matter_id: matterId,
            title: '투자계약서',
            matter_code: 'AMIC-2026-0001',
            matter_name: 'Investment Advisory',
          },
        ],
      },
      { rows: [{ role: 'matter_member', status: 'active' }] },
      {
        rows: [
          {
            saved_item_id: savedItemId,
            target_type: 'document',
            target_id: documentId,
            position: 0,
            created_at: now,
            updated_at: now,
          },
        ],
      },
    ]);

    const result = await fixture.service.create(ctx, {
      targetType: 'document',
      targetId: documentId,
    });

    expect(result.savedItemId).toBe(savedItemId);
    expect(fixture.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO saved_items'))).toBe(false);
    expect(fixture.log).not.toHaveBeenCalled();
  });

  it('enforces the 100 item bound while holding the user row lock', async () => {
    const fixture = setup([
      { rows: [{ role: 'matter_member', status: 'active' }] },
      {
        rows: [{ matter_id: matterId, matter_name: 'Investment Advisory', matter_code: 'AMIC-2026-0001' }],
      },
      { rows: [{ role: 'matter_member', status: 'active' }] },
      { rows: [] },
      { rows: [{ item_count: '100' }] },
    ]);

    await expect(
      fixture.service.create(ctx, { targetType: 'matter', targetId: matterId }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(String(fixture.query.mock.calls[2]?.[0])).toContain('FOR UPDATE');
    expect(fixture.log).not.toHaveBeenCalled();
  });

  it('removes the owned preference, compacts positions, and audits in one transaction', async () => {
    const fixture = setup([
      { rows: [{ role: 'matter_member', status: 'active' }] },
      { rows: [] },
      {
        rows: [
          {
            saved_item_id: savedItemId,
            target_type: 'document',
            target_id: documentId,
            position: 0,
            created_at: now,
            updated_at: now,
          },
        ],
      },
      { rows: [] },
    ]);

    await fixture.service.remove(ctx, savedItemId);

    expect(String(fixture.query.mock.calls[1]?.[0])).toContain(
      'saved_items_position_unique DEFERRED',
    );
    expect(String(fixture.query.mock.calls[3]?.[0])).toContain('row_number() OVER');
    expect(fixture.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SAVED_ITEM_REMOVED',
        actorId: userId,
        targetId: savedItemId,
      }),
      expect.anything(),
    );
  });

  it('locks the complete personal order and audits a changed exact set', async () => {
    const secondSavedItemId = '11111111-1111-4111-8111-111111111915';
    const fixture = setup([
      { rows: [{ role: 'matter_member', status: 'active' }] },
      { rows: [{ saved_item_id: savedItemId }, { saved_item_id: secondSavedItemId }] },
      { rows: [] },
      { rows: [] },
    ]);

    await fixture.service.reorder(ctx, {
      savedItemIds: [secondSavedItemId, savedItemId],
    });

    expect(String(fixture.query.mock.calls[1]?.[0])).toContain('FOR UPDATE');
    expect(String(fixture.query.mock.calls[3]?.[0])).toContain(
      'unnest($3::uuid[]) WITH ORDINALITY',
    );
    expect(fixture.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'SAVED_ITEMS_REORDERED',
        metadata: { item_count: 2 },
      }),
      expect.anything(),
    );
  });
});
