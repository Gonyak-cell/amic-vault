import { ForbiddenException } from '@nestjs/common';
import type { TenantId } from '@amic-vault/shared';
import type { QueryClient } from '../audit/audit.service';

function permissionDenied(): ForbiddenException {
  return new ForbiddenException({ code: 'PERMISSION_DENIED' });
}

/**
 * Serializes a final persistence step with local-user deactivation. This does
 * not replace PermissionService; callers must already have made their normal
 * permission decision before taking this lifecycle fence.
 */
export async function assertActiveUserLifecycleFence(
  client: QueryClient,
  tenantId: TenantId,
  userId: string,
): Promise<void> {
  const activeUser = await client.query(
    `
      SELECT user_id
      FROM users
      WHERE tenant_id = $1
        AND user_id = $2
        AND status = 'active'
      FOR UPDATE
    `,
    [tenantId, userId],
  );
  if (activeUser.rowCount !== 1) throw permissionDenied();
}
