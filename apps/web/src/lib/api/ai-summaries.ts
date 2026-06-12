'use client';

import type { AiSummaryRequestDto, AiSummaryResponseDto } from '@amic-vault/shared';
import { apiFetch } from '../api-client';

export function createAiSummary(input: AiSummaryRequestDto): Promise<AiSummaryResponseDto> {
  return apiFetch<AiSummaryResponseDto>('/ai/summaries', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
