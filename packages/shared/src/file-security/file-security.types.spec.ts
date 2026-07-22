import { describe, expect, it } from 'vitest';
import {
  canPromoteFileSecurityScan,
  canTransitionFileSecurityState,
  fileSecurityResultCodeSchema,
  fileSecurityStateSchema,
} from './file-security.types';

describe('file security state contract', () => {
  it('allows only the fail-closed lifecycle transitions', () => {
    expect(canTransitionFileSecurityState('quarantined', 'scanning')).toBe(true);
    expect(canTransitionFileSecurityState('scanning', 'clean')).toBe(true);
    expect(canTransitionFileSecurityState('clean', 'promoted')).toBe(true);
    expect(canTransitionFileSecurityState('error', 'scanning')).toBe(true);

    expect(canTransitionFileSecurityState('quarantined', 'clean')).toBe(false);
    expect(canTransitionFileSecurityState('infected', 'promoted')).toBe(false);
    expect(canTransitionFileSecurityState('error', 'promoted')).toBe(false);
    expect(canTransitionFileSecurityState('promoted', 'clean')).toBe(false);
  });

  it('requires a verified clean verdict before a scan can be promoted', () => {
    expect(canPromoteFileSecurityScan('clean', 'clean')).toBe(true);
    expect(canPromoteFileSecurityScan('clean', 'stale_signature')).toBe(false);
    expect(canPromoteFileSecurityScan('security_hold', 'clean')).toBe(false);
    expect(canPromoteFileSecurityScan('error', 'scanner_timeout')).toBe(false);
  });

  it('rejects unknown states and unbounded scanner output', () => {
    expect(() => fileSecurityStateSchema.parse('unknown')).toThrow();
    expect(() => fileSecurityResultCodeSchema.parse('EICAR-Test-File')).toThrow();
  });
});
