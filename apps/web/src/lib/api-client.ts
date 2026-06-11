import type { ApiErrorResponse, ErrorCode } from '@amic-vault/shared';
import { ERROR_CODES } from '@amic-vault/shared';
import { apiBaseUrl } from './config';

export class ApiClientError extends Error {
  readonly code: ErrorCode;
  readonly requestId: string | undefined;
  readonly status: number;

  constructor(status: number, response: ApiErrorResponse) {
    super(response.code);
    this.name = 'ApiClientError';
    this.code = response.code;
    this.requestId = response.requestId;
    this.status = status;
  }
}

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && ERROR_CODES.includes(value as ErrorCode);
}

async function parseError(response: Response): Promise<ApiErrorResponse> {
  const body = (await response.json().catch(() => undefined)) as Partial<ApiErrorResponse> | undefined;
  const code = isErrorCode(body?.code) ? body.code : 'VALIDATION_FAILED';
  if (body?.requestId) {
    return { code, requestId: body.requestId };
  }
  return {
    code,
  };
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { redirectOnAuthRequired?: boolean } = {},
): Promise<T> {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...init.headers,
    },
  });

  if (!response.ok) {
    const error = new ApiClientError(response.status, await parseError(response));
    if (
      error.code === 'AUTH_REQUIRED' &&
      init.redirectOnAuthRequired !== false &&
      typeof window !== 'undefined'
    ) {
      window.location.assign('/login');
    }
    throw error;
  }

  return (await response.json()) as T;
}

// Server components must forward cookies explicitly when calling API routes.
