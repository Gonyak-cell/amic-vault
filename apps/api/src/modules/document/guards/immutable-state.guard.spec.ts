import { describe, expect, it } from 'vitest';
import { assertDocumentMutationAllowed, isDocumentImmutableStatus } from './immutable-state.guard';

function thrownResponse(run: () => void): unknown {
  try {
    run();
  } catch (error) {
    if (error && typeof error === 'object' && 'getResponse' in error) {
      return (error as { getResponse(): unknown }).getResponse();
    }
    return error;
  }
  throw new Error('expected function to throw');
}

describe('immutable document state guard contract', () => {
  it('treats Archived, Disposal Locked, and Deleted documents as immutable', () => {
    expect(isDocumentImmutableStatus('archived')).toBe(true);
    expect(isDocumentImmutableStatus('disposal_locked')).toBe(true);
    expect(isDocumentImmutableStatus('deleted')).toBe(true);
    expect(isDocumentImmutableStatus('draft')).toBe(false);
  });

  it('blocks document mutation independently from actor authority', () => {
    expect(thrownResponse(() =>
      assertDocumentMutationAllowed({ documentStatus: 'archived', matterStatus: 'active' }),
    )).toMatchObject({ code: 'DOCUMENT_LOCKED' });
    expect(thrownResponse(() =>
      assertDocumentMutationAllowed({ documentStatus: 'draft', matterStatus: 'archived' }),
    )).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('allows deleted documents only for DELETE idempotency', () => {
    expect(() =>
      assertDocumentMutationAllowed(
        { documentStatus: 'deleted', matterStatus: 'active' },
        { allowDeletedNoop: true },
      ),
    ).not.toThrow();
    expect(thrownResponse(() =>
      assertDocumentMutationAllowed({ documentStatus: 'deleted', matterStatus: 'active' }),
    )).toMatchObject({ code: 'DOCUMENT_LOCKED' });
  });
});
