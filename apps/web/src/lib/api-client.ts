import type {
  AddDocumentVersionFieldsDto,
  AddDocumentVersionResponseDto,
  ApiErrorResponse,
  BulkUploadBatchDto,
  CreateDocumentBulkActionBatchDto,
  DocumentBulkActionBatchDto,
  ErrorCode,
  AddMatterMemberDto,
  AiSessionListDto,
  AssignDocumentSubversionReviewerDto,
  CancelDocumentEditSessionDto,
  CheckInDocumentEditSessionDto,
  CreateDocumentEditSessionDto,
  ForceReleaseDocumentEditSessionDto,
  DocumentDto,
  DocumentStatus,
  DocumentEditSessionDto,
  DocumentListDto,
  DocumentDownloadReasonCode,
  DocumentFolderDto,
  DocumentNativeEditDraftDto,
  DocumentEditPackageDto,
  DocumentSubversionDto,
  DocumentSubversionListDto,
  DocumentSubversionReviewDto,
  DocumentSubversionReviewListDto,
  DocumentSubversionReviewerListDto,
  DocumentSubversionReviewerDto,
  CreateDocumentComparisonRequestDto,
  DocumentComparisonDto,
  DocumentVersionListDto,
  EmailMatterSuggestionListDto,
  EmailMatterSuggestionQueryDto,
  EmailTimelineDto,
  FileEmailToMatterDto,
  UndoEmailAutofileDto,
  HeartbeatDocumentEditSessionDto,
  ClientDto,
  ClientListDto,
  ConflictCheckDto,
  ConflictCheckListDto,
  CreateClientDto,
  CreateMatterIssueDto,
  CreateMatterKeyDateDto,
  CreateMatterDto,
  CreateMatterRelatedMatterDto,
  ListDocumentVersionsQueryDto,
  ListDocumentsQueryDto,
  ListAiSessionsQueryDto,
  ListClientsQueryDto,
  ListMattersQueryDto,
  MatterClosingChecklistDto,
  MatterClosingChecklistItemCode,
  MatterClosingBinderResponseDto,
  MatterAppLookupQueryDto,
  MatterAppLookupResponseDto,
  MatterAppSourceStatusDto,
  MatterDto,
  MatterDashboardDto,
  MatterIssueDto,
  MatterIssueListDto,
  MatterKeyDateDto,
  MatterKeyDateListDto,
  MatterMemberDto,
  MatterMemberListDto,
  MatterListDto,
  MatterRelatedMatterListDto,
  MatterRelationType,
  CreatePartyDto,
  ListPartiesQueryDto,
  PartyDto,
  PartyListDto,
  PromoteDocumentSubversionDto,
  PromoteDocumentSubversionResponseDto,
  PreviewAccessSessionDto,
  SaveDocumentSubversionFieldsDto,
  SaveNativeDocumentEditDraftDto,
  SubmitDocumentSubversionReviewDto,
  UpdateDocumentMetadataDto,
  UpdateDocumentFolderDto,
  UpdateDocumentTagsDto,
  UpdateClientDto,
  UpdateMatterDto,
  UpdateMatterIssueDto,
  UpdateMatterKeyDateDto,
  UpdateMatterStatusDto,
  WaiveMatterClosingChecklistItemDto,
  UpdateMatterMemberDto,
  ResolveConflictCheckDto,
  CreateUploadPreflightRequestDto,
  RegisterBulkUploadBatchDto,
  RetryBulkUploadBatchItemDto,
  RetryDocumentBulkActionBatchDto,
  UploadPreflightResponseDto,
  UploadDocumentFieldsDto,
  UploadDocumentResponseDto,
  QuarantinedIntakeResponseDto,
  UploadEmailToMatterFieldsDto,
  UploadEmailToMatterResponseDto,
  DocumentTagListDto,
  UpdatePartyDto,
} from '@amic-vault/shared';
import { ERROR_CODES } from '@amic-vault/shared';
import { apiBaseUrl } from './config';

interface UpdateDocumentStatusInput {
  status: DocumentStatus;
  note?: string;
}

interface StageBulkUploadBatchOptions {
  sourceRelativePaths?: readonly string[];
}

export interface EmailDocumentLinkDto {
  linkId: string;
  tenantId: string;
  emailId: string;
  documentId: string;
  fileObjectId: string;
  attachmentIndex: number;
  attachmentFilename: string;
  mediaType: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
}

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
      window.location.replace('/login');
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

export function createMatter(input: CreateMatterDto): Promise<MatterDto> {
  return apiFetch<MatterDto>('/matters', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listClients(query: Partial<ListClientsQueryDto> = {}): Promise<ClientListDto> {
  return apiFetch<ClientListDto>(`/clients${queryString(query)}`);
}

export function getClient(clientId: string): Promise<ClientDto> {
  return apiFetch<ClientDto>(`/clients/${encodeURIComponent(clientId)}`);
}

export function createClient(input: CreateClientDto): Promise<ClientDto> {
  return apiFetch<ClientDto>('/clients', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateClient(clientId: string, input: UpdateClientDto): Promise<ClientDto> {
  return apiFetch<ClientDto>(`/clients/${encodeURIComponent(clientId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
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

export function getMatterDashboard(matterId: string): Promise<MatterDashboardDto> {
  return apiFetch<MatterDashboardDto>(`/matters/${encodeURIComponent(matterId)}/dashboard`);
}

export function updateMatter(matterId: string, input: UpdateMatterDto): Promise<MatterDto> {
  return apiFetch<MatterDto>(`/matters/${encodeURIComponent(matterId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function updateMatterStatus(
  matterId: string,
  input: UpdateMatterStatusDto,
): Promise<MatterDto> {
  return apiFetch<MatterDto>(`/matters/${encodeURIComponent(matterId)}/status`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function getMatterClosingChecklist(matterId: string): Promise<MatterClosingChecklistDto> {
  return apiFetch<MatterClosingChecklistDto>(
    `/matters/${encodeURIComponent(matterId)}/closing-checklist`,
  );
}

export function evaluateMatterClosingChecklist(
  matterId: string,
): Promise<MatterClosingChecklistDto> {
  return apiFetch<MatterClosingChecklistDto>(
    `/matters/${encodeURIComponent(matterId)}/closing-checklist/evaluate`,
    { method: 'POST' },
  );
}

export function waiveMatterClosingChecklistItem(
  matterId: string,
  itemCode: MatterClosingChecklistItemCode,
  input: WaiveMatterClosingChecklistItemDto,
): Promise<MatterClosingChecklistDto> {
  return apiFetch<MatterClosingChecklistDto>(
    `/matters/${encodeURIComponent(matterId)}/closing-checklist/${encodeURIComponent(
      itemCode,
    )}/waive`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function getMatterClosingBinder(matterId: string): Promise<MatterClosingBinderResponseDto> {
  return apiFetch<MatterClosingBinderResponseDto>(
    `/matters/${encodeURIComponent(matterId)}/closing-binder`,
  );
}

export function matterClosingBinderManifestUrl(matterId: string, format: 'csv' | 'json'): string {
  return `${apiBaseUrl()}/matters/${encodeURIComponent(matterId)}/closing-binder/manifest${queryString({ format })}`;
}

export function listMatterRelatedMatters(matterId: string): Promise<MatterRelatedMatterListDto> {
  return apiFetch<MatterRelatedMatterListDto>(
    `/matters/${encodeURIComponent(matterId)}/related-matters`,
  );
}

export function addMatterRelatedMatter(
  matterId: string,
  input: CreateMatterRelatedMatterDto,
): Promise<MatterRelatedMatterListDto> {
  return apiFetch<MatterRelatedMatterListDto>(
    `/matters/${encodeURIComponent(matterId)}/related-matters`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function removeMatterRelatedMatter(
  matterId: string,
  relatedMatterId: string,
  relationType: MatterRelationType,
): Promise<MatterRelatedMatterListDto> {
  return apiFetch<MatterRelatedMatterListDto>(
    `/matters/${encodeURIComponent(matterId)}/related-matters/${encodeURIComponent(
      relatedMatterId,
    )}?${queryString({ relationType }).slice(1)}`,
    {
      method: 'DELETE',
    },
  );
}

export function listMatterIssues(matterId: string): Promise<MatterIssueListDto> {
  return apiFetch<MatterIssueListDto>(`/matters/${encodeURIComponent(matterId)}/issues`);
}

export function createMatterIssue(
  matterId: string,
  input: CreateMatterIssueDto,
): Promise<MatterIssueDto> {
  return apiFetch<MatterIssueDto>(`/matters/${encodeURIComponent(matterId)}/issues`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateMatterIssue(
  matterId: string,
  issueId: string,
  input: UpdateMatterIssueDto,
): Promise<MatterIssueDto> {
  return apiFetch<MatterIssueDto>(
    `/matters/${encodeURIComponent(matterId)}/issues/${encodeURIComponent(issueId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
}

export function deleteMatterIssue(matterId: string, issueId: string): Promise<void> {
  return apiFetch<void>(
    `/matters/${encodeURIComponent(matterId)}/issues/${encodeURIComponent(issueId)}`,
    { method: 'DELETE' },
  );
}

export function listMatterKeyDates(matterId: string): Promise<MatterKeyDateListDto> {
  return apiFetch<MatterKeyDateListDto>(`/matters/${encodeURIComponent(matterId)}/key-dates`);
}

export function createMatterKeyDate(
  matterId: string,
  input: CreateMatterKeyDateDto,
): Promise<MatterKeyDateDto> {
  return apiFetch<MatterKeyDateDto>(`/matters/${encodeURIComponent(matterId)}/key-dates`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateMatterKeyDate(
  matterId: string,
  keyDateId: string,
  input: UpdateMatterKeyDateDto,
): Promise<MatterKeyDateDto> {
  return apiFetch<MatterKeyDateDto>(
    `/matters/${encodeURIComponent(matterId)}/key-dates/${encodeURIComponent(keyDateId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
}

export function deleteMatterKeyDate(matterId: string, keyDateId: string): Promise<void> {
  return apiFetch<void>(
    `/matters/${encodeURIComponent(matterId)}/key-dates/${encodeURIComponent(keyDateId)}`,
    { method: 'DELETE' },
  );
}

export function listMatterConflictChecks(matterId: string): Promise<ConflictCheckListDto> {
  return apiFetch<ConflictCheckListDto>(`/matters/${encodeURIComponent(matterId)}/conflict-checks`);
}

export function runMatterConflictCheck(matterId: string): Promise<ConflictCheckDto> {
  return apiFetch<ConflictCheckDto>(`/matters/${encodeURIComponent(matterId)}/conflict-checks`, {
    method: 'POST',
  });
}

export function resolveMatterConflictCheck(
  matterId: string,
  conflictCheckId: string,
  input: ResolveConflictCheckDto,
): Promise<ConflictCheckDto> {
  return apiFetch<ConflictCheckDto>(
    `/matters/${encodeURIComponent(matterId)}/conflict-checks/${encodeURIComponent(
      conflictCheckId,
    )}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
}

export function listMatterMembers(matterId: string): Promise<MatterMemberListDto> {
  return apiFetch<MatterMemberListDto>(`/matters/${matterId}/members`);
}

export function listMatterParties(
  matterId: string,
  query: Partial<ListPartiesQueryDto> = {},
): Promise<PartyListDto> {
  return apiFetch<PartyListDto>(
    `/matters/${encodeURIComponent(matterId)}/parties${queryString(query)}`,
  );
}

export function createMatterParty(matterId: string, input: CreatePartyDto): Promise<PartyDto> {
  return apiFetch<PartyDto>(`/matters/${encodeURIComponent(matterId)}/parties`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateParty(partyId: string, input: UpdatePartyDto): Promise<PartyDto> {
  return apiFetch<PartyDto>(`/parties/${encodeURIComponent(partyId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
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
  return apiFetch<EmailTimelineDto>(`/matters/${encodeURIComponent(matterId)}/email-timeline`);
}

export function listAiSessions(
  query: Partial<ListAiSessionsQueryDto> = {},
): Promise<AiSessionListDto> {
  return apiFetch<AiSessionListDto>(`/ai/sessions${queryString(query)}`);
}

export function listEmailDocumentLinks(emailId: string): Promise<EmailDocumentLinkDto[]> {
  return apiFetch<EmailDocumentLinkDto[]>(`/emails/${encodeURIComponent(emailId)}/document-links`);
}

export function listDocumentEmailLinks(documentId: string): Promise<EmailDocumentLinkDto[]> {
  return apiFetch<EmailDocumentLinkDto[]>(
    `/documents/${encodeURIComponent(documentId)}/email-links`,
  );
}

export function uploadRawEmailToMatter(
  matterId: string,
  file: File,
  fields: UploadEmailToMatterFieldsDto = {},
): Promise<UploadEmailToMatterResponseDto> {
  const formData = new FormData();
  formData.set('file', file);
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) formData.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  return apiFetchFormData<UploadEmailToMatterResponseDto>(
    `/matters/${encodeURIComponent(matterId)}/emails`,
    formData,
    { method: 'POST' },
  );
}

export function getEmailMatterSuggestions(
  emailId: string,
  query: Partial<EmailMatterSuggestionQueryDto> = {},
): Promise<EmailMatterSuggestionListDto> {
  return apiFetch<EmailMatterSuggestionListDto>(
    `/emails/${encodeURIComponent(emailId)}/matter-suggestions${queryString(query)}`,
  );
}

export function fileEmailToMatter(
  emailId: string,
  input: FileEmailToMatterDto,
): Promise<EmailTimelineDto['items'][number]> {
  return apiFetch<EmailTimelineDto['items'][number]>(
    `/emails/${encodeURIComponent(emailId)}/file`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
}

export function fileEmailThreadToMatter(
  threadId: string,
  input: FileEmailToMatterDto,
): Promise<EmailTimelineDto> {
  return apiFetch<EmailTimelineDto>(`/email-threads/${encodeURIComponent(threadId)}/file`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function undoEmailAutofile(
  emailId: string,
  input: UndoEmailAutofileDto,
): Promise<EmailTimelineDto> {
  return apiFetch<EmailTimelineDto>(`/emails/${encodeURIComponent(emailId)}/autofile/undo`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
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
): Promise<UploadDocumentResponseDto | QuarantinedIntakeResponseDto> {
  const formData = new FormData();
  formData.set('file', file);
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) formData.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  return apiFetchFormData<UploadDocumentResponseDto | QuarantinedIntakeResponseDto>(
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

export function stageBulkUploadBatch(
  matterReference: string,
  files: readonly File[],
  fields: UploadDocumentFieldsDto = {},
  options: StageBulkUploadBatchOptions = {},
): Promise<BulkUploadBatchDto> {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined)
      formData.set(key, Array.isArray(value) ? value.join(',') : String(value));
  }
  if (options.sourceRelativePaths) {
    formData.set('sourceRelativePaths', JSON.stringify(options.sourceRelativePaths));
  }
  for (const file of files) formData.append('file', file);
  return apiFetchFormData<BulkUploadBatchDto>(
    `/matters/${encodeURIComponent(matterReference)}/documents/bulk-upload-batches/stage`,
    formData,
    { method: 'POST' },
  );
}

export function registerBulkUploadBatch(
  matterReference: string,
  input: RegisterBulkUploadBatchDto,
): Promise<BulkUploadBatchDto> {
  return apiFetch<BulkUploadBatchDto>(
    `/matters/${encodeURIComponent(matterReference)}/documents/bulk-upload-batches`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export function getBulkUploadBatch(
  matterReference: string,
  batchId: string,
): Promise<BulkUploadBatchDto> {
  return apiFetch<BulkUploadBatchDto>(
    `/matters/${encodeURIComponent(matterReference)}/documents/bulk-upload-batches/${encodeURIComponent(batchId)}`,
  );
}

export function retryBulkUploadBatchItem(
  matterReference: string,
  batchId: string,
  itemId: string,
  input: RetryBulkUploadBatchItemDto = {},
): Promise<BulkUploadBatchDto> {
  return apiFetch<BulkUploadBatchDto>(
    `/matters/${encodeURIComponent(matterReference)}/documents/bulk-upload-batches/${encodeURIComponent(batchId)}/items/${encodeURIComponent(itemId)}/retry`,
    { method: 'POST', body: JSON.stringify(input) },
  );
}

export function getDocument(documentId: string): Promise<DocumentDto> {
  return apiFetch<DocumentDto>(`/documents/${encodeURIComponent(documentId)}`);
}

export function createDocumentBulkActionBatch(
  input: CreateDocumentBulkActionBatchDto,
): Promise<DocumentBulkActionBatchDto> {
  return apiFetch<DocumentBulkActionBatchDto>('/document-bulk-action-batches', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getDocumentBulkActionBatch(batchId: string): Promise<DocumentBulkActionBatchDto> {
  return apiFetch<DocumentBulkActionBatchDto>(
    `/document-bulk-action-batches/${encodeURIComponent(batchId)}`,
  );
}

export function retryDocumentBulkActionBatch(
  batchId: string,
  input: RetryDocumentBulkActionBatchDto,
): Promise<DocumentBulkActionBatchDto> {
  return apiFetch<DocumentBulkActionBatchDto>(
    `/document-bulk-action-batches/${encodeURIComponent(batchId)}/retry`,
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
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

export function updateDocumentStatus(
  documentId: string,
  input: UpdateDocumentStatusInput,
): Promise<DocumentDto> {
  return apiFetch<DocumentDto>(`/documents/${encodeURIComponent(documentId)}/status`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function listDocumentFolders(matterReference: string): Promise<DocumentFolderDto[]> {
  return apiFetch<DocumentFolderDto[]>(
    `/matters/${encodeURIComponent(matterReference)}/document-folders`,
  );
}

export function updateDocumentFolder(
  matterReference: string,
  folderId: string,
  input: UpdateDocumentFolderDto,
): Promise<DocumentFolderDto> {
  return apiFetch<DocumentFolderDto>(
    `/matters/${encodeURIComponent(matterReference)}/document-folders/${encodeURIComponent(folderId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  );
}

export function listDocumentTags(matterReference: string): Promise<DocumentTagListDto> {
  return apiFetch<DocumentTagListDto>(
    `/matters/${encodeURIComponent(matterReference)}/document-tags`,
  );
}

export function setDocumentTags(
  documentId: string,
  input: UpdateDocumentTagsDto,
): Promise<DocumentTagListDto> {
  return apiFetch<DocumentTagListDto>(`/documents/${encodeURIComponent(documentId)}/tags`, {
    method: 'PUT',
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

export function createDocumentComparison(
  documentId: string,
  input: CreateDocumentComparisonRequestDto,
): Promise<DocumentComparisonDto> {
  return apiFetch<DocumentComparisonDto>(`/documents/${encodeURIComponent(documentId)}/comparisons`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getDocumentComparison(
  documentId: string,
  comparisonId: string,
): Promise<DocumentComparisonDto> {
  return apiFetch<DocumentComparisonDto>(
    `/documents/${encodeURIComponent(documentId)}/comparisons/${encodeURIComponent(comparisonId)}`,
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
  fields: SaveDocumentSubversionFieldsDto,
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
  input: CheckInDocumentEditSessionDto,
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
  input: CancelDocumentEditSessionDto,
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

export function forceReleaseDocumentEditSession(
  documentId: string,
  editSessionId: string,
  input: ForceReleaseDocumentEditSessionDto,
): Promise<DocumentEditSessionDto> {
  return apiFetch<DocumentEditSessionDto>(
    `/documents/${encodeURIComponent(documentId)}/edit-sessions/${encodeURIComponent(
      editSessionId,
    )}/force-release`,
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

export function issueDocumentPreviewSession(documentId: string): Promise<PreviewAccessSessionDto> {
  return apiFetch<PreviewAccessSessionDto>(
    `/documents/${encodeURIComponent(documentId)}/preview-sessions`,
    { method: 'POST' },
  );
}

export async function fetchDocumentPreviewRange(
  documentId: string,
  session: PreviewAccessSessionDto,
  range: string,
): Promise<Response> {
  const response = await fetch(`${apiBaseUrl()}/documents/${encodeURIComponent(documentId)}/preview`, {
    cache: 'no-store',
    credentials: 'include',
    headers: {
      range,
      'x-amic-preview-session': session.previewSessionId,
      'x-amic-preview-token': session.token,
    },
  });
  if (!response.ok) throw new ApiClientError(response.status, await parseError(response));
  return response;
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

export function emailRawDownloadUrl(
  emailId: string,
  reasonCode?: DocumentDownloadReasonCode,
): string {
  const params = new URLSearchParams();
  if (reasonCode) params.set('reasonCode', reasonCode);
  const queryString = params.toString();
  return `${apiBaseUrl()}/emails/${encodeURIComponent(emailId)}/raw${
    queryString ? `?${queryString}` : ''
  }`;
}
