'use client';

import type { AiSessionDetailDto } from '@amic-vault/shared';
import { apiFetch } from '../api-client';

export function getAiSessionDetail(sessionId: string): Promise<AiSessionDetailDto> {
  return apiFetch<AiSessionDetailDto>(`/ai/sessions/${sessionId}`);
}
