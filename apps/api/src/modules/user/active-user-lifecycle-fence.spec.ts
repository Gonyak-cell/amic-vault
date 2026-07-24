import { describe, expect, it, vi } from 'vitest';
import type { TenantId } from '@amic-vault/shared';
import { assertActiveUserLifecycleFence } from './active-user-lifecycle-fence';

const tenantId = '11111111-1111-4111-8111-111111111111' as TenantId;
const userId = '11111111-1111-4111-8111-111111111101';

describe('assertActiveUserLifecycleFence', () => {
  it('locks an active user row before final persistence', async () => {
    const query = vi.fn(async () => ({ rowCount: 1, rows: [{ user_id: userId }] }));

    await expect(assertActiveUserLifecycleFence({ query }, tenantId, userId)).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'active'\n      FOR UPDATE"),
      [tenantId, userId],
    );
  });

  it('fails closed when the target is missing or no longer active', async () => {
    const query = vi.fn(async () => ({ rowCount: 0, rows: [] }));

    await expect(assertActiveUserLifecycleFence({ query }, tenantId, userId)).rejects.toMatchObject({
      response: { code: 'PERMISSION_DENIED' },
    });
  });
});
