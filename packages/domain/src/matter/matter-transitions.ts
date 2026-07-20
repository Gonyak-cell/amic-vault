import { MatterState, type MatterStateValue } from './matter-state';

export const matterTransitionReasonCodes = [
  'ALLOWED',
  'CLOSING_CHECKLIST_INCOMPLETE',
  'CONFLICTS_NOT_CLEARED',
  'INVALID_TRANSITION',
  'R12_TRANSITION_BLOCKED',
] as const;

export type MatterTransitionReasonCode = (typeof matterTransitionReasonCodes)[number];

export interface MatterTransitionDecision {
  allowed: boolean;
  reasonCode: MatterTransitionReasonCode;
}

export const matterConflictGateStatuses = [
  'not_started',
  'in_review',
  'cleared',
  'blocked',
] as const;

export type MatterConflictGateStatus = (typeof matterConflictGateStatuses)[number];

export interface MatterTransitionContext {
  closingChecklistComplete?: boolean;
  conflictsStatus?: MatterConflictGateStatus;
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
  context: MatterTransitionContext = {},
): MatterTransitionDecision {
  if (allowedTransitionKeys.has(transitionKey(from, to))) {
    if (
      from === MatterState.Proposed &&
      to === MatterState.Open &&
      context.conflictsStatus !== 'cleared'
    ) {
      return { allowed: false, reasonCode: 'CONFLICTS_NOT_CLEARED' };
    }
    if (
      from === MatterState.Closing &&
      to === MatterState.Closed &&
      context.closingChecklistComplete !== true
    ) {
      return { allowed: false, reasonCode: 'CLOSING_CHECKLIST_INCOMPLETE' };
    }
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
