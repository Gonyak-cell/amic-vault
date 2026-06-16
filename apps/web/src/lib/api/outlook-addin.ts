'use client';

import type {
  CreateOutlookEmailFilingRequestDto,
  CreateOutlookSendFileRequestDto,
  EvaluateOutlookSendPolicyDto,
  MatterSuggestionListDto,
  MatterSuggestionQueryDto,
  OutlookFilingRequestStatusDto,
  OutlookSendFileRequestStatusDto,
  OutlookSendPolicyDecisionDto,
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

export function getOutlookFilingRequestStatus(
  requestId: string,
): Promise<OutlookFilingRequestStatusDto> {
  return apiFetch<OutlookFilingRequestStatusDto>(`/m365/outlook/filing-requests/${requestId}`, {
    redirectOnAuthRequired: false,
  });
}
