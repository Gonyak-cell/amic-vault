import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { FailClosedGuard } from './fail-closed.guard';

describe('FailClosedGuard', () => {
  it('allows only explicit ALLOW decisions', async () => {
    const guard = new FailClosedGuard();

    await expect(guard.assertAllowed(() => ({ effect: 'ALLOW' }))).resolves.toBeUndefined();
  });

  it('denies DENY, undefined, and evaluator errors with PERMISSION_DENIED', async () => {
    const guard = new FailClosedGuard();

    await expect(guard.assertAllowed(() => ({ effect: 'DENY' })))
      .rejects.toMatchObject(new ForbiddenException({ code: 'PERMISSION_DENIED' }));
    await expect(guard.assertAllowed(() => undefined))
      .rejects.toMatchObject(new ForbiddenException({ code: 'PERMISSION_DENIED' }));
    await expect(
      guard.assertAllowed(() => {
        throw new Error('permission backend unavailable');
      }),
    ).rejects.toMatchObject(new ForbiddenException({ code: 'PERMISSION_DENIED' }));
  });
});
