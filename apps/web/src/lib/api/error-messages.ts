import { ApiClientError } from '../api-client';

export function safeApiErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError && error.code === 'AUTH_REQUIRED') return 'Sign in required';
  if (error instanceof ApiClientError) return 'Access unavailable';
  return 'Access unavailable';
}
