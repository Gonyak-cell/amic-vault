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
export {
  DocumentType,
  documentConfidentialityLevelValues,
  documentPrivilegeStatusValues,
  documentTypeValues,
  isDocumentConfidentialityLevel,
  isDocumentPrivilegeStatus,
  isDocumentType,
  type DocumentConfidentialityLevel,
  type DocumentPrivilegeStatus,
  type DocumentTypeValue,
} from './document/document-type';
export {
  DocumentStatus,
  allowedDocumentTransitions,
  canTransitionDocumentStatus,
  documentStatusValues,
  isDocumentStatus,
  type DocumentStatusValue,
} from './document/document-status';
