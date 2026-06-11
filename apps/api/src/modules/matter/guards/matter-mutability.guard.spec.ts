import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { assertMatterMutationAllowed, isMatterMutationAllowed } from './matter-mutability.guard';

describe('matter mutability guard', () => {
  it('allows pre-close matter mutations', () => {
    expect(isMatterMutationAllowed('proposed')).toBe(true);
    expect(isMatterMutationAllowed('active')).toBe(true);
    expect(() => assertMatterMutationAllowed('closing')).not.toThrow();
  });

  it('blocks closed and later matter mutations with MATTER_CLOSED reason', () => {
    expect(isMatterMutationAllowed('closed')).toBe(false);
    expect(() => assertMatterMutationAllowed('archived')).toThrow(BadRequestException);
    try {
      assertMatterMutationAllowed('disposed');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual({
        code: 'VALIDATION_FAILED',
        reason: 'MATTER_CLOSED',
      });
    }
  });
});
