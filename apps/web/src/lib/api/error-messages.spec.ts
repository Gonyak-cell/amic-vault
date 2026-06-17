import { describe, expect, it } from 'vitest';
import type { ErrorCode } from '@amic-vault/shared';
import { ApiClientError } from '../api-client';
import {
  dataStateStatusForApiError,
  emptyStateVariantForUiErrorKind,
  safeApiErrorMessage,
  uiErrorKindForApiError,
  uiErrorStateForApiError,
} from './error-messages';

function apiError(code: ErrorCode, status = 403): ApiClientError {
  return new ApiClientError(status, { code });
}

describe('uiErrorStateForApiError', () => {
  it('maps auth and permission errors to no-access UI state', () => {
    expect(uiErrorStateForApiError(apiError('AUTH_REQUIRED', 401))).toEqual({
      kind: 'auth',
      dataStatus: 'forbidden',
      emptyStateVariant: 'no-access',
    });
    expect(uiErrorStateForApiError(apiError('PERMISSION_DENIED'))).toEqual({
      kind: 'permission',
      dataStatus: 'forbidden',
      emptyStateVariant: 'no-access',
    });
  });

  it('maps policy and tenant isolation errors to blocked UI state', () => {
    for (const code of ['ETHICAL_WALL_BLOCKED', 'AI_POLICY_BLOCKED', 'TENANT_ISOLATION_VIOLATION'] as const) {
      expect(uiErrorStateForApiError(apiError(code))).toEqual({
        kind: 'policy',
        dataStatus: 'blocked',
        emptyStateVariant: 'policy-blocked',
      });
    }
  });

  it('maps unknown or validation errors to safe API error state', () => {
    expect(uiErrorStateForApiError(apiError('VALIDATION_FAILED', 400))).toEqual({
      kind: 'api',
      dataStatus: 'error',
      emptyStateVariant: 'api-error',
    });
    expect(uiErrorStateForApiError(new Error('network'))).toEqual({
      kind: 'api',
      dataStatus: 'error',
      emptyStateVariant: 'api-error',
    });
  });

  it('exposes small helpers for components that only need one axis', () => {
    const error = apiError('AI_POLICY_BLOCKED');

    expect(uiErrorKindForApiError(error)).toBe('policy');
    expect(dataStateStatusForApiError(error)).toBe('blocked');
    expect(emptyStateVariantForUiErrorKind('policy')).toBe('policy-blocked');
    expect(safeApiErrorMessage(apiError('AUTH_REQUIRED', 401))).toBe('Sign in required');
    expect(safeApiErrorMessage(error)).toBe('Access unavailable');
  });
});
