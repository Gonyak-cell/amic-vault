import { describe, expect, it } from 'vitest';
import { LegalHoldBlockedError, assertDeletable } from './legal-hold';

describe('legal hold delete precondition', () => {
  it('allows deletion only when neither document nor matter is held', () => {
    expect(() =>
      assertDeletable({ documentLegalHold: false, matterLegalHold: false }),
    ).not.toThrow();
  });

  it('blocks deletion when either hold flag is enabled', () => {
    expect(() => assertDeletable({ documentLegalHold: true, matterLegalHold: false })).toThrow(
      LegalHoldBlockedError,
    );
    expect(() => assertDeletable({ documentLegalHold: false, matterLegalHold: true })).toThrow(
      LegalHoldBlockedError,
    );
  });
});
