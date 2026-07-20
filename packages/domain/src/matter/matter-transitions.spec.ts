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
        const decision = validateMatterTransition(from, to, {
          closingChecklistComplete: true,
          conflictsStatus: 'cleared',
        });
        expect(decision.allowed, `${from}->${to}`).toBe(allowed.has(`${from}->${to}`));
      }
    }
  });

  it('blocks proposed to open until conflicts are cleared', () => {
    expect(
      validateMatterTransition(MatterState.Proposed, MatterState.Open, {
        conflictsStatus: 'not_started',
      }),
    ).toEqual({
      allowed: false,
      reasonCode: 'CONFLICTS_NOT_CLEARED',
    });
    expect(
      validateMatterTransition(MatterState.Proposed, MatterState.Open, {
        conflictsStatus: 'in_review',
      }),
    ).toEqual({
      allowed: false,
      reasonCode: 'CONFLICTS_NOT_CLEARED',
    });
    expect(
      validateMatterTransition(MatterState.Proposed, MatterState.Open, {
        conflictsStatus: 'cleared',
      }),
    ).toEqual({
      allowed: true,
      reasonCode: 'ALLOWED',
    });
    expect(
      validateMatterTransition(MatterState.Proposed, MatterState.Open, {
        conflictsStatus: 'blocked',
      }),
    ).toEqual({
      allowed: false,
      reasonCode: 'CONFLICTS_NOT_CLEARED',
    });
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

  it('fails closed on closing to closed until the closing checklist is complete', () => {
    expect(validateMatterTransition(MatterState.Closing, MatterState.Closed)).toEqual({
      allowed: false,
      reasonCode: 'CLOSING_CHECKLIST_INCOMPLETE',
    });
    expect(
      validateMatterTransition(MatterState.Closing, MatterState.Closed, {
        closingChecklistComplete: false,
      }),
    ).toEqual({
      allowed: false,
      reasonCode: 'CLOSING_CHECKLIST_INCOMPLETE',
    });
    expect(
      validateMatterTransition(MatterState.Closing, MatterState.Closed, {
        closingChecklistComplete: true,
      }),
    ).toEqual({
      allowed: true,
      reasonCode: 'ALLOWED',
    });
  });
});
