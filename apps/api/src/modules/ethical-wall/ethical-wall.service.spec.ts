import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../audit/audit.service';
import type { PermissionEventRecorder } from '../audit/permission-event.recorder';
import type { TenantContextService } from '../tenant/tenant-context';
import { EthicalWallService } from './ethical-wall.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const actorUserId = '11111111-1111-4111-8111-111111111100';
const wallId = '11111111-1111-4111-8111-1111111111aa';
const matterId = '11111111-1111-4111-8111-1111111111bb';

class TestEthicalWallService extends EthicalWallService {
  protected override async findWallById() {
    return {
      wall_id: wallId,
      tenant_id: tenantId,
      matter_id: matterId,
      wall_name: 'Conflict',
      reason: 'conflict_check',
      status: 'active' as const,
      created_by: actorUserId,
      created_at: new Date('2026-06-12T00:00:00.000Z'),
      released_by: null,
      released_at: null,
    };
  }
}

describe('EthicalWallService', () => {
  it('rejects group memberships before group wall expansion exists', async () => {
    const service = new EthicalWallService(
      {} as unknown as AuditService,
      {} as unknown as PermissionEventRecorder,
      {} as unknown as TenantContextService,
    );

    await expect(
      service.create('11111111-1111-4111-8111-111111111100', {
        matterId: '11111111-1111-4111-8111-1111111111aa',
        wallName: 'Conflict',
        reason: 'conflict_check',
        members: [
          {
            subjectType: 'group',
            subjectId: '11111111-1111-4111-8111-1111111111bb',
            membershipType: 'excluded',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('audits and denies break-glass entry until dual approval exists', async () => {
    const auditLog = vi.fn(async () => ({
      eventId: '11111111-1111-4111-8111-1111111111cc',
      createdAt: new Date(),
    }));
    const service = new TestEthicalWallService(
      { log: auditLog } as unknown as AuditService,
      {} as unknown as PermissionEventRecorder,
      { require: () => ({ tenantId }) } as unknown as TenantContextService,
    );

    await expect(service.requestBreakGlassOverride(actorUserId, wallId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        actorId: actorUserId,
        action: 'ACCESS_DENIED',
        targetType: 'ethical_wall',
        targetId: wallId,
        result: 'denied',
        metadata: expect.objectContaining({
          scope_type: 'break_glass_attempt',
          scope_id: wallId,
          reason_code: 'dual_approval_required',
          wall_id: wallId,
          matter_id: matterId,
        }),
      }),
    );
  });
});
