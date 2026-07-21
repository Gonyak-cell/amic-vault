import type {
  DmsNotificationCenterResponseDto,
  DmsNotificationItemDto,
  GraphNodeReviewAction,
  GraphNodeReviewResponseDto,
  KnowledgeCandidateDto,
  KnowledgeCandidateReviewAction,
  MatterWikiPageDto,
  MatterWikiReviewAction,
  DmsWorkQueueQueryDto,
  DmsWorkQueueItemDto,
  DmsWorkQueueResponseDto,
} from '@amic-vault/shared';
import { apiFetch } from '../api-client';
import type { DataState } from '@/lib/data-state';
import { uiErrorStateForApiError } from './error-messages';

export type DmsWorkQueueItem = DmsWorkQueueItemDto;
export type DmsNotificationItem = DmsNotificationItemDto;
export type WorkQueueQuery = Partial<DmsWorkQueueQueryDto>;

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

export function getWorkQueue(query: WorkQueueQuery = {}): Promise<DmsWorkQueueResponseDto> {
  return apiFetch<DmsWorkQueueResponseDto>(workQueuePath(query), {
    redirectOnAuthRequired: false,
  });
}

function workQueuePath(query: WorkQueueQuery): string {
  const params = new URLSearchParams();
  if (query.kind) params.set('kind', query.kind);
  if (query.assignee && query.assignee !== 'all') params.set('assignee', query.assignee);
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.offset !== undefined) params.set('offset', String(query.offset));
  const serialized = params.toString();
  return serialized ? `/work/items?${serialized}` : '/work/items';
}

export function reassignWorkItem(
  itemKey: string,
  assignedToUserId: string,
): Promise<{ itemKey: string; assignedToUserId: string; assignedToLabel: string | null }> {
  return apiFetch<{ itemKey: string; assignedToUserId: string; assignedToLabel: string | null }>(
    `/work/items/${encodeURIComponent(itemKey)}/assignee`,
    {
      method: 'PATCH',
      body: JSON.stringify({ assignedToUserId }),
      headers: { 'content-type': 'application/json' },
      redirectOnAuthRequired: false,
    },
  );
}

export function reviewGraphFactNode(
  nodeId: string,
  action: GraphNodeReviewAction,
): Promise<GraphNodeReviewResponseDto> {
  return apiFetch<GraphNodeReviewResponseDto>(`/graph/nodes/${encodeURIComponent(nodeId)}/review`, {
    method: 'POST',
    body: JSON.stringify({ action }),
    headers: { 'content-type': 'application/json' },
    redirectOnAuthRequired: false,
  });
}

export function reviewKnowledgeCandidate(
  candidateId: string,
  action: KnowledgeCandidateReviewAction,
): Promise<KnowledgeCandidateDto> {
  return apiFetch<KnowledgeCandidateDto>(
    `/matters/knowledge-candidates/${encodeURIComponent(candidateId)}/review`,
    {
      method: 'PATCH',
      body: JSON.stringify({ action }),
      headers: { 'content-type': 'application/json' },
      redirectOnAuthRequired: false,
    },
  );
}

export function reviewMatterWikiPage(
  pageId: string,
  action: MatterWikiReviewAction,
): Promise<MatterWikiPageDto> {
  return apiFetch<MatterWikiPageDto>(`/matters/wiki-pages/${encodeURIComponent(pageId)}/review`, {
    method: 'PATCH',
    body: JSON.stringify({ action }),
    headers: { 'content-type': 'application/json' },
    redirectOnAuthRequired: false,
  });
}

export function getNotificationCenter(): Promise<DmsNotificationCenterResponseDto> {
  return apiFetch<DmsNotificationCenterResponseDto>('/notifications', {
    redirectOnAuthRequired: false,
  });
}

export function markNotificationRead(
  itemKey: string,
): Promise<{ itemKey: string; status: 'read' }> {
  return apiFetch<{ itemKey: string; status: 'read' }>(
    `/notifications/${encodeURIComponent(itemKey)}/read`,
    {
      method: 'PATCH',
      redirectOnAuthRequired: false,
    },
  );
}

export function dismissNotification(
  itemKey: string,
): Promise<{ itemKey: string; status: 'dismissed' }> {
  return apiFetch<{ itemKey: string; status: 'dismissed' }>(
    `/notifications/${encodeURIComponent(itemKey)}/dismiss`,
    {
      method: 'PATCH',
      redirectOnAuthRequired: false,
    },
  );
}
