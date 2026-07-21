'use client';

import type { DlpBehaviorAlertListResponseDto } from '@amic-vault/shared';
import { apiFetch } from '../api-client';

export function listDlpBehaviorAlerts(): Promise<DlpBehaviorAlertListResponseDto> {
  return apiFetch<DlpBehaviorAlertListResponseDto>('/dlp/behavior-alerts');
}
