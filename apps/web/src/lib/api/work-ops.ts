import type {
  DmsNotificationCenterResponseDto,
  DmsNotificationItemDto,
  DmsWorkQueueItemDto,
  DmsWorkQueueResponseDto,
} from '@amic-vault/shared';
import { apiFetch } from '../api-client';
import type { DataState } from '@/lib/data-state';
import { uiErrorStateForApiError } from './error-messages';

export type DmsWorkQueueItem = DmsWorkQueueItemDto;
export type DmsNotificationItem = DmsNotificationItemDto;

export function createWorkItemsUnavailableState(): DataState<DmsWorkQueueItemDto[]> {
  return { status: 'unavailable' };
}

export function createNotificationsUnavailableState(): DataState<DmsNotificationItemDto[]> {
  return { status: 'unavailable' };
}

function arrayState<T>(items: T[]): DataState<T[]> {
  return items.length > 0 ? { status: 'ready', data: items } : { status: 'empty' };
}

export function workQueueToState(
  response: DmsWorkQueueResponseDto,
): DataState<DmsWorkQueueItemDto[]> {
  return arrayState(response.items);
}

export function notificationCenterToState(
  response: DmsNotificationCenterResponseDto,
): DataState<DmsNotificationItemDto[]> {
  return arrayState(response.items);
}

export function operationalApiErrorState<T>(error: unknown): DataState<T[]> {
  const { dataStatus, kind } = uiErrorStateForApiError(error);
  const message =
    kind === 'api' ? '운영 데이터 연결을 확인할 수 없습니다.' : '접근 권한을 확인할 수 없습니다.';
  return { status: dataStatus, error: message };
}

export function getWorkQueue(): Promise<DmsWorkQueueResponseDto> {
  return apiFetch<DmsWorkQueueResponseDto>('/work/items', {
    redirectOnAuthRequired: false,
  });
}

export function getNotificationCenter(): Promise<DmsNotificationCenterResponseDto> {
  return apiFetch<DmsNotificationCenterResponseDto>('/notifications', {
    redirectOnAuthRequired: false,
  });
}
