import { ApiClientError } from '../api-client';
import type { EmptyStateVariant } from '@/components/ui/empty-state';
import type { DataState } from '@/lib/data-state';

export type UiErrorKind = 'auth' | 'permission' | 'policy' | 'api';
export type UiErrorDataStatus = Extract<DataState<unknown>['status'], 'error' | 'forbidden' | 'blocked'>;

export interface UiErrorState {
  kind: UiErrorKind;
  dataStatus: UiErrorDataStatus;
  emptyStateVariant: EmptyStateVariant;
}

const apiErrorState: UiErrorState = {
  kind: 'api',
  dataStatus: 'error',
  emptyStateVariant: 'api-error',
};

const policyBlockedCodes = new Set(['ETHICAL_WALL_BLOCKED', 'AI_POLICY_BLOCKED', 'TENANT_ISOLATION_VIOLATION']);

export function uiErrorStateForApiError(error: unknown): UiErrorState {
  if (!(error instanceof ApiClientError)) return apiErrorState;
  if (error.code === 'AUTH_REQUIRED') {
    return {
      kind: 'auth',
      dataStatus: 'forbidden',
      emptyStateVariant: 'no-access',
    };
  }
  if (error.code === 'PERMISSION_DENIED') {
    return {
      kind: 'permission',
      dataStatus: 'forbidden',
      emptyStateVariant: 'no-access',
    };
  }
  if (policyBlockedCodes.has(error.code)) {
    return {
      kind: 'policy',
      dataStatus: 'blocked',
      emptyStateVariant: 'policy-blocked',
    };
  }
  return apiErrorState;
}

export function uiErrorKindForApiError(error: unknown): UiErrorKind {
  return uiErrorStateForApiError(error).kind;
}

export function dataStateStatusForApiError(error: unknown): UiErrorDataStatus {
  return uiErrorStateForApiError(error).dataStatus;
}

export function emptyStateVariantForUiErrorKind(kind: UiErrorKind): EmptyStateVariant {
  if (kind === 'auth' || kind === 'permission') return 'no-access';
  if (kind === 'policy') return 'policy-blocked';
  return 'api-error';
}

export function safeApiErrorMessage(error: unknown): string {
  return uiErrorStateForApiError(error).kind === 'auth' ? '로그인이 필요합니다.' : '접근 상태를 확인할 수 없습니다.';
}
