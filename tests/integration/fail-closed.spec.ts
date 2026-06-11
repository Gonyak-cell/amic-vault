import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { FailClosedGuard } from '../../apps/api/src/common/security/fail-closed.guard';

describe('fail-closed guard integration contract', () => {
  it('turns evaluator errors into PERMISSION_DENIED instead of fail-open', async () => {
    const guard = new FailClosedGuard();

    await expect(
      guard.assertAllowed(() => {
        throw new Error('forced permission backend failure');
      }),
    ).rejects.toMatchObject(new ForbiddenException({ code: 'PERMISSION_DENIED' }));
  });
});
