import { describe, expect, it } from 'vitest';
import {
  DOMAIN_PACKAGE_CONTRACT,
  documentStatusValues,
  documentTypeValues,
  matterStateValues,
} from './index';

describe('domain package boundary', () => {
  it('declares IO as disallowed', () => {
    expect(DOMAIN_PACKAGE_CONTRACT.ioAllowed).toBe(false);
  });

  it('exports matter lifecycle primitives', () => {
    expect(matterStateValues).toContain('closed');
  });

  it('exports document domain primitives', () => {
    expect(documentTypeValues).toContain('contract');
    expect(documentStatusValues).toHaveLength(11);
  });
});
