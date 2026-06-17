'use client';

import type {
  CreateOutlookDocumentInsertionDto,
  CreateOutlookEmailFilingRequestDto,
  CreateOutlookFolderMappingDto,
  CreateOutlookSendFileRequestDto,
  EvaluateOutlookSendPolicyDto,
  MatterSuggestionListDto,
  MatterSuggestionQueryDto,
  OutlookFilingRequestStatusDto,
  OutlookDocumentInsertionDto,
  OutlookFolderMappingDto,
  OutlookIntegrationAdminStatusDto,
  OutlookSendFileRequestStatusDto,
  OutlookSendPolicyDecisionDto,
  SearchQueryDto,
  SearchResponseDto,
  UpdateOutlookFolderMappingDto,
} from '@amic-vault/shared';
import { apiFetch } from '../api-client';

export function getOutlookMatterSuggestions(
  input: MatterSuggestionQueryDto,
): Promise<MatterSuggestionListDto> {
  return apiFetch<MatterSuggestionListDto>('/search/matter-suggestions', {
    method: 'POST',
    body: JSON.stringify(input),
    redirectOnAuthRequired: false,
  });
}

export function searchOutlookInsertableDocuments(input: SearchQueryDto): Promise<SearchResponseDto> {
  return apiFetch<SearchResponseDto>('/search', {
    method: 'POST',
    body: JSON.stringify(input),
    redirectOnAuthRequired: false,
  });
}

export function createOutlookFilingRequest(
  input: CreateOutlookEmailFilingRequestDto,
): Promise<OutlookFilingRequestStatusDto> {
  return apiFetch<OutlookFilingRequestStatusDto>('/m365/outlook/filing-requests', {
    method: 'POST',
    body: JSON.stringify(input),
    redirectOnAuthRequired: false,
  });
}

export function evaluateOutlookSendPolicy(
  input: EvaluateOutlookSendPolicyDto,
): Promise<OutlookSendPolicyDecisionDto> {
  return apiFetch<OutlookSendPolicyDecisionDto>('/m365/outlook/send-policy-decisions', {
    method: 'POST',
    body: JSON.stringify(input),
    redirectOnAuthRequired: false,
  });
}

export function createOutlookSendFileRequest(
  input: CreateOutlookSendFileRequestDto,
): Promise<OutlookSendFileRequestStatusDto> {
  return apiFetch<OutlookSendFileRequestStatusDto>('/m365/outlook/send-file-requests', {
    method: 'POST',
    body: JSON.stringify(input),
    redirectOnAuthRequired: false,
  });
}

export function createOutlookDocumentInsertion(
  input: CreateOutlookDocumentInsertionDto,
): Promise<OutlookDocumentInsertionDto> {
  return apiFetch<OutlookDocumentInsertionDto>('/m365/outlook/document-insertions', {
    method: 'POST',
    body: JSON.stringify(input),
    redirectOnAuthRequired: false,
  });
}

export function createOutlookFolderMapping(
  input: CreateOutlookFolderMappingDto,
): Promise<OutlookFolderMappingDto> {
  return apiFetch<OutlookFolderMappingDto>('/m365/outlook/folder-mappings', {
    method: 'POST',
    body: JSON.stringify(input),
    redirectOnAuthRequired: false,
  });
}

export function updateOutlookFolderMapping(
  mappingId: string,
  input: UpdateOutlookFolderMappingDto,
): Promise<OutlookFolderMappingDto> {
  return apiFetch<OutlookFolderMappingDto>(`/m365/outlook/folder-mappings/${mappingId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
    redirectOnAuthRequired: false,
  });
}

export function getOutlookFilingRequestStatus(
  requestId: string,
): Promise<OutlookFilingRequestStatusDto> {
  return apiFetch<OutlookFilingRequestStatusDto>(`/m365/outlook/filing-requests/${requestId}`, {
    redirectOnAuthRequired: false,
  });
}

export function getOutlookIntegrationAdminStatus(): Promise<OutlookIntegrationAdminStatusDto> {
  return apiFetch<OutlookIntegrationAdminStatusDto>('/m365/outlook/admin-status');
}
