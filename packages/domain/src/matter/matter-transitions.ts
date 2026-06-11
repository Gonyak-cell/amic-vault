import { MatterState, type MatterStateValue } from './matter-state';

export const matterTransitionReasonCodes = [
  'ALLOWED',
  'INVALID_TRANSITION',
  'R12_TRANSITION_BLOCKED',
] as const;

export type MatterTransitionReasonCode = (typeof matterTransitionReasonCodes)[number];

export interface MatterTransitionDecision {
  allowed: boolean;
  reasonCode: MatterTransitionReasonCode;
}

export const allowedMatterTransitions = [
  [MatterState.Proposed, MatterState.Open],
  [MatterState.Open, MatterState.Active],
  [MatterState.Active, MatterState.Closing],
  [MatterState.Closing, MatterState.Closed],
  [MatterState.Closed, MatterState.Archived],
] as const satisfies readonly (readonly [MatterStateValue, MatterStateValue])[];

const allowedTransitionKeys = new Set(
  allowedMatterTransitions.map(([from, to]) => transitionKey(from, to)),
);

function transitionKey(from: MatterStateValue, to: MatterStateValue): string {
  return `${from}->${to}`;
}

export function validateMatterTransition(
  from: MatterStateValue,
  to: MatterStateValue,
): MatterTransitionDecision {
  if (allowedTransitionKeys.has(transitionKey(from, to))) {
    return { allowed: true, reasonCode: 'ALLOWED' };
  }
  if (
    from === MatterState.Archived ||
    from === MatterState.DisposalReview ||
    to === MatterState.DisposalReview ||
    to === MatterState.Disposed
  ) {
    return { allowed: false, reasonCode: 'R12_TRANSITION_BLOCKED' };
  }
  return { allowed: false, reasonCode: 'INVALID_TRANSITION' };
}
