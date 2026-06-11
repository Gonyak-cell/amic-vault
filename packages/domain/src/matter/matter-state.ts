export enum MatterState {
  Proposed = 'proposed',
  Open = 'open',
  Active = 'active',
  Closing = 'closing',
  Closed = 'closed',
  Archived = 'archived',
  DisposalReview = 'disposal_review',
  Disposed = 'disposed',
}

export const matterStateValues = [
  MatterState.Proposed,
  MatterState.Open,
  MatterState.Active,
  MatterState.Closing,
  MatterState.Closed,
  MatterState.Archived,
  MatterState.DisposalReview,
  MatterState.Disposed,
] as const;

export type MatterStateValue = (typeof matterStateValues)[number];

export const matterMutationBlockedStates = [
  MatterState.Closed,
  MatterState.Archived,
  MatterState.DisposalReview,
  MatterState.Disposed,
] as const;

export function isMatterState(value: string): value is MatterStateValue {
  return (matterStateValues as readonly string[]).includes(value);
}

export function isMatterMutationBlockedState(value: MatterStateValue): boolean {
  return (matterMutationBlockedStates as readonly string[]).includes(value);
}
