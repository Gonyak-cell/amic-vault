import { describe, expect, it, vi } from 'vitest';
import type { QueryClient } from '../audit/audit.service';
import { PermissionQueryBuilder } from '../permission/permission-query.builder';
import {
  DEFAULT_LOCAL_AI_FILE_ORG_POLICY_NAME,
  MatterService,
  canChangeLegalHoldRole,
  canCreateMatterRole,
} from './matter.service';

describe('matter conservative guards', () => {
  it('allows only firm admin and matter owner to create matters', () => {
    expect(canCreateMatterRole('firm_admin')).toBe(true);
    expect(canCreateMatterRole('matter_owner')).toBe(true);
    expect(canCreateMatterRole('matter_member')).toBe(false);
  });

  it('allows only firm admin and security admin to change legal hold flags', () => {
    expect(canChangeLegalHoldRole('firm_admin')).toBe(true);
    expect(canChangeLegalHoldRole('security_admin')).toBe(true);
    expect(canChangeLegalHoldRole('matter_owner')).toBe(false);
    expect(canChangeLegalHoldRole('matter_member')).toBe(false);
  });

  it('keeps the default local AI policy name narrow to file organization prep', () => {
    expect(DEFAULT_LOCAL_AI_FILE_ORG_POLICY_NAME).toBe('AMIC local file organization prep');
  });

  it('searches safe Matter labels inside the permission-filtered list query', async () => {
    const tenantId = '11111111-1111-4111-8111-111111111100';
    const actorUserId = '11111111-1111-4111-8111-111111111101';
    const clientId = '11111111-1111-4111-8111-111111111102';
    const query = vi.fn<QueryClient['query']>().mockResolvedValue({ rows: [], rowCount: 0 });
    const tenantTransaction = vi.fn(
      async (_tenantId: string, run: (client: { query: typeof query }) => Promise<unknown>) =>
        run({ query }),
    );
    const service = new MatterService(
      {} as never,
      { tenantTransaction } as never,
      {} as never,
      new PermissionQueryBuilder(),
      {} as never,
      {
        require: () => ({ tenantId, slug: 'alpha', status: 'active', source: 'session' }),
      } as never,
      {
        findByTenantAndId: vi.fn(async () => ({ role: 'matter_owner' })),
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.list(actorUserId, {
      clientId,
      matterType: 'contract',
      page: 2,
      pageSize: 10,
      q: '100%_Deal\\',
      status: 'open',
    });

    const [sql, params] = query.mock.calls[0] ?? [];
    expect(sql).toContain('FROM matter_members');
    expect(sql).toContain('ethical_wall_memberships');
    expect(sql).toContain('WHERE matters.tenant_id = $1');
    expect(sql).toContain("matters.matter_code ILIKE $8 ESCAPE '\\'");
    expect(sql).toContain("matters.matter_name ILIKE $8 ESCAPE '\\'");
    expect(sql).toContain("clients.name ILIKE $8 ESCAPE '\\'");
    expect(sql).not.toContain('documents');
    expect(sql).not.toContain('document_versions');
    expect(sql).not.toContain('content_text');
    expect(sql).not.toContain('body_text');
    expect(params).toEqual([
      tenantId,
      actorUserId,
      actorUserId,
      'matter_owner',
      'open',
      'contract',
      clientId,
      '%100\\%\\_Deal\\\\%',
      10,
      10,
    ]);
  });
});
