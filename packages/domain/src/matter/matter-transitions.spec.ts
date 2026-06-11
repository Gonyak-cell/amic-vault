import { describe, expect, it } from 'vitest';
import { MatterState, matterStateValues, type MatterStateValue } from './matter-state';
import { validateMatterTransition } from './matter-transitions';

const allowed = new Set([
  `${MatterState.Proposed}->${MatterState.Open}`,
  `${MatterState.Open}->${MatterState.Active}`,
  `${MatterState.Active}->${MatterState.Closing}`,
  `${MatterState.Closing}->${MatterState.Closed}`,
  `${MatterState.Closed}->${MatterState.Archived}`,
]);

describe('matter transition validation', () => {
  it('exhaustively validates the 8x8 R1 transition matrix', () => {
    for (const from of matterStateValues) {
      for (const to of matterStateValues) {
        const decision = validateMatterTransition(from, to);
        expect(decision.allowed, `${from}->${to}`).toBe(allowed.has(`${from}->${to}`));
      }
    }
  });

  it('keeps disposal transitions blocked until R12', () => {
    const blockedTransitions: Array<[MatterStateValue, MatterStateValue]> = [
      [MatterState.Archived, MatterState.DisposalReview],
      [MatterState.DisposalReview, MatterState.Archived],
      [MatterState.DisposalReview, MatterState.Disposed],
    ];

    for (const [from, to] of blockedTransitions) {
      expect(validateMatterTransition(from, to)).toEqual({
        allowed: false,
        reasonCode: 'R12_TRANSITION_BLOCKED',
      });
    }
  });
});
