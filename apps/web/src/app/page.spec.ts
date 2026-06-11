import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@amic-vault/shared';

describe('web shell contract', () => {
  it('reads shared contract data from packages/shared', () => {
    expect(ERROR_CODES).toContain('AUTH_REQUIRED');
  });
});
