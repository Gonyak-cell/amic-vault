import type {
  DmsNotificationCenterResponseDto,
  DmsNotificationItemDto,
  GraphNodeReviewAction,
  GraphNodeReviewResponseDto,
  KnowledgeCandidateDto,
  KnowledgeCandidateReviewAction,
  MatterWikiPageDto,
  MatterWikiReviewAction,
  DmsWorkItemKind,
  DmsWorkQueueAssigneeFilter,
  DmsWorkQueueQueryDto,
  DmsWorkQueueItemDto,
  DmsWorkQueueResponseDto,
  DmsWorkReassignmentCandidateDto,
  DmsWorkReassignmentCandidatesQueryDto,
  DmsWorkReassignmentCandidatesResponseDto,
} from '@amic-vault/shared';
import { dmsWorkItemKindSchema, dmsWorkQueueAssigneeFilterSchema } from '@amic-vault/shared';
import { apiFetch } from '../api-client';
import type { DataState } from '@/lib/data-state';
import { uiErrorStateForApiError } from './error-messages';

export type DmsWorkQueueItem = DmsWorkQueueItemDto;
export type DmsNotificationItem = DmsNotificationItemDto;
export type WorkQueueQuery = Partial<DmsWorkQueueQueryDto>;
export type WorkQueueView = 'mine' | 'notifications';

export type WorkReassignmentCandidateDto = DmsWorkReassignmentCandidateDto;
export type WorkReassignmentCandidatesResponseDto = DmsWorkReassignmentCandidatesResponseDto;
export type WorkReassignmentCandidatesQuery = Partial<DmsWorkReassignmentCandidatesQueryDto>;

export interface WorkQueueUrlState {
  view: WorkQueueView;
  assignee: DmsWorkQueueAssigneeFilter;
  kind?: DmsWorkItemKind;
  limit: number;
  offset: number;
}

type WorkQueueSearchParams =
  | {
      getAll(name: string): string[];
    }
  | {
      view?: string | string[];
      assignee?: string | string[];
      kind?: string | string[];
      limit?: string | string[];
      offset?: string | string[];
    };

const defaultWorkQueueLimit = 20;

function singleSearchParam(params: WorkQueueSearchParams, key: string): string | undefined {
  if ('getAll' in params) {
    const values = params.getAll(key);
    return values.length === 1 ? values[0] : undefined;
  }
  const value = params[key as keyof WorkQueueSearchParams];
  return typeof value === 'string' ? value : undefined;
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number) {
  if (!value || !/^\d+$/u.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export function workQueueUrlStateFromParams(params: WorkQueueSearchParams = {}): WorkQueueUrlState {
  const view = singleSearchParam(params, 'view') === 'notifications' ? 'notifications' : 'mine';
  const assigneeResult = dmsWorkQueueAssigneeFilterSchema.safeParse(
    singleSearchParam(params, 'assignee'),
  );
  const kindResult = dmsWorkItemKindSchema.safeParse(singleSearchParam(params, 'kind'));
  return {
    view,
    assignee: assigneeResult.success ? assigneeResult.data : 'mine',
    ...(kindResult.success ? { kind: kindResult.data } : {}),
    limit: boundedInteger(singleSearchParam(params, 'limit'), defaultWorkQueueLimit, 1, 100),
    offset: boundedInteger(singleSearchParam(params, 'offset'), 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

export function workQueueQueryFromUrlState(state: WorkQueueUrlState): WorkQueueQuery {
  return {
    ...(state.kind ? { kind: state.kind } : {}),
    assignee: state.assignee,
    limit: state.limit,
    offset: state.offset,
  };
}

export function workQueueUrl(state: WorkQueueUrlState): string {
  const params = new URLSearchParams({
    view: state.view,
    assignee: state.assignee,
    limit: String(state.limit),
  });
  if (state.kind) params.set('kind', state.kind);
  if (state.offset > 0) params.set('offset', String(state.offset));
  return `/work?${params.toString()}`;
}

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
  if (response.items.length === 0 && (response.page?.total ?? 0) > 0) {
    return { status: 'ready', data: [] };
  }
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
  if (query.matterId) params.set('matterId', query.matterId);
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

export function listWorkReassignmentCandidates(
  itemKey: string,
  query: WorkReassignmentCandidatesQuery = {},
): Promise<WorkReassignmentCandidatesResponseDto> {
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set('q', query.q.trim());
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  const rendered = params.toString();
  const path = `/work/items/${encodeURIComponent(itemKey)}/reassignment-candidates${rendered ? `?${rendered}` : ''}`;
  return apiFetch<WorkReassignmentCandidatesResponseDto>(path, {
    redirectOnAuthRequired: false,
  });
}

export function updateWorkItemDueAt(
  itemKey: string,
  dueAt: string,
): Promise<{ itemKey: string; dueAt: string }> {
  return apiFetch<{ itemKey: string; dueAt: string }>(
    `/work/items/${encodeURIComponent(itemKey)}/due-at`,
    {
      method: 'PATCH',
      body: JSON.stringify({ dueAt }),
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
