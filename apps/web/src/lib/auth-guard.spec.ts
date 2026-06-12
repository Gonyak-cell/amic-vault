import { describe, expect, it } from 'vitest';
import { isProtectedAppPath } from './auth-guard';

describe('auth guard paths', () => {
  it('protects the contracts work surface', () => {
    expect(isProtectedAppPath('/contracts')).toBe(true);
    expect(isProtectedAppPath('/contracts/rules')).toBe(true);
  });
});
