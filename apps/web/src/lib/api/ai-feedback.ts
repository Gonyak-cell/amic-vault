'use client';

import type {
  AiFeedbackMetricsDto,
  AiFeedbackRequestDto,
  AiFeedbackResponseDto,
} from '@amic-vault/shared';
import { apiFetch } from '../api-client';

export function recordAiFeedback(input: AiFeedbackRequestDto): Promise<AiFeedbackResponseDto> {
  return apiFetch<AiFeedbackResponseDto>('/ai/feedback', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function getAiFeedbackMetrics(matterId?: string): Promise<AiFeedbackMetricsDto> {
  const query = matterId ? `?matterId=${encodeURIComponent(matterId)}` : '';
  return apiFetch<AiFeedbackMetricsDto>(`/ai/feedback/metrics${query}`);
}
