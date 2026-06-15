'use client';

import type {
  AiPrepDocumentStatusDto,
  AiPrepFeedbackRequestDto,
  AiPrepFeedbackResponseDto,
  AiPrepMatterReadinessDto,
  AiPrepMatterRetryResponseDto,
} from '@amic-vault/shared';
import { apiFetch } from '../api-client';

export function getDocumentAiPrepStatus(documentId: string): Promise<AiPrepDocumentStatusDto> {
  return apiFetch<AiPrepDocumentStatusDto>(`/documents/${documentId}/ai-prep`);
}

export function getMatterAiPrepReadiness(matterId: string): Promise<AiPrepMatterReadinessDto> {
  return apiFetch<AiPrepMatterReadinessDto>(`/matters/${matterId}/ai-prep`);
}

export function retryMatterAiPrep(matterId: string): Promise<AiPrepMatterRetryResponseDto> {
  return apiFetch<AiPrepMatterRetryResponseDto>(`/matters/${matterId}/ai-prep/retry`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function recordAiPrepFeedback(
  input: AiPrepFeedbackRequestDto,
): Promise<AiPrepFeedbackResponseDto> {
  return apiFetch<AiPrepFeedbackResponseDto>('/ai/prep/feedback', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
