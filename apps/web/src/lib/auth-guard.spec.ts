import { describe, expect, it } from 'vitest';
import { isProtectedAppPath } from './auth-guard';

describe('auth guard paths', () => {
  it('protects internal work surfaces while leaving token portal routes isolated', () => {
    expect(isProtectedAppPath('/contracts')).toBe(true);
    expect(isProtectedAppPath('/contracts/rules')).toBe(true);
    expect(isProtectedAppPath('/dd')).toBe(true);
    expect(isProtectedAppPath('/litigation')).toBe(true);
    expect(isProtectedAppPath('/documents/11111111-1111-4111-8111-111111111177')).toBe(true);
    expect(isProtectedAppPath('/audit')).toBe(true);
    expect(isProtectedAppPath('/walls')).toBe(true);
    expect(isProtectedAppPath('/external/opaque-token')).toBe(false);
  });
});
