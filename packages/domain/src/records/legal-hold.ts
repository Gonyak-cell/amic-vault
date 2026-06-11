export interface LegalHoldSubject {
  documentLegalHold: boolean;
  matterLegalHold: boolean;
}

export class LegalHoldBlockedError extends Error {
  readonly code = 'DOCUMENT_LOCKED';

  constructor() {
    super('document is under legal hold');
    this.name = 'LegalHoldBlockedError';
  }
}

export function assertDeletable(subject: LegalHoldSubject): void {
  if (subject.documentLegalHold || subject.matterLegalHold) {
    throw new LegalHoldBlockedError();
  }
}
