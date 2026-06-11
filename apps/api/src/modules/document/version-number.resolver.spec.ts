import { describe, expect, it } from 'vitest';
import { VersionNumberResolver } from './version-number.resolver';

describe('VersionNumberResolver', () => {
  it('starts at version 1 and increments monotonically', () => {
    const resolver = new VersionNumberResolver();

    expect(resolver.initial()).toBe(1);
    expect(resolver.nextAfter(1)).toBe(2);
    expect(resolver.nextAfter(9)).toBe(10);
  });

  it('rejects invalid current version numbers', () => {
    const resolver = new VersionNumberResolver();

    expect(() => resolver.nextAfter(0)).toThrow('INVALID_DOCUMENT_VERSION_NO');
    expect(() => resolver.nextAfter(1.5)).toThrow('INVALID_DOCUMENT_VERSION_NO');
  });
});
