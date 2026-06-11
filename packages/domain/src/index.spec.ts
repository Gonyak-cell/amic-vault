import { describe, expect, it } from 'vitest';
import { DOMAIN_PACKAGE_CONTRACT } from './index';

describe('domain package boundary', () => {
  it('declares IO as disallowed', () => {
    expect(DOMAIN_PACKAGE_CONTRACT.ioAllowed).toBe(false);
  });
});
