export const DOMAIN_PACKAGE_CONTRACT = {
  packageName: '@amic-vault/domain',
  ioAllowed: false,
  owner: 'pure-domain-rules',
} as const;

export type DomainPackageContract = typeof DOMAIN_PACKAGE_CONTRACT;

export {
  MatterState,
  isMatterMutationBlockedState,
  isMatterState,
  matterMutationBlockedStates,
  matterStateValues,
  type MatterStateValue,
} from './matter/matter-state';
export {
  allowedMatterTransitions,
  matterTransitionReasonCodes,
  validateMatterTransition,
  type MatterTransitionDecision,
  type MatterTransitionReasonCode,
} from './matter/matter-transitions';
