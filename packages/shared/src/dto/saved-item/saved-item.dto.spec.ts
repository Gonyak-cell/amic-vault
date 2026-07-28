import { describe, expect, it } from 'vitest';
import {
  createSavedItemSchema,
  reorderSavedItemsSchema,
  savedItemTargetTypeSchema,
} from './saved-item.dto';

const uuid = '11111111-1111-4111-8111-111111111111';

describe('saved item DTOs', () => {
  it('accepts only the internal personal target kinds', () => {
    expect(savedItemTargetTypeSchema.parse('document')).toBe('document');
    expect(savedItemTargetTypeSchema.parse('matter')).toBe('matter');
    expect(savedItemTargetTypeSchema.parse('saved_search')).toBe('saved_search');
    expect(() => savedItemTargetTypeSchema.parse('team')).toThrow();
  });

  it('rejects unknown fields and invalid target references', () => {
    expect(createSavedItemSchema.parse({ targetType: 'document', targetId: uuid })).toEqual({
      targetType: 'document',
      targetId: uuid,
    });
    expect(() =>
      createSavedItemSchema.parse({ targetType: 'document', targetId: 'not-a-uuid' }),
    ).toThrow();
    expect(() =>
      createSavedItemSchema.parse({ targetType: 'document', targetId: uuid, shared: true }),
    ).toThrow();
  });

  it('bounds reordering to a unique set of at most 100 ids', () => {
    expect(reorderSavedItemsSchema.parse({ savedItemIds: [uuid] })).toEqual({
      savedItemIds: [uuid],
    });
    expect(() =>
      reorderSavedItemsSchema.parse({ savedItemIds: [uuid, uuid] }),
    ).toThrow();
    expect(() =>
      reorderSavedItemsSchema.parse({
        savedItemIds: Array.from(
          { length: 101 },
          (_, index) => `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
        ),
      }),
    ).toThrow();
  });
});
