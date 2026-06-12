import type {
  CreateArchiveRequestDto,
  CreateDisposalRequestDto,
  CreateLegalHoldRequestDto,
  CreateRetentionPolicyRequestDto,
  DisposalCertificateDto,
  DisposalRequestDto,
  LegalHoldListResponseDto,
  LegalHoldDto,
  RecordsArchiveDto,
  RetentionPolicyDto,
  RetentionPolicyListResponseDto,
} from '@amic-vault/shared';
import { apiFetch } from '../api-client';

function queryString(query: { matterId?: string }): string {
  const params = new URLSearchParams();
  if (query.matterId) params.set('matterId', query.matterId);
  const text = params.toString();
  return text ? `?${text}` : '';
}

export function createRetentionPolicy(
  input: CreateRetentionPolicyRequestDto,
): Promise<RetentionPolicyDto> {
  return apiFetch<RetentionPolicyDto>('/records/retention-policies', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listRetentionPolicies(): Promise<RetentionPolicyListResponseDto> {
  return apiFetch<RetentionPolicyListResponseDto>('/records/retention-policies');
}

export function createLegalHold(input: CreateLegalHoldRequestDto): Promise<LegalHoldDto> {
  return apiFetch<LegalHoldDto>('/records/legal-holds', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listLegalHolds(query: { matterId?: string }): Promise<LegalHoldListResponseDto> {
  return apiFetch<LegalHoldListResponseDto>(`/records/legal-holds${queryString(query)}`);
}

export function releaseLegalHold(legalHoldId: string): Promise<LegalHoldDto> {
  return apiFetch<LegalHoldDto>(`/records/legal-holds/${legalHoldId}/release`, {
    method: 'POST',
  });
}

export function archiveDocument(input: CreateArchiveRequestDto): Promise<RecordsArchiveDto> {
  return apiFetch<RecordsArchiveDto>('/records/archives', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function createDisposalRequest(
  input: CreateDisposalRequestDto,
): Promise<DisposalRequestDto> {
  return apiFetch<DisposalRequestDto>('/records/disposals', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function approveDisposalRequest(disposalRequestId: string): Promise<DisposalRequestDto> {
  return apiFetch<DisposalRequestDto>(
    `/records/disposals/${disposalRequestId}/approve`,
    { method: 'POST' },
  );
}

export function executeDisposalRequest(disposalRequestId: string): Promise<DisposalCertificateDto> {
  return apiFetch<DisposalCertificateDto>(
    `/records/disposals/${disposalRequestId}/execute`,
    { method: 'POST' },
  );
}

export function getDisposalCertificate(
  disposalRequestId: string,
): Promise<DisposalCertificateDto> {
  return apiFetch<DisposalCertificateDto>(
    `/records/disposals/${disposalRequestId}/certificate`,
  );
}
