import { describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import type { TenantId } from '@amic-vault/shared';
import { AuditService, type QueryClient } from '../audit/audit.service';
import { DatabaseService } from '../../common/db/database.service';
import { ClosingBinderService } from './closing-binder.service';
import { KnowledgeCandidateService } from './knowledge-candidate.service';
import { MatterClosingService } from './matter-closing.service';
import { MatterMemberService } from './matter-member.service';
import { PermissionQueryBuilder } from '../permission/permission-query.builder';
import { PermissionService } from '../permission/permission.service';
import { TenantContextService } from '../tenant/tenant-context';
import { UserEntity } from '../user/user.entity';
import { UserService } from '../user/user.service';
import {
  DEFAULT_LOCAL_AI_FILE_ORG_POLICY_NAME,
  MatterService,
  canChangeLegalHoldRole,
  canCreateMatterRole,
} from './matter.service';

function typedServiceMock<T extends object>(prototype: object, methods: Partial<T> = {}): T {
  return Object.assign(Object.create(prototype) as T, methods);
}

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
    const tenantId = '11111111-1111-4111-8111-111111111100' as TenantId;
    const actorUserId = '11111111-1111-4111-8111-111111111101';
    const clientId = '11111111-1111-4111-8111-111111111102';
    const query = vi.fn<QueryClient['query']>().mockResolvedValue({ rows: [], rowCount: 0 });
    const queryClient = Object.assign(Object.create(null), { query });
    const tenantTransaction: DatabaseService['tenantTransaction'] = async <T>(
      _tenantId: string,
      run: (client: PoolClient) => Promise<T>,
    ) => run(queryClient);
    const databaseService = typedServiceMock<DatabaseService>(DatabaseService.prototype, {
      tenantTransaction,
    });
    const service = new MatterService(
      typedServiceMock<AuditService>(AuditService.prototype),
      databaseService,
      typedServiceMock<MatterMemberService>(MatterMemberService.prototype),
      new PermissionQueryBuilder(),
      typedServiceMock<PermissionService>(PermissionService.prototype),
      typedServiceMock<TenantContextService>(TenantContextService.prototype, {
        require: () => ({ tenantId, slug: 'alpha', status: 'active', source: 'session' }),
      }),
      typedServiceMock<UserService>(UserService.prototype, {
        findByTenantAndId: vi.fn(
          async () =>
            new UserEntity({
              userId: actorUserId,
              tenantId,
              email: 'owner@example.test',
              name: 'Matter owner',
              role: 'matter_owner',
              practiceGroup: null,
              status: 'active',
              passwordHash: 'unused-fixture-hash',
              mfaEnabled: false,
              lastLoginAt: null,
              createdAt: new Date('2026-01-01T00:00:00.000Z'),
              updatedAt: new Date('2026-01-01T00:00:00.000Z'),
            }),
        ),
      }),
      typedServiceMock<MatterClosingService>(MatterClosingService.prototype),
      typedServiceMock<ClosingBinderService>(ClosingBinderService.prototype),
      typedServiceMock<KnowledgeCandidateService>(KnowledgeCandidateService.prototype),
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
