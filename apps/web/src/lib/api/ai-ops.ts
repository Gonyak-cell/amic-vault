'use client';

import type { LocalAiOpsHealthDto, LocalAiOpsMetricsDto } from '@amic-vault/shared';
import { apiFetch } from '../api-client';

export function getLocalAiOpsHealth(): Promise<LocalAiOpsHealthDto> {
  return apiFetch<LocalAiOpsHealthDto>('/ai/ops/health', {
    redirectOnAuthRequired: false,
  });
}

export function getLocalAiOpsMetrics(): Promise<LocalAiOpsMetricsDto> {
  return apiFetch<LocalAiOpsMetricsDto>('/ai/ops/metrics', {
    redirectOnAuthRequired: false,
  });
}
