import { describe, expect, it } from 'vitest';
import {
  DocumentStatus,
  canTransitionDocumentStatus,
  documentStatusValues,
  isDocumentStatus,
} from './document-status';

describe('document status domain contract', () => {
  it('contains exactly the canonical 11 states', () => {
    expect(documentStatusValues).toEqual([
      'draft',
      'internal_review',
      'client_sent',
      'counterparty_sent',
      'markup_received',
      'negotiation',
      'final',
      'executed',
      'archived',
      'disposal_locked',
      'deleted',
    ]);
    expect(isDocumentStatus('deleted')).toBe(true);
    expect(isDocumentStatus('purged')).toBe(false);
  });

  it('allows only the R2 state-machine transitions', () => {
    expect(canTransitionDocumentStatus(DocumentStatus.Draft, DocumentStatus.InternalReview)).toBe(
      true,
    );
    expect(canTransitionDocumentStatus(DocumentStatus.InternalReview, DocumentStatus.Final)).toBe(
      true,
    );
    expect(canTransitionDocumentStatus(DocumentStatus.Executed, DocumentStatus.Archived)).toBe(
      true,
    );
    expect(
      canTransitionDocumentStatus(DocumentStatus.Archived, DocumentStatus.DisposalLocked),
    ).toBe(false);
    expect(canTransitionDocumentStatus(DocumentStatus.DisposalLocked, DocumentStatus.Deleted)).toBe(
      false,
    );
  });
});
