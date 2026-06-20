import type {
  AddDocumentVersionFieldsDto,
  AddDocumentVersionResponseDto,
  ApiErrorResponse,
  ErrorCode,
  AddMatterMemberDto,
  DocumentDto,
  DocumentListDto,
  DocumentDownloadReasonCode,
  DocumentVersionListDto,
  EmailTimelineDto,
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
  SearchTarget,
  UpdateDocumentMetadataDto,
  UpdateMatterMemberDto,
  UploadDocumentFieldsDto,
  UploadDocumentResponseDto,
} from '@amic-vault/shared';
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
  const body = (await response.json().catch(() => undefined)) as
    | Partial<ApiErrorResponse>
    | undefined;
  const code = isErrorCode(body?.code) ? body.code : 'VALIDATION_FAILED';
  if (body?.requestId) {
    return { code, requestId: body.requestId };
  }
  return {
    code,
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

interface DocumentPreviewUrlOptions {
  searchHit?: {
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
  const params = new URLSearchParams();
  params.set('vault-preview-hit', String(hitIndex));
  params.set('vault-preview-hit-count', String(hitCount));
  params.set('vault-preview-target', searchHit.target);
  return `#${params.toString()}`;
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
