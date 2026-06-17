export type DataState<T> =
  | { status: 'idle' | 'loading' | 'empty' | 'unavailable'; data?: undefined; error?: undefined }
  | { status: 'ready'; data: T; error?: undefined }
  | { status: 'error' | 'forbidden' | 'blocked'; data?: undefined; error?: string };

export function isDataReady<T>(state: DataState<T>): state is { status: 'ready'; data: T } {
  return state.status === 'ready';
}
