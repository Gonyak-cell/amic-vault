import { describe, expect, it } from 'vitest';
import { MatterState, isMatterMutationBlockedState, matterStateValues } from './matter-state';

describe('matter state enum', () => {
  it('keeps the R1 matter state order fixed', () => {
    expect(matterStateValues).toEqual([
      'proposed',
      'open',
      'active',
      'closing',
      'closed',
      'archived',
      'disposal_review',
      'disposed',
    ]);
  });

  it('marks closed and later states as mutation blocked', () => {
    expect(isMatterMutationBlockedState(MatterState.Active)).toBe(false);
    expect(isMatterMutationBlockedState(MatterState.Closed)).toBe(true);
    expect(isMatterMutationBlockedState(MatterState.Archived)).toBe(true);
    expect(isMatterMutationBlockedState(MatterState.DisposalReview)).toBe(true);
    expect(isMatterMutationBlockedState(MatterState.Disposed)).toBe(true);
  });
});
