import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { AuditService } from '../audit/audit.service';
import type { PermissionEventRecorder } from '../audit/permission-event.recorder';
import type { TenantContextService } from '../tenant/tenant-context';
import { EthicalWallService } from './ethical-wall.service';

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
});
