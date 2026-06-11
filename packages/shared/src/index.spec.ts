import { describe, expect, it } from 'vitest';
import { ERROR_CODES, errorCodeSchema } from './index';

describe('shared error code catalog', () => {
  it('contains exactly the standard nine error codes', () => {
    expect(ERROR_CODES).toHaveLength(9);
    expect(errorCodeSchema.parse('PERMISSION_DENIED')).toBe('PERMISSION_DENIED');
  });
});
