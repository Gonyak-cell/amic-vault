import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@amic-vault/shared';
import { apiBaseUrl } from '../lib/config';

describe('web shell contract', () => {
  it('reads shared contract data from packages/shared', () => {
    expect(ERROR_CODES).toContain('AUTH_REQUIRED');
  });

  it('uses the R0 API base URL default', () => {
    expect(apiBaseUrl()).toBe('http://localhost:3001/v1');
  });
});
