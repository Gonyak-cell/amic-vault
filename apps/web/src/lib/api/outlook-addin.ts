'use client';

import type {
  CreateOutlookEmailFilingRequestDto,
  MatterSuggestionListDto,
  MatterSuggestionQueryDto,
  OutlookFilingRequestStatusDto,
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

export function createOutlookFilingRequest(
  input: CreateOutlookEmailFilingRequestDto,
): Promise<OutlookFilingRequestStatusDto> {
  return apiFetch<OutlookFilingRequestStatusDto>('/m365/outlook/filing-requests', {
    method: 'POST',
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
