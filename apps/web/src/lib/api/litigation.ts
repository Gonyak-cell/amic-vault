import type {
  CreateLitigationEvidenceRequestDto,
  CreateLitigationFactRequestDto,
  CreateLitigationHearingRequestDto,
  CreateLitigationIssueRequestDto,
  CreateLitigationPleadingRequestDto,
  LitigationCaseMapQueryDto,
  LitigationCaseMapResponseDto,
  LitigationEvidenceDto,
  LitigationEvidenceListResponseDto,
  LitigationEvidenceNextCodeQueryDto,
  LitigationEvidenceNextCodeResponseDto,
  LitigationEvidenceQueryDto,
  LitigationFactDto,
  LitigationFactListResponseDto,
  LitigationFactQueryDto,
  LitigationHearingDto,
  LitigationHearingListResponseDto,
  LitigationHearingQueryDto,
  LitigationIssueDto,
  LitigationIssueListResponseDto,
  LitigationIssueQueryDto,
  LitigationPleadingDto,
  LitigationPleadingListResponseDto,
  LitigationPleadingQueryDto,
  UpdateLitigationFactRequestDto,
  UpdateLitigationHearingRequestDto,
} from '@amic-vault/shared';
import { apiFetch } from '../api-client';

type LitigationQuery =
  | Partial<LitigationEvidenceQueryDto>
  | Partial<LitigationEvidenceNextCodeQueryDto>
  | Partial<LitigationFactQueryDto>
  | Partial<LitigationHearingQueryDto>
  | Partial<LitigationIssueQueryDto>
  | Partial<LitigationPleadingQueryDto>
  | Partial<LitigationCaseMapQueryDto>;

function queryString(query: LitigationQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

export function createLitigationEvidence(
  input: CreateLitigationEvidenceRequestDto,
): Promise<LitigationEvidenceDto> {
  return apiFetch<LitigationEvidenceDto>('/litigation/evidence', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listLitigationEvidence(
  query: LitigationEvidenceQueryDto,
): Promise<LitigationEvidenceListResponseDto> {
  return apiFetch<LitigationEvidenceListResponseDto>(`/litigation/evidence${queryString(query)}`);
}

export function getLitigationEvidenceNextCode(
  query: LitigationEvidenceNextCodeQueryDto,
): Promise<LitigationEvidenceNextCodeResponseDto> {
  return apiFetch<LitigationEvidenceNextCodeResponseDto>(
    `/litigation/evidence/next-code${queryString(query)}`,
  );
}

export function createLitigationFact(
  input: CreateLitigationFactRequestDto,
): Promise<LitigationFactDto> {
  return apiFetch<LitigationFactDto>('/litigation/facts', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateLitigationFact(
  factId: string,
  input: UpdateLitigationFactRequestDto,
): Promise<LitigationFactDto> {
  return apiFetch<LitigationFactDto>(`/litigation/facts/${factId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function listLitigationFacts(
  query: LitigationFactQueryDto,
): Promise<LitigationFactListResponseDto> {
  return apiFetch<LitigationFactListResponseDto>(`/litigation/facts${queryString(query)}`);
}

export function createLitigationHearing(
  input: CreateLitigationHearingRequestDto,
): Promise<LitigationHearingDto> {
  return apiFetch<LitigationHearingDto>('/litigation/hearings', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateLitigationHearing(
  hearingId: string,
  input: UpdateLitigationHearingRequestDto,
): Promise<LitigationHearingDto> {
  return apiFetch<LitigationHearingDto>(`/litigation/hearings/${hearingId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function cancelLitigationHearing(hearingId: string): Promise<LitigationHearingDto> {
  return apiFetch<LitigationHearingDto>(`/litigation/hearings/${hearingId}`, {
    method: 'DELETE',
  });
}

export function listLitigationHearings(
  query: LitigationHearingQueryDto,
): Promise<LitigationHearingListResponseDto> {
  return apiFetch<LitigationHearingListResponseDto>(`/litigation/hearings${queryString(query)}`);
}

export function createLitigationIssue(
  input: CreateLitigationIssueRequestDto,
): Promise<LitigationIssueDto> {
  return apiFetch<LitigationIssueDto>('/litigation/issues', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listLitigationIssues(
  query: LitigationIssueQueryDto,
): Promise<LitigationIssueListResponseDto> {
  return apiFetch<LitigationIssueListResponseDto>(`/litigation/issues${queryString(query)}`);
}

export function createLitigationPleading(
  input: CreateLitigationPleadingRequestDto,
): Promise<LitigationPleadingDto> {
  return apiFetch<LitigationPleadingDto>('/litigation/pleadings', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function listLitigationPleadings(
  query: LitigationPleadingQueryDto,
): Promise<LitigationPleadingListResponseDto> {
  return apiFetch<LitigationPleadingListResponseDto>(`/litigation/pleadings${queryString(query)}`);
}

export function loadLitigationCaseMap(
  query: LitigationCaseMapQueryDto,
): Promise<LitigationCaseMapResponseDto> {
  return apiFetch<LitigationCaseMapResponseDto>(`/litigation/case-map${queryString(query)}`);
}
