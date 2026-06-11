import { describe, expect, it, vi } from 'vitest';
import { allowPermission, denyPermission, type TenantId } from '@amic-vault/shared';
import { FailClosedPermissionWrapper, type PermissionAuditTarget } from './fail-closed.wrapper';

const target: PermissionAuditTarget = {
  tenantId: '11111111-1111-4111-8111-111111111111' as TenantId,
  actorId: '11111111-1111-4111-8111-111111111101',
  targetType: 'matter',
  targetId: '11111111-1111-4111-8111-111111111199',
  matterId: '11111111-1111-4111-8111-111111111199',
};

function createWrapper() {
  const recordAccessDenied = vi.fn(async () => undefined);
  return {
    recordAccessDenied,
    wrapper: new FailClosedPermissionWrapper({ recordAccessDenied } as never),
  };
}

describe('FailClosedPermissionWrapper', () => {
  it('passes through allow decisions without audit side effects', async () => {
    const { wrapper, recordAccessDenied } = createWrapper();
    await expect(wrapper.evaluate(target, () => allowPermission())).resolves.toMatchObject({
      effect: 'ALLOW',
    });
    expect(recordAccessDenied).not.toHaveBeenCalled();
  });

  it('records denied decisions and converts evaluator errors to EVAL_FAILURE', async () => {
    const { wrapper, recordAccessDenied } = createWrapper();
    await expect(wrapper.evaluate(target, () => denyPermission())).resolves.toMatchObject({
      effect: 'DENY',
    });
    await expect(
      wrapper.evaluate(target, () => {
        throw new Error('forced');
      }),
    ).resolves.toMatchObject({ effect: 'DENY', reasonCode: 'EVAL_FAILURE' });
    expect(recordAccessDenied).toHaveBeenCalledTimes(2);
  });

  it('denies undefined and timeout results', async () => {
    const { wrapper } = createWrapper();
    await expect(wrapper.evaluate(target, () => undefined)).resolves.toMatchObject({
      effect: 'DENY',
      reasonCode: 'EVAL_FAILURE',
    });
    await expect(
      wrapper.evaluate(
        target,
        () => new Promise((resolve) => setTimeout(() => resolve(allowPermission()), 20)),
        1,
      ),
    ).resolves.toMatchObject({ effect: 'DENY', reasonCode: 'EVAL_FAILURE' });
  });
});
