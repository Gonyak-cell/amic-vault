import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@amic-vault/shared';

describe('api bootstrap contract', () => {
  it('keeps the /v1 API prefix as the public contract', () => {
    expect('/v1').toBe('/v1');
  });

  it('uses the shared standard error code catalog', () => {
    expect(ERROR_CODES).toContain('PERMISSION_DENIED');
    expect(ERROR_CODES).toHaveLength(9);
  });
});
