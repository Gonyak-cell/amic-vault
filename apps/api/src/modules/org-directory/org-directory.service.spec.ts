import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuditService, QueryClient } from '../audit/audit.service';
import type { PermissionService } from '../permission/permission.service';
import { OrgDirectoryService } from './org-directory.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '11111111-1111-4111-8111-111111111101';
const matterId = '11111111-1111-4111-8111-111111111901';

function createService(actorRole = 'security_admin', permissionEffect: 'ALLOW' | 'DENY' = 'ALLOW') {
  const query = vi.fn(async (sql: string, params?: readonly unknown[]) => {
    if (sql.includes('SELECT role, status')) {
      return {
        rowCount: 1,
        rows: [{ role: actorRole, status: 'active' }],
      };
    }
    if (sql.includes('FROM users') && sql.includes('role <>')) {
      return {
        rowCount: 2,
        rows: [
          {
            user_id: '11111111-1111-4111-8111-111111111201',
            name: 'Alpha Partner',
            email: 'alpha.partner@example.test',
            role: 'matter_owner',
            practice_group: 'corporate',
          },
          {
            user_id: '11111111-1111-4111-8111-111111111202',
            name: 'External Hidden',
            email: 'external@example.test',
            role: 'external_user',
            practice_group: 'external',
          },
        ],
      };
    }
    if (sql.includes('FROM groups')) {
      return {
        rowCount: 1,
        rows: [
          {
            group_id: '11111111-1111-4111-8111-111111111301',
            name: 'Corporate Team',
            group_type: 'team',
          },
        ],
      };
    }
    throw new Error(`unexpected query: ${sql} ${JSON.stringify(params)}`);
  });
  const client = { query } satisfies QueryClient;
  const auditService = {
    transaction: vi.fn(async (_tenantId: string, run: (tx: QueryClient) => Promise<unknown>) =>
      run(client),
    ),
  } as unknown as AuditService;
  const canManageMatterMembers = vi.fn(async () => ({
    effect: permissionEffect,
    appliedRules: [],
  }));
  const permissionService = { canManageMatterMembers } as unknown as PermissionService;
  return {
    canManageMatterMembers,
    query,
    service: new OrgDirectoryService(auditService, permissionService),
  };
}

describe('OrgDirectoryService', () => {
  it('returns tenant-scoped safe subject labels without leaking totals or member counts', async () => {
    const { query, service } = createService();

    const response = await service.searchSubjects(
      { sessionId: 'session-1', tenantId, userId: actorUserId },
      { limit: 10, purpose: 'ethical-wall', q: 'alpha', subjectType: 'all' },
    );

    expect(response).toEqual({
      items: [
        expect.objectContaining({
          canViewSensitiveRef: false,
          displayName: 'Alpha Partner',
          safeLabel: 'Alpha Partner · alpha.partner@example.test',
          subjectType: 'user',
        }),
        expect.objectContaining({
          canViewSensitiveRef: false,
          displayName: 'Corporate Team',
          groupType: 'team',
          safeLabel: 'Corporate Team · team',
          subjectType: 'group',
        }),
      ],
    });
    expect(response).not.toHaveProperty('total');
    expect(JSON.stringify(response)).not.toContain('memberCount');
    expect(JSON.stringify(response)).not.toContain('External Hidden');
    expect(query.mock.calls.map(([sql]) => String(sql)).join('\n')).toContain(
      "role <> 'external_user'",
    );
  });

  it('delegates matter-team lookups to PermissionService before returning subjects', async () => {
    const { canManageMatterMembers, service } = createService('matter_owner');

    await expect(
      service.searchSubjects(
        { tenantId, userId: actorUserId },
        { limit: 5, matterId, purpose: 'matter-team', q: 'team', subjectType: 'user' },
      ),
    ).resolves.toMatchObject({ items: [expect.objectContaining({ subjectType: 'user' })] });

    expect(canManageMatterMembers).toHaveBeenCalledWith(
      { tenantId, userId: actorUserId },
      matterId,
    );
  });

  it('allows admin user lookups for account ledger assignment without matter scope', async () => {
    const { canManageMatterMembers, service } = createService('firm_admin');

    await expect(
      service.searchSubjects(
        { tenantId, userId: actorUserId },
        { limit: 5, purpose: 'user-admin', q: 'alpha', subjectType: 'user' },
      ),
    ).resolves.toMatchObject({ items: [expect.objectContaining({ subjectType: 'user' })] });

    expect(canManageMatterMembers).not.toHaveBeenCalled();
  });

  it('fails closed for unauthorized purposes without leaking result counts', async () => {
    const { query, service } = createService('matter_owner');

    await expect(
      service.searchSubjects(
        { tenantId, userId: actorUserId },
        { limit: 10, purpose: 'user-admin', q: 'alpha', subjectType: 'all' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('fails closed when PermissionService denies matter-team lookup', async () => {
    const { service } = createService('matter_owner', 'DENY');

    await expect(
      service.searchSubjects(
        { tenantId, userId: actorUserId },
        { limit: 5, matterId, purpose: 'matter-team', q: 'team', subjectType: 'user' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
