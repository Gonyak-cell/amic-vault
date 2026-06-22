import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { DocumentEditingController } from './document-editing.controller';
import { ImmutableStateGuard } from './guards/immutable-state.guard';

function guardsFor(methodName: keyof DocumentEditingController): unknown[] {
  const handler = DocumentEditingController.prototype[methodName];
  return (Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[] | undefined) ?? [];
}

describe('DocumentEditingController mutation guards', () => {
  it('guards edit-session state transitions against immutable document states', () => {
    expect(guardsFor('checkout')).toContain(ImmutableStateGuard);
    expect(guardsFor('saveSubversion')).toContain(ImmutableStateGuard);
    expect(guardsFor('saveNativeDraft')).toContain(ImmutableStateGuard);
    expect(guardsFor('checkIn')).toContain(ImmutableStateGuard);
    expect(guardsFor('cancel')).toContain(ImmutableStateGuard);
  });

  it('guards official publish and reviewer mutation routes', () => {
    expect(guardsFor('promote')).toContain(ImmutableStateGuard);
    expect(guardsFor('assignReviewer')).toContain(ImmutableStateGuard);
    expect(guardsFor('revokeReviewer')).toContain(ImmutableStateGuard);
    expect(guardsFor('submitReviewDecision')).toContain(ImmutableStateGuard);
  });
});
