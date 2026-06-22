import type {
  AddDocumentVersionFieldsDto,
  AddDocumentVersionResponseDto,
  ApiErrorResponse,
  ErrorCode,
  AddMatterMemberDto,
  AssignDocumentSubversionReviewerDto,
  CancelDocumentEditSessionDto,
  CheckInDocumentEditSessionDto,
  CreateDocumentEditSessionDto,
  DocumentDto,
  DocumentEditSessionDto,
  DocumentListDto,
  DocumentDownloadReasonCode,
  DocumentNativeEditDraftDto,
  DocumentEditPackageDto,
  DocumentSubversionDto,
  DocumentSubversionListDto,
  DocumentSubversionReviewDto,
  DocumentSubversionReviewListDto,
  DocumentSubversionReviewerListDto,
  DocumentSubversionReviewerDto,
  DocumentVersionListDto,
  EmailTimelineDto,
  HeartbeatDocumentEditSessionDto,
  ListDocumentVersionsQueryDto,
  ListDocumentsQueryDto,
  ListMattersQueryDto,
  MatterAppLookupQueryDto,
  MatterAppLookupResponseDto,
  MatterAppSourceStatusDto,
  MatterDto,
  MatterMemberDto,
  MatterMemberListDto,
  MatterListDto,
  PromoteDocumentSubversionDto,
  PromoteDocumentSubversionResponseDto,
  SaveDocumentSubversionFieldsDto,
  SaveNativeDocumentEditDraftDto,
  SubmitDocumentSubversionReviewDto,
  SearchTarget,
  UpdateDocumentMetadataDto,
  UpdateMatterMemberDto,
  CreateUploadPreflightRequestDto,
  UploadPreflightResponseDto,
  UploadDocumentFieldsDto,
  UploadDocumentResponseDto,
} from '@amic-vault/shared';
import { ERROR_CODES } from '@amic-vault/shared';
import { apiBaseUrl } from './config';

export class ApiClientError extends Error {
  readonly code: ErrorCode;
  readonly reason: string | undefined;
  readonly requestId: string | undefined;
  readonly status: number;

  constructor(status: number, response: ApiErrorResponse) {
    super(response.code);
    this.name = 'ApiClientError';
    this.code = response.code;
    this.reason = response.reason;
    this.requestId = response.requestId;
    this.status = status;
  }
}

function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && ERROR_CODES.includes(value as ErrorCode);
}

function isSafeErrorReason(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_:-]{1,80}$/.test(value);
}

async function parseError(response: Response): Promise<ApiErrorResponse> {
  const body = (await response.json().catch(() => undefined)) as
    | Partial<ApiErrorResponse>
    | undefined;
  const code = isErrorCode(body?.code) ? body.code : 'VALIDATION_FAILED';
  return {
    code,
    ...(isSafeErrorReason(body?.reason) ? { reason: body.reason } : {}),
    ...(body?.requestId ? { requestId: body.requestId } : {}),
  };
}

async function handleApiResponse<T>(
  response: Response,
  redirectOnAuthRequired: boolean | undefined,
): Promise<T> {
  if (!response.ok) {
    const error = new ApiClientError(response.status, await parseError(response));
    if (
      error.code === 'AUTH_REQUIRED' &&
      redirectOnAuthRequired !== false &&
      typeof window !== 'undefined'
    ) {
      window.location.assign('/login');
    }
    throw error;
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit & { redirectOnAuthRequired?: boolean } = {},
): Promise<T> {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    cache: 'no-store',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      ...init.headers,
    },
  });

  return handleApiResponse<T>(response, init.redirectOnAuthRequired);
}

function withoutContentType(headers: HeadersInit | undefined): Headers | undefined {
  if (!headers) return undefined;
  const sanitized = new Headers(headers);
  sanitized.delete('content-type');
  return sanitized;
}

export async function apiFetchFormData<T>(
  path: string,
  formData: FormData,
  init: RequestInit & { redirectOnAuthRequired?: boolean } = {},
): Promise<T> {
  const { redirectOnAuthRequired, headers, ...fetchInit } = init;
  const sanitizedHeaders = withoutContentType(headers);
  const requestInit: RequestInit = {
    ...fetchInit,
    body: formData,
    cache: 'no-store',
    credentials: 'include',
  };
  if (sanitizedHeaders) requestInit.headers = sanitizedHeaders;
  const response = await fetch(`${apiBaseUrl()}${path}`, requestInit);

  return handleApiResponse<T>(response, redirectOnAuthRequired);
}

// Server components must forward cookies explicitly when calling API routes.

function queryString(query: Record<string, unknown> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const queryString = params.toString();
  return queryString ? `?${queryString}` : '';
}

export function listMatters(query: Partial<ListMattersQueryDto> = {}): Promise<MatterListDto> {
  return apiFetch<MatterListDto>(`/matters${queryString(query)}`);
}

export function getMatterAppStatus(): Promise<MatterAppSourceStatusDto> {
  return apiFetch<MatterAppSourceStatusDto>('/integrations/matter-app/status');
}

export function lookupMatterAppMatters(
  query: Partial<MatterAppLookupQueryDto> = {},
): Promise<MatterAppLookupResponseDto> {
  return apiFetch<MatterAppLookupResponseDto>(
    `/integrations/matter-app/matter-lookup${queryString(query)}`,
  );
}

export function getMatter(matterId: string): Promise<MatterDto> {
  return apiFetch<MatterDto>(`/matters/${matterId}`);
}

export function listMatterMembers(matterId: string): Promise<MatterMemberListDto> {
  return apiFetch<MatterMemberListDto>(`/matters/${matterId}/members`);
}

export function addMatterMember(
  matterId: string,
  input: AddMatterMemberDto,
): Promise<MatterMemberDto> {
  return apiFetch<MatterMemberDto>(`/matters/${matterId}/members`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateMatterMember(
  matterId: string,
  userId: string,
  input: UpdateMatterMemberDto,
): Promise<MatterMemberDto> {
  return apiFetch<MatterMemberDto>(`/matters/${matterId}/members/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function removeMatterMember(matterId: string, userId: string): Promise<void> {
  return apiFetch<void>(`/matters/${matterId}/members/${userId}`, {
    method: 'DELETE',
  });
}

export function listMatterEmailTimeline(matterId: string): Promise<EmailTimelineDto> {
  return apiFetch<EmailTimelineDto>(`/matters/${matterId}/email-timeline`);
}

export function listMatterDocuments(
  matterReference: string,
  query: Partial<ListDocumentsQueryDto> = {},
): Promise<DocumentListDto> {
  return apiFetch<DocumentListDto>(
    `/matters/${encodeURIComponent(matterReference)}/documents${queryString(query)}`,
  );
}

export function listDocuments(
  query: Partial<ListDocumentsQueryDto> = {},
): Promise<DocumentListDto> {
  return apiFetch<DocumentListDto>(`/documents${queryString(query)}`);
}

export function uploadDocument(
  matterReference: string,
  file: File,
  fields: UploadDocumentFieldsDto = {},
): Promise<UploadDocumentResponseDto> {
  const formData = new FormData();
  formData.set('file', file);
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) formData.set(key, String(value));
  }
  return apiFetchFormData<UploadDocumentResponseDto>(
    `/matters/${encodeURIComponent(matterReference)}/documents`,
    formData,
    { method: 'POST' },
  );
}

export function createUploadPreflight(
  matterReference: string,
  input: CreateUploadPreflightRequestDto = {},
): Promise<UploadPreflightResponseDto> {
  return apiFetch<UploadPreflightResponseDto>(
    `/matters/${encodeURIComponent(matterReference)}/documents/upload-preflight`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function getDocument(documentId: string): Promise<DocumentDto> {
  return apiFetch<DocumentDto>(`/documents/${encodeURIComponent(documentId)}`);
}

export function updateDocumentMetadata(
  documentId: string,
  input: UpdateDocumentMetadataDto,
): Promise<DocumentDto> {
  return apiFetch<DocumentDto>(`/documents/${encodeURIComponent(documentId)}/metadata`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function listDocumentVersions(
  documentId: string,
  query: Partial<ListDocumentVersionsQueryDto> = {},
): Promise<DocumentVersionListDto> {
  return apiFetch<DocumentVersionListDto>(
    `/documents/${encodeURIComponent(documentId)}/versions${queryString(query)}`,
  );
}

export function addDocumentVersion(
  documentId: string,
  file: File,
  fields: AddDocumentVersionFieldsDto = {},
): Promise<AddDocumentVersionResponseDto> {
  const formData = new FormData();
  formData.set('file', file);
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) formData.set(key, String(value));
  }
  return apiFetchFormData<AddDocumentVersionResponseDto>(
    `/documents/${encodeURIComponent(documentId)}/versions`,
    formData,
    { method: 'POST' },
  );
}

export function createDocumentEditSession(
  documentId: string,
  input: CreateDocumentEditSessionDto,
): Promise<DocumentEditSessionDto> {
  return apiFetch<DocumentEditSessionDto>(
    `/documents/${encodeURIComponent(documentId)}/edit-sessions`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function getActiveDocumentEditSession(
  documentId: string,
): Promise<DocumentEditSessionDto | null> {
  return apiFetch<DocumentEditSessionDto | null>(
    `/documents/${encodeURIComponent(documentId)}/edit-sessions/active`,
  );
}

export function heartbeatDocumentEditSession(
  documentId: string,
  editSessionId: string,
  input: HeartbeatDocumentEditSessionDto = {},
): Promise<DocumentEditSessionDto> {
  return apiFetch<DocumentEditSessionDto>(
    `/documents/${encodeURIComponent(documentId)}/edit-sessions/${encodeURIComponent(
      editSessionId,
    )}/heartbeat`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function saveDocumentSubversion(
  documentId: string,
  editSessionId: string,
  file: File,
  fields: SaveDocumentSubversionFieldsDto = { visibilityScope: 'session_owner' },
): Promise<DocumentSubversionDto> {
  const formData = new FormData();
  formData.set('file', file);
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) formData.set(key, String(value));
  }
  return apiFetchFormData<DocumentSubversionDto>(
    `/documents/${encodeURIComponent(documentId)}/edit-sessions/${encodeURIComponent(
      editSessionId,
    )}/subversions`,
    formData,
    { method: 'POST' },
  );
}

export function getDocumentEditPackage(
  documentId: string,
  editSessionId: string,
): Promise<DocumentEditPackageDto> {
  return apiFetch<DocumentEditPackageDto>(
    `/documents/${encodeURIComponent(documentId)}/edit-sessions/${encodeURIComponent(
      editSessionId,
    )}/edit-package`,
  );
}

export function getNativeDocumentEditDraft(
  documentId: string,
  editSessionId: string,
): Promise<DocumentNativeEditDraftDto> {
  return apiFetch<DocumentNativeEditDraftDto>(
    `/documents/${encodeURIComponent(documentId)}/edit-sessions/${encodeURIComponent(
      editSessionId,
    )}/native-draft`,
  );
}

export function documentEditBaseFileUrl(documentId: string, editSessionId: string): string {
  return `${apiBaseUrl()}/documents/${encodeURIComponent(
    documentId,
  )}/edit-sessions/${encodeURIComponent(editSessionId)}/base-file`;
}

export function documentSubversionFileUrl(documentId: string, subversionId: string): string {
  return `${apiBaseUrl()}/documents/${encodeURIComponent(
    documentId,
  )}/subversions/${encodeURIComponent(subversionId)}/file`;
}

export function saveNativeDocumentEditDraft(
  documentId: string,
  editSessionId: string,
  input: SaveNativeDocumentEditDraftDto,
): Promise<DocumentSubversionDto> {
  return apiFetch<DocumentSubversionDto>(
    `/documents/${encodeURIComponent(documentId)}/edit-sessions/${encodeURIComponent(
      editSessionId,
    )}/native-draft`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function listDocumentSubversions(documentId: string): Promise<DocumentSubversionListDto> {
  return apiFetch<DocumentSubversionListDto>(
    `/documents/${encodeURIComponent(documentId)}/subversions`,
  );
}

export function checkInDocumentEditSession(
  documentId: string,
  editSessionId: string,
  input: CheckInDocumentEditSessionDto = {},
): Promise<DocumentEditSessionDto> {
  return apiFetch<DocumentEditSessionDto>(
    `/documents/${encodeURIComponent(documentId)}/edit-sessions/${encodeURIComponent(
      editSessionId,
    )}/check-in`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function cancelDocumentEditSession(
  documentId: string,
  editSessionId: string,
  input: CancelDocumentEditSessionDto = {},
): Promise<DocumentEditSessionDto> {
  return apiFetch<DocumentEditSessionDto>(
    `/documents/${encodeURIComponent(documentId)}/edit-sessions/${encodeURIComponent(
      editSessionId,
    )}/cancel`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function promoteDocumentSubversion(
  documentId: string,
  subversionId: string,
  input: PromoteDocumentSubversionDto,
): Promise<PromoteDocumentSubversionResponseDto> {
  return apiFetch<PromoteDocumentSubversionResponseDto>(
    `/documents/${encodeURIComponent(documentId)}/subversions/${encodeURIComponent(
      subversionId,
    )}/promote`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function assignDocumentSubversionReviewer(
  documentId: string,
  subversionId: string,
  input: AssignDocumentSubversionReviewerDto,
): Promise<DocumentSubversionReviewerDto> {
  return apiFetch<DocumentSubversionReviewerDto>(
    `/documents/${encodeURIComponent(documentId)}/subversions/${encodeURIComponent(
      subversionId,
    )}/reviewers`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function listDocumentSubversionReviewers(
  documentId: string,
  subversionId: string,
): Promise<DocumentSubversionReviewerListDto> {
  return apiFetch<DocumentSubversionReviewerListDto>(
    `/documents/${encodeURIComponent(documentId)}/subversions/${encodeURIComponent(
      subversionId,
    )}/reviewers`,
  );
}

export function revokeDocumentSubversionReviewer(
  documentId: string,
  subversionId: string,
  reviewerUserId: string,
): Promise<DocumentSubversionReviewerDto> {
  return apiFetch<DocumentSubversionReviewerDto>(
    `/documents/${encodeURIComponent(documentId)}/subversions/${encodeURIComponent(
      subversionId,
    )}/reviewers/${encodeURIComponent(reviewerUserId)}`,
    {
      method: 'DELETE',
    },
  );
}

export function listDocumentSubversionReviews(
  documentId: string,
  subversionId: string,
): Promise<DocumentSubversionReviewListDto> {
  return apiFetch<DocumentSubversionReviewListDto>(
    `/documents/${encodeURIComponent(documentId)}/subversions/${encodeURIComponent(
      subversionId,
    )}/reviews`,
  );
}

export function submitDocumentSubversionReview(
  documentId: string,
  subversionId: string,
  input: SubmitDocumentSubversionReviewDto,
): Promise<DocumentSubversionReviewDto> {
  return apiFetch<DocumentSubversionReviewDto>(
    `/documents/${encodeURIComponent(documentId)}/subversions/${encodeURIComponent(
      subversionId,
    )}/reviews/me`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

interface DocumentPreviewUrlOptions {
  searchHit?: {
    anchorId?: string;
    hitCount: number;
    hitIndex: number;
    target: SearchTarget;
  };
}

function boundedPreviewHit(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function previewHitFragment(searchHit: DocumentPreviewUrlOptions['searchHit']): string {
  if (!searchHit || searchHit.hitCount < 1) return '';
  const hitCount = boundedPreviewHit(searchHit.hitCount, 1, 50);
  const hitIndex = boundedPreviewHit(searchHit.hitIndex, 1, hitCount);
  const anchorId = safePreviewAnchorId(searchHit.anchorId);
  const params = new URLSearchParams();
  params.set('vault-preview-hit', String(hitIndex));
  params.set('vault-preview-hit-count', String(hitCount));
  params.set('vault-preview-target', searchHit.target);
  if (anchorId) params.set('vault-preview-anchor', anchorId);
  return `#${params.toString()}`;
}

function safePreviewAnchorId(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return /^vph-([1-9]|[1-4][0-9]|50)-([0-9]|[1-9][0-9]|1[0-9]{2}|200)-([0-9]|[1-9][0-9]|1[0-9]{2}|200)$/.test(
    value,
  )
    ? value
    : undefined;
}

export function documentPreviewUrl(
  documentId: string,
  options: DocumentPreviewUrlOptions = {},
): string {
  return `${apiBaseUrl()}/documents/${encodeURIComponent(documentId)}/preview${previewHitFragment(
    options.searchHit,
  )}`;
}

export function documentDownloadUrl(
  documentId: string,
  reasonCode?: DocumentDownloadReasonCode,
): string {
  const params = new URLSearchParams();
  if (reasonCode) params.set('reasonCode', reasonCode);
  const queryString = params.toString();
  return `${apiBaseUrl()}/documents/${encodeURIComponent(documentId)}/download${
    queryString ? `?${queryString}` : ''
  }`;
}
