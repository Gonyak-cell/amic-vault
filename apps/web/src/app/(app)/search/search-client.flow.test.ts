import { describe, expect, it } from 'vitest';
import {
  readSearchSelectionState,
  searchSelectionStateKey,
  withSearchSelectionState,
} from './search-selection-state';

describe('SearchClient selection browser contract', () => {
  it('stores only the opaque selected-result key while preserving unrelated history state', () => {
    const existingState = { as: '/search', __N: 1 };
    const nextState = withSearchSelectionState(existingState, 'document-result-7');

    expect(nextState).toEqual({
      as: '/search',
      __N: 1,
      [searchSelectionStateKey]: 'document-result-7',
    });
    expect(existingState).toEqual({ as: '/search', __N: 1 });
    expect(readSearchSelectionState(nextState)).toBe('document-result-7');
  });

  it('removes the selection without retaining a stale browser value', () => {
    const cleared = withSearchSelectionState(
      { [searchSelectionStateKey]: 'document-result-7', preserved: true },
      null,
    );

    expect(cleared).toEqual({ preserved: true });
    expect(readSearchSelectionState(cleared)).toBeNull();
  });

  it('ignores malformed or non-object history state instead of exposing it as a selection', () => {
    expect(readSearchSelectionState(null)).toBeNull();
    expect(readSearchSelectionState({ [searchSelectionStateKey]: 7 })).toBeNull();
    expect(readSearchSelectionState('document-result-7')).toBeNull();
    expect(withSearchSelectionState('document-result-7', 'next')).toEqual({
      [searchSelectionStateKey]: 'next',
    });
  });
});
