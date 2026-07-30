export const searchSelectionStateKey = 'amicVaultSearchSelection';

export function readSearchSelectionState(state: unknown): string | null {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  const value = (state as Record<string, unknown>)[searchSelectionStateKey];
  return typeof value === 'string' ? value : null;
}

export function withSearchSelectionState(
  state: unknown,
  value: string | null,
): Record<string, unknown> {
  const nextState: Record<string, unknown> =
    state && typeof state === 'object' && !Array.isArray(state)
      ? { ...(state as Record<string, unknown>) }
      : {};
  if (value) nextState[searchSelectionStateKey] = value;
  else delete nextState[searchSelectionStateKey];
  return nextState;
}
