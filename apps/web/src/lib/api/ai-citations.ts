'use client';

import type {
  AiCitationSourceRequestDto,
  AiCitationSourceResponseDto,
  AiCitationVerificationRequestDto,
  AiCitationVerificationResponseDto,
} from '@amic-vault/shared';
import { apiFetch } from '../api-client';

export function getCitationSources(
  input: AiCitationSourceRequestDto,
): Promise<AiCitationSourceResponseDto> {
  return apiFetch<AiCitationSourceResponseDto>('/ai/citations/sources', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function verifyCitations(
  input: AiCitationVerificationRequestDto,
): Promise<AiCitationVerificationResponseDto> {
  return apiFetch<AiCitationVerificationResponseDto>('/ai/citations/verify', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
