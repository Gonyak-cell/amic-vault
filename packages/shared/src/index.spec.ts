import { describe, expect, it } from 'vitest';
import { buildSafeLabel, ERROR_CODES, errorCodeSchema } from './index';

describe('shared error code catalog', () => {
  it('contains exactly the standard nine error codes', () => {
    expect(ERROR_CODES).toHaveLength(9);
    expect(errorCodeSchema.parse('PERMISSION_DENIED')).toBe('PERMISSION_DENIED');
  });

  it('builds display-safe labels without internal fallback values', () => {
    expect(buildSafeLabel('AMIC-2026', 'Vault UI')).toBe('AMIC-2026 · Vault UI');
    expect(buildSafeLabel('', null, undefined)).toBeNull();
  });
});
