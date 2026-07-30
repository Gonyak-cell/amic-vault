import { ApiClientError } from '../api-client';
import type { EmptyStateVariant } from '@/components/ui/empty-state';
import type { DataState } from '@/lib/data-state';

export type UiErrorKind = 'auth' | 'permission' | 'policy' | 'api';
export type UiErrorDataStatus = Extract<
  DataState<unknown>['status'],
  'error' | 'forbidden' | 'blocked'
>;

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

const apiUnavailableState: UiErrorState = {
  kind: 'api',
  // Keep the existing DataState error contract for callers while the
  // dedicated variant carries the transport-specific UI meaning.
  dataStatus: 'error',
  emptyStateVariant: 'api-unavailable',
};

const policyBlockedCodes = new Set([
  'ETHICAL_WALL_BLOCKED',
  'AI_POLICY_BLOCKED',
  'TENANT_ISOLATION_VIOLATION',
]);

export function uiErrorStateForApiError(error: unknown): UiErrorState {
  // A missing API response is a connection/transport state, not an empty or
  // denied result. Keep it distinct so callers can offer a retry without
  // implying that the resource exists or that access was refused.
  if (!(error instanceof ApiClientError)) return apiUnavailableState;
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
  const state = uiErrorStateForApiError(error);
  if (state.kind === 'auth') return '로그인이 필요합니다.';
  // Keep denied responses target-agnostic; callers that already know the
  // state can use the explicit `no-access` EmptyState copy.
  if (state.kind === 'permission') return '접근 상태를 확인할 수 없습니다.';
  if (state.kind === 'policy') return '정보 차단 정책에 따라 표시할 수 없습니다.';
  if (state.emptyStateVariant === 'api-unavailable') {
    return '데이터 연결을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.';
  }
  return '요청한 데이터를 표시할 수 없습니다.';
}
